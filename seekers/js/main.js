import Detector from './Detector.js';
import ComputeRenderer from './ComputeRenderer.js';
import random from './random.js'

const shaderFiles = [
    'diffuse.frag',
    'quad.vert',
    'renderHeat.frag',
    'seekerPosition.frag',
    'seekerVelocity.frag'
];
let shaderSources = {};

let canvas;
let canvasScale = 1.;
let cWidth;
let cHeight;
let stScale = new THREE.Vector2(0, 0);
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
let cDiffMax = 0.225;
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
let mouseSizeMax = Math.min(cWidth, cHeight) / 2;
let mouseSizeStep = Math.max(1, Math.floor(mouseSizeMax / 100));
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
    stScale: {value: stScale},
    screenSize: {value: screenSize},
    cDiff: {value: cDiff},
    cDecay: {value: cDecay},
    windX: {value: windX},
    windY: {value: windY}
};

// Actually the square root of the number of seekers
let numSeekers = 16;

let dt = 1/30;
let seekerPositionUniforms = {
    stScale: {value: stScale},
    dt: {value: dt}
};

let seekStrength = 0.5;
let minSpeed = 1.;
let maxSpeed = 10.;
let seekerVelocityUniforms = {
    stScale: {value: stScale},
    seekStrength: {value: seekStrength},
    minSpeed: {value: minSpeed},
    maxSpeed: {value: maxSpeed}
};

let gui;
let guiParams;

let stats;

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
    stScale.x = 1 / cWidth;
    stScale.y = 1 / cHeight;
    screenSize.x = cWidth;
    screenSize.y = cHeight;
    canvas.width = cWidth;
    canvas.height = cHeight;
    if(mainCamera) {
        mainCamera.aspect = cWidth / cHeight;
    }

    setupGL();

    animate();
}


function setupGUI() {
    stats = new Stats();
    stats.showPanel(1);
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
                             .listen();
    cDiffController.onChange(function(value) {
        cDiff = value;
    });

    let cDecayController = gui.add(guiParams, 'cDecay', cDecayLogMin, cDecayLogMax, cDecayLogStep)
                              .listen();
    cDecayController.onChange(function(value) {
        cDecayLog = value;
        cDecay = 1 - 10**value;
    });

    let mouseHeatController = gui.add(guiParams, 'mouseHeat', mouseHeatMin, mouseHeatMax, mouseHeatStep)
                                 .listen();
    mouseHeatController.onChange(function(value) {
        mouseHeat = value;
    });

    let mouseSizeController = gui.add(guiParams, 'mouseSize', mouseSizeMin, mouseSizeMax, mouseSizeStep)
                                 .listen();
    mouseSizeController.onChange(function(value) {
        mouseSize = value;
    });

    let windXController = gui.add(guiParams, 'windX', windXMin, windXMax, windXStep)
                             .listen();
    windXController.onChange(function(value) {
        windX = value;
    });

    let windYController = gui.add(guiParams, 'windY', windYMin, windYMax, windYStep)
                             .listen();
    windYController.onChange(function(value) {
        windY = value;
    });

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
    if (key === 'd') {
        mouseSizeUpdate(Math.min(200, mouseSize + 1));
    }

    // Decrease mouse heat
    if (key === 's') {
        mouseHeatUpdate(Math.max(-1, mouseHeat - mouseHeatStep));
    }

    // Increase mouse heat
    if (key === 'w') {
        mouseHeatUpdate(Math.min(1., mouseHeat + mouseHeatStep));
    }

    // Zero wind speed
    if (key === 'x') {
        windXUpdate(0);
        windYUpdate(0);
    }

    // Zero mouse heat
    if (key === 'z') {
        mouseHeatUpdate(0.);
    }

    // Decrease cDiff
    if (key === '[') {
        cDiffUpdate(Math.max(cDiffMin, cDiff - cDiffStep));
    }

    // Increase cDiff
    if (key === ']') {
        cDiffUpdate(Math.min(cDiffMax, cDiff + cDiffStep));
    }

    // Decrease cDecayLog
    if (key === ';') {
        cDecayLogUpdate(Math.max(cDecayLogMin, cDecayLog - cDecayLogStep));
    }

    // Increase cDecayLog
    if (key === '\'') {
        cDecayLogUpdate(Math.min(cDecayLogMax, cDecayLog + cDecayLogStep));
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

    stats.begin();

    animateKeys();
    update();
    render();

    mousePositionLast.x = mousePositionNow.x;
    mousePositionLast.y = mousePositionNow.y;

    stats.end();
}


function render() {
    computer.compute();

    renderer.setSize(cWidth, cHeight);
    renderer.render(mainScene, mainCamera);
}


function update() {
    diffuseUniforms.mousePositionNow.value = mousePositionNow;
    diffuseUniforms.mousePositionLast.value = mousePositionLast;
    diffuseUniforms.mouseHeat.value = mouseHeat;
    diffuseUniforms.mouseSize.value = mouseSize;
    diffuseUniforms.stScale.value = stScale;
    diffuseUniforms.screenSize.value = screenSize;
    diffuseUniforms.cDiff.value = cDiff;
    diffuseUniforms.cDecay.value = cDecay;
    diffuseUniforms.windX.value = windX;
    diffuseUniforms.windY.value = windY;
    mainUniforms.texture.value = computer.currentRenderTarget('heat').texture;
}


function setupGL() {
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false});

    setupComputer();

    quadGeo = new THREE.PlaneGeometry(2, 2);

    mainScene = new THREE.Scene();
    mainCamera = new THREE.PerspectiveCamera(
        60,
        cWidth / cHeight,
        1,
        1000);
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
                                    ['seekerVelocity',
                                     'seekerPosition',
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
        data[i] = random(0, cWidth);
        // Seeker initial y position
        data[i+1] = random(0, cHeight);
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
    }
}
