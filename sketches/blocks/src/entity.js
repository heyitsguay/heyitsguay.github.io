// The EntityList holding all the world's Entities.
var entities;

// Global maximum entity velocity and acceleration. Can be overriden for individual entities.
var vmax = 10;
var amax = 5;

// Maximum number of Entities in the world.
var maxEntities = 100;

// The player.
var player;
var phwidth = 10;
var phheight = 16;

// Mnemonic variables for the 4 cardinal directions.
var D_U = 0; // up
var D_R = 1; // right
var D_D = 2; // down
var D_L = 3; // left

// -------------------------------------------------------------------------------------------------------------------//
function Entity(xc, yc, hwidth, hheight) {
    // Constant for now, but might be useful to keep flexible for later.
    this.parent = entities;

    // Entity center point (in world coordinates).
    this.xc = xc;
    this.yc = yc;

    // Entity half-width and half-height. Entity spans [xc-hwidth, xc+hwidth-1] x [yc-hheight, yc+hheight-1].
    this.hwidth = hwidth;
    this.hheight = hheight;

    this.width = 2 * this.hwidth;
    this.height = 2 * this.hheight;

    // Initialize so that the computeCoords function computes valid initial values for the previous frame variables.
    this.xw0 = this.xy1 = this.yw0 = this.yw1 = this.xt0 = this.xt1 = this.yt0 = this.yt1 = 0;

    // Texture box half-width and half-height. A little bigger to make collisions look better.
    this.hwidthTex = width + 2;
    this.hheightTex = height + 1;

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
    this.computeCoords();

    // Orientation. Can be one of the D_* direction variables (i.e. 0-3).
    this.orientation = D_R;

    // Velocity information.
    this.vx = 0;
    this.vy = 0;
    this.vmax = vmax; // maximum Entity velocity magnitude in x or y direction.

    // Acceleration information.
    this.ax = 0;
    this.ay = 0;
    this.amax = amax;

    // True when on there is a solid Tile immediately below the Entity.
    this.isOnGround = false;

    // Force of gravity multiplier. 1 by default.
    this.cg = 1;

    // Friction values range from 0 to 10, where 0 means the Entity experiences no friction.
    // Values in this range are transformed into constants in [0,1] that act multiplicatively on the velocity.
    // i.e. with no external influence, this.velocity decays like (friction)^t.

    // Ground friction.
    this.cfrictionGround = this.frictionTransform(8);
    this.cfrictionAir = this.frictionTransform(1);


    // Collision detection stuff.
    this.lastCollisionSide = D_D;

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
    this.magic = 0;

    // Entity speed.
    this.speed = 1;
}

// -------------------------------------------------------------------------------------------------------------------//
Entity.Prototype = {
    // ---------------------------------------------------------------------------------------------------------------//
    frictionTransform: function(x) {
        //x = 10 - x;
        return 1 - Math.pow(10, x - 10);
    },
    // ---------------------------------------------------------------------------------------------------------------//
    coordCopy: function() {
        // Update *p variables.
        this.xcp  = this.xc;  this.ycp  = this.yc;
        this.xw0p = this.xw0; this.yw0p = this.yw0;
        this.xw1p = this.xw1; this.yw1p = this.yw1;
        this.xt0p = this.xt0; this.yt0p = this.yt0;
        this.xt1p = this.xt1; this.yt1p = this.yt1;

    },

    // ---------------------------------------------------------------------------------------------------------------//
    computeCoords: function() {
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
    },

    // ---------------------------------------------------------------------------------------------------------------//
    update: function() {
        // Push the previous frame's x*, y* variables into the x*p, y*p variables.
        this.coordCopy();

        // Update physics for all Entities that aren't fixed.
        if(!this.fixed) {
            this.updatePhysics();
        }

        // Prep WebGL attribute data.
        this.pushAttributes();
    },

    // ---------------------------------------------------------------------------------------------------------------//
    updatePhysics: function() {
        // Threshold small velocities to 0.
        var vcutoff = 0.001;

        // Use a difference friction constant if not on the ground.
        var cfriction = this.isOnGround? this.cfrictionGround : this.cfrictionAir;

        // Update velocity.
        this.vx = constrain(this.vx + dt * (this.ax - sign(this.vx) * cfriction), -this.vmax, this.vmax);
        this.vy = constrain(this.vy + dt * (this.ay - sign(this.vy) * cfriction), -this.vmax, this.vmax);

        // Threshold velocity.
        this.vx = Math.abs(this.vx) < vcutoff? 0 : this.vx;
        this.vy = Math.abs(this.vy) < vcutoff? 0 : this.vy;

        // Reset force.
        this.ax = 0;
        this.ay = (this.solid || !this.isOnGround)? this.cg * (-1) : 0;

        // Move if there's been motion since the last frame or velocity is nonzero. Check for collisions if solid.
        var anyVelocity = this.vx != 0 || this.vy != 0;
        var anyMotion = this.xw0 != this.xw0p ||  this.yw0 != this.yw0p;

        if(anyVelocity) {
            this.move(dt * this.vx, dt * this.vy);
        }
        if(this.solid && (anyVelocity || anyMotion)) {
            this.handleCollisions();
        }
    },

    // ---------------------------------------------------------------------------------------------------------------//
    move: function(dx, dy) {
        // Move the Entity's center.
        this.xc = constrain(this.xc + dx, this.hwidth, xWorld - this.hwidth);
        this.yc = constrain(this.yc + dy, this.hheight, yWorld - this.hheight);

        // Compute the other Entity coordinates using the new (xc, yc).
        this.computeCoords();
    },

    // ---------------------------------------------------------------------------------------------------------------//
    handleCollisions: function() {
        // Heavily influenced by the MSDN XNA 2D Platformer sample.

        // Reset isOnGround.
        this.isOnGround = false;

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
    },

    // ---------------------------------------------------------------------------------------------------------------//
    resolveTileCollision: function(tile) {
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
                // Check to see if we're on the ground.
                if (tile.yt == this.yt1) {
                    this.isOnGround = true;
                }

                // Resolve along the Y axis.
                this.move(0, depthY);
            } else {
                // Resolve along the X axis.
                this.move(depthX, 0);
            }
        }
    },

    // ---------------------------------------------------------------------------------------------------------------//
    pushAttributes: function() {
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
        this.parent.attributes.a_xy.update(this.verts, 1, 12);

        // Update parent a_color attribute.
        this.parent.attributes.a_color.update(this.color, 6, 4);

        // Update parent a_maps attribute.
        this.parent.attributes.a_maps.update([this.heat, this.magic, 0, 0], 6, 4);
    }
};

// -------------------------------------------------------------------------------------------------------------------//
function Player(xc, yc, hwidth, hheight) {
    // Subclass of Entity.
    Entity.call(this, xc, yc, hwidth, hheight);
    Player.Prototype = Object.create(Entity.Prototype);

    // Different color.
    this.color = [0.57, 1, 1, 1];
}

// -------------------------------------------------------------------------------------------------------------------//
Player.Prototype.jump = function() {
    this.vy += (9.9 * this.isOnGround + 0.1);
};

// -------------------------------------------------------------------------------------------------------------------//
Player.Prototype.update = function() {
    // Push the previous frame's x*, y* variables into the x*p, y*p variables.
    this.coordCopy();

    // Check for updates from the inputs.
    this.handleInputs();

    // Update physics.
    this.updatePhysics();

    // Prep WebGL attribute data.
    this.pushAttributes();
};

// -------------------------------------------------------------------------------------------------------------------//
Player.Prototype.handleInputs = function() {
    // Handles the key presses that are relevant to the player. Reads the keys and togglable arrays defined in input.js.

    if(keys[32]) { // Spacebar
        this.jump();
    }
    if(keys[65]) { // A
        // Move left.
        this.move(-this.speed, 0);
    }
    if(keys[68]) { // D
        // Move right
        this.move(this.speed, 0);
    }
    if(keys[83]) { // S
        // Add a little downward velocity, just for fun.
        this.vy -= (1 - this.isOnGround) * 0.5;
    }
    if(keys[87]) { // W
        // Jump. When held in the air, increases your hang time slightly.
        this.jump();
    }
};


// -------------------------------------------------------------------------------------------------------------------//
function EntityList() {
    // List of all live Entities.
    this.entities = [];
    this.numLiveEntities = 0;

    // List of all dead Entities.
    this.deadEntities = [];

    this.nVertices = 6 * maxEntities;

    // AttributeArrays containing GL attribute data.
    this.attributes = {
        a_xy: new AttributeArray('a_position', this.nVertices, 2, true),
        a_color: new AttributeArray('a_color', this.nVertices, 4, true),
        a_maps: new AttributeArray('a_maps', this.nVertices, 4, true)
    };
    this.akeys = this.attributes.keys;

}

EntityList.Prototype = {

    update: function() {
        // Reset AttributeArrays' activeCounter and activeLengths.
        for(var i=0; i<this.akeys.length; i++) {
            var key = this.akeys[i];
            this.attributes[key].reset();
        }

        // Update Entities.
        for(i=0; i<this.numLiveEntities; i++) {
            this.entities[i].update();
        }

        //// Update the entity FloatBuffer.
        //gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.entity.fb);
        //gl.viewport(0, 0, xWorld, yWorld);
        //// Prepare the entitydraw ShaderProgram.
        //shaderPrograms.entitymaps.prep(true);
        //// Draw to the entity FloatBuffer.
        //gl.drawArrays(shaderPrograms.entitymaps.drawType, 0, this.numLiveEntities);
    },

    // ---------------------------------------------------------------------------------------------------------------//
    drawMap: function() {
        // Update the entity FloatBuffer.
        gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.entity.fb);
        gl.viewport(0, 0, xWorld, yWorld);
        // Prepare the entitydraw ShaderProgram.
        shaderPrograms.entitymaps.prep(true);
        // Draw to the entity FloatBuffer.
        gl.drawArrays(shaderPrograms.entitymaps.drawType, 0, this.numLiveEntities);
    },

    // ---------------------------------------------------------------------------------------------------------------//
    render: function() {
        // Render the Entities to the screen.
        gl.bindFramebuffer(gl.FRAMEBUFFER, 0);
        gl.viewport(0, 0, xWorld, yWorld);

        shaderPrograms.renderentities.prep(true);

        gl.drawArrays(shaderPrograms.renderentities.drawType, 0, this.numLiveEntities);
    }
};