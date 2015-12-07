/**
 * Wraps around a WebGL floating-point framebuffer for ease of use.
 * @param {uint} width - Framebuffer width, in pixels.
 * @param {uint} height - Framebuffer height, in pixels.
 * @param {string} id - This FloatBuffer's name.
 * @constructor
 */
function FloatBuffer(width, height, id) {
    this.width = width;
    this.height = height;
    this.id = id;

    // The texture this FloatBuffer renders to.
    this.texture = gl.createTexture();
    // Bind this.tex for initialization purposes.
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Use these four texture parameter values to allow NPOT float textures.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Initialize this.texture to the proper size and type, fill with zeros.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);

    // This FloatBuffer's framebuffer.
    this.framebuffer = gl.createFramebuffer();
    // Bind this.framebuffer for initialization purposes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    // Attach this.texture to this.framebuffer.
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    // Make sure this.framebuffer is complete.
    this.framebufferCheck();
}

/**
 * Verifies that this.framebuffer has status gl.FRAMEBUFFER_COMPLETE. Throws an exception if not.
 */
FloatBuffer.prototype.framebufferCheck = function() {
    var fb_status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if(fb_status != gl.FRAMEBUFFER_COMPLETE)
    {
        throw "Framebuffer " + this.id + " isn't complete!";
    }
};