/**
 * Created by mattguay on 1/23/16.
 *
 * app.js contains the code for the Application class, which
 * creates the World and controls its initialization and
 * updates.
 */

/**
 * Main class for the application that this sketch runs.
 * @constructor
 */
function App() {

    /** Time attributes**/
    // App start time.
    this.time0 = null;
    // Time at the previous frame.
    this.timeLast = null;
    // Time at this frame.
    this.timeNow = null;
    // Time elapsed since the previous frame.
    this.dtFrame = null;

    /** Canvas attributes **/
    // The displayed canvas.
    this.canvas = null;
    // Canvas size (in pixels).


    // The world that is being updated.
    this.world = null;

    // The function restart() might need to behave differently
    // the first time it is called (i.e. during initialization).
    this.initialized = false;

    // When true, the update function is called repeatedly.
    this.keepRunning = false;
}

/**
 * Restarts (and starts) the App.
 */
 App.prototype.restart = function() {
     // Load and set up the World.
     this.loadWorld();

     // Use three.js for visualization.
     // Create the Scene.
     this.scene = new THREE.Scene();
     // Create the Camera.
     this.camera = new THREE.PerspectiveCamera();

     // Functions called the first time the App is run.
     if(!this.initialized) {
     }
 };