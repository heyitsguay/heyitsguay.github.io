// Create a scene
var scene = new THREE.Scene();

// Create a camera
var camera = new THREE.PerspectiveCamera(
    60,  // Field of view
    window.innerWidth/window.innerHeight,  // Aspect ratio
    0.1,  // Near clipping plane
    10000  // Far clipping plane
);
// Position the camera
camera.position.set(0, 400, 0);
// Point the camera at the origin
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Create a renderer
var renderer = new THREE.WebGLRenderer({antialias: true});
// Renderer setup
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
renderer.setClearColor(0xcecece);
// Add renderer to the document
document.body.appendChild(renderer.domElement);

// Add an ambient light
var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

var n_x = 50;
var n_y = 25;
var ts = 20;
var dx = n_x * ts;
var dy = n_y * ts;

var geo = new THREE.PlaneGeometry(dx, dy, n_x, n_y);
for(var j = 0; j < geo.faces.length; j++) {
    var face = geo.faces[j];
    var color = new THREE.Color(0x0000ff);
    var h = j / (geo.faces.length - 1);
    var v = (Math.sin(j / 4 ) + 1) / 2;
    color.setHSL(v, 1., 0.45);
    // face.color = color;
    for (var k = 0; k < 3; k++) {
        face.vertexColors[k] = color;
    }
}


// Create a plane
var plane = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial(
        {color: 0xffffff, vertexColors: THREE.FaceColors}
    )
);
// Rotate that ish
plane.lookAt(camera.position);

// plane.dynamic = true;
// geo.dynamic = true;
// geo.verticesNeedUpdate = true;
// plane.material.needsUpdate = true;

// Add to the scene
scene.add(plane);

// Add a controller
var controls = new THREE.OrbitControls(camera, renderer.domElement);
// controls.target = new THREE.Vector3(0, 15, 0);
controls.maxPolarAngle = Math.PI / 2;
controls.addEventListener('change', function(){renderer.render(scene, camera);});

function animate() {
    requestAnimationFrame(animate);
    update();
    render();

}

function render() {
    renderer.render(scene, camera);
}

var startTime = new Date();

function update() {
    var t = (new Date() - startTime) / 1000;

    for(var j = 0; j < plane.geometry.faces.length; j++) {
        var face = plane.geometry.faces[j];
        var color = new THREE.Color(0x0000ff);
        var q = (Math.cos(0.05 * t) + 1) / 2;
        var h = q * (Math.sin(j / 4 + 0.8585 * t) + 1) / 2 +
            (1 - q) * (Math.cos(j / 13.825 + 2.1 * t) + 1) / 2;
        color.setHSL(h, 1., 0.45);
        for (var k = 0; k < 3; k++) {
            face.vertexColors[k] = color;
        }
    }
    plane.geometry.elementsNeedUpdate = true;
    plane.geometry.colorsNeedUpdate = true;

}

animate();