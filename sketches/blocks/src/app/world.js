/**
 * Loads a World into the App.
 * @constructor
 *
 */
function World(xTile_, yTile_, tileSize_, maxEntities_) {
    // An array of Tile objects which comprise the World.
    this.tiles = new TileArray(xTile_, yTile_);

    // World Tile size. Default is 16px.
    this.tileSize = !(tileSize_ == null) ? tileSize_ : 16;

    // Default maxEntities = 200.
    var maxEntities = !(maxEntities_ == null)? maxEntities_ : 200;
    // An array tracking all the Entities in the World.
    this.entities = new EntityList(maxEntities);

    // Possible states the World can be in.
    this.StateEnum = {
        UNINITIALIZED: -1,
        PAUSE: 0,
        PLAY: 1,
        WIN: 2
    };

    // Current World state.
    this.state = this.StateEnum.UNINITIALIZED;

    // The Player.
    this.player = new Player();

    this.initialized = false;
}

/**
 * Starts or restarts the World.
 */
World.prototype.restart = function() {
    if(!this.initialized) {
        this.tiles = new TileArray()
    }

};

/**
 * Using WebGL, subsamples the window's heat map and returns to the CPU a mini texture with a single
 * heat sample per Tile.
 * @param {uint} gltex
 */
World.prototype.getTileHeat = function(gltex) {

    // Bind the desired
    gl.activeTexture(gltex);
    gl.bindTexture(gl.TEXTURE_2D, tf.pongBuffers.tilesmall.readBuffer().texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tf.pongBuffers.tilesmall.writeBuffers().framebuffer);
    gl.viewport(0, 0, this.xScreenTiles, this.yScreenTiles);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    tf.shaderPrograms.tilesmall.prep(true);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back Tile heat.
    gl.readPixels(0, 0, this.xScreenTiles, this.yScreenTiles, gl.RGBA, gl.FLOAT, this.tileHeatArray);

    // Toggle the associated PongBuffer.
    tf.pongBuffers.tilesmall.toggle();
};
