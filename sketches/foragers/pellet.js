var pelletID = 0;

function Pellet(x, y, heat, lifetime)
{
    this.type = 'pellet';
    this.id = pelletID;
    pelletID += 1;
    this.x = (typeof x !== 'undefined')? x : 2 * Math.random() - 1;
    this.y = (typeof y !== 'undefined')? y : 2 * Math.random() - 1;
    this.heat = (typeof heat !== 'undefined')? heat : Math.random() * 4;
    this.size = 10.0 / worldX;
    this.w = this.size;
    this.h = this.size;
    this.color = vec4.fromValues(1, 0.93, 0.93, 1.0);

    // Center and radius-squared used for collision detection
    this.xc = this.x + this.w * 0.5;
    this.yc = this.y + this.h * 0.5;
    this.rad2 = Math.pow(0.5 * (this.w + this.h), 2);

    // Vertex locations (fixed).
    this.vert0 = vec2.fromValues(this.x,this.y);
    this.vert1 = vec2.fromValues(this.x, this.y + this.h);
    this.vert2 = vec2.fromValues(this.x + this.w, this.y);
    this.vert3 = vec2.fromValues(this.x, this.y + this.h);
    this.vert4 = vec2.fromValues(this.x + this.w, this.y);
    this.vert5 = vec2.fromValues(this.x + this.w, this.y + this.h);

    // Lifetime variables
    this.lifetime = !(lifetime == null) ? lifetime : 60000;
    this.life0 = 1 / this.lifetime;
    this.lifeleft = this.life0 * this.lifetime;
}

// Track the number of Pellets that have already updated in this frame,
// for proper value placement in the various arrays.
var pelletCount = 0;
Pellet.prototype.draw = function()
{
    // Update vertex position Float32Array.
    var idx0 = pelletCount * 12;
    var arrP = attributeArrays.a_pposition.data;
    arrP[idx0]    = this.vert0[0]; arrP[idx0+1]  = this.vert0[1];
    arrP[idx0+2]  = this.vert1[0]; arrP[idx0+3]  = this.vert1[1];
    arrP[idx0+4]  = this.vert2[0]; arrP[idx0+5]  = this.vert2[1];
    arrP[idx0+6]  = this.vert3[0]; arrP[idx0+7]  = this.vert3[1];
    arrP[idx0+8]  = this.vert4[0]; arrP[idx0+9]  = this.vert4[1];
    arrP[idx0+10] = this.vert5[0]; arrP[idx0+11] = this.vert5[1];

    // Update vertex heat Float32Array.
    updateArray(attributeArrays.a_pheat.data, this.heat, pelletCount, 6, 1);

    // Update vertex lifeleft Float32array.
    updateArray(attributeArrays.a_plifeleft.data, this.lifeleft, pelletCount, 6, 1);

    // Update vertex color Float32Array.
    updateArray(attributeArrays.a_pcolor.data, this.color, pelletCount, 6, 4);

    pelletCount += 1;
};