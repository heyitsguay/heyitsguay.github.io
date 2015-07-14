// ShaderProgram object simplifies creating shader programs and managing their attributes
// and uniform variables.
function ShaderProgram(id)
{
    this.id = id;

    var fragmentShader = this.getShader(shaderPairs[id][0]);
    var vertexShader = this.getShader(shaderPairs[id][1]);

    this.program = gl.createProgram();
    gl.attachShader(this.program, fragmentShader);
    gl.attachShader(this.program, vertexShader);
    gl.linkProgram(this.program);

    if(!gl.getProgramParameter(this.program, gl.LINK_STATUS))
    {
        alert("Could not initialize shader program " + this.id);
    }

    gl.useProgram(this.program);

    // GL.TRIANGLES or GL.TRIANGLE_STRIP.
    this.drawType = shaderVars[this.id].drawType;

    // Get attribute and uniform pointers.
    this.attributes = []; // Array of attribute pointers.
    this.uniforms = [];   // Array of uniform pointers.

    for(var i=0; i<shaderVars[this.id].attributes.length; i++)
    {
        var att = shaderVars[this.id].attributes[i];
        var gl_att = att.$glvar;
        this.attributes[i] = gl.getAttribLocation(this.program, gl_att);
        gl.enableVertexAttribArray(this.attributes[i]);
    }
    // Check if the associated fragment shader has any uniform variables.
    if(shaderVars[this.id].uniforms.length > 0)
    {
        for (i = 0; i < shaderVars[this.id].uniforms.length; i++)
        {
            var uni = shaderVars[this.id].uniforms[i];
            var glvar = uniforms[uni].glvar;
            this.uniforms[i] = gl.getUniformLocation(this.program, glvar);
        }
    }
}

ShaderProgram.Prototype = {
    getShader: function(id) {
        var shaderXHR = new XMLHttpRequest();
        var url = "../shaders/" + id;

        // Creates vertex shader if true, fragment shader if false.
        var isVertex;

        if(id.length > 4 && id.substr(id.length - 4, 4) == "vert") {
            // Vertex shader
            isVertex = true;
        }
        else if(id.length > 4 && id.substr(id.length - 4, 4) == "frag") {
            // Fragment shader
            isVertex = false;
        }
        else {
            alert("Cannot create shader with id " + id);
        }

        // String containing the shader file contents.
        var $shader;
        // Load the shader file's contents.
        shaderXHR.open("GET", url, false);
        shaderXHR.onload = function() {
            $shader = this.responseText;
        };
        shaderXHR.send(null);

        // The shader itself
        var shader = isVertex? gl.createShader(gl.VERTEX_SHADER) : gl.createShader(gl.FRAGMENT_SHADER);

        gl.shaderSource(shader, $shader);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            //alert(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    },

    prep: function(redraw) {
        gl.useProgram(this.program);

        // Set uniform variable values, if there are any.
        if(this.uniforms.length > 0) {
            var unames = shaderVars[this.id].uniforms;
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
            var att = shaderVars[this.id].attributes[i];
            gl.bindBuffer(att.type, att.buffer);

            // Send new buffer data if redraw is true.
            if(redraw) {
                att.toBuffer();
                //gl.bufferSubData(att.type, 0, att.data.subarray(0, att.activeLength));
            }
            // Set the vertex attribute pointer details.
            gl.vertexAttribPointer(this.attributes[i], att.itemSize, gl.FLOAT, false, 0, 0);
        }

        // Resets the redraw command.
        return false;
    }
};