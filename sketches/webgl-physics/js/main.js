/**
 * Created by matt on 12/16/16.
 */

function comma(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,');
}

var particles = null;
var controller = null;

function updateCount() {
    var count = particles.ptexSize[0] * particles.ptexSize[1];
    $('.count').text(comma(count));
}

$(document).ready(function() {
    var canvas = $('#canvas')[0];
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;

    particles = new Particles(canvas, 1024 * 16, 3).draw().start();
    controller = new Controller(particles);
    new FPS(particles);
    updateCount();
});
