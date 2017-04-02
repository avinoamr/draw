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
        if (state === 'start') {
            var rect = this.getBoundingClientRect()
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

        // find intersections and select/deselect elements
        // TODO if it gets slow, we can consider a quadtree implementation.
        for (var i = 0; i < this.children.length; i += 1) {
            var child = this.children[i]
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
            $vendorStyle(this, 'userSelect', null)
        }
    }

    onDrag(el, ev) {
        var { x, y, dx, dy, state } = ev.detail
        if (state === 'start') {
            this._absoluteChildren()
            var rect = this.getBoundingClientRect()
            el._startTop = y - rect.top
            el._startLeft = x - rect.left
            $vendorStyle(this, 'userSelect', 'none')
        }

        el.style.top = el._startTop + dy + 'px'
        el.style.left = el._startLeft + dx + 'px'
        el._drawboxSelected.update()

        if (state === 'end') {
            $vendorStyle(this, 'userSelect', null)
        }
    }

    onResize(el, ev) {
        var { dx, dy, state } = ev.detail
        if (state === 'start') {
            this._absoluteChildren()
            var computed = window.getComputedStyle(el)
            el._startWidth = parseFloat(computed.getPropertyValue('width'))
            el._startHeight = parseFloat(computed.getPropertyValue('height'))
            $vendorStyle(this, 'userSelect', 'none')
        }

        el.style.width = el._startWidth + dx + 'px'
        el.style.height = el._startHeight + dy + 'px'
        el._drawboxSelected.update()

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
        `)

        selectBox.update = function() {
            this.style.top = child.offsetTop + 'px'
            this.style.left = child.offsetLeft + 'px'
            this.style.width = child.offsetWidth + 'px'
            this.style.height = child.offsetHeight + 'px'
            return this
        }

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

    // apply the absolute positioning to all child elements in order to make
    // them draggable/resizable. While it seems irrelevant for resizability,
    // having some non-absolutely positionined elements may cause resizing to
    // push around to a new position.
    _absoluteChildren() {
        var reposition = []
        for (var i = 0; i < this.children.length; i += 1) {
            var child = this.children[i]
            if (child._drawbox) {
                continue
            }

            if (window.getComputedStyle(child).position !== 'absolute') {
                reposition.push({
                    child,
                    position: 'absolute',
                    top: child.offsetTop + 'px',
                    left: child.offsetLeft + 'px',
                    width: child.offsetWidth + 'px',
                    height: child.offsetHeight + 'px',
                })
            }
        }

        reposition.forEach(function(item) {
            Object.assign(item.child.style, item)
        })
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
