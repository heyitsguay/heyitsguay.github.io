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
    document.getElementById('td-drawmode').innerHTML =
        "draw mode (<b>E</b>): " + val.toString();
}

/*
 * Update the shadowMode slider.
 */
function sliderShadowMode(val) {
    val = parseInt(val);
    shadowMode = val;
    document.getElementById('range-shadowmode').setAttribute('value', val.toString());
    document.getElementById('range-shadowmode').value = val.toString();
    document.getElementById('td-shadowmode').innerHTML =
        "shadow mode (<b>Q</b>): " + val.toString();
}

/*
 * Update the timeSpeed slider
 */
function sliderTimeSpeed(val) {
    val = parseFloat(val);
    timeSpeed = val;
    document.getElementById('range-timespeed').setAttribute('value', val.toString());
    document.getElementById('range-timespeed').value = val.toString();
    document.getElementById('td-timespeed').innerHTML =
        "time speed <<b>S</b>/<b>W</b>>: " + val.toFixed(2);
}

/*
 * Update the tileSize slider
 */
function sliderTileSize(val) {
    val = parseFloat(val);
    tileSize = Math.pow(10, val);
    document.getElementById('range-tilesize').setAttribute('value', val.toString());
    document.getElementById('range-tilesize').value = val.toString();
    document.getElementById('td-tilesize').innerHTML =
        "tile size <<b>A</b>/<b>D</b>>: " + val.toFixed(4);
}

/*
 * Update the frequency slider
 */
function sliderFrequency(val) {
    val = parseFloat(val);
    frequency = Math.pow(10, val);
    document.getElementById('range-frequency').setAttribute('value', val.toString());
    document.getElementById('range-frequency').value = val.toString();
    document.getElementById('td-frequency').innerHTML =
        "frequency <<b>C</b>/<b>V</b>>: " + val.toFixed(2);

}

/*
 * Update the shadow hue slider
 */
function sliderShadowHue(val) {
    val = parseFloat(val);
    hueShift = val;
    document.getElementById('range-shadowhue').setAttribute('value', val.toString());
    document.getElementById('range-shadowhue').value = val.toString();
    document.getElementById('td-shadowhue').innerHTML =
        "shadow hue <<b>F</b>/<b>R</b>>: " + val.toFixed(3);
}
