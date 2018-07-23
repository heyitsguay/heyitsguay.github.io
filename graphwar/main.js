let canvas;
let ctx;
let textarea;
let drawButton;
let clearButton;
let code;

let playerX;
let playerY;
let playerRt = 0.2;
let pxt;
let pyt;
let offsetYt;
let pxSeed = Math.random();
let pySeed = Math.random();

let obstacleColor = '#774b5d';
let rObstacle = 119;
let gObstacle = 75;
let bObstacle = 93;

let X;
let Y;
let w;
let h;
let dt;

$(document).ready(main);

let ftext;
function f(x) {
    let scope = {x: x};
    let fx;
    try {
        fx = math.eval(ftext, scope);
    }
    catch(error) {
        stopDrawing();
    }
    return math.eval(ftext, scope);
}

function stopDrawing() {
    drawing = false;
    cancelAnimationFrame(requestId);
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

    X = canvas.width;
    Y = canvas.height;

    w = 20.5;
    h = w * Y / X;
    dt = X / w;

    playerX = 10 + 80 * pxSeed;
    playerY = 50 + (Y - 100) * pySeed;

    [pxt, pyt] = W([playerX, playerY]);

    genObstacles(20, 1., 0.);

    setupWorld();
}

function dist(x0, x1) {
    return Math.sqrt(Math.pow(x0[0] - x1[0], 2) +
                     Math.pow(x0[1] - x1[1], 2));
}

let obstacleData;
function genObstacles(numObstacles, centerBiasX, centerBiasY) {
    let rMin = 0.3;
    let rMax = 1;
    obstacleData = [];

    for (let i = 0; i < numObstacles; ++i) {
        let obstaclePlaced = false;
        let xt, yt, rt;
        while (!obstaclePlaced) {
            xt = biasSample(centerBiasX) * w - w / 2;
            yt = biasSample(centerBiasY) * h - h / 2;
            rt = rMin + (rMax - rMin) * Math.random();
            let dToPlayer = dist([xt, yt], [pxt, pyt]);
            obstaclePlaced = (dToPlayer > rt + playerRt + 2);
        }
        obstacleData.push([xt, yt, rt]);
    }
}

function drawObstacles() {
    ctx.fillStyle = obstacleColor;
    ctx.strokeStyle = obstacleColor;
    for (let tri of obstacleData) {
        let xt = tri[0];
        let yt = tri[1];
        let rt = tri[2];

        let x, y;
        [x, y] = S([xt, yt]);
        let r = rt * dt;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function biasSample(bias) {
    let sample;
    if (Math.random() < bias) {
        // Use the center-biased distribution
        sample = 0;
        for (let n = 0; n < 5; ++n) {
            sample += Math.random();
        }
        sample /= 5;
    } else {
        // Use a uniform distribution
        sample = Math.random();
    }
    return sample;
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
        stopDrawing();
        setupWorld();
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

    let keepGoing = true;

    while (keepGoing) {
        xtNow = xtLast + dxt;
        ytNow = f(xtNow);

        segLength += Math.sqrt(Math.pow((xtNow - xtLast), 2) +
                               Math.pow((ytNow - ytLast), 2));

        [xNow, yNow] = S([xtNow, ytNow + offsetYt]);

        ctx.lineTo(xNow, yNow);

        let collided = collisionCheck();
        if (collided) {
            stopDrawing();
        }

        keepGoing = !collided && segLength < targetLength;

        xtLast = xtNow;
        ytLast = ytNow;
    }
    ctx.stroke();
    ctx.closePath();
    totalLength += segLength;
}

function collisionCheck() {
    let dataNow = ctx.getImageData(xNow, yNow, 1, 1);
    let rNow = dataNow.data[0];
    let gNow = dataNow.data[1];
    let bNow = dataNow.data[2];
    let dColor = Math.abs(rNow - rObstacle) + Math.abs(gNow - gObstacle)
        + Math.abs(bNow - bObstacle);
    return dColor < 5;
}

function setupWorld() {

    xtNow = pxt;
    ytNow = pyt;
    [xNow, yNow] = S([xtNow, ytNow]);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawObstacles();
    drawBackground();

}

function drawBackground() {

    ctx.fillStyle = '#222222';
    ctx.strokeStyle = '#222222';

    let tickSize = 0.1;

    // Draw a circle at the player's position
    ctx.beginPath();
    ctx.arc(playerX, playerY, playerRt * dt, 0, 2*Math.PI);
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
    // Tick marks
    for (let xt = Math.ceil(-w / 2); xt <= Math.floor(w / 2); ++xt) {
        let x0, y0, x1, y1;
        [x0, y0] = S([xt, tickSize]);
        [x1, y1] = S([xt, -tickSize]);

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.closePath();
    }

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
    // Tick marks
    for (let yt = Math.ceil(-h / 2); yt <= Math.floor(h / 2); ++yt) {
        let x0, y0, x1, y1;
        [x0, y0] = S([tickSize, yt]);
        [x1, y1] = S([-tickSize, yt]);

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.closePath();
    }
}
