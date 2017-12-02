function Demo() {
    var igloo    = this.igloo = new Igloo($('#my-canvas')[0]);
    this.quad    = igloo.array(Igloo.QUAD2);
    this.program = igloo.program('project.vert', 'tint.frag');
    this.tick    = 0;
}

Demo.prototype.draw = function() {
    var tint = [Math.sin(this.tick / 100.), Math.cos(this.tick / 100.), 0];
    this.program.use()
        .uniform('t', this.tick)
        .uniform('tint', tint)
        .uniformi('image', 0)
        .attrib('points', this.quad, 2)
        .draw(this.igloo.gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);
    this.tick++;
};

var demo = null;
window.addEventListener('load', function() {
    demo = new Demo();
    function go() {
        demo.draw();
        requestAnimationFrame(go);
    }
    go();
});
