// Created 09/05/17 by Matt Guay

function TileList() {
    // Base class for dynamic lists of Tiles which can be used to modify Tile
    // data.

    // The actual list of Tiles
    this.tiles = [];

    // Track whether each Labyrinth Tile is in this list
    this.inList = [];
    this.nTiles = labyrinth.nTiles;
    for(var i = 0; i < this.nTiles; i++) {
        this.inList.push(false);
    }
}


TileList.prototype.add = function(tile) {
    // Add the input tile to the Tile list if it is not already present.

    // Tile index
    var tileIdx = tile.idx;

    if (!this.inList[tileIdx]) {
        this.tiles.push(tile);
        this.inList[tileIdx] = true;
    }
};


TileList.prototype.length = function() {
    // Returns the length of the list of Tiles.

    return this.tiles.length;
};


TileList.prototype.pop = function(i) {
    // Remove the Tile with index i from the list, and return it.

    // Tile at position i in the Tile list
    var tile = this.tiles[i];
    // Remove element i from the TileList
    this.remove(i);

    return tile;
};


TileList.prototype.removalCheck = function(tile) {
    // Determines whether the input tile should be removed from the
    // TileList. Overwritten by TileList subclasses.
};


TileList.prototype.remove = function(i) {
    // Remove Tile i from the TileList.

    // Get Tile i
    var tile = this.tiles[i];

    // Remove Tile i from the list
    this.tiles.splice(i, 1);

    // Tile i is no longer in this list
    this.inList[tile.idx] = false;
};


TileList.prototype.update = function(i) {
    // Update list element i. Overwritten by TileList subclasses.

};


TileList.prototype.updateAll = function() {
    // Update all Tiles in the TileList.

    for (var i = this.length() - 1; i >= 0; i--) {
        this.update(i);

    }
};






function InitializationList() {
    // List tracking Tile initialization.

    // Initialize superclassDerived members
    TileList.call(this);

    // Changes to true when the winning Tile enters the InitializationList,
    // which indicates that the Labyrinth is solvable
    this.solvable = false;
}
InitializationList.prototype = Object.create(TileList.prototype);


InitializationList.prototype.addNeighbors = function(tile) {
    // Add nonWALL neighbors of the input tile to the tile's list of
    // neighbors. Add any of those neighbors which are not already
    // initialized to this Initializationlist.

    // Number of diagonal neighbors
    var nDiagonalNeighbors = 0;
    // Number of URDL neighbors
    var nUrdlNeighbors = 0;

    // For brevity
    var xt = tile.xt;
    var yt = tile.yt;

    for (var dx = -1; dx <= 1; dx++) {
        // Horizontal bounds overflow check
        if (xt + dx >= 0 && xt + dx < labyrinth.nTilesX) {
            for (var dy = -1; dy <= 1; dy ++) {
                // Vertical bounds overflow check
                if (yt + dy >= 0 && yt + dy < labyrinth.nTilesY) {
                    // Don't check yourself
                    if (!(dy === 0 && dx === 0)) {
                        // Get the neighbor Tile
                        var neighbor = labyrinth.tiles[xt + dx][yt + dy];

                        // Maybe add this neighbor if it's not a wall
                        if (!(neighbor.type === TileEnum.WALL)) {
                            // Only add diagonal neighbors if an adjacent
                            // URDL neighbor is also not a wall
                            if (dx !== 0 && dy !== 0) {
                                // Check whether horizontal and vertical
                                // adjacent neighbors are walls
                                var wallX = labyrinth.tiles[xt + dx][yt].type
                                    === TileEnum.WALL;
                                var wallY = labyrinth.tiles[xt][yt + dy].type
                                    === TileEnum.WALL;
                                if (!wallX || !wallY) {
                                    // One of the adjacent Tiles is not a
                                    // wall, so the diagonal neighbor is valid
                                    tile.neighbors.push(neighbor);
                                    // The input tile has one more diagonal
                                    // neighbor
                                    nDiagonalNeighbors += 1;

                                    // Add the neighbor to the
                                    // InitializationList if it's not
                                    // already initialized
                                    if (!neighbor.initialized) {
                                        this.add(neighbor);
                                    }

                                }
                            }
                            else {
                                // URDL neighbor
                                tile.neighbors.push(neighbor);
                                // Input tile has one more URDL neighbor
                                nUrdlNeighbors += 1;

                                // Add the neighbor to the
                                // InitializationList if it's not already
                                // initialized
                                if (!neighbor.initialized) {
                                    this.add(neighbor);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Calculate the base neighbor weight used for lighting updates
    tile.neighborWeight =
        1. / (nDiagonalNeighbors + SQRT2 * nUrdlNeighbors);
};


InitializationList.prototype.initialize = function(tile) {
    // Initialize the input Tile.

    tile.initialized = true;

    // Check if input tile is the winning Tile
    if (tile.xt === labyrinth.xWin && tile.yt ===labyrinth.yWin) {
        tile.setType(TileEnum.WIN);

        // We've found the winner, so the Labyrinth is solvable
        this.solvable = true;
    }

    if (tile.type === TileEnum.PATH) {
        tile.mesh.material.color = new THREE.Color()
    }

    // Add neighboring nonWall Tiles to the input tile's neighbor list, and
    // add any nonInitialized neighbor Tiles to the InitializationList
    this.addNeighbors(tile);
};


InitializationList.prototype.setup = function() {
    // Reset TileList attributes
    TileList.call(this);
    this.solvable = false;

    // Add the starting Tile to the list of Tiles
    this.add(labyrinth.tiles[labyrinth.xStart][labyrinth.yStart]);

    // Run the update function to initialize Tiles
    this.updateAll();
};


InitializationList.prototype.update = function() {
    // InitializationList update function. Only gets called once.

    // Keep initializing while the list is nonempty
    while (this.length() > 0) {
        // Get a Tile from the list
        var tile = this.pop(0);
        // Initialize the Tile
        this.initialize(tile);
    }

    return this.solvable;
};






function LightList() {
    // List tracking which Tiles are lit, and updating their light values.

    // Initialize superclassDerived members
    TileList.call(this);

    // Lighting diffusion rate
    this.diffusionRate = 0.5;
    // Lighting decay constant
    this.decayRate = 0.95;
    // Light values below threshold are zeroed
    this.threshold = 0.0001;
}
// Add TileList functions to LightList
LightList.prototype = Object.create(TileList.prototype);


LightList.prototype.diffuseLight = function(tile) {
    // Diffuse the input tile's brightness to its neighbors.

    for (var i = 0; i < tile.neighbors.length; i++) {
        var neighbor = tile.neighbors[i];

        // Add a portion of tile.cBActive to each neighbor
        if (Math.abs(tile.xt - neighbor.xt) +
            Math.abs(tile.yt - neighbor.yt) === 2) {
            // Diagonal neighbor
            neighbor.cBActiveNew +=
                this.diffusionRate * tile.neighborWeight * tile.cBActive;
        }
        else {
            // URDL neighbor
            neighbor.cBActiveNew += SQRT2 *
                this.diffusionRate *  tile.neighborWeight * tile.cBActive;
        }

        // Add the neighbor Tile to the LightList
        this.add(neighbor);
    }

    // Add a portion of the previous brightness value to the new value
    tile.cBActiveNew += (1 - this.diffusionRate) * tile.cBActive;
};


LightList.prototype.removalCheck = function(tile) {
    // Check if the input tile should be removed from the LightList because its
    // brightness is too close to 0.

    return (tile.cBActive < this.threshold);
};


LightList.prototype.update = function(i) {
    // Update a Tile in the LightList.

    // Get Tile i
    var tile = this.tiles[i];

    // Update active brightness
    tile.cBActive = this.decayRate * tile.cBActiveNew;
    // Reset active brightness update variable
    tile.cBActiveNew = 0;

    // See if the Tile is a candidate for removal from the LightList
    if (this.removalCheck(tile)) {
        this.remove(i);
    }
    else {
        // Diffuse the tile's brightness value to its neighbors, and add
        // those neighbors to the LightList
        this.diffuseLight(tile);
    }
};