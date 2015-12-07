/**
 * Initializes certain commonly-used AttributeArrays, currently just a_screenposition containing vertex data for a
 * rectangle used in several full-canvas fragment shaders.
 */
//function initAttributes() {
//    attributes = {
//        a_screenposition: new AttributeArray('a_position', 4, 2, false)
//    };
//
//    // Set screen vertex position data.
//    attributes.a_screenposition.data = new Float32Array([-1,-1,-1,1,1,-1,1,1]);
//    attributes.a_screenposition.toBuffer(true, 8);
//}

/**
 * Initializes all the uniform variables used by the vertex shaders.
 */
//function initUniforms() {
//    uniforms = {
//        // Full-canvas texel ds and dt sizes, in world coordinates.
//        u_dst: {glvar: 'u_dst', data: [1/ xWorld, 1 / yWorld], type: gl.FLOAT_VEC2},
//        // Tile-space texel ds and dt sizes, in world coordinates.
//        u_dstsmall: {glvar: 'u_dstsmall', data: [1 / xTile, 1 / yTile], type: gl.FLOAT_VEC2},
//        // Width (and height) of each Tile, in world coordinates.
//        //u_tilesize: {glvar: 'u_tilesize', data: tileSize, type: gl.FLOAT},
//        // One over the width (and height) of each Tile, in world coordinates.
//        u_itilesize: {glvar: 'u_itilesize', data: iTileSize, type: gl.FLOAT},
//        // Size of the world.
//        u_windowsize: {glvar: 'u_windowsize', data: [xWorld, yWorld], type: gl.FLOAT_VEC2},
//        // Time since the sketch began.
//        u_time: {glvar: 'u_time', data: 0, type: gl.FLOAT},
//        // Sampler for the full heat heat texture.
//        s_heat: {glvar: 's_heat', data: 0, type: gl.INT},
//        // Sampler for the Tile heat texture.
//        s_tileheat: {glvar: 's_tileheat', data: 1, type: gl.INT},
//        // Sampler for the Entity heat texture.
//        s_entityheat: {glvar: 's_entityheat', data: 2, type: gl.INT},
//        // Sampler for the drawn Tiles texture.
//        s_drawtiles: {glvar: 's_drawtiles', data: 3, type: gl.INT},
//        // Sampler for the small Tile texture that gets read back to the CPU.
//        s_tilesmall: {glvar: 's_tilesmall', data: 4, type: gl.INT}
//    };
//}

/**
 * Initializes the FloatBuffers used in this program.
 */
//function initFloatBuffers() {
//    floatBuffers.entity = new FloatBuffer(xWorld, yWorld, 'entity');
//    floatBuffers.tileheat = new FloatBuffer(xWorld, yWorld, 'tileheat');
//    floatBuffers.drawtiles = new FloatBuffer(xWorld, yWorld, 'drawtiles');
//
//    // Clear the tileheat framebuffer since it isn't cleared each frame.
//    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.tileheat.framebuffer);
//    gl.viewport(0, 0, xWorld, yWorld);
//    gl.clearColor(0, 0, 0, 0);
//    gl.clear(gl.COLOR_BUFFER_BIT);
//
//    // Texture location for FloatBuffers defined here are assigned statically.
//    gl.activeTexture(gl.TEXTURE1);
//    gl.bindTexture(gl.TEXTURE_2D, floatBuffers.tileheat.texture);
//    gl.activeTexture(gl.TEXTURE2);
//    gl.bindTexture(gl.TEXTURE_2D, floatBuffers.entity.texture);
//    gl.activeTexture(gl.TEXTURE3);
//    gl.bindTexture(gl.TEXTURE_2D, floatBuffers.drawtiles.texture);
//}

/**
 * Initializes the PongBuffers used in this program.
 */
//function initPongBuffers() {
//    pongBuffers.heat = new PongBuffer(xWorld, yWorld, 'heat');
//    pongBuffers.tilesmall = new PongBuffer(xTile, yTile, 'tilesmall');
//}

/**
 * Initializes the ShaderPrograms used in this program. Add new ShaderPrograms here.
 */
//function initShaderPrograms() {
//    // Contains all the data needed to create all the ShaderPrograms. Add new ShaderPrograms as entries in this list.
//    shaderProgramData = {
//        tileheat: {
//            shaders: ['tileheat.frag', 'tileheat.vert'],
//            drawType: gl.TRIANGLES,
//            attributes: [tiles.attributes.a_position, tiles.attributes.a_heat],
//            uniforms: []
//        },
//
//        diffuseheat: {
//            shaders: ['diffuse.frag', 'drawscreen.vert'],
//            drawType: gl.TRIANGLE_STRIP,
//            attributes: [attributes.a_screenposition],
//            uniforms: ['u_dst', 's_heat', 's_tileheat', 's_entityheat']
//        },
//
//        tilesmall: {
//            shaders: ['tilesmall.frag', 'drawscreen.vert'],
//            drawType: gl.TRIANGLE_STRIP,
//            attributes: [attributes.a_screenposition],
//            uniforms: ['u_dstsmall', 'u_dst', 's_heat', 's_tilesmall']
//        },
//
//        entityheat: {
//            shaders: ['tileheat.frag', 'tileheat.vert'],
//            drawType: gl.TRIANGLES,
//            attributes: [entities.attributes.a_position, entities.attributes.a_heat],
//            uniforms: []
//        },
//
//        drawtiles: {
//            shaders: ['drawtiles.frag', 'drawtiles.vert'],
//            drawType: gl.TRIANGLES,
//            attributes: [tiles.attributes.a_position, tiles.attributes.a_color, tiles.attributes.a_heat],
//            uniforms: []
//        },
//
//        drawheat: {
//            shaders: ['drawheat.frag', 'drawscreen.vert'],
//            drawType: gl.TRIANGLE_STRIP,
//            attributes: [attributes.a_screenposition],
//            uniforms: ['u_dst', 'u_windowsize', 'u_time', 's_heat']
//        },
//
//        drawentities: {
//            shaders: ['drawtiles.frag', 'drawtiles.vert'],
//            drawType: gl.TRIANGLES,
//            attributes: [entities.attributes.a_position, entities.attributes.a_color, entities.attributes.a_heat],
//            uniforms: []
//        }
//    };
//
//    // Object containing all of the ShaderPrograms.
//    shaderPrograms = {};
//    // IDs of the ShaderPrograms are just the entry keys in ShaderProgramData.
//    shaderProgramID = Object.keys(shaderProgramData);
//    for(var i=0; i<shaderProgramID.length; i++) {
//        shaderPrograms[shaderProgramID[i]] = new ShaderProgram(shaderProgramID[i]);
//    }
//}