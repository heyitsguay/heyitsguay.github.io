const shaderFiles = [
    'main.vert',
    'main.frag'
];
let shaderSources = {};

let container;
let camera, scene, renderer;

let flowUniforms = {
    uView: {value: null},
    uPast: {value: null},
    offset: {value: 0.1},
    lambda: {value: 0.001},
    inRange: {value: new THREE.Vector4(-1, -1, 1, 1)},
    outRange: {value: new THREE.Vector4(0, 0, 1, 1)}
};

let flowMaterial;

