/**
 * A Vine grows across the canvas, according to some specifications. Each Vine is made up of Segments which grow in
 * succession.
 * @param {float} x0 - x coordinate of the Vine's starting point.
 * @param {float} y0 - y coordinate of the Vine's starting point.
 * @param {float} th0 - The first Segment's initial growth orientation.
 * @param {float} hwidth - Vine half-width.
 * @param {int} numSegments - Number of Segments in the Vine.
 * @param {float} segmentLength - Length of each Segment.
 * @param {int} linesPerSegment - Each Segment is subdivided into this many Lines i.e. (linesPerSegment + 1) Points.
 * @param {float} segmentLifespan - Segment lifespan (in seconds).
 * @param {float} c_H0 - The color of each Line in this Vine varies in hue value between c_H0 and c_H1.
 * @param {float} [c_H1 = c_H0] - Upper bound of the range of hue values this Vine's Lines take.
 * @constructor
 */
function Vine(x0, y0, th0, hwidth, numSegments, segmentLength, linesPerSegment, segmentLifespan, c_H0, c_H1) {
    this.x0 = x0;
    this.y0 = y0;
    this.th0 = th0;
    this.hwidth = hwidth;
    this.numSegments = numSegments;
    this.segmentLength = segmentLength;
    this.linesPerSegment = linesPerSegment;
    this.segmentLifespan = segmentLifespan;
    this.c_H0 = c_H0;
    this.c_H1 = (c_H1 != null)? c_H1 : this.c_H0;

    // Length of each Line in each Segment.
    this.lineLength = this.segmentLength / this.linesPerSegment;

    // Contains the Segments that make up the Vine.
    this.segments = [];

    // Increments each time a new Segment is created.
    this.segCount = 0;

    // Maximum turn rate of a growing Segment's leading tip, in radians/frame.
    this.dthMax = TPI / 60;

    // Maximum second derivative of the Segment's leading Line's orientation.
    this.d2thMax = TPI / 30;

}

/**
 * Create a new Segment and start it growing.
 */
Vine.prototype.newSegment = function() {
    this.segCount += 1;

    if(this.segCount == 1) {
        // First Segment, start up a bit differently.
        //this.segments.push(new Segment(this, this.x0, this.y0, this.th0, this.hwidth, this.segmentLifespan, this.linesPerSegment, ))

    }
};