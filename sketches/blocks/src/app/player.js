/**
 * The player is an Entity controlled by the user.
 * @constructor
 */
function Player() {
    // Inherit from the Entity class.
    Entity.call(this);
}

/**
 * Player setup. TODO: This, a better way.
 * @param {float} xc - Initial Player center x coordinate.
 * @param {float} yc - Initial Player center y coordinate.
 * @param {float} hwidth - Player half-width.
 * @param {float} hheight - Player half-height.
 */
Player.prototype.setupPlayer = function(xc, yc, hwidth, hheight) {

    // Subclass of Entity.
    this.setup(xc, yc, hwidth, hheight);

    // Different color.
    this.color = [0.57, 1, 1, 1];
};

Player.prototype = Object.create(Entity.prototype);

/**
 * Update function for the Player. Overwrites the default Entity update function.
 */
Player.prototype.update = function() {
    // Push the previous frame's x*, y* variables into the x*p, y*p variables.
    this.coordCopy();

    // Check for updates from the inputs.
    this.handleInputs();

    // Update physics.
    this.updatePhysics();

    // Prep WebGL attribute data.
    this.pushAttributes();
};

/**
 * Handle user input that affects the Player.
 */
Player.prototype.handleInputs = function() {
    // Handles the key presses that are relevant to the player. Reads the keys and togglable arrays defined in handle.js.

    if(keys[65]) { // A
        // Move left.
        this.move(-this.speed, 0);
    }
    if(keys[68]) { // D
        // Move right
        this.move(this.speed, 0);
    }
    if(keys[83]) { // S
        // Move down
        this.move(0, -this.speed);
    }
    if(keys[87]) { // W
        // Move up
        this.move(0, this.speed);
    }
};
