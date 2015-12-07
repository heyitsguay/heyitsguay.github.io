/**
 * Quick temporary level setup. Should probably be a full-blown class.
 */
function level0() {
    var i, j;

    for(i=0; i<xTile*15; i++) {
        tiles.tiles[i].typeSetup(TileEnum.SLOWAIR);
    }
    for(i=0; i<xTile/2; i++) {
        for(j=8; j<11; j++) {
            tiles.typeSetup(i, j, TileEnum.DIRT);
        }
    }

    // Stone world boundary tiles.
    for(i=0; i<xTile; i++) {
        tiles.typeSetup(i, 0, TileEnum.STONE);
        tiles.typeSetup(i, yTile-1, TileEnum.STONE);
    }
    for(i=0; i<yTile; i++) {
        tiles.typeSetup(0, i, TileEnum.STONE);
        tiles.typeSetup(xTile-1, i, TileEnum.STONE);
    }

    // Cold block, to test diffusion.
    tiles.getTile(Math.floor(xTile/2), 15).heat = -500;
}