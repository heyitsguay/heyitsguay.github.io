$(document).ready(onReady);
$('#onlybutton').click(onClick);

var numberOfClicks = 0;

var lastGuess = null;

var clicksSinceLastNewGuess = 0;

var guessPhrases = [
    'Wrong!',
    'Terrible. Take a lap.',
    'No.',
    'Incorrect.',
    'Way worse than that last guess.',
    'Not even close.',
    'Embarrassing.',
    'Close... but no.'
];

var wordPhrases = [
    'That is not even a number.',
    'Ok but this time guess a number.',
    'No, a number! I can\'t work like this.',
    'I\'m going to start charging you for these horrible guesses.',
    'I\'m giving up on you.',
    'That is an apocalyptically bad guess.'
];

function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
}

function onReady() {
    if (isMobileDevice()) {
        $('#maindiv').css('width', '90%');
    }
}

function onClick() {
    var currentGuess = $('#in').val();
    var phrase;
    if (lastGuess && currentGuess === lastGuess) {
        clicksSinceLastNewGuess += 1;
        switch (clicksSinceLastNewGuess) {
            case 1:
                phrase = 'You just guessed that. It\'s still wrong.';
                break;
            case 2:
                phrase = 'Stilllllll wrong.';
                break;
            case 3:
                phrase = 'Clicking repeatedly isn\'t helping you.';
                break;
            case 4:
                phrase = 'I mean your answer won\'t suddenly become right.';
                break;
            case 5:
                phrase = 'This is getting sad.';
                break;
            case 6:
                phrase = 'Knock it off!!!';
                break;
            case 7:
                phrase = 'I\'ll call the police on you.';
                break;
            case 8:
                phrase = 'Guess something new already!';
                break;
            case 9:
                var anumber = Math.floor(10000 * Math.random());
                var $number = anumber.toFixed(0);
                phrase = 'Like how about ' + $number + '?';
                break;
            case 10:
                phrase = 'Ok that\'s it I\'m ignoring you >:(';
                break;
            default:
                phrase = '>:(';
        }
    }
    else {
        clicksSinceLastNewGuess = 0;

        var regex = /^[0-9]*([.][0-9]*)?$/;
        if (currentGuess === '') {
            phrase = 'You didn\'t enter anything. Wrong *and* lazy.';
        } else {
            if (!currentGuess.match(regex)) {
                phrase = wordPhrases[Math.floor(Math.random() * wordPhrases.length)];
            }
            else {
                if (numberOfClicks === 0) {
                    phrase = 'Wrong!';
                } else {
                    phrase = guessPhrases[Math.floor(Math.random() * guessPhrases.length)];
                }
            }
        }
    }
    lastGuess = currentGuess;
    numberOfClicks += 1;
    var textbox = document.getElementById('wrong');
    textbox.innerHTML = phrase;
}
