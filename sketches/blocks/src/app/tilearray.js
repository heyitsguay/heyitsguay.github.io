/**
 * A list of (width*height) Tiles with a 2D spatial layout. Contains the methods to update and render said Tiles.
 * @typedef {Object} Tile
 * @param {uint} width - Number of Tiles in the x direction.
 * @param {uint} height - Number of Tiles in the y direction.
 * @constructor
 */
function TileArray(width, height) {
    this.width = width;
    this.height = height;

    // List of all the Tiles in this TileArray. 1D layout, use this.xy2ind and this.ind2xy to convert back and forth
    // between 1D and 2D indexing.
    this.tiles = [];

    // List of all Tiles to be updated in the current frame.
    this.updateTiles = [];
}

/**
 * Sets up the Tiles in the TileArray, as well as the WebGL properties.
 */
TileArray.prototype.setup = function() {
    // Initialize all of the Tiles in the TileArray.
    for(var i=0; i<this.height; i++) {
        for(var j=0; j<this.width; j++)
        {
            var tile = new Tile(j, i, TileEnum.AIR);
            this.tiles.push(tile);
        }
    }
    this.setupGL();
};

/**
 * Converts 2D (x,y) coordinates into a row-major linear index.
 * @param {uint} x
 * @param {uint} y
 * @returns {uint}
 */
TileArray.prototype.xy2ind = function(x, y) {
    return y * this.width + x;
};

/**
 * Converts a row-major linear index to 2D (x,y) coordinates.
 * @param {uint} ind
 * @returns {uint[]}
 */
TileArray.prototype.ind2xy = function(ind) {
    var y = Math.floor(ind / this.width);
    var x = ind % this.width;
    return [x,y];
};

/**
 * Returns the Tile with coordinates (x,y) in the TileArray.
 * @param x
 * @param y
 * @returns {Tile}
 */
TileArray.prototype.getTile = function(x, y) {
    return this.tiles[this.xy2ind(x,y)];
};

/**
 * Setup the WebGL variables necessary to draw the Tiles on the screen and into the heat map.
 */
TileArray.prototype.setupGL = function() {
    this.nTiles = this.width * this.height;
    this.nVertices = 6 * this.width * this.height;

    // AttributeArrays used in drawing the TileArray.
    this.attributes = {
        a_position: new AttributeArray('a_position', this.nVertices, 2, true),
        a_color: new AttributeArray('a_color', this.nVertices, 4, true),
        a_heat: new AttributeArray('a_heat', this.nVertices, 4, true)
    };
    this.akeys = Object.keys(this.attributes);

    // ShaderProgram tilesmall produces a small-scale TileArray data texture containing info about
    // 0: Tile heat
    // 1: ???
    // 2: Tile type
    // 3: Tile update flag
    // for each Tile in the TileArray. that texture information is stored CPU-side in this.heatTexture.
    this.heatTexture = new Float32Array(4 * this.nTiles);
};

/**
 * Reset the AttributeArray counters.
 */
TileArray.prototype.resetAAs = function() {
    // Reset AttributeArrays' activeItems and activeLengths.
    for(var i=0; i<this.akeys.length; i++) {
        var key = this.akeys[i];
        this.attributes[key].reset();
    }
};

/**
 *
 */
TileArray.prototype.update = function() {
    // Reset AttributeArray counters.
    this.resetAAs();

    // Read in Tiles to be updated from heatTexture.
    for(var i=0; i<this.nTiles; i++) {
        var idx = 4 * i + 3; // The texture channel with update info.
        if(idx > 0.5) { // Should be exactly 1 but eh, be loose with floats.
            this.tiles[i].triggerUpdate();
        }
    }

    // Call the update function for the Tiles in updateTiles.
    this.updateTiles.map(function(tile) {
        tile.update();
        tile.updated = false;
    });
    // Clear this.updateTiles
    this.updateTiles = [];
};

/**
 * Update the tileheat FloatBuffer.
 */
TileArray.prototype.drawHeat = function() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.tileheat.framebuffer);
    gl.viewport(0, 0, xWorld, yWorld);
    // Prepare the tileheat ShaderProgram.
    shaderPrograms.tileheat.prep(true);
    // Draw
    gl.drawArrays(shaderPrograms.tileheat.drawType, 0, this.attributes.a_position.activeItems);
};

/**
 * Update the drawtiles FloatBuffer.
 */
TileArray.prototype.draw = function() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.drawtiles.framebuffer);
    gl.viewport(0, 0, xWorld, yWorld);
    // Prepare the drawtile ShaderProgram.
    shaderPrograms.drawtiles.prep(true);
    // Draw
    gl.drawArrays(shaderPrograms.drawtiles.drawType, 0, this.attributes.a_position.activeItems);
};

/**
 * Render the drawtiles FloatBuffer to the screen.
 */
TileArray.prototype.render = function() {
    // Render the drawtiles FloatBuffer to the screen.

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, xWorld, yWorld);

    shaderPrograms.drawtiles.prep();

    gl.drawArrays(shaderPrograms.drawtiles.drawType, 0, this.attributes.a_position.activeItems);
};

/**
 * Sets the type of Tile (x,y) in this TileArray.
 * @param {uint} x - x coordinate of the Tile.
 * @param {uint} y - y coordinate of the Tile.
 * @param {TileEnum} type - new Tile type.
 */
TileArray.prototype.typeSetup = function(x, y, type) {
    var ind = this.xy2ind(x,y);
    this.tiles[ind].typeSetup(type);
};