// Constants:
const PI = Math.PI;
const TPI = 2 * Math.PI;
const SQRT2 = 1.414214;
const ISQRT2 = 0.707107;

// jQuery event handler setup.
$(window).resize(restart);

// World global variables. //

// The canvas.
var canvas = $('#canvas');

// World size, as a fraction of the canvas size.
var worldScale;

// width and height of the world, in Tiles.
var xTile, yTile;

// width and height of the world, in pixels.
var xWorld, yWorld;

// Heat caps for the float and integer heat ranges.
var maxHeatf = 50000; // range [-50000, 50000]
var maxHeati = 128; // range [-127, 128]

// Time increment used for each frame.
var dt = 0.1;

// Tile and TileArray global variables defined in tile.js

// Entity global variables defined in entity.js

// WebGL and shader global variables are defined in glsetup.js

var windowed = true;

// Starting time of the simulation.
var time0 = new Date().getTime();

// Previous frame's time.
var timeLast = time0;

// Current time.
var timeNow = time0;

// Time elapsed since simulation start.
var dtime = 0;

// -------------------------------------------------------------------------------------------------------------------//
function tick() {
    // Set tick() as the animation callback.
    requestAnimationFrame(tick);

    // Update timeLast, timeNow, dtime.
    updateTime();

    // Framerate update calculation.
    updateFPS();

    // Handle keyboard input.
    handleKeys();

    // Call the main update function.
    update();

    // Draw everything.
    draw();
}

// -------------------------------------------------------------------------------------------------------------------//
function update() {
    // Update tiles.
    tiles.update();

    // Update entities.
    entities.update();

}

// -------------------------------------------------------------------------------------------------------------------//
function draw() {
    // Draw tiles to their FloatBuffers.
    tiles.drawMap();

    // Draw entities to their FloatBuffers.
    entities.drawMap();

    // Bind necessary texture maps. Additional ones are defined statically in glsetup.gs -> initFloatBuffers().
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.heat.readBuffer().tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.magic.readBuffer().tex);

    // Diffuse heat and magic maps.
    // heat
    gl.bindFramebuffer(gl.FRAMEBUFFER, pongBuffers.heat.writeBuffer().fb);
    gl.viewport(0, 0, xWorld, yWorld);
    gl.clearColor(0.5, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the diffuseheat shader program.
    shaderPrograms.diffuseheat.prep();
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Toggle read and write FloatBuffers for heat.
    //pongBuffers.heat.toggle();
    // magic
    gl.bindFramebuffer(gl.FRAMEBUFFER, pongBuffers.magic.writeBuffer().fb);
    gl.viewport(0, 0, xWorld, yWorld);
    gl.clearColor(0.5, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the diffusemagic shader program.
    shaderPrograms.diffusemagic.prep();
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Toggle read and write FloatBuffers for magic.
    //pongBuffers.magic.toggle();

    // Render the updated heat and magic maps.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.heat.writeBuffer().tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.magic.writeBuffer().tex);
    // Draw to screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, 0);
    gl.viewport(0, 0, xWorld, yWorld);
    // This is the first stage of the screen rendering, so clear the screen.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the rendermaps ShaderProgram.
    shaderPrograms.rendermaps.prep();
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Render the Tiles.
    tiles.render();

    // Render the Entities.
    entities.render();

    // Update the tilesmall FloatBuffer.
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.tilesmall.readBuffer().tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pongBuffers.tilesmall.writeBuffer().tex);
    gl.viewport(0, 0, xTile, yTile);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    shaderPrograms.tilesmall.prep(true);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Now that rendering is done, read back Tile heat and magic data.
    gl.readPixels(0, 0, xTile, yTile, gl.RGBA, gl.FLOAT, tiles.mapTex);

    // Toggle the PongBuffers.
    pongBuffers.heat.toggle();
    pongBuffers.magic.toggle();

}
