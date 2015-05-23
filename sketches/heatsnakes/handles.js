// Tracks which keys are pressed.
var keys = {};

var htogglable = true;
var ftogglable = true;
function handleKeyDown(e)
{
    keys[e.keyCode] = true;

    if(e.keyCode == 70 && ftogglable) // F flip
    {
        ftoggle();
    }

    if(e.keyCode == 72 && htogglable) // H toggle menu
    {
        htoggle();
    }
}

function ftoggle()
{
    ftogglable = false;
    player.heat *= -1;
}

function htoggle()
{
    htogglable = false;
    showText = !showText;
    if (showText) {
        $('.toggle').show();
    }
    else {
        $('.toggle').hide();
    }
}

function handleKeyUp(e)
{
    keys[e.keyCode] = false;

    if(e.keyCode == 70) // F
    {
        ftogglable = true;
    }
    if(e.keyCode == 72) // H
    {
        htogglable = true;
    }
}

function handleKeys()
{
    if(keys[65]) // A
    {
        // Turn counterclockwise.
        player.th += dt;
    }
    if(keys[68]) // D
    {
        // Turn clockwise.
        player.th -= dt;
    }
    if(keys[87]) // W
    {
        // Speed up
        player.dr = Math.min(maxplayerdr, player.dr + 50 * dt);
    }
    if(keys[83]) // S
    {
        // Slow down
        player.dr = Math.max(-maxplayerdr, player.dr - 50 * dt);
    }
    if(keys[80]) // P
    {
        // Increase player heat
        player.heat += 1;
    }
    if(keys[79]) // O
    {
        // Decrease player heat
        player.heat -= 1;
    }

    if(keys[75]) // K
    {
        // Remove a Forager
        removeForager();
    }
    if(keys[76]) // L
    {
        // Add a Forager
        addForager();
    }
    if(keys[90]) {
        // Set player heat to 0
        player.heat = 0;
    }
    if(keys[32]) { // Space
        // Reset
        resizeWindow();
    }
}

var drawPelletHeat;
function handlePelletHeat()
{
    var pelletHeat = $('#pelletheat-text');
    var inputHeat = parseFloat(pelletHeat.val());
    drawPelletHeat = Math.min(maxfheat, Math.max(-maxfheat, inputHeat));
    pelletHeat.val(drawPelletHeat.toString());

}
function handleClick(evt)
{
    var canvas = $('#canvas');
    var pos = getMousePos(canvas, evt);
    if(keys[16] && pellets.length < maxPellets) {// When shift is pressed

    }
}

function getMousePos(canvas, evt)
{
    return{
        x: evt.offsetX,
        y: evt.offsetY
    };
}