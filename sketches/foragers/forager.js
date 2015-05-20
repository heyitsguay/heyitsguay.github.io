//const SQRT2 = 1.414214;
const ISQRT2 = 0.707107;

const wander = 0.9;
var newestID = 0;
function Forager(x, y, heading, heat, vr, vth)
{
    this.id = newestID;
    newestID += 1;
    this.x = x || 1.8 * Math.random() - 0.9;
    this.y = y || 1.8 * Math.random() - 0.9;
    this.dx = 0;
    this.dy = 0;
    this.dr = vr || 1.1 * Math.random() + 0.05;
    this.th = heading || Math.random() * 2 * Math.PI; // Note: a heading of 0 is due east
    this.dth = vth || 0;
    this.heat = heat || Math.random() * 2;
    this.dh = 0;
    this.size = 10.0 / worldX;
    this.color = vec4.fromValues(Math.random(), Math.random(), Math.random(), 1.0);
}

var headingMatrix = mat2.create();

Forager.prototype.draw = function()
{
    // Set heading rotation matrix.
    mat2.identity(headingMatrix);
    mat2.rotate(headingMatrix, headingMatrix, -this.th);
    // Figure out vertex locations relative to a center (0,0).
    var vert0 = vec2.fromValues(-ISQRT2 * this.size, ISQRT2 * this.size);
    vec2.transformMat2(vert0, vert0, headingMatrix);

    var vert1 = vec2.fromValues(1.6 * this.size, 0);
    vec2.transformMat2(vert1, vert1, headingMatrix);

    var vert2 = vec2.fromValues(-ISQRT2 * this.size, -ISQRT2 * this.size);
    vec2.transformMat2(vert2, vert2, headingMatrix);

    // Update vertex position Float32Array
    var idx0 = this.id * 6;
    var arrP = attributeArrays.a_fposition.data;
    arrP[idx0]   = this.x + vert0[0];
    arrP[idx0+1] = this.y + vert0[1];
    arrP[idx0+2] = this.x + vert1[0];
    arrP[idx0+3] = this.y + vert1[1];
    arrP[idx0+4] = this.x + vert2[0];
    arrP[idx0+5] = this.y + vert2[1];

    // Update vertex heat Float32Array
    idx0 = this.id * 3;
    var arrH = attributeArrays.a_fheat.data;
    arrH[idx0] = heatscale * this.heat;
    arrH[idx0+1] = heatscale * this.heat;
    arrH[idx0+2] = heatscale * this.heat;

    // Update vertex color Float32Array
    idx0 = this.id * 12;
    var arrC = attributeArrays.a_fcolor.data;
    // Vertex 0
    arrC[idx0]    = this.color[0];
    arrC[idx0+1]  = this.color[1];
    arrC[idx0+2]  = this.color[2];
    arrC[idx0+3]  = this.color[3];
    // Vertex 1
    arrC[idx0+4]  = this.color[0];
    arrC[idx0+5]  = this.color[1];
    arrC[idx0+6]  = this.color[2];
    arrC[idx0+7]  = this.color[3];
    // Vertex 2
    arrC[idx0+8]  = this.color[0];
    arrC[idx0+9]  = this.color[1];
    arrC[idx0+10] = this.color[2];
    arrC[idx0+11] = this.color[3];
};

Forager.prototype.update = function(dt, fh, fr, fth)
{
    this.th = ((this.th) + dt * this.dth) % (2 * Math.PI);
    this.dx = dt * this.dr * Math.cos(this.th);
    this.dy = dt * this.dr * Math.sin(this.th);

    var dh = dt * this.dh;
    var d2h = dt * fh;
    var d2r = dt * fr;
    var d2th = dt * fth;

    this.x += dt * this.dx;
    if(this.x > 1)
    {
        this.x -= 2;
    }
    if(this.x < -1)
    {
        this.x += 2;
    }
    this.y += dt * this.dy;
    if(this.y > 1)
    {
        this.y -= 2;
    }
    if(this.y < -1)
    {
        this.y += 2;
    }


    this.heat += dh;
    this.dh += d2h;

    // maxfv defined in main.js
    this.dr = Math.min(maxfdr, Math.max(-maxfdr, this.dr + d2r));
    this.dth = Math.min(maxfdth, Math.max(-maxfdth, this.dth + d2th));

};