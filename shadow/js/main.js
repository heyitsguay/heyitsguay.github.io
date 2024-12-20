on4KScreen = ((screen.height < screen.width) ? (screen.width > 3000 / window.devicePixelRatio ) : (screen.height > 3000 / window.devicePixelRatio ) );

const shaderFiles = [
  'quad.frag',
  'quad.vert'
];
let shaderSources = {};

let gui;
let guiParams = {
  quality: on4KScreen? 2. : 1.,
  dScale: 6.77,
  shadowDecay: -1.43,
  shadowOnset: 2.,
  shadowStrength: 0.03,
  onsetStrength: 1.,
  innerGlow: 0.8,
  outerShadow: 0.06,
  patternStrength: 0.05,
  patternFrequency: 2.,
  patternPhase: 0.,
  maxBrightness: 0.98,
  startSeed: 0,
  nSymmetries: 1,
  recurseScale: 0.2,
  nRecursions: 10,
  recursionDecay: 0.,
  rotPerLevel: 14,
  wiggleRadSlope: 0.,
  wiggleRadStart: 0.,
  wiggleBase: -3.16,
  wiggleFrequency: 1.8,
  wiggleRScale: 2.2,
  wiggleTScale: 0.,
  hyperbolaWidth: -2.99,
  hyperbolaScale: 1.,
  circle1Width: 0.025,
  circle2Width: 0.0025,
  tentacleBlunter: -3.09,
  resetOptions: function() {
    gui.revert(gui);
    resize();
  },
  presetName: 'Default',
  savePreset: function() {
    for (let key in guiParams.entries()) {
      if (!isNaN(guiParams[key])) {
        localStorage.setItem(`preset-${guiParams.presetName}-${key}`, guiParams[key]);
      }
      localStorage.setItem(`preset-${guiParams.presetName}`, true.toString());
    }
  }
}


let canvas;
let canvasScale = 1;
let cWidth;
let cHeight;
let screenResolution = new THREE.Vector2(0, 0);
let screenInverseResolution = new THREE.Vector2(0, 0);

let renderer;
let quadGeometry;

let mainScene;
let mainCamera;
let mainMaterial;
let mainMesh;
let mainUniforms = {
  time: {value: 0},
  resolution: {value: screenResolution},
  iResolution: {value: screenInverseResolution},
  startSeed: {value: 0.},
  dScale: {value: 2.82},
  shadowDecay: {value: 0.1},
  shadowOnset: {value: 2.},
  shadowStrength: {value: 0.03},
  onsetStrength: {value: 1},
  innerGlow: {value: 0.8},
  outerShadow: {value: 0.},
  patternStrength: {value: 0.03},
  patternFrequency: {value: 2.},
  patternPhase: {value: 0.},
  maxBrightness: {value: 0.9},
  nSymmetries: {value: 1},
  recurseScale: {value: 1},
  nRecursions: {value: 4},
  recursionDecay: {value: 1},
  rotPerLevel: {value: 0.0675},
  wiggleRadSlope: {value: 0.},
  wiggleRadStart: {value: 0.},
  wiggleBase: {value: 0.0125},
  wiggleFrequency: {value: 0.82},
  wiggleRScale: {value: 4.},
  wiggleTScale: {value: 1.},
  hyperbolaWidth: {value: 0.0005},
  hyperbolaScale: {value: 1.},
  circle1Width: {value: 0.1},
  circle2Width: {value: 0.05},
  tentacleBlunter: {value: 0.008}
};


let stats;
let showingStats = true;

let lastTap = 0;


$(document).ready(function() {
  loadFiles().then(main);
});


function loadFiles() {
  return $.when.apply($, shaderFiles.map(loadFile));
}
function loadFile(fileName) {
  let fullName = './glsl/' + fileName;
  return $.ajax(fullName).then(function(data) {
    shaderSources[fileName] = data;
  });
}


function main() {

  canvas = document.getElementById('canvas');
  $(window).resize(resize);
  document.onkeydown = handleKeys;

  canvas.addEventListener('touchend', function(e) {
    let currentTime = new Date().getTime();
    let tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
      toggleHide();
    }
    lastTap = currentTime;
  });

  initGUI();
  initStats();

  let now = new Date().getTime();
  mainUniforms.startSeed.value = (now / 1000000) % 10;

  restart();
}


function handleKeys(e) {
  switch (e.key) {
    case ' ':
      toggleHide();
      break;
  }
}


function toggleHide() {
  dat.GUI.toggleHide();

  if (showingStats) {
    stats.domElement.style.visibility = 'hidden';
    showingStats = false;
  } else {
    stats.domElement.style.visibility = 'visible';
    showingStats = true;
  }
}


function resize() {
  canvasScale = guiParams.quality;
  cWidth = Math.floor(canvasScale * window.devicePixelRatio * window.innerWidth);
  cHeight = Math.floor(canvasScale * window.devicePixelRatio * window.innerHeight);
  screenInverseResolution.x = 1 / cWidth;
  screenInverseResolution.y = 1 / cHeight;
  screenResolution.x = cWidth;
  screenResolution.y = cHeight;
  canvas.width = cWidth;
  canvas.height = cHeight;

  mainUniforms.resolution.value = screenResolution;
  mainUniforms.iResolution.value = screenInverseResolution;

  if (mainCamera) {
    mainCamera.aspect = cWidth / cHeight;
  }
}


function restart() {
  resize();

  if (mainCamera) {
    mainCamera.aspect = cWidth / cHeight;
  }

  decreaseTentacleBlunter(0, -4.,  0.01, 3000, 20);

  setupGL();
  animate();
}

let fPerf, fShadow, fOther, fStructure;
function initGUI() {
  gui = new dat.GUI();
  let fTitle = gui.addFolder('To hide: press space or double tap');
  gui.add(guiParams, 'resetOptions');
  fPerf = gui.addFolder('Performance');
  fPerf.add(guiParams, 'quality', {'Best+AA': 2, 'Best': 1, 'High': 0.75, 'Medium': 0.5, 'Low': 0.3}).onChange(resize).listen();
  fPerf.open();
  fShadow = gui.addFolder('Shadow settings');
  fShadow.add(guiParams, 'dScale').min(0).max(10).step(0.01).listen();
  fShadow.add(guiParams, 'shadowDecay').min(-10).max(0).step(0.01).listen();
  fShadow.add(guiParams, 'shadowOnset').min(0.01).max(5).step(0.01).listen();
  fShadow.add(guiParams, 'shadowStrength').min(0).max(1).step(0.001).listen();
  fShadow.add(guiParams, 'onsetStrength').min(0).max(5).step(0.001).listen();
  fShadow.add(guiParams, 'innerGlow').min(0).max(2).step(0.01).listen();
  fShadow.add(guiParams, 'outerShadow').min(0).max(1).step(0.01).listen();
  fShadow.add(guiParams, 'patternStrength').min(0).max(1).step(0.01).listen();
  //fShadow.add(guiParams, 'patternFrequency').min(0).max(10).step(0.01).listen();
  //fShadow.add(guiParams, 'patternPhase').min(0).max(6.29).step(0.01).listen();
  fShadow.open();
  fOther = gui.addFolder('Other settings');
  fOther.add(guiParams, 'maxBrightness').min(0).max(1).step(0.01).listen();
  fOther.add(guiParams, 'startSeed').min(0).max(10000).step(0.1)
  fOther.open();
  fStructure = gui.addFolder('Structure');
  //fStructure.add(guiParams, 'nSymmetries').min(1).max(40).step(1).listen();
  fStructure.add(guiParams, 'recurseScale').min(-1).max(3).step(0.01).listen();
  fStructure.add(guiParams, 'nRecursions').min(1).max(10).step(1).listen();
  fStructure.add(guiParams, 'recursionDecay').min(0).max(1).step(0.001).listen();
  fStructure.add(guiParams, 'rotPerLevel').min(0).max(20).step(1).listen();
  fStructure.add(guiParams, 'wiggleRadSlope').min(-10).max(10).step(0.01).listen();
  fStructure.add(guiParams, 'wiggleRadStart').min(0).max(1).step(0.001).listen();
  fStructure.add(guiParams, 'wiggleBase').min(-5).max(0).step(0.01).listen();
  fStructure.add(guiParams, 'wiggleFrequency').min(0).max(10).step(0.01).listen();
  fStructure.add(guiParams, 'wiggleRScale').min(0).max(10).step(0.01).listen();
  fStructure.add(guiParams, 'wiggleTScale').min(0).max(10).step(0.01).listen();
  fStructure.add(guiParams, 'hyperbolaWidth').min(-5).max(0).step(0.01).listen();
  fStructure.add(guiParams, 'hyperbolaScale').min(0).max(5).step(0.01).listen();
  fStructure.add(guiParams, 'circle1Width').min(0).max(0.5).step(0.005).listen();
  fStructure.add(guiParams, 'circle2Width').min(0).max(0.5).step(0.005).listen();
  fStructure.add(guiParams, 'tentacleBlunter').min(-5).max(0).step(0.01).listen();
  fStructure.open();
}


function initStats() {
  stats = new Stats();
  stats.setMode(0);

  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0';
  stats.domElement.style.top = '0';

  document.body.appendChild(stats.domElement);
}


function setupGL() {
  let context = canvas.getContext('webgl2');
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    context: context});
  renderer.autoClear = false;

  // Create a simple quad geometry
  quadGeometry = new THREE.BufferGeometry();
  let positions = [
    -1, -1, 0,
    1, -1, 0,
    -1, 1, 0,
    1, 1, 0,
    -1, 1, 0,
    1, -1, 0
  ];
  let positionAttribute = new THREE.Float32BufferAttribute(positions, 3);
  quadGeometry.addAttribute('position', positionAttribute);

  mainScene = new THREE.Scene();
  mainCamera = new THREE.PerspectiveCamera(
    60,
    cWidth / cHeight,
    1,
    1000);
  mainScene.add(mainCamera);
  mainMaterial = new THREE.RawShaderMaterial({
    vertexShader: shaderSources['quad.vert'],
    fragmentShader: shaderSources['quad.frag'],
    uniforms: mainUniforms
  });
  mainMesh = new THREE.Mesh(quadGeometry, mainMaterial);
  mainScene.add(mainMesh);
}


function animate() {
  requestAnimationFrame(animate);
  update();
  render();
}


function decreaseTentacleBlunter(start, threshold, delta, delay, frequency) {
  guiParams.tentacleBlunter = start;
  setTimeout(function () {
    setTimeout(decrementer, frequency)
  }, delay);

  function decrementer() {
    setTimeout(function () {
      if (guiParams.tentacleBlunter > threshold) {
        guiParams.tentacleBlunter -= delta;
        setTimeout(decrementer, frequency);
      }
    })
  }
}


let startTime = new Date().getTime();
let thisTime;
let elapsedTime;
function update() {
  thisTime = new Date().getTime();
  elapsedTime = (thisTime - startTime) * 0.001;

  mainUniforms.time.value = elapsedTime;
  mainUniforms.startSeed.value = guiParams.startSeed;
  mainUniforms.dScale.value = 4**guiParams.dScale;
  mainUniforms.shadowDecay.value = 4**guiParams.shadowDecay;
  mainUniforms.shadowOnset.value = 10**guiParams.shadowOnset;
  mainUniforms.shadowStrength.value = guiParams.shadowStrength;
  mainUniforms.onsetStrength.value = guiParams.onsetStrength;
  mainUniforms.innerGlow.value = guiParams.innerGlow;
  mainUniforms.outerShadow.value = guiParams.outerShadow;
  mainUniforms.patternStrength.value = guiParams.patternStrength;
  mainUniforms.patternFrequency.value = guiParams.patternFrequency;
  mainUniforms.patternPhase.value = guiParams.patternPhase;
  mainUniforms.maxBrightness.value = guiParams.maxBrightness;
  mainUniforms.nSymmetries.value = guiParams.nSymmetries;
  mainUniforms.recurseScale.value = 2**guiParams.recurseScale;
  mainUniforms.nRecursions.value = guiParams.nRecursions;
  mainUniforms.recursionDecay.value = 1. - guiParams.recursionDecay;
  mainUniforms.rotPerLevel.value = guiParams.rotPerLevel === 0 ? 1. : 1. / guiParams.rotPerLevel;
  mainUniforms.wiggleRadSlope.value = guiParams.wiggleRadSlope;
  mainUniforms.wiggleRadStart.value = guiParams.wiggleRadStart;
  mainUniforms.wiggleBase.value = guiParams.wiggleBase === -5. ? 0 : 4 ** guiParams.wiggleBase;
  mainUniforms.wiggleFrequency.value = guiParams.wiggleFrequency;
  mainUniforms.wiggleRScale.value = guiParams.wiggleRScale;
  mainUniforms.wiggleTScale.value = guiParams.wiggleTScale;
  mainUniforms.hyperbolaWidth.value = 10**guiParams.hyperbolaWidth;
  mainUniforms.hyperbolaScale.value = guiParams.hyperbolaScale;
  mainUniforms.circle1Width.value = guiParams.circle1Width;
  mainUniforms.circle2Width.value = guiParams.circle2Width;
  mainUniforms.tentacleBlunter.value = guiParams.tentacleBlunter === -5. ? 0 : 10**guiParams.tentacleBlunter;
}


function render() {
  renderer.setSize(cWidth, cHeight);
  renderer.render(mainScene, mainCamera);
  stats.update();
}
