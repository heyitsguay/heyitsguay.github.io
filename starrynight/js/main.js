// List of shader source file names
const shaderFiles = [
    'star.vert',
    'star.frag'
];
let shaderSources = {};

let container;
let camera, scene, renderer, stats, clock;

let numStars = 15000;
let starGeometry, instancedStarGeometry, starMesh;

let starfieldUniforms = {
    uT: {value: null},
    uScale: {value: null},
    uMVP: {value: null},
    uVideo: {value: null},
    uVidMaskStrength: {value: null},
    uVidColorStrength: {value: null},
    uStarZMin: {value: null},
    uStarZInverse: {value: null},
    uVidBrightBoost: {value: null}
};

let starfieldAttributes = {
    'center': null,
    'color': null,
    'frequency': null,
    'phase': null
};
let centerArray, colorArray, frequencyArray, phaseArray;
let starfieldMaterial;

// let starXMin = -200;
// let starXMax = 200;
// let starYMin = -150;
// let starYMax = 150;
// let starZMin = 50;
// let starZMax = 150;

let gui, fStars, fStarPositions, fStarColors, fStarGlimmer, fVideo;
let guiParams = {
    starSpeed: -3.,
    starSize: 0.13,
    starXMin: -200,
    starXMax: 200,
    starYMin:-150,
    starYMax: 150,
    starZMin: 50,
    starZMax: 150,
    starHueMin: 0,
    starHueMax: 0.5,
    starSatMin: 0,
    starSatMax: 0.3,
    starBrightMin: 0.9,
    starBrightMax: 1.,
    glimmerFreqMin: 0.1,
    glimmerFreqMax: 10,
    glimmerPhaseMin: 0,
    glimmerPhaseMax: 2 * Math.PI,
    vidMaskStrength: 0.,
    vidColorStrength: 0.,
    vidBrightBoost: 2.
};
    // hueMax: 0.5,
    // satMax: 0.5
// };

let video, videoTexture;


// ----------------------------


$(document).ready(function() {
    loadFiles().then(main);
});


/**
 * Sketch on-ready function.
 */
function main() {
    init();
    animate();
}


function init() {
    container = document.createElement('div');
    document.body.appendChild(container);
    clock = new THREE.Clock;
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 500);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f061f);

    initStream();

    initStarfield();

    initRenderer();

    initGUI();

    window.addEventListener('resize', onWindowResize, false);

    document.onkeydown = handleKeys;

    let ham = new Hammer(renderer.domElement);

    ham.on('doubletap', function() {
        dat.GUI.toggleHide();
    });
}


function initStream() {
    video = document.getElementById('video');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        let constraints = {video: {
            width: Math.floor(document.innerWidth / 10),
            height: Math.floor(document.innerHeight / 10),
            facingMode: 'user'}};

        navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            video.srcObject = stream;
            video.play();
        }).catch(function(error) {
            console.error('Unable to access the camera.', error);
        });
    } else {
        console.error('MediaDevices interface not available.');
    }
    videoTexture = new THREE.VideoTexture(video);
}


function initStarfield() {
    initStarGeometry();
    initStars();
    initStarfieldUniforms();
    initStarfieldAttributes();

    starfieldMaterial = new THREE.RawShaderMaterial({
        vertexShader: shaderSources['star.vert'],
        fragmentShader: shaderSources['star.frag'],
        uniforms: starfieldUniforms
    });
    starMesh = new THREE.Mesh(instancedStarGeometry, starfieldMaterial);
    scene.add(starMesh);
}


function initRenderer() {
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
}


function initGUI() {
    stats = new Stats();
    // stats.showPanel(0);
    document.body.appendChild(stats.domElement);

    gui = new dat.GUI();

    fStars = gui.addFolder('Starfield');
    gui.add(guiParams, 'starSpeed').min(-4).max(0).step(0.005);
    gui.add(guiParams, 'starSize').min(0.01).max(5).step(0.01).onChange(function(v) {
        starfieldUniforms.uScale.value = v;
    });

    fStarPositions = fStars.addFolder('Star Bounding Box');
    fStarPositions.add(guiParams, 'starXMin').min(-1000).max(-10).step(1);
    fStarPositions.add(guiParams, 'starXMax').min(10).max(1000).step(1);
    fStarPositions.add(guiParams, 'starYMin').min(-1000).max(-10).step(1);
    fStarPositions.add(guiParams, 'starYMax').min(10).max(1000).step(1);
    fStarPositions.add(guiParams, 'starZMin').min(1).max(500).step(1).onChange(function(v) {
        starfieldUniforms.uStarZMin.value = v;
    });
    fStarPositions.add(guiParams, 'starZMax').min(1).max(1000).step(1).onChange(function(v) {
        if (v - guiParams.starZMin < 1) {
            starfieldUniforms.uStarZInverse.value = 1;
        }  else {
            starfieldUniforms.uStarZInverse.value = 1. / (v - guiParams.starZMin);
        }
    });

    fStarColors = fStars.addFolder('Star Colors');
    fStarColors.add(guiParams, 'starHueMin').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starHueMax').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starSatMin').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starSatMax').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starBrightMin').min(0.).max(1.).step(0.01);
    fStarColors.add(guiParams, 'starBrightMax').min(0.).max(1.).step(0.01);

    fStarGlimmer = fStars.addFolder('Star Glimmer');
    fStarGlimmer.add(guiParams, 'glimmerFreqMin').min(0.01).max(20).step(0.01);
    fStarGlimmer.add(guiParams, 'glimmerFreqMax').min(0.01).max(20).step(0.01);
    fStarGlimmer.add(guiParams, 'glimmerPhaseMin').min(0).max(2 * Math.PI).step(0.01);
    fStarGlimmer.add(guiParams, 'glimmerPhaseMax').min(0).max(2 * Math.PI).step(0.01);

    fVideo = gui.addFolder('Video Stream');
    fVideo.add(guiParams, 'vidMaskStrength').min(0.).max(1.).step(0.01).onChange(function(v) {
        starfieldUniforms.uVidMaskStrength.value = v;
    });
    fVideo.add(guiParams, 'vidColorStrength').min(0.).max(1.).step(0.01).onChange(function(v) {
        starfieldUniforms.uVidColorStrength.value = v;
    });
    fVideo.add(guiParams, 'vidBrightBoost').min(1.).max(10.).step(0.01).onChange(function(v) {
        starfieldUniforms.uVidBrightBoost.value = v;
    });

    for (let f of [fStars, fStarPositions, fStarColors, fStarGlimmer, fVideo]) {
        f.open();
    }

}


function handleKeys(e) {
    switch (e.keyCode) {
        case 32:
            dat.GUI.toggleHide();
    }
}


function initStarGeometry() {
    // Stars are spheres
    starGeometry = new THREE.CircleBufferGeometry(1, 32);
    instancedStarGeometry = new THREE.InstancedBufferGeometry();
    // Copy star geometry attributes to its instanced counterpart
    Object.keys(starGeometry.attributes).forEach(attributeName=>{
        instancedStarGeometry.attributes[attributeName] = starGeometry.attributes[attributeName]});
    // Copy over vertex index
    instancedStarGeometry.index = starGeometry.index;
    instancedStarGeometry.maxInstancedCount = numStars;
}


function initStarfieldUniforms() {
    starfieldUniforms.uT.value = 0.;
    starfieldUniforms.uScale.value = guiParams.starSize;
    starfieldUniforms.uMVP.value = camera.projectionMatrix;
    starfieldUniforms.uVideo.value = videoTexture;
    starfieldUniforms.uVidMaskStrength.value = guiParams.vidMaskStrength;
    starfieldUniforms.uVidColorStrength.value = guiParams.vidColorStrength;
    starfieldUniforms.uVidBrightBoost.value = guiParams.vidBrightBoost;
    starfieldUniforms.uStarZMin.value = guiParams.starZMin;
    starfieldUniforms.uStarZInverse = 1. / (guiParams.starZMax - guiParams.starZMin);
}


function initStars() {
    centerArray = new Float32Array(numStars * 3);
    colorArray = new Float32Array(numStars * 3);
    frequencyArray = new Float32Array(numStars);
    phaseArray = new Float32Array(numStars);
    for (let i = 0; i < numStars; i++) {
        resetStar(i, true);
    }
}


function initStarfieldAttributes() {
    starfieldAttributes['center'] = new THREE.InstancedBufferAttribute(centerArray, 3);
    instancedStarGeometry.setAttribute(
        'aCenter',
        starfieldAttributes['center']);

    starfieldAttributes['color'] = new THREE.InstancedBufferAttribute(colorArray, 3);
    instancedStarGeometry.setAttribute(
        'aColor',
       starfieldAttributes['color']);

    starfieldAttributes['frequency'] = new THREE.InstancedBufferAttribute(frequencyArray, 1);
    instancedStarGeometry.setAttribute(
        'aFrequency',
        starfieldAttributes['frequency']);

    starfieldAttributes['phase'] = new THREE.InstancedBufferAttribute(phaseArray, 1);
    instancedStarGeometry.setAttribute(
        'aPhase',
        starfieldAttributes['phase']);
}


function resetStar(i, firstTime) {
    let starXMin = guiParams.starXMin;
    let starXMax = Math.max(starXMin, guiParams.starXMax);
    let starYMin = guiParams.starYMin;
    let starYMax = Math.max(starYMin, guiParams.starYMax);
    let starZMin = guiParams.starZMin;
    let starZMax = Math.max(starZMin, guiParams.starZMax);

    let starHueMin = guiParams.starHueMin;
    let starHueMax = Math.max(starHueMin, guiParams.starHueMax);
    let starSatMin = guiParams.starSatMin;
    let starSatMax = Math.max(starSatMin, guiParams.starSatMax);
    let starBrightMin = guiParams.starBrightMin;
    let starBrightMax = Math.max(starBrightMin, guiParams.starBrightMax);

    let glimmerFreqMin = guiParams.glimmerFreqMin;
    let glimmerFreqMax = Math.max(glimmerFreqMin, guiParams.glimmerFreqMax);
    let glimmerPhaseMin = guiParams.glimmerPhaseMin;
    let glimmerPhaseMax = Math.max(glimmerPhaseMin, guiParams.glimmerPhaseMax);

    if (firstTime) {
        // Spawn randomly in-bounds
        centerArray[i * 3] = starXMin + Math.random() * (starXMax - starXMin);
    } else {
        // Spawn near the right boundary
        centerArray[i * 3] = starXMax + 5 * (-1 + 2 * Math.random());
    }
        centerArray[i * 3 + 1] = starYMin + Math.random() * (starYMax - starYMin);
        centerArray[i * 3 + 2] = -(starZMin + Math.random() * (starZMax - starZMin));


    // H S B coordinates
    colorArray[i * 3] = starHueMin + Math.random() * (starHueMax - starHueMin);
    colorArray[i * 3 + 1] = starSatMin + Math.random() * (starSatMax - starSatMin);
    colorArray[i * 3 + 2] = starBrightMin + Math.random() * (starBrightMax - starBrightMin);

    frequencyArray[i] = glimmerFreqMin + Math.random() * (glimmerFreqMax - glimmerFreqMin);
    phaseArray[i] = glimmerPhaseMin + Math.random() * (glimmerPhaseMax - glimmerPhaseMin);
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


function animate() {
    requestAnimationFrame(animate);

    update();

    render();

    stats.update();

}

function update() {
    for (let i = 0; i < numStars; i++) {
        centerArray[i * 3] -= 10 ** guiParams['starSpeed'];
        if (centerArray[i * 3] < guiParams['starXMin']) {
            resetStar(i, false);
        }
    }
    starMesh.geometry.attributes.aCenter.needsUpdate = true;

    starfieldUniforms.uT.value += clock.getDelta();
}

function render() {
    renderer.render(scene, camera);

}

function loadFiles() {
    return $.when.apply($, shaderFiles.map(loadFile));
}
function loadFile(fileName) {
    let fullName = './glsl/' + fileName;
    return $.ajax(fullName).then(function(data) {
        shaderSources[fileName] = data;
    });
}
