/**
 * Created by matt on 12/16/16.
 */

/**
 * Main app class.
 * @param {HTMLCanvasElement} canvas
 * @param {number} nparticles initial particle count
 * @param {number} size particle size in pixels
 * @constructor
 */
function Particles(canvas, nparticles, size) {
    // Use the Igloo library on top of WebGL
    var igloo = this.igloo = new Igloo(canvas);

    // WebGL context for the canvas
    var gl = igloo.gl;
    // Canvas dimensions
    var w = canvas.width, h = canvas.height;
    // Also store canvas dimensions as a length-2 vector
    this.worldSize = new Float32Array([w, h]);
    this.iworldSize = new Float32Array([1./w, 1./h]);

    this.originalParticleCount = nparticles;

    this.isRound = true;

    // Number of simulation steps
    this.tick = 0;

    // Controls color-changing effect speed
    this.groove = 0;

    gl.disable(gl.DEPTH_TEST);

    // Event listeners
    this.listeners = [];

    // Check for vertex shader texture access
    if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) === 0) {
        var msg = 'Vertex shader texture access not available.' +
                'Try again on another platform.';
        alert(msg);
        throw new Error(msg);
    }

    // Check for float texture access
    if (gl.getExtension('OES_texture_float') === null) {
        msg = 'Floating point textures are not available.' +
                'Try again on another platform.';
        alert(msg);
        throw new Error(msg);
    }

    // Drawing parameters
    this.size = size;
    this.hbase = 0;
    this.color = [0.14, 0.62, 1., 0.6];
    this.obstacleColor = [0.45, 0.35, 0.25, 1.];

    // Physics parameters
    this.running = false;
    this.gravity = [0., -0.05];
    this.wind = [0., 0.];
    this.restitution = 0.25;
    this.pauli = 1.;
    this.pauliDecay = 0;

    // Wrapper around the Igloo texture function
    function texture() {
        return igloo.texture(null, gl.RGBA, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.FLOAT);
    }

    // Collection of shader programs
    this.programs = {
        update: igloo.program('glsl/quad.vert', 'glsl/update.frag'),
        draw: igloo.program('glsl/draw.vert', 'glsl/draw.frag'),
        flat: igloo.program('glsl/quad.vert', 'glsl/flat.frag'),
        ocircle: igloo.program('glsl/ocircle.vert', 'glsl/ocircle.frag'),
        oparticle: igloo.program('glsl/oparticle.vert', 'glsl/oparticle.frag')
    };

    // Vertex buffer data
    this.buffers = {
        quad: igloo.array(Igloo.QUAD2),
        indexes: igloo.array(),
        point: igloo.array(new Float32Array([0, 0]))
    };

    // Data textures
    this.textures = {
        p0: texture(),
        p1: texture(),
        v0: texture(),
        v1: texture(),
        obstacles: igloo.texture().blank(w, h),
        particles: igloo.texture().blank(w, h)
    };

    // Framebuffers
    this.framebuffers = {
        step: igloo.framebuffer(),
        obstacles: igloo.framebuffer().attach(this.textures.obstacles)
    };

    // Initial particle count
    this.setParticleCount(nparticles);

    // Initial obstacle
    // this.addObstacle([w / 2, h / 2], 32);
}

/**
 * Introduce a new circle obstacle to the simulation. Additional
 * calls to updateObstacles() are needed if obstacle parameters are
 * changed after creation.
 * @param {Array} center: obstacle center
 * @param {number} radius: obstacle radius
 * @returns {Object} the obstacle object
 */
Particles.prototype.addObstacle = function(center, radius) {
    var gl = this.igloo.gl;
    var w = this.worldSize[0], h = this.worldSize[1];

    // Create the obstacle object
    var obstacle = {
        enabled: true,
        program: this.programs.ocircle,
        verts: this.buffers.point,
        position: center,
        size: radius,
        mode: gl.POINTS,
        length: 1
    };

    // Add the new obstacle to the obstacle list
    // this.obstacles.push(obstacle);

    // Update obstacle GPU data
    this.updateObstacles(obstacle);

    return obstacle;
};

/**
 * Draw the current simulation state.
 * @returns {Particles} this
 */
Particles.prototype.draw = function() {
    gl = this.igloo.gl;

    // Enable transparency effects
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Bind the display framebuffer
    this.igloo.defaultFramebuffer.bind();
    gl.viewport(0, 0, this.worldSize[0], this.worldSize[1]);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw particles

    // Bind position and velocity texture data
    this.textures.p0.bind(0);
    this.textures.v0.bind(1);
    this.programs.draw.use()
        .attrib('index', this.buffers.indexes, 2)
        .uniformi('positions', 0)
        .uniformi('velocities', 1)
        .uniform('ptexsize', this.ptexSize)
        .uniform('worldsize', this.worldSize)
        .uniform('size', this.size)
        .uniform('groove', this.groove)
        .uniform('tick', this.tick)
        .uniform('hbase', this.hbase)
        .uniform('color', this.color)
        .uniform('isround', this.isRound)
        .draw(gl.POINTS, this.getCount());

    // Draw obstacles

    this.textures.obstacles.bind(2);
    this.programs.flat.use()
        .attrib('quad', this.buffers.quad, 2)
        .uniformi('background', 2)
        .uniform('color', this.obstacleColor)
        .uniform('worldsize', this.worldSize)
        .draw(gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);

    return this;
};

/**
 * Register with requestAnimationFrame to step and draw a frame.
 * @returns {Particles} this
 */
Particles.prototype.frame = function() {
    window.requestAnimationFrame(function() {
        if (this.running) {
            this.step().draw().frame();
            for (var i = 0; i < this.listeners.length; i++) {
                this.listeners[i]();
            }
            this.tick += 1;
        }
    }.bind(this));

    return this;
};

/**
 * Copy GPU position data back to CPU, return as array.
 * @returns {Array} list of all particle positions
 */
Particles.prototype.get = function() {
    var gl = this.igloo.gl;
    this.framebuffers.step.attach(this.textures.p0);
    var ptexW = this.ptexSize[0], ptexH = this.ptexSize[1];
    var array = new Float32Array(ptexW * ptexH * 4);

    // GPU -> CPU position data
    gl.readPixels(0, 0, ptexW, ptexH, gl.RGBA, gl.FLOAT, array);

    // Return a list of particle position pairs
    var particles = [];
    for (var y = 0; y < ptexH; y++) {
        for (var x = 0; x < ptexW; x++) {
            var i = y * ptexW * 4 + x * 4;
            var px = array[i];
            var py = array[i + 1];
            particles.push({x: px, y: py});
        }
    }
    return particles;
};

/**
 * @returns {number} the current particle count, i.e., the size of
 *                   the physics textures.
 */
Particles.prototype.getCount = function() {
    return this.ptexSize[0] * this.ptexSize[1];
};

/**
 * Allocate array buffers and fill with needed values.
 * @returns {Particles} this
 */
Particles.prototype.initBuffers = function() {
    var ptexW = this.ptexSize[0], ptexH = this.ptexSize[1];
    var gl = this.igloo.gl;

    // Particle index data
    indexes = new Float32Array(ptexW * ptexH * 2);
    for (var y = 0; y < ptexH; y++) {
        for (var x = 0; x < ptexW; x++) {
            var i = y * ptexW * 2 + x * 2;
            indexes[i] = x;
            indexes[i + 1] = y;
        }
    }

    // Push index data to the corresponding array buffer
    this.buffers.indexes.update(indexes, gl.STATIC_DRAW);

    return this;
};

/**
 * Performs initial framebuffer manipulation.
 * @returns {Particles} this
 */
Particles.prototype.initFramebuffers = function() {
    var gl = this.igloo.gl;

    // Set up for obstacles framebuffer

    this.framebuffers.obstacles.bind();
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.worldSize[0], this.worldSize[1]);

    // Clear the obstacle texture
    gl.clearColor(0.5, 0.5, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return this;
};

/**
 * Allocates textures and fills them with initial random state.
 * @returns {Particles} this
 */
Particles.prototype.initTextures = function() {
    var ptexW = this.ptexSize[0], ptexH = this.ptexSize[1];
    var worldW = this.worldSize[0], worldH = this.worldSize[1];
    var pData = new Float32Array(ptexW * ptexH * 4);
    var vData = new Float32Array(ptexW * ptexH * 4);

    // Generate initial data for the physics textures
    for (var y = 0; y < ptexH; y++) {
        for (var x = 0; x < ptexW; x++) {
            // Compute linear index
            var i = y * ptexW * 4 + x * 4;
            // Currently only using the first two channels of each
            // physics texture
            // x position
            px = Math.random() * worldW;
            // y position
            py = Math.random() * worldH;
            // x velocity
            vx = Math.random() - 0.5;
            // y velocity
            vy = Math.random() * 2. - 0.5;

            pData[i] = px;
            pData[i + 1] = py;
            vData[i] = vx;
            vData[i + 1] = vy;
        }
    }

    // Update texture data
    this.textures.p0.set(pData, ptexW, ptexH);
    this.textures.v0.set(vData, ptexW, ptexH);
    this.textures.p1.blank(ptexW, ptexH);
    this.textures.v1.blank(ptexW, ptexH);

    return this;
};

/**
 * Sets a new physics particle count.
 * @param {number} count: new particle count
 * @returns {Particles} this
 */
Particles.prototype.setParticleCount = function(count) {
    // Particle physics data is stored in 2D textures. Since
    // count may not be a perfect square, the actual physics texture
    // size may be slightly larger than the input count
    this.ptexSize = new Float32Array([Math.ceil(Math.sqrt(count)),
                                      Math.floor(Math.sqrt(count))]);
    this.iptexSize = new Float32Array([1. / this.ptexSize[0],
                                       1. / this.ptexSize[1]]);

    // Initialize all textures
    this.initTextures();

    // Initialize all vertex buffers
    this.initBuffers();

    return this;
};

/**
 * Start animating the simulation if it isn't already.
 * @returns {Particles} this
 */
Particles.prototype.start = function() {
    if (!this.running) {
        this.initFramebuffers();
        this.running = true;
        this.frame();
    }
    return this;
};

/**
 * STep the simulation forward one iteration.
 * @returns {Particles} this
 */
Particles.prototype.step = function() {
    var gl = this.igloo.gl;
    gl.disable(gl.BLEND);

    // Update the position texture

    // Bind the new position texture to the step framebuffer
    this.framebuffers.step.attach(this.textures.p1);
    // Bind the textures needed for update calculations to texture
    // locations 0, 1, 2
    this.textures.p0.bind(0);
    this.textures.v0.bind(1);
    this.textures.obstacles.bind(2);
    this.textures.particles.bind(3);
    // Update the framebuffer viewport
    gl.viewport(0, 0, this.ptexSize[0], this.ptexSize[1]);

    // Run the update shader program
    this.programs.update.use()
        .attrib('quad', this.buffers.quad, 2)
        .uniformi('position', 0)
        .uniformi('velocity', 1)
        .uniformi('obstacles', 2)
        .uniformi('oparticles', 3)
        .uniform('random', Math.random() * 2. - 1.)
        .uniform('gravity', this.gravity)
        .uniform('wind', this.wind)
        .uniform('restitution', this.restitution)
        .uniform('worldsize', this.worldSize)
        .uniformi('derivative', 0)
        .uniform('size', this.size)
        .draw(gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);

    // Update the velocity texture

    // Bind the new velocity texture to the step framebuffer
    this.framebuffers.step.attach(this.textures.v1);

    // Update necessary uniform values, then run the update shader
    // program again
    this.programs.update
        .uniformi('derivative', 1)
        .uniform('random', Math.random() * 2. - 1.)
        .draw(gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);

    // Update particle obstacle info

    this.framebuffers.obstacles.attach(this.textures.particles);
    this.framebuffers.obstacles.bind();
    this.textures.p1.bind(0);
    this.textures.v1.bind(1);
    gl.viewport(0, 0, this.worldSize[0], this.worldSize[1]);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.programs.oparticle.use()
        .attrib('index', this.buffers.indexes, 2)
        .uniformi('positions', 0)
        .uniformi('velocities', 1)
        .uniform('iptexsize', this.iptexSize)
        .uniform('iworldsize', this.iworldSize)
        .uniform('size', this.size)
        .uniform('isround', this.isRound)
        .draw(gl.POINTS, this.getCount());

    // Swap front and back physics textures
    this.swap();

    return this;
};

/**
 * Immediately stop the animation.
 * @returns {Particles} this
 */
Particles.prototype.stop = function() {
    this.running = false;
    return this;
};

/**
 * Swap the foreground and background physics textures.
 * @returns {Particles} this
 */
Particles.prototype.swap = function() {
    // Swap position textures
    var tmp = this.textures.p0;
    this.textures.p0 = this.textures.p1;
    this.textures.p1 = tmp;

    // Swap velocity textures
    tmp = this.textures.v0;
    this.textures.v0 = this.textures.v1;
    this.textures.v1 = tmp;

    return this;
};

/**
 * Updates obstacle GPU data.
 * @param {Object} obstacle: Obstacle to draw
 * @returns {Particles} this
 */
Particles.prototype.updateObstacles = function(obstacle) {
    var gl = this.igloo.gl;
    this.framebuffers.obstacles.attach(this.textures.obstacles);
    this.framebuffers.obstacles.bind();
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.worldSize[0], this.worldSize[1]);
    // gl.clearColor(0.5, 0.5, 0, 1);

    if(obstacle.enabled) {
        obstacle.program.use()
            .attrib('vert', obstacle.verts, 2)
            .uniform('position', new Float32Array(obstacle.position))
            .uniform('worldsize', this.worldSize)
            .uniform('size', obstacle.size)
            .draw(obstacle.mode, obstacle.length);
    }
};

