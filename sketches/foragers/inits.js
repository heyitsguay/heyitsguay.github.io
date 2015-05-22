var successSize = false;
var successGL = false;
var successForagers = false;
var successPellets = false;
var successQuadtree = false;
var successShaderPrograms = false;
var successFloatBuffers = false;
var successBuffers = false;
var initialized = false;


$(window).resize(resizeWindow);

var firstTime;
function webGLStart() {
    setInterval(changeRands, 250);
    setInterval(addPellet, 2000);
    setInterval(writeFPS, 500);
    firstTime = true;
    qualityChange();
}

function resizeWindow() {
    foragers = [];
    pellets = [];
    sps = {};
    floatBuffers = {};

    var canvas = document.getElementById("canvas");

    successSize = updateSize(canvas);

    //successGL = initGL(canvas);

    successForagers = initForagers();

    successPellets = initPellets();

    successQuadtree = initQuadtree();

    successBuffers = initBuffers();

    successShaderPrograms = initShaderPrograms();

    successFloatBuffers = initFloatBuffers();

    initialized = true;

    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    if (firstTime) {
        changeRands();
        tick();
        firstTime = false;
    }
}

function updateSize(canvas) {
    var cw = window.innerWidth;
    var $cw = cw.toString() + 'px';
    var ch = window.innerHeight;
    var $ch = ch.toString() + 'px';
    if(xstretch && ystretch) {
        worldX = Math.ceil(canvasScale * cw);
        worldY = Math.ceil(canvasScale * ch);

        $(canvas).css({'left':'0', 'width':'100%', 'top':'0', 'height':'100%'});
    }
    else if(ystretch) {
        worldX = worldY = Math.ceil(canvasScale * ch);

        var cl = Math.floor((cw - ch) / 2);
        var $cl = cl.toString() + 'px';

        $(canvas).css({'left':$cl, 'width':$ch, 'top':'0', 'height':'100%'});
    }
    else if(xstretch)
    {
        worldX = worldY = Math.ceil(canvasScale * cw);

        var ct = Math.floor((ch - cw) / 2);
        var $ct = ct.toString() + 'px';

        $(canvas).css({'left':'0', 'width':'100%', 'top':$ct, height:$cw })
    }
    else {
        worldX = worldY = Math.ceil(canvasScale * Math.min(cw, ch));

        $cw = worldX.toString() + 'px';
        $ch = worldY.toString() + 'px';

        cl = Math.floor((window.innerWidth - worldX) / 2);
        $cl = cl.toString() + 'px';
        ct = Math.floor((window.innerHeight - worldY) / 2);
        $ct = ct.toString() + 'px';

        $(canvas).css({'left':$cl, 'width':$cw, 'top':$ct, 'height':$ch});
    }
    canvas.width = worldX;
    canvas.height = worldY;
    texX = Math.pow(2, Math.ceil(Math.log2(worldX)));
    texY = Math.pow(2, Math.ceil(Math.log2(worldY)));

    //var left = window.innerWidth * 0.5;
    //var strleft = (left.toFixed(0)).toString() + 'px';

    var right = window.innerWidth - 270;
    var rightStr = right.toString() + 'px';
    $('#title').css({'left': '10px', 'top': '10px'});
    $('#fpscounter').css({'left': '10px', 'top': '55px'});
    $('#settings').css({'left':'10px', 'top':'90px'});
    $('#checkboxes').css({'left': '10px', 'top': '180px'});
    $('#table-sliders').css({'left': '10px', 'top': '250px'});
    $('#instructions').css({'left': rightStr, 'top': '85px'});

    initGL(canvas);

    return true;
}

function initGL(canvas)
{
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    //var rawgl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    //gl = WebGLDebugUtils.makeDebugContext(rawgl, undefined, validateNoneOfTheArgsAreUndefined);
    initGLVars();
    return true;
}

function initGLVars()
{
    // Aspect ratio matrix values.
    armat[0] = 2/worldX;
    armat[3] = 2/worldY;

    heatMap = new Float32Array(worldX * worldY * 4);

    attributeArrays = {
        a_fposition: {glvar: 'a_position', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 2, dynamic: true},
        a_fheat: {glvar: 'a_heat', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 1, dynamic: true},
        a_flifeleft: {glvar: 'a_lifeleft', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 1, dynamic: true},
        a_fcolor: {glvar: 'a_color', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 4, dynamic: true},
        a_pposition: {glvar: 'a_position', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 2, dynamic: false},
        a_pheat: {glvar: 'a_heat', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 1, dynamic: false},
        a_plifeleft: {glvar: 'a_lifeleft', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 1, dynamic: false},
        a_pcolor: {glvar: 'a_color', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 4, dynamic: false},
        a_sposition: {glvar: 'a_position', data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 2, dynamic: false}
    };

    heatscale = 1;//parseFloat(document.getElementById("range-heatscale").value);
    // Initial uniform variable values
    var cdiff0 = 0.1666666 * parseFloat(document.getElementById("range-cdiff").value);
    var cdecay0 = 1 - Math.pow(2, -15 + parseFloat(document.getElementById("range-cdecay").value));
    var heatH0 = parseFloat(document.getElementById("range-heatH").value);
    var fval = parseFloat(document.getElementById("range-Hgate").value);
    var Hgate0 = 0.05 * (Math.log(1 + 0.2 * fval) + (fval >= 30) * 0.2 * (fval - 30));
    //fval = parseFloat(document.getElementById("range-Sgate").value);
    //var Sgate0 = 0.005 * (Math.log(1 + 0.04 * fval) + (fval >= 70) * 0.1 * (fval - 70));

    uniformValues = {
        u_dst: {data: [1 / texX, 1 / texY], type: gl.FLOAT_VEC2},
        u_cdiff: {data: cdiff0, type: gl.FLOAT},
        u_cdecay: {data: cdecay0, type: gl.FLOAT},
        u_heatH: {data: heatH0, type: gl.FLOAT},
        u_Hgate: {data: Hgate0, type: gl.FLOAT},
        //u_Sgate: {data: Sgate0, type: gl.FLOAT},
        s_heat: {data: 0, type: gl.INT},
        s_entity: {data: 1, type: gl.INT}
    };
}

function initForagers()
{
    var nforagers = 2;
    for(var i=0; i<nforagers; i++)
    {
        foragers.push(new Forager());
    }

    player = new Forager(0, 0, 500, 500, Math.PI/2, 1, null, 1, 0, 0);
    player.player = true;
    player.immortal = true;
    foragers.push(player);
    return true;
}

function initPellets()
{
    var npellets = 1;
    for(var i=0; i<npellets; i++)
    {
        pellets.push(new Pellet());
    }
    return true;
}

function initQuadtree()
{
    var args = {
        x: -1,
        y: -1,
        w: 2,
        h: 2,
        maxChildren: 5
    };

    tree = QUAD.init(args);
    return true;
}

function initBuffers()
{
    // Make sure initForagers has successfully completed first.
    if(!successForagers)
    {
        return false;
    }

    // Initialize attribute array data.
    attributeArrays.a_fposition.data = new Float32Array(maxForagers * 6);

    attributeArrays.a_fheat.data = new Float32Array(maxForagers * 3);

    attributeArrays.a_flifeleft.data = new Float32Array(maxForagers * 3);

    attributeArrays.a_fcolor.data = new Float32Array(maxForagers * 12);

    attributeArrays.a_pposition.data = new Float32Array(maxPellets * 12);

    attributeArrays.a_pheat.data = new Float32Array(maxPellets * 6);

    attributeArrays.a_plifeleft.data = new Float32Array(maxPellets * 6);

    attributeArrays.a_pcolor.data = new Float32Array(maxPellets * 24);

    attributeArrays.a_sposition.data = new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]);
    // Set screen position vertices.
    //var xs = 2 * worldX / texX - 1;
    //var ys = 2 * worldY / texY - 1;
    //attributeArrays.a_sposition.data = new Float32Array([-1, -1, -1, ys, xs, -1, xs, ys]);

    //for(var i=0; i<attributeArrays.length; i++)
    var akeys = Object.keys(attributeArrays);
    for(var i=0; i<akeys.length; i++)
    {
        var att = attributeArrays[akeys[i]];
        att.buffer = gl.createBuffer();
        gl.bindBuffer(att.type, att.buffer);
        var drawHint;
        if(att.dynamic)
        {
            drawHint = gl.DYNAMIC_DRAW;
        }
        else
        {
            drawHint = gl.STATIC_DRAW;
        }

        gl.bufferData(att.type, att.data, drawHint);
    }
    return true;

}

function initShaderPrograms()
{
    // Make sure initBuffers was successful first.
    if(!successBuffers)
    {
        return false;
    }

    // Create the shader programs
    for(var i=0; i<spIds.length; i++)
    {
        sps[spIds[i]] = new ShaderProgram(spIds[i]);
    }
    return true;
}

function initFloatBuffers()
{
    for(var i=0; i<floatBufferIds.length; i++)
    {
        floatBuffers[floatBufferIds[i]] = new FloatBuffer(floatBufferIds[i]);
    }
    return true;

}