// Put whatever javascript in here
$(document).ready(onReady);

var canvas;

var width;
var height;



var renderer = null;
var computer = null;

var screen = {
    'scene': null,
    'camera': null,
    'mesh': null,
    'material': null,
    'uniforms': {}
};

var maze = {
    'rendertarget': null,
    'texture': null
};

var creators = {
    'scene': null,
    'camera': null,
    'mesh': null,
    'material': null,
    'uniforms': null
};

var numTilesX = 256;
var numTilesY = 256;
var tileSize = 32;

var numCreators = 10;

var container;
var stats;

var lastTime = null;


function onReady() {
    start();
    animate();
}


function start() {
    // Make sure WebGL is available
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    window.addEventListener('resize', onResize, false);

    lastTime = performance.now();

    container = document.createElement('div');
    document.body.appendChild(container);

    screen.scene = new THREE.Scene();
    screen.scene.background = new THREE.Color(0x000000);

    screen.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    screen.camera.position.z = 100;

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio? window.devicePixelRatio : 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    initComputeRenderer();

    maze.rendertarget = new THREE.WebGLRenderTarget(numTilesX, numTilesY, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: (/(iPad|iPhone|iPod)/g.test(navigator.userAgent))? THREE.HalfFloatType : THREE.FloatType,
        stencilBuffer: false
    });

    gfx.creators.scene = new THREE.Scene();
    gfx.creators.scene.background = new THREE.Color(0x000000);
    gfx.creators.uniforms = {
        numTiles: {value: new THREE.Vector2(numTilesX, numTilesY)},
        creators: {value: null}
    };
    gfx.creators.material = new THREE.ShaderMaterial({
        vertexShader: loadFile('glsl/creatorDraw.vert'),
        fragmentShader: loadFile('glsl/creatorDraw.frag'),
        uniforms: gfx.creators.uniforms
    });

    gfx.creators.mesh = new THREE.Points(new CreatorGeometry(), gfx.creators.material);
    gfx.creators.scene.add(gfx.creators.mesh);
    gfx.creators.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);

    // noinspection JSUnresolvedFunction
    stats = new Stats();
    container.appendChild(stats.dom);

}


function CreatorGeometry() {

    THREE.BufferGeometry.call(this);
    var index = new THREE.BufferAttribute(new Float32Array(numCreators), 1);

    for (var i = 0; i < numCreators; i++) {
        index[i] = i;
    }
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


/**
 * Initialize the compute renderer, and log an error if something fails.
 */
function initComputeRenderer() {
    cfx.computer = new ComputeRenderer(numCreators, 1, gfx.screen.renderer);
    var creatorProgram = loadFile('glsl/creatorUpdate.frag');
    // noinspection JSCheckFunctionSignatures
    cfx.creators.var = cfx.computer.addVariable("varCreators", creatorProgram, fillCreatorTexture);
    cfx.computer.setVariableDependencies(cfx.creators.var, [cfx.creators.var]);

    cfx.creators.uniforms = {
        arraySize: new THREE.Vector2(numCreators, 1),
        numCreators: numCreators
    };

    var error = cfx.computer.init();
    if (error !== null) {
        console.error(error);
    }

}


/**
 * Texture initializer for the variable 'creators'.
 *
 * @param {DataTexture} texture - The texture that contains 'creators' data.
 */
function fillCreatorTexture(texture) {
    var data = texture.image.data;

    for (var i = 0; i < data.length; i += 4) {
        var x = Math.floor(random() * numTilesX);
        var y = Math.floor(random() * numTilesY);
        var state = 1;
        data[i + 0] = x;
        data[i + 1] = y;
        data[i + 2] = state;
        data[i + 3] = 1.;
    }
}


/**
 * Window resize callback.
 */
function onResize() {
    gfx.screen.renderer.setSize(width, height, false);
    gfx.screen.camera.aspect = window.innerWidth / window.innerHeight;
    gfx.screen.camera.updateProjectionMatrix();
}


function render() {
    var now = performance.now();
    var delta = (now - lastTime) / 1000;

    cfx.uniforms.creators.arraySize = new THREE.Vector2(numCreators, 1);
    cfx.uniforms.creators.numCreators = numCreators;

    cfx.computer.compute();


}
