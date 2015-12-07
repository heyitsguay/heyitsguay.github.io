/**
 * Main class for the application that this sketch runs.
 * @constructor
 */
function App() {
    // The world currently loaded.
    this.world = null;

    // Time increment used for each frame's update.
    this.dt = 0.1;

    // The function restart() might need to behave differently the
    // first time it is called, during initialization.
    this.initialized = false;

    this.keepRunning = false;
}

/**
 * Starts or restarts the App.
 */
App.prototype.restart = function() {
    // Load and setup a (currently just the one single) World.
    this.loadWorld();

    if(!this.initialized) {
        // Not initialized yet. Load necessary GL stuff
        // AttributeArrays, Uniforms, FloatBuffers, PongBuffers, ShaderPrograms.

        this.initAttributes();
        this.initFloatBuffers();
        this.initPongBuffers();
        this.initShaderPrograms();

        // Player needs to inherit from the Entity class. Probably not the best way to establish that but it'll do?
        Player.prototype = new Entity();
    }

    // Reinitialize every time.
    this.initUniforms();

    // App should run now.
    this.keepRunning = true;
    this.tick();

    // Mark the App as initialized.
    if(!this.initialized) {
        this.initialized = true;
    }
};

/**
 * Loads a World into the App.
 */
App.prototype.loadWorld = function() {

};

/**
 * Controls each frame of the sketch.
 */
App.prototype.tick = function() {
    // Set tick() as the animation callback.
    if(this.keepRunning) {
        requestAnimationFrame(this.tick());
    }

    // Update timekeeping variables.
    tf.updateTime();

    // Update fps calculation.
    tf.updateFPS();

    // App update function.
    this.update();

    // App draw function.
    this.draw();
};

/**
 * App update function.
 */
App.prototype.update = function() {
    // Update the World.
    this.world.update();
};

/**
 * App draw function.
 */
App.prototype.draw = function() {

    // Draw the World's heat content
    this.world.drawHeat();

    // Bind the heat texture. Additional texture bindings are defined statically in TODO: add this.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tf.pongBuffers.heat.readBuffer().texture);

    // Perform diffusion on the heat map.
    gl.bindFramebuffer(gl.FRAMEBUFFER, tf.pongBuffers.heat.writeBuffer().framebuffer);

    // Viewport setup. Heat buffer always covers just the window.
    gl.viewport(0, 0, tf.xTexture, tf.yTexture);

    // Heat map shifts a [-1,1] interval to [0,1], so 0 gets translated to 0.5.
    gl.clearColor(0.5, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Prepare the diffuseheat shader program.
    tf.shaderPrograms.diffuseheat.prep();

    // Draw to texture.
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Toggle the heat map's PongBuffer.
    tf.pongBuffers.heat.toggle();

    // Bind the new heat readBuffer to gl.TEXTURE0.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tf.pongBuffers.heat.readBuffer().texture);

    // Render the World's updated heat map to the window.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, tf.xWindow, tf.yWindow);

    // This is the first stage of screen rendering, so clear the screen.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Prepare the drawheat ShaderProgram.
    shaderPrograms.drawheat.prep();

    // Render texture to window.
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Render the World.
    this.world.render();

    // Pull subsampled Tile heat data back to the CPU.
    this.world.getTileHeat(gl.TEXTURE4);
};

/**
 * Initializes certain commonly-used AttributeArrays, currently just a_screenposition containing vertex data for a
 * rectangle used in several full-canvas fragment shaders.
 */
App.prototype.initAttributes = function() {
    tf.attributes = {
        a_screenposition: new AttributeArray('a_position', 4, 2, false)
    };

    // Set screen vertex position data.
    tf.attributes.a_screenposition.data = new Float32Array([-1,-1,-1,1,1,-1,1,1]);
    tf.attributes.a_screenposition.toBuffer(true, 8);
};

/**
 * Initializes all the uniform variables used by the vertex shaders.
 */
App.prototype.initUniforms = function() {
    tf.uniforms = {
        // Full-canvas texel ds and dt sizes, in world coordinates.
        u_dst: {glvar: 'u_dst', data: [1 / tf.xTexture, 1 / tf.yTexture], type: gl.FLOAT_VEC2},
        // Tile-space texel ds and dt sizes, in world coordinates.
        u_dstsmall: {glvar: 'u_dstsmall', data: [1 / this.world.xScreenTiles, 1 / this.world.yScreenTiles], type: gl.FLOAT_VEC2},
        // Width (and height) of each Tile, in world coordinates.
        //u_tilesize: {glvar: 'u_tilesize', data: tileSize, type: gl.FLOAT},
        // One over the width (and height) of each Tile, in world coordinates.
        u_itilesize: {glvar: 'u_itilesize', data: this.world.iTileSize, type: gl.FLOAT},
        // Size of the texture window.
        u_windowsize: {glvar: 'u_windowsize', data: [tf.xTexture, tf.yTexture], type: gl.FLOAT_VEC2},
        // Time since the sketch began.
        u_time: {glvar: 'u_time', data: 0, type: gl.FLOAT},
        // Sampler for the full heat heat texture.
        s_heat: {glvar: 's_heat', data: 0, type: gl.INT},
        // Sampler for the Tile heat texture.
        s_tileheat: {glvar: 's_tileheat', data: 1, type: gl.INT},
        // Sampler for the Entity heat texture.
        s_entityheat: {glvar: 's_entityheat', data: 2, type: gl.INT},
        // Sampler for the drawn Tiles texture.
        s_drawtiles: {glvar: 's_drawtiles', data: 3, type: gl.INT},
        // Sampler for the small Tile texture that gets read back to the CPU.
        s_tilesmall: {glvar: 's_tilesmall', data: 4, type: gl.INT}
    };
};

/**
 * Initializes the FloatBuffers used by the App.
 */
App.prototype.initFloatBuffers = function() {
    tf.floatBuffers = {
        entity: new FloatBuffer(tf.xTexture, tf.yTexture, 'entity'),
        tileheat: new FloatBuffer(tf.xTexture, tf.yTexture, 'tileheat'),
        drawtiles: new FloatBuffer(tf.xTexture, tf.yTexture, 'drawtiles')
    };

    // Clear the tileheat framebuffer since it isn't cleared each frame.
    gl.bindFramebuffer(gl.FRAMEBUFFER, tf.floatBuffers.tileheat.framebuffer);
    gl.viewport(0, 0, tf.xTexture, tf.yTexture);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Texture location for FloatBuffers defined here are assigned once and never changed.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tf.floatBuffers.tileheat.texture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tf.floatBuffers.entity.texture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, tf.floatBuffers.drawtiles.texture);
};

/**
 * Initializes the PongBuffers used by the App.
 */
App.prototype.initPongBuffers = function() {
    tf.pongBuffers = {
        heat: new PongBuffer(tf.xTexture, tf.yTexture, 'heat'),
        tilesmall: new PongBuffer(this.world.xScreenTiles, this.world.yScreenTiles, 'tilesmall')
    };
};

/**
 * Initializes the ShaderPrograms used in this program. Add new ShaderPrograms here.
 */
App.prototype.initShaderPrograms = function() {
    tf.shaderProgramData = {
        tileheat: {
            shaders: ['tileheat.frag', 'tileheat.vert'],
            drawType: gl.TRIANGLES,
            attributes: [this.world.tiles.attributes.a_position, this.world.tiles.attributes.a_heat],
            uniforms: []
        },

        diffuseheat: {
            shaders: ['diffuse.frag', 'drawscreen.vert'],
            drawType: gl.TRIANGLE_STRIP,
            attributes: [tf.attributes.a_screenposition],
            uniforms: ['u_dst', 's_heat', 's_tileheat', 's_entityheat']
        },

        tilesmall: {
            shaders: ['tilesmall.frag', 'drawscreen.vert'],
            drawType: gl.TRIANGLE_STRIP,
            attributes: [tf.attributes.a_screenposition],
            uniforms: ['u_dstsmall', 'u_dst', 's_heat', 's_tilesmall']
        },

        entityheat: {
            shaders: ['tileheat.frag', 'tileheat.vert'],
            drawType: gl.TRIANGLES,
            attributes: [this.world.entities.attributes.a_position, this.world.entities.attributes.a_heat],
            uniforms: []
        },

        drawtiles: {
            shaders: ['drawtiles.frag', 'drawtiles.vert'],
            drawType: gl.TRIANGLES,
            attributes: [this.world.tiles.attributes.a_position, this.world.tiles.attributes.a_color, this.world.tiles.attributes.a_heat],
            uniforms: []
        },

        drawheat: {
            shaders: ['drawheat.frag', 'drawscreen.vert'],
            drawType: gl.TRIANGLE_STRIP,
            attributes: [tf.attributes.a_screenposition],
            uniforms: ['u_dst', 'u_windowsize', 'u_time', 's_heat']
        },

        drawentities: {
            shaders: ['drawtiles.frag', 'drawtiles.vert'],
            drawType: gl.TRIANGLES,
            attributes: [this.world.entities.attributes.a_position, this.world.entities.attributes.a_color, this.world.entities.attributes.a_heat],
            uniforms: []
        }
    };

    // Get the names of each of the elements of shaderProgramData.
    tf.shaderProgramID = Object.keys(tf.shaderProgramData);

    // Compile and set up the shaders.
    for(var i=0; i<tf.shaderProgramID.length; i++) {
        tf.shaderPrograms[tf.shaderProgramID[i]] = new ShaderProgram(tf.shaderProgramID[i]);
    }
};

/**
 * Stop the App from running.
 */
App.prototype.stop = function() {
    this.keepRunning = false;
};
