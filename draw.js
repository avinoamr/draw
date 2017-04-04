(function(){
// TODO: consider moving this into a separate .css file.
var styles = `
draw-box {
    display: block;
    position: relative;
    outline: none; /* due to tabindex */
}

.draw-box-no-select {
    -webkit-touch-callout: none; /* iOS Safari */
      -webkit-user-select: none; /* Safari */
       -khtml-user-select: none; /* Konqueror HTML */
         -moz-user-select: none; /* Firefox */
          -ms-user-select: none; /* Internet Explorer/Edge */
              user-select: none; /* Chrome & Opera */
}

.draw-box-selection {
    position: absolute;
    border: 1px solid silver;
}

.draw-box-selected {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #3498db;
    pointer-events: none;
}

.draw-box-dragger {
    position: absolute;
    display: none;
    width: 10px;
    height: 10px;
    top: -5px;
    left: -5px;
    cursor: pointer;
    background: #3498db;
    pointer-events: auto;
}

.draw-box-resizer {
    position: absolute;
    display: none;
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    bottom: -3px;
    right: -3px;
    border: 4px solid #3498db;
    border-top: none;
    border-left: none;
    cursor: nwse-resize;
    pointer-events: auto;
}

.draw-box-hover .draw-box-dragger,
.draw-box-hover .draw-box-resizer {
    display: block
}
`

class DrawBox extends HTMLElement {
    attachedCallback() { // compatibility with custom-elements v0
        this.connectedCallback()
    }

    connectedCallback() {
        // we use inject the style element adjcent to the <draw-box> instead of
        // on the <head> element because the <draw-box> element might be used
        // within a shadow-dom of another component, so we'd like to have the
        // style contained within the same scope. It would've been easier with a
        // Shadow-DOM stylesheet, but we don't want to require the shadow-dom
        // pollyfill especially for cases where users opt to use the
        // `DrawBox.init(el)` work-around when they don't want any custom
        // element
        // TODO: reconsider when shadow-dom is has better vendor support.
        var s = `<style id='draw-box-styles'>` + DrawBox.styles + `</style>`
        this.parentNode.insertBefore($create(s), this)

        this.selection = []

        var selectBox = $create(`<div class='draw-box-selection'></div>`)
        DrawBox.initTrackEvents(this)
        this.addEventListener('track', this.onDraw.bind(this, selectBox))
        this.addEventListener('click', this.onClick)

        this.addEventListener('mousemove', this.onMouseMove)
        this.addEventListener('drawbox-selected', this.onSelected)
        this.addEventListener('drawbox-deselected', this.onDeselected)

        // enable keyboard events by making the drawbox focus-able
        this.setAttribute('tabindex', '0')
        this.addEventListener('keyup', this.onKeyUp)
    }

    // apply the 'draw-box-hover' class to selected elements when the mouse
    // moves over them. We can't use CSS :hover or mouse-enter/leave events
    // because the selection box has `pointer-events: none`. The latter is
    // required in order to allow mouse events to pierce through the select box
    // and reach the underlying user-element.
    onMouseMove(ev) {
        var { x, y } = ev
        var pos = { left: x, top: y, width: 1, height: 1 }
        var selected = []
        for (var i = 0; i < this.children.length ; i += 1) {
            var child = this.children[i]
            if (!child._drawbox) {
                continue
            }

            child.classList.toggle('draw-box-hover', intersect(pos, child))
        }
    }

    onClick(ev) {
        if (ev.target === this) {
            // de-select all on background click.
            this.deselectAll()
        } else {
            // find the selected element by walking up the ancestors tree until
            // we find the immediate child of this draw-box to select.
            var target = ev.target
            while (target.parentNode !== this) {
                target = target.parentNode
            }

            this.select(target)
        }
    }

    onKeyUp(ev) {
        if (ev.ctrlKey && ev.keyCode === 65) { // Ctrl+A
            this.selectAll()
        } else if (ev.keyCode === 8) { // Del
            this.deleteSelected()
        }
    }

    onDraw(el, ev) {
        var { x, y, dx, dy, state } = ev.detail
        if (state === 'start') {
            var rect = this.getBoundingClientRect()
            el.resize({ left: x - rect.left, top: y - rect.top })
            this.appendChild(el)
            $bind(el, null)
        }

        this.onInsert(el, ev)

        el.style.top = el._start.y + (dy < 0 ? dy : 0) + 'px'
        el.style.left = el._start.x + (dx < 0 ? dx : 0) + 'px'
        el.style.width = el._start.w + Math.abs(dx) + 'px'
        el.style.height = el._start.h + Math.abs(dy) + 'px'
        el.update()

        this.onSelect(el, ev)

        if (state === 'end') {
            this.removeChild(el)
            this.removeAttribute('draw') // auto-disable draw.
        }
    }

    onDrag(el, ev) {
        var { dx, dy, state } = ev.detail
        state === 'start' && (el.resize(el.style))
        el.style.top = el._start.y + dy + 'px'
        el.style.left = el._start.x + dx + 'px'
        el.update()
    }

    onResize(el, ev) {
        var { dx, dy, state } = ev.detail
        state === 'start' && (el.resize(el.style))
        el.style.width = el._start.w + dx + 'px'
        el.style.height = el._start.h + dy + 'px'
        el.update()
    }

    onInsert(el, ev) {
        if (ev.detail.state !== 'start' || !this.hasAttribute('draw')) {
            return
        }

        var drawEl = this.getAttribute('draw') || 'div'
        var drawEl = document.createElement(drawEl)
        drawEl.style.position = 'absolute'
        this.appendChild(drawEl)
        $bind(el, drawEl)
    }

    onSelect(el) {
        if (this.hasAttribute('draw')) {
            return
        }

        // find intersections and select/deselect elements
        // TODO if it gets slow, we can consider a quadtree implementation.
        for (var i = 0; i < this.children.length; i += 1) {
            var child = this.children[i]
            if (child._drawbox) {
                continue
            } else if (intersect(el, child)) {
                this.select(child)
            } else {
                this.deselect(child)
            }
        }
    }

    select(child) {
        if (child._drawboxSelected || child._drawbox) {
            return // already selected
        }

        var selectBox = $create(`
            <div class='draw-box-selected'>
                <div class='draw-box-dragger'></div>
                <div class='draw-box-resizer'></div>
            </div>
        `)

        $bind(selectBox, child)
        selectBox.style.top = child.offsetTop + 'px'
        selectBox.style.left = child.offsetLeft + 'px'
        selectBox.style.width = child.offsetWidth + 'px'
        selectBox.style.height = child.offsetHeight + 'px'

        child._drawboxSelected = selectBox.update()
        this.appendChild(selectBox)

        // onDrag
        var dragger = selectBox.querySelector('.draw-box-dragger')
        DrawBox.initTrackEvents(dragger)
            .addEventListener('track', this.onDrag.bind(this, selectBox))

        // onResize
        var resizer = selectBox.querySelector('.draw-box-resizer')
        DrawBox.initTrackEvents(resizer)
            .addEventListener('track', this.onResize.bind(this, selectBox))

        // fire the selected event
        var ev = new Event('drawbox-selected', { bubbles: true })
        child.dispatchEvent(ev)
    }

    deselect(child) {
        if (!child._drawboxSelected) {
            return
        }

        this.removeChild(child._drawboxSelected)
        child._drawboxSelected = null

        // fire the selected event
        var ev = new Event('drawbox-deselected', { bubbles: true })
        child.dispatchEvent(ev)
    }

    selectAll() {
        Array.prototype.forEach.call(this.children, this.select.bind(this))
    }

    deselectAll() {
        Array.prototype.forEach.call(this.children, this.deselect.bind(this))
    }

    deleteSelected() {
        this.selection.forEach(function (selectBox) {
            selectBox.delete()
        })
        this.selection = []
    }

    static get styles() {
        return styles
    }

    // manually upgrade an element to be a DrawBox in cases where there's no
    // support for custom-elements. Otherwise, just create a <draw-box>.
    static init(el) {
        if (el instanceof DrawBox) {
            return // idempotent
        }

        Object.setPrototypeOf(el, DrawBox.prototype)
        el.connectedCallback() // harmless even when not connected.
    }
}

// check if two elements are intersected
function intersect(el1, el2) {
    var r1 = el1 instanceof HTMLElement ? el1.getBoundingClientRect() : el1
    var r2 = el2 instanceof HTMLElement ? el2.getBoundingClientRect() : el2
    return (
        r1.top <= r2.top + r2.height && // r1 starts before r2 ends
        r1.top + r1.height >= r2.top && // r1 ends after r2 starts
        r1.left <= r2.left + r2.width && // r1 starts before r2 ends
        r1.left + r1.width >= r2.left // r1 ends after r2 starts
    )
}

// helper function for creating an element out of arbitrary HTML strings
function $create(innerHTML) {
    var container = document.createElement('div')
    container.innerHTML = innerHTML
    return Object.assign(container.children[0], {
        _drawbox: true,
        resize: function(rect) {
            this._start = {
                x: parseFloat(rect.left) || 0,
                y: parseFloat(rect.top) || 0,
                w: parseFloat(rect.width) || 0,
                h: parseFloat(rect.height) || 0
            }
        }
    })
}

function $bind(el, target) {
    el.update = function () {
        if (!target) {
            return this
        }

        target.style.top = this.style.top
        target.style.left = this.style.left
        target.style.width = this.style.width
        target.style.height = this.style.height
        return this
    }

    el.delete = function () {
        target.parentNode.removeChild(target)
        this.parentNode.removeChild(this)
    }

    return el
}

// generic - can be moved to its own library, or replaced with Hammer.js Pan.
DrawBox.initTrackEvents = function(el, options) {
    var threshold = (options || {}).threshold || 0

    if (el._drawboxBound) { // idempotent function
        el.removeEventListener('mousedown', el._drawboxBound)
    }

    el.addEventListener('mousedown', mouseDown)
    el._drawboxBound = mouseDown

    var start, inThreshold;
    function mouseDown(ev) {
        if (ev.target !== el) {
            return // disable track event on sub-elements
        }

        start = ev

        window.addEventListener('mousemove', mouseMove)
        window.addEventListener('mouseup', mouseUp)
    }

    function mouseMove(ev) {
        if (!inThreshold) {
            var dx = Math.abs(ev.x - start.x)
            var dy = Math.abs(ev.y - start.y)
            if (dx >= threshold || dy >= threshold) {
                inThreshold = true
                fire('start', start)
            } else {
                return // threshold didn't break yet.
            }
        }

        fire('move', ev)
    }

    function mouseUp(ev) {
        window.removeEventListener('mousemove', mouseMove)
        window.removeEventListener('mouseup', mouseUp)

        if (inThreshold) {
            fire('end', ev)
        }

        start = inThreshold = null
    }

    function fire(state, ev) {
        var detail = {
            state: state,
            x: ev.x,
            y: ev.y,
            dx: ev.x - start.x,
            dy: ev.y - start.y,
        }

        ev = new Event('track')
        ev.detail = detail
        el.dispatchEvent(ev)
    }

    return el
}

// register the element
document.addEventListener('DOMContentLoaded', function () {
    if ('customElements' in window) {
        window.customElements.define('draw-box', DrawBox)
    } else if ('registerElement' in document) {
        window.DrawBox = document.registerElement('draw-box', DrawBox)
    } else {
        console.warn('<draw-box>: custom elements aren\'t supported')
        console.warn('<draw-box>: Initialize <draw-box> with DrawBox.init(el)')
    }
})

window.DrawBox = DrawBox
})()
