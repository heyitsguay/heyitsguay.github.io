function addForager()
{
    if(foragers.length < maxForagers)
    {
        var newForager = foragersLimbo.pop();
        newForager.build(0, 0, null, null, null, 0.5 - Math.random(), null, 10000000);
        foragers.push(newForager);
    }
}

function removeForager()
{
    if(foragers.length > 1)
    {
        var forager = foragers[0];
        if(forager.player)
        {
            foragersLimbo.push(foragers[1]);
            _.pullAt(foragers, 1);
        }
        else
        {
            foragersLimbo.push(foragers[0]);
            _.pullAt(foragers, 0);
        }
    }
}


// Forager object stuff ----------------------------------------------------------------------------------------------//
//var foragerID = 0;
function Forager(thbias, thbiasStrength, x, y, heading, heat, lifetime, vr, vth) {
    this.build(thbias, thbiasStrength, x, y, heading, heat, lifetime, vr, vth);
}

Forager.prototype.build = function(thbias, thbiasStrength, x, y, heading, heat, size, lifetime, vr, vth) {
    this.type = 'forager';
    //this.id = foragerID;
    //foragerID += 1;
    this.xc = !(x == null)? x : Math.random() * worldX;
    this.yc = !(y == null)? y : Math.random() * worldY;
    this.pc = vec2.fromValues(this.xc, this.yc);
    this.dx = 0;
    this.dy = 0;
    this.dr = !(vr == null)? vr : 100 * Math.random() + 10;
    this.th = !(heading == null) ? heading : Math.random() * TPI; // Note: a heading of 0 is due east
    this.dth = !(vth == null) ? vth : 0;
    this.heat = !(heat == null) ? heat : Math.random() * 2;
    this.dh = 0;
    this.lifetime = !(lifetime == null) ? lifetime : 1 + 60 * Math.random() * 30 ;
    this.life0 = 1 / this.lifetime;
    this.lifeleft = this.life0 * this.lifetime;
    this.size =  (2.4 * escale);
    this.color = vec4.fromValues(0.8,0.4,0.4,0.3);
    // True for the player.
    this.player = false;

    // May be true more generally
    this.immortal = false;
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
    this.bounce = 2;

    // Use to keep track of collisions
    this.alreadyCollided = false;

    // Impulse imparted by a collision in the previous frame.
    //this.dxcollide = 0;
    //this.dycollide = 0;
    this.drcollide = 0;
    this.dthcollide = 0;

    // Foragers will tend to head in this direction
    this.thbias = !(thbias == null) ? thbias : TPI * Math.random();
    this.thbiasStrength = !(thbiasStrength == null)? thbiasStrength : 0.1 * Math.random();

}


var headingMatrix = mat2.create();

var foragerCount = 0;
Forager.prototype.draw = function()
{
    // Set heading rotation matrix.
    mat2.identity(headingMatrix);
    mat2.rotate(headingMatrix, headingMatrix, -this.th);

    vec2.transformMat2(this.tvert0, this.vert0, headingMatrix);
    vec2.transformMat2(this.tvert1, this.vert1, headingMatrix);
    vec2.transformMat2(this.tvert2, this.vert2, headingMatrix);

    vec2.add(this.tvert0, this.tvert0, this.pc);
    vec2.add(this.tvert1, this.tvert1, this.pc);
    vec2.add(this.tvert2, this.tvert2, this.pc);

    // Convert to clip space coordinates.
    this.tvert0 = clipSpace(this.tvert0);
    this.tvert1 = clipSpace(this.tvert1);
    this.tvert2 = clipSpace(this.tvert2);

    // Update vertex position Float32Array
    var idx0 = foragerCount * 6;
    var arrP = attributeArrays.a_fposition.data;
    arrP[idx0]   = this.tvert0[0]; arrP[idx0+1] = this.tvert0[1];
    arrP[idx0+2] = this.tvert1[0]; arrP[idx0+3] = this.tvert1[1];
    arrP[idx0+4] = this.tvert2[0]; arrP[idx0+5] = this.tvert2[1];

    updateArray(attributeArrays.a_fheat.data, this.heat, foragerCount, 3, 1);

    updateArray(attributeArrays.a_flifeleft.data, this.lifeleft, foragerCount, 3, 1);

    // Update vertex color Float32Array
    updateArray(attributeArrays.a_fcolor.data, this.color, foragerCount, 3, 4);

    foragerCount += 1;
};

Forager.prototype.update = function(dt, fh, fr, fth)
{
    // Update lifetime and lifeleft if not immortal.
    if(!this.immortal)
    {
        this.lifetime = Math.max(0, this.lifetime - 1);
        if (this.lifetime < 1) {
            // Die.
            deadForagers.push(this);
        }
        this.lifeleft = this.life0 * this.lifetime;
    }
    else
    {
        this.lifeleft = 1;
    }


    // Heading update.
    this.th = mod((this.th) + dt * (this.dth + this.dthcollide), TPI);

    if(!this.player)
    {
        // Heading bias update
        var dist1 = this.thbias - this.th;
        //var dist2 = TPI - dist1;

        var biasupdate;
        if(Math.abs(dist1) <= Math.PI)
        {
            biasupdate = this.thbiasStrength * dist1;
        }
        else
        {
            biasupdate = this.thbiasStrength * (sign(dist1) * TPI - dist1);
        }

        this.th = mod(this.th + biasupdate, TPI);
    }

    this.dx = dt * (this.dr + this.drcollide) * Math.cos(this.th);
    this.dy = dt * (this.dr + this.drcollide) * Math.sin(this.th);

    var dh = dt * this.dh;
    var d2h = dt * fh;
    var d2r = dt * fr;
    var d2th = dt * fth;

    this.xc += dt * this.dx;
    if(this.xc > worldX)
    {
        this.xc -= worldX
    }
    if(this.xc < 0)
    {
        this.xc += worldX;
    }
    this.yc += dt * this.dy;
    if(this.yc > worldY)
    {
        this.yc -= worldY;
    }
    if(this.yc < 0)
    {
        this.yc += worldY;
    }
    this.pc[0] = this.xc;
    this.pc[1] = this.yc;

    //this.dxcollide = 0;
    //this.dycollide = 0;
    this.alreadyCollided = false;

    this.x = this.xc - ISQRT2 * this.size;
    this.y = this.yc - ISQRT2 * this.size;

    this.heat = Math.max(-maxfheat, Math.min(maxfheat, this.heat + dh));
    this.dh += d2h;

    // maxfv defined in main.js
    this.dr = Math.min(maxfdr, Math.max(-maxfdr, this.dr + d2r));
    this.dth = Math.min(maxfdth, Math.max(-maxfdth, this.dth + d2th));

    this.drcollide *= 0.99;
    this.dthcollide *= 0.8;

};

// Emitter object stuff ----------------------------------------------------------------------------------------------//
function Emitter(x, y, v, vvar, heat, heatvar, lifetime, lifetimevar)
{
    this.x = x;
    this.y = y;
    this.v = !(v == null)? v : 0.5 + Math.random();
    this.vvar = !(vvar == null)? vvar : 0.5;
    this.heat = !(heat == null)? heat : 3 * Math.random();
    this.heatvar = !(heatvar == null)? heatvar : 1;
    this.lifetime = !(lifetime == null)? lifetime : 60 * 30 * Math.random();
    this.lifetimevar = !(lifetimevar == null)? lifetimevar: 60 * 10 * Math.random();
    this.foragers = [];
}