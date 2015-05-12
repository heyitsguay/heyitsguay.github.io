var gl;
function initGL(canvas)
{
    try
    {
        gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;
    }
    catch (e)
    {
        alert("Could not initialise WebGL");
    }
}

function getShader(gl, id)
{
    var shaderScript = document.getElementById(id);
    if (!shaderScript){return null;}

    var str = "";
    var k = shaderScript.firstChild;
    while(k)
    {
        if(k.nodeType == 3)
        {
            str += k.textContent;
        }
        k = k.nextSibling;
    }

    var shader;
    if(shaderScript.type == "x-shader/x-fragment")
    {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    }
    else if(shaderScript.type == "x-shader/x-vertex")
    {
        shader = gl.createShader(gl.VERTEX_SHADER);
    }
    else {return null;}

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        alert(gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

var shaderProgram;

function initShaders()
{
    var fragmentShader = getShader(gl, "fshader");
    var vertexShader = getShader(gl, "vshader");

    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }

    gl.useProgram(shaderProgram);

    shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

    shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
    gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

    shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
    gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
    shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
    shaderProgram.useLightingUniform = gl.getUniformLocation(shaderProgram, "uUseLighting");
    shaderProgram.ambientColorUniform = gl.getUniformLocation(shaderProgram, "uAmbientColor");
    shaderProgram.lightingDirectionUniform = gl.getUniformLocation(shaderProgram, "uLightingDirection");
    shaderProgram.directionalColorUniform = gl.getUniformLocation(shaderProgram, "uDirectionalColor");
    shaderProgram.alphaUniform = gl.getUniformLocation(shaderProgram, "uAlpha");
}

function handleLoadedTexture(texture)
{


    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.bindTexture(gl.TEXTURE_2D, null);
}

var theTextures = [];
var numImages = 10;

function initTexture()
{
    var ims = [];

    for(var i=0; i<numImages; i++)
    {
        ims.push(new Image());
        var texture = gl.createTexture();
        texture.image = ims[i];
        theTextures.push(texture);
    }

    var imstring;
    for(var j = 0; j<numImages; j++)
    {
        (function(e) {
            var tex = theTextures[e];
            ims[j].onload = function () {
                handleLoadedTexture(tex)
            };
        })(j);
        imstring = "frac" + j + ".png";
        ims[j].src = imstring;
    }
}

var mvMatrix = mat4.create();
var pMatrix = mat4.create();

var mvMatrixStack = []; // Woo a stack for mvMatrix values.

function mvPushMatrix()
{
    var copy = mat4.create();
    mat4.set(mvMatrix, copy);
    mvMatrixStack.push(copy);
}

function mvPopMatrix()
{
    if(mvMatrixStack.length == 0)
    {
        throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

function setMatrixUniforms()
{
    gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
    gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);

    var normalMatrix = mat3.create();
    mat4.toInverseMat3(mvMatrix, normalMatrix);
    mat3.transpose(normalMatrix);
    gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, normalMatrix);
}

function degToRad(degrees)
{
    return degrees * Math.PI / 180;
}

var xRot = 0;
var xSpeed = 0;
var yRot = 0;
var ySpeed = 0;
var maxSpeed = 10000;

var dz = -5.0;
var dx = 0;

var imnum = 0;

var keys = {};
var imalpha = 0.8;
var lighting = true;
var blending = true;
function handleKeyDown(event)
{
    keys[event.keyCode] = true;

    if(String.fromCharCode(event.keyCode) == "F")
    {
        imalpha = (imalpha + 0.2) % 1.;
    }

    if(String.fromCharCode(event.keyCode) == "G")
    {
        lighting = !lighting;
    }

    if(String.fromCharCode(event.keyCode) == "H")
    {
        blending = !blending;
    }
}

function handleKeyUp(event)
{
    keys[event.keyCode] = false;
}

function handleKeys()
{
    if(keys[87])
    {
        // w - zoom in
        dz = Math.min(0, dz + 0.05);
    }
    if(keys[83])
    {
        // s - zoom out
        dz = Math.max(-50, dz - 0.05);
    }
    if(keys[65])
    {
        // a - move left
        dx = Math.max(-10, dx - 0.05);
    }
    if(keys[68])
    {
        // d - move right
        dx = Math.min(10, dx + 0.05);
    }
    if(keys[37])
    {
        // left arrow - spin left
        ySpeed = Math.max(-maxSpeed, ySpeed - 1);
    }
    if(keys[39])
    {
        // right arrow - spin right
        ySpeed = Math.min(maxSpeed, ySpeed + 1);
    }
    if(keys[38])
    {
        // up arrow - spin up
        xSpeed = Math.max(-maxSpeed, xSpeed - 1);
    }
    if(keys[40])
    {
        // down arrow - spin down
        xSpeed = Math.min(maxSpeed, xSpeed + 1);
    }
    // Check for one of the number keys being pressed, switch the displayed image to the corresponding picture.
    for(var i=0; i<10; i++)
    {
        if(keys[48+i])
        {
            imnum = i;
        }
    }
//            if(keys[70])
//            {
//                // f - increment imnum
//                imnum = (imnum+1)%3;
//            }

    if(!keys[37] && !keys[39])
    {
        ySpeed *= 0.99;
    }
    if(!keys[38] && !keys[40])
    {
        xSpeed *= 0.99;
    }

}

var b_cubeVs; // Cube vertex positions buffer
var b_cubeNs; // Cube vertex normal buffer
var b_cubeTexCs; // Cube vertex texture coordinate buffer
var b_cubeIdxs; // Cube vertex index buffer

const R2 = 1.4142;
function initBuffers()
{
    // Initialize cube vertex buffer.
    b_cubeVs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeVs);
    var vertices = [
        // Top front face (0)
        -1.,  0.,  1.,
        0.,  R2,  0.,
        1.,  0.,  1.,

        // Top left face (1)
        -1.,  0., -1.,
        0.,  R2,  0.,
        -1.,  0.,  1.,

        // Top back face (2)
        1.,  0., -1.,
        0.,  R2,  0.,
        -1.,  0., -1.,

        // Top right face (3)
        1.,  0.,  1.,
        0.,  R2,  0.,
        1.,  0., -1.,

        // Bottom front face (4)
        -1.,  0.,  1.,
        0., -R2,  0.,
        1.,  0.,  1.,

        // Bottom left face (5)
        -1.,  0., -1.,
        0., -R2,  0.,
        -1.,  0.,  1.,

        // Bottom back face (6)
        1.,  0., -1.,
        0., -R2,  0.,
        -1.,  0., -1.,

        // Bottom right face (7)
        1.,  0.,  1.,
        0., -R2,  0.,
        1.,  0., -1.
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    b_cubeVs.itemSize = 3;
    b_cubeVs.numItems = 24;

    // Initialize cube normal buffer.
    b_cubeNs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeNs);
    var vertexNormals = [
        // Top front face
        0.,  1.,  1.,
        0.,  1.,  1.,
        0.,  1.,  1.,

        // Top left face
        -1.,  1.,  0.,
        -1.,  1.,  0.,
        -1.,  1.,  0.,

        // Top back face
        0.,  1., -1.,
        0.,  1., -1.,
        0.,  1., -1.,

        // Top right face
        1.,  1.,  0.,
        1.,  1.,  0.,
        1.,  1.,  0.,

        // Bottom front face
        0.,  -1.,  1.,
        0.,  -1.,  1.,
        0.,  -1.,  1.,

        // Bottom left face
        -1.,  -1.,  0.,
        -1.,  -1.,  0.,
        -1.,  -1.,  0.,

        // Bottom back face
        0.,  -1., -1.,
        0.,  -1., -1.,
        0.,  -1., -1.,

        // Bottom right face
        1.,  -1.,  0.,
        1.,  -1.,  0.,
        1.,  -1.,  0.

    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexNormals), gl.STATIC_DRAW);
    b_cubeNs.itemSize = 3;
    b_cubeNs.numItems = 24;

    // Initialize cube color buffer.
    b_cubeTexCs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeTexCs);
    var textureCoords = [
        // Top front face
        0.0, 0.0,
        0.5, 0.5,
        1.0, 0.0,

        // Top left face
        0.0, 1.0,
        0.5, 0.5,
        0.0, 0.0,

        // Top back face
        1.0, 1.0,
        0.5, 0.5,
        0.0, 1.0,

        // Top right face
        1.0, 0.0,
        0.5, 0.5,
        1.0, 1.0,

        // Bottom front face
        0.0, 0.0,
        0.5, 0.5,
        1.0, 0.0,

        // Bottom left face
        0.0, 1.0,
        0.5, 0.5,
        0.0, 0.0,

        // Bottom back face
        1.0, 1.0,
        0.5, 0.5,
        0.0, 1.0,

        // Bottom right face
        1.0, 0.0,
        0.5, 0.5,
        1.0, 1.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
    b_cubeTexCs.itemSize = 2;
    b_cubeTexCs.numItems = 24;

    b_cubeIdxs = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b_cubeIdxs);
    var cubeIdxs = [
        0,  1,  2,
        3,  4,  5,
        6,  7,  8,
        9, 10, 11,
        12, 13, 14,
        15, 16, 17,
        18, 19, 20,
        21, 22, 23
    ];
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIdxs), gl.STATIC_DRAW);
    b_cubeIdxs.itemSize = 1;
    b_cubeIdxs.numItems = 24;
}

function drawScene()
{
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);

    mat4.identity(mvMatrix);

    mat4.translate(mvMatrix, [dx, 0.0, dz]);
    //mat4.rotate(mvMatrix, degToRad(rCube), [0.1 + Math.sin(0.2 * time), Math.sin(0.3 * (time + 1.7)), Math.sin(0.02 * (time + 0.9))]);
    mat4.rotate(mvMatrix, degToRad(xRot), [1, 0, 0]);
    mat4.rotate(mvMatrix, degToRad(yRot), [0, 1, 0]);

    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeVs);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, b_cubeVs.itemSize, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeNs);
    gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, b_cubeNs.itemSize, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeTexCs);
    gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, b_cubeTexCs.itemSize, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, theTextures[imnum]);
    gl.uniform1i(shaderProgram.samplerUniform, 0);

    if(blending)
    {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.uniform1f(shaderProgram.alphaUniform, 0.2 + imalpha);
    }
    else
    {
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
    }

    gl.uniform1i(shaderProgram.useLightingUniform, lighting);

    if(lighting)
    {
        gl.uniform3f(shaderProgram.ambientColorUniform, 0.2, 0.2, 0.2);


        var lightingDirection = [Math.sin(time / 4.02), Math.cos(time / 3.27), Math.sin(time / 6.93 + 0.5)];
        var adjustedLD = vec3.create();
        vec3.normalize(lightingDirection, adjustedLD);
        vec3.scale(adjustedLD, -1);
        gl.uniform3fv(shaderProgram.lightingDirectionUniform, adjustedLD);

        gl.uniform3f(shaderProgram.directionalColorUniform, 1, 1, 1);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b_cubeIdxs);
    setMatrixUniforms();
    gl.drawElements(gl.TRIANGLES, b_cubeIdxs.numItems, gl.UNSIGNED_SHORT, 0);
}

var lastTime = 0.;
var time = 0.;
var fps = 0;
var fpsFilter = 30;
function animate()
{
    var timeNow = new Date().getTime();
    if(lastTime != 0)
    {
        var elapsed = timeNow - lastTime;

        xRot = (xRot + xSpeed * elapsed / 1000.0) % 360;
        yRot = (yRot + ySpeed * elapsed / 1000.0) % 360;
        time = (time + elapsed / 500.) % 10000;
    }
    if(elapsed>0)
    {
        fps += (1000. / elapsed - fps) / fpsFilter;
    }
    lastTime = timeNow;
}

function drawFPS()
{
    var counter = document.getElementById("fpscounter");
    counter.innerHTML = fps.toFixed(1) + " fps";
}

function tick()
{
    requestAnimationFrame(tick);
    handleKeys();
    drawScene();
    animate();
}

function webGLStart()
{
    var canvas = document.getElementById("canvas01");
    initGL(canvas);
    initShaders();
    initBuffers();
    initTexture();

    gl.clearColor(0., 0., 0., 1.);
    gl.enable(gl.DEPTH_TEST);

    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    setInterval(drawFPS, 500);

    tick();
}