class InitializationList extends TileList {
    constructor() {
        super();
        this.foundTheWinner = false;

        this.addTile(tiles[xtStart][ytStart]);
        tiles[xtStart][ytStart].c_h = random(0, 1);
        tiles[xtStart][ytStart].dh = random(-1, 1);
    }

    update() {
        while (this.list.length > 0) {
            let tile = this.pop(0);
            this.initialize(tile);
        }
        return this.foundTheWinner;
    }

    initialize(tile) {
        tile.initialized = true;
        let xti = tile.xt;
        let yti = tile.yt;

        // Check if this is the winning Tile
        if (xti === xtWin && yti === ytWin) {
            tile.setType(T_WIN);
            this.foundTheWinner = true;
        }

        this.addTileNeighbors(tile);

        let itemCheck = random(1);
        let item;
        if (itemCheck < baseItemProbability) {
            item = new ItemChargeRestore(tile.xt, tile.yt);
        } else if (itemCheck < 2 * baseItemProbability) {
            item = new ItemGlowBoost(tile.xt, tile.yt);
        } else if (itemCheck < 3 * baseItemProbability) {
            item = new ItemChargeBoost(tile.xt, tile.yt);
        } else if (itemCheck < 4 * baseItemProbability) {
            item = new ItemStaminaBoost(tile.xt, tile.yt);
        }
    }

    addTileNeighbors(tile) {
        let xti = tile.xt;
        let yti = tile.yt;

        let numDiagonalNeighbors = 0;
        let numURDLNeighbors = 0;

        for (let dx = -1; dx < 2; dx++) {
            if(xti + dx >= 0 && xti + dx < tilesX) {
                for (let dy = -1; dy < 2; dy ++) {
                    if (yti + dy >= 0 && yti + dy < tilesY) {
                        if (!(dy === 0 && dx === 0)) {
                            let nTile = tiles[xti + dx][yti + dy];
                            // Add neighbor if it's not a wall
                            if (!(nTile.type === T_WALL)) {
                                // Rules for adding diagonal neighbors
                                if (dx !== 0 && dy !== 0) {
                                    // Only add diagonally-neighboring path Tiles if both URDL neighbors
                                    // are also path Tiles
                                    if (!(tiles[xti+dx][yti].type === T_WALL) && !(tiles[xti][yti+dy].type === T_WALL)) {
                                        tile.neighborList.add(nTile);
                                        numDiagonalNeighbors += 1;
                                    }
                                } else {
                                    // Add URDL neighbors
                                    tile.neighborList.add(nTile);
                                    numURDLNeighbors += 1;
                                }

                                if (!nTile.initialized) {
                                    this.addTile(nTile);
                                    nTile.dh = constrain(tile.dh + d2hRate * random(-1, 1), -1, 1);
                                    nTile.c_h = mod1(tile.c_h + dhRate * nTile.dh);
                                    let distToWinner = pow(nTile.xt - xtWin, 2) + pow(nTile.yt - ytWin, 2);
                                    let distScale = max(0, (maxDistance - distToWinner) / maxDistance);
                                    nTile.sparkle = pow(distScale, 1);
                                    nTile.final_h = nTile.c_h;
                                }
                            }
                        }
                    }
                }
            }
        }
        tile.baseNeighborWeight = 1 / (numDiagonalNeighbors + sqrt(2) * numURDLNeighbors);
    }
}

class LightList extends TileList {
    constructor() {
        super();
        this.decayRate = 0.95;
        this.threshold = 0.0001;
    }

    updateAll(diffusionRate) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            this.update(i, diffusionRate);
        }
    }

    update(listIdx, diffusionRate) {
        let tile = this.list[listIdx];

        let chargeStrength = 0.1 + 0.9 * max(0, (player.glowActive - player.glow) / player.glow);

        tile.c_bactive = this.decayRate * tile.c_bactiveNew;

        tile.desat = tile.desat + pow(constrain(tile.c_bactive, 0, 1), 2) * tile.desatRate * chargeStrength * (1 - tile.desat);

        if(this.tileRemovalCheck(tile)) {
            this.removeTile(listIdx);
        } else {
            tile.c_bactiveNew = 0;
            this.diffuseLight(tile, diffusionRate);
        }
    }

    diffuseLight(tile, diffusionRate) {
        for (let neighbor of tile.neighborList) {
            if (abs(tile.xt - neighbor.xt) + abs(tile.yt - neighbor.yt) === 2) {
                // Diagonal neighbor: diffusion weighted less
                neighbor.c_bactiveNew += diffusionRate * tile.baseNeighborWeight * tile.c_bactive;
            } else {
                // URDL neighbor: diffusion weighted more
                neighbor.c_bactiveNew += diffusionRate * sqrt(2) * tile.baseNeighborWeight * tile.c_bactive;
            }
            this.addTile(neighbor);
        }

        // Add a portion of the current active brightness to new active brightness
        tile.c_bactiveNew += (1 - diffusionRate) * tile.c_bactive;
    }

    tileRemovalCheck(tile) {
        return tile.c_bactive < this.threshold;
    }
}

class TileList {
    constructor() {
        this.list = [];
        this.inList = new Array(tilesX * tilesY).fill(false);
    }

    updateAll() {
        for(let i = this.list.length - 1; i >= 0; i--) {
            this.update(i);
        }
    }

    update(listIdx) {
        // Overwritten by subclasses
    }

    addTile(tile) {
        let tileIdx = getTileIdx(tile);

        if(!this.inList[tileIdx]) {
            this.list.add(tile);
            this.inList[tileIdx] = true;
        }
    }

    removeTile(listIdx) {
        let tile = this.list[listIdx];
        let tileIdx = getTileIdx(tile);
        this.list.remove(listIdx)
        this.inList[tileIdx] = false;
    }

    pop(listIdx) {
        let tile = this.list[listIdx];
        let tileIdx = getTileIdx(tile);
        this.list.remove(listIdx);
        this.inList[tileIdx] = false;
        return tile;
    }

    tileRemovalCheck(tile) {
        // Overwritten by subclasses
        return true;
    }
}