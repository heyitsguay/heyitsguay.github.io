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

    shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
    gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
}

function handleLoadedTexture(texture)
{
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.bindTexture(gl.TEXTURE_2D, null);
}

var theTextures = [];
var numImages = 4;

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
    for(var j = 0; j<numImages; j++)
    {
        (function(e) {
            var tex = theTextures[e];
            ims[j].onload = function () {
                handleLoadedTexture(tex)
            };
        })(j);
    }
    ims[0].src = "dave.png";
    ims[1].src = "dave2.png";
    ims[2].src = "dave3.png";
    ims[3].src = "dave4.png";
}

var mvMatrix = mat4.create();
var pMatrix = mat4.create();

function setMatrixUniforms()
{
    gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
    gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
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

var filter = 0;

var keys = {};

function handleKeyDown(event)
{
    keys[event.keyCode] = true;

    if(String.fromCharCode(event.keyCode) == "F")
    {
        filter = (filter + 1) % numImages;
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
//            if(keys[70])
//            {
//                // f - increment filter
//                filter = (filter+1)%3;
//            }

    if((!keys[37] && !keys[39]) || (isTouchscreen && ticksSinceTouchMove > 25))
    {
        ySpeed *= 0.995;
    }
    if((!keys[38] && !keys[40]) || (isTouchscreen && ticksSinceTouchMove > 25))
    {
        xSpeed *= 0.995;
    }

}

var fingerDown = false;
var twoFingersDown = false;
var lastFingerDistance;
var finger0x, finger0y, finger1x, finger1y;
var ticksSinceTouchMove = 100;
function handleTouchStart(e)
{
    e.preventDefault();
    var touches = e.targetTouches;

    fingerDown = true;
    finger0x = touches[0].pageX;
    finger0y = touches[0].pageY;

    if(touches.length > 1)
    {
        twoFingersDown = true;
        finger1x = touches[1].pageX;
        finger1y = touches[1].pageY;
        lastFingerDistance = Math.abs(finger1x - finger0x) + Math.abs(finger1y - finger0y);
    }
}

var new0x, new0y;
function handleTouchMove(e)
{
    e.preventDefault();
    var touches = e.targetTouches;
    new0x = touches[0].pageX;
    new0y = touches[0].pageY;

    if(!twoFingersDown)
    {
        var dtol = 3;
        var dx = new0x - finger0x;
        if(Math.abs(dx) > dtol)
        {
            ticksSinceTouchMove = 0;
            ySpeed += dx;
        }

        var dy = new0y - finger0y;
        if(Math.abs(dy) > dtol)
        {
            ticksSinceTouchMove = 0;
            xSpeed += dy;
        }

        finger0x = new0x;
        finger0y = new0y;
    }
    else
    {
        ticksSinceTouchMove = 0;
        finger0x = new0x;
        finger0y = new0y;
        finger1x = touches[1].pageX;
        finger1y = touches[1].pageY;

        var newFingerDistance = Math.abs(finger1x - finger0x) + Math.abs(finger1y - finger0y);
        var distTol = 3;

        if(lastFingerDistance - newFingerDistance > distTol)
        {
            dz *= 1.015;
        }
        else if(newFingerDistance - lastFingerDistance > distTol)
        {
            if(dz > -5)
            {
                dz = -1.5 + 9 * (dz + 1.5) / 10;
            }
            else
            {
                dz *= 0.985;
            }
        }

        lastFingerDistance = newFingerDistance;
    }
}

var lastTap = new Date().getTime();
var timeSinceTap;
var doubleTapInterval = 200;
function handleTouchEnd(e)
{
    e.preventDefault();
    var touches = e.targetTouches;

    // All fingers removed
    if(touches.length == 0)
    {
        // Single finger double-tap detection
        if(!twoFingersDown)
        {
            var newTap = new Date().getTime();
            timeSinceTap = newTap - lastTap;

            if(timeSinceTap < doubleTapInterval)
            {
                filter = (filter + 1) % numImages;
            }
            lastTap = newTap;
        }

        fingerDown = false;
        twoFingersDown = false;
    }
    else if(touches.length == 1)
    {
        twoFingersDown = false;
    }
}


var b_cubeVs; // Cube vertex positions buffer
var b_cubeTexCs; // Cube vertex texture coordinate buffer
var b_cubeIdxs; // Cube vertex index buffer

function initBuffers()
{
    // Initialize cube vertex buffer.
    b_cubeVs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeVs);
    var vertices = [
        // Front face
        -1.0, -1.0,  1.0,
        1.0, -1.0,  1.0,
        1.0,  1.0,  1.0,
        -1.0,  1.0,  1.0,

        // Back face
        -1.0, -1.0, -1.0,
        -1.0,  1.0, -1.0,
        1.0,  1.0, -1.0,
        1.0, -1.0, -1.0,

        // Top face
        -1.0,  1.0, -1.0,
        -1.0,  1.0,  1.0,
        1.0,  1.0,  1.0,
        1.0,  1.0, -1.0,

        // Bottom face
        -1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        1.0, -1.0,  1.0,
        -1.0, -1.0,  1.0,

        // Right face
        1.0, -1.0, -1.0,
        1.0,  1.0, -1.0,
        1.0,  1.0,  1.0,
        1.0, -1.0,  1.0,

        // Left face
        -1.0, -1.0, -1.0,
        -1.0, -1.0,  1.0,
        -1.0,  1.0,  1.0,
        -1.0,  1.0, -1.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    b_cubeVs.itemSize = 3;
    b_cubeVs.numItems = 24;

    // Initialize cube color buffer.
    b_cubeTexCs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeTexCs);
    var textureCoords = [
        // Front face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,

        // Back face
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        0.0, 0.0,

        // Top face
        0.0, 1.0,
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,

        // Bottom face
        1.0, 1.0,
        0.0, 1.0,
        0.0, 0.0,
        1.0, 0.0,

        // Right face
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        0.0, 0.0,

        // Left face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
    b_cubeTexCs.itemSize = 2;
    b_cubeTexCs.numItems = 24;

    b_cubeIdxs = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b_cubeIdxs);
    var cubeIdxs = [
        0, 1, 2,      0, 2, 3,    // Front face
        4, 5, 6,      4, 6, 7,    // Back face
        8, 9, 10,     8, 10, 11,  // Top face
        12, 13, 14,   12, 14, 15, // Bottom face
        16, 17, 18,   16, 18, 19, // Right face
        20, 21, 22,   20, 22, 23  // Left face
    ];
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIdxs), gl.STATIC_DRAW);
    b_cubeIdxs.itemSize = 1;
    b_cubeIdxs.numItems = 36;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, b_cubeTexCs);
    gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, b_cubeTexCs.itemSize, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, theTextures[filter]);
    gl.uniform1i(shaderProgram.samplerUniform, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b_cubeIdxs);
    setMatrixUniforms();
    gl.drawElements(gl.TRIANGLES, b_cubeIdxs.numItems, gl.UNSIGNED_SHORT, 0);
}


function animate()
{
    if(isTouchscreen && fingerDown && !twoFingersDown && ticksSinceTouchMove > 9)
    {
        xSpeed = 0;
        ySpeed = 0;
    }
    if(lastTime != 0)
    {
        xRot = (xRot + xSpeed * elapsed / 1000.0) % 360;
        yRot = (yRot + ySpeed * elapsed / 1000.0) % 360;
    }
}

var lastTime = new Date().getTime();
var elapsed = 0;
var fps = 0;
var fpsFilter = 30;
function updateFPS()
{
    var timeNow = new Date().getTime();
    elapsed = timeNow - lastTime;
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

function touchCheck()
{
    return(('ontouchstart' in window) || (navigator.MaxTouchPoints > 0)
    || (navigator.msMaxTouchPoints > 0));
}

function tick()
{
    updateFPS();
    requestAnimationFrame(tick);
    handleKeys();
    drawScene();

    ticksSinceTouchMove = Math.min(1000, ticksSinceTouchMove + 1);
    animate();
}

function resizeCanvas()
{
    var canvas = document.getElementById("canvas01");
    var w = window;
    var d = document;
    var e = d.documentElement;
    var g = d.getElementsByTagName('body')[0];
    var x = w.innerWidth || e.clientWidth || g.clientWidth;
    var y = w.innerHeight || e.clientHeight || g.clientHeight;
    var z = Math.min(x,y);
    canvas.height = Math.floor(0.5 * z);
    canvas.width = Math.floor(0.5 * z);
    gl.viewportHeight = canvas.height;
    gl.viewportWidth = canvas.width;
}

var isTouchscreen = false;
function webGLStart()
{
    var canvas = document.getElementById("canvas01");
    initGL(canvas);
    initShaders();
    initBuffers();
    initTexture();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    isTouchscreen = touchCheck();

    if(isTouchscreen)
    {
        var instr = document.getElementById("instructions");
        instr.innerHTML = "<h4>Touch and drag to rotate, pinch to zoom, double-tap to switch Daves.</h4>";
    }

    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    canvas.addEventListener("touchstart", handleTouchStart, false);
    canvas.addEventListener("touchleave", handleTouchEnd, false);
    canvas.addEventListener("touchend", handleTouchEnd, false);
    canvas.addEventListener("touchmove", handleTouchMove, false);

    // Window resize handler
    resizeCanvas(); // Set up initial width
    window.onresize = resizeCanvas;

    setInterval(drawFPS, 500);

    tick();
}