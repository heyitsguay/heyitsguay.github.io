// TODO:
// - 20150520 Give pellets and foragers a proper object structure with methods to handle e.g. triggering redraws.

const TPI = 2 * Math.PI;
const maxfdr = 300; // Maximum radial velocity  magnitude for foragers.
const maxfdth = 0.5; // Maximal angular velocity magnitude for foragers.
var maxfheat;
const maxplayerdr = 300;
const maxPellets = 150;
const maxForagers = 400;

const SQRT2 = 1.414214;
const ISQRT2 = 0.707107;

//const worldX = 512;
//const worldY = 512;
var worldX, worldY;
//var canvasScale = 0.5;

var showText = true;

// the webgl canvas context
var gl;

// Array of ShaderPrograms used in this sketch.
var sps = {};
var spIds = ['foragerupdate', 'pelletupdate', 'diffuse', 'drawheat', 'foragerdraw', 'pelletdraw'];
// Fragment/vertex shader pairs for each ShaderProgram.
var spPairs = {
    foragerupdate: ['fs_entityupdate', 'vs_entityupdate'],
    pelletupdate: ['fs_entityupdate', 'vs_entityupdate'],
    diffuse: ['fs_diffuse', 'vs_screen'],
    drawheat: ['fs_drawheat', 'vs_screen'],
    foragerdraw: ['fs_entitydraw', 'vs_entitydraw'],
    pelletdraw: ['fs_entitydraw', 'vs_entitydraw']
};
// Shader program uniform and attribute variables
var spVars = {
    foragerupdate: {attributes: ['a_fposition', 'a_fheat', 'a_flifeleft'],
                    uniforms: []},
    pelletupdate:  {attributes: ['a_pposition', 'a_pheat', 'a_plifeleft'],
                    uniforms: []},
    diffuse:       {attributes: ['a_sposition'],
                    uniforms: ['u_dst', 'u_cdiff', 'u_cdecay', 's_heat', 's_entity']},
    drawheat:      {attributes: ['a_sposition'],
                    uniforms: ['u_dst', 'u_size', 'u_heatH', 'u_time', 's_heat']},
    foragerdraw:   {attributes: ['a_fposition', 'a_fcolor'],
                    uniforms: []},
    pelletdraw:    {attributes: ['a_pposition', 'a_pcolor'],
                    uniforms: []}
};

var attributeArrays;

// Uniform variable values. Initialized in initGLVars under init.js.
var uniformValues;

// Array of FloatBuffers used in this sketch.
var floatBuffers = {};
var floatBufferIds = ['heat0', 'heat1', 'entity'];

// Array containing all Foragers used in the sketch.
var foragers = [];
var deadForagers = [];
var foragersLimbo = [];

// Array containing all Pellets used in the sketch.
var pellets = [];
//var deadPellets = [];
var pelletsLimbo = [];

// Controls the size of the Foragers and Pellets.
var escale;

// Quadtree used for collision detection.
var tree;
var foragerCollision;


// When true, update associated vertex attribute arrays.
pellets.redraw = true;

// A special Forager that the user can control.
var player;

// When true, draw entity shapes.
var drawEntities = false;

// For better performance, one can use a smaller heat map by dividing the world dimensions by heatMapScale.
//var heatMapScale = 1; // should be a power of 2.
var texX, texY;// = Math.pow(2, Math.ceil(Math.log2(worldY)));

// Used to toggle between the two heat framebuffers.
var fbidx = 0;

// Contains the random values added to dth on each Forager update.
var dthrands = [];

// Scales starting heat for the Foragers uniformly.
var heatscale;

$(window).resize(resizeWindow);
$('#pelletheat-text').on('input', handlePelletHeat);

var killTheCanvas = false;
var firstTime;
var onMobile;
function webGLStart() {
    setInterval(changeRands, 250);
    setInterval(addPellet, 1000);
    setInterval(writeFPS, 500);
    firstTime = true;
    mobileSetup();

    var canvas = document.getElementById('canvas');
    $(canvas).bind('touchstart', handleTouchStart);
    $(canvas).bind('touchmove', handleTouchMove);
    $(canvas).bind('touchend', handleTouchEnd);
    qualityChange();
}

var currentForagers;
function tick()
{
    currentForagers = foragers.length - 1;

    updateFPS();
    totalElapsed = (lastTime - time0) * 0.001;
    uniformValues['u_time'].data = totalElapsed;
    playerSeek();
    requestAnimationFrame(tick);
    handleKeys();
    update();
    draw();
}

function draw()
{
    var draw_id = ['heat0', 'heat1'][fbidx];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, floatBuffers[draw_id].tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, worldX, worldY);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    sps['drawheat'].prep();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if(drawEntities)
    {
        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        sps['foragerdraw'].prep(true);
        gl.drawArrays(gl.TRIANGLES, 0, foragers.length * 3);

        pellets.redraw = sps['pelletdraw'].prep(pellets.redraw);
        gl.drawArrays(gl.TRIANGLES, 0, pellets.length * 6);

        gl.disable(gl.BLEND);
    }
}

function update()
{
    updateForagers();

    updatePlayer();

    collisionDetect();

    // If true, pellet states have changed. Update the attribute vertex arrays.
    if(pellets.redraw)
    {
        updatePellets();
    }

    updateHeat();
}