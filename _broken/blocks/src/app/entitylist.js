/**
 * Contains a list of Entities and their WebGL data. Used to handle the updating and rendering of a group of Entities.
 * @param {uint} maxEntities - Maximum number of Entities this EntityList can hold.
 * @constructor
 */
function EntityList(maxEntities) {
    this.maxEntities = maxEntities;
    // List of all live Entities.
    this.entities = [];
    // Number of current live Entities. Should be equal to the length of this.entities.
    this.numLiveEntities = 0;

    // List of all dead Entities.
    this.deadEntities = [];

    // Maximum number of vertices this EntityList can store information for. Each Entity's texture box is a rectangle
    // made up of two triangles, so six vertices per Entity.
    // TODO: Change this.a_position.type to gl.ELEMENT_ARRAY_BUFFER and pass in only 4 pieces of vertex data per Entity.
    this.nVertices = 6 * this.maxEntities;

    // AttributeArrays containing WebGL attribute data.
    this.attributes = {
        a_position: new AttributeArray('a_position', this.nVertices, 2, true), // (x,y) position of each Entity's vertices.
        a_color: new AttributeArray('a_color', this.nVertices, 4, true), // Entity color at each vertex (HSBA format, values in [0,1]).
        a_heat: new AttributeArray('a_heat', this.nVertices, 4, true) // Entity heat data at each vertex.
    };
    // List of all the AttributeArray names in this.attributes.
    this.akeys = Object.keys(this.attributes);
}

/**
 * Adds an Entity to the EntityList.
 * @param {Entity} entity - the Entity to add to the list.
 */
EntityList.prototype.addEntity = function(entity) {
    this.entities.push(entity);
    this.numLiveEntities += 1;
};

/**
 * The main update function for the EntityList. Resets each AttributeArray and then calls each child Entity's update
 * function.
 */
EntityList.prototype.update = function() {
    // Reset the AttributeArrays' activeLength counts.
    for(var i=0; i<this.akeys.length; i++) {
        var key = this.akeys[i];
        this.attributes[key].reset();
    }

    // Update Entities.
    for(i=0; i<this.numLiveEntities; i++) {
        this.entities[i].update();
    }

};

/**
 * Draws this.entities' heat data to the entity FloatBuffer.
 */
EntityList.prototype.drawHeat = function() {
    // Bind the entity FloatBuffer's framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers.entity.framebuffer);
    // Set the viewport for the entity FloatBuffer's framebuffer.
    gl.viewport(0, 0, xWorld, yWorld);
    // Prepare the entitydraw ShaderProgram.
    shaderPrograms.entityheat.prep(true);
    // Draw to the entity FloatBuffer's framebuffer.
    gl.disableVertexAttribArray(2);
    gl.drawArrays(shaderPrograms.entityheat.drawType, 0, 6*this.numLiveEntities);
};

/**
 * Draws this.entities to the screen.
 */
EntityList.prototype.render = function() {
    // Bind the default framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Set the screen viewport.
    gl.viewport(0, 0, xWorld, yWorld);
    // Prepare the renderentities ShaderProgram.
    shaderPrograms.drawentities.prep(true);
    // Draw to the screen.
    gl.drawArrays(shaderPrograms.drawentities.drawType, 0, 6*this.numLiveEntities);
};