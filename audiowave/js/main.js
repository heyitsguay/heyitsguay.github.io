navigator.getUserMedia = (navigator.getUserMedia ||
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMeida ||
                          navigator.msGetUserMedia);

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var source, stream;
var analyser = audioCtx.createAnalyser();
analyser.minDecibels = -50;
analyser.maxDecibels = -5;
analyser.smoothingTimeConstant = 0.5;

var canvas, canvasCtx;

$(document).ready(function() {
    canvas = $('#canvas').get()[0];
    canvasCtx = canvas.getContext("2d");
    run();
});

var maxFreqBins = 2048;
var nFreqBins = 512;
var minDecibels = -50;

function npot(x) {
    return Math.round(Math.pow(2, Math.round(Math.log(x) / Math.log(2))));
}

$(document).mousemove(function(evt) {
    var px = evt.pageX / window.innerWidth;
    var py = evt.pageY / window.innerHeight;
    var logNFreqBins = Math.floor(5 + 6 * px);
    nFreqBins = Math.round(Math.pow(2, logNFreqBins));
    // minDecibels = -100 * py + -20 * (1 - py);
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

    // analyser.minDecibels = minDecibels;
    //
    // analyser.fftSize = nFreqBins;
    // bufferLength = analyser.frequencyBinCount;
    // dataArray = new Uint8Array(bufferLength);

    var draw = function() {
        analyser.minDecibels = minDecibels;
        analyser.fftSize = nFreqBins;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        var drawVisual = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.fillSTyle = 'rgb(0, 0, 0)';
        canvasCtx.fillRect(0, 0, w, h);

        var barWidth = (w / bufferLength) * 2.5;
        var barHeight;
        var x = 0;

        for(var i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i];
            canvasCtx.fillStyle = 'rgb(100, 100, ' + (barHeight + 100) + ')';
            canvasCtx.fillRect(x, h-barHeight/2, barWidth, barHeight/2);
            x += barWidth;
        }
    };

    draw();
}