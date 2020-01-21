// List of shader source file names
const shaderFiles = [
    'star.vert',
    'star.frag'
];
let shaderSources = {};

let container;
let camera, scene, renderer, stats, clock;

let numStars = 20000;
let starGeometry, instancedStarGeometry, starMesh;

let starfieldUniforms = {
    t: {value: null},
    uScale: {value: null},
    uMVP: {value: null}
};

let starfieldAttributes = {
    'center': null,
    'color': null
};
let centerArray, colorArray;
let starfieldMaterial;

let starXMin = -200;
let starXMax = 200;
let starYMin = -150;
let starYMax = 150;
let starZMin = 50;
let starZMax = 150;

let gui;
let guiParams = {
    starSpeed: -3.,
    starSize: 0.11};
    // hueMax: 0.5,
    // satMax: 0.5
// };


// ----------------------------


$(document).ready(function() {
    loadFiles().then(main);
});


/**
 * Sketch on-ready function.
 */
function main() {
    init();
    animate();
}


function init() {
    container = document.createElement('div');
    document.body.appendChild(container);
    clock = new THREE.Clock;
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 500);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f061f);

    initStarfield();

    initRenderer();

    initGUI();

    window.addEventListener('resize', onWindowResize, false);

    document.onkeydown = handleKeys;

    let ham = new Hammer(renderer.domElement);

    ham.on('doubletap', function() {
        dat.GUI.toggleHide();
    });
}


function initStarfield() {
    initStarGeometry();
    initStars();
    initStarfieldUniforms();
    initStarfieldAttributes();

    starfieldMaterial = new THREE.RawShaderMaterial({
        vertexShader: shaderSources['star.vert'],
        fragmentShader: shaderSources['star.frag'],
        uniforms: starfieldUniforms
    });
    starMesh = new THREE.Mesh(instancedStarGeometry, starfieldMaterial);
    scene.add(starMesh);
}


function initRenderer() {
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
}


function initGUI() {
    stats = new Stats();
    // stats.showPanel(0);
    document.body.appendChild(stats.domElement);

    gui = new dat.GUI();
    gui.add(guiParams, 'starSpeed').min(-4).max(0).step(0.01);
    gui.add(guiParams, 'starSize').min(0.01).max(0.7).step(0.01).onChange(function(v) {
        starfieldUniforms.uScale.value = v;
    });
    // gui.add(guiParams, 'hueMax').min(0).max(1).step(0.02).onChange(function(v) {
    //     updateStarColors();
    // });

}


function handleKeys(e) {
    switch (e.keyCode) {
        case 32:
            dat.GUI.toggleHide();
    }
}


function initStarGeometry() {
    // Stars are spheres
    starGeometry = new THREE.CircleBufferGeometry(1, 32);
    instancedStarGeometry = new THREE.InstancedBufferGeometry();
    // Copy star geometry attributes to its instanced counterpart
    Object.keys(starGeometry.attributes).forEach(attributeName=>{
        instancedStarGeometry.attributes[attributeName] = starGeometry.attributes[attributeName]});
    // Copy over vertex index
    instancedStarGeometry.index = starGeometry.index;
    instancedStarGeometry.maxInstancedCount = numStars;
}


function initStarfieldUniforms() {
    starfieldUniforms.t.value = 0.;
    starfieldUniforms.uScale.value = guiParams['starSize'];
    starfieldUniforms.uMVP.value = camera.projectionMatrix;
}


function initStarfieldAttributes() {
    starfieldAttributes['center'] = new THREE.InstancedBufferAttribute(centerArray, 3);
    instancedStarGeometry.setAttribute(
        'aCenter',
        starfieldAttributes['center']);

    starfieldAttributes['color'] = new THREE.InstancedBufferAttribute(colorArray, 3);
    instancedStarGeometry.setAttribute(
        'aColor',
       starfieldAttributes['color']);
}

function initStars() {
    centerArray = new Float32Array(numStars * 3);
    colorArray = new Float32Array(numStars * 3);
    for (let i = 0; i < numStars; i++) {
        resetStar(i, true);
    }
}

function resetStar(i, firstTime) {
    if (firstTime) {
        centerArray[i * 3] = starXMin + Math.random() * (starXMax - starXMin);
    } else {
        centerArray[i * 3] = starXMax + 5 * (-1 + 2 * Math.random());
    }
        centerArray[i * 3 + 1] = starYMin + Math.random() * (starYMax - starYMin);
        centerArray[i * 3 + 2] = -(starZMin + Math.random() * (starZMax - starZMin));


    // H S B coordinates
    colorArray[i * 3] = 0.6 * Math.random();
    colorArray[i * 3 + 1] = 0.33 * Math.random();
    colorArray[i * 3 + 2] = 0.8 + 0.2 * Math.random();
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


function animate() {
    requestAnimationFrame(animate);

    update();

    render();

    stats.update();

}

function update() {
    for (let i = 0; i < numStars; i++) {
        centerArray[i * 3] -= 10 ** guiParams['starSpeed'];
        if (centerArray[i * 3] < starXMin) {
            resetStar(i, false);
        }
    }
    starMesh.geometry.attributes.aCenter.needsUpdate = true;

    starfieldUniforms.t.value += clock.getDelta() / 1000;
}

function render() {
    renderer.render(scene, camera);

}

function loadFiles() {
    return $.when.apply($, shaderFiles.map(loadFile));
}
function loadFile(fileName) {
    let fullName = './glsl/' + fileName;
    return $.ajax(fullName).then(function(data) {
        shaderSources[fileName] = data;
    });
}
