/**
 * The ShaderProgram object simplifies creating shader programs and managing their attribute and uniform variables.
 * @param {string} id - name of the ShaderProgram.
 * @constructor
 */
function ShaderProgram(id)
{
    // ShaderProgram data is read in from the global ShaderProgramData variable, using the id as a key.
    this.id = id;

    // Get the ShaderProgram's fragment shader.
    var fragmentShader = this.getShader(shaderProgramData[id].shaders[0]);

    // Get the ShaderProgram's vertex shader.
    var vertexShader = this.getShader(shaderProgramData[id].shaders[1]);

    // A WebGL shader program created from fragmentShader and vertexShader.
    this.program = gl.createProgram();
    gl.attachShader(this.program, fragmentShader);
    gl.attachShader(this.program, vertexShader);
    gl.linkProgram(this.program);

    // Make sure this.program was properly initialized.
    if(!gl.getProgramParameter(this.program, gl.LINK_STATUS))
    {
        alert("Could not initialize shader program " + this.id);
    }

    // Bind this.program as the current shader program for setup purposes.
    gl.useProgram(this.program);

    // GL.TRIANGLES or GL.TRIANGLE_STRIP.
    this.drawType = shaderProgramData[this.id].drawType;

    // Get attribute and uniform pointers.
    this.attributes = []; // Array of attribute pointers.
    this.uniforms = [];   // Array of uniform pointers.
    for(var i=0; i<shaderProgramData[this.id].attributes.length; i++)
    {
        var att = shaderProgramData[this.id].attributes[i];
        var gl_att = att.$glVar;
        this.attributes[i] = gl.getAttribLocation(this.program, gl_att);
        gl.enableVertexAttribArray(this.attributes[i]);
    }
    // Check if the associated fragment shader has any uniform variables.
    if(shaderProgramData[this.id].uniforms.length > 0)
    {
        // If so, get pointers to their locations and store in this.uniforms.
        for (i = 0; i < shaderProgramData[this.id].uniforms.length; i++)
        {
            var uni = shaderProgramData[this.id].uniforms[i];
            var glvar = uniforms[uni].glvar;
            this.uniforms[i] = gl.getUniformLocation(this.program, glvar);
        }
    }
}

/**
 *
 * @typedef {Object} WebGLShader
 * @param {string} shaderName - name of the shader to load.
 * @returns {WebGLShader|*|{1}}
 */
ShaderProgram.prototype.getShader = function(shaderName) {
    var shaderXHR = new XMLHttpRequest();
    var url = "shaders/" + shaderName;

    // Creates vertex shader if true, fragment shader if false.
    var isVertex;

    // Shaders must use .frag and .vert as their file extensions to indicate the type of shader they are. Throw an
    // error otherwise.
    if(shaderName.length > 4 && shaderName.substr(shaderName.length - 4, 4) == "vert") {
        // Vertex shader
        isVertex = true;
    }
    else if(shaderName.length > 4 && shaderName.substr(shaderName.length - 4, 4) == "frag") {
        // Fragment shader
        isVertex = false;
    }
    else {
        throw "Cannot create shader " + shaderName;
    }

    // String containing the shader file contents.
    var $shader;
    // Load the shader file's contents.
    shaderXHR.open("GET", url, false);
    shaderXHR.onload = function() {
        $shader = this.responseText;
    };
    shaderXHR.send(null);

    // Certain variables in the shader code are dependent on quantities that are fixed at startup but not known before
    // startup. Dummy variables are inserted in the .frag files, replace them here with their correct values.
    $shader = $shader.replace('HEATOFFSET1', maxHeat.toFixed(8));
    $shader = $shader.replace('HEATOFFSET2', (1 / (2 * maxHeat)).toFixed(8));
    $shader = $shader.replace('HEATSCALE', (2 * maxHeat).toFixed(8));


    // The shader itself.
    var shader = isVertex? gl.createShader(gl.VERTEX_SHADER) : gl.createShader(gl.FRAGMENT_SHADER);

    // Set the source for the shader to be the string $shader we just loaded in.
    gl.shaderSource(shader, $shader);

    // Compile the shader.
    gl.compileShader(shader);

    // Check to see if the shader compiled successfully, and throw an exception if not.
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw "Could not compile shader " + shaderName;
    }

    return shader;
};

/**
 * Set up WebGL to run this ShaderProgram's shader program.
 * @param {boolean=} [reloadAttributes=false] - indicates whether the shader's attribute data needs to be reloaded.
 * @returns {boolean}
 */
ShaderProgram.prototype.prep = function(reloadAttributes) {
    reloadAttributes = (reloadAttributes != null)? reloadAttributes : false;
    gl.useProgram(this.program);

    // Set uniform variable values, if there are any.
    if(this.uniforms.length > 0) {
        var unames = shaderProgramData[this.id].uniforms;
        for(var i=0; i<unames.length; i++) {
            var uname = unames[i];
            var data = uniforms[uname].data;
            var type = uniforms[uname].type;
            if (type === gl.FLOAT) {
                gl.uniform1f(this.uniforms[i], data);
            }
            else if (type === gl.FLOAT_VEC2) {
                gl.uniform2fv(this.uniforms[i], data);
            }
            else if (type === gl.FLOAT_VEC3) {
                gl.uniform3fv(this.uniforms[i], data);
            }
            else if (type === gl.FLOAT_VEC4) {
                gl.uniform4fv(this.uniforms[i], data);
            }
            else if (type === gl.INT) {
                gl.uniform1i(this.uniforms[i], data);
            }
            else if (type === gl.INT_VEC2) {
                gl.uniform2iv(this.uniforms[i], data);
            }
            else if (type === gl.INT_VEC3) {
                gl.uniform3iv(this.uniforms[i], data);
            }
            else if (type === gl.INT_VEC4) {
                gl.uniform4iv(this.uniforms[i], data);
            }
        }
    }

    // Set attribute values.
    for(i=0; i<this.attributes.length; i++) {
        var att = shaderProgramData[this.id].attributes[i];

        // Send new buffer data if redraw is true.
        if(reloadAttributes) {
            att.toBuffer();
        } else {
            gl.bindBuffer(att.type, att.buffer);
        }
        // Set the vertex attribute pointer details.
        gl.vertexAttribPointer(this.attributes[i], att.itemSize, gl.FLOAT, false, 0, 0);
    }

    // Resets the reloadAttributes command.
    return false;
};