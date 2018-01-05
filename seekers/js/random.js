// Random sampling functions.

/**
 * Choose a number uniformly at random from the interval (a, b).
 * @param {number} a - Interval left endpoint.
 * @param {number} b - Interval right endpoint.
 * @returns {*}
 */
export default function random(a, b) {
    return a + (b - a) * Math.random();
}
