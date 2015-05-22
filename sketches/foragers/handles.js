// Tracks which keys are pressed.
var keys = {};

var htogglable = true;
function handleKeyDown(e)
{
    keys[e.keyCode] = true;

    if(e.keyCode == 72 && htogglable)
    {
        htoggle();
    }
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

    if(e.keyCode == 72)
    {
        htogglable = true;
    }
}

function handleKeys()
{
    if(keys[65]) // A
    {
        // Turn counterclockwise.
        player.th += 0.1;
    }
    if(keys[68]) // D
    {
        // Turn clockwise.
        player.th -= 0.1;
    }
    if(keys[87]) // W
    {
        // Speed up
        player.dr = Math.min(maxplayerdr, player.dr + 5);
    }
    if(keys[83]) // S
    {
        // Slow down
        player.dr = Math.max(-maxplayerdr, player.dr - 5);
    }
    if(keys[80]) // P
    {
        // Increase player heat
        player.heat += 0.1;
    }
    if(keys[79]) // O
    {
        // Decrease player heat
        player.heat = Math.max(0, player.heat - 0.1);
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
}