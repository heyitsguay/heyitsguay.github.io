function Plan(chunkSize, nChunksX, nChunksY) {
    // Base class for a function which builds a Labyrinth's labyrinth, by
    // changing the state of some portion of the Labyrinth's Tiles.

    // Number of Tiles per Chunk
    this.chunkSize = chunkSize;
    // Number of Chunks in each direction
    this.nChunksX = nChunksX;
    this.nChunksY = nChunksY;
    this.nChunks = this.nChunksX * this.nChunksY;
    // Number of Tiles in the Labyrinth in each direction
    this.nTilesX = this.nChunksX * this.chunkSize;
    this.nTilesY = this.nChunksY * this.chunkSize;
    this.nTiles = this.nTilesX * this.nTilesY;

    // Labyrinth must be at least 100x100 tiles
    if (this.nTilesX < 100 || this.nTilesY < 100) {
        throw new Error('Labyrinth has ${this.nTilesX}x${this.nTilesY}' +
            'Tiles, minimum is 100x100');
    }

    // Start in the first quarter of the labyrinth, but not on the border
    this.xStart = 1 + Math.round(0.25 * Math.random() * this.nTilesX);
    this.yStart = 1 + Math.round(0.25 * Math.random() * this.nTilesY);

    // End in the last quarter of the labyrinth, but not on the border
    this.xWin = Math.round(0.75 + 0.25 * Math.random()) * this.nTilesX - 2;
    this.yWin = Math.round(0.75 + 0.25 * Math.random()) * this.nTilesY - 2;
}


Plan.prototype.run = function() {
    // Run the Plan to build a labyrinth. Overwritten by subclasses.

};






function Plan1(chunkSize, nChunksX, nChunksY) {
    // The first plan for labyrinth generation.

    // Initialize superclassDerived members
    Plan.call(this, chunkSize, nChunksX, nChunksY);

    // For this many rounds, add Creators at the starting and winning Tiles
    this.nSwRounds = 10;
    // Spawn this many Creators per startWin round
    this.nSwCreators = 14;
    // For this many rounds, add Creators to the map randomly
    this.nRandomRounds = 46;
    // Number of Creators per random placement round
    this.nRandomCreators = 18;
}
Plan1.prototype = Object.create(Plan.prototype);


Plan1.prototype.roundRandom = function(nRounds, nCreators) {
    // Second round of labyrinth generation. Place Creators at random
    // locations.

    for (var i = 0; i < nRounds; i++) {
        // List of active Creators
        var creators = [];

        // How far through the rounds are we?
        var p = i / (nRounds - 1);

        // PathAvoidance probability
        var avoidProb = 0.3 + 0.65 * p;

        // Creator lifetime
        var lifetime = Math.floor(2.3 * Math.sqrt(this.nTiles));

        // Corridor length standard deviation
        var lengthSd = 3;
        // Minimum corridor length
        var lengthMin = 1;

        for (var j = 0; j < nCreators; j++) {
            // Pick a random starting location
            var x = randomInt(1, this.nTilesX - 2);
            var y = randomInt(1, this.nTilesY - 2);

            // Vary avoidance probability within the generation
            var avoidProbFinal =
                avoidProb + (1 - avoidProb)  * j / nCreators;
            // Controls how quickly path avoidance changes over a Creator's
            // lifetime
            var dAvoidProb = random(-0.1, 0.4);

            // Add in a random directional bias
            var directionBias = random(0, 2*Math.PI);
            var directionBiasStrength = random(0, 0.4);
            // Slight bias towards the starting or winning Tile
            var winBias = random(-0.02, 0.02);

            // Vary average corridor length across the round
            var lengthMean = 3 + 3 * j / nCreators;

            // Choose a random initial direction
            var initDirection = randomElement([UP, RIGHT, DOWN, LEFT]);

            // Add Creator
            creators.push(new Creator(x,
                                      y,
                                      directionBias,
                                      directionBiasStrength,
                                      winBias,
                                      lengthMean,
                                      lengthSd,
                                      lengthMin,
                                      avoidProbFinal,
                                      dAvoidProb,
                                      initDirection,
                                      lifetime));
        }

        // Run Creators
        this.runCreators(creators);
    }
};


Plan1.prototype.roundStartWin = function(nRounds, nCreators) {
    // First round of labyrinth generation. Place Creators at the starting
    // and winning Tiles

    for (var i = 0; i < nRounds; i++) {
        // List of active Creators
        var creators = [];

        // How far through the rounds are we?
        var p = i / (nRounds - 1);

        // No direction bias
        var directionBias = 0;
        var directionBiasStrength = 0;

        // PathAvoidance probability
        var avoidProb = 0.3 + 0.6 * p;
        // Controls how quickly avoidProb increases over a Creator's lifetime
        var dAvoidProb = 0.4;

        // Creator lifetime
        var lifetime = Math.floor(3 * Math.sqrt(this.nTiles) / 2);

        // Average corridor length
        var lengthMean = 4;
        // Corridor length standard deviation
        var lengthSd = 3;
        // Minimum corridor length
        var lengthMin = 1;

        for (var j = 0; j < nCreators; j++) {
            // Alternate placement at starting and winning Tiles

            var x, y, winBias;
            if (j % 2 === 0) {
                // Start at the starting Tile
                x = this.xStart;
                y = this.yStart;
                // Bias movement towards the winning Tile
                winBias = 2;
            }
            else {
                // Start at the winning Tile
                x = this.xWin;
                y = this.yWin;
                // Bias movement away toward the starting Tile
                winBias = -2;
            }

            // Random initial direction
            var initDirection = randomElement([UP, RIGHT, DOWN, LEFT]);

            // Add Creator
            creators.push(new Creator(x,
                                      y,
                                      directionBias,
                                      directionBiasStrength,
                                      winBias,
                                      lengthMean,
                                      lengthSd,
                                      lengthMin,
                                      avoidProb,
                                      dAvoidProb,
                                      initDirection,
                                      lifetime));
        }

        // Run Creators
        this.runCreators(creators);
    }
};


Plan1.prototype.run = function() {

    // Run the startWin round
    this.roundStartWin(this.nSwRounds, this.nSwCreators);

    // Run the random placement round
    this.roundRandom(this.nRandomRounds, this.nRandomCreators);

};


Plan1.prototype.runCreators = function(creators) {
    // Run a collection of Creators.

    while(creators.length > 0) {
        // Keep going while any Creators are still alive
        for (var i = creators.length - 1; i >= 0; i--) {
            var creator = creators[i];

            if (creator.lifeRemaining === 0) {
                // The Creator is dead
                creators.splice(i, 1);
            }
            else {
                // The Creator is alive. Keep moving
                creator.move();
            }
        }
    }
};