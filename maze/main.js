// Fundamental constants of the tile world

// Tile size, in pixels
const TILE_SIZE = 64;
// Chunk size, in tiles
const CHUNK_SIZE = 32;
// World size in the x and y directions, in chunks
const CHUNKSX = 16;
const CHUNKSY = 16;

// Derived constants - should be no need to edit these

// World size, in tiles
const tilesX = CHUNKSX * CHUNK_SIZE;
const tilesY = CHUNKSY * CHUNK_SIZE;
// Chunk size, in pixels
const chunkPix = CHUNK_SIZE * TILE_SIZE;
// World size, in pixels
const pixWidth = CHUNKSX * chunkPix;
const pixHeight = CHUNKSY * chunkPix;

// Maximum number of Tiles on screen at once
let tilesOnScreenX, tilesOnScreenY;
// Maximum number of Chunks on screen at once
let chunkDrawRadiusX, chunkDrawRadiusY;
// Max screen position within the world, in pixels
let maxScreenX, maxScreenY

// World coordinates of the top-left corner of the window
let screenX = 0.;
let screenY = 0.;

let baseItemProbability = 0.008;

let debugMode = false;

let tiles, chunks, world, player, lightList, hud;

let winTime;
// In milliseconds
const waitTime = 5000;

let xwStart, ywStart, xtStart, ytStart, xtWin, ytWin, maxDistance;

// Time, incremented by dt every frame
let t = 0;
const dt = 1 / 30;

let keyList, keyPressedList;
const numKeys = 256;

let tileSheet, playerSheet;

let dhRate = 0.03;
let d2hRate = 0.08;
let baseHue;

let seed;

function setup() {
    noCursor();
    createCanvas(displayWidth, displayHeight);
    refreshSizeVars();
}

function windowResized() {
    resizeCanvas(displayWidth, displayHeight);
    refreshSizeVars();
}

function refreshSizeVars() {
    tilesOnScreenX = (int)(displayWidth / TILE_SIZE) + 2;
    tilesOnScreenY = (int)(displayHeight / TILE_SIZE) + 2;

    maxScreenX = pixWidth - displayWidth;
    maxScreenY = pixHeight - displayHeight;
}

function draw() {
    background(220);
    if (mouseIsPressed) {
        fill(0);
    } else {
        fill(255);
    }
    ellipse(mouseX, mouseY, 80, 80);
}