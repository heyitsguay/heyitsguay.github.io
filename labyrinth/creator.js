/**
 * Created by matt on 9/6/17.
 */

function Creator(xt,
                 yt,
                 direction_bias,
                 direction_bias_strength,
                 win_bias,
                 length_mean,
                 length_sd,
                 length_min,
                 avoid_prob,
                 d_avoid_prob,
                 init_direction,
                 lifetime) {
    // Stochastic automaton that creates the path portions of the labyrinth.

    // Current Tile coordinates
    this.xt = xt;
    this.yt = yt;

    // Putative new Tile coordinates, used when calculating movement
    this.xt_new = null;
    this.yt_new = null;

    // Arbitrary-angle direction bias gets translated into components in the
    // four cardinal directions
    this.bias_up =
        Math.max(0, Math.sin(direction_bias) * direction_bias_strength);
    this.bias_right =
        Math.max(0, Math.cos(direction_bias) * direction_bias_strength);
    this.bias_down =
        Math.max(0, -Math.sin(direction_bias) * direction_bias_strength);
    this.bias_left =
        Math.max(0, -Math.cos(direction_bias) * direction_bias_strength);

    // Value in (-Infinity, +Infinity). Large positive numbers drive the
    // Creator towards the winning Tile. Large negative numbers drive the
    // Creator towards the starting Tile
    this.win_bias = win_bias;

    // Corridor lengths are chosen randomly from a normal distribution with
    // this mean
    this.length_mean = length_mean;
    // And this standard deviation
    this.length_sd = length_sd;
    // Lower bound on corridor length
    this.length_min = length_min;

    // Probability of avoiding connecting to an existing hallway. When 1,
    // totally path-avoiding
    this.avoid_prob = avoid_prob;
    // Controls how quickly this.avoid_prob changes each time
    // this.update_direction() is called. The Creator becomes more path
    // avoiding if this > 0, else it becomes less path avoiding. Value in
    // [-1, 1]
    this.d_avoid_prob = d_avoid_prob;

    // Current direction of the Creator
    this.direction = init_direction;

    // Number of moves remaining in the current direction before picking a
    // new one.
    this.moves_left = this.roll_moves();

    // Number of updates the Creator performs before being deleted
    this.lifetime = lifetime;

    // Number of updates currently remaining
    this.life_remaining = lifetime;
}


Creator.prototype.move = function() {
    // Convert the Tile under this Creator to a PATH
    labyrinth.tiles[this.xt][this.yt].set_type(TileEnum.PATH);

    this.life_remaining -= 1;

    // If out of moves, choose a new direction (can be same as the old one)
    if (this.moves_left === 0) {
        this.update_direction(false);
    }

    // Move
    switch (this.direction) {
        case UP:
            this.xt_new = this.xt;
            this.yt_new = this.yt - 1;
            break;

        case RIGHT:
            this.xt_new = this.xt + 1;
            this.yt_new = this.yt;
            break;

        case DOWN:
            this.xt_new = this.xt;
            this.yt_new = this.yt + 1;
            break;

        case LEFT:
            this.xt_new = this.xt - 1;
            this.yt_new = this.yt;
            break;

        default:
            throw new Error("Unexpected Creator motion direction");
    }

    // Check to see whether the move puts us on the Labyrinth boundary, and
    // avoid it if so
    var on_x_bdry = this.xt_new == 0 || this.xt_new > labyrinth.n_tiles_x - 2;
    var on_y_bdry = this.yt_new == 0 || this.yt_new > labyrinth.n_tiles_y - 2;
    if (on_x_bdry || on_y_bdry) {
        // Update direction, avoid current direction
        this.update_direction(true);
        return;
    }

    // Check to see whether the move puts us onto a Tile connected to
    // another path Tile
    var bordering_path =
        labyrinth.tiles[this.xt_new + 1][this.yt_new].type != TileEnum.WALL ||
        labyrinth.tiles[this.xt_new - 1][this.yt_new].type != TileEnum.WALL ||
        labyrinth.tiles[this.xt_new][this.yt_new + 1].type != TileEnum.WALL ||
        labyrinth.tiles[this.xt_new][this.yt_new - 1].type != TileEnum.WALL;
    if (bordering_path) {
        // If so, don't move to the new Tile with probability avoid_prob
        if (Math.random() < this.avoid_prob) {
            // New direction
            this.update_direction(true);
            return;
        }
    }

    // Update Creator position
    this.xt = this.xt_new;
    this.yt = this.yt_new;

    // A move has been used up
    this.moves_left -= 1;
};


Creator.prototype.roll_moves = function() {
    // Calculate a random number indicating how far a Creator will move in
    // its present direction before changing course.
    return Math.max(
        Math.round(this.length_sd * random_normal() + this.length_mean),
        this.length_min
    );
};


Creator.prototype.update_direction = function(avoid_last_direction) {
    // Create a new probability distribution over possible motion
    // directions, and then sample from it.

    // Previous direction
    var last_direction = this.direction;

    // Scores indicating direction preference. Eventually turned into a
    // probability distribution
    var direction_scores = [1 + this.bias_up,
                            1 + this.bias_right,
                            1 + this.bias_down,
                            1 + this.bias_left];

    // Add in winning Tile bias
    var bias, target_x, target_y;
    if (this.win_bias <= 0) {
        // Negative bias, move towards the starting Tile
        target_x = this.start_x;
        target_y = this.start_y;
        bias = -this.win_bias;
    }
    else {
        // Positive bias, move towards the winning Tile
        target_x = this.win_x;
        target_y = this.win_y;
        bias = this.win_bias;
    }
    // Horizontal bias
    if (target_x > this.xt) {
        // Target Tile is to the right
        direction_scores[RIGHT] =
            Math.max(direction_scores[RIGHT] + bias, 0);
        direction_scores[LEFT] =
            Math.max(direction_scores[LEFT] - bias, 0);
    }
    else if (target_x < this.xt) {
        // Target Tile is to the left
        direction_scores[RIGHT] =
            Math.max(direction_scores[RIGHT] - bias, 0);
        direction_scores[LEFT] =
            Math.max(direction_scores[LEFT] + bias, 0);
    }
    // Vertical bias
    if (target_y < this.yt) {
        // Target Tile is up
        direction_scores[UP] =
            Math.max(direction_scores[UP] + bias, 0);
        direction_scores[DOWN] =
            Math.max(direction_scores[DOWN] - bias, 0);
    }
    else if (target_y < this.yt) {
        // Target Tile is down
        direction_scores[UP] =
            Math.max(direction_scores[UP] - bias, 0);
        direction_scores[DOWN] =
            Math.max(direction_scores[DOWN] + bias, 0);
    }

    // Last direction avoidance logic
    if (avoid_last_direction) {
        // Set direction_scores[last_direction] to 0 so there is no chance of
        // continuing in that direction
        direction_scores[last_direction] = 0;
        // Add a small chance of going in the opposite direction to prevent
        // stagnation
        var opposite_direction = (last_direction + 2) % 4;
        direction_scores[opposite_direction] += 0.1;
    }

    // Create a cumulative distribution function from the scores
    var direction_cdf = [];
    var score_sum = direction_scores[0] + direction_scores[1]
        + direction_scores[2] + direction_scores[3];
    for (var i = 0; i < 4; i++) {
        var sum = 0;
        for (var j = 0; j <= i; j++) {
            sum += direction_scores[j];
        }
        direction_cdf.push(sum / score_sum)
    }

    // Choose the new direction
    var decider = Math.random();
    if (decider < direction_cdf[0]) {
        this.direction = UP;
    }
    else if (decider < direction_cdf[1]) {
        this.direction = RIGHT;
    }
    else if (decider < direction_cdf[2]) {
        this.direction = DOWN;
    }
    else {
        this.direction = LEFT;
    }

    // Reset moves_left
    this.moves_left = this.roll_moves();

    // Update path avoidance
    if (this.avoid_prob > 0) {
        // More path-avoiding
        this.avoid_prob += (1 - this.avoid_prob) *
            this.d_avoid_prob * (1. - this.life_remaining / this.lifetime);
    }
    else {
        // Less path-avoiding
        this.avoid_prob -= this.avoid_prob *
            (-this.d_avoid_prob) * (1. - this.life_remaining / this.lifetime);
    }
};