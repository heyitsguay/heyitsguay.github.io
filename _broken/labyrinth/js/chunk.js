// Chunk contains a collection of Tiles, and manages Entities and Items within
// those Tiles.

function Chunk(xc, yc) {
    // A collection of contiguous Tiles.

    // Chunk coordinates
    this.xc = xc;
    this.yc = yc;

    // Tiles with Tile coordinates (xt0, yt0) through (xt1, yt1) reside in
    // this Chunk
    this.xt0 = xc * chunkSize;
    this.xt1 = this.xt0 + chunkSize - 1;
    this.yt0 = yc * chunkSize;
    this.yt1 = this.yt0 + chunkSize - 1;

    // List of all Entities whose intersection with this Chunk is nonempty
    this.entities = [];

    // List of all Items whose intersection with this Chunk is nonempty
    this.items = [];
}


Chunk.prototype.update = function() {
    // Update this Chunk.

    // Update all Entities in this Chunk
    this.entities.map(function(el) { el.update(); });
};

Chunk.prototype.draw = function() {
    // Draw Chunk elements.

    // Draw all Entities
    this.entities.map(function(el) { el.draw(); });
};