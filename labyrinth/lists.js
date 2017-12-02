// Created 09/05/17 by Matt Guay

function TileList() {
    // Base class for dynamic lists of Tiles which can be used to modify Tile
    // data.

    // The actual list of Tiles
    this.tiles = [];

    // Track whether each Labyrinth Tile is in this list
    this.in_list = [];
    this.n_tiles = labyrinth.n_tiles;
    for(var i = 0; i < this.n_tiles; i++) {
        this.in_list.push(false);
    }
}


TileList.prototype.add = function(tile) {
    // Add the input tile to the Tile list if it is not already present.

    // Tile index
    var tile_idx = tile.idx;

    if (!this.in_list[tile_idx]) {
        this.tiles.push(tile);
        this.in_list[tile_idx] = true;
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


TileList.prototype.removal_check = function(tile) {
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
    this.in_list[tile.idx] = false;
};


TileList.prototype.update = function(i) {
    // Update list element i. Overwritten by TileList subclasses.

};


TileList.prototype.update_all = function() {
    // Update all Tiles in the TileList.

    for (var i = this.length() - 1; i >= 0; i--) {
        this.update(i);

    }
};






function InitializationList() {
    // List tracking Tile initialization.

    // Initialize superclass-derived members
    TileList.call(this);

    // Changes to true when the winning Tile enters the InitializationList,
    // which indicates that the Labyrinth is solvable
    this.solvable = false;
}
InitializationList.prototype = Object.create(TileList.prototype);


InitializationList.prototype.add_neighbors = function(tile) {
    // Add non-WALL neighbors of the input tile to the tile's list of
    // neighbors. Add any of those neighbors which are not already
    // initialized to this Initializationlist.

    // Number of diagonal neighbors
    var n_diagonal_neighbors = 0;
    // Number of URDL neighbors
    var n_urdl_neighbors = 0;

    // For brevity
    var xt = tile.xt;
    var yt = tile.yt;

    for (var dx = -1; dx <= 1; dx++) {
        // Horizontal bounds overflow check
        if (xt + dx >= 0 && xt + dx < labyrinth.n_tiles_x) {
            for (var dy = -1; dy <= 1; dy ++) {
                // Vertical bounds overflow check
                if (yt + dy >= 0 && yt + dy < labyrinth.n_tiles_y) {
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
                                var wall_x = labyrinth.tiles[xt + dx][yt].type
                                    === TileEnum.WALL;
                                var wall_y = labyrinth.tiles[xt][yt + dy].type
                                    === TileEnum.WALL;
                                if (!wall_x || !wall_y) {
                                    // One of the adjacent Tiles is not a
                                    // wall, so the diagonal neighbor is valid
                                    tile.neighbors.push(neighbor);
                                    // The input tile has one more diagonal
                                    // neighbor
                                    n_diagonal_neighbors += 1;

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
                                n_urdl_neighbors += 1;

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
    tile.neighbor_weight =
        1. / (n_diagonal_neighbors + SQRT2 * n_urdl_neighbors);
};


InitializationList.prototype.initialize = function(tile) {
    // Initialize the input Tile.

    tile.initialized = true;

    // Check if input tile is the winning Tile
    if (tile.xt === labyrinth.win_x && tile.yt ===labyrinth.win_y) {
        tile.set_type(TileEnum.WIN);

        // We've found the winner, so the Labyrinth is solvable
        this.solvable = true;
    }

    // Add neighboring non-wall Tiles to the input tile's neighbor list, and
    // add any non-initialized neighbor Tiles to the InitializationList
    this.add_neighbors(tile);
};


InitializationList.prototype.setup = function() {
    // Reset TileList attributes
    TileList.call(this);
    this.solvable = false;

    // Add the starting Tile to the list of Tiles
    this.add(labyrinth.tiles[labyrinth.start_x][labyrinth.start_y]);

    // Run the update function to initialize Tiles
    this.update_all();
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

    // Initialize superclass-derived members
    TileList.call(this);

    // Lighting diffusion rate
    this.diffusion_rate = 0.5;
    // Lighting decay constant
    this.decay_rate = 0.95;
    // Light values below threshold are zeroed
    this.threshold = 0.0001;
}
// Add TileList functions to LightList
LightList.prototype = Object.create(TileList.prototype);


LightList.prototype.diffuse_light = function(tile) {
    // Diffuse the input tile's brightness to its neighbors.

    for (var i = 0; i < tile.neighbors.length; i++) {
        var neighbor = tile.neighbors[i];

        // Add a portion of tile.c_b_active to each neighbor
        if (Math.abs(tile.xt - neighbor.xt) +
            Math.abs(tile.yt - neighbor.yt) === 2) {
            // Diagonal neighbor
            neighbor.c_b_active_new +=
                this.diffusion_rate * tile.neighbor_weight * tile.c_b_active;
        }
        else {
            // URDL neighbor
            neighbor.c_b_active_new += SQRT2 *
                this.diffusion_rate *  tile.neighbor_weight * tile.c_b_active;
        }

        // Add the neighbor Tile to the LightList
        this.add(neighbor);
    }

    // Add a portion of the previous brightness value to the new value
    tile.c_b_active_new += (1 - this.diffusion_rate) * tile.c_b_active;
};


LightList.prototype.removal_check = function(tile) {
    // Check if the input tile should be removed from the LightList because its
    // brightness is too close to 0.

    return (tile.c_b_active < this.threshold);
};


LightList.prototype.update = function(i) {
    // Update a Tile in the LightList.

    // Get Tile i
    var tile = this.tiles[i];

    // Update active brightness
    tile.c_b_active = this.decay_rate * tile.c_b_active_new;
    // Reset active brightness update variable
    tile.c_b_active_new = 0;

    // See if the Tile is a candidate for removal from the LightList
    if (this.removal_check(tile)) {
        this.remove(i);
    }
    else {
        // Diffuse the tile's brightness value to its neighbors, and add
        // those neighbors to the LightList
        this.diffuse_light(tile);
    }
};