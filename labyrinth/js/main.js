/**
 * Created by matt on 8/4/17.
 */

// FrequentlyUsed numerical constants
const ISQRT2 = 1. / Math.sqrt(2);
const SQRT2 = Math.sqrt(2);



// The app renders to this canvas
var canvas;
// Canvas size
var width = null;
var height = null;

// Main App constructs are single global variables, for ease of information
// access
// The App, coordinating all app components
var app = null;
// The current Labyrinth, a logical representation of all the labyrinth's data
var labyrinth = null;
// A Plan is a function which produces Labyrinths
var plan = null;

// Tile size in pixels
var tileSize = 32;
// Tiles per Chunk
var chunkSize =  32;
// Number of Chunks in a labyrinth
var nChunksX = 10;
var nChunksY = 8;

// THREE.js attributes for rendering
var scene = null;
var camera = null;
var renderer = null;
// Simple quad geometry used for Tiles
var tileGeometry = null;
// Test quad material
var tileMaterial = null;

function cameraMoveSpeed() {
    return camera.position.z / 31.25;
}

// Dict of key states
keyStates = {};
// Only pay attention to standard ASCII keys
for (var i = 32; i < 128; i++) {
    var c = String.fromCharCode(i);
    keyStates[c] = false;
}

var seed = 'bork_daniels';


$(document).ready(restart);


function restart() {
    // Get the canvas DOM object
    canvas = $('#canvas').get()[0];
    width = window.innerWidth;
    height = window.innerHeight;
    // canvas.width = width;
    // canvas.height = height;
    app = new App();
    app.start();
}


function onKeyDown(evt) {
    var key = evt.key.toLowerCase();
    if (key in keyStates) {
        keyStates[key] = true;
    }
}


function onKeyUp(evt) {
    var key = evt.key.toLowerCase();
    if (key in keyStates) {
        keyStates[key] = false;
    }
}

function onResize() {
    app.updateRenderer();
}


function onWheel(evt) {
    if (evt.deltaY < 0) {
        camera.translateZ(-100);

    } else if (evt.deltaY > 0) {
        camera.translateZ(100);
    }
}


var zoomDelta = 100;

function cameraZoomOut() {
    camera.translateZ(zoomDelta);
}
function cameraZoomIn() {
    camera.translateZ(-zoomDelta);
}

function App() {
    // Time since start
    this.t = 0.;
    // Time since previous frame
    this.dt = 0.;

    // True the first time the app is started, then false
    this.firstStart = true;

    // Dict of key states
    this.keyStates = {};
    // Only pay attention to standard ASCII keys
    for (var i = 32; i < 128; i++) {
        var c = String.fromCharCode(i);
        this.keyStates[c] = false;
    }
}


App.prototype.handleKeys = function() {
    // A - move left
    if (keyStates['a']) {
        camera.translateX(-cameraMoveSpeed());
    }

    // D - move right
    if (keyStates['d']) {
        camera.translateX(cameraMoveSpeed());
    }

    // F - zoom out
    if (keyStates['f']) {
        cameraZoomOut();
    }

    // R - zoom in
    if (keyStates['r']) {
        cameraZoomIn();
    }

    // S - move down
    if (keyStates['s']) {
        camera.translateY(-cameraMoveSpeed());
    }

    // W - move up
    if (keyStates['w']) {
        camera.translateY(cameraMoveSpeed());
    }
};


App.prototype.render = function() {
    renderer.render(scene, camera);
};


App.prototype.run = function(){
    requestAnimationFrame(this.run.bind(this));
    this.handleKeys();
    this.render();
};


App.prototype.start = function() {
    if (this.firstStart) {
        this.firstStart = false;
        this.setupGL();
        this.setupCallbacks();
    }

    Math.seedrandom(seed);

    plan = new Plan1(chunkSize,
                     nChunksX,
                     nChunksY);

    labyrinth = new Labyrinth(plan);
    labyrinth.setup();

    this.setupCamera();

    this.run();

};


App.prototype.setupCallbacks = function() {
    // canvas.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('wheel', onWheel);
    $(window).resize(onResize);
};


App.prototype.setupCamera = function() {
    var startTile = labyrinth.tiles[labyrinth.xStart][labyrinth.yStart];
    camera.position.set(startTile.xw, startTile.yw, 500);
    camera.lookAt(startTile.mesh.position);
};


App.prototype.setupGL = function() {
    try {
        // Check whether the canvas is WebGL-capable
        var hasWebGL = !! ( window.WebGLRenderingContext &&
            ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) ) );
        if (!hasWebGL) {
            return false;
        }
        // Create a THREE.js scene
        scene = new THREE.Scene();
        // Create a THEE.js camera
        camera = new THREE.PerspectiveCamera(
            60,  // Field of view
            1,  // Aspect ratio
            1,  // Near clipping plane
            10000  // Far clipping plane
        );

        // Create a THREE.js renderer and set it up
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true
        });
        renderer.setClearColor(0x000000);
        // Update renderer size and camera aspect ratio
        this.updateRenderer();

        // Give the scene an ambient light
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Create the tile geometry
        tileGeometry = new THREE.PlaneGeometry(tileSize, tileSize, 1, 1);
        // tileGeometry.elementsNeedUpdate = true;
        // Create the tile material
        tileMaterial = new THREE.MeshBasicMaterial({color: 0x000000});

        return true;
    } catch (e) {
        return false;
    }
};


App.prototype.updateRenderer = function() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(window.devicePixelRatio? window.devicePixelRatio : 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
};
