// Put whatever javascript in here
$(document).ready(onReady);

var canvas;

var width;
var height;

function onReady() {
    start();
    animate();
}

var gfx = {
    'scene': null,
    'camera': null,
    'renderer': null,
    'rendertargets': {},
    'plane': null,
    'shadermaterials': {},
    'uniforms': {}
};

var cfx = {
    'computer': null,
    'varcreators': null
};

var numTilesX = 256;
var numTilesY = 256;
var tileSize = 32;

var nCreators = 10;

var container;
var stats;

function start() {
    // Make sure WebGL is available
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    container = document.createElement('div');
    document.body.appendChild(container);

    gfx.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100);
    gfx.camera.position.z = 100;

    gfx.scene = new THREE.Scene();
    gfx.scene.background = new THREE.Color(0x000000);

    gfx.renderer = new THREE.WebGLRenderer();
    gfx.renderer.setPixelRatio(window.devicePixelRatio? window.devicePixelRatio : 1);
    gfx.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(gfx.renderer.domElement);

    initComputeRenderer();

    stats = new Stats();
    container.appendChild(stats.dom);

    window.addEventListener('resize', onResize, false);

}


function loadFile(fileName) {
    var xhr = new XMLHttpRequest();

    var fileText = null;
    xhr.open("GET", fileName, false);
    xhr.onload = function() {
        fileText = this.responseText;
    };
    xhr.send(null);

    return fileText;
}


function initComputeRenderer() {
    cfx.computer = new ComputeRenderer(nCreators, nCreators, gfx.renderer);
    cfx.varcreators = cfx.computer.addVariable("varCreators", loadFile('glsl/creators.frag'), fillCreatorTexture);


}


function fillCreatorTexture(texture) {

}


/**
 * Window resize callback.
 */
function onResize() {
    gfx.renderer.setSize(width, height, false);
    gfx.camera.aspect = window.innerWidth / window.innerHeight;
    gfx.camera.updateProjectionMatrix();
}
