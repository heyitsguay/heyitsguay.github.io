let canvas;
let ctx;
let textarea;
let drawButton;
let clearButton;
let code;

let playerX;
let playerY;
let pxt;
let pyt;
let offsetYt;
let pxSeed = Math.random();
let pySeed = Math.random();

let X;
let Y;
let w;
let h;

$(document).ready(main);

let ftext;
function f(x) {
    let scope = {x: x};
    let fx;
    try {
        fx = math.eval(ftext, scope);
    }
    catch(error) {
        drawing = false;
        cancelAnimationFrame(requestId);
    }
    return math.eval(ftext, scope);
}

function W(coord) {
    let x = coord[0];
    let y = coord[1];
    let xt = w * (x / X - 0.5);
    let yt = h * (0.5 - y / Y);
    return [xt, yt];
}

function S(coord) {
    let xt = coord[0];
    let yt = coord[1];
    let x = X * (0.5 + xt / w);
    let y = Y * (0.5 - yt / h);
    return [x, y];
}

function main() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext("2d");
    textarea = document.getElementById('code');
    drawButton = document.getElementById('draw');
    clearButton = document.getElementById('clear');
    code = textarea.value;

    drawButton.addEventListener('click', drawEvent);

    clearButton.addEventListener('click', clearEvent);

    setupWorld();
}

let requestId;
function animate() {
    requestId = requestAnimationFrame(animate);

    if (xtNow < w / 2 && totalLength < maxLength) {
        draw();
    }
}

let drawing = false;
function drawEvent() {
    if (!drawing) {
        ftext = textarea.value;
        offsetYt = pyt - f(pxt);
        totalLength = 0;
        setupWorld();
        animate();
        drawing = true;
    }
}

function clearEvent() {
    if (drawing) {
        cancelAnimationFrame(requestId);
        drawing = false;
        setupWorld();
    }
}

let xtNow, ytNow;
let xNow, yNow;
let dxt = 0.0003;
let targetLength = 0.15;
let maxLength = 180;
let totalLength;
function draw() {

    let xtLast = xtNow;
    let ytLast = ytNow;

    let xLast = xNow;
    let yLast = yNow;

    ctx.beginPath();
    ctx.moveTo(xLast, yLast);

    let segLength = 0;

    while (segLength < targetLength) {
        xtNow = xtLast + dxt;
        ytNow = f(xtNow);

        segLength += Math.sqrt(Math.pow((xtNow - xtLast), 2) +
                               Math.pow((ytNow - ytLast), 2));

        [xNow, yNow] = S([xtNow, ytNow + offsetYt]);

        ctx.lineTo(xNow, yNow);

        xtLast = xtNow;
        ytLast = ytNow;
    }
    ctx.stroke();
    ctx.closePath();
    totalLength += segLength;
}

function setupWorld() {
    X = canvas.width;
    Y = canvas.height;

    w = 20;
    h = w * Y / X;

    playerX = 10 + 80 * pxSeed;
    playerY = 50 + (Y - 100) * pySeed;

    [pxt, pyt] = W([playerX, playerY]);

    xtNow = pxt;
    ytNow = pyt;
    [xNow, yNow] = S([xtNow, ytNow]);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#222222';
    ctx.strokeStyle = '#222222';

    // Draw a circle at the player's position
    ctx.beginPath();
    ctx.arc(playerX, playerY, 5, 0, 2*Math.PI);
    ctx.fill();

    // X axis
    let x0 = -w / 2;
    let x1 = w / 2;
    let xv0 = S([x0, 0]);
    let xv1 = S([x1, 0]);
    ctx.beginPath();
    ctx.moveTo(xv0[0], xv0[1]);
    ctx.lineTo(xv1[0], xv1[1]);
    ctx.stroke();
    ctx.closePath();

    // Y axis
    let y0 = -h / 2;
    let y1 = h / 2;
    let yv0 = S([0, y0]);
    let yv1 = S([0, y1]);
    ctx.beginPath();
    ctx.moveTo(yv0[0], yv0[1]);
    ctx.lineTo(yv1[0], yv1[1]);
    ctx.stroke();
    ctx.closePath();

}
