// FullBuffer object. Simplifies rendering to textures. ---------------------------------------------//
function FullBuffer(id)
{
    // fullBuffer ID.
    this.id = id;

    // Make sure we can render to float textures.
    var floatCheck = gl.getExtension('OES_texture_float');
    if(!floatCheck)
    {
        alert("Could not get OES_texture_float for " + this.id);
    }

    // fullBuffer's framebuffer.
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);

    // The texture this fullBuffer renders to.
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texX, texY, 0, gl.RGBA, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);

    this.framebufferCheck();

}

FullBuffer.prototype.framebufferCheck = function()
{
    var fb_status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if(fb_status != gl.FRAMEBUFFER_COMPLETE)
    {
        alert("Framebuffer " + this.id + " isn't complete!");
    }
};

// ShaderProgram object simplifies creating shader programs and managing their attributes
// and uniform variables.
function ShaderProgram(id)
{
    this.id = id;

    this.fs_id = spPairs[this.id][0];
    this.vs_id = spPairs[this.id][1];

    var fs = getShader(this.fs_id);
    var vs = getShader(this.vs_id);

    this.program = gl.createProgram();
    gl.attachShader(this.program, fs);
    gl.attachShader(this.program, vs);
    gl.linkProgram(this.program);

    if(!gl.getProgramParameter(this.program, gl.LINK_STATUS))
    {
        alert("Could not initialize shader program " + this.id);
    }

    gl.useProgram(this.program);

    // Get attribute and uniform pointers.
    this.attributes = {};
    this.uniforms = {};

    for(var i=0; i<spAttributes[this.vs_id].length; i++)
    {
        var att = spAttributes[this.vs_id][i];
        this.attributes[att] = gl.getAttribLocation(this.program, att);
        gl.enableVertexAttribArray(this.attributes[att]);
    }
    // Check if the associated fragment shader has any uniform variables.
    if(spUniforms[this.fs_id].length > 0)
    {
        for (i = 0; i < spUniforms[this.fs_id].length; i++)
        {
            var uni = spUniforms[this.fs_id][i];
            this.uniforms[uni] = gl.getUniformLocation(this.program, uni);
        }
    }
}

// NOTICE: This function shouldn't be called until you've bound whatever textures you plan to use to their
// appropriate texture units.
ShaderProgram.prototype.prep = function()
{
    gl.useProgram(this.program);

    // Set uniform variable values, if there are any
    var unames = spUniforms[this.fs_id];
    if(unames.length > 0)
    {
        for (var i = 0; i < unames.length; i++) {
            var uname = unames[i];
            var data = uniformValues[uname].data;
            var type = uniformValues[uname].type;
            if (type === gl.FLOAT) {
                gl.uniform1f(this.uniforms[uname], data);
            }
            else if (type === gl.FLOAT_VEC2) {
                gl.uniform2fv(this.uniforms[uname], data);
            }
            else if (type === gl.FLOAT_VEC3) {
                gl.uniform3fv(this.uniforms[uname], data);
            }
            else if (type === gl.FLOAT_VEC4) {
                gl.uniform4fv(this.uniforms[uname], data);
            }
            else if (type === gl.INT) {
                gl.uniform1i(this.uniforms[uname], data);
            }
            else if (type === gl.INT_VEC2) {
                gl.uniform2iv(this.uniforms[uname], data);
            }
            else if (type === gl.INT_VEC3) {
                gl.uniform3iv(this.uniforms[uname], data);
            }
            else if (type === gl.INT_VEC4) {
                gl.uniform4iv(this.uniforms[uname], data);
            }
        }
    }
    // Set attribute arrays
    var anames = spAttributes[this.vs_id];
    for(i=0; i<anames.length; i++)
    {
        var aname = anames[i];
        var att = attributeArrays[aname];
        gl.bindBuffer(att.type, att.buffer);
        if(att.dynamic)
        {
            gl.bufferData(att.type, att.data, gl.DYNAMIC_DRAW);
        }
        gl.vertexAttribPointer(this.attributes[aname], att.itemSize, gl.FLOAT, false, 0, 0);
    }
};

function getShader(id)
{
    var shaderScript = document.getElementById(id);
    if (!shaderScript) {
        return null;
    }

    var str = "";
    var k = shaderScript.firstChild;
    while (k) {
        if (k.nodeType == 3) {
            str += k.textContent;
        }
        k = k.nextSibling;
    }

    var shader;
    if (shaderScript.type == "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}