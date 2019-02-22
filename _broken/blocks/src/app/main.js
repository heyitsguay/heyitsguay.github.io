/**
 * Controls what happens in each frame of the program.
 */
function tick() {
    // Set tick() as the animation callback.
    requestAnimationFrame(tick);

    // Update timeLast, timeNow, dtime.
    updateTime();

    // Update the u_time uniform variable.
    uniforms.u_time.data = dtime * 0.001;

    // Framerate update calculation.
    updateFPS();

    // Handle keyboard input.
    handleKeys();

    // Call the main update function.
    update();

    // Draw everything.
    draw();
}

/**
 * Main per-frame update function.
 */
function update() {
    // Update tiles.
    tiles.update();

    // Update entities.
    entities.update();

}

/**
 * Main per-frame draw function.
 */
function draw() {
    // Draw Entities to their FloatBuffers.
    entities.drawHeat();

    // Draw Tiles to their FloatBuffers.
    tiles.drawHeat();

    // Bind the heat texture. Additional texture bindings are defined statically in glsetup.gs -> initFloatBuffers().
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.heat.readBuffer().texture);

    // Diffuse the heat map.
    // heat
    gl.bindFramebuffer(gl.FRAMEBUFFER, pongBuffers.heat.writeBuffer().framebuffer);
    gl.viewport(0, 0, xWorld, yWorld);
    gl.clearColor(0.5, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the diffuseheat shader program.
    shaderPrograms.diffuseheat.prep();
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    pongBuffers.heat.toggle();

    // Render the updated heat map.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.heat.readBuffer().texture);
    // Draw to screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, xWorld, yWorld);
    // This is the first stage of the screen rendering, so clear the screen.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Prepare the drawheat ShaderProgram.
    shaderPrograms.drawheat.prep();
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Render the Tiles.
    tiles.render();

    // Render the Entities.
    entities.render();

    // Update the tilesmall FloatBuffer.
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, pongBuffers.tilesmall.readBuffer().texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pongBuffers.tilesmall.writeBuffer().framebuffer);
    gl.viewport(0, 0, xTile, yTile);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    shaderPrograms.tilesmall.prep(true);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Now that rendering is done, read back Tile heat and magic data.
    gl.readPixels(0, 0, xTile, yTile, gl.RGBA, gl.FLOAT, tiles.heatTexture);

    // Toggle the PongBuffers.

    pongBuffers.tilesmall.toggle();
}
