/**
 * Converts a 2D coordinate vector from world coordinates [0,worldX]x[0,worldY] into a vec2 in clip space coordinates
 * [-1,1]x[-1,1].
 * @typedef {float[]} vec2 - 2D vector of floating point values used in gl-matrix.js.
 * @param {float[]|vec2} vecWorld - 2D vector containing world coordinates.
 * @returns {vec2}
 */
function clipSpace(vecWorld) {
    // Converts a 2D coordinate vector from canvas space [0, worldX]x[0, worldY] into clip space
    // [-1, 1]x[-1, 1].

    // Input vector, in clip space.
    var vecClip = vec2.create();

    // Multiply by the aspect ratio transformation and subtract 1.
    vec2.transformMat2(vecClip, vecWorld, clipMat);
    vec2.subtract(vecClip, vecClip, clipOffset);

    return vecClip;
}

/**
 * Converts a pair of x and y world coordinates in [0,worldX], [0,worldY] into a vec2 in clip space coordinates
 * [-1,1]x[-1,1].
 * @param {number} vecWorldX - Vector x world coordinate.
 * @param {number} vecWorldY - Vector y world coordinate.
 * @returns {vec2}
 */
function clipSpace2(vecWorldX, vecWorldY) {
    // Create a vec2 from the inputs and pass to clipSpace().
    var vecWorld = vec2.fromValues(vecWorldX, vecWorldY);
    return clipSpace(vecWorld);
}

/**
 * Constrain input x to fall between inputs min and max.
 * @param {number} x - value to constrain.
 * @param {number} min - minimum constraint value.
 * @param {number} max - maximum constraint value.
 * @returns {number}
 */
function constrain(x, min, max) {
    return Math.min(max, Math.max(min, x));
}

function logAndValidate(functionName, args) {
    logGLCall(functionName, args);
    validateNoneOfTheArgsAreUndefined (functionName, args);
}

function logGLCall(functionName, args) {
    console.log("gl." + functionName + "(" +
        WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
}

/**
 * Returns the sign of input x: -1 if x<0, 0 if x==0, 1 if x>0.
 * @param {number} x
 * @returns {number}
 */
function sign(x) {
    return (x > 0) - (x < 0);
}

/**
 * Returns log2 of the input.
 * @param {number} x
 * @returns {number}
 */
function log2(x) {
    return Math.log(x) / Math.log(2);
}

/**
 * Returns the smallest power of 2 larger than the input.
 * @param {number} x
 * @returns {number}
 */
function npot(x) {
    return Math.round(Math.pow(2, Math.ceil(log2(x))));
}


/**
 * Update the global time variables timeLast (time last frame) and timeNow (time this frame).
 */
function updateTime() {
    timeLast = timeNow;
    timeNow = new Date().getTime();
    // Time elapsed since initialization.
    dtime = timeNow - time0;
}

/**
 * Update the FPS counter used to track framerate.
 */
function updateFPS() {
    var elapsed = timeNow - timeLast;
    if(elapsed > 0) {
        fps += (1000 / elapsed - fps) / fpsFilter;
    }
}

function validateNoneOfTheArgsAreUndefined(functionName, args) {
    for (var ii = 0; ii < args.length; ++ii) {
        if (args[ii] === undefined) {
            console.error("undefined passed to gl." + functionName + "(" +
                WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
        }
    }
}

/**
 * Write the FPS to the screen.
 */
function writeFPS()
{
    var counter = $('#fpscounter');
    counter.html(fps.toFixed(1) + " fps");
}