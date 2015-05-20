const maxfdr = 100; // Maximum radial velocity  magnitude for foragers.
const maxfdth = 0.5; // Maximal angular velocity magnitude for foragers.
const maxplayerdr = 2;

// the webgl canvas context
var gl;

// Array of ShaderPrograms used in this sketch.
var sps = {};
var spIds = ['foragerupdate', 'diffuse', 'drawheat', 'foragerdraw'];
// Fragment/vertex shader pairs for each ShaderProgram.
var spPairs = {
    foragerupdate: ['fs_foragerupdate', 'vs_foragerupdate'],
    diffuse: ['fs_diffuse', 'vs_screen'],
    drawheat: ['fs_drawheat', 'vs_screen'],
    foragerdraw: ['fs_foragerdraw', 'vs_foragerdraw']
};
// Vertex shader attribute variable names.
var spAttributes = {
    vs_foragerupdate: ['a_fposition', 'a_fheat'],
    vs_screen: ['a_sposition'],
    vs_foragerdraw: ['a_fposition', 'a_fcolor']
};

// Vertex attribute arrays. Initialized in initGLVars under init.js.
var attributeArrays;

// Fragment shader uniform variable names
var spUniforms = {
    fs_foragerupdate: [],
    fs_diffuse: ['u_dst', 'u_cdiff', 'u_cdecay', 's_heat', 's_entity'],
    fs_drawheat: ['u_dst', 'u_heatH', 'u_Hgate', 's_heat'],
    fs_foragerdraw: []
};

// Uniform variable values. Initialized in initGLVars under init.js.
var uniformValues;

// Array of FullBuffers used in this sketch.
var floatBuffers = {};
var floatBufferIds = ['heat0', 'heat1', 'entity'];

// Array containing all Foragers used in the sketch.
var foragers = [];

var player; // A special forager that the user can control.

// World dimensions (currently just the same as canvas dimensions).
var worldX = 512;
var worldY = 512;
// For better performance, one can use a smaller heat map by dividing the world dimensions by heatMapScale.
var heatMapScale = 1; // should be a power of 2.
var texX = worldX / heatMapScale;
var texY = worldY / heatMapScale;

// Used to toggle between the two heat framebuffers.
var fbidx = 0;

// Contains the random values added to dth on each Forager update.
var dthrands = [];

// Scales starting heat for the Foragers uniformly.
var heatscale;

//function heatscaleSlider(val)
//{
//    heatscale = parseFloat(val);
//    var disp = document.getElementById("range-heatscale-disp");
//    disp.innerHTML = val;
//}
function cdecaySlider(val)
{
    uniformValues.u_cdecay.data = 1 - Math.pow(2, -15+parseFloat(val));
    var disp = document.getElementById("range-cdecay-disp");
    disp.innerHTML = val;
}
function cdiffSlider(val)
{
    uniformValues.u_cdiff.data = 0.1666666 * parseFloat(val);
    var disp = document.getElementById("range-cdiff-disp");
    disp.innerHTML = val;
}

function heatHSlider(val)
{
    uniformValues.u_heatH.data = parseFloat(val);
    var disp = document.getElementById("range-heatH-disp");
    disp.innerHTML = val;
}

function HgateSlider(val)
{
    var fval = parseFloat(val);
    uniformValues.u_Hgate.data = 0.05 * (Math.log(1 + 0.2 * fval) + (fval >= 30) * 0.2 * (fval - 30));

    var disp = document.getElementById("range-Hgate-disp");
    disp.innerHTML = val;
}

//function SgateSlider(val)
//{
//    var fval = parseFloat(val);
//    uniformValues.u_Sgate.data = 0.005 * (Math.log(1 + 0.04 * fval) + (fval >= 70) * 0.1 * (fval - 70));
//
//    var disp = document.getElementById("range-Sgate-disp");
//    disp.innerHTML = val;
//}

function updateForagers()
{
    for(var i = 0; i < foragers.length; i++)
    {
        var dt = 0.1;
        var dth = dthrands[i] * 0.3;
        foragers[i].update(dt, 0, 0, dth);
        foragers[i].draw();
    }
}

function updatePlayer()
{
    if(!keys[87] && !keys[83])
    {
        player.dr *= 0.95;
    }
}

var dcount = 2; // Number of diffusion steps to perform per frame.
function updateHeat()
{
    // Step 1: Add entity heat contributions to the entity FloatBuffer. -----------------------------------------------//
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers['entity'].fb);
    gl.viewport(0, 0, texX, texY);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the foragerupdate shader program to draw.
    sps['foragerupdate'].prep();
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, attributeArrays.a_fposition.numItems);

    // Step 2: Combine the entity heat texture with the heat map and diffuse. ----------------------------------------//
    for(var i=0; i<dcount; i++)
    {
        fbidx = (fbidx + 1) % 2;
        // ID of the heat map FullBuffer updated last time.
        var ping = ['heat0', 'heat1'][1 - fbidx];
        // ID of the heat map FullBuffer to update this time.
        var pong = ['heat0', 'heat1'][fbidx];

        // Bind the previous heat map to texture unit 0, and the entity heat map to texture unit 1.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, floatBuffers[ping].tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, floatBuffers['entity'].tex);
        // Bind the current heat map framebuffer.
        gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers[pong].fb);
        gl.viewport(0, 0, texX, texY);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // Prepare the diffuse shader program to draw.
        sps['diffuse'].prep();
        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, attributeArrays.a_sposition.numItems);
    }

}

function changeRands()
{
    var newrands = [];
    for(var i=0; i < foragers.length-1; i++)
    {
        newrands.push(Math.random() - 0.5);
    }
    newrands.push(0);
    dthrands = newrands;
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, attributeArrays.a_sposition.numItems);
}

function update()
{
    updateForagers();
    updatePlayer();
    updateHeat();
}

function writeFPS()
{
    var counter = document.getElementById("fpscounter");
    counter.innerHTML = fps.toFixed(1) + " fps";
}

var lastTime = new Date().getTime();
var elapsed = 0;
var fps = 0;
var fpsFilter = 30;
function updateFPS()
{
    var timeNow = new Date().getTime();
    elapsed = timeNow - lastTime;
    if(elapsed>0)
    {
        fps += (1000. / elapsed - fps) / fpsFilter;
    }
    lastTime = timeNow;
}

function tick()
{
    updateFPS();
    requestAnimationFrame(tick);
    handleKeys();
    update();
    draw();

}
