// THREE.js scene
var scene;
// Scene camera
var dummy_camera = new THREE.PerspectiveCamera(
    60,  // Field of view
    window.innerWidth/window.innerHeight,  // Aspect ratio
    0.1,  // Near clipping plane
    10000  // Far clipping plane
);
// THREE.js renderer
var renderer;
// Plane geometry
var geo;
// Plane shader
var shaderMaterial;
// Plane mesh
var plane;
// Plane shader uniforms
var uniforms;
// Shader draw mode
var drawMode = 0;
// Number of draw modes
var numDrawModes = 4;
// Shader shadow mode
var shadowMode = 0;
// Number of shadow modes
var numShadowModes = 3;

// Is the menu overlay visible?
var menuVisible = true;

// Tile size
var tileSize = 20;
// Controls how granular the controls to change tile size are
var tileSizeStep = 1.02;
function xTile() {
    return (xSize / tileSize);
}
function yTile() {
    return (ySize / tileSize);
}
// Size of the tile plane in whatever units THREE.js geometries use
var xSize;
var ySize;

var mouseX, mouseY;

// Linear frequency parameter
var frequency = 100;
var frequencyMin = 0.1;
var frequencyMax = 1e7;
var frequencyStep = 1.1;

var hueShift = 0.25;
var hueShiftStep = 0.025;

// Start time for the sketch
var startTime = new Date().getTime();
// Time of the last frame
var lastTime = startTime;
// Time of the current frame
var thisTime;
// Time elapsed since the last frame
var elapsedTime;
// Time speed effect factor (log10)
var timeSpeed = 0;
// Maximum time speed factor
var timeSpeedMax = 2;
// Minimum time speed factor
var timeSpeedMin = -3;
// Controls how granular the controls to change time speed are
var timeSpeedStep = 0.05;

var firstTime = true;

var hasWebGL = true;

var keyStates = {};
for (var i = 32; i < 128; i++) {
    var c = String.fromCharCode(i);
    keyStates[c] = false;
}

$(document).ready(onReady);

function onReady() {
    if (hasWebGL) {
        // Initialize the sketch
        initOverlay();
        init();

        if (hasWebGL) {

            // Run the sketch
            animate();
        } else {
            $('#nowebglpanel').show();
            $('.toggle').hide();
        }
    }
    else {
        $('#nowebglpanel').show();
        toggleMenu();
        $('.toggle').hide();
    }
}

/*
 * Animate the scene.
 */
function animate() {
    // Keep calling this function while the sketch runs
    requestAnimationFrame(animate);
    thisTime = new Date().getTime();
    // Elapsed time (in ms)
    elapsedTime = thisTime - lastTime;
    lastTime = thisTime;
    // Update scene logic
    update();
    // Render the scene
    render();
}

/*
 * Render the scene.
 */
function render() {
    renderer.render(scene, dummy_camera);
}

/*
 * Update scene logic.
 */
function update() {
    var actualTimeSpeed = Math.pow(10, timeSpeed);
    uniforms.time.value += actualTimeSpeed * elapsedTime / 1000;
    uniforms.planeSize.value = new THREE.Vector2(xTile(), yTile());
    uniforms.drawMode.value = drawMode;
    uniforms.shadowMode.value = shadowMode;
    uniforms.frequency.value = frequency;
    uniforms.hueShift.value = hueShift;
}
