// THREE.js scene
var scene;
// Scene camera
var camera;
// THREE.js renderer
var renderer;
// Plane geometry
var geo;
// Plane mesh
var plane;
// The controls
var controls;

// Is the menu overlay visible?
var menuVisible = true;

// Number of tiles in the x and y dimensions
var xTiles = 128;
var yTiles = 72;
// Tile size
var tileSize = 20;
// Size of the tile plane in whatever units THREE.js geometries use
var xSize = xTiles * tileSize;
var ySize = yTiles * tileSize;

// Start time for the sketch
var startTime = new Date().getTime();
// Time of the last frame
var lastTime = startTime;
// Time of the current frame
var thisTime;
// Time speed effect factor
var timeSpeed = 1;
// Maximum time speed factor
var timeSpeedMax = 100;
// Minimum time speed factor
var timeSpeedMin = 0.08;
// Controls how granular the controls to change time speed are
var timeSpeedStepSize = 1.2;

// FPS estimate
var fps = 60;

var t = 0;
var color = new THREE.Color(0x0000ff);

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
    // cancelAnimationFrame(animate);
    // resize();
    // animate();
}

/*
 * Initialize the scene and its objects.
 */
function init() {
    // Create the scene
    scene = new THREE.Scene();

    // Create the camera
    camera = new THREE.PerspectiveCamera(
        60,  // Field of view
        window.innerWidth/window.innerHeight,  // Aspect ratio
        0.1,  // Near clipping plane
        10000  // Far clipping plane
    );
    // Position the camera
    camera.position.set(0, 0, 400);
    // Point the camera at the origin
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    // Create the renderer
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setClearColor(0xcecece);
    // Add the renderer to the DOM
    document.body.appendChild(renderer.domElement);
    // Renderer size and aspect setup
    resize();

    // Add an ambient light to the scene
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Create the plane geometry
    geo = new THREE.PlaneGeometry(xSize, ySize, xTiles, yTiles);
    // Create the plane material
    var material = new THREE.MeshBasicMaterial(
        {vertexColors: THREE.FaceColors});
    // Create the plane mesh
    plane = new THREE.Mesh(geo, material);
    // Orient the plane towards the camera
    plane.lookAt(camera.position);
    // Add the plane to the scene
    scene.add(plane);

    // Create the controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    // Keep it from going crazy
    controls.maxPolarAngle = Math.PI / 2;
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
    // Update scene logic
    update();
    // Render the scene
    render();
}

/*
 * Handle keypress events.
 */
function onKeyPress(event) {
    var keyName = event.key;

    // F - decrease time speed
    if (keyName === 'f') {
        // Min speed
        timeSpeed = Math.max(timeSpeed / timeSpeedStepSize, timeSpeedMin);
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
        timeSpeed = Math.min(timeSpeed * timeSpeedStepSize, timeSpeedMax);
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
    var face1, face2, q, h;
    thisTime = new Date().getTime();
    // Elapsed time (in ms)
    var elapsedTime = thisTime - lastTime;
    lastTime = thisTime;

    updateFPS(elapsedTime);

    t += timeSpeed * elapsedTime / 1000;

    // Each tile is composed of two triangular faces. Iterate through the
    // plane geometry's faces in pairs, setting the same color for the
    // tile's faces
    for(var j = 0; j < plane.geometry.faces.length - 1; j+= 2) {
        // The two faces
        // face1 = plane.geometry.faces[j];
        // face2 = plane.geometry.faces[j+1];
        // Generate a color
        // Changes the relative importance of h's sine and cosine terms over
        // time
        q = (Math.cos(0.05 * t) + 1) / 2;
        // Hue is a weighted sum of two sine and cosine terms with
        // different frequencies
        h = q * (Math.sin(j / 4 + 0.8585 * t) + 1) / 2 +
            (1 - q) * (Math.cos(j / 13.825 + 2.1 * t) + 1) / 2;
        // Create color in HSL space
        plane.geometry.faces[j].color.setHSL(mod1(h + 0.01 * t), 1, 0.5);
        // Assign the color to each vertex of each face
        for (var k = 0; k < 3; k++) {
            plane.geometry.faces[j].vertexColors[k] = plane.geometry.faces[j].color;
            plane.geometry.faces[j+1].vertexColors[k] = plane.geometry.faces[j].color;
        }
    }
    // Plane geometry needs to be updated
    plane.geometry.elementsNeedUpdate = true;

    controls.update();

}

function updateFPS(elapsed) {
    var fpsFilter = 30;
    if (elapsed > 0) {
        fps += (1000. / elapsed - fps) / fpsFilter;
    }
    var counter = document.getElementById("fpscounter");
    if (counter != null) {
        counter.innerHTML = fps.toFixed(0) + " fps";
    }
}

function mod1(x) {
    return (x % 1 + 1) % 1;
}