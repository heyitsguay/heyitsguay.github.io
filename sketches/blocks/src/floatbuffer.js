// FloatBuffer object.
function FloatBuffer(width, height, id) {
    // FloatBuffer ID.
    this.id = id;

    // FloatBuffer texture width in pixels.
    this.width = width;

    // FloatBuffer texture height in pixels.
    this.height = height;

    //this.ntexs = !(ntexs == null)? ntexs : 1;

    // floatBuffer's framebuffer.
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);

    // The texture this floatBuffer renders to.
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    //}
    this.framebufferCheck();
}

FloatBuffer.prototype.framebufferCheck = function() {
    var fb_status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if(fb_status != gl.FRAMEBUFFER_COMPLETE)
    {
        alert("Framebuffer " + this.id + " isn't complete!");
    }
};