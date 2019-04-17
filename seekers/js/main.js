import Detector from './Detector.js';
import ComputeRenderer from './ComputeRenderer.js';
import random from './random.js'

const shaderFiles = [
    'diffuse.frag',
    'quad.vert',
    'renderHeat.frag',
    'seekerPosition.frag',
    'seekerVelocity.frag',
    'renderSeekers.vert',
    'renderSeekers.frag'
];
let shaderSources = {};

let canvas;
let canvasScale = 1.;
let cWidth;
let cHeight;
let screenInverse = new THREE.Vector2(0, 0);
let screenSize = new THREE.Vector2(0, 0);

let renderer;
let computer;

let quadGeo;

let mainScene;
let mainCamera;
let mainMaterial;
let mainMesh;
let mainUniforms = {
    texture: {value: null}
};

let cDiff = 0.22;
let cDiffMin = 0;
let cDiffMax = 0.28;
let cDiffStep = 0.005;
function cDiffUpdate(value) {
    cDiff = value;
    guiParams.cDiff = value;
}

let cDecay = 0.99;
let cDecayLog = -2;
let cDecayLogMin = -7;
let cDecayLogMax = -0.5;
let cDecayLogStep = 0.05;
function cDecayLogUpdate(value) {
    cDecayLog = value;
    cDecay = 1 - 10**value;
    guiParams.cDecay = value;
}

let mouseHeat = 0.;
let mouseHeatMin = -1;
let mouseHeatMax = 1;
let mouseHeatStep = 0.05;
function mouseHeatUpdate(value) {
    mouseHeat = value;
    guiParams.mouseHeat = value;
}

let mouseSize = 10;
let mouseSizeMin = 0;
let mouseSizeMax = 100;
let mouseSizeStep = 1;
function mouseSizeUpdate(value) {
    mouseSize = value;
    guiParams.mouseSize = value;
}

let windX = 0;
let windXMin = -2;
let windXMax = 2;
let windXStep = 0.05;
function windXUpdate(value) {
    windX = value;
    guiParams.windX = value;
}

let windY = 0;
let windYMin = -2;
let windYMax = 2;
let windYStep = 0.05;
function windYUpdate(value) {
    windY = value;
    guiParams.windY = value;
}

let mousePositionNow = new THREE.Vector2(0, 0);
let mousePositionLast = new THREE.Vector2(-1, -1);

let diffuseUniforms = {
    mousePositionNow: {value: mousePositionNow},
    mousePositionLast: {value: mousePositionLast},
    mouseHeat: {value: mouseHeat},
    mouseSize: {value: mouseSize},
    screenInverse: {value: screenInverse},
    screenSize: {value: screenSize},
    cDiff: {value: cDiff},
    cDecay: {value: cDecay},
    windX: {value: windX},
    windY: {value: windY}
};

// Actually the square root of the number of seekers
let numSeekers = 16;
let numSeekersActual = numSeekers * numSeekers;
let seekerInverse = new THREE.Vector2(1 / numSeekers, 1 / numSeekers);

let dt = 1/30;
let seekerPositionUniforms = {
    seekerInverse: {value: seekerInverse},
    dt: {value: dt}
};

let seekStrength = 0.5;
let rawMinSpeed = 0.25;
let rawMaxSpeed = 4.;
let minSpeed, maxSpeed;
let seekerVelocityUniforms = {
    seekerInverse: {value: seekerInverse},
    screenInverse: {value: screenInverse},
    seekStrength: {value: seekStrength},
    minSpeed: {value: 0.},
    maxSpeed: {value: 0.}
};

let gui;
let guiParams;

let stats;

let seekerScene;
let seekerCamera;
let seekerMesh;
let seekerGeometry;
let seekerMaterial;
let seekerIndices;
let seekerOffsets;
let renderSeekerUniforms = {
    numSeekers: {value: numSeekersActual},
    seekerInverse: {value: seekerInverse},
    screenInverse: {value: screenInverse},
    seekerPosition: {value: null}
};


$(document).ready(function() {
    loadFiles().then(main);
});


function main() {
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    setupGUI();

    canvas = document.getElementById('canvas');
    let jCanvas = $('#canvas');
    jCanvas.mousemove(onMouseMove);
    $(document).keypress(onKeyPress);
    $(document).keydown(onKeyDown);
    $(document).keyup(onKeyUp);
    $(window).resize(restart);
    restart();
}


function restart() {
    cWidth = Math.floor(canvasScale * window.innerWidth);
    cHeight = Math.floor(canvasScale * window.innerHeight);
    screenInverse.x = 1 / cWidth;
    screenInverse.y = 1 / cHeight;
    screenSize.x = cWidth;
    screenSize.y = cHeight;
    canvas.width = cWidth;
    canvas.height = cHeight;
    minSpeed = rawMinSpeed / Math.max(cWidth, cHeight);
    maxSpeed = rawMaxSpeed / Math.max(cWidth, cHeight);
    seekerVelocityUniforms.minSpeed.value = minSpeed;
    seekerVelocityUniforms.maxSpeed.value = maxSpeed;
    if (mainCamera) {
        mainCamera.aspect = cWidth / cHeight;
    }
    if (seekerCamera) {
        seekerCamera.aspect = cWidth / cHeight;
    }
    mouseSizeMax = Math.min(cWidth, cHeight) / 2;
    mouseSizeStep = Math.max(1, Math.floor(mouseSizeMax / 100));

    setupGL();
    setupSeekers();

    animate();
}


function setupSeekers() {

    seekerScene = new THREE.Scene();
    seekerCamera = new THREE.PerspectiveCamera(60, cWidth / cHeight, 1, 100);


    seekerScene.add(seekerCamera);

    // seekerOffsets = [];
    // seekerIndices = [];
    //
    // seekerOffsets.push(-0.02, 0);
    // seekerOffsets.push(0, 0.04);
    // seekerOffsets.push(0.02, 0);
    // // Set index attribute
    // for (let i = 0; i < numSeekersActual; i++) {
    //     seekerIndices.push(i);
    // }

    // seekerGeometry = new THREE.InstancedBufferGeometry();
    // seekerGeometry.maxInstancedCount = numSeekersActual;
    // seekerGeometry.addAttribute('offset', new THREE.Float32BufferAttribute(seekerOffsets, 2));
    // seekerGeometry.addAttribute('id', new THREE.InstancedBufferAttribute(new Float32Array(seekerIndices), 1));
    //
    // seekerMaterial = new THREE.RawShaderMaterial( {
    //     uniforms: renderSeekerUniforms,
    //     vertexShader: shaderSources['renderSeekers.vert'],
    //     fragmentShader: shaderSources['renderSeekers.frag'],
    //     side: THREE.DoubleSide
    // });

    simpleSeeker();

    seekerScene.add(seekerMesh);
    seekerMesh.position.set(0, 0, 0);
    seekerCamera.position.set(0, 10, 0);
    seekerCamera.lookAt(seekerScene.position);
    seekerMesh.frustumCulled = false;
    seekerMesh.rotateX(0.3);
    seekerMesh.rotateZ(-0.2);

}

let simpleUniforms = {seekerInverse: {value: new THREE.Vector2()},
                      screenInverse: {value: new THREE.Vector2()},
                      seekerPosition: {value: null}};


function simpleSeeker() {
    seekerGeometry = new THREE.Geometry();
    let size = 12;
    let vertices = seekerVertices(size);
    for (let v of vertices) {
        seekerGeometry.vertices.push(v);
    }
    seekerGeometry.faces.push(new THREE.Face3(0, 1, 2));

    seekerMaterial = new THREE.ShaderMaterial({
        uniforms: simpleUniforms,
        vertexShader: shaderSources['renderSeekers.vert'],
        fragmentShader: shaderSources['renderSeekers.frag'],
        side: THREE.DoubleSide
    });

    seekerMesh = new THREE.Mesh(seekerGeometry, seekerMaterial);

    function seekerVertices(size) {
        const isqrt2 = 1 / Math.sqrt(2);
        let vertices = [
            new THREE.Vector3(-isqrt2 * size, isqrt2 * size, 0),
            new THREE.Vector3(1.6 * size, 0),
            new THREE.Vector3(-isqrt2 * size, -isqrt2 * size, 0)
        ];
        return vertices;
    }
}


function setupGUI() {
    stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.domElement);


    let paramFunction = function() {
        this.cDiff = cDiff;
        this.cDecay = cDecayLog;
        this.mouseHeat = mouseHeat;
        this.mouseSize = mouseSize;
        this.windX = windX;
        this.windY = windY;
        this.seekStrength = seekStrength;
    };
    guiParams = new paramFunction();

    gui = new dat.GUI();

    let cDiffController = gui.add(guiParams, 'cDiff', cDiffMin, cDiffMax, cDiffStep)
        .name('[ | ]  diffuse')
        .listen();
    cDiffController.onChange(function(value) {
        cDiff = value;
    });

    let cDecayController = gui.add(guiParams, 'cDecay', cDecayLogMin, cDecayLogMax, cDecayLogStep)
        .name('; | \'  decay')
        .listen();
    cDecayController.onChange(function(value) {
        cDecayLog = value;
        cDecay = 1 - 10**value;
    });

    let mouseHeatController = gui.add(guiParams, 'mouseHeat', mouseHeatMin, mouseHeatMax, mouseHeatStep)
        .name('S | W  mouse heat')
        .listen();
    mouseHeatController.onChange(function(value) {
        mouseHeat = value;
    });

    let mouseSizeController = gui.add(guiParams, 'mouseSize', mouseSizeMin, mouseSizeMax, mouseSizeStep)
        .name('A | D  mouse size')
        .listen();
    mouseSizeController.onChange(function(value) {
        mouseSize = value;
    });

    let windXController = gui.add(guiParams, 'windX', windXMin, windXMax, windXStep)
        .name('← | →  wind x')
        .listen();
    windXController.onChange(function(value) {
        windX = value;
    });

    let windYController = gui.add(guiParams, 'windY', windYMin, windYMax, windYStep)
        .name('↓ | ↑  wind y')
        .listen();
    windYController.onChange(function(value) {
        windY = value;
    });

    let obj = {restart: restart};
    gui.add(obj, 'restart');


}


function onMouseMove(evt) {
    mousePositionNow.x = canvasScale * evt.clientX;
    mousePositionNow.y = cHeight - canvasScale * evt.clientY;
}


let keysDown = {
    'arrowleft': false,
    'arrowright': false,
    'arrowup': false,
    'arrowdown': false
};


function animateKeys() {
    // Push wind left
    if (keysDown['arrowleft']) {
        windXUpdate(Math.max(windXMin, windX - windXStep));
    }

    // Push wind right
    if (keysDown['arrowright']) {
        windXUpdate(Math.min(windXMax, windX + windXStep));
    }

    // Push wind up
    if (keysDown['arrowup']) {
        windYUpdate(Math.min(windYMax, windY + windYStep));

    }

    // Push wind down
    if (keysDown['arrowdown']) {
        windYUpdate(Math.max(windYMin, windY - windYStep));
    }
}


function onKeyUp(evt) {
    let key = evt.key.toLowerCase();

    keysDown[key] = false;
}

function onKeyDown(evt) {
    let key = evt.key.toLowerCase();

    keysDown[key] = true;
}


function onKeyPress(evt) {
    let key = evt.key.toLowerCase();

    // Decrease mouse size
    if (key === 'a') {
        mouseSizeUpdate(Math.max(1, mouseSize - 1));
    }

    // Increase mouse size
    else if (key === 'd') {
        mouseSizeUpdate(Math.min(200, mouseSize + 1));
    }

    // Decrease mouse heat
    else if (key === 's') {
        mouseHeatUpdate(Math.max(-1, mouseHeat - mouseHeatStep));
    }

    // Increase mouse heat
    else if (key === 'w') {
        mouseHeatUpdate(Math.min(1., mouseHeat + mouseHeatStep));
    }

    // Zero wind speed
    else if (key === 'x') {
        windXUpdate(0);
        windYUpdate(0);
    }

    // Zero mouse heat
    else if (key === 'z') {
        mouseHeatUpdate(0.);
    }

    // Decrease cDiff
    else if (key === '[') {
        cDiffUpdate(Math.max(cDiffMin, cDiff - cDiffStep));
    }

    // Increase cDiff
    else if (key === ']') {
        cDiffUpdate(Math.min(cDiffMax, cDiff + cDiffStep));
    }

    // Decrease cDecayLog
    else if (key === ';') {
        cDecayLogUpdate(Math.max(cDecayLogMin, cDecayLog - cDecayLogStep));
    }

    // Increase cDecayLog
    else if (key === '\'') {
        cDecayLogUpdate(Math.min(cDecayLogMax, cDecayLog + cDecayLogStep));
    }

    // Restart
    else if (key === ' ') {
        restart();
    }
}


function loadFiles() {
    return $.when.apply($, shaderFiles.map(loadFile));
}


function loadFile(fileName) {
    let fullName = 'glsl/' + fileName;
    return $.ajax(fullName).then(function(data) {
        shaderSources[fileName] = data;
    });
}


function animate() {
    requestAnimationFrame(animate);

    animateKeys();
    update();
    render();

    mousePositionLast.x = mousePositionNow.x;
    mousePositionLast.y = mousePositionNow.y;

    stats.update();
}


function render() {
    computer.compute();

    renderer.setSize(cWidth, cHeight);
    renderer.clear();
    renderer.render(mainScene, mainCamera);
    renderer.render(seekerScene, seekerCamera);
}


function update() {
    diffuseUniforms.mousePositionNow.value = mousePositionNow;
    diffuseUniforms.mousePositionLast.value = mousePositionLast;
    diffuseUniforms.mouseHeat.value = mouseHeat;
    diffuseUniforms.mouseSize.value = mouseSize;
    diffuseUniforms.screenInverse.value = screenInverse;
    diffuseUniforms.screenSize.value = screenSize;
    diffuseUniforms.cDiff.value = cDiff;
    diffuseUniforms.cDecay.value = cDecay;
    diffuseUniforms.windX.value = windX;
    diffuseUniforms.windY.value = windY;
    mainUniforms.texture.value = computer.currentRenderTarget('heat').texture;

    seekerVelocityUniforms.seekerInverse.value = seekerInverse;
    seekerVelocityUniforms.screenInverse.value = screenInverse;
    seekerPositionUniforms.seekerInverse.value = seekerInverse;

    simpleUniforms.seekerInverse.value = seekerInverse;
    simpleUniforms.screenInverse.value = screenInverse;
    simpleUniforms.seekerPosition.value = computer.currentRenderTarget('seekerPosition').texture;
}


function setupGL() {
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false});
    renderer.autoClearColor = false;

    setupComputer();

    quadGeo = new THREE.PlaneGeometry(2, 2);

    mainScene = new THREE.Scene();
    mainCamera = new THREE.PerspectiveCamera(
        60,
        cWidth / cHeight,
        1,
        1000);
    mainScene.add(mainCamera);
    mainMaterial = new THREE.ShaderMaterial({
        vertexShader: shaderSources['quad.vert'],
        fragmentShader: shaderSources['renderHeat.frag'],
        uniforms: mainUniforms
    });
    mainMesh = new THREE.Mesh(quadGeo, mainMaterial);
    mainScene.add(mainMesh);
}


/**
 * Set up the ComputeRenderer
 */
function setupComputer() {
    computer = new ComputeRenderer(renderer);

    computer.addVariable(
        'heat',
        shaderSources['diffuse.frag'],
        diffuseUniforms,
        initDiffusion,
        cWidth,
        cHeight,
        THREE.LinearFilter,
        THREE.LinearFilter
    );
    computer.addVariable(
        'seekerPosition',
        shaderSources['seekerPosition.frag'],
        seekerPositionUniforms,
        initSeekerPosition,
        numSeekers,
        numSeekers
    );
    computer.addVariable(
        'seekerVelocity',
        shaderSources['seekerVelocity.frag'],
        seekerVelocityUniforms,
        initSeekerVelocity,
        numSeekers,
        numSeekers
    );


    computer.setVariableDependencies('heat', ['heat']);

    computer.setVariableDependencies('seekerPosition',
                                    ['seekerPosition',
                                     'seekerVelocity']);

    computer.setVariableDependencies('seekerVelocity',
                                    ['seekerPosition',
                                     'seekerVelocity',
                                     'heat']);




    let initStatus = computer.init();
    if (initStatus !== null) {
        handleComputerInitFailure(initStatus);
    }
}


/**
 * Handle a ComputeRenderer initialization failure.
 * @param {String} status - `computer.init()` return status.
 */
function handleComputerInitFailure(status) {
    console.log(status);
}


/**
 * Initialize the diffusion render target textures.
 * @param {Texture} texture - A texture to initialize.
 */
function initDiffusion(texture) {
    let data = texture.image.data;
    for (let i = 0; i < data.length; i++) {
        data[i] = 0;
    }
}


/**
 * Initialize the seekerPosition render target textures.
 * @param {Texture} texture - A texture to initialize.
 */
function initSeekerPosition(texture) {
    let data = texture.image.data;
    for (let i = 0; i < data.length; i += 4) {
        // Seeker initial x position
        data[i] = random(-0.5, 0.5);
        // Seeker initial y position
        data[i+1] = random(-0.5, 0.5);
        // Initial orientation gets overwritten so eh
        data[i+2] = 0.;
        // A value is always 1 for now
        data[i+3] = 1.;
    }
}


/**
 * Initialize the seekerVelocity target textures.
 * @param {Texture} texture - A texture to initialize.
 */
function initSeekerVelocity(texture) {
    let data = texture.image.data;
    for (let i = 0; i < data.length; i += 4) {
        // Choose a random initial orientation for the seeker, then
        // set it moving at minimum speed
        let initOrientation = random(-Math.PI, Math.PI);

        // Seeker initial x velocity
        data[i] = minSpeed * Math.cos(initOrientation);
        // Seeker initial y velocity
        data[i+1] = minSpeed * Math.sin(initOrientation);
        data[i+2] = 0.;
        data[i+3] = 1.;
    }
}
