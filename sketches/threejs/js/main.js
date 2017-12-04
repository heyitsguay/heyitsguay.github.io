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
camera.position.set(0, 30, 50);
// Point the camera at the origin
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Create a renderer
var renderer = new THREE.WebGLRenderer({antialias: true});
// Renderer setup
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
renderer.setClearColor(0xe6f6ff);
// Enable shadow mapping
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Add renderer to the document
document.body.appendChild(renderer.domElement);

// Add an ambient light
var ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

// Point light
var pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(25, 50, 25);
pointLight.castShadow = true;
pointLight.shadow.mapSize.width = 1024;
pointLight.shadow.mapSize.height = 1024;
scene.add(pointLight);

// Material
var shadowMaterial = new THREE.ShadowMaterial({color: 0xeeeeee});
shadowMaterial.opacity = 0.5;

// Ground object
var groundMesh = new THREE.Mesh(new THREE.BoxGeometry(100, .1, 100),
                                shadowMaterial);
scene.add(groundMesh);

// A thang
var shapeOne = new THREE.Mesh(
    new THREE.OctahedronGeometry(10, 1),
    new THREE.MeshStandardMaterial({
        color: 0xff0051,
        shading: THREE.FlatShading,
        metalness: 0,
        roughness: 0.8
    })
);
shapeOne.position.y += 10;
shapeOne.rotateZ(Math.PI/3);
shapeOne.castShadow = true;
scene.add(shapeOne);

// Thang 2
var shapeTwo = new THREE.Mesh(
    new THREE.OctahedronGeometry(5, 1),
    new THREE.MeshStandardMaterial({
        color: 0x47689b,
        shading: THREE.FlatShading,
        metalness: 0,
        roughness: 0.8
    })
);
shapeTwo.position.y += 5;
shapeTwo.position.x += 15;
shapeTwo.rotateZ(Math.PI/5);
shapeTwo.castShadow = true;
scene.add(shapeTwo);

// Render the scene + camera
renderer.render(scene, camera);

// Add a controller
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target = new THREE.Vector3(0, 15, 0);
controls.maxPolarAngle = Math.PI / 2;
controls.addEventListener('change', function(){renderer.render(scene, camera);});