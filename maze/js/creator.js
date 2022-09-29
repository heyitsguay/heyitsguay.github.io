const D_UP = 0;
const D_RIGHT = 1;
const D_DOWN = 2;
const D_LEFT = 3;

class Creator {
    constructor(
            xt,
            yt,
            directionBias,
            directionBiasStrength,
            winBias,
            startBias,
            lengthMean,
            lengthSD,
            lengthMin,
            corridorWidth,
            avoidProb,
            direction,
            lifeTime) {
        this.xt = xt;
        this.yt = yt;
        this.xtnew = xt;
        this.ytnew = yt;
        this.xw = this.xt * TILE_SIZE;
        this.yw = this.yt * TILE_SIZE;

        this.directionBias = directionBias;
        this.directionBiasStrength = directionBiasStrength;

        this.biasUp = max(0, sin(directionBias) * directionBiasStrength);
        this.biasRight = max(0, cos(directionBias) * directionBiasStrength);
        this.biasDown = max(0, -sin(directionBias) * directionBiasStrength);
        this.biasLeft = max(0, -cos(directionBias) * directionBiasStrength);

        this.winBias = winBias;
        this.startBias = startBias;

        this.lengthMean = lengthMean;
        this.lengthSD = lengthSD;
        this.lengthMin = lengthMin;
        this.corridorWidth = corridorWidth;

        this.avoidProb = avoidProb;
        this.direction = direction;

        this.lifeTime = lifeTime;
        this.lifeRemaining = lifeTime;

        this.movesLeft = this.rollMoves();
    }

    move() {
        // Convert wall Tiles to path Tiles
        this.changeTiles(T_WALL, T_PATH);

        this.lifeRemaining -= 1;

        if (this.movesLeft === 0) {
            this.update(false);
        }

        switch(this.direction) {
            case D_UP:
                this.xtnew = this.xt;
                this.ytnew = this.yt - 1;
                break;
            case D_RIGHT:
                this.xtnew = this.xt + 1;
                this.ytnew = this.yt;
                break;
            case D_DOWN:
                this.xtnew = this.xt;
                this.ytnew = this.yt + 1;
                break;
            case D_LEFT:
                this.xtnew = this.xt - 1;
                this.ytnew = this.yt;
                break;
        }

        if (this.xtnew === 0 || this.xtnew > tilesX - 2 || this.ytnew === 0 || this.ytnew > tilesY - 2) {
            this.update(true);
            return;
        }

        if (tiles[this.xtnew][this.ytnew].neighborList.size() > 1) {
            if (random(1.0) < this.avoidProb) {
                this.update(true);
                return;
            }
        }

        // If move() hasn't returned by now, move the Creator to the new location
        this.xt = this.xtnew;
        this.yt = this.ytnew;
        this.movesLeft -= 1;
    }

    update(avoidPrevDirection) {
        // Create a probability distribution over the possible motion
        // directions, then sample from it

        let prevDirection = this.direction;

        let P_newDirection = [
            1 + this.biasUp, 1 + this.biasRight, 1 + this.biasDown, 1 + this.biasLeft];

        // Add in winning Tile bias
        let dx = Math.sign(xtWin - this.xt);
        P_newDirection[D_RIGHT] += dx * this.winBias;
        P_newDirection[D_LEFT] -= dx * this.winBias;
        let dy = Math.sign(ytWin - this.yt);
        P_newDirection[D_DOWN] += dy * this.winBias;
        P_newDirection[D_UP] -= dy * this.winBias;
        this.clampWeights(P_newDirection);

        // Add in start Tile bias
        dx = Math.sign(xtStart - this.xt);
        P_newDirection[D_RIGHT] += dx * this.startBias;
        P_newDirection[D_LEFT] -= dx * this.startBias;
        dy = Math.sign(ytStart - this.yt);
        P_newDirection[D_DOWN] += dy * this.startBias;
        P_newDirection[D_UP] -= dy * this.startBias;
        this.clampWeights(P_newDirection);

        // Are we avoiding the previously chosen direction?
        if (avoidPrevDirection) {
            // Add a small chance of going the other way to prevent stagnation
            P_newDirection[prevDirection] = 0;
            P_newDirection[(prevDirection + 2) % 4] += 0.1;
        }

        // Normalize P_newDirection to create a probability vector.
        let pSum = 0;
        for (let p of P_newDirection) {
            pSum += p;
        }
        for (let i = 0; i < P_newDirection.length; i++) {
            P_newDirection[i] /= pSum;
        }

        let directionDecider = random(1.0);
        if (directionDecider < P_newDirection[0]) {
            this.direction = D_UP;
        } else if (directionDecider < P_newDirection[0] + P_newDirection[1]) {
            this.direction = D_RIGHT;
        } else if (directionDecider < P_newDirection[0] + P_newDirection[1] + P_newDirection[2]) {
            this.direction = D_DOWN;
        } else {
            this.direction = D_LEFT;
        }

        // Reset
        this.movesLeft = this.rollMoves();

        // Make the Creator more self-avoiding
        this.avoidProb += 0.4 * (1 - this.lifeRemaining / this.lifeTime) * (1 - this.avoidProb);
    }

    clampWeights(vector) {
        for (let i = 0; i < vector.length; i++) {
            vector[i] = max(vector[i], 0);
        }
    }

    changeTiles(type0, type1) {
        // Change all Tiles of type type0 to type type1, within radius
        // this.corridorWidth of this Creator's location
        let wmin = parseInt(-(this.corridorWidth - 1) / 2);
        let wmax = parseInt(ceil((this.corridorWidth - 1) / 2));
        let tile;
        if (this.direction === D_UP) {
            for (let i = wmin; i <= wmax; i++) {
                let xi = this.xt + i;
                if (xi > 0 && xi < tilesX - 1) {
                    tile = tiles[xi][this.yt];

                }
            }
        } else if (this.direction === D_RIGHT) {
            for (let i = wmin; i <= wmax; i++) {
                let yi = this.yt + i;
                if (yi > 0 && yi < tilesY - 1) {
                    tile = tiles[this.xt][yi];
                    if (tile.type === type0) {
                        tile.setType(type1);
                    }
                }
            }
        } else if (this.direction === D_DOWN) {
            for (let i = wmin; i <= wmax; i++) {
                let xi = this.xt - i;
                if (xi > 0 && xi < tilesX - 1) {
                    tile = tiles[xi][this.yt];

                }
            }
        } else {
            for (let i = wmin; i <= wmax; i++) {
                let yi = this.yt - i;
                if (yi > 0 && yi < tilesY - 1) {
                    tile = tiles[this.xt][yi];
                    if (tile.type === type0) {
                        tile.setType(type1);
                    }
                }
            }
        }
        if (tile.type === type0) {
            tile.setType(type1);
        }
    }

    rollMoves() {
        return max(
            parseInt(this.lengthSD * randomGaussian() + this.lengthMean),
            this.lengthMean);
    }
}