let processor = {

    timerCallback: function() {
        this.computeFrame();
        let self = this;
        console.log('bark');
        setTimeout(function() { self.timerCallback(); }, 0);
    },

    doLoad: function() {
        this.stream = document.getElementById('main');
        this.c1 = document.getElementById('c1');
        this.ctx1 = this.c1.getContext('2d');
        this.c2 = document.getElementById('c2');
        this.ctx2 = this.c2.getContext('2d');
        this.timerCallback();
    },

    computeFrame: function() {
        this.ctx1.drawImage(this.stream, 0, 0, 160, 96);
        let frame = this.ctx1.getImageData(0, 0, 160, 96);
        let l = frame.data.length / 4;

        for (let i = 0; i < l; i++) {
            let r = frame.data[i * 4 + 0];
            let g = frame.data[i * 4 + 1];
            let b = frame.data[i * 4 + 2];
            if (r + g + b < 100) {
                frame.data[i * 4 + 0] = 0;
                frame.data[i * 4 + 1] = 0;
                frame.data[i * 4 + 2] = 0;
            } else {
                frame.data[i * 4 + 0] = 255;
                frame.data[i * 4 + 1] = 255;
                frame.data[i * 4 + 2] = 255;
            }
        }
        this.ctx2.putImageData(frame, 0, 0);
        return;
    }
};

document.addEventListener("DOMContentLoaded", () => {
    processor.doLoad();});