function Line(x0, y0, x1, y1, hwidth, c_H) {
    // Line segment between (x0,y0) and (x1,y1).
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;

    // Line half-width.
    this.hwidth = hwidth;

    // Line color HSV values.
    this.c_H = c_H;
    this.s = 1;
    this.v = 1;
    // RGB equivalent. Has .r, .g, .b fields.
    this.color = HSVtoRGB(this.c_H, this.s, this.v);

    // set a,b,c values in the equation ax+by+c=0 defining the points lying on this Line.
    this.getabc();

    // Get the vertices of the bounding rectangle
    this.generateVertices();

}

Line.prototype.eval = function(x, y) {
    return this.a * x + this.b * y + this.c;
};

Line.prototype.getabc = function() {
    // Figure out an equation ax+by+c=0 for the line passing through (x0,y0) and (x1,y1). Return the triplet [a,b,c].

    // y = Dy/Dx x + K, where K = y0 - Dy/Dx*x0
    // Dx*y = Dy*x + Dx*b
    // -Dy*x + Dx*y - Dx*b = 0

    var abc = [0,0,0];
    if(this.x0 != this.x1) {
        // If x0 != x1, return a = y0-y1, b = x1-x0, c= (x0-x1)*K.
        var dy = this.y1 - this.y0;
        var dx = this.x1 - this.x0;
        var K = this.y0 - (this.x0 * dy / dx);
        abc = [-dy, dx, -dx*K];
    } else {
        // Line is vertical, of the form x=x0 i.e. x-x0=0.
        abc = [1, 0, -this.x0];
    }
    this.a = abc[0];
    this.b = abc[1];
    this.c = abc[2];
};

Line.prototype.generateVertices = function() {
    // Each Line is drawn as a narrow rectangle. The 2 coordinates on either side of the two Points that create this
    // Line
    var dx = this.b;
    var dy = -this.a;

    // Normalize this vector, then scale by Line hwidth.
    var vnorm = Math.sqrt(dx*dx + dy*dy);
    dx *= this.hwidth / vnorm;
    dy *= this.hwidth / vnorm;

    this.vert0 = [this.x0 - dx, this.y0 - dy];
    this.vert1 = [this.x0 + dx, this.y0 + dy];
    this.vert2 = [this.x1 - dx, this.y1 - dy];
    this.vert3 = [this.x1 + dx, this.y1 + dy];
};