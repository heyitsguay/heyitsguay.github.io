/**
 * Created by matt on 9/6/17.
 */

function Creator(xt,
                 yt,
                 directionBias,
                 directionBiasStrength,
                 winBias,
                 lengthMean,
                 lengthSd,
                 lengthMin,
                 avoidProb,
                 dAvoidProb,
                 initDirection,
                 lifetime) {
    // Stochastic automaton that creates the path portions of the labyrinth.

    // Current Tile coordinates
    this.xt = xt;
    this.yt = yt;

    // Putative new Tile coordinates, used when calculating movement
    this.xtNew = null;
    this.ytNew = null;

    // ArbitraryAngle direction bias gets translated into components in the
    // four cardinal directions
    this.biasUp =
        Math.max(0, Math.sin(directionBias) * directionBiasStrength);
    this.biasRight =
        Math.max(0, Math.cos(directionBias) * directionBiasStrength);
    this.biasDown =
        Math.max(0, Math.sin(directionBias) * directionBiasStrength);
    this.biasLeft =
        Math.max(0, Math.cos(directionBias) * directionBiasStrength);

    // Value in (Infinity, +Infinity). Large positive numbers drive the
    // Creator towards the winning Tile. Large negative numbers drive the
    // Creator towards the starting Tile
    this.winBias = winBias;

    // Corridor lengths are chosen randomly from a normal distribution with
    // this mean
    this.lengthMean = lengthMean;
    // And this standard deviation
    this.lengthSd = lengthSd;
    // Lower bound on corridor length
    this.lengthMin = lengthMin;

    // Probability of avoiding connecting to an existing hallway. When 1,
    // totally pathAvoiding
    this.avoidProb = avoidProb;
    // Controls how quickly this.avoidProb changes each time
    // this.updateDirection() is called. The Creator becomes more path
    // avoiding if this > 0, else it becomes less path avoiding. Value in
    // [-1, 1]
    this.dAvoidProb = dAvoidProb;

    // Current direction of the Creator
    this.direction = initDirection;

    // Number of moves remaining in the current direction before picking a
    // new one.
    this.movesLeft = this.rollMoves();

    // Number of updates the Creator performs before being deleted
    this.lifetime = lifetime;

    // Number of updates currently remaining
    this.lifeRemaining = lifetime;
}


Creator.prototype.move = function() {
    // Convert the Tile under this Creator to a PATH
    labyrinth.tiles[this.xt][this.yt].setType(TileEnum.PATH);

    this.lifeRemaining -= 1;

    // If out of moves, choose a new direction (can be same as the old one)
    if (this.movesLeft === 0) {
        this.updateDirection(false);
    }

    // Move
    switch (this.direction) {
        case UP:
            this.xtNew = this.xt;
            this.ytNew = this.yt - 1;
            break;

        case RIGHT:
            this.xtNew = this.xt + 1;
            this.ytNew = this.yt;
            break;

        case DOWN:
            this.xtNew = this.xt;
            this.ytNew = this.yt + 1;
            break;

        case LEFT:
            this.xtNew = this.xt - 1;
            this.ytNew = this.yt;
            break;

        default:
            throw new Error("Unexpected Creator motion direction");
    }

    // Check to see whether the move puts us on the Labyrinth boundary, and
    // avoid it if so
    var onXBdry = this.xtNew === 0 || this.xtNew > labyrinth.nTilesX - 2;
    var onYBdry = this.ytNew === 0 || this.ytNew > labyrinth.nTilesY - 2;
    if (onXBdry || onYBdry) {
        // Update direction, avoid current direction
        this.updateDirection(true);
        return;
    }

    // Check to see whether the move puts us onto a Tile connected to
    // another path Tile
    var borderingPath =
        labyrinth.tiles[this.xtNew + 1][this.ytNew].type !== TileEnum.WALL ||
        labyrinth.tiles[this.xtNew - 1][this.ytNew].type !== TileEnum.WALL ||
        labyrinth.tiles[this.xtNew][this.ytNew + 1].type !== TileEnum.WALL ||
        labyrinth.tiles[this.xtNew][this.ytNew - 1].type !== TileEnum.WALL;
    if (borderingPath) {
        // If so, don't move to the new Tile with probability avoidProb
        if (Math.random() < this.avoidProb) {
            // New direction
            this.updateDirection(true);
            return;
        }
    }

    // Update Creator position
    this.xt = this.xtNew;
    this.yt = this.ytNew;

    // A move has been used up
    this.movesLeft -= 1;
};


Creator.prototype.rollMoves = function() {
    // Calculate a random number indicating how far a Creator will move in
    // its present direction before changing course.
    return Math.max(
        Math.round(this.lengthSd * randomNormal() + this.lengthMean),
        this.lengthMin
    );
};


Creator.prototype.updateDirection = function(avoidLastDirection) {
    // Create a new probability distribution over possible motion
    // directions, and then sample from it.

    // Previous direction
    var lastDirection = this.direction;

    // Scores indicating direction preference. Eventually turned into a
    // probability distribution
    var directionScores = [1 + this.biasUp,
                            1 + this.biasRight,
                            1 + this.biasDown,
                            1 + this.biasLeft];

    // Add in winning Tile bias
    var bias, targetX, targetY;
    if (this.winBias <= 0) {
        // Negative bias, move towards the starting Tile
        targetX = this.xStart;
        targetY = this.yStart;
        bias = this.winBias;
    }
    else {
        // Positive bias, move towards the winning Tile
        targetX = this.xWin;
        targetY = this.yWin;
        bias = this.winBias;
    }
    // Horizontal bias
    if (targetX > this.xt) {
        // Target Tile is to the right
        directionScores[RIGHT] =
            Math.max(directionScores[RIGHT] + bias, 0);
        directionScores[LEFT] =
            Math.max(directionScores[LEFT] - bias, 0);
    }
    else if (targetX < this.xt) {
        // Target Tile is to the left
        directionScores[RIGHT] =
            Math.max(directionScores[RIGHT] - bias, 0);
        directionScores[LEFT] =
            Math.max(directionScores[LEFT] + bias, 0);
    }
    // Vertical bias
    if (targetY < this.yt) {
        // Target Tile is up
        directionScores[UP] =
            Math.max(directionScores[UP] + bias, 0);
        directionScores[DOWN] =
            Math.max(directionScores[DOWN] - bias, 0);
    }
    else if (targetY < this.yt) {
        // Target Tile is down
        directionScores[UP] =
            Math.max(directionScores[UP] - bias, 0);
        directionScores[DOWN] =
            Math.max(directionScores[DOWN] + bias, 0);
    }

    // Last direction avoidance logic
    if (avoidLastDirection) {
        // Set directionScores[lastDirection] to 0 so there is no chance of
        // continuing in that direction
        directionScores[lastDirection] = 0;
        // Add a small chance of going in the opposite direction to prevent
        // stagnation
        var oppositeDirection = (lastDirection + 2) % 4;
        directionScores[oppositeDirection] += 0.1;
    }

    // Create a cumulative distribution function from the scores
    var directionCdf = [];
    var scoreSum = directionScores[0] + directionScores[1]
        + directionScores[2] + directionScores[3];
    for (var i = 0; i < 4; i++) {
        var sum = 0;
        for (var j = 0; j <= i; j++) {
            sum += directionScores[j];
        }
        directionCdf.push(sum / scoreSum)
    }

    // Choose the new direction
    var decider = Math.random();
    if (decider < directionCdf[0]) {
        this.direction = UP;
    }
    else if (decider < directionCdf[1]) {
        this.direction = RIGHT;
    }
    else if (decider < directionCdf[2]) {
        this.direction = DOWN;
    }
    else {
        this.direction = LEFT;
    }

    // Reset movesLeft
    this.movesLeft = this.rollMoves();

    // Update path avoidance
    if (this.avoidProb > 0) {
        // More pathAvoiding
        this.avoidProb += (1 - this.avoidProb) *
            this.dAvoidProb * (1. - this.lifeRemaining / this.lifetime);
    }
    else {
        // Less pathAvoiding
        this.avoidProb -= this.avoidProb *
            (this.dAvoidProb) * (1. - this.lifeRemaining / this.lifetime);
    }
};