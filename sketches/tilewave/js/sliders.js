/*
 * Toggle menu visibility.
 */
function toggleMenu() {
    menuVisible = !menuVisible;
    if (menuVisible) {
        $('.toggle').show();
    } else {
        $('.toggle').hide();
    }
}

/*
 * Update the drawMode slider.
 */
function sliderDrawMode(val) {
    val = parseInt(val);
    drawMode = val;
    document.getElementById('range-drawmode').setAttribute('value', val.toString());
    document.getElementById('range-drawmode').value = val.toString();
}

/*
 * Update the shadowMode slider.
 */
function sliderShadowMode(val) {
    val = parseInt(val);
    shadowMode = val;
    document.getElementById('range-shadowmode').setAttribute('value', val.toString());
    document.getElementById('range-shadowmode').value = val.toString();
}

/*
 * Update the timeSpeed slider
 */
function sliderTimeSpeed(val) {
    val = parseFloat(val);
    timeSpeed = val;
    document.getElementById('range-timespeed').setAttribute('value', val.toString());
    document.getElementById('range-timespeed').value = val.toString();
}

/*
 * Update the tileSize slider
 */
function sliderTileSize(val) {
    val = parseFloat(val);
    tileSize = Math.pow(10, val);
    document.getElementById('range-tilesize').setAttribute('value', val.toString());
    document.getElementById('range-tilesize').value = val.toString();
}

/*
 * Update the frequency slider
 */
function sliderFrequency(val) {
    val = parseFloat(val);
    frequency = Math.pow(10, val);
    document.getElementById('range-frequency').setAttribute('value', val.toString());
    document.getElementById('range-frequency').value = val.toString();

}

/*
 * Update the shadow hue slider
 */
function sliderShadowHue(val) {
    val = parseFloat(val);
    hueShift = val;
    document.getElementById('range-shadowhue').setAttribute('value', val.toString());
    document.getElementById('range-shadowhue').value = val.toString();

}