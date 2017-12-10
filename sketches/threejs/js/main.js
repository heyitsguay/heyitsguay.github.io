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

// Number of tiles in the x and y dimensions
var xTiles = 64;
var yTiles = 36;
// Tile size
var tileSize = 20;
// Size of the tile plane in whatever units THREE.js geometries use
var xSize = xTiles * tileSize;
var ySize = yTiles * tileSize;

// Start time for the sketch
var startTime = new Date();

// Initialize the sketch
init();
// Run the sketch
animate();

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
    // Add the renderer to the DOM
    document.body.append(renderer.domElement);
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
}

/*
 * Update renderer and camera when the window is resized.
 */
function resize() {
    // Set renderer size and pixel ratio
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
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
 * Render the scene.
 */
function render() {
    renderer.render(scene, camera);
}

/*
 * Update scene logic.
 */
function update() {
    // Time since the sketch started, in milliseconds
    var t = (new Date() - startTime) / 1000;

    // Each tile is composed of two triangular faces. Iterate through the
    // plane geometry's faces in pairs, setting the same color for the
    // tile's faces
    for(var j = 0; j < plane.geometry.faces.length - 1; j+= 2) {
        // The two faces
        var face1 = plane.geometry.faces[j];
        var face2 = plane.geometry.faces[j+1];
        // Generate a color
        var color = new THREE.Color(0x0000ff);
        // Changes the relative importance of h's sine and cosine terms over
        // time
        var q = (Math.cos(0.05 * t) + 1) / 2;
        // Hue is a weighted sum of two sine and cosine terms with
        // different frequencies
        var h = q * (Math.sin(j / 4 + 0.8585 * t) + 1) / 2 +
            (1 - q) * (Math.cos(j / 13.825 + 2.1 * t) + 1) / 2;
        // Create color in HSL space
        color.setHSL(h, 1, 0.45);
        // Assign the color to each vertex of each face
        for (var k = 0; k < 3; k++) {
            face1.vertexColors[k] = color;
            face2.vertexColors[k] = color;
        }
    }
    // Plane geometry needs to be updated
    plane.geometry.elementsNeedUpdate = true;

}
