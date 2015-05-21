const maxfdr = 100; // Maximum radial velocity  magnitude for foragers.
const maxfdth = 0.5; // Maximal angular velocity magnitude for foragers.
const maxplayerdr = 2;
const maxPellets = 150;
const maxForagers = 100;

const SQRT2 = 1.414214;
const ISQRT2 = 0.707107;

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
    foragerupdate: {attributes: ['a_fposition', 'a_fheat'],
                    uniforms: []},
    pelletupdate:  {attributes: ['a_pposition', 'a_pheat'],
                    uniforms: []},
    diffuse:       {attributes: ['a_sposition'],
                    uniforms: ['u_dst', 'u_cdiff', 'u_cdecay', 's_heat', 's_entity']},
    drawheat:      {attributes: ['a_sposition'],
                    uniforms: ['u_dst', 'u_heatH', 'u_Hgate', 's_heat']},
    foragerdraw:   {attributes: ['a_fposition', 'a_fcolor'],
                    uniforms: []},
    pelletdraw:    {attributes: ['a_pposition', 'a_pcolor'],
                    uniforms: []}
};
// Vertex shader attribute variable names.
//var spAttributes = {
//    vs_foragerupdate: ['a_fposition', 'a_fheat'],
//    vs_screen: ['a_sposition'],
//    vs_foragerdraw: ['a_fposition', 'a_fcolor']
//};

// Vertex attribute arrays. Initialized in initGLVars under init.js.
var attributeArrays;

// Fragment shader uniform variable names
//var spUniforms = {
//    fs_foragerupdate: [],
//    fs_diffuse: ['u_dst', 'u_cdiff', 'u_cdecay', 's_heat', 's_entity'],
//    fs_drawheat: ['u_dst', 'u_heatH', 'u_Hgate', 's_heat'],
//    fs_foragerdraw: []
//};

// Uniform variable values. Initialized in initGLVars under init.js.
var uniformValues;

// Array of FloatBuffers used in this sketch.
var floatBuffers = {};
var floatBufferIds = ['heat0', 'heat1', 'entity'];

// Array containing all Foragers used in the sketch.
var foragers = [];

// Quadtree used for collision detection.
var tree;

// Array containing all Pellets used in the sketch.
var pellets = [];
// When true, update associated vertex attribute arrays.
pellets.redraw = true;

// A special Forager that the user can control.
var player;

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

function pelletToggle()
{
    addPellets = !addPellets;
}

function sliderToggle(checked)
{
    if(checked)
    {
        $('#table-sliders').show();
    }
    else
    {
        $('#table-sliders').hide();
    }
}

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

function updatePellets()
{
    // Reset before each round of updates.
    pelletCount = 0;

    for(var i=0; i<pellets.length; i++)
    {
        pellets[i].draw();
    }
}

function updatePlayer()
{
    if(!keys[87] && !keys[83])
    {
        player.dr *= 0.95;
    }
}

var forager;

function collisionDetect()
{
    // Clear previous tree data
    tree.clear();

    // Insert Pellets and Foragers into the quadtree
    tree.insert(pellets);
    tree.insert(foragers);

    // Check Foragers for collisions.
    for(var i=0; i<foragers.length; i++)
    {
        forager = foragers[i];
        tree.retrieve(forager, function(item){collide(forager, item)});
    }
}

function collide(obj0, obj1)
{
    if(obj0 === obj1 || obj1.alreadyCollided)
    {
        return;
    }
    // Assumes obj0 is a Forager. obj1 may be a Forager or Pellet
    var dx = (obj1.xc - obj0.xc);
    var dy = (obj1.yc - obj0.yc);
    var drad2 = dx*dx + dy*dy + 0.00001;
    if(drad2 < obj0.rad2 + obj1.rad2)
    {
        // Collision happened.
        if(obj1.type == 'pellet')
        {
            // Remove the Pellet and absorb its heat.
            obj0.heat += obj1.heat;
            _.pull(pellets, obj1);
            pellets.redraw = true;
        }
        else if(obj1.type == 'forager')
        {
            // Bounce off each other
            var cmag = Math.sqrt(drad2); // collision normal magnitude
            var cnormalx = dx / cmag; // normalized collision normal x value.
            var cnormaly = dy / cmag; // normalized collision normal y value.

            var d0dotn = obj0.dx * cnormalx + obj0.dy * cnormaly;
            var d1dotn = - obj1.dx * cnormalx - obj1.dy * cnormaly;

            var deltax = d1dotn * cnormalx + d0dotn * cnormalx;
            deltax = Math.sign(deltax) * Math.max(0.0005, Math.abs(deltax));

            var deltay = d1dotn * cnormaly + d0dotn * cnormaly;
            deltay = Math.sign(deltay) * Math.max(0.0005, Math.abs(deltay));

            obj0.dxcollide = -obj0.bounce * deltax;
            obj0.dycollide = -obj0.bounce * deltay;

            obj1.dxcollide = obj1.bounce * deltax;
            obj1.dycollide = obj1.bounce * deltay;

            obj0.alreadyCollided = true;
            obj1.alreadyCollided = true;
        }
    }


}

var dcount = 2; // Number of diffusion steps to perform per frame.
function updateHeat()
{
    // Step 1: Add Forager heat contributions to the entity FloatBuffer. -----------------------------------------------//
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers['entity'].fb);
    gl.viewport(0, 0, texX, texY);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the foragerupdate shader program to draw.
    sps['foragerupdate'].prep(true);
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, foragers.length * 3);

    // Step 2: Add Pellet heat contributions to the entity FloatBuffer. ----------------------------------------------//
    pellets.redraw = sps['pelletupdate'].prep(pellets.redraw);
    // If the pellet vertex arrays were just redrawn, reset pellets.redraw
    gl.drawArrays(gl.TRIANGLES, 0, pellets.length * 6);

    // Step 3: Combine the entity heat texture with the heat map and diffuse. ----------------------------------------//
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
        sps['diffuse'].prep(false);
        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

var addPellets = true;
function addPellet()
{
    if(pellets.length < maxPellets && addPellets)
    {
        pellets.push(new Pellet());
        pellets.redraw = true;
    }
}

function tick()
{
    updateFPS();
    requestAnimationFrame(tick);
    handleKeys();
    update();
    draw();

}
