// Tracks which keys are pressed.
var keys = [];

// Some keys should only have handles triggered on offset and onset: togglables. Track their
// state in the togglable array.
var togglable = [];
// Initialize togglables to hold togglablesSize true values.
var togglableSize = 256;
while(togglableSize--){togglable.push(true);}

// -------------------------------------------------------------------------------------------------------------------//
function handleKeyDown(e) {
    keys[e.keyCode] = true;
}

// -------------------------------------------------------------------------------------------------------------------//
function handleKeyUp(e) {
    keys[e.keyCode] = false;
    togglable[e.keyCode] = true;
}

// -------------------------------------------------------------------------------------------------------------------//
function handleKeys() {
    // Additional key handlers are defined in Player's Prototype.
}