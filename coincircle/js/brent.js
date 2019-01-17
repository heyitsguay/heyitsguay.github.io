function brent(ax, bx, f, tol) {
    //
    //      a zero of the function  f(x)  is computed in the interval ax,bx .
    //zero
    //  input..
    //
    //  ax     left endpoint of initial interval
    //  bx     right endpoint of initial interval
    //  f      function subprogram which evaluates f(x) for any x in
    //         the interval  ax,bx
    //  tol    desired length of the interval of uncertainty of the
    //         final result ( >= 0.0)
    //
    //
    //  output..
    //
    //  brent abcissa approximating a zero of  f  in the interval ax,bx
    //
    //
    //      it is assumed  that   f(ax)   and   f(bx)   have  opposite  signs
    //  without  a  check.  brent  returns a zero  x  in the given interval
    //  ax,bx  to within a tolerance  4*macheps*abs(x) + tol, where macheps
    //  is the relative machine precision.
    //      this function subprogram is a slightly  modified  translation  of
    //  the algol 60 procedure  zero  given in  richard brent, algorithms for
    //  minimization without derivatives, prentice - hall, inc. (1973).
    //
    //
    "use strict";
    var a, b, c, d, e, fa, fb, fc, tol1, xm, p, q, r, s, eps = Math.pow(2, -52);

    tol = tol || 1E-8;
    tol1 = eps + 1.0;
    //
    // initialization
    //
    a = ax;
    b = bx;
    fa = f(a);
    fb = f(b);

    if (!((fa === 0.0 || fb === 0.0) || (fa * (fb / Math.abs(fb)) <= 0.0))) {
        // No root bracketed
        return -1E100;
    }
    //
    // begin step
    //
    c = a;
    fc = fa;
    d = b - a;
    e = d;

    for (;;) {
        if (Math.abs(fc) < Math.abs(fb)) {
            a = b;
            b = c;
            c = a;
            fa = fb;
            fb = fc;
            fc = fa;
        }
        tol1 = 2.0 * eps * Math.abs(b) + 0.5 * tol;
        xm = 0.5 * (c - b);
        //
        // convergence test
        //
        if ((Math.abs(xm) <= tol1) || (fb === 0.0)) {
            break;
        }
        //
        // is bisection necessary
        //
        if (!((Math.abs(e) >= tol1) && (Math.abs(fa) > Math.abs(fb)))) {
            d = xm;
            e = d;
        } else {
            s = fb / fa;
            //
            // is quadratic interpolation possible
            //
            if (a !== c) {
                //
                // inverse quadratic interpolation
                //
                q = fa / fc;
                r = fb / fc;
                p = s * (2.0 * xm * q * (q - r) - (b - a) * (r - 1.0));
                q = (q - 1.0) * (r - 1.0) * (s - 1.0);
            } else {
                p = 2.0 * xm * s;
                q = 1.0 - s;
            }
            //
            // adjust signs
            //
            if (p <= 0.0) {
                p = -p;
            } else {
                q = -q;
            }
            s = e;
            e = d;
            //
            // is interpolation acceptable
            //
            if (((2.0 * p) >= (3.0 * xm * q - Math.abs(tol1 * q))) || (p >= Math.abs(0.5 * s * q))) {
                //
                // bisection
                //
                d = xm;
                e = d;
            } else {
                d = p / q;
            }
        }
        //
        // complete step
        //
        a = b;
        fa = fb;

        if (Math.abs(d) <= tol1) {
            if (xm <= 0.0) {
                b = b - tol1;
            } else {
                b = b + tol1;
            }
        } else {
            b = b + d;
        }
        fb = f(b);
        if ((fb * (fc / Math.abs(fc))) > 0.0) {
            c = a;
            fc = fa;
            d = b - a;
            e = d;
        }
    }
    return b;
}/**
 * Created by matt on 12/26/17.
 */
