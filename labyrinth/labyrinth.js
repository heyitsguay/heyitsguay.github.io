/**
 * Created by matt on 8/4/17.
 */

// Frequently-used numerical constants
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
var canvas = $('#my-canvas');
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
var tile_scale = 64;
// Tiles per Chunk
var chunk_size =  32;
// Number of Chunks in a labyrinth
var n_chunks_x = 20;
var n_chunks_y = 12;


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
    this.n_keys = 256;
    this.key_list = new Array(this.n_keys).fill(false);
}


App.prototype.start = function() {
    camera = new Camera(tile_scale, chunk_size);

    plan = new Plan1(chunk_size,
                     n_chunks_x,
                     n_chunks_y);

    labyrinth = new Labyrinth(plan);

    console.log('bork br0k');
};




function Labyrinth(plan) {
    // A labyrinth!!!

    // Labyrinth Plan object
    this.plan = plan;
    // For convenience
    this.chunk_size = plan.chunk_size;
    this.n_chunks_x = plan.n_chunks_x;
    this.n_chunks_y = plan.n_chunks_y;
    this.n_chunks = plan.n_chunks;
    this.n_tiles_x = plan.n_tiles_x;
    this.n_tiles_y = plan.n_tiles_y;
    this.n_tiles = plan.n_tiles;

    this.start_x = plan.start_x;
    this.start_y = plan.start_y;
    this.win_x = plan.win_x;
    this.win_y = plan.win_y;

    // Current Labyrinth state
    this.state= LabyrinthEnum.SETUP;

    // Tile array containing all the Tiles in the Labyrinth
    this.tiles = null;

    // Chunk array containing all the Chunks in the Labyrinth
    this.chunks = null;

    // The player
    this.player = null;

    // List of all Tiles whose light values are currently being updated
    this.light_list = null;

    // Tile initialization list
    this.init_list = null;

    // Perform initial setup
    this.setup();

}


Labyrinth.prototype.build = function() {
    // Build a maze for the Labyrinth using its Plan.

    // Maze generation is probabilistic. Try max_attempts number of times to
    // create a solvable maze
    var creation_attempts = 0;
    var max_attempts = 100;

    var success = false;

    while (!this.init_list.solvable && creation_attempts < max_attempts) {
        creation_attempts += 1;
        // Run the Plan
        this.plan.run();
        // Set up the InitializationList on the newly-generated maze
        this.init_list.setup();
    }

    if (this.init_list.solvable) {
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
    this.chunks = new Array(this.n_chunks_x);
    for (var xc=0; xc<this.n_chunks_x; xc++) {
        // Initialize a row of Chunks
        this.chunks[xc] = new Array(this.n_chunks_y);
        // Initialize the individual Chunks
        for (var yc=0; yc<this.n_chunks_y; yc++) {
            this.chunks[xc][yc] = new Chunk(xc, yc);
        }

    }

    // Initialize the Tiles
    // Initialize rows of Tiles
    this.tiles = new Array(this.n_tiles_x);
    for (var xt=0; xt<this.n_tiles_x; xt++) {
        // Initialize a row of Tiles
        this.tiles[xt] = new Array(this.n_tiles_y);
        // Initialize the individual Tiles
        for (var yt=0; yt<this.n_tiles_y; yt++) {
            this.tiles[xt][yt] = new Tile(xt, yt);
        }
    }

    // Create TileLists
    this.light_list = new LightList();
    this.init_list = new InitializationList();

    // Build the Labyrinth, exit if generation fails
    if (!this.build()) {
        throw new Error('Labyrinth generation failed');
    }

    // Labyrinth is ready to go
    this.state = LabyrinthEnum.RUNNING;
};