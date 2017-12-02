/**
 * Created by matt on 9/6/17.
 *
 * Collection of utility functions.
 */


function random(a, b) {
    // Choose a number uniformly at random from the interval (a, b).

    return a + (b - a) * Math.random();
}


function random_element(list) {
    // Return a random element from the input list.

    var i = Math.floor(Math.random() * list.length);
    return list[i];
}


function random_int(a, b) {
    // Choose an integer uniformly at random from the interval [a, b].

    return Math.floor(a + (b + 1 - a) * Math.random());
}

function random_normal() {
    // Return a number from a normal distribution with mean 0 and variance 1
    var u = 0;
    var v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2. * Math.log(u)) * Math.cos(2. * Math.PI * v);
}