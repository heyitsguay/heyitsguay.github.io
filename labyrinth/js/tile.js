// Possible Tile types
TileEnum = {WALL: 0, PATH: 1, WIN: 2};


function Tile(xt, yt) {
    // A single Labyrinth tile.

    // Tile coordinates
    this.xt = xt;
    this.yt = yt;

    // Linear tile index
    this.idx = this.xt + labyrinth.nTilesX * this.yt;

    // Tile type defaults to impassible wall
    this.type = this.setType(TileEnum.WALL);

    // If true, the Tile cannot be traversed
    this.blocked = true;

    // Tracks whether the Tile has been initialized during Labyrinth setup
    this.initialized = false;

    // List of neighboring PATH Tiles
    this.neighbors = [];
    // Base weight value used for calculating diffusion operations on the
    // PATH Tiles.
    // Equal to 1 / (sqrt2 * [# URDL neighbors] + [# diagonal neighbors])
    this.neighborWeight = null;

    // List of all Items whose positions overlap with this Tile
    this.items = [];

    // List of all Entities whose positions overlap with this Tile
    this.entities = [];

    // Tracks Tile "desaturation" upon exposure to Player light
    this.desat = 0;

    // Tile coloring properties
    // Tile hue
    this.cH = null;
    // Tile saturation
    this.cS = null;
    // Maximum Tile brightness
    this.cBMax = null;
    // Brightness baseline and active illumination components
    this.cBBase = null;
    this.cBActive = 0;
    // Used for active lighting updates.
    this.cBActiveNew = 0;
}


Tile.prototype.setType = function(newType) {
    // Set the type of the Tile, perform typeRelated updates.

    switch (newType) {
        case TileEnum.WALL:
            this.blocked = true;
            this.cH = 0;
            this.cS = 1;
            this.cBMax = 1;
            this.cBBase = 0;
            break;

        case TileEnum.PATH:
            this.blocked = false;
            this.cH = 0.635;
            this.cS = 0.5;
            this.cBMax = 1;
            this.cBBase = 0;
            break;

        case TileEnum.WIN:
            this.blocked = false;
            this.cH = 0.4;
            this.cS = 1;
            this.cBMax = 1;
            this.cBBase = 0;
            break;

        default:
            throw 'Unknown Tile type.'
    }
};