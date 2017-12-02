function Camera(tile_scale, chunk_size) {
    // Controls rendering of a Labyrinth.

    this.tile_scale = tile_scale;
    this.chunk_size = chunk_size;

    this.screen_x = 0;
    this.screen_y = 0;

    this.tiles_visible_x = parseInt(width / this)

}


Camera.prototype.update_scale = function(tile_scale) {
    // Update Camera scale information.

    // Tile size in pixels
    this.tile_scale = tile_scale;
    // Chunk size in pixels
    this.chunk_scale = tile_scale * this.chunk_size;

    // Number of Tiles potentially visible on-screen
    this.tiles_visible_x = parseInt(width / tile_scale) + 2;
    this.tiles_visible_y = parseInt(height / tile_scale) + 2;

    // Number of Chunks to draw in each direction
    this.chunk_draw_radius_x = parseInt(width / this.chunk_scale) + 1;
    this.chunk_draw_radius_y = parseInt(height / this.chunk_scale) + 1;
};