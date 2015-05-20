var successGL = false;
var successForagers = false;
var successShaderPrograms = false;
var successFloatBuffers = false;
var successBuffers = false;
var initialized = false;

function webGLStart()
{
    var canvas = document.getElementById("canvas");

    successGL = initGL(canvas);

    successForagers = initForagers();

    successBuffers = initBuffers();

    successShaderPrograms = initShaderPrograms();

    successFloatBuffers = initFloatBuffers();

    initialized = true;

    setInterval(writeFPS, 500);

    dthrands = changeRands();
    setInterval(function(){dthrands = changeRands();}, 1000);

    tick();
}

//function validateNoneOfTheArgsAreUndefined(functionName, args) {
//    for (var ii = 0; ii < args.length; ++ii) {
//        if (args[ii] === undefined) {
//            console.error("undefined passed to gl." + functionName + "(" +
//                WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
//        }
//    }
//}

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
    attributeArrays = {
        a_fposition: {data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 2, numItems: 0, dynamic: true},
        a_fheat: {data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 1, numItems: 0, dynamic: true},
        a_fcolor: {data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 4, numItems: 0, dynamic: true},
        a_sposition: {data: [], buffer: null, type: gl.ARRAY_BUFFER, itemSize: 2, numItems: 0, dynamic: false}
    };

    uniformValues = {
        u_dst: {data: [1 / texX, 1 / texY], type: gl.FLOAT_VEC2},
        u_cdiff: {data: 0.16, type: gl.FLOAT},
        u_cdecay: {data: 0.999, type: gl.FLOAT},
        u_heatH: {data: 0.09, type: gl.FLOAT},
        s_heat: {data: 0, type: gl.INT},
        s_entity: {data: 1, type: gl.INT}
    };
}

function initForagers()
{
    var nforagers = 20;
    for(i=0; i<nforagers; i++)
    {
        foragers.push(new Forager());
    }
    //foragers.push(new Forager(-0.5, -0.5, 75, 0.0000001));
    //foragers.push(new Forager(0.3, 0, -60, 0.0000004));
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
    attributeArrays.a_fposition.data = new Float32Array(foragers.length * 6);
    attributeArrays.a_fposition.numItems = foragers.length * 3;

    attributeArrays.a_fheat.data = new Float32Array(foragers.length * 3);
    attributeArrays.a_fheat.numItems = foragers.length * 3;

    attributeArrays.a_fcolor.data = new Float32Array(foragers.length * 12);
    attributeArrays.a_fcolor.numItems = foragers.length * 3;

    attributeArrays.a_sposition.data = new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]);
    attributeArrays.a_sposition.numItems = 4;

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