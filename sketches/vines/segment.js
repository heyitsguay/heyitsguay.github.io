/**
 *
 * @param vine
 * @param x0
 * @param y0
 * @param th0
 * @param hwidth
 * @param lifespan
 * @param numLines
 * @param dthMax
 * @param d2thMax
 * @param pBranch
 * @param avoid
 * @constructor
 */
function Segment(vine, x0, y0, th0, hwidth, lifespan, numLines, dthMax, d2thMax, pBranch, avoid) {
    // Segment parent.
    this.vine = vine;
    this.xnew = x0;
    this.ynew = y0;
    this.xold = 0;
    this.yold = 0;
    this.th = th0;
    this.hwidth = hwidth;
    this.dth = 0;
    this.lifespan = lifespan;
    this.numLines = numLines;
    this.dthMax = dthMax;
    this.d2thMax = d2thMax;
    this.pBranch = pBranch;
    this.avoid = avoid;



    // How many multiples of the growth increment to line search for intersection.
    this.searchLength = 10;

    // Decrements at each update
    this.drawLife = numLines;
    this.life = 1;
    this.dlife = 1 / this.life;

    // True when drawLife = 0. Stops growing.
    this.grown = false;

    // List of the Segment's Points.
    this.points = [];
    // Add the base Point.
    this.points.push(new Point(this.xnew, this.ynew));
    //this.vertices = new Float32Array(2 * (this.numLines + 1));
    //this.vertices[0] = this.xnew; this.vertices[1] = this.ynew;
    //this.writeCount = 1; // One vertex written to vertices.

    // Each two successive Points form a line which can be written in the form ax+by+c=0 for some [a,b,c]. Store
    // the [a,b,c] values for the line between points[i] and points[i+1] in this.lines[i].
    this.lines = [];
}

/**
 * Gets the angular difference between angles th1 and th2 (taking into account the fact that they're stored in [0, 2PI).
 * @param {float} th1 - Initial angle in [0, 2PI).
 * @param {float} th2 - Terminal angle in [0, 2PI).
 * @returns {float}
 */
Segment.prototype.angleBetween = function(th1, th2) {
    if(th1 >= 0 && th1 <= 0.5 * Math.PI && th2 >= 1.5 * Math.PI && th2 < TPI) {
        // Angle changed from first to fourth quadrant.
        return th2 - TPI - th1;
    } else if(th2 >= 0 && th2 <= 0.5 * Math.PI && th1 >= 1.5 * Math.PI && th1 < TPI) {
        // Angle changed from fourth to first quadrant.
        return th2 - (th1 - TPI);
    } else {
        return th2 - th1;
    }

};

/**
 *
 */
Segment.prototype.toQuadtree = function() {
    // Computes the Segment bounding box and adds the Segment to the quadtree.
    var x0s = this.points.map(function() {return this.x0});
    var y0s = this.points.map(function() {return this.y0});
    var x1s = this.points.map(function() {return this.x1});
    var y1s = this.points.map(function() {return this.y1});

    this.x = Math.min.apply(null, x0s);
    this.y = Math.min.apply(null, y0s);
    this.width = Math.min.apply(null, x1s) - this.x;
    this.height = Math.min.apply(null, y1s) - this.y;
    quadtree.insert(this);
};

/**
 *
 */
Segment.prototype.update = function() {
    if(this.grown) {
        // Segment is no longer growing
        this.life -= this.dlife;
        if(this.life <= 0) {
            this.die();
        } else {
            this.toQuadtree();
        }


    } else {
        this.grow();
        this.toQuadtree();
    }
};

/**
 *
 */
Segment.prototype.die = function() {
    // do something cool
};

/**
 *
 * @param dL - Length of the new Line that grow() produces.
 */
Segment.prototype.grow = function(dL) {
    // Adds another Point to the Segment if it's still growing.
    if(this.linesLeft == 0) {
        // Done drawing.
        this.grown = true;
    } else {
        // Decrement linesLeft
        this.linesLeft -= 1;

        // Update orientation.
        this.dth = constrain(this.dth + 2 * (Math.random() - 0.5) * this.d2thMax, -this.dthMax, this.dthMax);
        this.th = mod(this.th + this.dth, TPI);

        // Update xold, yold.
        this.xold = this.xnew;
        this.yold = this.ynew;
        //this.xnew = this.xold + this.searchLength * dL * Math.cos(this.dth);
        //this.ynew = this.yold + this.searchLength * dL * Math.sin(this.dth);

        // Compute Point search interval locations.
        var searchInterval = {
            x0: this.xold,
            y0: this.yold,
            x1: this.xold + this.searchLength * dL * Math.cos(this.th),
            y1: this.yold + this.searchLength * dL * Math.sin(this.th)
        };

        // Search for other Vines ahead with this bounding box.
        var lineBB = {
            x: Math.min(searchInterval.x0, searchInterval.x1),
            y: Math.min(searchInterval.y0, searchInterval.y1),
            width: Math.abs(this.searchLength * dL * Math.cos(this.th)),
            height: Math.abs(this.searchLength * dL * Math.sin(this.th))
        };

        // Squared-distance and normal vector of the nearest collision point for the growing Segment.
        var collisionData = {d2: Infinity, n: [0, 0]};

        // Get array of possibly intersecting segments.
        var segments = quadtree.retrieve(lineBB);
        for(var i=0; i < segments.length; i++) {
            // Check each for collision distances, update this.dth.
            var newData = this.checkSegment(searchInterval, segments[i]);
            if(newData.d2 < collisionData.d2) {
                collisionData.d2 = newData.d2;
                collisionData.n = newData.n;
            }
        }

        // Update heading based on collision info.
        if(collisionData.d2 < Infinity) {
            // Add the normal vector (with some weight) to the growth heading vector.

            // Normal vector weights are applied componentwise and reflect the distance to intersection.
            var wx = Math.exp(-0.1 * (Math.abs(collisionData.dx) - 9));
            var wy = Math.exp(-0.1 * (Math.abs(collisionData.dy) - 9));

            var newHeading = [Math.cos(this.th) + wx * collisionData.n[0], Math.sin(this.th) + wy * collisionData.n[1]];

            // Updated orientation.
            var thNew = mod(Math.atan2(newHeading[1], newHeading[0]), TPI);

            // Update dth, then th.
            this.dth += this.angleBetween(this.th, thNew);
            this.th = thNew;
        }

        // New Point coordinates.
        this.xnew = this.xold + dL * Math.cos(this.th);
        this.ynew = this.yold + dL * Math.sin(this.th);

        // Push a new Point.
        this.points.push(new Point(this.xnew, this.ynew));

        // Push a new Line between the old Point and the new Point.
        this.lines.push(new Line(this.xold, this.yold, this.xnew, this.ynew, this.hwidth, this.color));
    }
};

// -------------------------------------------------------------------------------------------------------------------//
Segment.prototype.checkSegment = function(interval, segment) {
    // Return nearest collision distance squared and the accompanying normal vector.
    var data = {d2: Infinity, n: [0,0], dx: Infinity, dy: Infinity};

    // This should search only a subset of the Segment's Points, ideally.
    if(segment.points.length > 1) {
        for (var i = 0; i < segment.points.length - 1; i++) {
            var result = checkLineIntersection(interval.x0, interval.y0, interval.x1, interval.y1, segment.points[i].xc, segment.points[i].yc, segment.points[i + 1].xc, segment.points[i + 1].yc);
            if (result.onLine1 && result.onLine2) {
                // Square of the distance between the newest Point and the intersection point.
                var d2New = Math.pow(result.x - interval.x0, 2) + Math.pow(result.y - interval.y0, 2);

                if(d2New < data.d2) {
                    // Current collision distance is smaller than the smallest yet recorded in data.d2. Update data.d2
                    // and compute the corresponding normal vector.
                    data.d2 = d2New;
                    data.dx = result.x - interval.x0;
                    data.dy = result.y - interval.y0;

                    // Compute Point connection normal.
                    var nx = segment.points[i].yc - segment.points[i + 1].yc;
                    var ny = segment.points[i + 1].xc - segment.points[i].xc;
                    // Normalize.
                    var nnorm = Math.sqrt(nx * nx + ny * ny);
                    nx /= nnorm;
                    ny /= nnorm;

                    // We want the normal vector on the same side of the line between points[i] and points[i+1] as the point
                    // (interval.x0, interval.y0).
                    // Check the head of the unit normal vector:
                    var nx1 = result.x + nx;
                    var ny1 = result.y + ny;
                    // and the tail of the interval.

                    // The line between points[i] and points[i+1] can be written as ax+by+c=0, where [a,b,c] are stored in
                    // this.lines[i]. Evaluate that equation at (interval.x0, interval.y0) and (nx1, ny1) to see if
                    // they're on the same side of the line.
                    if (sign(this.lines[i].eval(nx1, ny1)) != sign(this.lines[i].eval(interval.x0, interval.y0))) {
                        // If the signs disagree, flip (nx,ny).
                        nx *= -1;
                        ny *= -1;
                    }

                    data.n = [nx, ny];
                }
            }
        }
    }

    return data;
};

