$(document).ready(onReady);
$('#thebutton').click(onClick);

var canvas_der, ctx_der;
var canvas_app, ctx_app;

var coinFill = 'rgba(212, 225, 224, 1)';
var coinStroke = 'rgba(32, 32, 32, 1)';

var cWidth, cHeight;

var rDemo = 53;

function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
}

function onClick() {
    var a = parseFloat($('#ain').val());
    var n = parseInt($('#nin').val());
    if (n > 2) {
        var b = drawRing(ctx_app, a, n);
        $('#solution').text(b.toFixed(6));
    }
}

function onReady() {
    if (isMobileDevice()) {
        $('#main').css('width', '100%');
    }
    canvas_der = document.getElementById('derivation-canvas');
    ctx_der = canvas_der.getContext('2d');
    canvas_app = document.getElementById('app-canvas');
    ctx_app = canvas_app.getContext('2d');
    cWidth = canvas_der.width;
    cHeight = canvas_der.height;

    drawThreeCoins(ctx_der);
    onClick();
}

function drawRing(ctx, a0, n) {
    ctx.fillStyle = 'rgba(192, 192, 197, 1)';
    ctx.fillRect(0, 0, cWidth, cHeight);
    function f(b) {
        return 2*b*b - (a0+b)*(a0+b)*(1 - Math.cos(2 * Math.PI / n));
    }
    // var b0 = uniroot(f, 0, 100*a0, 1e-8, 10000);
    var b0 = brent(0, 1000, f, 1e-8);
    var x0 = cWidth / 2;
    var y0 = cHeight / 2;
    drawCircle(ctx, x0, y0, a0);
    for (var i = 0; i < n; i++) {
        var t = i * 2 * Math.PI / n;
        drawOffsetCircle(ctx, y0, x0, b0, a0, t);
    }
    return b0;
}

function drawCircle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = coinFill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = coinStroke;
    ctx.stroke();
}

function drawPoint(ctx, x, y, r) {
    ctx.fillStyle = 'black';
    ctx.fillRect(x - r/2, y - r/2, r, r);
}

/**
 * Draw a circle of radius r at a point P that is distance d from
 * (x,y), such that the line between (x, y) and P makes angle t
 * with the positive x axis.
 * @param ctx
 * @param x
 * @param y
 * @param r
 * @param d
 * @param t
 */
function drawOffsetCircle(ctx, y, x, r, d, t) {
    d = (typeof d !== 'undefined')? d : 0;
    t = (typeof t !== 'undefined')? t : 0;
    t = t || 0;
    var xPoint = x + (d + r) * Math.cos(t);
    var yPoint = y + (d + r) * Math.sin(t);
    drawCircle(ctx, xPoint, yPoint, r);
}

function drawThreeCoins(ctx) {
    var xc = cWidth / 2;
    var yc = cHeight / 2;
    var rDemo2 = 0.76642 * rDemo;
    var tDemo = 2 * Math.PI / 7;

    ctx.fillStyle = 'rgba(192, 192, 197, 1)';
    ctx.fillRect(0, 0, cWidth, cHeight);
    drawCircle(ctx, xc, yc, rDemo);
    for(var j = 0; j < 7; j++) {
        var t = j * 2 * Math.PI / 7;
        drawOffsetCircle(ctx, yc, xc, rDemo2, rDemo, t)
    }
    // drawOffsetCircle(ctx, xc, yc, rDemo2, rDemo, 0);
    // drawOffsetCircle(ctx, xc, yc, rDemo2, rDemo, tDemo);

    var ct = Math.cos(tDemo);
    var st = Math.sin(tDemo);

    var x01 = xc + rDemo; var y01 = yc;
    var x1 = xc + rDemo + rDemo2; var y1 = yc;
    var x02 = xc + rDemo * ct; var y02 = yc + rDemo * st;
    var x2 = xc + (rDemo + rDemo2) * ct;
    var y2 = yc + (rDemo + rDemo2) * st;
    var x12 = (x1 + x2) / 2;
    var y12 = (y1 + y2) / 2;

    var points = [[xc, yc], [x01, y01], [x1, y1], [x02, y02], [x2, y2], [x12, y12]];
    for (var i = 0; i < points.length; i++) {
        var point = points[i];
        drawPoint(ctx, point[0], point[1], 4);
    }

    ctx.beginPath();
    ctx.moveTo(xc, yc);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(xc, yc);
    ctx.stroke();

    var xl001 = (xc + x01) / 2 ;
    var yl001 = (yc + y01) / 2 - 3;

    var xl011 = (x01 + x1) / 2;
    var yl011 = (y01 + y1) / 2 - 3;

    var xl112 = (x1 + x12) / 2 + 4;
    var yl112 = (y1 + y12) / 2 + 4;

    var xl122 = (x12 + x2) / 2 + 4;
    var yl122 = (y12 + y2) / 2 + 4;

    var xl022 = (x02 + x2) / 2 - 8;
    var yl022 = (y02 + y2) / 2 + 5;

    var xl002 = (xc + x02) / 2 - 8;
    var yl002 = (yc + y02) / 2 + 5;

    ctx.fillText('a', xl001, yl001);
    ctx.fillText('b', xl011, yl011);
    ctx.fillText('b', xl112, yl112);
    ctx.fillText('b', xl122, yl122);
    ctx.fillText('b', xl022, yl022);
    ctx.fillText('a', xl002, yl002);

    ctx.beginPath();
    ctx.arc(xc, yc, 15, 0, tDemo);
    ctx.strokeStyle = 'black';
    ctx.stroke();

    var xa = xc + 20 * Math.cos(Math.PI / 7);
    var ya = yc + 20 * Math.sin(Math.PI / 7) + 4;
    ctx.fillText('θ', xa, ya);
}
