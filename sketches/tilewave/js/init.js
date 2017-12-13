$(document).ready(initOverlay);

/*
 * Initialize the scene and its objects.
 */
function init() {
    xSize = window.innerWidth;
    ySize = window.innerHeight;

    // Create the scene
    scene = new THREE.Scene();

    if (firstTime) {
        // Create the renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.setClearColor(0xcecece);
        // Add the renderer to the DOM

        document.body.appendChild(renderer.domElement);
        firstTime = false;

        $("canvas").get()[0].addEventListener('click', onClick);
    }
    // Renderer size and aspect setup
    resize();

    // Add an ambient light to the scene
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Create the plane geometry
    geo = new THREE.PlaneGeometry(2, 2, 1, 1);
    // Create the plane material
    buildShader();
    // Create the plane mesh
    plane = new THREE.Mesh(geo, shaderMaterial);
    // Orient the plane towards the camera
    // plane.lookAt(camera.position);
    // Add the plane to the scene
    scene.add(plane);

}

/*
 * Initialize overlay HTML.
 */
function initOverlay() {
    $('#range-drawmode').prop({max: numDrawModes - 1});
    $('#range-shadowmode').prop({max: numShadowModes - 1});
    $('#range-timespeed').prop({
        min: timeSpeedMin,
        max: timeSpeedMax,
        step: timeSpeedStep});
    $('#range-tilesize').prop({
        max: log10(Math.min(xSize, ySize)),
        step: log10(tileSizeStep)});
    $('#range-frequency').prop({
        min: log10(frequencyMin),
        max: log10(frequencyMax),
        step: log10(frequencyStep)
    });
    $('#range-shadowhue').prop({value: hueShift, step: hueShiftStep});
}

/*
 * Load a shader from GLSL code written in text files.
 */
function fileToString(shaderName) {
    var xhr = new XMLHttpRequest();

    // String containing the shader source
    var shaderText = null;
    // Load the file
    xhr.open("GET", shaderName, false);
    xhr.onload = function() {
        shaderText = this.responseText;
    };
    xhr.send(null);

    return shaderText;
}

/*
 *
 */
function buildShader() {
    uniforms = {
        time: {value: 0.},
        planeSize: {value: new THREE.Vector2(xTile(), yTile())},
        drawMode: {value: drawMode},
        shadowMode: {value: shadowMode},
        frequency: {value: frequency},
        hueShift: {value: hueShift}
    };
    shaderMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: fileToString('js/glsl/quad.vert'),
        fragmentShader: fileToString('js/glsl/plane.frag')
    });
}