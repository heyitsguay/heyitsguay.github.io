/**
 * Runs at program initialization.
 */
function startup() {
    firstTime = true;

    restart();
}

/**
 * Runs each time the program is restarted. Behavior is slightly different the first time it is run (when
 * firstTime==true).
 */
function restart() {
    canvas = document.getElementById("canvas");
    resizeCanvas();
    initGL();
    initTiles();
    initEntities();
    // Initialize all ShaderPrograms.
    initShaderPrograms();

    time0 = new Date().getTime();
    timeLast = timeNow = time0;

    if(firstTime) {
        document.onkeydown = handleKeyDown;
        document.onkeyup = handleKeyUp;
        // jQuery event handler setup.
        $(window).resize(restart);
        setInterval(writeFPS, 500);
        firstTime = false;
        tick();
    }
}

/**
 * Sets the canvas size and updates the world width and height variables.
 */
function resizeCanvas() {
    // Canvas corner positions in the window.
    var cleft, ctop, cwidth, cheight;
    // Strings of those corner positions, for tossing into CSS.
    var $cleft, $ctop, $cwidth, $cheight;

    // Size of the usable window.
    var xWindow;
    var yWindow;

    cwidth = window.innerWidth;
    cheight = window.innerHeight;

    if(xStretch && yStretch) {
        // Fullscreen.
        xWindow = Math.ceil(canvasScale * cwidth);
        yWindow = Math.ceil(canvasScale * cheight);

        cleft = 0;
        ctop = 0;
    } else if(yStretch) {
        // Half-screen, stretched in y direction.
        xWindow = yWindow = Math.ceil(canvasScale * cheight);

        cleft = Math.floor((cwidth - cheight) / 2);
        ctop = 0;
        cwidth = cheight;
    } else if(xStretch) {
        // Half-screen, stretched in x direction.
        xWindow = yWindow = Math.ceil(canvasScale * cwidth);

        cleft = 0;
        ctop = Math.floor((cheight - cwidth) / 2);
        cheight = cwidth;
    } else {
        // Windowed.
        xWindow = yWindow = Math.ceil(canvasScale * Math.min(cwidth, cheight));

        cleft = Math.floor((window.innerWidth - xWindow) / 2);
        ctop = Math.floor((window.innerHeight - yWindow) / 2);
        cwidth = xWindow;
        cheight = yWindow;
    }

    canvas.width = xWindow;
    canvas.height = yWindow;

    // Convert values to strings, add 'px' as needed.
    $cleft = cleft.toString() + 'px';
    $ctop = ctop.toString() + 'px';
    $cwidth = cwidth.toString() + 'px';
    $cheight = cheight.toString() + 'px';

    // Modify the relevant canvas CSS properties.
    $(canvas).css({'left': $cleft, 'top': $ctop, 'width': $cwidth, 'height': $cheight});
    // Delay setting until now to avoid a spurious border before startup.
    $(canvas).css({'border': '1px solid #222222'});

    // Size of the world in Tile coordinates (number of Tiles on-canvas).
    xTile = Math.ceil(xWindow / tileSize);
    yTile = Math.ceil(yWindow / tileSize);
    // Size of the world in world coordinates (number of pixels on-canvas).
    xWorld = tileSize * xTile;
    yWorld = tileSize * yTile;

    // An aspect ratio transform is necessary when drawing with WebGL to convert
    // from world space to clip space. Setting xWorld and yWorld determines this
    // transform.
    clipMat[0] = 2 / xWorld;
    clipMat[3] = 2 / yWorld;

    // Set canvas width and height to coincide with xWorld and yWorld.
    canvas.width = xWorld;
    canvas.height = yWorld;
}

/**
 * Controls initialization of all the Objects and data associated with WebGL processes.
 */
function initGL() {
    // Create a WebGL context for the canvas.
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    gl = WebGLDebugUtils.makeDebugContext(gl);//, undefined, logAndValidate);
    // Get the WebGL extension allowing for float texture data.
    var ext = gl.getExtension('OES_texture_float');
    // If the extension is not available, we'll use the much smaller heat range allowed by uint8 textures.
    floatTextures = (ext != null);
    // Set the maxHeat value.
    maxHeat = floatTextures? fMaxHeat : iMaxHeat;

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.blendEquation(gl.FUNC_SUBTRACT);
    gl.blendFunc(gl.SRC_ALPHA, gl.SRC_ALPHA);


    // Initialize attribute variable data.
    initAttributes();
    // Initialize uniform variable data.
    initUniforms();
    // Initialize all FloatBuffers.
    initFloatBuffers();
    // Initialize all PongBuffers.
    initPongBuffers();
}

/**
 * Initialize the main TileArray and load level 0.
 */
function initTiles() {
    tiles = new TileArray(xTile, yTile);
    tiles.setup();
    level0();
}

/**
 * Initialize the main EntityList as well as the Player.
 */
function initEntities() {
    entities = new EntityList(100);
    player = new Player(4 * tileSize, 20 * tileSize, phwidth, phheight);

    // Temporary, to test the diffusion stuff.
    player.heat = 10;
}
