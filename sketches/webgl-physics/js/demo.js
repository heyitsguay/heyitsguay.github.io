/**
 * Created by matt on 12/15/16.
 */

function Demo() {
    var igloo = this.igloo = new Igloo($('#canvas')[0]);
    this.quad = igloo.array(Igloo.QUAD2);
    this.image = igloo.texture($('#image')[0]);
    this.program = igloo.program('glsl/project.vert', 'glsl/tint.frag');
    this.tick = 0;
}

Demo.prototype.draw = function() {
    this.image.bind(0);
    var tint = [Math.sin(this.tick / 13), Math.cos(this.tick / 19), 0];
    this.program.use()
        .uniform('tint', tint)
        .uniformi('image', 0)
        .attrib('points', this.quad, 2)
        .draw(this.igloo.gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);
    this.tick++;
};

var demo = null;
window.addEventListener('load', function() {

    var canvas = document.getElementById("canvas");
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;

    demo = new Demo();
    function go() {
        demo.draw();
        requestAnimationFrame(go);
    }
    go();
});