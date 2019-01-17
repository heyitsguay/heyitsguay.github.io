/**
 * Created by mattguay on 1/23/16.
 *
 * main.js contains the initial function called when
 * the document is ready, as well as definitions for
 * global objects used in the App.
 */

// WebgGL context.
var gl;

// The App.
var app;

// The canvas.
var canvas;

/**
 * Use jQuery to set up the sketch once the DOM is loaded.
 */
$(document).ready(function() {
    // Create the App.
    app = new App();

    // Initialize the Framework.
    app.restart();
});
