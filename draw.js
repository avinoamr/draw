(function(){
// we use inline styles instead of just using a <style> element because the
// <draw-box> element might be used within a shadow-dom of another component, so
// we'd like to have the style contained within the same scope. It would've been
// easier with a Shadow-DOM stylesheet, but we don't want to require the
// shadow-dom pollyfill especially for cases where users opt to use the
// `DrawBox.init(el)` work-around when they don't want any custom-element
// polyfills. See the $create() helper function.
// TODO: reconsider when shadow-dom is has better vendor support.
var styles = {
    selection: {
        position: 'absolute',
        border: '1px solid silver'
    },
    selected: {
        position: 'absolute',
        boxSizing: 'border-box',
        border: '1px solid #3498db',
        pointerEvents: 'none',
    },
    dragger: {
        position: 'absolute',
        width: '10px',
        height: '10px',
        top: '-5px',
        left: '-5px',
        cursor: 'pointer',
        background: '#3498db',
        pointerEvents: 'auto',
    },
    resizer: {
        position: 'absolute',
        boxSizing: 'border-box',
        width: '10px',
        height: '10px',
        bottom: '-3px',
        right: '-3px',
        border: '4px solid #3498db',
        borderTop: 'none',
        borderLeft: 'none',
        cursor: 'nwse-resize',
        pointerEvents: 'auto'
    }
}

class DrawBox extends HTMLElement {
    attachedCallback() { // compatibility with custom-elements v0
        this.connectedCallback()
    }

    connectedCallback() {
        this.style.display = 'block'
        this.style.position = 'relative'

        DrawBox.initTrackEvents(this)
        this.addEventListener('track', this.onTrack)
        this.addEventListener('click', this.onClick)

        this._selectBox = $create(`<div class='draw-box-selection'></div>`)
    }

    onClick(ev) {
        if (ev.target === this) {
            // de-select all on background click.
            Array.prototype.forEach.call(this.children, function (child) {
                this.deselect(child)
            }, this)
        } else {
            // TODO selected clicked element. Maybe with capturing click event?
        }
    }

    onTrack(ev) {
        var { x, y, dx, dy, state } = ev.detail
        var selectBox = this._selectBox
        var drawEl = this.getAttribute('draw')
        if (state === 'start') {
            var rect = this.getBoundingClientRect()
            if (drawEl !== null) {
                drawEl = document.createElement(drawEl || 'div')
                drawEl.style.position = 'absolute'
                this.appendChild(drawEl)
            }

            selectBox.bindElement(drawEl)
            selectBox._startTop = y - rect.top
            selectBox._startLeft = x - rect.left
            selectBox.style.top = selectBox._startTop + 'px'
            selectBox.style.left = selectBox._startLeft + 'px'
            this.appendChild(selectBox)
            $vendorStyle(this, 'userSelect', 'none')
        }

        // on negative deltas - the user drags from bottom-right to top-left.
        // reverse the logic such that it drags the start-position instead of
        // the end-positing.
        if (dx < 0) {
            selectBox.style.left = selectBox._startLeft + dx + 'px'
            dx *= -1
        }

        if (dy < 0) {
            selectBox.style.top = selectBox._startTop + dy + 'px'
            dy *= -1
        }

        // adjust the width and height
        selectBox.style.width = dx + 'px'
        selectBox.style.height = dy + 'px'
        selectBox.update()
        
        var children = drawEl ? [] : this.children

        // find intersections and select/deselect elements
        // TODO if it gets slow, we can consider a quadtree implementation.
        for (var i = 0; i < children.length; i += 1) {
            var child = children[i]
            if (child._drawbox) {
                continue
            } else if (intersect(selectBox, child)) {
                this.select(child)
            } else {
                this.deselect(child)
            }
        }

        if (state === 'end') {
            this.removeChild(selectBox)
            this.removeAttribute('draw') // auto-disable draw.
            $vendorStyle(this, 'userSelect', null)
        }
    }

    onDrag(el, ev) {
        var { x, y, dx, dy, state } = ev.detail
        var selectBox = el._drawboxSelected
        if (state === 'start') {
            var rect = this.getBoundingClientRect()
            selectBox._startTop = y - rect.top
            selectBox._startLeft = x - rect.left
            $vendorStyle(this, 'userSelect', 'none')
        }

        selectBox.style.top = selectBox._startTop + dy + 'px'
        selectBox.style.left = selectBox._startLeft + dx + 'px'
        selectBox.update()

        if (state === 'end') {
            $vendorStyle(this, 'userSelect', null)
        }
    }

    onResize(el, ev) {
        var { dx, dy, state } = ev.detail
        var selectBox = el._drawboxSelected
        if (state === 'start') {
            var rect = selectBox.getBoundingClientRect()
            selectBox._startWidth = rect.width
            selectBox._startHeight = rect.height
            $vendorStyle(this, 'userSelect', 'none')
        }

        selectBox.style.width = selectBox._startWidth + dx + 'px'
        selectBox.style.height = selectBox._startHeight + dy + 'px'
        selectBox.update()

        if (state === 'end') {
            $vendorStyle(this, 'userSelect', null)
        }
    }

    select(child) {
        if (child._drawboxSelected) {
            return // already selected
        }

        var selectBox = $create(`
            <div class='draw-box-selected'>
                <div class='draw-box-dragger'></div>
                <div class='draw-box-resizer'></div>
            </div>
        `).bindElement(child)

        selectBox.style.top = child.offsetTop + 'px'
        selectBox.style.left = child.offsetLeft + 'px'
        selectBox.style.width = child.offsetWidth + 'px'
        selectBox.style.height = child.offsetHeight + 'px'

        child._drawboxSelected = selectBox.update()
        this.appendChild(selectBox)

        // onDrag
        var dragger = selectBox.querySelector('.draw-box-dragger')
        DrawBox.initTrackEvents(dragger)
            .addEventListener('track', this.onDrag.bind(this, child))

        // onResize
        var resizer = selectBox.querySelector('.draw-box-resizer')
        DrawBox.initTrackEvents(resizer)
            .addEventListener('track', this.onResize.bind(this, child))
    }

    deselect(child) {
        if (child._drawboxSelected) {
            this.removeChild(child._drawboxSelected)
            child._drawboxSelected = null
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
    var r1 = el1.getBoundingClientRect()
    var r2 = el2.getBoundingClientRect()
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
    var child = container.children[0]
    child._drawbox = true

    // apply the styles based on class name. See comment on DrawBox.styles.
    var elements = [child]
    while (elements.length > 0) {
        var el = elements.pop()
        var cls = el.className.replace('draw-box-', '')
        Object.assign(el.style, DrawBox.styles[cls])
        elements = elements.concat([].slice.call(el.children))
    }

    child.bindElement = function(el) {
        this._bound = el
        return this
    }

    child.update = function() {
        if (!this._bound) {
            return this
        }

        this._bound.style.top = this.style.top
        this._bound.style.left = this.style.left
        this._bound.style.width = this.style.width
        this._bound.style.height = this.style.height
        return this
    }

    return child
}

function $vendorStyle(el, prop, value) {
    var capProp = prop[0].toUpperCase() + prop.slice(1)
    el.style['webkit' + capProp] = value;
    el.style['moz' + capProp] = value;
    el.style['ms' + capProp] = value;
    el.style['o' + capProp] = value;
    el.style[prop] = value
}

// generic - can be moved to its own library, or replaced with Hammer.js Pan.
DrawBox.initTrackEvents = function(el, options) {
    var threshold = (options || {}).threshold || 10

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

document.addEventListener('DOMContentLoaded', function () {
    if ('customElements' in window) {
        window.customElements.define('draw-box', DrawBox)
    } else if ('registerElement' in document) {
        window.DrawBox = document.registerElement('draw-box', DrawBox)
    } else {
        console.warn('<draw-box>: custom elements aren\'t supported')
        console.warn('<draw-box>: initialize elements with DrawBox.init(el)')
    }
})

window.DrawBox = DrawBox
})()
