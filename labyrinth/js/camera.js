function Camera(tileScale, chunkSize) {
    // Controls rendering of a Labyrinth.

    this.tileScale = tileScale;
    this.chunkSize = chunkSize;

    this.screenX = 0;
    this.screenY = 0;

    this.tilesVisibleX = parseInt(width / this)

}


Camera.prototype.updateScale = function(tileScale) {
    // Update Camera scale information.

    // Tile size in pixels
    this.tileScale = tileScale;
    // Chunk size in pixels
    this.chunkScale = tileScale * this.chunkSize;

    // Number of Tiles potentially visible onScreen
    this.tilesVisibleX = parseInt(width / tileScale) + 2;
    this.tilesVisibleY = parseInt(height / tileScale) + 2;

    // Number of Chunks to draw in each direction
    this.chunkDrawRadiusX = parseInt(width / this.chunkScale) + 1;
    this.chunkDrawRadiusY = parseInt(height / this.chunkScale) + 1;
};