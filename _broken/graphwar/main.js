// TODO: Rewrite draw() as in plan

let canvas;
let ctx;
let textarea;
let drawButton;
let resetButton;

let playerX;
let playerY;
let playerXt;
let playerYt;
let playerRt = 0.2;
let offsetYt;
let pxSeed = Math.random();
let pySeed = Math.random();

let obstacleColor = '#774b5d';
let rObstacle = 119;
let gObstacle = 75;
let bObstacle = 93;

let holeRt = 0.5;

let backgroundColor = '#ffffff';

let X;
let Y;
let w;
let h;
let dt;

let doPathUpdate = false;

let ftext;
function f(x) {
    let scope = {x: x};
    let fx;
    try {
        fx = math.eval(ftext, scope);
    }
    catch(error) {
        return null;
    }
    return fx;
}

$(document).ready(function() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext("2d");
    textarea = document.getElementById('code');
    drawButton = document.getElementById('draw');
    resetButton = document.getElementById('reset');

    drawButton.addEventListener('click', drawEvent);

    resetButton.addEventListener('click', resetEvent);
    init();
});

function init() {

    X = canvas.width;
    Y = canvas.height;

    w = 20.5;
    h = w * Y / X;
    dt = X / w;

    playerX = 10 + 80 * pxSeed;
    playerY = 50 + (Y - 100) * pySeed;

    [playerXt, playerYt] = W([playerX, playerY]);

    holeData = [];

    genObstacles(15, 0.25, 0.25);

    resetWorld();

    animate();
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
            let dToPlayer = dist([xt, yt], [playerXt, playerYt]);
            obstaclePlaced = (dToPlayer > rt + playerRt + 2);
        }
        obstacleData.push([xt, yt, rt]);
    }
}

function resetWorld() {

    doPathUpdate = false;

    holeData = [];
    pathCoordsT = [];

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawObstacles();
    drawHoles();
    drawBackground();

}

function animate() {
    update();
    draw();
    requestAnimationFrame(animate);
}

function update() {
    if (doPathUpdate) {
        updatePath();
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

let holeData;
function addHole(xt, yt, rt) {
    holeData.push([xt, yt, rt]);
}

function drawHoles() {
    ctx.fillStyle = backgroundColor;
    ctx.strokeStyle = backgroundColor;
    for (let tri of holeData) {
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

function drawEvent() {
    if (!doPathUpdate) {
        pathCoordsT = [[playerXt, playerYt]];
        doPathUpdate = true;
    }
}

function resetEvent() {
        resetWorld();
}

let pathCoordsT;
let dxt = 0.0003;
let targetLength = 0.15;
let maxLength = 180;
let totalLength;
function updatePath() {
    let xtLast, ytLast;
    [xtLast, ytLast] = pathCoordsT[pathCoordsT.length - 1];

    let segLength = 0;

    let keepGoing = true;

    while (keepGoing) {
        let xtNow = xtLast + dxt;
        let ytNow = f(xtNow);
        if (ytNow === null) {
            keepGoing = false;
            doPathUpdate = false;
        }
        else {
            let newLength = dist([xtLast, ytLast], [xtNow, ytNow]);
            segLength += newLength;
            totalLength += newLength;


            pathCoordsT.push([xtNow, ytNow]);

            let collided = collisionCheck();
            if (collided) {
                addHole(xtNow, ytNow + offsetYt, holeRt);
            }

            doPathUpdate = !collided &&
                           xtNow < w / 2 &&
                           totalLength < maxLength;
            keepGoing = doPathUpdate && segLength < targetLength;
        }
    }

}
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
            addHole(xtNow, ytNow, holeRt);
            drawObstacles();
            drawHoles();
            drawBackground();
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

        ctx.font = '12px serif';
        ctx.fillText(xt.toString(), x1 - 6, y1 + 12);
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

        if (yt !== 0) {
            ctx.font = '12px serif';
            ctx.fillText(yt.toString(), x1 + 10, y1 + 6);
        }
    }
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

function Spath(coord) {
    return S([coord[0], coord[1] + offsetYt]);
}

function dist(x0, x1) {
    return Math.sqrt(Math.pow(x0[0] - x1[0], 2) +
        Math.pow(x0[1] - x1[1], 2));
}
