// THREE.js scene
var scene;
// Scene camera
var camera;
// THREE.js renderer
var renderer;
// Plane geometry
var geo;
// Plane shader
var shaderMaterial;
// Plane mesh
var plane;
// The controls
var controls;
// Plane shader uniforms
var uniforms;
// Shader mode
var mode = 0;
// Number of shader draw modes
var numModes = 2;

// Is the menu overlay visible?
var menuVisible = true;

// Tile size
var tileSize = 20;
// Controls how granular the controls to change tile size are
var tileSizeStep = 1.2;
function xTile() {
    return Math.ceil(xSize / tileSize);
}
function yTile() {
    return Math.ceil(ySize / tileSize);
}
// Size of the tile plane in whatever units THREE.js geometries use
var xSize;
var ySize;

// Start time for the sketch
var startTime = new Date().getTime();
// Time of the last frame
var lastTime = startTime;
// Time of the current frame
var thisTime;
// Time elapsed since the last frame
var elapsedTime;
// Time speed effect factor
var timeSpeed = 1;
// Maximum time speed factor
var timeSpeedMax = 100;
// Minimum time speed factor
var timeSpeedMin = 0.08;
// Controls how granular the controls to change time speed are
var timeSpeedStep = 1.2;

var t = 0;

var firstTime = true;

// When true, don't animate
var paused = false;

document.addEventListener('keypress', onKeyPress);
$(window).resize(onResize);

run();

/*
 * Run the sketch
 */
function run() {
    // Initialize the sketch
    init();
    // Run the sketch
    animate();
}

function onResize() {
    cancelAnimationFrame(animate);
    run();
}

/*
 * Initialize the scene and its objects.
 */
function init() {
    xSize = window.innerWidth;
    ySize = window.innerHeight;
    // Create the scene
    scene = new THREE.Scene();

    // Create the camera
    camera = new THREE.PerspectiveCamera(
        60,  // Field of view
        xSize/ySize,  // Aspect ratio
        0.1,  // Near clipping plane
        100000  // Far clipping plane
    );
    // Position the camera
    camera.position.set(0, 0, 800);
    // Point the camera at the origin
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    if (firstTime) {
        // Create the renderer
        renderer = new THREE.WebGLRenderer({antialias: false});
        renderer.setClearColor(0xcecece);
        // Add the renderer to the DOM

        document.body.appendChild(renderer.domElement);
        firstTime = false;
    }
    // Renderer size and aspect setup
    resize();

    // Add an ambient light to the scene
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Create the plane geometry
    geo = new THREE.PlaneGeometry(xSize, ySize, 1, 1);
    // Create the plane material
    buildShader();
    // Create the plane mesh
    plane = new THREE.Mesh(geo, shaderMaterial);
    // Orient the plane towards the camera
    plane.lookAt(camera.position);
    // Add the plane to the scene
    scene.add(plane);

    // Create the controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    // Keep it from going crazy
    controls.maxPolarAngle = Math.PI;
    // Use WASD
    controls.keys = {
        LEFT: 65,
        UP: 87,
        RIGHT: 68,
        BOTTOM: 83
    };
    controls.enableRotate = false;
    controls.enableDamping = true;
    controls.keyPanSpeed = tileSize;
}

/*
 * Load a shader from GLSL code written in text files.
 */
function fileToString(shaderName) {
    var xhr = new XMLHttpRequest();

    // String containing the shader source
    var shaderText = null;
    // Load the file
    xhr.open("GET", shaderName, false);
    xhr.onload = function() {
        shaderText = this.responseText;
    };
    xhr.send(null);

    return shaderText;
}

/*
 *
 */
function buildShader() {
    uniforms = {
        time: {value: 0.},
        planeSize: {value: new THREE.Vector2(xTile(), yTile())},
        mode: {value: mode}
    };
    shaderMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: fileToString('js/glsl/quad.vert'),
        fragmentShader: fileToString('js/glsl/plane.frag')
    });
}

/*
 * Update renderer and camera when the window is resized.
 */
function resize() {
    // Set renderer size and pixel ratio
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setPixelRatio(1);
    // renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
    // Set camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
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
    if (!paused) {
        // Update scene logic
        update();
        // Render the scene
        render();
    }
}

/*
 * Handle keypress events.
 */
function onKeyPress(event) {
    var keyName = event.key;

    // E - toggle through modes
    if (keyName === 'e') {
        mode = (mode + 1) % numModes;
    }

    // F - decrease time speed
    if (keyName === 'f') {
        // Min speed
        timeSpeed = Math.max(timeSpeed / timeSpeedStep, timeSpeedMin);
    }

    // G - decrease tile size
    if (keyName === 'g') {
        var downSize = Math.floor(tileSize / tileSizeStep);
        tileSize = Math.max(downSize, 1);
    }

    // Q - toggle menu visibility
    if (keyName === 'q') {
        menuVisible = !menuVisible;
        if (menuVisible) {
            $('.toggle').show();
        }
        else {
            $('.toggle').hide();
        }
    }

    // R - increase time speed
    if (keyName === 'r') {
        // Max speed
        timeSpeed = Math.min(timeSpeed * timeSpeedStep, timeSpeedMax);
    }

    // T - increase tile size
    if (keyName === 't') {
        var upSize = Math.ceil(tileSize * tileSizeStep);
        tileSize = Math.min(upSize, Math.min(xSize, ySize));
    }

    if (keyName === ' ') {
        paused = !paused;
    }

}

/*
 * Render the scene.
 */
function render() {
    renderer.render(scene, camera);
}

/*
 * Update scene logic.
 */
function update() {

    uniforms.time.value += timeSpeed * elapsedTime / 1000;
    uniforms.planeSize.value = new THREE.Vector2(xTile(), yTile());
    uniforms.mode.value = mode;

    controls.update();
}
