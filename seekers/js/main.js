import Detector from './Detector.js';
import ComputeRenderer from './ComputeRenderer.js';

const shaderFiles = [
    'diffuse.frag',
    'quad.vert',
    'renderHeat.frag'
];
let shaderSources = {};

let canvas;
let canvasScale = 1.;
let cWidth;
let cHeight;
let dst = new THREE.Vector2(0, 0);
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

let mousePositionNow = new THREE.Vector2(0, 0);
let mousePositionLast = new THREE.Vector2(-1, -1);
let mouseHeat = 0.;
let mouseHeatStep = 0.05;
let mouseSize = 10;
let diffuseUniforms = {
    mousePositionNow: {value: mousePositionNow},
    mousePositionLast: {value: mousePositionLast},
    mouseHeat: {value: mouseHeat},
    mouseSize: {value: mouseSize},
    dst: {value: dst},
    screenSize: {value: screenSize}
};


$(document).ready(function() {
    loadFiles().then(main);
});


function restart() {
    cWidth = Math.floor(canvasScale * window.innerWidth);
    cHeight = Math.floor(canvasScale * window.innerHeight);
    dst.x = 1 / cWidth;
    dst.y = 1 / cHeight;
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


function onMouseMove(evt) {
    mousePositionNow.x = canvasScale * evt.clientX;
    mousePositionNow.y = cHeight - canvasScale * evt.clientY;
}


function onKeyPress(evt) {
    let key = evt.key.toLowerCase();

    // Decrease mouse size
    if (key === 'a') {
        mouseSize = Math.max(1, mouseSize - 1);
    }

    // Increase mouse size
    if (key === 'd') {
        mouseSize = Math.min(200, mouseSize + 1);
    }

    // Decrease mouse heat
    if (key === 's') {
        mouseHeat = Math.max(-1, mouseHeat - mouseHeatStep);
    }

    // Increase mouse heat
    if (key === 'w') {
        mouseHeat = Math.min(1., mouseHeat + mouseHeatStep);
    }

    // Zero mouse heat
    if (key === 'z') {
        mouseHeat = 0.;
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


function main() {
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    canvas = document.getElementById('canvas');
    let jCanvas = $('#canvas');
    jCanvas.mousemove(onMouseMove);
    $(document).keypress(onKeyPress);
    $(window).resize(restart);
    restart();
}


function animate() {
    requestAnimationFrame(animate);
    update();
    render();

    mousePositionLast.x = mousePositionNow.x;
    mousePositionLast.y = mousePositionNow.y;
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
    diffuseUniforms.dst.value = dst;
    diffuseUniforms.screenSize.value = screenSize;
    mainUniforms.texture.value = computer.currentRenderTarget('heat').texture;
}


function setupGL() {
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false});

    computer = new ComputeRenderer(renderer);
    computer.addVariable(
        'heat',
        shaderSources['diffuse.frag'],
        diffuseUniforms,
        initDiffusion,
        cWidth,
        cHeight);
    computer.setVariableDependencies('heat', ['heat']);
    let initStatus = computer.init();
    if (initStatus !== null) {
        console.log(initStatus);
    }

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
 * Initialize the diffusion render target textures.
 * @param {Texture} texture - The texture to initialize.
 */
function initDiffusion(texture) {
    let data = texture.image.data;
    for (let i = 0; i < data.length; i++) {
        data[i] = 0;
    }
}
