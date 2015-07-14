const TPI = 2 * Math.PI;

// World (and canvas) size.
var xWorld;
var yWorld;

// WebGL context.
var gl;

// Quadtree.
var quadtree;

// Point radius (in pixels, for collision purposes).
var rPoint = 4;

// -------------------------------------------------------------------------------------------------------------------//
function startup() {
    // Set canvas size.
    xWorld = window.innerWidth;
    yWorld = window.innerHeight;
    var canvas = $('#canvas');
    canvas[0].width = xWorld;
    canvas[0].height = yWorld;
    canvas.css({'left':'0', 'width':'100%', 'top':'0', 'height':'100%'});

    // Get canvas WebGL context
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    // Initialize quadtree
    quadtree = new Quadtree({
        x: 0,
        y: 0,
        width: xWorld,
        height: yWorld
    });

}

// -------------------------------------------------------------------------------------------------------------------//
function Point(xc, yc) {
    // Each Segment is made of many Points - (x,y) values with collision radii r that are not drawn.
    this.xc = xc;
    this.yc = yc;
    this.r = rPoint;

    // Bounding box info
    this.x0 = this.xc - this.r;
    this.y0 = this.yc - this.r;
    this.x1 = this.x0 + 2 * this.r;
    this.y1 = this.y0 + 2 * this.r;
}



// -------------------------------------------------------------------------------------------------------------------//
function mod(m, n) {
    // Modulo operation that returns only nonnegative numbers.
    return ((m % n) + n) % n;
}

// -------------------------------------------------------------------------------------------------------------------//
function constrain(x, xmin, xmax) {
    return Math.min(xmax, Math.max(xmin, x));
}

