/**
 * Handles key press events.
 * @param {KeyboardEvent} e
 */
//function handleKeyDown(e) {
//    keys[e.keyCode] = true;
//}

/**
 * Handles key release events.
 * @param {KeyboardEvent} e
 */
//function handleKeyUp(e) {
//    keys[e.keyCode] = false;
//    togglable[e.keyCode] = true;
//}

/**
 * Handles the true elements in keys[].
 */
function handleKeys() {
    // Additional key handlers are defined in Player's prototype in player.js.

    if(keys[81] && togglable[81]) {
        // Q. Toggle menu display.
        togglable[81] = false;
        $('.toggle').toggle();
    }

    if(keys[82] && togglable[82]) {
        // R. Restart the sketch.
        togglable[82] = false;
        restart();
    }
}

//function handleQualityChange() {
//    // Quality radio button value.
//    var quality = $('input[name="q1"]:checked').val();
//    // Canvas size radio button value.
//    var canvassize = $('input[name="q2"]:checked').val();
//
//    // Set the canvas scale based on the quality setting.
//    if(quality === 'low') {
//        canvasScale = 0.3;
//    } else if(quality === 'medium') {
//        canvasScale = 0.6;
//    } else if(quality === 'high') {
//        canvasScale = 0.8;
//    } else if(quality === 'best') {
//        canvasScale = 1;
//    }
//
//    // Determine which directions to stretch the canvas in.
//    xStretch = false;
//    yStretch = false;
//    if(canvassize === 'half') {
//        // Half-screen. Stretch in the window direction that is most narrow.
//        if(window.innerWidth >= window.innerHeight) {
//            yStretch = true;
//        } else {
//            xStretch = true;
//        }
//    } else if(canvassize === 'full') {
//        // Full-screen. Stretch the canvas in both directions.
//        xStretch = yStretch = true;
//    }
//
//    restart();
//}