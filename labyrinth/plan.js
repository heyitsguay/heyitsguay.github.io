function Plan(chunk_size, n_chunks_x, n_chunks_y) {
    // Base class for a function which builds a Labyrinth's labyrinth, by
    // changing the state of some portion of the Labyrinth's Tiles.

    // Number of Tiles per Chunk
    this.chunk_size = chunk_size;
    // Number of Chunks in each direction
    this.n_chunks_x = n_chunks_x;
    this.n_chunks_y = n_chunks_y;
    this.n_chunks = this.n_chunks_x * this.n_chunks_y;
    // Number of Tiles in the Labyrinth in each direction
    this.n_tiles_x = this.n_chunks_x * this.chunk_size;
    this.n_tiles_y = this.n_chunks_y * this.chunk_size;
    this.n_tiles = this.n_tiles_x * this.n_tiles_y;

    // Labyrinth must be at least 100x100 tiles
    if (this.n_tiles_x < 100 || this.n_tiles_y < 100) {
        throw new Error('Labyrinth has ${this.n_tiles_x}x${this.n_tiles_y}' +
            'Tiles, minimum is 100x100');
    }

    // Start in the first quarter of the labyrinth, but not on the border
    this.start_x = 1 + Math.round(0.25 * Math.random() * this.n_tiles_x);
    this.start_y = 1 + Math.round(0.25 * Math.random() * this.n_tiles_y);

    // End in the last quarter of the labyrinth, but not on the border
    this.win_x = Math.round(0.75 + 0.25 * Math.random()) * this.n_tiles_x - 2;
    this.win_y = Math.round(0.75 + 0.25 * Math.random()) * this.n_tiles_y - 2;
}


Plan.prototype.run = function() {
    // Run the Plan to build a labyrinth. Overwritten by subclasses.

};






function Plan1(chunk_size, n_chunks_x, n_chunks_y) {
    // The first plan for labyrinth generation.

    // Initialize superclass-derived members
    Plan.call(this, chunk_size, n_chunks_x, n_chunks_y);

    // For this many rounds, add Creators at the starting and winning Tiles
    this.n_sw_rounds = 4;
    // Spawn this many Creators per start-win round
    this.n_sw_creators = 2;
    // For this many rounds, add Creators to the map randomly
    this.n_random_rounds = 46;
    // Number of Creators per random placement round
    this.n_random_creators = 5;
}
Plan1.prototype = Object.create(Plan.prototype);


Plan1.prototype.round_random = function(n_rounds, n_creators) {
    // Second round of labyrinth generation. Place Creators at random
    // locations.

    for (var i = 0; i < n_rounds; i++) {
        // List of active Creators
        var creators = [];

        // How far through the rounds are we?
        var p = i / (n_rounds - 1);

        // Path-avoidance probability
        var avoid_prob = 0.3 + 0.65 * p;

        // Creator lifetime
        var lifetime = Math.floor(2.3 * Math.sqrt(this.n_tiles) / 2);

        // Corridor length standard deviation
        var length_sd = 3;
        // Minimum corridor length
        var length_min = 1;

        for (var j = 0; j < n_creators; j++) {
            // Pick a random starting location
            var x = random_int(1, this.n_tiles_x - 2);
            var y = random_int(1, this.n_tiles_y - 2);

            // Vary avoidance probability within the generation
            var avoid_prob_final =
                avoid_prob + (1 - avoid_prob)  * j / n_creators;
            // Controls how quickly path avoidance changes over a Creator's
            // lifetime
            var d_avoid_prob = random(-0.1, 0.4);

            // Add in a random directional bias
            var direction_bias = random(0, 2*Math.PI);
            var direction_bias_strength = random(0, 0.4);
            // Slight bias towards the starting or winning Tile
            var win_bias = random(-0.02, 0.02);

            // Vary average corridor length across the round
            var length_mean = 3 + 3 * j / n_creators;

            // Choose a random initial direction
            var init_direction = random_element([UP, RIGHT, DOWN, LEFT]);

            // Add Creator
            creators.push(new Creator(x,
                                      y,
                                      direction_bias,
                                      direction_bias_strength,
                                      win_bias,
                                      length_mean,
                                      length_sd,
                                      length_min,
                                      avoid_prob_final,
                                      d_avoid_prob,
                                      init_direction,
                                      lifetime));
        }

        // Run Creators
        this.run_creators(creators);
    }
};


Plan1.prototype.round_start_win = function(n_rounds, n_creators) {
    // First round of labyrinth generation. Place Creators at the starting
    // and winning Tiles

    for (var i = 0; i < n_rounds; i++) {
        // List of active Creators
        var creators = [];

        // How far through the rounds are we?
        var p = i / (n_rounds - 1);

        // No direction bias
        var direction_bias = 0;
        var direction_bias_strength = 0;

        // Path-avoidance probability
        var avoid_prob = 0.3 + 0.6 * p;
        // Controls how quickly avoid_prob increases over a Creator's lifetime
        var d_avoid_prob = 0.4;

        // Creator lifetime
        var lifetime = Math.floor(3 * Math.sqrt(this.n_tiles) / 2);

        // Average corridor length
        var length_mean = 4;
        // Corridor length standard deviation
        var length_sd = 3;
        // Minimum corridor length
        var length_min = 1;

        for (var j = 0; j < n_creators; j++) {
            // Alternate placement at starting and winning Tiles

            var x, y, win_bias;
            if (j % 2 == 0) {
                // Start at the starting Tile
                x = this.start_x;
                y = this.start_y;
                // Bias movement towards the winning Tile
                win_bias = 2;
            }
            else {
                // Start at the winning Tile
                x = this.win_x;
                y = this.win_y;
                // Bias movement away toward the starting Tile
                win_bias = -2;
            }

            // Random initial direction
            var init_direction = random_element([UP, RIGHT, DOWN, LEFT]);

            // Add Creator
            creators.push(new Creator(x,
                                      y,
                                      direction_bias,
                                      direction_bias_strength,
                                      win_bias,
                                      length_mean,
                                      length_sd,
                                      length_min,
                                      avoid_prob,
                                      d_avoid_prob,
                                      init_direction,
                                      lifetime));
        }

        // Run Creators
        this.run_creators(creators);
    }
};


Plan1.prototype.run = function() {

    // Run the start-win round
    this.round_start_win(this.n_sw_rounds, this.n_sw_creators);

    // Run the random placement round
    this.round_random(this.n_random_rounds, this.n_random_creators);

};


Plan1.prototype.run_creators = function(creators) {
    // Run a collection of Creators.

    while(creators.length > 0) {
        // Keep going while any Creators are still alive
        for (var i = creators.length - 1; i >= 0; i--) {
            var creator = creators[i];

            if (creator.life_remaining == 0) {
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