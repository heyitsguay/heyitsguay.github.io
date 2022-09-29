// Mnemonic variable names for Entity orientations
const O_U = 0;
const O_UR = 1;
const O_R = 2;
const O_DR = 3;
const O_D = 4;
const O_DL = 5;
const O_L = 6;
const O_UL = 7;

// Mnemonic variable names for Entity alignments
const A_FRIEND = 0;
const A_NEUTRAL = 1;
const A_HOSTILE = 2;

class Entity {
    constructor(w, h, boundingBoxOffset, mass, x, y, vx, vy, vmax, ax, ay, amax, friction, c_h, c_s, c_b, ghost, fixed) {
        this.orientation = O_D;
        this.animationState = 0;
        this.framesPerState = 8;
        this.alignment = A_NEUTRAL;

        this.w = w;
        this.h = h;
        this.boundingBoxOffset = boundingBoxOffset;
        this.mass = mass;

        this.x = x;
        this.y = y;
        this.xbb = x + boundingBoxOffset;
        this.ybb = y + boundingBoxOffset;
        this.wbb = w - 2 * boundingBoxOffset;
        this.hbb = h - 2 * boundingBoxOffset;

        this.xt = parseInt(this.xbb / TILE_SIZE);
        this.yt = parseInt(this.ybb / TILE_SIZE);
        this.xc = parseInt(this.xbb / chunkPix);
        this.yc = parseInt(this.ybb / chunkPix);

        this.xbbLast = this.xbb;
        this.ybbLast = this.ybb;

        this.xtLast = this.xt;
        this.ytLast = this.yt;
        this.xcLast = this.xc;
        this.ycLast = this.yc;

        this.xcenter = x + w / 2;
        this.ycenter = y + h / 2;
        this.xtcenter = parseInt(this.xcenter / TILE_SIZE);
        this.ytcenter = parseInt(this.ycenter / TILE_SIZE);

        this.vx = vx;
        this.vy = vy;
        this.vmax = vmax;

        this.ax = ax;
        this.ay = ay;
        this.amax = amax;

        this.friction = friction;

        this.c_h = c_h;
        this.c_s = c_s;
        this.c_b = c_b;

        this.ghost = ghost;
        this.fixed = fixed;

        tiles[this.xt][this.yt].entityList.add(this);
        chunks[this.xc][this.yc].entityList.add(this);
    }

    update() {
        this.updatePhysics();
    }

    updatePhysics() {
        if (!this.fixed) {
            this.vx = constrain(this.vx + dt * (this.ax - sign(this.vx) * this.friction), -this.vmax, this.vmax);
            this.vy = constrain(this.vy + dt * (this.ay - sign(this.vy) * this.friction), -this.vmax, this.vmax);

            const vcutoff = 0.001;
            if (abs(this.vx) < vcutoff) {
                this.vx = 0;
            }
            if (abs(this.vy) < vcutoff) {
                this.vy = 0;
            }

            this.ax = 0;
            this.ay = 0;

            if (this.vx !== 0 || this.vy !== 0) {
                this.move(dt * this.vx, dt * this.vy);
            }
        }
    }

    display() {
        let xsheet0;
        let xsheet1;
        let ysheet0;
        let ysheet1;
        let flipped = false;

        if(this.orientation === O_L || this.orientation === O_DR || this.orientation === O_UL) {
            flipped = true;
        }

        if(this.orientation === O_D) {
            ysheet0 = 0;
        }
        else if(this.orientation === O_R || this.orientation === O_L) {
            ysheet0 = 25;
        }
        else if(this.orientation === O_U) {
            ysheet0 = 50;
        }
        else if(this.orientation === O_DR || this.orientation === O_DL) {
            ysheet0 = 75;
        }
        else {
            ysheet0 = 100;
        }

        ysheet1 = ysheet0 + 23;

        xsheet0 = floor(this.animationState) * 17;

        if(flipped) {
            xsheet1 = xsheet0;
            xsheet0 = xsheet1 + 15;
        } else {
            xsheet1 = xsheet0 + 15;
        }

        noStroke();
        tint(this.c_b);
        beginShape();
        texture(playerSheet);
        vertex(this.x - screenX, this.y - screenY, xsheet0, ysheet0);
        vertex(this.x + this.w - screenX, this.y - screenY, xsheet1, ysheet0);
        vertex(this.x + this.w - screenX, this.y + this.h - screenY, xsheet1, ysheet1);
        vertex(this.x - screenX, this.y + this.h - screenY, xsheet0, ysheet1);
        endShape();
    }

    tileListCheck() {
        if (this.xtLast !== this.xt || this.ytLast !== this.yt) {
            tiles[this.xtLast][this.ytLast].entityList.remove(this);
            tiles[this.xt][this.yt].entityList.add(this);
        }
    }

    chunkListCheck() {
        if (this.xcLast !== this.xc || this.ycLast !== this.yc) {
            chunks[this.xcLast][this.ycLast].entityList.remove(this);
            chunks[this.xc][this.yc].entityList.add(this);
        }
    }

    move(dx, dy) {
        let newPosition = [0, 0];
        if (this.ghost) {
            newPosition[0] = this.xbb + dx;
            newPosition[1] = this.ybb + dy;
        } else {
            newPosition = this.tileCollisionCheck(dx, dy);
        }

        this.xbbLast = this.xbb;
        this.ybbLast = this.ybb;
        this.xtLast = this.xt;
        this.ytLast = this.yt;
        this.xcLast = this.xc;
        this.ycLast = this.yc;

        this.xbb = newPosition[0];
        this.ybb = newPosition[1];

        this.x = this.xbb - this.boundingBoxOffset;
        this.y = this.ybb = this.boundingBoxOffset;

        this.animate();

        this.xt = parseInt(this.x / TILE_SIZE);
        this.yt = parseInt(this.y / TILE_SIZE);
        this.xc = parseInt(this.x / chunkPix);
        this.yc = parseInt(this.y / chunkPix);

        this.tileListCheck();
        this.chunkListCheck();

        this.xcenter = this.x + this.w / 2;
        this.ycenter = this.y + this.h / 2;

        this.xtcenter = parseInt(this.xcenter / TILE_SIZE);
        this.ytcenter = parseInt(this.ycenter / TILE_SIZE);
    }

    tileCollisionCheck(dx, dy) {
        // Behavior will probably get weird at speeds exceeding wbb pixels/frame.
    
        // Return the new Entity (x,y) in this array.
        let newPosition = [0, 0];
    
        // Calculate the coordinates of the Entity's 4 corners in the tentative new position.
        let xw0 = this.xbb + dx;
        let xw1 = xw0 + this.wbb;
        let yw0 = this.ybb + dy;
        let yw1 = yw0 + this.hbb;
    
        // An Entity can intersect 1, 2, or 4 Tiles, depending on whether the x coordinates of the Entity's corners
        // are in the same Tile and whether the y coordinates are in the same Tile. Track this to help collision resolution.
        let twoTilesX = false;
        let twoTilesY = false;
    
        // The Tile x coordinates of the Tiles containing the Entity's corners.
        let xt0 = parseInt(xw0) / TILE_SIZE;
        let xt1 = parseInt(xw1) / TILE_SIZE;
    
        // If xt0 != xt1, two different x Tile coordinates needed.
        if(xt0 !== xt1) {
            twoTilesX = true;
        }
        
        // The Tile y coordinates of the Tiles containing the Entity's corners.
        let yt0 = parseInt(yw0) / TILE_SIZE;
        let yt1 = parseInt(yw1) / TILE_SIZE;
        
        // If yt0 != yt1, two different y Tile coordinates needed.
        if(yt0 !== yt1) {
            twoTilesY = true;
        }
        
        newPosition[0] = xw0;
        newPosition[1] = yw0;
        
        // Single Tile collision check
        if(!twoTilesX && !twoTilesY) {
            if(tiles[xt0][yt0].blocked) {
                // new Tile is blocked, just stay in the previous position.
                newPosition[0] = this.xbb;
                newPosition[1] = this.ybb;
            }
        }
        
        // Two Tile collision check, vertical separation.
        else if(twoTilesX && !twoTilesY) {
            if(tiles[xt0][yt0].blocked) {
                // Blocked left. Shift right.
                newPosition[0] = xt1 * TILE_SIZE + 0.0001;
            }
            else if(tiles[xt1][yt0].blocked) {
                // Blocked right, shift left.
                newPosition[0] = xw0 - (xw1 - xt1 * TILE_SIZE + 0.0001);
            }
        }
        
        // Two Tile collision check, horizontal separation.
        else if(!twoTilesX && twoTilesY) {
            if(tiles[xt0][yt0].blocked) {
                // Blocked top. Shift down.
                newPosition[1] = yt1 * TILE_SIZE + 0.0001;
            }
            else if(tiles[xt0][yt1].blocked) {
                // Blocked bottom. Shift up.
                newPosition[1] = yw0 - (yw1 - yt1 * TILE_SIZE + 0.0001);
            }
        }
        
        // Four Tile collision check.
        else {
            // Check for collisions with blocked Tiles.
            let blocked00 = tiles[xt0][yt0].blocked;
            let blocked01 = tiles[xt0][yt1].blocked;
            let blocked10 = tiles[xt1][yt0].blocked;
            let blocked11 = tiles[xt1][yt1].blocked;
        
            // Check 1-block intersections.
        
        
            // Upper-left ********
            if(blocked00 && !blocked01 && !blocked10 && !blocked11) {
                let collisionWidth = xt1 * TILE_SIZE - xw0;
                let collisionHeight = yt1 * TILE_SIZE - yw0;
                let widthGreaterThanHeight = collisionWidth >= collisionHeight;
        
                if(!widthGreaterThanHeight && dx < 0) {
                    newPosition[0] = xt1 * TILE_SIZE + 0.0001;
                }
                else if(widthGreaterThanHeight && dy < 0) {
                    newPosition[1] = yt1 * TILE_SIZE + 0.0001;
                }
            }
        
            // Lower-left ********
            else if(!blocked00 && blocked01 && !blocked10 && !blocked11) {
                let collisionWidth = xt1 * TILE_SIZE - xw0;
                let collisionHeight = yw1 - yt1 * TILE_SIZE;
                let widthGreaterThanHeight = collisionWidth >= collisionHeight;
        
                if(!widthGreaterThanHeight && dx < 0) {
                    newPosition[0] = xt1 * TILE_SIZE + 0.0001;
                }
                else if(widthGreaterThanHeight && dy > 0) {
                    newPosition[1] = yw0 - (yw1 - yt1 * TILE_SIZE + 0.0001);
                }
            }
        
            // Upper-right ********
            else if(!blocked00 && !blocked01 && blocked10 && !blocked11) {
                let collisionWidth = xw1 - xt1 * TILE_SIZE;
                let collisionHeight = yt1 * TILE_SIZE - yw0;
                let widthGreaterThanHeight = collisionWidth >= collisionHeight;
        
                if(!widthGreaterThanHeight && dx > 0) {
                    newPosition[0] = xw0 - (xw1 - xt1 * TILE_SIZE + 0.0001);
                }
                else if(widthGreaterThanHeight && dy < 0) {
                    newPosition[1] = yt1 * TILE_SIZE + 0.0001;
                }
            }
        
            // Lower-right ********
            else if(!blocked00 && !blocked01 && !blocked10 && blocked11) {
                let collisionWidth = xw1 - xt1 * TILE_SIZE;
                let collisionHeight = yw1 - yt1 * TILE_SIZE;
                let widthGreaterThanHeight = collisionWidth >= collisionHeight;
        
                if(!widthGreaterThanHeight && dx > 0) {
                    newPosition[0] = xw0 - (xw1 - xt1 * TILE_SIZE + 0.0001);
                }
                else if(widthGreaterThanHeight && dy > 0) {
                    newPosition[1] = yw0 - (yw1 - yt1 * TILE_SIZE + 0.0001);
                }
            }
        
            // Two or more blocked Tiles ********
            else {
                // Vertical blockage on the left
                if(blocked00 && blocked01) {
                    newPosition[0] = xt1 * TILE_SIZE + 0.0001;
                }
        
                // vertical blockage on the right
                else if(blocked10 && blocked11) {
                    newPosition[0] = xw0 - (xw1 - xt1 * TILE_SIZE + 0.0001);
                }
        
                // horizontal blockage on top
                if(blocked00 && blocked10) {
                    newPosition[1] = yt1 * TILE_SIZE + 0.0001;
                }
        
                // horizontal blockage on bottom
                if(blocked01 && blocked11) {
                    newPosition[1] = yw0 - (yw1 - yt1 * TILE_SIZE + 0.0001);
                }
            }
        }
        
        // Constrain each Entity to lie between the second and second-to-last Tiles.
        newPosition[0] = constrain(newPosition[0], TILE_SIZE, (tilesX - 2) * TILE_SIZE);
        newPosition[1] = constrain(newPosition[1], TILE_SIZE, (tilesY - 2) * TILE_SIZE);
        return newPosition;
    }

    animate() {
        let orientationNew;
        let dx = this.xbb - this.xbbLast;
        let dy = this.ybb - this.ybbLast;

        if(dx === 0 && dy === 0) {
            // No movement. Same orientation, reset animationState.

            orientationNew = this.orientation;

            // reset to this instead of 0 so that there is a change in animation on the first frame of a movement.
            this.animationState = (this.framesPerState - 1) / this.framesPerState;
        }
        else {
            if(dx > 0 && dy === 0) {
                // Motion right.
                orientationNew = O_R;
            } else if(dx < 0 && dy === 0) {
                // Motion left.
                orientationNew = O_L;
            } else if(dx === 0 && dy > 0) {
                // Motion down.
                orientationNew = O_D;
            } else if(dx === 0 && dy < 0) {
                // Motion up.
                orientationNew = O_U;
            } else if(dx > 0 && dy > 0) {
                // Motion down and right.
                orientationNew = O_DR;
            } else if(dx < 0 && dy > 0) {
                // Motion down and left.
                orientationNew = O_DL;
            } else if(dx > 0 && dy < 0) {
                // Motion up and right.
                orientationNew = O_UR;
            } else {
                // Motion up and left.
                orientationNew = O_UL;
            }

            // Update animation state.
            this.animationStateUpdate(orientationNew);
        }
    }

    animationStateUpdate(orientation) {
        if (orientation !== this.orientation) {
            this.animationState = 1;
            this.orientation = orientation;
        } else {
            let numStates;
            if(this.orientation === O_U || this.orientation === O_R || this.orientation === O_D || this.orientation === O_L)
            {
                numStates = 8;
            }
            else if(this.orientation === O_DL || this.orientation === O_DR)
            {
                numStates = 4;
            }
            else
            {
                numStates = 5;
            }

            // Advance animation state.
            this.animationState = 1 + (((this.animationState-1) + 1./this.framesPerState) % numStates);
        }
    }

    addS(dx, dy) {
        this.x = constrain(this.x + dx, 1, pixWidth - TILE_SIZE - this.w);
        this.y = constrain(this.y + dy, 1, pixHeight - TILE_SIZE - this.h);
    }

    addV(dvx, dvy) {
        this.vx = constrain(this.vx + dvx, -this.vmax, this.vmax);
        this.vy = constrain(this.vy + dvy, -this.vmax, this.vmax);
    }

    addP(dpx, dpy) {
        let mass = this.mass > 0 ? this.mass : 1;
        this.addV(dpx / mass, dpy / mass);
    }

    addA(dax, day) {
        this.ax = constrain(this.ax + dax, -this.amax, this.amax);
        this.ay = constrain(this.ay + day, -this.amax, this.amax);
    }

    addF(dfx, dfy) {
        let mass = this.mass > 0 ? this.mass : 1;
        this.addA(dfx / mass, dfy / mass);
    }

}

