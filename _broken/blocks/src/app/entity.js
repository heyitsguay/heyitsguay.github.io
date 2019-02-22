/**
 * Base class for all entities used in this program.
 * @constructor
 */
function Entity() {}

/**
 * Setup for the Entity.
 * @param {float} xc - x coordinate of the Entity's initial center point, in world coordinates.
 * @param {float} yc - y coordinate of the Entity's initial center point, in world coordinates.
 * @param {float} hwidth - Half-width of the Entity's (rectangular) bounding box.
 * @param {float} hheight - Half-height of the Entity's (rectangular) bounding box.
 */
Entity.prototype.setup = function(xc, yc, hwidth, hheight) {
    this.xc = xc;
    this.yc = yc;
    this.hwidth = hwidth;
    this.hheight = hheight;

    // Constant for now, but might be useful to keep flexible for later.
    this.parent = entities;
    // Add this Entity to the parent EntityList.
    this.parent.addEntity(this);

    this.width = 2 * this.hwidth;
    this.height = 2 * this.hheight;

    // Initialize so that the computeCoords function computes valid initial values for the previous frame variables.
    this.xw0 = this.xw1 = this.yw0 = this.yw1 = this.xt0 = this.xt1 = this.yt0 = this.yt1 = 0;

    // Texture box half-width and half-height. A little bigger to make collisions look better.
    this.hwidthTex = this.hwidth + 1;
    this.hheightTex = this.hheight + 1;

    this.widthTex = 2 * this.hwidthTex;
    this.heightTex = 2 * this.hheightTex;

    // Array containing vertex attribute data.
    this.verts = [];

    // Temporary color information. HSBA coordinates.
    this.color = [0.03, 1, 1, 1];

    // Compute world and Tile coordinates of the corners of the Entity's bounding box.
    // Sets:
    // this.xw0; this.xw1;
    // this.yw0; this.yw1;
    // this.xt0; this.xt1;
    // this.yt0; this.yt1;
    // As well as this.*p versions of all those variables, the value at a previous frame.
    // World coordinates, top-left corner.
    this.xw0 = this.xc - this.hwidth;
    this.yw0 = this.yc + this.hheight;

    // World coordinates, bottom-right corner.
    this.xw1 = this.xc + this.hwidth - 1;
    this.yw1 = this.yc + this.hheight - 1;

    // Tile coordinates.
    this.xt0 = Math.floor(this.xw0 * iTileSize);
    this.yt0 = Math.floor(this.yw0 * iTileSize);
    this.xt1 = Math.floor(this.xw1 * iTileSize);
    this.yt1 = Math.floor(this.yw1 * iTileSize);

    // Orientation. Can be one of the DirEnum values.
    this.orientation = DirEnum.RIGHT;

    // Velocity information.
    this.vx = 0;
    this.vy = 0;
    this.vmax = vmax; // maximum Entity velocity magnitude in x or y direction.

    // Acceleration information.
    this.ax = 0;
    this.ay = 0;
    this.amax = amax;

    // Friction values range from 0 to 10, where 0 means the Entity experiences no friction.
    // Values in this range are transformed into constants in [0,1] that act multiplicatively on the velocity.
    // i.e. with no external influence, this.velocity decays like (friction)^t.
    this.cFriction = 1 - Math.pow(10, -2);

    // Tracks which side of the bounding box experienced the most recent collision.
    this.lastCollisionSide = DirEnum.DOWN;

    // True if this Entity has collided with something in this frame.
    this.justCollided = false;

    // If true, no collision detection.
    this.solid = false;

    // If true, never update position
    this.fixed = false;

    // If true, gets added to a global Entity death list to be removed.
    this.dead = false;

    // Track which frame of the Entity's animation is being displayed.
    this.animationState = 0;

    // How many frames to stay in each animation state.
    this.framesPerState = 8;

    // Entity alignment: -1 is hostile, 0 is neutral, 1 is friendly.
    this.alignment = 0;

    // Entity heat and magic levels.
    this.heat = 0;

    // Entity speed.
    this.speed = 1;
}

/**
 * Returns a number used as a multiplicative coefficient to decrease Entity velocity (simulating friction).
 * @param {number} x - Number in [0,10] controlling the friction strength. Larger x = more friction.
 * @returns {number}
 */
Entity.prototype.frictionTransform = function(x) {
    // Make sure the input value is in the range [0,10] and throw an error otherwise.
    if(x < 0 || x > 10) {
        throw "Input value must be between 0 and 10, inclusive.";
    }
    // x=0 returns a value of 0.9999999999 (almost no friction). x=10 returns a value of 0 (Entity will not move).
    return 1 - Math.pow(10, x - 10);
};

/**
 * Copy current frame position state variables into the *p variables (previous frame position state variables).
 */
Entity.prototype.coordCopy = function() {
    this.xcp  = this.xc;  this.ycp  = this.yc;
    this.xw0p = this.xw0; this.yw0p = this.yw0;
    this.xw1p = this.xw1; this.yw1p = this.yw1;
    this.xt0p = this.xt0; this.yt0p = this.yt0;
    this.xt1p = this.xt1; this.yt1p = this.yt1;
};

/**
 * Given this.xc and this.yc, compute all the other position state variables.
 */
Entity.prototype.computeCoords = function() {
    // World coordinates, top-left corner.
    this.xw0 = this.xc - this.hwidth;
    this.yw0 = this.yc + this.hheight;

    // World coordinates, bottom-right corner.
    this.xw1 = this.xc + this.hwidth - 1;
    this.yw1 = this.yc + this.hheight - 1;

    // Tile coordinates.
    this.xt0 = Math.floor(this.xw0 * iTileSize);
    this.yt0 = Math.floor(this.yw0 * iTileSize);
    this.xt1 = Math.floor(this.xw1 * iTileSize);
    this.yt1 = Math.floor(this.yw1 * iTileSize);
};

/**
 * The main Entity update function called each frame.
 */
Entity.prototype.update = function() {
    // Push the previous frame's x*, y* variables into the x*p, y*p variables.
    this.coordCopy();

    // Update physics for all Entities that aren't fixed.
    if(!this.fixed) {
        this.updatePhysics();
    }

    // Prep WebGL attribute data.
    this.pushAttributes();
};

/**
 * Update Entity position, velocity, and acceleration variables.
 */
Entity.prototype.updatePhysics = function() {
    // Threshold small velocities to 0.
    var vcutoff = 0.001;

    // Update velocity.
    this.vx = this.cFriction * constrain(this.vx + dt * this.ax, -this.vmax, this.vmax);
    this.vy = this.cFriction * constrain(this.vy + dt * this.ay, -this.vmax, this.vmax);

    // Threshold velocity.
    this.vx = Math.abs(this.vx) < vcutoff? 0 : this.vx;
    this.vy = Math.abs(this.vy) < vcutoff? 0 : this.vy;

    // Reset force.
    this.ax = 0;
    this.ay = 0;

    // Move if there's been motion since the last frame or velocity is nonzero. Check for collisions if solid.
    var anyVelocity = this.vx != 0 || this.vy != 0;
    var anyMotion = this.xw0 != this.xw0p ||  this.yw0 != this.yw0p;

    if(anyVelocity) {
        //noinspection JSCheckFunctionSignatures,JSCheckFunctionSignatures
        this.move(dt * this.vx, dt * this.vy);
    }
    if(this.solid && (anyVelocity || anyMotion)) {
        this.handleTileCollisions();
    }
};

/**
 * Move the Entity by dx units to the right and dy units upward.
 * @param {float} dx - Amount of horizontal translation. Positive = rightward.
 * @param {float} dy - Amount of vertical translation. Positive = upward.
 */
Entity.prototype.move = function(dx, dy) {
    // Move the Entity's center.
    this.xc = constrain(this.xc + dx, this.hwidth, xWorld - this.hwidth);
    this.yc = constrain(this.yc + dy, this.hheight, yWorld - this.hheight);

    // Compute the other Entity coordinates using the new (xc, yc).
    this.computeCoords();
};

/**
 * Entity - Tile collisions are easier to handle than Entity - Entity collisions, and Tiles aren't suited for use with a
 * quadtree structure. Handle these collisions separately here.
 */
Entity.prototype.handleTileCollisions = function() {
    // Heavily influenced by the MSDN XNA 2D Platformer sample.

    // Check boundary Tiles for collisions.
    for(var y=this.yt0; y<=this.yt1; y++) {
        for(var x=this.xt0; x<=this.xt1; x++) {
            // Handle collision if the Tile is solid.
            var tile = tiles.getTile(x,y);
            if(tile.solid){
                this.resolveTileCollision(tile);
            }
        }
    }
};

/**
 * Resolves a collision between this Entity and the (implicitly solid) Tile tile.
 * @param tile - A Tile with which to resolve collision.
 */
Entity.prototype.resolveTileCollision = function(tile) {
    // Calculate center distances.
    var cdistX = this.xc - tile.xc;
    var cdistY = this.yc - tile.yc;

    // Calculate minimum non-intersecting distances.
    var mindistX = this.hwidth + 0.5 * tileSize;
    var mindistY = this.hheight + 0.5 * tileSize;

    // Check for an intersection, then resolve it.
    if(Math.abs(cdistX) < mindistX && Math.abs(cdistY) < mindistY) {
        // Get intersection depth.
        var depthX = cdistX > 0 ? mindistX - cdistX : -mindistX - cdistX;
        var depthY = cdistY > 0 ? mindistY - cdistY : -mindistY - cdistY;
        var absDepthX = Math.abs(depthX);
        var absDepthY = Math.abs(depthY);

        // Resolve along the shallow axis.
        if (absDepthY < absDepthX) {
            // Resolve along the Y axis.
            //noinspection JSCheckFunctionSignatures
            this.move(0, depthY);
        } else {
            // Resolve along the X axis.
            //noinspection JSCheckFunctionSignatures
            this.move(depthX, 0);
        }
    }
};

/**
 * Add this Entity's attribute data to the parent EntityList's AttributeArrays.
 */
Entity.prototype.pushAttributes = function() {
    // Create clip space vertex data, add to verts.
    var vert0, vert1, vert2, vert5;

    vert0 = clipSpace2(this.xw0, this.yw0);
    this.verts[0] = vert0[0]; this.verts[1] = vert0[1];

    vert1 = clipSpace2(this.xw0, this.yw1);
    this.verts[2] = vert1[0]; this.verts[3] = vert1[1];

    vert2 = clipSpace2(this.xw1, this.yw0);
    this.verts[4] = vert2[0]; this.verts[5] = vert2[1];

    // vert3 same as vert1.
    this.verts[6] = vert1[0]; this.verts[7] = vert1[1];

    // vert4 same as vert2.
    this.verts[8] = vert2[0]; this.verts[9] = vert2[1];

    vert5 = clipSpace2(this.xw1, this.yw1);
    this.verts[10] = vert5[0]; this.verts[11] = vert5[1];

    // Update parent a_xy attribute.
    this.parent.attributes.a_position.update(this.verts, 1, 12);

    // Update parent a_color attribute.
    this.parent.attributes.a_color.update(this.color, 6, 4);

    // Update parent a_heat attribute.
    this.parent.attributes.a_heat.update([this.heat, 0, 0, 0], 6, 4);
};