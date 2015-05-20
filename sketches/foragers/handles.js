// Tracks which keys are pressed.
var keys = {};

function handleKeyDown(e)
{
    keys[e.keyCode] = true;
}

function handleKeyUp(e)
{
    keys[e.keyCode] = false;
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
        player.dr = Math.min(maxplayerdr, player.dr + 0.02);
    }
    if(keys[83]) // S
    {
        // Slow down
        player.dr = Math.max(0, player.dr - 0.02);
    }
    if(keys[69]) // E
    {
        // Increase player heat
        player.heat += 0.05;
    }
    if(keys[81]) // Q
    {
        // Decrease player heat
        player.heat = Math.max(0, player.heat - 0.05);
    }
}