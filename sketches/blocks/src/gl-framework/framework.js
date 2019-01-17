/**
 * This sketch uses a WebGL framework to handle the canvas and rendering of its contents, as well as handle keyboard and
 * mouse input.
 * @constructor
 */
function Framework() {
    // Used for the Framework's initial setup (as opposed to restart setups).
    this.initialized = false;

    // Handle to the canvas.
    this.canvas = null;

    // The App.
    this.app = null;

    // Clip space transform offset vector.
    this.clipOffset = vec2.fromValues(1,1);

    // Aspect ratio transformation matrix.
    this.clipMat = mat2.create();

    // If true, the WebGL OES_texture_float extension was available. False otherwise. Controls how data is represented in
    // textures.
    this.floatTextures = false;

    // Framerate estimate.
    this.fps = 0;
    this.fpsFilter = 30;

    // True if canvas is run in a smaller window on the screen, False if fullscreen.
    this.windowed = false;

    // Size of the logical canvas as a fraction of the displayed canvas.
    this.canvasScale = 0.6;

    // If true, stretch the canvas to fill the window in the x direction.
    this.xStretch = true;
    // If true, stretch the canvas to fill the window in the y direction.
    this.yStretch = true;

    // Canvas window size (in pixels).
    this.xWindow = null;
    this.yWindow = null;


    // Starting time of the framework.
    this.time0 = null;

    // Previous frame's time.
    this.timeLast = null;

    // Current frame's time.
    this.timeNow = null;

    // Time elapsed since simulation start.
    this.dtime = null;

    // Tracks which keys are pressed.
    this.keys = [];

    // Some keys should only have handles triggered on offset and onset: togglables. Track their
    // state in the togglable array.
    this.togglable = [];
    var togglableSize = 256;
    while(togglableSize--) {this.togglable.push(true);}

    // List of the ShaderPrograms used.
    this.shaderPrograms = {};

    // Contains all the data needed to create all the ShaderPrograms.
    this.shaderProgramData = {};

    // ID's of the ShaderPrograms.
    this.shaderProgramID = [];

    // AttributeArrays containing (some, commonly used) shader vertex attribute data.
    this.attributes = {};

    // Shader uniform variable values.
    this.uniforms = {};

    // List of FloatBuffers used in this sketch.
    this.floatBuffers = {};

    // List of PongBuffers used in this sketch.
    this.pongBuffers = {};


}

/**
 * Runs each time the program is restarted. Behavior is slightly different the first time it's called (when
 * initialized = false).
 */
Framework.prototype.restart = function() {
    // If not initialized already
    if(!this.initialized) {
        // Get a handle to the canvas.
        this.canvas = $('#canvas');
    }

    // Setup the canvas.
    this.resizeCanvas();

    // Initialize the necessary WebGL elements.
    this.initGL();

    // Initialize the application.
    this.initApp();

    // Initialization time of the Framework.
    this.time0 = new Date().getTime();
    // Times at current and previous frames.
    this.timeLast = this.time0;
    this.timeNow = this.time0;

    // First-time setup.
    if(!this.initialized) {
        // Set key press handlers.
        document.onkeydown = this.handleKeyDown;
        document.onkeyup = this.handleKeyUp;

        // jQuery event handler setup.
        $(window).resize(restart);

        // FPS write update interval.
        setInterval(this.writeFPS, 500);
        this.initialized = true;
        this.tick();
    }
};

/**
 * Sets the canvas size nd updates the Framework's width and height variables.
 */
Framework.prototype.resizeCanvas = function() {
    // Canvas corner positions in the window.
    var cleft, ctop, cwidth, cheight;
    // Strings of those corner positions, for tossing into CSS.
    var $cleft, $ctop, $cwidth, $cheight;

    // Size of the usable window.
    cwidth = window.innerWidth;
    cheight = window.innerHeight;

    if(this.xStretch && this.yStretch) {
        // Fullscreen.

        this.xWindow = Math.ceil(this.canvasScale * cwidth);
        this.yWindow = Math.ceil(this.canvasScale * cheight);

        cleft = 0;
        ctop = 0;

    } else if(this.yStretch) {
        // Half-screen, stretched in y direction.

        this.xWindow = this.yWindow = Math.ceil(this.canvasScale * cheight);

        cleft = Math.floor((cwidth - cheight) / 2);
        ctop = 0;
        cwidth = cheight;

    } else if(this.xStretch) {
        // Half-screen, stretched in x direction.

        this.xWindow = this.yWindow = Math.ceil(this.canvasScale * cwidth);

        cleft = 0;
        ctop = Math.floor((cheight - cwidth) / 2);
        cheight = cwidth;

    } else {
        // Windowed.

        this.xWindow = this.yWindow = Math.ceil(this.canvasScale * Math.min(cwidth, cheight));

        cleft = Math.floor((cwidth - this.xWindow) / 2);
        ctop = Math.floor((cheight - this.yWindow) / 2);
        cwidth = this.xWindow;
        cheight = this.yWindow;

    }

    this.canvas.width = this.xWindow;
    this.canvas.height = this.yWindow;

    // Convert values to strings, add 'px' as needed.
    $cleft = cleft.toString() + 'px';
    $ctop = ctop.toString() + 'px';
    $cwidth = cwidth.toString() + 'px';
    $cheight = cheight.toString() + 'px';

    // Set up canvas CSS.
    this.canvas.css({'left': $cleft, 'top': $ctop, 'width': $cwidth, 'height': $cheight});

    // Delay setting until now to avoid a spurious border before startup.
    this.canvas.css({'border': '1px solid #222222'});

    // Set up WebGL aspect ratio transform
    this.clipMat[0] = 2 / this.xWindow;
    this.clipMat[3] = 2 / this.yWindow;

    // Texture size for window-sized buffers.
    // Choose the nearest powers of 2 larger than the window dimensions.
    this.xTexture = npot(this.xWindow);
    this.yTexture = npot(this.yWindow);


};

/**
 * Controls initialization of objects and data associated with WebGL.
 */
Framework.prototype.initGL = function() {
    gl = this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl");
    //gl = WebGLDebugUtils.makeDebugContext(gl);

    // Get the WebGL extension allowing for float texture data.
    var ext = gl.getExtension('OES_texture_float');

    // Record whether the extension is available.
    this.floatTextures = (ext != null);

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    //gl.blendEquation(gl.FUNC_SUBTRACT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
};

/**
 * Handles key press events.
 * @param {KeyboardEvent} e
 */
Framework.prototype.handleKeyDown = function(e) {
    this.keys[e.keyCode] = true;
};

/**
 * Handles key release events.
 * @param {KeyboardEvent} e
 */
Framework.prototype.handleKeyUp = function(e) {
    this.keys[e.keyCode] = false;
    this.togglable[e.keyCode] = true;
};

/**
 * Handles input from the page's radio buttons that control visual quality.
 */
Framework.prototype.handleQualityChange = function() {
    // Quality radio button value.
    var quality = $('input[name="q1"]:checked').val();
    // Canvas size radio button value.
    var canvassize = $('input[name="q2"]:checked').val();

    // Set the canvas scale based on the quality setting.
    if(quality === 'low') {
        this.canvasScale = 0.3;
    } else if(quality === 'medium') {
        this.canvasScale = 0.6;
    } else if(quality === 'high') {
        this.canvasScale = 0.8;
    } else if(quality === 'best') {
        this.canvasScale = 1;
    }

    // Determine which directions to stretch the canvas in.
    this.xStretch = false;
    this.yStretch = false;
    if(canvassize === 'half') {
        // Half-screen. Stretch in the window direction that is most narrow.

        if(window.innerWidth >= window.innerHeight) {
            this.yStretch = true;
        } else {
            this.xStretch = true;
        }

    } else if(canvassize === 'full') {
        // Fullscreen.

        xStretch = yStretch = true;
    }

    this.restart();
};

/**
 * Initializes the App this Framework runs.
 */
Framework.prototype.initApp = function() {

    // Create the App.
    if(!this.initialized) {
        this.app = new App();
    }

    // Setup.
    this.app.restart();
};

/**
 * Stops the App.
 */
Framework.prototype.stopApp = function() {
    this.app.stop();
};