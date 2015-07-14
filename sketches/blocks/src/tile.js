// Mnemonic variable names for the Tile types.
const T_air = 0;
const T_stone = 1;
const T_dirt = 2;


// TileArray containing all Tiles on the screen.
var tiles;

// Size of the Tiles in pixels.
const tileSize = 16;
const iTileSize = 1/tileSize;

function Tile(parent, xt, yt, typeID) {
    // Parent TileArray.
    this.parent = parent;

    // Set position in Tile and world coordinates.
    this.xt = xt;
    this.yt = yt;
    this.h = tileSize;
    this.w = tileSize;

    // Linear index in the TileArray (row-major).
    this.ind = this.parent.xy2ind(xt, yt);

    // World (x,y) coordinates of the bottom-left corner.
    this.xw0 = tileSize * xt;
    this.yw0 = tileSize * yt;

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

    // Tile magic.
    this.magic = 0;
    // Tile magic conductance. Range: [0, 1/6).
    this.m_c = 0;
    // Tile magic dissipation. Range: [0, 1].
    this.m_dis = 0.99;

    // Sets up tile type and associated properties.
    this.setType(0);

    // Vertex data.
    this.verts = new Float32Array(12);
    var vert0 = clipSpace2(this.xw0, this.yw0);
    this.verts.push(vert0[0], vert0[1]);
    var vert1 = clipSpace2(this.xw0, this.yw0 +  this.h);
    this.verts.push(vert1[0], vert1[1]);
    var vert2 = clipSpace2(this.xw0 + this.w, this.yw0);
    this.verts.push(vert2[0], vert2[1]);
    // vert3 same as vert1
    this.verts.push(vert1[0], vert1[1]);
    // vert4 same as vert2
    this.verts.push(vert2[0], vert2[1]);
    var vert5 = clipSpace2(this.xw0 + this.w, this.yw0 + this.h);
    this.verts.push(vert5[0], vert5[1]);

    this.updated = false;

    // Add to the parent TileArray's update queue, to finish setting up type
    // properties and draw.
    this.triggerUpdate();

}

// Prototype setup ---------------------------------------------------------------------------------------------------//
Tile.prototype = {
    setType: function(id) {
        this.typeID = id;
        switch(id) {
            case T_air: // 0: Air
                this.solid = false;
                this.color = [0, 0, 0, 0];

                this.h_c = 0.9;
                this.h_dis = 0.95;
                this.m_c = 0.2;
                this.m_dis = 0.99;
                break;

            case T_stone: // 1: Stone
                this.solid = true;
                this.color = [0.666667, 0.02353, 0.30196, 1];

                this.h_c = 0.7;
                this.h_dis = 0.992;
                this.m_c = 0.95;
                this.m_dis = 0.99;
                break;

            case T_dirt: // 2: Dirt
                this.solid = true;
                this.color = [0.07843, 0.94118, 0.18039, 1];

                this.h_c = 0.2;
                this.h_dis = 0.99999;
                this.m_c = 0.1;
                this.m_dis = 0.9999;
                break;
        }
    },

    triggerUpdate: function() {
        if(!this.updated) {
            this.parent.updateTiles.push(this);
            this.updated = true;
        }
    },

    update: function() {
        var texID = this.ind * 4;
        var p = this.parent;

        this.heat = p.mapTex[texID];
        this.magic = p.mapTex[texID + 1];
        //this.typeID = Math.round(p.mapTex[texID + 2]);

        //this.setType(this.typeID);

        // Add the Tile's vertex data to the various AttributeArrays' data.
        // a_xy:
        p.attributes.a_xy.update(this.verts, 1, 12);
        // a_color:
        p.attributes.a_color.update(this.color, 6, 4);
        // a_maps:
        p.attributes.a_maps.update([this.h_c, this.h_dis, this.m_c, this.m_dis], 6, 4);
    }
};

// -------------------------------------------------------------------------------------------------------------------//
function TileArray(x, y) {
    this.tiles = [];
    this.updateTiles = [];
    this.width = x;
    this.height = y;
    for(var i=0; i<y; i++) {
        for(var j=0; j<x; j++)
        {
            var tile = new Tile(j, i, 0);
            this.tiles.push(tile);
        }
    }
}

// -------------------------------------------------------------------------------------------------------------------//
TileArray.Prototype = {
    xy2ind: function(x, y) {
        // Convert (x,y) coordinates into a row-major linear index.
        return y * this.width + x;
    },

    ind2xy: function(ind) {
        // Convert a row-major linear index to (x,y) coordinates.
        var y = Math.floor(ind / this.width);
        var x = ind % this.width;
        return [x,y];
    },

    getTile: function(x, y) {
        return tiles[this.xy2ind(x,y)];
    },

    // Setup the WebGL variables necessary to draw the Tiles on the screen and into the heat and magic maps.
    setupGL: function() {
        this.nTiles = this.width * this.height;
        this.nVertices = 6 * this.width * this.height;

        // AttributeArrays used in drawing the TileArray.
        this.attributes = {
            a_xy: new AttributeArray('a_position', this.nVertices, 2, true),
            a_color: new AttributeArray('a_color', this.nVertices, 4, true),
            a_maps: new AttributeArray('a_maps', this.nVertices, 4, true)
        };
        this.akeys = this.attributes.keys;

        // ShaderProgram ??? produces a small-scale TileArray data texture containing info about
        // 0: Tile heat
        // 1: Tile magic
        // 2: Tile type
        // 3: Tile update flag
        // for each Tile in the TileArray. that texture information is stored CPU-side in this.mapTex.
        this.mapTex = new Float32Array(4 * this.nTiles);
    },

    // Reset the AttributeArray counters.
    resetAAs: function() {
        // Reset AttributeArrays' activeCounter and activeLengths.
        for(var i=0; i<this.akeys.length; i++) {
            var key = this.akeys[i];
            this.attributes[key].reset();
        }
    },

    update: function() {
        // Reset AttributeArray counters.
        this.resetAAs();

        // Read in Tiles to be updated from mapTex.
        for(var i=0; i<this.nTiles; i++) {
            var idx = 4 * i + 3; // The texture channel with update info.
            if(idx > 0.5) { // Should be exactly 1 but eh, be loose with floats.
                this.tiles[i].triggerUpdate();
            }
        }

        // Call the update function for the Tiles in updateTiles.
        this.updateTiles.map(function(tile) {
            tile.update();
            _.pull(this.updateTiles, tile);
            tile.updated = false;
        });

        //// Clear updateTiles, reset Tile updated status.
        //for(i=0; i<this.updateTiles.length; i++) {
        //    var tile = this.updateTiles.pop();
        //    tile.updated = false;
        //}
    },

    // ---------------------------------------------------------------------------------------------------------------//
    drawMap: function() {
        // Update the tilemaps FloatBuffer.
        gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.tilemaps.fb);
        gl.viewport(0, 0, xWorld, yWorld);
        // Prepare the tilemaps ShaderProgram.
        shaderPrograms.tilemaps.prep(true);
        // Draw
        gl.drawArrays(shaderPrograms.tilemaps.drawType, 0, this.attributes.a_xy.activeCounter);
    },

    // ---------------------------------------------------------------------------------------------------------------//
    draw: function() {
        // Update the drawtiles FloatBuffer.

        gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.drawtiles.fb);
        gl.viewport(0, 0, xWorld, yWorld);
        // Prepare the drawtile ShaderProgram.
        shaderPrograms.drawtiles.prep(true);
        // Draw
        gl.drawArrays(shaderPrograms.drawtiles.drawType, 0, this.attributes.a_xy.activeCounter);
    },

    // ---------------------------------------------------------------------------------------------------------------//
    render: function() {
        // Render the drawtiles FloatBuffer to the screen.

        gl.bindFramebuffer(gl.FRAMEBUFFER, 0);
        gl.viewport(0, 0, xWorld, yWorld);

        shaderPrograms.rendertiles.prep();

        gl.drawArrays(shaderPrograms.rendertiles.drawType, 0, 4);
    }

};