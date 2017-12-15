$(document).keypress(onKeyPress);
$(window).resize(onResize);

/*
 * Handle keypress events.
 */
function onKeyPress(event) {
    var keyName = event.key;

    // A - decrease tile size
    if (keyName === 'a') {
        var downSize = (tileSize / tileSizeStep);
        tileSize = Math.max(downSize, 1);
        sliderTileSize(log10(tileSize));
    }

    // C - decrease linear spatial frequency
    if (keyName === 'c') {
        frequency = Math.max(frequency / frequencyStep, frequencyMin);
        sliderFrequency(log10(frequency));
    }

    // D - increase tile size
    if (keyName === 'd') {
        var upSize = (tileSize * tileSizeStep);
        tileSize = Math.min(upSize, Math.min(xSize, ySize));
        sliderTileSize(log10(tileSize));
    }

    // E - toggle draw mode
    if (keyName === 'e') {
        drawMode = (drawMode + 1) % numDrawModes;
        sliderDrawMode(drawMode);
    }

    // F - decrease hue shift
    if (keyName === 'f') {
        hueShift = mod1(hueShift - hueShiftStep);
        sliderShadowHue(hueShift);
    }

    // Q - toggle shadow mode
    if (keyName === 'q') {
        shadowMode = (shadowMode + 1) % numShadowModes;
        sliderShadowMode(shadowMode);
    }

    // R - increase hue shift
    if (keyName === 'r') {
        hueShift = mod1(hueShift + hueShiftStep);
        sliderShadowHue(hueShift);
    }

    // S - decrease time speed
    if (keyName === 's') {
        // Min speed
        timeSpeed = Math.max(timeSpeed - timeSpeedStep, timeSpeedMin);
        sliderTimeSpeed(timeSpeed);
    }

    // V - increase linear spatial frequency
    if (keyName === 'v') {
        frequency = Math.min(frequency * frequencyStep, frequencyMax);
        sliderFrequency(log10(frequency));
    }

    // W - increase time speed
    if (keyName === 'w') {
        // Max speed
        timeSpeed = Math.min(timeSpeed + timeSpeedStep, timeSpeedMax);
        sliderTimeSpeed(timeSpeed);
    }

}

/*
 * Handle resize events.
 */
function onResize() {
    if (document.readyState === 'complete') {
        cancelAnimationFrame(animate);
        onReady();
    }
}

/*
 * Update renderer and camera when the window is resized.
 */
function resize() {
    // Set renderer size and pixel ratio
    renderer.setSize(xSize, ySize, false);
    renderer.setPixelRatio(1);
    // renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
    // Set camera aspect ratio
    dummy_camera.aspect = window.innerWidth / window.innerHeight;
    dummy_camera.updateProjectionMatrix();
    $('#range-tilesize').prop({max: log10(Math.min(xSize, ySize))});
}

/*
 * Handle click events.
 */
function onClick() {
    if (hasWebGL) {
        toggleMenu();
    }
}