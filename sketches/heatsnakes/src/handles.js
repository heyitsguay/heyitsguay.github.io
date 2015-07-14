// Tracks which keys are pressed.
var keys = {};
var togglables = [];
// Initialize togglables to true
var togglablesSize = 256;
while(togglablesSize--){togglables.push(true);}

function handleKeyDown(e)
{
    keys[e.keyCode] = true;
}

function handleKeyUp(e)
{
    keys[e.keyCode] = false;
    togglables[e.keyCode] = true;
}

function handleKeys()
{
    if(keys[32]) { // Space
        // Reset
        resizeWindow();
    }
    if(keys[65]) { // A
        // Turn counterclockwise.
        player.th += dt;
    }
    if(keys[67] && togglables[67]) // C
    {
        // Toggle entity drawing.
        togglables[67] = false;
        drawEntities = !drawEntities;
    }
    if(keys[68]) // D
    {
        // Turn clockwise.
        player.th -= dt;
    }
    if(keys[69]) // E
    {
        // Decrease player heat
        player.heat -= 1;
    }
    if(keys[70] && togglables[70]) { // F
        // Flip player heat.
        togglables[70] = false;
        player.heat *= -1;
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
    if(keys[81] && togglables[81]) { // Q
        // Toggle menu display.
        togglables[81] = false;

        showText = !showText;
        if (showText) {
            $('.toggle').show();
        }
        else {
            $('.toggle').hide();
        }
    }
    if(keys[82]) // R
    {
        // Increase player heat
        player.heat += 1;
    }
    if(keys[83]) // S
    {
        // Slow down
        player.dr = Math.max(-maxplayerdr, player.dr - 50 * dt);
    }
    if(keys[87]) // W
    {
        // Speed up
        player.dr = Math.min(maxplayerdr, player.dr + 50 * dt);
    }
    if(keys[88] && togglables[88]) { // X
        // Toggle orb spawning.
        togglables[88] = false;
        addPellets = !addPellets;
    }
    if(keys[90]) { // Z
        // Set player heat to 0
        player.heat = 0;
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
function handleClick(evt) {
    var canvas = $('#canvas');
    var pos = getMousePos(canvas, evt);
    if(keys[16] && pellets.length < maxPellets) {// When shift is pressed

    }
}

function getMousePos(canvas, evt) {
    return{
        x: evt.offsetX,
        y: evt.offsetY
    };
}

var targetX, targetY;
var cw, ch; // Canvas width and height
var seekTarget = false;
var growHeat = false;
function handleTouchStart(evt) {
    evt.preventDefault();
    var touches = evt.originalEvent.targetTouches;
    targetX = canvasScale * touches[0].pageX;
    targetY = worldY - canvasScale * touches[0].pageY;
    seekTarget = true;
    if(touches.length > 1)
    {
        growHeat = true;
    }
}

function handleTouchMove(evt) {
    evt.preventDefault();
    targetX = canvasScale * evt.originalEvent.targetTouches[0].pageX;
    targetY = worldY - canvasScale * evt.originalEvent.targetTouches[0].pageY;
}

var lastTap = new Date().getTime();
var timeSinceTap;
var doubleTapInterval = 200; // ms
var doubleTapTimeout = true;
function handleTouchEnd(evt) {
    var touches = evt.originalEvent.targetTouches;
    if(touches.length < 2) {
        growHeat = false;
    }
    if(touches.length < 1) {
        seekTarget = false;
        var newTap = new Date().getTime();
        timeSinceTap = newTap - lastTap;
        if(timeSinceTap < doubleTapInterval && doubleTapTimeout) {
            player.heat *= -1;
            playerState *= -1;
            doubleTapTimeout = false;
            window.setTimeout(function(){doubleTapTimeout = true;}, 1000);
        }
        lastTap = newTap;
    }
}