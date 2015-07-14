// WebGL extension allowing for multiple render targets.
//var ext;

// True for the first startup, slightly modifies what the restart() function does.
var firstTime;
// -------------------------------------------------------------------------------------------------------------------//
function startup() {
    firstTime = true;

    restart();
}

// -------------------------------------------------------------------------------------------------------------------//
function restart() {

    resize();
    initGL();
    initTiles();
    initEntities();

    if(firstTime) {
        document.onkeydown = handleKeyDown;
        document.onkeyup = handleKeyUp;
        firstTime = false;
        tick();
    }
}

// -------------------------------------------------------------------------------------------------------------------//
function resize() {
    // Size of the usable window
    var xWindow = window.innerWidth;
    var yWindow = window.innerHeight;
    xTile = Math.floor(worldScale * xWindow / tileSize);
    yTile = Math.floor(worldScale * yWindow / tileSize);
    xWorld = tileSize * xTile;
    yWorld = tileSize * yTile;

    // An aspect ratio transform is necessary when drawing with WebGL to convert
    // from world space to clip space. Setting xWorld and yWorld determines this
    // transform.
    clipMat[0] = 2 / xWorld;
    clipMat[3] = 2 / yWorld;

    canvas.width = xWorld;
    canvas.height = yWorld;

    var cleft, ctop, cwidth, cheight;
    var $cleft, $ctop, $cwidth, $cheight;

    if (windowed) {
        cleft = Math.floor((window.innerWidth - xWorld) / 2);
        ctop = Math.floor((window.innerHeight - yWorld) / 2);
        cwidth = xWorld;
        cheight = yWorld;
    } else {
        cleft = 0;
        ctop = 0;
        cwidth = window.innerWidth;
        cheight = window.innerHeight;
    }

    $cleft = cleft.toString() + 'px';
    $ctop = ctop.toString() + 'px';
    $cwidth = cwidth.toString() + 'px';
    $cheight = cheight.toString() + 'px';

    canvas.css({'left': $cleft, 'top': $ctop, 'width': $cwidth, 'height': $cheight});
    // Delay setting until now to avoid a spurious border before startup.
    canvas.css({'border': '1px solid #222222'});
}

// -------------------------------------------------------------------------------------------------------------------//
function initGL() {
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    initAttributes();
    initUniforms();
    initShaderVars();
    initFloatBuffers();
    initPongBuffers();
    initShaderPrograms();

    gl.getExtension('OES_texture_float');

}

// -------------------------------------------------------------------------------------------------------------------//
function initTiles() {
    tiles = new TileArray(xTile, yTile);
    level0();
}

// -------------------------------------------------------------------------------------------------------------------//
function initEntities() {
    entities = new EntityList();
    player = new Player(3 * tileSize, 12 * tileSize, phwidth, phheight);

    // Temporary, to test the diffusion stuff.
    player.heat = 10;
}
