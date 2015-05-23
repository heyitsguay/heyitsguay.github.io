// TODO:
// - 20150520 Give pellets and foragers a proper object structure with methods to handle e.g. triggering redraws.

const maxfdr = 300; // Maximum radial velocity  magnitude for foragers.
const maxfdth = 0.5; // Maximal angular velocity magnitude for foragers.
const maxfheat = 50000;
const maxplayerdr = 300;
const maxPellets = 150;
const maxForagers = 200;

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
                    uniforms: ['u_dst', 'u_heatH', 'u_Hgate', 's_heat']},
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

// Quadtree used for collision detection.
var tree;
var foragerCollision;

// Array containing all Pellets used in the sketch.
var pellets = [];
var deadPellets = [];
var pelletsLimbo = [];

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

// Array containing the heat map values.
var heatMap;

// Modulo operation variant with no negative numbers
function mod(m, n)
{
    return ((m % n) + n) % n;
}

function randexp(L)
{
    var u = Math.random();
    return Math.log(1 - u) / (-L);
}

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
    uniformValues.u_Hgate.data = 0.002 * (Math.log(1 + 0.2 * fval) + (fval >= 50) * 0.6 * (fval - 50));

    var disp = document.getElementById("range-Hgate-disp");
    disp.innerHTML = val;
}

function pelletToggle()
{
    addPellets = !addPellets;
}

function collisionToggle(checked) {
    //noinspection JSUnusedAssignment
    checked? foragerCollision = true : foragerCollision = false;
}

function entityDrawToggle()
{
    drawEntities = !drawEntities;
    pellets.redraw = true;
}

var canvasScale, xstretch, ystretch;

function qualityChange()
{
    var q1 = $('input[name="q1"]:checked').val();
    var q2 = $('input[name="q2"]:checked').val();

    if(q1 === 'low')
    {
        canvasScale = 0.3;
    }
    else if(q1 === 'medium')
    {
        canvasScale = 0.6;
    }
    else if(q1 === 'high')
    {
        canvasScale = 0.8;
    }
    else if(q1 === 'best')
    {
        canvasScale = 1;
    }

    xstretch = false;
    ystretch = false;
    if(q2 === 'half'){
        if(window.innerWidth >= window.innerHeight) {
            ystretch = true;
        }
        else {
            xstretch = true;
        }
    }
    else if(q2 === 'full') {
        xstretch = true;
        ystretch = true;
    }

    resizeWindow();
}

var dt;
var randOffset = 0;
function updateForagers()
{
    // Reset before each round of updates.
    foragerCount = 0;

    randOffset = (randOffset + 1) % maxForagers;

    dt = 0.1 * Math.max(1, 50 / fps);
    for(var i = 0; i < foragers.length; i++)
    {

        if(foragers[i].player || i >= dthrands.length)
        {
            foragers[i].update(dt, 0, 0, 0);
        }
        else
        {
            var dth = dthrands[(randOffset + i) % dthrands.length] * 0.99;
            foragers[i].update(dt, 0, 0, dth);
        }
        foragers[i].draw();
    }

    // Remove dead Foragers
    for(i=deadForagers.length - 1; i>=0; i--)
    {
        foragersLimbo.push(deadForagers[i]);
        _.pull(foragers, deadForagers[i]);
        _.pullAt(deadForagers, i);

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
    player.dth *= 0.95;
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
            pelletsLimbo.push(obj1);
            _.pull(pellets, obj1);
            pellets.redraw = true;
        }
        else if(obj1.type == 'forager' && foragerCollision)
        {
            // Bounce off each other
            var cmag = Math.sqrt(drad2); // collision normal magnitude
            var cnormalx = dx / cmag; // normalized collision normal x value.
            var cnormaly = dy / cmag; // normalized collision normal y value.waaaa

            var d0dotn = obj0.dr * Math.cos(obj0.th) * cnormalx + obj0.dr * Math.sin(obj0.th) * cnormaly;
            var d1dotn = - obj1.dr * Math.cos(obj1.th) * cnormalx - obj1.dr * Math.sin(obj1.th) * cnormaly;

            var deltax = d1dotn * cnormalx + d0dotn * cnormalx;
            deltax = Math.sign(deltax) * Math.max(0.05, Math.abs(deltax));

            var deltay = d1dotn * cnormaly + d0dotn * cnormaly;
            deltay = Math.sign(deltay) * Math.max(0.05, Math.abs(deltay));

            //var dx0 = obj0.dr * Math.cos(obj0.dth) - obj0.bounce * deltax;
            var dx0 = -obj0.bounce * deltax;
            //var dy0 = obj0.dr * Math.sin(obj0.dth) - obj0.bounce * deltay;
            var dy0 = -obj0.bounce * deltay;

            //var dx1 = obj1.dr * Math.cos(obj1.dth) + obj1.bounce * deltax;
            //var dy1 = obj1.dr * Math.sin(obj1.dth) + obj1.bounce * deltay;
            var dx1 = obj1.bounce + deltax;
            var dy1 = obj1.bounce + deltay;

            var c = collideHeatContribution(obj0, obj1);

            obj0.drcollide = Math.min(0.5 * maxfdr, c[1] * Math.sqrt(dx0 * dx0 + dy0 * dy0));
            obj0.dthcollide = 0.2 * c[1] * Math.atan2(dx0, dy0) + Math.PI * (dx0 < 0);

            obj1.drcollide = Math.min(0.5 * maxfdr, c[0] * Math.sqrt(dx1 * dx1 + dy1 * dy1));
            obj1.dthcollide = c[0] * 0.2 * Math.atan2(dx1, dy1) + Math.PI * (dx1 < 0);


            obj0.alreadyCollided = true;
            obj1.alreadyCollided = true;
        }
    }


}

function collideHeatContribution(obj0, obj1)
{
    var dheat = obj0.heat - obj1.heat;
    var c0 = Math.exp(0.06 * dheat);
    var c1 = 1 / c0;
    return [c0, c1];
}

//var dcount = 1; // Number of diffusion steps to perform per frame.
function updateHeat()
{
    // Step 1: Add Forager heat contributions to the entity FloatBuffer. -----------------------------------------------//
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers['entity'].fb);
    gl.viewport(0, 0, worldX, worldY);
    gl.clearColor(0.5, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the foragerupdate shader program to draw.
    sps['foragerupdate'].prep(true);
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, foragers.length * 3);

    // Step 2: Add Pellet heat contributions to the entity FloatBuffer. ----------------------------------------------//
    if(drawEntities)
    {
        sps['pelletupdate'].prep(pellets.redraw);
    }
    else
    {
        pellets.redraw = sps['pelletupdate'].prep(pellets.redraw);
    }

    gl.drawArrays(gl.TRIANGLES, 0, pellets.length * 6);

    // Step 3: Combine the entity heat texture with the heat map and diffuse. ----------------------------------------//
    //for(var i=0; i<dcount; i++)
    //{
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
    gl.viewport(0, 0, worldX, worldY);
    gl.clearColor(0.5, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the diffuse shader program to draw.
    sps['diffuse'].prep();
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    //}

}

function changeRands()
{
    var newrands = [];
    for(var i=0; i < foragers.length; i++)
    {
        newrands.push(Math.random() - 0.5);
    }
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

function writeFPS()
{
    var counter = document.getElementById("fpscounter");
    counter.innerHTML = fps.toFixed(1) + " fps";
}

var lastTime = new Date().getTime();
var time0 = lastTime;
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
        var newPellet = pelletsLimbo.pop();

        var t = 0.001 * (lastTime - time0);
        var lambda = Math.min(1, 1 / (0.35 * t));
        var h = randexp(lambda);
        if(Math.random() < 0.5) {
            newPellet.build(null, null, h);
        } else {
            newPellet.build(null, null, -h);
        }
        pellets.push(newPellet);
        pellets.redraw = true;
    }
}

//function readHeatMap()
//{
//    var draw_id = ['heat0', 'heat1'][fbidx];
//    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers[draw_id].fb);
//    gl.readPixels(0, 0, worldX, worldY, gl.RGBA, gl.FLOAT, heatMap);
//}

function tick()
{
    updateFPS();
    requestAnimationFrame(tick);
    handleKeys();
    update();
    draw();
    //readHeatMap();

}