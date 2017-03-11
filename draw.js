(function(exports){
    var conflict = exports.draw

    exports.draw = draw
    draw.noConflict = function() {
        exports.draw = conflict
        return draw
    }

    function select(el) {
        var drawbox = $(`
            <div class="draw draw-box">
                <div draggable="true" class="draw-drag"></div>
                <div draggable="true" class="draw-resize"></div>
            </div>
        `)
        .appendTo($(el.parentNode));

        var els = $([el, drawbox[0]]).style({
            position: 'absolute',
            width: el.offsetWidth + 'px',
            height: el.offsetHeight + 'px',
            top: el.offsetTop + 'px',
            left: el.offsetLeft + 'px'
        })

        var startx, starty, elx, ely
        drawbox.$$('.draw-resize')
            .on('dragstart', function(ev) {
                // rect = el.getBoundingClientRect()
                startx = ev.x
                starty = ev.y
                elx = parseFloat(el.style.width)
                ely = parseFloat(el.style.height)
            })
            .on('drag', function(ev) {
                var dx = ev.x - startx
                var dy = ev.y - starty

                els.style({
                    width: (elx + dx) + 'px',
                    height: (ely + dy) + 'px'
                })
            })

        drawbox.$$('.draw-drag')
            .on('dragstart', function(ev) {
                // rect = el.getBoundingClientRect()
                startx = ev.x
                starty = ev.y
                elx = parseFloat(el.style.left)
                ely = parseFloat(el.style.top)
            })
            .on('drag', function(ev) {
                var dx = ev.x - startx
                var dy = ev.y - starty

                els.style({
                    left: (elx + dx) + 'px',
                    top: (ely + dy) + 'px'
                })
            })
    }

    function draw(el) {
        $(el.children)
            .on('click', function(ev) {
                $(this).fire('draw:selected', ev)
            })
            .on('draw:selected', function () {
                select(this)
            })

        // if (!el.__draw) {
        //     el.__draw = {
        //         container: el,
        //         add: add
        //     }
        // }
        //
        // return el.__draw
    }

    function add(element) {
        $(element)
            .on('click', function (ev) {
                this.classList.toggle('draw-selected');
                (this.classList.contains('draw-selected'))
                    ? $(this).fire('draw:selected', ev)
                    : $(this).fire('draw:deselected', ev);
            })
            .on('draw:selected', function () {
                // $('<div class="draw-dragger"><div>')
                //     .appendTo($(document))
                //     .on('draw:drag', $(this).fire.bind('draw:dragging'))
                // //
                // $('<div class="draw-resizer"><div>')
                //     .appendTo($(this))
                //     .on('draw:drag', this.fire.bind('draw:resize'))
            })
            .on('draw:deselected', function () {
                console.log('deselected.')
            })
            .on('draw:resize', function(ev) {

            })

        this.container.appendChild(element)
    }

    function $(els) {
        if (typeof els === 'string') {
            var tmp = document.createElement('div')
            tmp.innerHTML = els
            els = tmp.children
        }

        if (els instanceof HTMLCollection) {
            els = [].slice.apply(els)
        } else if (!Array.isArray(els)) {
            els = [els]
        }

        els.$$ = function(selector) {
            var res = els.reduce(function(all, el) {
                return all.concat([].slice.apply(el.querySelectorAll(selector)))
            }, [])
            return $(res)
        }

        els.on = function(name, callback) {
            if (name === 'draw:drag') {
                els.forEach(function (el) {
                    $(el).on('mousedown', initDrag)
                })
                return els
            }

            els.forEach(function (el) {
                el.addEventListener(name, callback)
            })
            return els
        }

        els.fire = function(name) {
            var ev = new Event(name)
            els.forEach(function(el) {
                el.dispatchEvent(ev)
            })
            return els
        }

        els.style = function(obj) {
            els.forEach(function(el) {
                Object.keys(obj).forEach(function(k) {
                    el.style[k] = obj[k]
                })
            })
            return els
        }

        els.appendTo = function(parents) {
            els.forEach(function(el) {
                parents[0].appendChild(el)
            })
            return els
        }

        els.rect = function() {
            return els[0].getBoundingClientRect()
        }


        return els
    }


    function initDrag(el) {
        document.addEventListener('mouseup', onUp)
        document.addEventListener('mousemove', onMove)

        function onUp(ev) {
            console.log('up??')
            document.removeEventListener('mouseup', onUp)
            document.removeEventListener('mousemove', onMove)
        }

        function onMove() {
            console.log('.')
        }
    }



})(window)
