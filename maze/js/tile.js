// Menmonic variable names for Tile types.
const T_WALL = 0;
const T_PATH = 1;
const T_WIN = 2;

// Mnemonic variable names for Tile Room states
const R_NO = 0;
const R_BDRY = 1;
const R_YES = 2;
const R_CHKD = 3;

class Tile {
    constructor(xt, yt) {
        this.xt = xt;
        this.yt = yt;

        this.xw = this.xt * TILE_SIZE;
        this.yw = this.yt * TILE_SIZE;

        this.neighborList = [];

        this.setType(T_WALL);

        this.initialized = false;

        this.itemList = [];
        this.entityList = [];

        this.alignment = 0;
        this.a_h = 0.1;
        this.a_s = 0.;
        this.a_b = 0.05;

        this.c_bactive = 0;
        this.c_bactiveNew = 0;

        this.desat = 0;
        this.desatRate = 0.000025;

        this.roomState = R_NO;
        this.c_hroom = 0;

        this.dh = 0;
        this.final_h = 0;
        this.c_bmax = 1;
        this.sparkle = 0;
        this.blocked = true;
        this.baseNeighborWeight = 0;
    }

    display() {
        push();
        translate(-screenX, -screenY);

        const numWinSubdivisions = 4;
        const subdivisionSize = parseInt(TILE_SIZE / numWinSubdivisions);

        // Fill colors
        if (this.type === T_WIN) {
            noStroke();
            for (let i = 0; i < numWinSubdivisions; i++) {
                for (let j = 0; j < numWinSubdivisions; j++) {
                    this.c_h = random(1.);
                    this.dh = constrain(this.dh + 0.005 * random(-1, 1), -1, 1);

                    if (player.ghost && this.type !== T_WALL) {
                        this.final_b = 0.9;
                    } else {
                        this.final_b = constrain(this.c_bbase + this.c_bactive + this.a_b * this.alignment, 0, 1);
                    }
                    fill(this.c_h, 1, this.final_b);
                    rect(
                        this.xw + i * subdivisionSize,
                        this.yw + j * subdivisionSize,
                        subdivisionSize,
                        subdivisionSize);
                }
            }
        } else {
            let actual_final_h = mod1(this.final_h + 0.3 * this.sparkle * sin(0.25 * (1 + this.sparkle) * t));
            let final_s = constrain(this.c_s - this.desat + this.a_s * this.alignment, 0, 1);
            if (player.ghost && this.type !== T_WALL) {
                this.final_b = 0.9;
            } else {
                this.final_b = constrain(this.c_bbase + this.c_bactive + this.a_b * this.alignment, 0, 1);
            }

            fill(actual_final_h, final_s, this.final_b * this.c_bmax);
            noStroke();
            rect(this.xw, this.yw, TILE_SIZE, TILE_SIZE);
        }
        pop();

        for (let i = 0; i < this.itemList.size; i++) {
            this.itemList[i].display();
        }

    }

    setType(type) {
        this.type = type;

        // Special changes for each type, on a case-by-case basis
        switch(this.type) {
            case T_WALL:
                this.blocked = true;
                this.c_h = 0;
                this.c_s = 1;
                this.c_bmax = 1;
                this.c_bbase = 0;
                break;
            case T_PATH:
                this.blocked = false;
                this.c_h = 0.635;
                this.c_s = 0.5;
                this.c_bmax = 1;
                this.c_bbase = 0;
                break;
            case T_WIN:
                this.blocked = false;
                this.c_h = 0.4;
                this.c_s = 1;
                this.c_bmax = 1;
                this.c_bbase = 0;
                break;
        }
    }
}