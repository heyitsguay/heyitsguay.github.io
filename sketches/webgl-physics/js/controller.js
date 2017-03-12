/**
 * Created by matt on 12/16/16.
 */

/**
 * User interface connection to the simulation.
 * @constructor
 */
function Controller(particles) {
    this.particles = particles;
    this.obstacle = null;
    this.init();
    this.mouseDown = false;
    this.mouseCoords = [0, 0];

    var _this = this;
    var canvas = particles.igloo.gl.canvas;

    var showText = true;

    // Register IO callbacks

    // Callback to move obstacles across the screen as the
    // mouse moves
    $(canvas).on('mousemove', function(event) {
        _this.mouseCoords = Controller.coords(event);
        _this.obstacle.position[0] = _this.mouseCoords[0];
        _this.obstacle.position[1] = _this.mouseCoords[1];

        // if (event.shiftKey) {
        //     _this.obstacle.enabled = true;
        //     // particles.updateObstacles();
        // }
        // // Place an obstacle on mouse down
        if (_this.mouseDown) {
            _this.particles.addObstacle(_this.mouseCoords, _this.obstacle.size);
        }
    });
    // Callback for when the mouse leaves the canvas
    $(canvas).on('mouseout', function() {
        _this.obstacle.enabled = false;
        // particles.updateObstacles();
        _this.mouseDown = false;
    });
    // Callback for mouse press
    $(canvas).on('mousedown', function() {
        _this.mouseDown = true;
        _this.mouseCoords = Controller.coords(event);
        _this.particles.addObstacle(_this.mouseCoords, _this.obstacle.size);
    });
    // Callback for mouse release
    $(canvas).on('mouseup', function(event) {
        _this.mouseDown = false;
    });
    // Callback for mouse wheel motion
    $(canvas).on('mousewheel', function(event) {
        if (event.originalEvent.wheelDelta > 0) {
            _this.obstacle.size += 3;
        } else {
            _this.obstacle.size = Math.max(_this.obstacle.size - 3, 3);
        }
    });
    // Callback for key presses
    $(window).on('keydown', function (event) {
        switch (event.which) {
            // Activate cursor obstacle
            case 16: // shift
                _this.obstacle.position[0] = _this.mouseCoords[0];
                _this.obstacle.position[1] = _this.mouseCoords[1];
                _this.obstacle.enabled = true;
                // particles.updateObstacles();
            break;
        }
    });
    // Callback for key releases
    $(window).on('keyup', function(event) {
        switch (event.which) {

            // Deactivate cursor obstacle
            case 16: // shift
                _this.obstacle.enabled = false;
                // particles.updateObstacles();
            break;

            // Clear the screen
            case 67: // c
                _this.clear();
            break;

            // Double the particle count
            case 68: // d
                _this.adjustCount(2);
            break;

            // Halve the particle count
            case 72: // h
                _this.adjustCount(0.5);
            break;

            // Toggle square and circular particles
            case 74: // j
                _this.particles.isRound = !_this.particles.isRound;
            break;

            // Toggle the menu overlay
            case 81: // q
                showText = !showText;
                if (showText) {
                    $('.toggle').show();
                } else {
                    $('.toggle').hide();
                }
        }
    });

    // Register UI callbacks
    this.controls = {
        increase: $('.controls .increase').on('click', function() {
            _this.adjustCount(2);
        }),
        decrease: $('.controls .decrease').on('click', function() {
            _this.adjustCount(0.5);
        }),
        reset: $('.controls .reset').on('click', function() {
            _this.particles.setParticleCount(_this.particles.originalParticleCount);
        }),
        phue: $('.controls .particles .phue').on('input', function() {
            _this.particles.hbase = Number($(this).val());
        }),
        groove: $('.controls .particles .groove').on('input', function() {
            _this.particles.groove = Number($(this).val());
        }),
        psize: $('.controls .particles .size').on('input', function() {
            _this.particles.size = Number($(this).val());
        }),
        gravity: $('.controls .particles .gravity').on('input', function() {
            _this.particles.gravity[1] = -Number($(this).val());
        }),
        wind: $('.controls .particles .wind').on('input', function() {
            _this.particles.wind[0] = Number($(this).val());
        }),
        restitution: $('.controls .particles .restitution').on('input', function() {
            _this.particles.restitution = Number($(this).val());
        }),
        exclusion: $('.controls .particles .exclusion').on('input', function() {
            _this.particles.pauli = Number($(this).val());
        }),
        ocolor: $('.controls .obstacles .color').on('change', function(event) {
            var value = $(event.target).val();
            _this.particles.obstacleColor = Controller.parseColor(value);
        }),
        clear: $('.controls .clear').on('click', function() {
            _this.clear()
        }),
        osize: $('.controls .obstacles .size').on('change', function() {
            _this.obstacle.size = Number($(this).val());
            _this.particles.updateObstacles();
        }),
        save: $('.controls .save').on('click', function() {
            localStorage.snapshot = JSON.stringify(_this.save());
        }),
        restore: $('.controls .restore').on('click', function() {
            _this.restore(JSON.parse(localStorage.snapshot));
            updateCount();
        })
    };
}

/**
 * Adjust the particle count.
 * @param {number} factor: multiplies the particle count
 * @returns {Controller} this
 */
Controller.prototype.adjustCount = function(factor) {
    var current = this.particles.getCount();
    this.particles.setParticleCount(Math.max(1, current * factor));
    updateCount();
};

/**
 * Clear all obstacles.
 * @returns {Controller} this
 */
Controller.prototype.clear = function() {
    var size = this.obstacle.size;
    // this.particles.obstacles.length = 0;
    var gl = this.particles.igloo.gl;

    // Set up for obstacles framebuffer

    this.particles.framebuffers.obstacles.attach(this.particles.textures.obstacles);
    this.particles.framebuffers.obstacles.bind();
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.particles.worldSize[0], this.particles.worldSize[1]);

    // Clear the obstacle texture
    gl.clearColor(0.5, 0.5, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.init();
    this.obstacle.size = size;
    return this;
};

/**
 * Return the simulation coordinates from an event.
 * @param {Object} event
 * @returns {Array} the simulation coordinates from the event
 */
Controller.coords = function(event) {
    var $target = $(event.target);
    var offset = $target.offset();
    var border = 1;
    var x = event.pageX - offset.left - border;
    var y = $target.height() - (event.pageY - offset.top - border);
    return [x, y];
};

/**
 * Create and capture the mouse obstacle.
 * @returns {Controller} this
 */
Controller.prototype.init = function() {

    this.obstacle = {
        enabled: false,
        program: this.particles.programs.ocircle,
        verts: this.particles.buffers.point,
        position: [0, 0],
        size: 20,
        mode: gl.POINTS,
        length: 1
    };

    // this.obstacle = this.particles.addObstacle([0, 0], 20);
    // this.obstacle.enabled = false;
    // this.particles.updateObstacles();
    return this;
};

/**
 * Parse an RGB color string as a 4-element color array.
 * @param {string} color
 * @returns {Array} a 4-element color array
 */
Controller.parseColor = function(color) {
    var colors = /#(..)(..)(..)/.exec(color).slice(1).map(function(x) {
        return parseInt(x, 16) / 255;
    });
    colors.push(1);
    return colors;
};

/**
 * Restore the simulation's state from a save object.
 * @param {Object} save: save state
 * @returns {Controller} this
 */
Controller.prototype.restore = function(save) {
    if (this.particles.getCount() !== save.particles) {
        this.particles.setParticleCount(save.particles);
    }
    this.clear();
    var ps = this.particles;
    this.controls.psize.val(ps.size = save.size);
    this.controls.gravity.val(ps.gravity = save.gravity);
    this.controls.wind.val(ps.wind = save.wind);
    this.controls.restitution.val(ps.restitution = save.restitution);
    save.obstacles.forEach(function(o) {
        ps.addObstacle(o.position, o.size);
    });
    return this;
};

/**
 * Returns a copy of an array/value rounded to the specified precision.
 * @param {Array|ArrayBufferView|value} value: value to round
 * @param {number} [precision=4]: rounding precision
 * @returns {Array|number} a copy of the array/value rounded to PRECISION
 */
Controller.round = function(value, precision) {
    precision = precision || 4;
    if ('length' in value) {
        return Array.prototype.map.call(value, function (x) {
            return Number(x.toPrecision(precision));
        });
    } else {
        return Number(value.toPrecision(precision));
    }
};

/**
 * Captures the simulation's particle count and obstacle configuration.
 * @returns {Object} the simulation save state object
 */
Controller.prototype.save = function() {
    var save = {
        gravity: this.particles.gravity,
        wind: this.particles.wind,
        size: this.particles.size,
        restitution: this.particles.restitution,
        particles: this.particles.getCount(),
        obstacles: []
    };
    this.particles.obstacles.forEach(function(o) {
        if (o.enabled) {
            save.obstacles.push({
                position: Controller.round(o.position),
                size: o.size
            });
        }
    });
    return save;
};