class Chunk {
    constructor(xc, yc) {
        this.xc = xc;
        this.yc = yc;
        this.xw = xc * chunkPix;
        this.yw = yc * chunkPix;

        this.xt0 = this.xc * CHUNK_SIZE;
        this.yt0 = this.yc * CHUNK_SIZE;
        this.xt1 = this.xt0 + CHUNK_SIZE - 1;
        this.yt1 = this.yt0 + CHUNK_SIZE - 1;

        this.entityList = [];
        this.itemList = [];
    }

    updateEntities() {
        if (this.entityList.length > 0) {
            for (let i = this.entityList.length - 1; i >= 0; i--) {
                this.entityList.get(i).update();
            }
        }
    }

    drawEntries() {
        if (this.entityList.length > 0) {
            for (let i = this.entityList.length - 1; i >= 0; i--) {
                this.entityList.get(i).display();
            }
        }
    }
}