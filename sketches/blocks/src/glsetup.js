// The canvas' WebGL context.
var gl;

// Width and height of the canvas.
var xCanvas, yCanvas;

// List of the ShaderPrograms used.
var shaderPrograms;

// ID's of the ShaderPrograms used. Add new programs by ID here.
var shaderProgramID = ['tilemaps', 'diffuseheat', 'diffusemagic', 'tilesmall', 'entitymaps', 'drawtiles', 'rendermaps', 'rendertiles', 'renderentities'];

// Fragment/vertex shader pairs for each ShaderProgram.
var shaderPairs = {
    tilemaps: ['tilemaps.frag', 'tilemaps.vert'],
    diffuseheat: ['diffuse.frag', 'drawscreen.vert'],
    diffusemagic: ['diffuse.frag', 'drawscreen.vert'],
    tilesmall: ['tilesmall.frag', 'drawscreen.vert'],
    entitymaps: ['tilemaps.frag', 'tilemaps.vert'],
    drawtiles: ['drawtiles.frag', 'drawtiles.vert'],
    rendermaps: ['rendermaps.frag', 'drawscreen.vert'],
    rendertiles: ['rendertiles.frag', 'drawscreen.vert'],
    renderentities: ['renderentities.frag', 'renderentities.vert']
};

// Shader program uniform and attribute variables.
var shaderVars;


// Arrays containing (some, commonly used) shader vertex attribute data. Initialized in initAttributes() below.
var attributes;

// Shader uniform variable values. Initialized in initUniforms() below.
var uniforms;

// List of FloatBuffers used in this sketch. Add new FloatBuffers in initFloatBuffers() below.
var floatBuffers = {};

// List of PongBuffers used in this sketch (2 FloatBuffers updated in ping-pong fashion).
// Add new PongBuffers in initPongBuffers() below.
var pongBuffers = {};

// -------------------------------------------------------------------------------------------------------------------//
function initAttributes() {
    attributes = {
        a_screenxy: new AttributeArray('a_position', 4, 2, false)
    };

    // Set screen vertex position data.
    attributes.a_screenxy.data = new Float32Array([-1,-1,-1,1,1,-1,1,1]);
    attributes.toBuffer(true, 8);
}

// -------------------------------------------------------------------------------------------------------------------//
function initUniforms() {
    uniforms = {
        u_dst: {glvar: 'u_dst', data: [1/ xWorld, 1 / yWorld], type: gl.FLOAT_VEC2},
        u_dst_tiles: {glvar: 'u_dst_tiles', data: [iTileSize / xTile, iTileSize / yTile], type: gl.FLOAT_VEC2},
        u_tilesize: {glvar: 'u_tilesize', data: tileSize, type: gl.FLOAT},
        u_itilesize: {glvar: 'u_itilesize', data: iTileSize, type: gl.FLOAT},
        u_idxheat: {glvar: 'u_idxcdct', data: 0, type: gl.INT},
        u_idxmagic: {glvar: 'u_idxcdct', data: 2, type: gl.INT},
        s_heat: {glvar: 's_map', data: 0, type: gl.INT},
        s_magic: {glvar: 's_map', data: 1, type: gl.INT},
        s_tilemaps: {glvar: 's_tilemap', data: 2, type: gl.INT},
        s_entitymaps: {glvar: 's_entitymap', data: 3, type: gl.INT},
        s_drawtiles: {glvar: 's_drawtiles', data: 4, type: gl.INT},
        s_tilesmall: {glvar: 's_tilesmall', data: 5, type: gl.INT}
    };
}

// -------------------------------------------------------------------------------------------------------------------//
function initShaderVars() {
    shaderVars = {
        tilemaps: {
            drawType: gl.TRIANGLES,
            attributes: [tiles.attributes.a_xy, tiles.attributes.a_maps],
            uniforms: []
        },

        diffuseheat: {
            drawType: gl.TRIANGLE_STRIP,
            attributes: [attributes.a_screenxy],
            uniforms: ['u_dst', 'u_idxheat', 's_heat', 's_tilemaps', 's_entitymaps']
        },

        diffusemagic: {
            drawType: gl.TRIANGLE_STRIP,
            attributes: [attributes.a_screenxy],
            uniforms: ['u_dst', 'u_idxmagic', 's_magic', 's_tilemaps', 's_entitymaps']
        },

        tilesmall: {
            drawType: gl.TRIANGLE_STRIP,
            attributes: [attributes.a_screenxy],
            uniforms: ['u_dst', 'u_tilesize', 's_heat', 's_magic', 's_tilesmall']
        },

        entitymaps: {
            drawType: gl.TRIANGLES,
            attributes: [entities.attributes.a_xy, entities.attributes.a_maps],
            uniforms: []
        },

        drawtiles: {
            drawType: gl.TRIANGLES,
            attributes: [tiles.attributes.a_xy, tiles.attributes.a_color],
            uniforms: ['u_dst_tiles', 's_tilesmall']
        },

        rendermaps: {
            drawType: gl.TRIANGLE_STRIP,
            attributes: [attributes.a_screenxy],
            uniforms: ['u_dst', 's_heat', 's_magic']
        },

        rendertiles: {
            drawType: gl.TRIANGLE_STRIP,
            attributes: [attributes.a_screenxy],
            uniforms: ['u_dst', 's_drawtiles']
        },

        renderentities: {
            drawType: gl.TRIANGLES,
            attributes: [entities.attributes.a_xy, entities.attributes.a_color, entities.attributes.a_maps],
            uniforms: []
        }
    };
}

// -------------------------------------------------------------------------------------------------------------------//
function initFloatBuffers() {
    floatBuffers.entity = new FloatBuffer(xWorld, yWorld, 'entity');
    floatBuffers.tilemaps = new FloatBuffer(xWorld, yWorld, 'tilemaps');
    floatBuffers.drawtiles = new FloatBuffer(xWorld, yWorld, 'drawtiles');
    //floatBuffers.tilesmall = new FloatBuffer(xTile, yTile, 'tilesmall');

    // Clear the tilemaps framebuffer since it isn't cleared each frame.
    gl.bindFramebuffer(floatBuffers.tilemaps.fb);
    gl.viewport(0, 0, xWorld, yWorld);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Texture location for FloatBuffers defined here are assigned statically.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, floatBuffers.tilemaps.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, floatBuffers.entity.tex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, floatBuffers.drawtiles.tex);
}

// -------------------------------------------------------------------------------------------------------------------//
function initPongBuffers() {
    pongBuffers.heat = new PongBuffer(xWorld, yWorld, 'maps');
    pongBuffers.magic = new PongBuffer(xWorld, yWorld, 'magic');
    pongBuffers.tilesmall = new PongBuffer(xWorld, yWorld, 'tilesmall');
}

// -------------------------------------------------------------------------------------------------------------------//
function initShaderPrograms() {
    for(var i=0; i<shaderProgramID.length; i++) {
        shaderPrograms[shaderProgramID[i]] = new ShaderProgram(shaderProgramID[i]);
    }
}

// Aspect ratio transformation matrix.
var clipMat = mat2.create();
const clipOffset = vec2.fromValues(1, 1);
// -------------------------------------------------------------------------------------------------------------------//
function clipSpace(vecWorld) {
    // Converts a 2D coordinate vector from canvas space [0, worldX]x[0, worldY] into clip space
    // [-1, 1]x[-1, 1].

    // Input vector, in clip space.
    var vecClip = vec2.create();

    // Multiply by the aspect ratio transformation and subtract 1.
    vec2.transformMat2(vecClip, vecWorld, clipMat);
    vec2.subtract(vecClip, vecClip, clipOffset);

    return vecClip;
}

// -------------------------------------------------------------------------------------------------------------------//
function clipSpace2(vecWorldX, vecWorldY) {
    // Converts a pair of x and y coordinates from canvas space to a vec2 in clip space.
    var vecWorld = vec2.fromValues(vecWorldX, vecWorldY);
    return clipSpace(vecWorld);
}