function AttributeArray($glvar, numItems, itemSize, dynamic, type) {
    // Make sure the WebGL context has been created.
    if(gl == null) {
        throw 'Attempted to create AttributeArray before WebGL initialization!';
    }

    // Name of the GLSL attribute variable associated to this AttributeArray.
    this.$glvar = $glvar;
    this.type = !(type == null)? type : gl.ARRAY_BUFFER;
    this.itemSize = itemSize;
    this.dynamic = !(dynamic == null)? dynamic : false;
    this.drawHint = this.dynamic? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;

    // CPU-side attribute data.
    this.data = new Float32Array(numItems * itemSize);

    // Keep track of how long the active portion of the data array is.
    this.activeCounter = 0;
    this.activeLength = 0;

    // GPU-side attribute data + its WebGL setup.
    this.buffer = gl.createBuffer();
    gl.bindBuffer(this.type, this.buffer);

    // Initialize to maximum size.
    gl.bufferData(this.type, this.data, this.drawHint);
}

// -------------------------------------------------------------------------------------------------------------------//
AttributeArray.Prototype = {
    reset: function() {
        this.activeCounter = 0;
        this.activeLength = 0;
    },

    update: function(updateData, numItems, itemSize) {
        var idx = this.activeLength;
        for(var i=0; i<numItems; i++) {
            if(itemSize == 1) {
                this.data[idx] = updateData;
                idx += 1;
            } else {
                for(var j=0; j<itemSize; j++) {
                    this.data[idx] = updateData[j];
                    idx += 1;
                }
            }
        }
        this.activeCounter += 1;
        this.activeLength += numItems * itemSize;
    },

    toBuffer: function(bind, length) {
        // If true, call gl.bindBuffer().
        bind = !(bind == null)? bind: false;

        // Specifies the length of the data array to copy to the GPU.
        length = !(length == null)? length : this.activeLength;

        if(bind) {
            gl.bindBuffer(this.type, this.buffer);
        }
        gl.bufferSubData(this.type, 0, this.data.subarray(0, length));
    }
};