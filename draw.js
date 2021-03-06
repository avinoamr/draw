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
`

class DrawBox extends HTMLElement {
    attachedCallback() { // compatibility with custom-elements v0
        this.connectedCallback()
    }

    set draw(v) {
        if (typeof v === 'function') {
            this.removeAttribute('draw')
            this._draw = v
        } else {
            this.setAttribute('draw', v)
        }
    }

    get draw() {
        if (this.hasAttribute('draw')) {
            return this.getAttribute('draw')
        } else {
            return this._draw || null
        }
    }

    connectedCallback() {
        if (this._inited) {
            return
        }

        this._inited = true

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

        // disable user text-selection
        function textSelect(ev) {
            var { state } = ev.detail
            this.classList.toggle('draw-box-no-select', state !== 'end')
        }

        // enable keyboard events by making the drawbox focus-able
        this.tabIndex = 0
        this.selection = []
        this._selectBox = $create(`<div class='draw-box-selection'></div>`)
        $bind(this._selectBox, null)
        DrawBox.initTrackEvents(this)
            .on('mousedown', this.onMouseDown)
            .on('mouseup', this.onMouseUp)
            .on('keyup', this.onKeyUp)
            .on('drawbox-drag', textSelect, this.onDrag)
            .on('drawbox-resize', textSelect, this.onResize)
            .on('drawbox-draw', textSelect, this.onDraw)
            .on('track', textSelect, function (ev) {
                var { x, y, state } = ev.detail
                if (state === 'start') {
                    this.fireDraw = null
                    var el = ev.target._selectBox
                    if (this.draw) {
                        el = (typeof this.draw === 'function')
                            ? this.draw()
                            : document.createElement(this.draw)
                        this.fireDraw = DrawBox.refire(el, 'drawbox-draw')
                    }

                    el.style.position = 'absolute'
                    this.appendChild(el)
                    this.select(el)
                }

                this.fireDraw ? this.fireDraw(ev) : this.onSelect(ev)
                if (state === 'end' && this._selectBox.parentNode) {
                    // remove the selection box
                    this._selectBox.parentNode.removeChild(this._selectBox)
                }
            })
    }

    onDrag(ev) {
        var el = ev.target._selectBox
        var { dx, dy, state } = ev.detail
        state === 'start' && (el.resize(el.style))
        el.style.top = el._start.y + dy + 'px'
        el.style.left = el._start.x + dx + 'px'
        el.update()
    }

    onResize(ev) {
        var el = ev.target._selectBox
        var { dx, dy, state } = ev.detail
        state === 'start' && (el.resize(el.style))
        el.style.width = el._start.w + dx + 'px'
        el.style.height = el._start.h + dy + 'px'
        el.update()
    }

    onDraw(ev) {
        var el = ev.target._selectBox
        var { relx, rely, dx, dy, state } = ev.detail
        state === 'start' && (el.resize({ left: relx, top: rely }))
        el.style.top = el._start.y + (dy < 0 ? dy : 0) + 'px'
        el.style.left = el._start.x + (dx < 0 ? dx : 0) + 'px'
        el.style.width = el._start.w + Math.abs(dx) + 'px'
        el.style.height = el._start.h + Math.abs(dy) + 'px'
        el.update()
    }

    onSelect(ev) {
        this.onDraw(ev)

        // find intersections and select/deselect elements
        // TODO if it gets slow, we can consider a quadtree implementation.
        var el = ev.target._selectBox
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

    onMouseUp(ev) {
        var dx = ev.x - this._lastDown.x
        var dy = ev.y - this._lastDown.y
        if (dx != 0 || dy != 0) {
            return
        }

        // de-select all on background click.
        this.deselectAll()
        if (ev.target !== this) {
            // find the selected element by walking up the ancestors tree until
            // we find the immediate child of this draw-box to select.
            var target = ev.target
            while (target.parentNode !== this) {
                target = target.parentNode
            }

            this.select(target)
        }
    }

    onMouseDown(ev) {
        this._lastDown = ev
    }

    onKeyUp(ev) {
        if (ev.target !== this) {
            return
        }
        
        if (ev.ctrlKey && ev.keyCode === 65) { // Ctrl+A
            this.selectAll()
        } else if (ev.keyCode === 8) { // Del
            this.deleteSelected()
        }
    }

    select(child) {
        if (child._selectBox || child._drawbox) {
            return // already selected
        }

        var selectBox = $create(`
            <div class='draw-box-selected'>
                <div class='draw-box-dragger'></div>
                <div class='draw-box-resizer'></div>
            </div>
        `)

        $bind(selectBox, child)
        this.appendChild(selectBox)

        setRect(selectBox, child.getBoundingClientRect())
        child._selectBox = selectBox

        // onDrag
        var dragger = selectBox.querySelector('.draw-box-dragger')
        DrawBox.initTrackEvents(dragger)
            .addEventListener('track', DrawBox.refire(child, 'drawbox-drag'))

        // onResize
        var resizer = selectBox.querySelector('.draw-box-resizer')
        DrawBox.initTrackEvents(resizer)
            .addEventListener('track', DrawBox.refire(child, 'drawbox-resize'))

        // fire the selected event
        var ev = new Event('drawbox-selected', { bubbles: true })
        child.dispatchEvent(ev)
    }

    deselect(child) {
        if (!child._selectBox) {
            return
        }

        this.removeChild(child._selectBox)
        child._selectBox = null

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
        Array.prototype.forEach.call(this.children, function (el) {
            if (el._selectBox) {
                el._selectBox.delete()
            }
        })
    }

    on(name /*, listeners... */) {
        for (var i = 1 ; i < arguments.length; i += 1) {
            this.addEventListener(name, arguments[i])
        }
        return this
    }

    static refire(el, name) {
        return function (ev) {
            var { detail } = ev
            ev = Object.assign(new Event(name, { bubbles: true }), { detail })
            el.dispatchEvent(ev)
        }
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

// Sets the bounding client rect of an element to match the one provided.
function setRect(el, rect) {
    el.style.top = rect.top + 'px'
    el.style.left = rect.left + 'px'
    el.style.width = rect.width + 'px'
    el.style.height = rect.height + 'px'

    // Different border-box styles might change the behavior of width and
    // height. Instead of attempting to anticipate all of these different edge-
    // cases, we're just comparing the resulting rect to the desired one and
    // adjust accordingly.
    var elRect = el.getBoundingClientRect()
    var dTop = elRect.top - rect.top
    var dLeft = elRect.left - rect.left
    var dWidth = elRect.width - rect.width
    var dHeight = elRect.height - rect.height

    dTop !== 0 && (el.style.top = rect.top - dTop + 'px')
    dLeft !== 0 && (el.style.left = rect.left - dLeft + 'px')
    dWidth !== 0 && (el.style.width = rect.width - dWidth + 'px')
    dHeight !== 0 && (el.style.height = rect.height - dHeight + 'px')
}

function $bind(el, target) {
    el.update = function () {
        if (!target) {
            return this
        }

        setRect(target, this.getBoundingClientRect())
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

    var start, inThreshold, rect;
    function mouseDown(ev) {
        if (ev.target !== el) {
            return // disable track event on sub-elements
        }

        start = ev
        rect = el.getBoundingClientRect()
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
            relx: ev.x - rect.left,
            rely: ev.y - rect.top,
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
