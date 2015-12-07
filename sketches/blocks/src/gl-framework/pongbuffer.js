/**
 * Two FloatBuffers set up to write back and forth to each other in ping-pong fashion.
 * @typedef {Object} FloatBuffer
 * @param {uint} width - width of the PongBuffer textures.
 * @param {uint} height - height of the PongBuffer textures.
 * @param {string} id - name identifying this PongBuffer.
 * @constructor
 */
function PongBuffer(width, height, id) {
    this.width = width;
    this.height = height;
    this.id = id;

    // The two FloatBuffers.
    this.floatbuffers = [new FloatBuffer(width, height, id+'0'), new FloatBuffer(width, height, id+'1')];

    // Keep track of which of the FloatBuffers to write to next.
    this.idxwrite = 0; // Alternates between 0 and 1
}

/**
 * Returns the FloatBuffer currently being written to.
 * @returns {FloatBuffer}
 */
PongBuffer.prototype.writeBuffer = function() {
    return this.floatbuffers[this.idxwrite];
};

/**
 * Returns the FloatBuffer currently being read from.
 * @returns {FloatBuffer}
 */
PongBuffer.prototype.readBuffer = function() {
    return this.floatbuffers[1-this.idxwrite];
};

/**
 * Toggles this.idxwrite between 0 and 1, which in turn toggles the read and write FloatBuffers.
 */
PongBuffer.prototype.toggle = function() {
    this.idxwrite = 1 - this.idxwrite;
};