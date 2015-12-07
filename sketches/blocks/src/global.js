/**
 * Contains the declarations of all global variables.
 */

// Constants:
var PI = Math.PI;
var TPI = 2 * Math.PI;
var SQRT2 = 1.414214;
var ISQRT2 = 0.707107;
// Clip space transform offset vector.
//const clipOffset = vec2.fromValues(1, 1);
// Size of the Tiles in pixels.
var tileSize = 16; // give to World.
var iTileSize = 1/tileSize; // give to World.

// The Framework used for this sketch.
var tf = Framework();

// The WebGL context used for this sketch.
var gl;

// True for the first startup, slightly modifies what the restart() function does.
//var firstTime; // given to Framework

// Current framerate estimate.
//var fps = 0; // give to Framework
// Framerate estimate smoothing factor.
//var fpsFilter = 30; // give to Framework

// World global variables. //////////

// The canvas.
//var canvas = $('#canvas'); // given to Framework.

// width and height of the world, in Tiles.
var xTile, yTile; // give to World.

// width and height of the world, in pixels.
var xWorld, yWorld; // give to World

// Aspect ratio transformation matrix.
//var clipMat = mat2.create();

// If true, the WebGL OES_texture_float extension was available. False otherwise. Controls how data is represented in
// textures.
//var floatTextures;

// Heat caps for the float and integer heat ranges. Total range of possible values is [-*MaxHeat, *MaxHeat].
var fMaxHeat = 100000; // give to World.
var iMaxHeat = 128; // give to World.
// Value that ends up being used in a particular program instance.
var maxHeat; // give to World.

// Time increment used for each frame.
//var dt = 0.1; // give to App.

// True if canvas is run in a smaller window on the screen, False if fullscreen (full browser window really).
//var windowed = true; // give to Framework.

// Size of the logical canvas as a fraction of the displayed canvas.
//var canvasScale = 0.6; // give to Framework.

// If true, stretch the canvas to fill the window in the x direction.
//var xStretch = true; // give to Framework
// If true, stretch the canvas to fill the window in the y direction.
//var yStretch = true;

// Starting time of the simulation.
//var time0;

// Previous frame's time.
//var timeLast;

// Current time.
//var timeNow;

// Time elapsed since simulation start.
//var dtime = 0;

// User input global variables //////////

// Tracks which keys are pressed.
//var keys = [];
// Some keys should only have handles triggered on offset and onset: togglables. Track their
// state in the togglable array.
//var togglable = [];
// Initialize togglables to hold togglableSize true values.
//var togglableSize = 256;
//while(togglableSize--){togglable.push(true);}

// WebGL-related global variables //////////

// The canvas' WebGL context.
//var gl;

// List of the ShaderPrograms used.
//var shaderPrograms;

// ShaderProgram data. Add new ShaderPrograms by entering their information into shaderProgramData below in
// initShaderPrograms().
//var shaderProgramData; // give to Framework

// ID's of the ShaderPrograms used.
//var shaderProgramID;

// AttributeArrays containing (some, commonly used) shader vertex attribute data. Initialized in initAttributes() below.
//var attributes;

// Shader uniform variable values. Initialized in initUniforms() below.
//var uniforms;

// List of FloatBuffers used in this sketch. Add new FloatBuffers in initFloatBuffers() below.
//var floatBuffers = {};

// List of PongBuffers used in this sketch (2 FloatBuffers updated in ping-pong fashion).
// Add new PongBuffers in initPongBuffers() below.
//var pongBuffers = {};

// Entity global variables //////////

// Global maximum entity velocity and acceleration. Can be overriden for individual entities.
var vmax = 10; // give to World
var amax = 5; // give to World

// Enumeration of eight directions.
var DirEnum = {
    UP: 0,
    UPRIGHT: 1,
    RIGHT: 2,
    DOWNRIGHT: 3,
    DOWN: 4,
    DOWNLEFT: 5,
    LEFT: 6,
    UPLEFT: 7
};

// The EntityList holding all the world's Entities.
var entities; // give to World

// The player.
var player; // give to World
// Player half-width.
var phwidth = 10; // give to World
// Player half-height
var phheight = 16; // give to World

// Tile global variables //////////

// Enumeration of the Tile types
var TileEnum = { // give to World
    AIR: 0,
    STONE: 1,
    DIRT: 2,
    SLOWAIR: 3
};

// TileArray containing all Tiles on the screen.
var tiles; // give to World