// Possible Tile types
TileEnum = {WALL: 0, PATH: 1, WIN: 2};


function Tile(xt, yt) {
    // A single Labyrinth tile.

    // Tile coordinates
    this.xt = xt;
    this.yt = yt;

    // Linear tile index
    this.idx = this.xt + labyrinth.n_tiles_x * this.yt;

    // Tile type defaults to impassible wall
    this.type = this.set_type(TileEnum.WALL);

    // If true, the Tile cannot be traversed
    this.blocked = true;

    // Tracks whether the Tile has been initialized during Labyrinth setup
    this.initialized = false;

    // List of neighboring PATH Tiles
    this.neighbors = [];
    // Base weight value used for calculating diffusion operations on the
    // PATH Tiles.
    // Equal to 1 / (sqrt2 * [# URDL neighbors] + [# diagonal neighbors])
    this.neighbor_weight = null;

    // List of all Items whose positions overlap with this Tile
    this.items = [];

    // List of all Entities whose positions overlap with this Tile
    this.entities = [];

    // Tracks Tile "desaturation" upon exposure to Player light
    this.desat = 0;

    // Tile coloring properties
    // Tile hue
    this.c_h = null;
    // Tile saturation
    this.c_s = null;
    // Maximum Tile brightness
    this.c_b_max = null;
    // Brightness baseline and active illumination components
    this.c_b_base = null;
    this.c_b_active = 0;
    // Used for active lighting updates.
    this.c_b_active_new = 0;
}


Tile.prototype.set_type = function(new_type) {
    // Set the type of the Tile, perform type-related updates.

    switch (new_type) {
        case TileEnum.WALL:
            this.blocked = true;
            this.c_h = 0;
            this.c_s = 1;
            this.c_b_max = 1;
            this.c_b_base = 0;
            break;

        case TileEnum.PATH:
            this.blocked = false;
            this.c_h = 0.635;
            this.c_s = 0.5;
            this.c_b_max = 1;
            this.c_b_base = 0;
            break;

        case TileEnum.WIN:
            this.blocked = false;
            this.c_h = 0.4;
            this.c_s = 1;
            this.c_b_max = 1;
            this.c_b_base = 0;
            break;

        default:
            throw 'Unknown Tile type.'
    }
};