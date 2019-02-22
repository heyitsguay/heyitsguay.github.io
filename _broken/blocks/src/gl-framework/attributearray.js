/**
 * Wrapper around a Float32Array holding data that gets passed to attribute variables in vertex shaders.
 * @typedef {uint} GLenum - WebGL enum type.
 * @param {string} $glVar - name of the GLSL attribute variable associated to this AttributeArray.
 * @param {int} numItems - maximum number of data items held in this AttributeArray.
 * @param {int} itemSize - size of each of the items. AttributeArray length is numItems*itemSize.
 * @param {boolean=} [dynamic=false] - hint declaring whether the AttributeArray's data will change frequently during its use.
 * @param {GLenum=} [type=gl.ARRAY_BUFFER] - gl.ARRAY_BUFFER or gl.ELEMENT_ARRAY_BUFFER.
 * @constructor
 */
function AttributeArray($glVar, numItems, itemSize, dynamic, type) {
    // Make sure the WebGL context has been created.
    if(gl == null) {
        throw 'Attempted to create AttributeArray before WebGL initialization.';
    }

    this.$glVar = $glVar;
    this.itemSize = itemSize;
    this.dynamic = !(dynamic == null)? dynamic : false;
    this.type = !(type == null)? type : gl.ARRAY_BUFFER;

    // One use of the this.dynamic property is setting the webGL static/dynamic draw hint.
    this.drawHint = this.dynamic? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;

    // CPU-side attribute data.
    this.data = new Float32Array(numItems * itemSize);

    // Frequently, the full AttributeArray's memory allocation is unnecessary (e.g. in tracking properties of a
    // collection of objects, numItems will be the maximum number of objects to track, but each frame requires only data
    // for the current number of existing objects. The portion of this.data required each frame is termed the "active"
    // portion.
    // Track the length of the active portion of this.data.
    this.activeLength = 0;
    // Track the number of items in this active portion (this.activeLength / this.itemSize).
    this.activeItems = 0;

    // GPU-side attribute data.
    this.buffer = gl.createBuffer();

    // Initialize the buffer to maximum size.
    gl.bindBuffer(this.type, this.buffer);
    gl.bufferData(this.type, this.data, this.drawHint);
}

/**
 * Reset this.activeLength to 0 (e.g. for attribute data that changes each frame and must be re-added).
 */
AttributeArray.prototype.reset = function() {
    this.activeLength = 0;
    this.activeItems = 0;
};

/**
 * Add multiple copies of a piece of updated data to this.data, starting where the active portion leaves off (e.g.
 * adding copies of one 4-vector of RGBA data corresponding to each vertex of an object.). The parameter itemSize is
 * passed, rather relying on this.itemSize, to allow for some slightly different use cases that differ from the paradigm
 * of passing multiple copies of the same data, such as passing in a large amount of (unique) vertex position data all
 * at once rather than requiring multiple calls to this function.
 * @param {float[]} updateData - Data to pass to this.data.
 * @param {int} numCopies - number of copies of updateData to pass into this.data.
 * @param {int} itemSize - number of float components in updateData.
 */
AttributeArray.prototype.update = function(updateData, numCopies, itemSize) {
    var idx = this.activeLength;
    for(var i=0; i<numCopies; i++) {
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
    this.activeLength += numCopies * itemSize;
    this.activeItems = Math.round(this.activeLength / this.itemSize);
};

/**
 * Copy (a portion of) this.data to this.buffer.
 * @param {boolean=} [bind=false] - if true, call gl.bindBuffer() before gl.bufferSubData().
 * @param {int=} [length=this.activeLength] - number of elements of this.data to copy to this.buffer (always starting from index 0).
 */
AttributeArray.prototype.toBuffer = function(bind, length) {
    bind = !(bind == null)? bind: true;
    length = !(length == null)? length : this.activeLength;

    if(bind) {
        gl.bindBuffer(this.type, this.buffer);
    }
    gl.bufferSubData(this.type, 0, this.data.subarray(0, length));
};