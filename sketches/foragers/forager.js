var foragerID = 0;

function Forager(x, y, heading, heat, vr, vth)
{
    this.type = 'forager';
    this.id = foragerID;
    foragerID += 1;
    this.xc = (typeof x !== 'undefined')? x : 1.8 * Math.random() - 0.9;
    this.yc = (typeof y !== 'undefined')? y : 1.8 * Math.random() - 0.9;
    this.dx = 0;
    this.dy = 0;
    this.dr = (typeof vr !== 'undefined')? vr : 1.1 * Math.random() + 0.05;
    this.th = (typeof heading !== 'undefined')? heading : Math.random() * 2 * Math.PI; // Note: a heading of 0 is due east
    this.dth = (typeof vth !== 'undefined') ? vth : 0;
    this.heat = (typeof heat !== 'undefined')? heat : Math.random() * 2;
    this.dh = 0;
    this.size = 12.0 / worldX;
    this.color = vec4.fromValues(Math.random(), Math.random(), Math.random(), 1.0);

    // Vertex locations relative to a center (0,0)
    this.vert0 = vec2.fromValues(-ISQRT2 * this.size, ISQRT2 * this.size);
    this.vert1 = vec2.fromValues(1.6 * this.size, 0);
    this.vert2 = vec2.fromValues(-ISQRT2 * this.size, -ISQRT2 * this.size);
    // Rotated vertex locations
    this.tvert0 = vec2.create();
    this.tvert1 = vec2.create();
    this.tvert2 = vec2.create();

    // Stuff necessary for the quadtree
    this.x = this.xc - ISQRT2 * this.size;
    this.y = this.yc - ISQRT2 * this.size;
    this.w = SQRT2 * this.size;
    this.h = SQRT2 * this.size;

    // Radius-squared used for collision detection
    this.rad2 = this.size * this.size;

    // How bouncy the Forager is.
    this.bounce = 1.5;

    // Use to keep track of collisions
    this.alreadyCollided = false;

    // Impulse imparted by a collision in the last frame
    this.dxcollide = 0;
    this.dycollide = 0;
}


var headingMatrix = mat2.create();

Forager.prototype.draw = function()
{
    // Set heading rotation matrix.
    mat2.identity(headingMatrix);
    mat2.rotate(headingMatrix, headingMatrix, -this.th);

    vec2.transformMat2(this.tvert0, this.vert0, headingMatrix);
    vec2.transformMat2(this.tvert1, this.vert1, headingMatrix);
    vec2.transformMat2(this.tvert2, this.vert2, headingMatrix);

    // Update vertex position Float32Array
    var idx0 = this.id * 6;
    var arrP = attributeArrays.a_fposition.data;
    arrP[idx0]   = this.xc + this.tvert0[0];
    arrP[idx0+1] = this.yc + this.tvert0[1];
    arrP[idx0+2] = this.xc + this.tvert1[0];
    arrP[idx0+3] = this.yc + this.tvert1[1];
    arrP[idx0+4] = this.xc + this.tvert2[0];
    arrP[idx0+5] = this.yc + this.tvert2[1];

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
    this.dx = dt * this.dr * Math.cos(this.th) + this.dxcollide;
    this.dy = dt * this.dr * Math.sin(this.th) + this.dycollide;

    var dh = dt * this.dh;
    var d2h = dt * fh;
    var d2r = dt * fr;
    var d2th = dt * fth;

    this.xc += dt * this.dx;
    if(this.xc > 1)
    {
        this.xc -= 2;
    }
    if(this.xc < -1)
    {
        this.xc += 2;
    }
    this.yc += dt * this.dy;
    if(this.yc > 1)
    {
        this.yc -= 2;
    }
    if(this.yc < -1)
    {
        this.yc += 2;
    }

    this.dxcollide = 0;
    this.dycollide = 0;
    this.alreadyCollided = false;

    this.x = this.xc - ISQRT2 * this.size;
    this.y = this.yc - ISQRT2 * this.size;

    this.heat += dh;
    this.dh += d2h;

    // maxfv defined in main.js
    this.dr = Math.min(maxfdr, Math.max(-maxfdr, this.dr + d2r));
    this.dth = Math.min(maxfdth, Math.max(-maxfdth, this.dth + d2th));

};