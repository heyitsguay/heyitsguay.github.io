$(document).keypress(onKeyPress);
$(document).resize(onResize);
$(document).onclick(onClick);

/*
 * Handle keypress events.
 */
function onKeyPress(event) {
    var keyName = event.key;

    // 1 - toggle draw mode
    if (keyName === '1') {
        drawMode = (drawMode + 1) % numDrawModes;
        sliderDrawMode(drawMode);
    }

    // 2 - toggle shadow mode
    if (keyName === '2') {
        shadowMode = (shadowMode + 1) % numShadowModes;
        sliderShadowMode(shadowMode);
    }

    // C - decrease linear spatial frequency
    if (keyName === 'c') {
        frequency = Math.max(frequency / frequencyStep, frequencyMin);
        sliderFrequency(log10(frequency));
    }

    // F - decrease time speed
    if (keyName === 'f') {
        // Min speed
        timeSpeed = Math.max(timeSpeed - timeSpeedStep, timeSpeedMin);
        sliderTimeSpeed(timeSpeed);
    }

    // G - decrease tile size
    if (keyName === 'g') {
        var downSize = Math.floor(tileSize / tileSizeStep);
        tileSize = Math.max(downSize, 1);
        sliderTileSize(log10(tileSize));
    }

    // H - decrease hue shift
    if (keyName === 'h') {
        hueShift = mod1(hueShift - hueShiftStep);
        sliderShadowHue(hueShift);
    }

    // Q - toggle menu visibility
    if (keyName === 'q') {
        buttonMenu();
    }

    // R - increase time speed
    if (keyName === 'r') {
        // Max speed
        timeSpeed = Math.min(timeSpeed + timeSpeedStep, timeSpeedMax);
        sliderTimeSpeed(timeSpeed);
    }

    // T - increase tile size
    if (keyName === 't') {
        var upSize = Math.ceil(tileSize * tileSizeStep);
        tileSize = Math.min(upSize, Math.min(xSize, ySize));
        sliderTileSize(log10(tileSize));
    }

    // V - increase linear spatial frequency
    if (keyName === 'v') {
        frequency = Math.min(frequency * frequencyStep, frequencyMax);
        sliderFrequency(log10(frequency));
    }

    // Y - increase hue shift
    if (keyName === 'y') {
        hueShift = mod1(hueShift + hueShiftStep);
        sliderShadowHue(hueShift);
    }

}

/*
 * Handle resize events.
 */
function onResize() {
    cancelAnimationFrame(animate);
    run();
}

/*
 * Handle click events.
 */
function onClick() {
    toggleMenu();
}