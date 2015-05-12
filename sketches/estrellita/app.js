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

    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
    shaderProgram.colorUniform = gl.getUniformLocation(shaderProgram, "uColor");
}

function handleLoadedTexture(texture) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.bindTexture(gl.TEXTURE_2D, null);
}

var starTexture;

function initTexture()
{
    starTexture = gl.createTexture();
    starTexture.image = new Image();
    starTexture.image.onload = function(){handleLoadedTexture(starTexture)};
    starTexture.image.src = "star.gif";
}

var mvMatrix = mat4.create();
var mvMatrixStack = [];
var pMatrix = mat4.create();

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
}

function degToRad(degrees)
{
    return degrees * Math.PI / 180;
}

function handleClick()
{
    if(explosionImpulse == 0 && explosionForce < 1) {
        explosionImpulse = explosionImpulseMax;
    }
}

var keys = {};

function handleKeyDown(event)
{
    keys[event.keyCode] = true;

    if(String.fromCharCode(event.keyCode) == "F")
    {
        twinkle = !twinkle;
    }
}

function handleKeyUp(event)
{
    keys[event.keyCode] = false;
}

var z = -30;
var xtilt = 90.;
var ytilt = 0.;
var twinkle = true;

function handleKeys()
{
    if(keys[37]) // Left cursor key
    {
        // Rotate clockwise around Y axis
        ytilt = (ytilt - 2) % 360;
    }
    if(keys[38]) // Up cursor key
    {
        // Rotate counterclockwise around X axis
        xtilt = (xtilt + 2) % 360;
    }
    if(keys[39]) // Right cursor key
    {
        // Rotate counterclockwise around Y axis
        ytilt = (ytilt + 2) % 360;
    }
    if(keys[40]) // Down cursor key
    {
        // Rotate clockwise around X axis
        xtilt = (xtilt - 2) % 360;
    }
    if(keys[83]) // S
    {
        // Zoom out
        z -= 1;
    }
    if(keys[87]) // W
    {
        // Zoom in
        z = Math.min(0, z + 1);
    }
}

var b_starVs; // star vertex buffer
var b_starTCs; // star texture coordinate buffer

function initBuffers()
{
    b_starVs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_starVs);
    var vertices = [
        -1., -1., 0.,
        1., -1., 0.,
        -1.,  1., 0.,
        1.,  1., 0.
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    b_starVs.itemSize = 3;
    b_starVs.numItems = 4;

    b_starTCs = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b_starTCs);
    var textureCoords = [
        0., 0.,
        1., 0.,
        0., 1.,
        1., 1.
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
    b_starTCs.itemSize = 2;
    b_starTCs.numItems = 4;
}

function drawStar()
{
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, starTexture);
    gl.uniform1i(shaderProgram.samplerUniform, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, b_starTCs);
    gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, b_starTCs.itemSize, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b_starVs);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, b_starVs.itemSize, gl.FLOAT, false, 0, 0);

    setMatrixUniforms();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, b_starVs.numItems);
}

function Star(startingDistance, rotationSpeed)
{
    this.angle = 0;
    this.dist = startingDistance;
    this.rotationSpeed = rotationSpeed;

    this.randomiseColors();
}

Star.prototype.draw = function(spin, twinkle)
{
    mvPushMatrix();

    // Move to the star's position
    mat4.rotate(mvMatrix, degToRad(this.angle), [0., 1., 0.]);
    mat4.translate(mvMatrix, [this.dist + explosionForce * this.scatterX, explosionForce * this.scatterY, explosionForce * this.scatterZ]);

    // Rotate back so that the star is facing the viewer
    mat4.rotate(mvMatrix, degToRad(-this.angle), [0., 1., 0.]);
    mat4.rotate(mvMatrix, degToRad(-ytilt), [0., 1., 0.]);
    mat4.rotate(mvMatrix, degToRad(-xtilt), [1., 0., 0.]);

    if(twinkle)
    {
        var c = 0.5*(1 + Math.cos(lastTime / 100)); // Twinkle scaling
        gl.uniform3f(shaderProgram.colorUniform, c*this.twinkleR, c*this.twinkleG, c*this.twinkleB);
        drawStar();
    }

    // All stars spin around their Z axis
    mat4.rotate(mvMatrix, degToRad(spin), [0., 0., 1.]);

    // Draw the star in its main color
    gl.uniform3f(shaderProgram.colorUniform, this.r, this.g, this.b);
    drawStar();

    mvPopMatrix();
};

var effectiveFPMS = 60. / 1000.;
Star.prototype.animate = function(elapsedTime)
{
    this.angle += this.rotationSpeed * effectiveFPMS * elapsedTime;

    this.dist -= 0.01 * effectiveFPMS * elapsedTime;
    if(this.dist + explosionForce < 0.)
    {
        this.dist += 15.;
        this.randomiseColors();
    }
};

Star.prototype.randomiseColors = function()
{
    this.r = Math.random();
    this.g = Math.random();
    this.b = Math.random();

    this.twinkleR = Math.random();
    this.twinkleG = Math.random();
    this.twinkleB = Math.random();

    var phi = 2 * Math.PI * Math.random();
    var theta = 2 * Math.PI * Math.random();
    this.scatterX = Math.sin(phi) * Math.cos(theta);
    this.scatterY = Math.sin(phi) * Math.sin(theta);
    this.scatterZ = Math.cos(phi);
};

var stars = [];

function initWorldObjects(numStars)
{
    for(var i=0; i<numStars; i++)
    {
        stars.push(new Star((i / numStars)*15.0, i / numStars));
    }
}

var spin=0;
function drawScene()
{
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

    mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 10000.0, pMatrix);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.BLEND);

    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [0., 0., z]);
    mat4.rotate(mvMatrix, degToRad(xtilt), [1., 0., 0.]);
    mat4.rotate(mvMatrix, degToRad(ytilt), [0., 1., 0.]);

    for(var i=0; i<stars.length; i++)
    {
        stars[i].draw(spin, twinkle);
        spin += 0.02;
    }
}

var lastTime = 0;
var fps = 0;
var fpsFilter = 30;
function animate()
{
    var timeNow = new Date().getTime();
    if(lastTime != 0)
    {
        var elapsed = timeNow - lastTime;
        for(var i=0; i<stars.length; i++)
        {
            stars[i].animate(elapsed);
        }
        if(elapsed>0)
        {
            fps += (1000. / elapsed - fps) / fpsFilter;
        }
    }
    lastTime = timeNow;
}

function drawFPS()
{
    var counter = document.getElementById("fpscounter");
    counter.innerHTML = fps.toFixed(1) + " fps";
}

var explosionForce = 0.;
var explosionImpulse = 0;
const explosionImpulseMax = 90;
var reboundDelay = 0; 
var reboundDelayMax = 90;
function explosionUpdate()
{
    if(explosionImpulse == explosionImpulseMax)
    {
        explosionForce = 0.05;
        explosionImpulse -= 1;
        reboundDelay = reboundDelayMax
    }
    else if(explosionImpulse > 0)
    {
        explosionImpulse -= 1;
        explosionForce *= 1 + 0.7 * (Math.pow(explosionImpulse / explosionImpulseMax, 4.5));
    }
    else if(explosionImpulse == 0 && reboundDelay > 0)
    {
        reboundDelay -= 1;
    }
    else
    {
        explosionForce *= 0.98;
    }
}


function tick()
{
    requestAnimationFrame(tick);
    handleKeys();
    drawScene();
    animate();
    explosionUpdate();
}


function webGLStart()
{
    var canvas = document.getElementById("canvas");
    initGL(canvas);
    initShaders();
    initBuffers();
    initTexture();
    initWorldObjects(500);

    gl.clearColor(0., 0., 0., 1.);

    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    canvas.addEventListener('click', handleClick, true);

    setInterval(drawFPS, 500);

    tick();
}