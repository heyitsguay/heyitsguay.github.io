// Contains the functions called as part of the update process.

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

}