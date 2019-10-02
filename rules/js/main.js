// List of shader source file names
const shaderFiles = [
    'quad.frag',
    'quad.vert',
    'wolfram.frag'
];
let shaderSources = {};

let canvas;
let canvasScale = 0.1;
let cWidth;
let cHeight;
let screenInverse = new THREE.Vector2(0, 0);
let screenSize = new THREE.Vector2(0, 0);

let renderer;

let quadGeometry;

let mousePositionNow = new THREE.Vector2(0.5, 0.5);
let mousePositionLast = new THREE.Vector2(0.5, 0.5);
let clicked = false;

let attractorPosition = new THREE.Vector2(0.5, 0.5);
let attractorVelocity = new THREE.Vector2(0., 0.);

let ticksSinceMotion = 0;

let mainScene;
let mainCamera;
let mainMaterial;
let mainMesh;
let mainUniforms = {
    t: {value: 0},
    screenInverse: {value: screenInverse},
    attractorPosition: {value: attractorPosition},
    mousePosition: {value: mousePositionNow},
    aspectRatio: {value: window.innerHeight / window.innerWidth},
    ticksSinceMotion: {value: ticksSinceMotion},
    data: {value: null}
};

let computer;

let wolframScale = 1.;
let wolframUniforms = {
    t: {value: 0},
    screenInverse: {value: screenInverse.multiplyScalar(wolframScale)},
    screenSize: {value: screenSize.multiplyScalar(wolframScale)},
    mousePosition: {value: mousePositionNow},
    clicked: {value: clicked},
    updateState: {value: 0.}
};


$(document).ready(function() {
    loadFiles().then(main);
});


/**
 * Sketch on ready function.
 */
function main() {

    setupGUI();

    canvas = document.getElementById('canvas');
    $(window).mousemove(onMouseMove);
    $(window).click(onClick);
    $(window).resize(resize);
    window.addEventListener('touchstart', onTouchStart, false);
    window.addEventListener('touchmove', onTouchMove, false);

    restart();
}


/**
 * Setup the GUI.
 */
function setupGUI() {
    // stats = new Stats();
    // stats.showPanel(0);
    // document.body.appendChild(stats.domElement);
}


function resize() {
    cWidth = Math.floor(canvasScale * window.innerWidth);
    cHeight = Math.floor(canvasScale * window.innerHeight);
    screenInverse.x = 1 / cWidth;
    screenInverse.y = 1 / cHeight;
    screenSize.x = cWidth;
    screenSize.y = cHeight;
    canvas.width = cWidth;
    canvas.height = cHeight;

    if (mainCamera) {
        mainCamera.aspect = cWidth / cHeight;
    }
}


/**
 * Restart the sketch.
 */
function restart() {

    resize();

    if (mainCamera) {
        mainCamera.aspect = cWidth / cHeight;
    }

    // Setup WebGL structures
    setupGL();

    // Animate the sketch
    animate();
}


function setupGL() {
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false});
    renderer.autoClear = false;

    setupComputer();

    // Create a simple quad geometry
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
    quadGeometry.addAttribute('position', positionAttribute);

    mainScene = new THREE.Scene();
    mainCamera = new THREE.PerspectiveCamera(
        60,
        cWidth / cHeight,
        1,
        1000);
    mainScene.add(mainCamera);
    mainMaterial = new THREE.RawShaderMaterial({
        vertexShader: shaderSources['quad.vert'],
        fragmentShader: shaderSources['quad.frag'],
        uniforms: mainUniforms
    });
    mainMesh = new THREE.Mesh(quadGeometry, mainMaterial);
    mainScene.add(mainMesh);
}


function animate() {
    requestAnimationFrame(animate);

    //console.time('update');
    update();
    //console.timeEnd('update');

    //console.time('render');
    render();
    //console.timeEnd('render');


}


let startTime = new Date().getTime();
let lastTime = startTime;
let thisTime;
let elapsedTime;
let attractorTarget;
function update() {
    let updateCounter = 0;
    thisTime = new Date().getTime();
    elapsedTime = thisTime - lastTime;
    lastTime = thisTime;

    updateAttractor();

    mainUniforms.t.value += elapsedTime / 1000;
    mainUniforms.screenInverse.value = screenInverse;
    mainUniforms.attractorPosition.value = attractorPosition;
    mainUniforms.mousePosition.value = mousePositionNow;
    mainUniforms.aspectRatio.value = window.innerHeight / window.innerWidth;
    mainUniforms.ticksSinceMotion.value = ticksSinceMotion;
    mainUniforms.data.value = computer.currentRenderTarget('data').texture;

    wolframUniforms.t.value += elapsedTime / 1000;
    wolframUniforms.screenInverse.value = screenInverse.multiplyScalar(wolframScale);
    wolframUniforms.screenSize.value = screenSize.multiplyScalar(wolframScale);
    wolframUniforms.mousePosition.value = mousePositionNow;
    wolframUniforms.clicked.value = clicked;
    wolframUniforms.updateState.value = updateCounter == 0 ? 1. : 0.;
    updateCounter = (updateCounter + 1) % 10;
}


function updateAttractor() {
    let mouseMoved = updateMouse();

    if (mouseMoved) {
        ticksSinceMotion = 0;
    }
    else {
        ticksSinceMotion += 1;
    }

    attractorTarget = mousePositionNow;

    let dAttractorX = attractorPosition.x - attractorTarget.x;
    let dAttractorY = attractorPosition.y - attractorTarget.y;
    let vx = 0.95 * attractorVelocity.x - 0.000035 * dAttractorX;
    let vy = 0.95 * attractorVelocity.y - 0.000035 * dAttractorY;
    attractorVelocity.set(vx, vy);

    let px = Math.max(0, Math.min(1,
        attractorPosition.x + elapsedTime * attractorVelocity.x));
    let py = Math.max(0, Math.min(1,
        attractorPosition.y + elapsedTime * attractorVelocity.y));
    attractorPosition.set(px, py);
}


function updateMouse() {
    let mouseMoved = false;
    let dMouseX = mousePositionNow.x - mousePositionLast.x;
    let dMouseY = mousePositionNow.y - mousePositionLast.y;
    if (dMouseX !== 0 || dMouseY !== 0) {
        mouseMoved = true;
    }
    mousePositionLast.x = mousePositionNow.x;
    mousePositionLast.y = mousePositionNow.y;

    return mouseMoved;
}

let ticks = 0;
function render() {
    if (ticks % 2 === 0) {
        computer.compute();
        clicked = false;
    }
    ticks += 1;

    renderer.setSize(cWidth, cHeight);
    // renderer.clear();
    renderer.render(mainScene, mainCamera);

}


function setupComputer() {
    computer = new ComputeRenderer(renderer);

    computer.addVariable(
        'data',
        shaderSources['wolfram.frag'],
        wolframUniforms,
        initWolfram,
        Math.round(wolframScale * cWidth),
        Math.round(wolframScale * cHeight),
        THREE.NearestFilter,
        THREE.NearestFilter
    );

    computer.setVariableDependencies('data', ['data']);

    let initStatus = computer.init();
    if (initStatus !== null) {
        console.log(initStatus);
    }
}


function initWolfram(texture) {
    // Zero init
    let data = texture.image.data;
    for (let i = 0; i < data.length; i++) {
        data[i] = 0;
    }

    // Put a one in the top row
    let seedLocation = 4 * Math.round(0.5 * wolframScale *  cWidth);
    for (let i = 0; i < 4; i ++) {
        data[data.length - seedLocation + i] = 1;
    }
}


/**
 * Load GLSL shader source code into strings.
 * @returns {*}
 */
function loadFiles() {
    return $.when.apply($, shaderFiles.map(loadFile));
}
function loadFile(fileName) {
    let fullName = './glsl/' + fileName;
    return $.ajax(fullName).then(function(data) {
        shaderSources[fileName] = data;
    });
}
