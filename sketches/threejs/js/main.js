// Create a scene
var scene = new THREE.Scene();

// Create a camera
var camera = new THREE.PerspectiveCamera(
    60,  // Field of view
    window.innerWidth/window.innerHeight,  // Aspect ratio
    0.1,  // Near clipping plane
    1000  // Far clipping plane
);
// Position the camera
camera.position.set(5, 5, 0);
// Point the camera at the origin
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Create a renderer
var renderer = new THREE.WebGLRenderer({antialias: true});
// Renderer setup
renderer.setClearColor(0xe6f6ff);
// Add renderer to the document
document.body.appendChild(renderer.domElement);

// Create a plane
var plane = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5, 10, 10),
    new THREE.MeshBasicMaterial({color: 0x393839, wireframe: true})
);
// Rotate that ish
plane.rotateX(Math.PI / 2);
// Add to the scene
scene.add(plane);

// Render the scene + camera
renderer.render(scene, camera);

// Add a controller
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', function(){renderer.render(scene, camera);});