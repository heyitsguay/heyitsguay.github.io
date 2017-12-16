// Possible Labyrinth states
LabyrinthEnum = {SETUP: 0, RUNNING: 1, PAUSE: 2, WIN: 3};

// Mnemonic variable names for the four directions
const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;


/**
 * RANDOM STRING GENERATOR
 *
 * Info:      http://stackoverflow.com/a/27872144/383904
 * Use:       randomString(length [,"A"] [,"N"] );
 * Default:   return a random alpha-numeric string
 * Arguments: If you use the optional "A", "N" flags:
 *            "A" (Alpha flag)   return random a-Z string
 *            "N" (Numeric flag) return random 0-9 string
 */
function randomString(len){
    an = an&&an.toLowerCase();
    var str="", i=0, min=0, max=62;
    for(;i++<len;){
        var r = Math.random()*(max-min)+min <<0;
        str += String.fromCharCode(r+=r>9?r<36?55:61:48);
    }
    return str;
}


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
        alert('Labyrinth generation failed!');
        throw new Error('Labyrinth generation failed');
    }

    // Labyrinth is ready to go
    this.state = LabyrinthEnum.RUNNING;
};