// List of shader source file names
const shaderFiles = [
    'starField.vert',
    'starField.frag',
    'quad.vert',
    'shootingStar.frag',
    'shootingStar2.frag',
    'main.frag'
];
let shaderSources = {};

let container, renderer, stats, clock;

let starfieldUniforms = {
    uT: {value: null},
    uScale: {value: null},
    uMVP: {value: null},
    uStarZMin: {value: null},
    uStarZInverse: {value: null},
    uScreenInverse: {value: null}
};

const starfieldScale = 2;
let starfieldAttributes = {
    'center': null,
    'color': null,
    'frequency': null,
    'phase': null
};
let centerArray, colorArray, frequencyArray, phaseArray;
let starGeometry, instancedStarGeometry;
let starfieldCamera, starfieldMaterial, starfieldMesh, starfieldBuffer, starfieldScene;

let shootingStarUniforms = {
    uTLast: {value: null},
    uT: {value: null},
    uScreenInverse: {value: null},
    uPongTex: {value: null},
}

let quadGeometry, dummyCamera;
let shootingStarMaterial, shootingStarPongBuffer,  shootingStarMesh, shootingStarScene;
let pongBufferReadIdx = 0;

let mainUniforms = {
    uScreenInverse: {value: null},
    uStarfieldTex: {value: null},
    uShootingStarTex: {value: null},
}
let mainMaterial, mainMesh, mainScene;

let initialized = false;

let gui, fStars, fStarPositions, fStarColors, fStarGlimmer;
let guiParams = {
    starSpeed: -2.15,
    starSize: 0.13,
    numStars: 120000,
    starXMin: -1000,
    starXMax: 1000,
    starYMin:-1000,
    starYMax: 1000,
    starZMin: 50,
    starZMax: 1000,
    starZExp: 1,
    starHueMin: 0,
    starHueMax: 0.5,
    starSatMin: 0,
    starSatMax: 0.3,
    starBrightMin: 0.9,
    starBrightMax: 1.,
    starBrightExp: 1.,
    glimmerFreqMin: 0.1,
    glimmerFreqMax: 1.9,
    glimmerPhaseMin: 0,
    glimmerPhaseMax: 2 * Math.PI,
    resetPositions: function() {
        initStars();
    },
    resetAll: function() {
        resetGUI();
        initStars();
    },
};


$(document).ready(function() {
    loadFiles().then(main);
});


/**
 * Sketch on-ready function.
 */
function main() {
    container = document.createElement('div');
    document.body.appendChild(container);
    clock = new THREE.Clock;
    starfieldCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 1000);
    dummyCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    starfieldScene = new THREE.Scene();
    starfieldScene.background = new THREE.Color(0x0f061f);
    shootingStarScene = new THREE.Scene();
    mainScene = new THREE.Scene();
    starfieldBuffer = new THREE.WebGLRenderTarget(starfieldScale*window.innerWidth, starfieldScale*window.innerHeight, {
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
    });
    let shootingStarBufferA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
    });
    let shootingStarBufferB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
    });
    shootingStarPongBuffer = [shootingStarBufferA, shootingStarBufferB];


    restart();
}

function restart() {
    init();
    animate();
}


function init() {
    for (let scene of [starfieldScene, shootingStarScene, mainScene])  {
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
    }

    initStarfield();

    initShootingStar();

    initMain();

    initRenderer();

    initGUI();

    if(!initialized) {
        window.addEventListener('resize', onWindowResize, false);

        document.onkeydown = handleKeys;

        let ham = new Hammer(renderer.domElement);

        ham.on('doubletap', function() {
            dat.GUI.toggleHide();
        });

        initialized = true;
    }
}


function initStarfield() {
    while (starfieldScene.children.length > 0) {
        starfieldScene.remove(starfieldScene.children[0]);
    }
    centerArray = new Float32Array(guiParams.numStars * 3);
    colorArray = new Float32Array(guiParams.numStars * 3);
    frequencyArray = new Float32Array(guiParams.numStars);
    phaseArray = new Float32Array(guiParams.numStars);
    initStarGeometry();
    initStars();
    initStarfieldUniforms();
    initStarfieldAttributes();

    starfieldMaterial = new THREE.RawShaderMaterial({
        vertexShader: shaderSources['starField.vert'],
        fragmentShader: shaderSources['starField.frag'],
        uniforms: starfieldUniforms,
    });
    starfieldMesh = new THREE.Mesh(instancedStarGeometry, starfieldMaterial);
    starfieldScene.add(starfieldMesh);
}


function initShootingStar() {
    quadGeometry = new THREE.BufferGeometry();
    let positions = [
        -1, -1, 0,
        1, -1, 0,
        -1, 1, 0,
        1, 1, 0,
        -1, 1, 0,
        1, -1, 0
    ];
    let positionAttribute = new THREE.Float32BufferAttribute(positions, 3);
    quadGeometry.setAttribute('position', positionAttribute);

    shootingStarUniforms.uTLast.value = 0.;
    shootingStarUniforms.uT.value = 0.;
    shootingStarUniforms.uScreenInverse.value = new THREE.Vector2(1. / window.innerWidth, 1. / window.innerHeight);
    shootingStarUniforms.uPongTex.value = shootingStarPongBuffer[pongBufferReadIdx].texture;

    shootingStarMaterial = new THREE.RawShaderMaterial({
        vertexShader: shaderSources['quad.vert'],
        fragmentShader: shaderSources['shootingStar2.frag'],
        uniforms: shootingStarUniforms,
    });
    shootingStarMesh = new THREE.Mesh(quadGeometry, shootingStarMaterial);
    shootingStarScene.add(shootingStarMesh);
}


function initMain() {
    mainUniforms.uScreenInverse.value = new THREE.Vector2(1. / window.innerWidth, 1. / window.innerHeight);
    mainUniforms.uStarfieldTex.value = starfieldBuffer.texture;
    mainUniforms.uShootingStarTex.value = shootingStarPongBuffer[pongBufferReadIdx].texture;

    mainMaterial = new THREE.RawShaderMaterial({
        vertexShader: shaderSources['quad.vert'],
        fragmentShader: shaderSources['main.frag'],
        uniforms: mainUniforms,
    });
    mainMesh = new THREE.Mesh(quadGeometry, mainMaterial);
    mainScene.add(mainMesh);
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

    fStars = gui.addFolder('Starfield');
    fStars.add(guiParams, 'starSpeed').min(-5).max(0).step(0.005);
    fStars.add(guiParams, 'starSize').min(0.01).max(5).step(0.01).onChange(function(v) {
        starfieldUniforms.uScale.value = v;
    });
    fStars.add(guiParams, 'numStars').min(5000).max(250000).step(5000).onChange(function(v) {
        initStarfield();
    });

    fStarPositions = fStars.addFolder('Star Bounding Box');
    fStarPositions.add(guiParams, 'starXMin').min(-1000).max(-10).step(1);
    fStarPositions.add(guiParams, 'starXMax').min(10).max(1000).step(1);
    fStarPositions.add(guiParams, 'starYMin').min(-1000).max(-10).step(1);
    fStarPositions.add(guiParams, 'starYMax').min(10).max(1000).step(1);
    fStarPositions.add(guiParams, 'starZMin').min(1).max(500).step(1).onChange(function(v) {
        starfieldUniforms.uStarZMin.value = v;
    });
    fStarPositions.add(guiParams, 'starZMax').min(1).max(1000).step(1).onChange(function(v) {
        if (v - guiParams.starZMin < 1) {
            starfieldUniforms.uStarZInverse.value = 1;
        }  else {
            starfieldUniforms.uStarZInverse.value = 1. / (v - guiParams.starZMin);
        }
    });
    fStarPositions.add(guiParams, 'starZExp').min(0).max(10).step(0.01);

    fStarColors = fStars.addFolder('Star Colors');
    fStarColors.add(guiParams, 'starHueMin').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starHueMax').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starSatMin').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starSatMax').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starBrightMin').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starBrightMax').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starBrightExp').min(0.).max(10.).step(0.01);

    fStarGlimmer = fStars.addFolder('Star Glimmer');
    fStarGlimmer.add(guiParams, 'glimmerFreqMin').min(0.01).max(20).step(0.01);
    fStarGlimmer.add(guiParams, 'glimmerFreqMax').min(0.01).max(20).step(0.01);
    fStarGlimmer.add(guiParams, 'glimmerPhaseMin').min(0).max(2 * Math.PI).step(0.01);
    fStarGlimmer.add(guiParams, 'glimmerPhaseMax').min(0).max(2 * Math.PI).step(0.01);

    gui.add(guiParams, 'resetPositions')
    gui.add(guiParams, 'resetAll');

    
    fStars.open();

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
    instancedStarGeometry.maxInstancedCount = guiParams.numStars;
}


function initStarfieldUniforms() {
    starfieldUniforms.uT.value = 0.;
    starfieldUniforms.uScale.value = guiParams.starSize;
    starfieldUniforms.uMVP.value = starfieldCamera.projectionMatrix;
    starfieldUniforms.uStarZMin.value = guiParams.starZMin;
    starfieldUniforms.uStarZInverse.value = 1. / (guiParams.starZMax - guiParams.starZMin);
    starfieldUniforms.uScreenInverse.value = new THREE.Vector2(1. / (starfieldScale * window.innerWidth), 1. / (starfieldScale * window.innerHeight));
}


function initStars() {
    for (let i = 0; i < guiParams.numStars; i++) {
        resetStar(i, true);
    }
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

    starfieldAttributes['frequency'] = new THREE.InstancedBufferAttribute(frequencyArray, 1);
    instancedStarGeometry.setAttribute(
        'aFrequency',
        starfieldAttributes['frequency']);

    starfieldAttributes['phase'] = new THREE.InstancedBufferAttribute(phaseArray, 1);
    instancedStarGeometry.setAttribute(
        'aPhase',
        starfieldAttributes['phase']);
}

function resetGUI() {
    for (const f in gui.__folders) {gui.__folders[f].__controllers.forEach(c => c.setValue(c.initialValue))}
}


function resetStar(i, firstTime) {
    let starXMin = guiParams.starXMin;
    let starXMax = Math.max(starXMin, guiParams.starXMax);
    let starYMin = guiParams.starYMin;
    let starYMax = Math.max(starYMin, guiParams.starYMax);
    let starZMin = guiParams.starZMin;
    let starZMax = Math.max(starZMin, guiParams.starZMax);
    let starZExp = guiParams.starZExp;

    let starHueMin = guiParams.starHueMin;
    let starHueMax = Math.max(starHueMin, guiParams.starHueMax);
    let starSatMin = guiParams.starSatMin;
    let starSatMax = Math.max(starSatMin, guiParams.starSatMax);
    let starBrightMin = guiParams.starBrightMin;
    let starBrightMax = Math.max(starBrightMin, guiParams.starBrightMax);
    let starBrightExp = guiParams.starBrightExp;

    let glimmerFreqMin = guiParams.glimmerFreqMin;
    let glimmerFreqMax = Math.max(glimmerFreqMin, guiParams.glimmerFreqMax);
    let glimmerPhaseMin = guiParams.glimmerPhaseMin;
    let glimmerPhaseMax = Math.max(glimmerPhaseMin, guiParams.glimmerPhaseMax);

    if (firstTime) {
        // Spawn randomly in-bounds
        centerArray[i * 3] = starXMin + Math.random() * (starXMax - starXMin);
    } else {
        // Spawn near the right boundary
        centerArray[i * 3] = starXMax + 5 * (-1 + 2 * Math.random());
    }
        centerArray[i * 3 + 1] = starYMin + Math.random() * (starYMax - starYMin);
        centerArray[i * 3 + 2] = -(starZMin + Math.pow(Math.random(), starZExp) * (starZMax - starZMin));


    // H S B coordinates
    colorArray[i * 3] = starHueMin + Math.random() * (starHueMax - starHueMin);
    colorArray[i * 3 + 1] = starSatMin + Math.random() * (starSatMax - starSatMin);
    colorArray[i * 3 + 2] = starBrightMin + Math.pow(Math.random(), starBrightExp) * (starBrightMax - starBrightMin);

    frequencyArray[i] = glimmerFreqMin + Math.random() * (glimmerFreqMax - glimmerFreqMin);
    phaseArray[i] = glimmerPhaseMin + Math.random() * (glimmerPhaseMax - glimmerPhaseMin);
}


function onWindowResize() {
    let w = window.innerWidth;
    let h = window.innerHeight;
    for (let camera of [starfieldCamera, dummyCamera]) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    renderer.setSize(w, h);
    starfieldUniforms.uScreenInverse.value = new THREE.Vector2(1. / (starfieldScale * w), 1. / (starfieldScale * h));
    shootingStarUniforms.uScreenInverse.value = new THREE.Vector2(1. / w, 1. / h);
    mainUniforms.uScreenInverse.value = new THREE.Vector2(1. / w, 1. / h);
    starfieldBuffer.setSize(starfieldScale*w, starfieldScale*h);
    for (let buffer of shootingStarPongBuffer) {
        buffer.setSize(w, h);
    }
}


function animate() {
    requestAnimationFrame(animate);

    update();

    // cap.read(frame);
    // fgbg.apply(frame, fgmask);

    render();

    stats.update();

}

function update() {
    for (let i = 0; i < guiParams.numStars; i++) {
        let speed = 10 ** (guiParams['starSpeed'] - hashInt(i));
        centerArray[i * 3] -= speed;
        if (centerArray[i * 3] < guiParams['starXMin']) {
            resetStar(i, false);
        }
    }
    starfieldMesh.geometry.attributes.aCenter.needsUpdate = true;
    starfieldMesh.geometry.attributes.aColor.needsUpdate = true;
    starfieldMesh.geometry.attributes.aFrequency.needsUpdate = true;
    starfieldMesh.geometry.attributes.aPhase.needsUpdate = true;

    let dt = clock.getDelta();
    starfieldUniforms.uT.value += dt;
    shootingStarUniforms.uTLast.value = shootingStarUniforms.uT.value;
    shootingStarUniforms.uT.value += dt;
    
    pongBufferReadIdx = 1 - pongBufferReadIdx;
    shootingStarUniforms.uPongTex.value = shootingStarPongBuffer[pongBufferReadIdx].texture;
    mainUniforms.uShootingStarTex.value = shootingStarPongBuffer[1 - pongBufferReadIdx].texture;
}

function render() {
    renderer.setRenderTarget(starfieldBuffer);
    renderer.render(starfieldScene, starfieldCamera);

    renderer.setRenderTarget(shootingStarPongBuffer[1 - pongBufferReadIdx]);
    renderer.render(shootingStarScene, dummyCamera);

    renderer.setRenderTarget(null);
    renderer.render(mainScene, dummyCamera);
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


function hashInt(int) {
    int = int >>> 0;  // Ensure unsigned 32-bit integer
    int = ((int + 0x7ed55d16) + (int << 12)) & 0xffffffff;
    int = ((int ^ 0xc761c23c) ^ (int >>> 19)) & 0xffffffff;
    int = ((int + 0x165667b1) + (int << 5)) & 0xffffffff;
    int = ((int + 0xd3a2646c) ^ (int << 9)) & 0xffffffff;
    int = ((int + 0xfd7046c5) + (int << 3)) & 0xffffffff;
    int = ((int ^ 0xb55a4f09) ^ (int >>> 16)) & 0xffffffff;
    return (int >>> 0) / 0xffffffff;
}
