// Quick temporary level setup.
function level0() {
    var i, j;

    for(i=0; i<xTile*8; i++) {
        tiles.tiles[i].setType(T_stone);
    }
    for(i=0; i<xTile/2; i++) {
        for(j=8; j<11; j++) {
            tiles.getTile(i, j).setType(T_dirt);
        }
    }

    // Cold block, to test diffusion.
    tiles.getTile(xTile/2, 15).heat = -5;
}