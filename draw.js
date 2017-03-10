(function(exports){
    var conflict = exports.draw

    exports.draw = draw
    draw.noConflict = function() {
        exports.draw = conflict
        return draw
    }

    function draw(el) {
        if (!el.__draw) {
            el.classList.add('draw')
            el.__draw = {
                container: el,
                add: add
            }
        }

        return el.__draw
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
            els = [].slice.apply(els)
        }

        els = Array.isArray(els) ? els : [els]

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

        els.appendTo = function(parents) {
            els.forEach(function(el) {
                parents[0].appendChild(el)
            })
            return els
        }

        // els.attr


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
