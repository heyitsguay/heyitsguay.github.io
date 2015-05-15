var gl;

function initGL(canvas) {
    try {
        gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;
    } catch (e) {
    }
    if (!gl) {
        alert("Could not initialise WebGL, sorry :-(");
    }
}

function getShader(gl, id) {
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


var shaderProgram;

function initShaders() {
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

    shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
    gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
    shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
    shaderProgram.useLightingUniform = gl.getUniformLocation(shaderProgram, "uUseLighting");
    shaderProgram.ambientColorUniform = gl.getUniformLocation(shaderProgram, "uAmbientColor");
    shaderProgram.lightingDirectionUniform = gl.getUniformLocation(shaderProgram, "uLightingDirection");
    shaderProgram.directionalColorUniform = gl.getUniformLocation(shaderProgram, "uDirectionalColor");
}

function handleLoadedTexture(texture) {
    //noinspection JSCheckFunctionSignatures
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.bindTexture(gl.TEXTURE_2D, null);
}

var theTextures = [];
var numImages = 9;
var planets = ["Mercury", "Venus", "Earth", "Moon", "Mars", "Jupiter", "Saturn", "Neptune", "Pluto"];
var radii = [0.17, 0.42, 0.45, 0.12, 0.24, 5., 4.22, 1.73, 0.08];

function initTexture()
{
    var ims = [];

    for(var i =0; i<numImages; i++)
    {
        ims.push(new Image());
        var texture = gl.createTexture();
        texture.image = ims[i];
        theTextures.push(texture);
    }

    for(var j=0; j<numImages; j++)
    {
        (function(e)
        {
            var tex = theTextures[e];
            ims[e].onload = function() {handleLoadedTexture(tex)};
        })(j);
    }

    ims[0].src = "mercury.jpg";
    ims[1].src = "venus.jpg";
    ims[2].src = "earth.jpg";
    ims[3].src = "moon.jpg";
    ims[4].src = "mars.jpg";
    ims[5].src = "jupiter.jpg";
    ims[6].src = "saturn.jpg";
    ims[7].src = "neptune.jpg";
    ims[8].src = "pluto.jpg";
}

var mvMatrix = mat4.create();
var pMatrix = mat4.create();

var normalMatrix = mat3.create();
function setMatrixUniforms()
{
    gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
    gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
    mat4.toInverseMat3(mvMatrix, normalMatrix);
    //mat3.transpose(normalMatrix);
    gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, true, normalMatrix);
}

function degToRad(degrees)
{
    return degrees * Math.PI / 180;
}

var mouseDown = false;
var lastMouseX = null;
var lastMouseY = null;
var vRotX = 0;
var vRotY = 0;

var moonRotationMatrix = mat4.create();
mat4.identity(moonRotationMatrix);

function handleMouseDown(e)
{
    mouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    vRotX = 0;
    vRotY = 0;
}

//noinspection JSUnusedLocalSymbols
function handleMouseUp(e)
{
    mouseDown = false;
}

var newX, newY;
var ticksSinceMouseMove = 100;
function handleMouseMove(e)
{
    if(!mouseDown){return;}

    ticksSinceMouseMove = 0;
    newX = e.clientX;
    newY = e.clientY;

    vRotX = newX - lastMouseX;
    vRotY = newY - lastMouseY;

    lastMouseX = newX;
    lastMouseY = newY;
}

var planetIdx = 0;
var z = -2;

var keys = [];

function handleKeyDown(e)
{
    keys[e.keyCode] = true;
}

function handleKeyUp(e)
{
    keys[e.keyCode] = false;
}

var oldPlanetIdx = -1;
function handleKeys()
{
    for(var i = 0; i < numImages; i++)
    {
        // Keys 1-9 select which planet to display (ordered as on the keyboard: 1 is Mercury, 9 is Pluto)
        if(keys[49 + i ])
        {
            planetIdx = i;
        }
    }

    if(keys[83]) // S
    {
        // Zoom out
        z -= 0.15;
    }
    if(keys[87]) // W
    {
        // Zoom in
        if(z > 4 * maxz)
        {
            z = maxz + 9 * (z - maxz) / 10;
        }
        else
        {
            z += 0.15;
        }
    }

}

// Touchscreen event controllers
var finger2X, finger2Y;
var twoFingersDown = false;
var lastFingerDistance;
function handleTouchStart(e)
{
    e.preventDefault();
    var touches = e.targetTouches;


    mouseDown = true;
    lastMouseX = touches[0].pageX;
    lastMouseY = touches[0].pageY;
    vRotX = 0;
    vRotY = 0;

    // Track second finger location, use for pinch-to-zoom.
    if(touches.length > 1)
    {
        twoFingersDown = true;
        finger2X = touches[1].pageX;
        finger2Y = touches[1].pageY;
        lastFingerDistance = Math.abs(finger2X - lastMouseX) + Math.abs(finger2Y - lastMouseY); // L1 distance for computational ease.
    }
}


function handleTouchMove(e)
{
    ticksSinceMouseMove = 0;
    e.preventDefault();
    var touches = e.targetTouches;
    newX = touches[0].pageX;
    newY = touches[0].pageY;

    var newFingerDistance;

    if(touches.length == 1)
    {
        vRotX = (newX - lastMouseX);
        vRotY = (newY - lastMouseY);

        lastMouseX = newX;
        lastMouseY = newY;
    }
    else if(touches.length > 1)
    {
        lastMouseX = newX;
        lastMouseY = newY;
        vRotX = 0;
        vRotY = 0;
        finger2X = touches[1].pageX;
        finger2Y = touches[1].pageY;

        newFingerDistance = Math.abs(finger2X - newX) + Math.abs(finger2Y - newY);
        var distTol = 2; // Ignore changes smaller than this tolerance, for better stability.

        if(lastFingerDistance - newFingerDistance > distTol) // Fingers came together, zoom out.
        {
            z *= 1.03;
        }
        else if(newFingerDistance - lastFingerDistance > distTol) // Fingers spread apart, zoom in.
        {
            if(z > 4 * maxz)
            {
                z = maxz + 9 * (z - maxz) / 10;
            }
            else
            {
                z *= 0.97;
            }
        }
        lastFingerDistance = newFingerDistance;

    }
}

function handleTouchEnd(e)
{
    e.preventDefault();
    var touches = e.targetTouches;
    //vRotX = 0;
    //vRotY = 0;
    if(touches.length < 2)
    {
        twoFingersDown = false;
    }
    if(touches.length < 1)
    {
        mouseDown = false;
    }
}

function button0click()
{
    // Decrement planetIdx (previous planet)
    planetIdx -= 1;
    if(planetIdx < 0)
    {
        planetIdx = 8;
    }
}

function button1click()
{
    // Increment planetIdx (next planet)
    planetIdx = (planetIdx + 1) % 9;
}
var texNow;
var radNow;
var maxz;
function planetUpdate()
{
    texNow = theTextures[planetIdx];
    radNow = radii[planetIdx];
    if(planetIdx == 8)
    {
        // Fix for pluto acting up when zooming.
        maxz = -1.8 * radNow;
    }
    else
    {
        maxz = -1.5 * radNow;
    }
    z = Math.min(z, 1.5 * maxz);
    initBuffers();
    var planetText = document.getElementById("planet");
    planetText.innerHTML = planets[planetIdx];
    oldPlanetIdx = planetIdx;

}

var newRotationMatrix = mat4.create();
function rotateSphere()
{
    var rotDrag = 0.96;
    if(!mouseDown || (newX == lastMouseX && newY == lastMouseY))
    {
        vRotX *= rotDrag;
        if(Math.abs(vRotX) < 0.01)
        {
            vRotX = 0;
        }

        vRotY *= rotDrag;
        if(Math.abs(vRotY) < 0.01)
        {
            vRotY = 0;
        }
    }
    if(mouseDown && ticksSinceMouseMove > 5)
    {
        vRotX = 0;
        vRotY = 0;
    }
    mat4.identity(newRotationMatrix);
    mat4.rotate(newRotationMatrix, degToRad(vRotX / 2), [0, 1, 0]);
    mat4.rotate(newRotationMatrix, degToRad(vRotY / 2), [1, 0, 0]);
    mat4.multiply(newRotationMatrix, moonRotationMatrix, moonRotationMatrix);
}

var b_moonVs; // vertex position buffer
var b_moonNs; // vertex normal buffer
var b_moonTCs; // texture coordinate buffer
var b_moonIs; // vertex index buffer

function initBuffers()
{
    var latitudeBands = 60;
    var longitudeBands = 60;

    var vertexPositionData = [];
    var normalData = [];
    var textureCoordData = [];

    var lt, ln;
    for (lt=0; lt<=latitudeBands; lt++)
    {
        var theta = lt * Math.PI / latitudeBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        for(ln = 0; ln<=longitudeBands; ln++)
        {
            var phi = ln * 2 * Math.PI / longitudeBands;
            var sinPhi = Math.sin(phi);
            var cosPhi = Math.cos(phi);

            var x = cosPhi * sinTheta;
            var y = cosTheta;
            var z = sinPhi * sinTheta;
            var u = 1 - (ln / longitudeBands);
            var v = 1 - (lt / latitudeBands);

            normalData.push(x);
            normalData.push(y);
            normalData.push(z);
            textureCoordData.push(u);
            textureCoordData.push(v);
            vertexPositionData.push(radNow * x);
            vertexPositionData.push(radNow * y);
            vertexPositionData.push(radNow * z);
        }
    }

    var indexData = [];
    for(lt=0; lt < latitudeBands; lt++)
    {
        for(ln=0; ln < longitudeBands; ln++)
        {
            var first = (lt * (longitudeBands + 1)) + ln;
            var second = first + longitudeBands + 1;
            indexData.push(first);
            indexData.push(second);
            indexData.push(first + 1);

            indexData.push(second);
            indexData.push(second + 1);
            indexData.push(first + 1);
        }
    }

    b_moonNs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_moonNs);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalData), gl.STATIC_DRAW);
    b_moonNs.itemSize = 3;
    b_moonNs.numItems = normalData.length / 3;

    b_moonTCs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_moonTCs);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordData), gl.STATIC_DRAW);
    b_moonTCs.itemSize = 2;
    b_moonTCs.numItems = textureCoordData.length / 2;

    b_moonVs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_moonVs);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexPositionData), gl.STATIC_DRAW);
    b_moonVs.itemSize = 3;
    b_moonVs.numItems = vertexPositionData.length / 3;

    b_moonIs = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b_moonIs);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexData), gl.STATIC_DRAW);
    b_moonIs.itemSize = 1;
    b_moonIs.numItems = indexData.length;
}

function drawScene()
{
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

    mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.05, 1000.0, pMatrix);

    var lighting = false;
    //noinspection JSCheckFunctionSignatures
    gl.uniform1i(shaderProgram.useLightingUniform, lighting);
    //if(lighting)
    //{
    //    gl.uniform3f(shaderProgram.ambientColorUniform,
    //        parseFloat(document.getElementById("ambientR").value),
    //        parseFloat(document.getElementById("ambientG").value),
    //        parseFloat(document.getElementById("ambientB").value));
    //
    //    var lightingDirection = [
    //        parseFloat(document.getElementById("lightDirectionX").value),
    //        parseFloat(document.getElementById("lightDirectionY").value),
    //        parseFloat(document.getElementById("lightDirectionZ").value)
    //    ];
    //    var adjustedLD = vec3.create();
    //    vec3.normalize(lightingDirection, adjustedLD);
    //    vec3.scale(adjustedLD, -1);
    //    gl.uniform3fv(shaderProgram.lightingDirectionUniform, adjustedLD);
    //
    //    gl.uniform3f(shaderProgram.directionalColorUniform,
    //        parseFloat(document.getElementById("directionalR").value),
    //        parseFloat(document.getElementById("directionalG").value),
    //        parseFloat(document.getElementById("directionalB").value));
    //}

    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [0, 0, z]);
    mat4.multiply(mvMatrix, moonRotationMatrix);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texNow);
    gl.uniform1i(shaderProgram.samplerUniform, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, b_moonVs);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, b_moonVs.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, b_moonTCs);
    gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, b_moonTCs.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, b_moonNs);
    gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, b_moonNs.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b_moonIs);
    setMatrixUniforms();
    gl.drawElements(gl.TRIANGLES, b_moonIs.numItems, gl.UNSIGNED_SHORT, 0);
}

function writeFPS()
{
    var counter = document.getElementById("fpscounter");
    counter.innerHTML = fps.toFixed(1) + " fps";
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

function tick()
{
    updateFPS();
    handleKeys();
    if(oldPlanetIdx != planetIdx)
    {
        planetUpdate();
    }
    requestAnimationFrame(tick);

    // Cap at 1000 to prevent overflows.
    ticksSinceMouseMove = Math.min(1000, ticksSinceMouseMove + 1);
    rotateSphere();
    drawScene();
}

function resizeCanvas()
{
    var canvas = document.getElementById("canvas");
    var w = window;
    var d = document;
    var e = d.documentElement;
    var g = d.getElementsByTagName('body')[0];
    var x = w.innerWidth || e.clientWidth || g.clientWidth;
    var y = w.innerHeight || e.clientHeight || g.clientHeight;
    canvas.height = Math.floor(0.66 * y);
    canvas.width = Math.floor(0.75 * x);
    gl.viewportHeight = canvas.height;
    gl.viewportWidth = canvas.width;
}

function webGLStart()
{
    var canvas = document.getElementById("canvas");

    initGL(canvas);
    initShaders();
    initBuffers();
    initTexture();

    gl.clearColor(0., 0., 0., 1.);
    gl.enable(gl.DEPTH_TEST);

    canvas.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;

    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    // Touch thangs
    canvas.addEventListener("touchstart", handleTouchStart, false);
    canvas.addEventListener("touchleave", handleTouchEnd, false);
    canvas.addEventListener("touchend", handleTouchEnd, false);
    canvas.addEventListener("touchmove", handleTouchMove, false);

    // Window resize handler
    resizeCanvas(); // Set up initial width
    window.onresize = resizeCanvas;

    setInterval(writeFPS, 500);

    tick();
}
