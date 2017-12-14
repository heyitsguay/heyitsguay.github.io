/**
 * Created by matt on 8/4/17.
 */

// FrequentlyUsed numerical constants
const ISQRT2 = 1. / Math.sqrt(2);
const SQRT2 = Math.sqrt(2);

// Possible Labyrinth states
LabyrinthEnum = {SETUP: 0, RUNNING: 1, PAUSE: 2, WIN: 3};

// Mnemonic variable names for the four directions
const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;

// The app renders to a canvas
var canvas = $('#canvas');
// Canvas size
var width = null;
var height = null;

// Main App constructs are single global variables, for ease of information
// access
// The App, coordinating all app components
var app = null;
// The current Labyrinth, a logical representation of all the labyrinth's data
var labyrinth = null;
// The camera, which renders the Labyrinth
var camera = null;
// A Plan is a function which produces Labyrinths
var plan = null;


// Tile size in pixels
var tileSize = 32;
// Tiles per Chunk
var chunkSize =  32;
// Number of Chunks in a labyrinth
var nChunksX = 20;
var nChunksY = 12;

window.addEventListener('load', restart);

function restart() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    app = new App();
    app.start();
}

function App() {
    // Time since start
    this.t = 0.;
    // Time since previous frame
    this.dt = 0.;

    // List of key states
    this.nKeys = 256;
    this.keyList = new Array(this.nKeys).fill(false);
}

App.prototype.start = function() {
    camera = new Camera(tileSize, chunkSize);

    plan = new Plan1(chunkSize,
                     nChunksX,
                     nChunksY);

    labyrinth = new Labyrinth(plan);

};

function Labyrinth(plan) {
    // A labyrinth!!!

    // Labyrinth Plan object
    this.plan = plan;
    // For convenience
    this.chunkSize = plan.chunkSize;
    this.nChunksX = plan.nChunksX;
    this.nChunksY = plan.nChunksY;
    this.nChunks = plan.nChunks;
    this.nTilesX = plan.nTilesX;
    this.nTilesY = plan.nTilesY;
    this.nTiles = plan.nTiles;

    this.xStart = plan.xStart;
    this.yStart = plan.yStart;
    this.xWin = plan.xWin;
    this.yWin = plan.yWin;

    // Current Labyrinth state
    this.state= LabyrinthEnum.SETUP;

    // Tile array containing all the Tiles in the Labyrinth
    this.tiles = null;

    // Chunk array containing all the Chunks in the Labyrinth
    this.chunks = null;

    // The player
    this.player = null;

    // List of all Tiles whose light values are currently being updated
    this.lightList = null;

    // Tile initialization list
    this.initList = null;

    // Perform initial setup
    this.setup();

}


Labyrinth.prototype.build = function() {
    // Build a maze for the Labyrinth using its Plan.

    // Maze generation is probabilistic. Try maxAttempts number of times to
    // create a solvable maze
    var creationAttempts = 0;
    var maxAttempts = 100;

    var success = false;

    while (!this.initList.solvable && creationAttempts < maxAttempts) {
        creationAttempts += 1;
        // Run the Plan
        this.plan.run();
        // Set up the InitializationList on the newlyGenerated maze
        this.initList.setup();
    }

    if (this.initList.solvable) {
        success = true;
    }

    return success;
};


Labyrinth.prototype.draw = function() {
    // Draw the Labyrinth.

    
};


Labyrinth.prototype.setup = function() {
    // Set up the Labyrinth.

    // Initialize the Chunks
    // Initialize rows of Chunks
    this.chunks = new Array(this.nChunksX);
    for (var xc=0; xc<this.nChunksX; xc++) {
        // Initialize a row of Chunks
        this.chunks[xc] = new Array(this.nChunksY);
        // Initialize the individual Chunks
        for (var yc=0; yc<this.nChunksY; yc++) {
            this.chunks[xc][yc] = new Chunk(xc, yc);
        }

    }

    // Initialize the Tiles
    // Initialize rows of Tiles
    this.tiles = new Array(this.nTilesX);
    for (var xt=0; xt<this.nTilesX; xt++) {
        // Initialize a row of Tiles
        this.tiles[xt] = new Array(this.nTilesY);
        // Initialize the individual Tiles
        for (var yt=0; yt<this.nTilesY; yt++) {
            this.tiles[xt][yt] = new Tile(xt, yt);
        }
    }

    // Create TileLists
    this.lightList = new LightList();
    this.initList = new InitializationList();

    // Build the Labyrinth, exit if generation fails
    if (!this.build()) {
        throw new Error('Labyrinth generation failed');
    }

    // Labyrinth is ready to go
    this.state = LabyrinthEnum.RUNNING;
};