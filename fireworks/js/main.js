const shaderFiles = [
  'quad.frag',
  'quad.vert'
];
let shaderSources = {};

let gui;
let guiParams = {
  quality: 0.75,
  numParticles: 200,
  brightnessPreset: 1,
  skyGlow: 2,
  frontHillGlow: 1.,
  backHillDensity: 0,
  backHillGlow: 0.4,
  starGlow: 0.65,
  cityGlow: 0.8,
  resetOptions: function() {
    guiParams.quality = 0.75;
    guiParams.numParticles = 200;
    guiParams.brightnessPreset = 1;
    guiParams.skyGlow = 2;
    guiParams.frontHillGlow = 1.;
    guiParams.backHillDensity = 0;
    guiParams.backHillGlow = 0.4;
    guiParams.starGlow = 0.65;
    guiParams.cityGlow = 0.8;
    resize();
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
  startSeed: {value: 0},
  numParticles: {value: guiParams.numParticles},
  skyGlow: {value: guiParams.skyGlow},
  frontHillGlow: {value: guiParams.frontHillGlow},
  backHillDensity: {value: 0.003 * 1.2**guiParams.backHillDensity},
  backHillGlow: {value: guiParams.backHillGlow},
  starGlow: {value: guiParams.starGlow},
  cityGlow: {value: guiParams.cityGlow}
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
  cWidth = Math.floor(canvasScale * window.innerWidth);
  cHeight = Math.floor(canvasScale * window.innerHeight);
  screenInverseResolution.x = 1 / cWidth;
  screenInverseResolution.y = 1 / cHeight;
  screenResolution.x = cWidth;
  screenResolution.y = cHeight;
  canvas.width = cWidth;
  canvas.height = cHeight;

  if (mainCamera) {
    mainCamera.aspect = cWidth / cHeight;
  }
}


function restart() {
  resize();

  if (mainCamera) {
    mainCamera.aspect = cWidth / cHeight;
  }

  setupGL();
  animate();
}

let fPerf, fBright;
function initGUI() {
  gui = new dat.GUI();
  let fTitle = gui.addFolder('To hide: press space or double tap');
  gui.add(guiParams, 'brightnessPreset', {'Low': 1, 'High': 2}).onChange(applyPreset).listen();
  fPerf = gui.addFolder('Performance');
  fPerf.add(guiParams, 'quality', {'Best': 1, 'High': 0.75, 'Medium': 0.5, 'Low': 0.3}).onChange(resize).listen();
  fPerf.add(guiParams, 'numParticles').min(10).max(300).step(10).listen();
  fPerf.open();
  fBright = gui.addFolder('Advanced');
  fBright.add(guiParams, 'skyGlow').min(0).max(5).step(0.1).listen();
  fBright.add(guiParams, 'frontHillGlow').min(0).max(3).step(0.05).listen();
  fBright.add(guiParams, 'backHillDensity').min(-7).max(7).step(1).listen();
  fBright.add(guiParams, 'backHillGlow').min(0).max(3).step(0.05).listen();
  fBright.add(guiParams, 'starGlow').min(0).max(3).step(0.05).listen();
  fBright.add(guiParams, 'cityGlow').min(0).max(2).step(0.1).listen();
  gui.add(guiParams, 'resetOptions');
}
function applyPreset() {
  if (guiParams.brightnessPreset == 1) {
    guiParams.skyGlow = 2;
    guiParams.frontHillGlow = 1.;
    guiParams.backHillDensity = 0;
    guiParams.backHillGlow = 0.4;
    guiParams.starGlow = 0.65;
    guiParams.cityGlow = 0.8;
  } else {
    guiParams.skyGlow = 4.5;
    guiParams.frontHillGlow = 1.85;
    guiParams.backHillDensity = 0;
    guiParams.backHillGlow = 1.;
    guiParams.starGlow = 1.2;
    guiParams.cityGlow = 1.4;
  }
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


let startTime = new Date().getTime();
let thisTime;
let elapsedTime;
function update() {
  thisTime = new Date().getTime();
  elapsedTime = (thisTime - startTime) * 0.001;

  mainUniforms.time.value = elapsedTime;
  mainUniforms.resolution.value = screenResolution;
  mainUniforms.iResolution.value = screenInverseResolution;
  mainUniforms.numParticles.value = guiParams.numParticles;
  mainUniforms.skyGlow.value = guiParams.skyGlow;
  mainUniforms.frontHillGlow.value = guiParams.frontHillGlow;
  mainUniforms.backHillDensity.value = 0.003 * 1.2**guiParams.backHillDensity;
  mainUniforms.backHillGlow.value = guiParams.backHillGlow;
  mainUniforms.starGlow.value = guiParams.starGlow;
  mainUniforms.cityGlow.value = guiParams.cityGlow;
}


function render() {
  renderer.setSize(cWidth, cHeight);
  renderer.render(mainScene, mainCamera);
  stats.update();
}
