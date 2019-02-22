var successSize = false;
//var successGL = false;
var successForagers = false;
var successPellets = false;
var successQuadtree = false;
var successShaderPrograms = false;
var successFloatBuffers = false;
var successBuffers = false;
var initialized = false;

var heatRange;
//var at1, at2, at3;
function mobileSetup()
{
    // Detect mobile devices
    onMobile = mobileDetect(navigator.userAgent||navigator.vendor||window.opera);
    if(onMobile) {
        heatRange = 255;
    }
    else {
        heatRange = 10000;
    }

    maxfheat = heatRange / 2;
}

var canvasScale, xstretch, ystretch;
function qualityChange(windowSliderInput)
{
    windowSliderInput = !(windowSliderInput == null)? windowSliderInput : false;

    var q1 = $('input[name="q1"]:checked').val();
    var q2 = $('input[name="q2"]:checked').val();

    if(!(q2 === 'window')) {
        if (q1 === 'low') {
            canvasScale = 0.3;
        }
        else if (q1 === 'medium') {
            canvasScale = 0.6;
        }
        else if (q1 === 'high') {
            canvasScale = 0.8;
        }
        else if (q1 === 'best') {
            canvasScale = 1;
        }
    }

    xstretch = false;
    ystretch = false;
    if(q2 === 'half'){
        if(window.innerWidth >= window.innerHeight) {
            ystretch = true;
        }
        else {
            xstretch = true;
        }
    }
    else if(q2 === 'full') {
        xstretch = true;
        ystretch = true;
    }

    resizeWindow();
}

function resizeWindow() {
    foragers = [];
    pellets = [];
    sps = {};
    floatBuffers = {};

    var canvas = document.getElementById("canvas");

    successSize = updateSize(canvas);

    successForagers = initForagers();

    successPellets = initPellets();

    successQuadtree = initQuadtree();

    successBuffers = initBuffers();

    successShaderPrograms = initShaderPrograms();

    successFloatBuffers = initFloatBuffers();

    initialized = true;

    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;

    time0 = lastTime;

    if (firstTime) {
        changeRands();
        if(killTheCanvas) {
            $('#canvas').hide();
            $('#titlediv').html("Could not start the sketch!");
            $('.leftside').hide();
            //$('#instructions').hide();
            //$('#fpscounter').hide();
            //$('#settings').hide();
        }
        //else if(onMobile)
        //{
        //    $('#canvas').hide();
        //    $('#titlediv').html("Mobile devices not currently supported :(");
        //    $('.leftside').hide();
        //}
        else {
            tick();
        }
        firstTime = false;
    }
    else {
        uniformValues['u_size'].data = [worldX, worldY];
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

        $(canvas).css({'left':'0', 'width':'100%', 'top':$ct, 'height':$cw })
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
    texX = Math.pow(2, Math.ceil(Math.log(worldX) / Math.log(2)));
    texY = Math.pow(2, Math.ceil(Math.log(worldY) / Math.log(2)));

    //var left = window.innerWidth * 0.5;
    //var strleft = (left.toFixed(0)).toString() + 'px';

    // Set the instructions CSS top and left properties.
    var right = window.innerWidth - 270;
    var rightStr = right.toString() + 'px';
    $('#instructions').css({'left': rightStr, 'top': '85px'});

    // Give the canvas a border.
    $(canvas).css({'border': '1px solid #222222'});

    // Set the Chrome Experiment badge CSS top and visibility properties.
    var badgetop = window.innerHeight - 60;
    var $badgetop = badgetop.toString() + 'px';
    $('div.badge').css({'top': $badgetop, 'visibility': 'visible'});

    initGL(canvas);

    return true;
}

function initGL(canvas)
{
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    //var rawgl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    //gl = WebGLDebugUtils.makeDebugContext(rawgl, undefined, validateNoneOfTheArgsAreUndefined);
    if(!gl)
    {
        killTheCanvas = true;
    }
    initGLVars();
    return true;
}

function initGLVars()
{
    // Aspect ratio matrix values.
    armat[0] = 2/worldX;
    armat[3] = 2/worldY;

    //heatMap = new Float32Array(worldX * worldY * 4);

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
    escale = parseFloat($('#range-escale').val());
    // Initial uniform variable values
    var cdiff0 = 0.1666666 * parseFloat(document.getElementById("range-cdiff").value);
    var cdecay0 = 1 - Math.pow(2, -15 + parseFloat(document.getElementById("range-cdecay").value));
    var heatH0 = parseFloat(document.getElementById("range-heatH").value);


    uniformValues = {
        u_dst: {data: [1 / texX, 1 / texY], type: gl.FLOAT_VEC2},
        u_size: {data: [worldX, worldY], type: gl.FLOAT_VEC2},
        u_cdiff: {data: cdiff0, type: gl.FLOAT},
        u_cdecay: {data: cdecay0, type: gl.FLOAT},
        u_heatH: {data: heatH0, type: gl.FLOAT},
        u_time: {data: time0, type: gl.FLOAT},
        s_heat: {data: 0, type: gl.INT},
        s_entity: {data: 1, type: gl.INT}
    };
}

currentForagers = 50;
function initForagers()
{
    // Preallocate all potential Foragers to avoid a lot of 'new' commands.
    for(i=0; i<maxForagers+5;i++)
    {
        foragersLimbo.push(new Forager());
    }
    for(var i=0; i<currentForagers; i++)
    {
        addForager();
    }

    player = new Forager(0, 0, worldX / 2, worldY / 2, Math.PI/2, 5, null, 1, 0, 0);
    player.heat = 10;
    player.color[1] = 1.0;
    player.color[3] = 1.0;
    player.player = true;
    player.immortal = true;
    foragers.push(player);
    return true;
}

function initPellets()
{
    for(var i=0; i<maxPellets; i++)
    {
        pelletsLimbo.push(new Pellet());
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

function initFloatBuffers() {
    for(var i=0; i<floatBufferIds.length; i++)
    {
        floatBuffers[floatBufferIds[i]] = new FloatBuffer(floatBufferIds[i]);
    }

    // Set entity and heatmap textures to (0.5,*,*,*) to account for heat offset.
    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers['heat0'].fb);
    gl.viewport(0, 0, texX, texY);
    gl.clearColor(0.5, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers['heat1'].fb);
    gl.viewport(0, 0, texX, texY);
    gl.clearColor(0.5, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, floatBuffers['entity'].fb);
    gl.viewport(0, 0, texX, texY);
    gl.clearColor(0.5, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return true;
}

function mobileDetect(a){
    if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) {
        return true;
    }
}