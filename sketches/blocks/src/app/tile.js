/**
 * The canvas is parsed into square tiles, with properties that control where Entities can move and how much heat
 * diffuses or dissipates within its bounds. Tiles come in multiple types which dictate their properties.
 * @typedef {uint} TileEnum - enumerates the possible Tile types.
 * @param {uint} xt - Tile x location within the parent TileArray.
 * @param {uint} yt - Tile y location within the parent TileArray
 * @param {TileEnum} type - This Tile's type.
 * @constructor
 */
function Tile(xt, yt, type) {
    this.xt = xt;
    this.yt = yt;
    this.type = type;

    // Parent TileArray.
    this.parent = tiles;

    // Tile size in pixels.
    this.h = tileSize;
    this.w = tileSize;

    // Linear index in the TileArray (row-major).
    this.ind = this.parent.xy2ind(this.xt, this.yt);

    // World (x,y) coordinates of the bottom-left corner.
    this.xw0 = tileSize * this.xt;
    this.yw0 = tileSize * this.yt;

    // World (x,y) coordinates of the center.
    this.xc = this.xw0 + 0.5 * tileSize;
    this.yc = this.yw0 + 0.5 * tileSize;

    // Tile heat.
    this.heat = 0;
    // Tile heat conductance. Range: [0, 1).
    // (Actually [0, 1/6) but the object variable is scaled for convenience).
    this.h_c = 0;
    // Tile heat dissipation. Range: [0, 1].
    this.h_dis = 0.99;

    // Sets up tile type and associated properties.
    this.typeSetup();

    // Vertex data.
    this.verts = new Float32Array(12);
    var vert0 = clipSpace2(this.xw0, this.yw0);
    this.verts[0] = vert0[0]; this.verts[1] = vert0[1];
    var vert1 = clipSpace2(this.xw0, this.yw0 +  this.h);
    this.verts[2] = vert1[0]; this.verts[3] = vert1[1];
    var vert2 = clipSpace2(this.xw0 + this.w, this.yw0);
    this.verts[4] = vert2[0]; this.verts[5] = vert2[1];
    // vert3 same as vert1
    this.verts[6] = vert1[0]; this.verts[7] = vert1[1];
    // vert4 same as vert2
    this.verts[8] = vert2[0]; this.verts[9] = vert2[1];
    var vert5 = clipSpace2(this.xw0 + this.w, this.yw0 + this.h);
    this.verts[10] = vert5[0]; this.verts[11] = vert5[1];

    // Indicates whether the Tile has been updated in the current frame yet.
    this.updated = false;

    // Add to the parent TileArray's update queue, to finish setting up type
    // properties and draw.
    this.triggerUpdate();

}

/**
 * Sets the Tile properties that are dependent on this.type.
 */
Tile.prototype.typeSetup = function() {
    switch(this.type) {
        case TileEnum.AIR:
            this.solid = false;
            this.color = [0, 0, 0, 0];

            this.h_c = 0.9;
            this.h_dis = 0.995;
            break;

        case TileEnum.STONE:
            this.solid = true;
            this.color = [0.666667, 0.02353, 0.30196, 1];

            this.h_c = 0.7;
            this.h_dis = 0.9992;
            break;

        case TileEnum.DIRT:
            this.solid = true;
            this.color = [0.07843, 0.94118, 0.18039, 1];

            this.h_c = 0.2;
            this.h_dis = 0.99999;
            break;

        case TileEnum.SLOWAIR:
            this.solid = false;
            this.color = [0, 0, 0, 0];

            this.h_c = 0.3;
            this.h_dis = 0.99999;
            break;
    }
};

/**
 * Add this Tile to its parent's updateTiles (list of Tiles to be updated), if it's not already updated.
 */
Tile.prototype.triggerUpdate = function() {
    if(!this.updated) {
        this.parent.updateTiles.push(this);
        this.updated = true;
    }
};

/**
 * Update this Tile.
 */
Tile.prototype.update = function() {
    var texID = this.ind * 4;
    var p = this.parent;

    this.heat = p.heatTexture[texID];

    // Add the Tile's vertex data to the various AttributeArrays' data.
    // a_position:
    p.attributes.a_position.update(this.verts, 1, 12);
    // a_color:
    p.attributes.a_color.update(this.color, 6, 4);
    // a_heat:
    p.attributes.a_heat.update([this.h_c, this.h_dis, 0, 0], 6, 4);

    this.updated = false;
};