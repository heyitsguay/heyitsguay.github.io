// Two FloatBuffers set up to write back and forth to each other in ping-pong fashion.
function PongBuffer(width, height, id) {
    this.id = id;
    this.width = width;
    this.height = height;

    // The two FloatBuffers.
    this.flbs = [new FloatBuffer(width, height, id+'0'), new FloatBuffer(width, height, id+'1')];

    // Keep track of which of the FloatBuffers to write to next.
    this.idxwrite = 0; // Alternates between 0 and 1
}

PongBuffer.Prototype = {
    writeBuffer: function() {
        return this.flbs[this.idxwrite];
    },

    readBuffer: function() {
        return this.flbs[1-this.idxwrite];
    },

    toggle: function() {
        this.idxwrite = 1 - this.idxwrite;
    }
};