navigator.getUserMedia = (navigator.getUserMedia ||
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMeida ||
                          navigator.msGetUserMedia);

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var source;
var analyser = audioCtx.createAnalyser();
analyser.minDecibels = -50;
analyser.maxDecibels = -15;
analyser.smoothingTimeConstant = 0.8;

var canvas, canvasCtx;

$(document).ready(function() {
    canvas = $('#canvas').get()[0];
    canvasCtx = canvas.getContext("2d");
    run();
});

var nFreqBins = 512;
var minDecibels = -50;

$(document).mousemove(function(evt) {
    var px = evt.pageX / window.innerWidth;
    var py = evt.pageY / window.innerHeight;
    var logNFreqBins = Math.round(5 + 6 * px);
    nFreqBins = Math.round(Math.pow(2, logNFreqBins));
    minDecibels = -100 * py + -20 * (1 - py);
    document.getElementById('thediv').innerHTML =
        nFreqBins + ' fftsize, ' + minDecibels.toFixed(1) + ' min dB';

});

function run() {

    if (navigator.getUserMedia) {
        navigator.getUserMedia(
            {audio: true},
            function (stream) {
                source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);
                visualize();
            },
            function (err) {
                console.log('The following error occurred: ' + err);
            }
        );
    } else {
        console.log('getUserMedia not supported on your browser!');
    }
}

function visualize() {
    var w = canvas.width;
    var h = canvas.height;
    var bufferLength, dataArray;
    canvasCtx.clearRect(0, 0, w, h);

    var draw = function() {
        analyser.minDecibels = minDecibels;
        analyser.fftSize = nFreqBins;
        bufferLength = analyser.frequencyBinCount;
        var usefulLength = Math.floor(bufferLength * 0.3);
        dataArray = new Uint8Array(bufferLength);
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.fillStyle = 'rgb(0, 0, 0)';
        canvasCtx.fillRect(0, 0, w, h);

        var barWidth = (w / usefulLength) * 2.5;
        var barHeight;
        var x = 0;

        for(var i = 0; i < usefulLength; i++) {
            barHeight = dataArray[i];
            canvasCtx.fillStyle = 'rgb(100, 100, ' + (barHeight + 100) + ')';
            canvasCtx.fillRect(x, h-barHeight/2, barWidth, barHeight/2);
            x += barWidth;
        }
    };

    draw();
}