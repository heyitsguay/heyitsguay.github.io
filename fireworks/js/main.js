const shaderFiles = [
  'quad.frag',
  'quad.vert'
];
let shaderSources = {};

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
  iResolution: {value: screenInverseResolution}
};

let gui;
let guiParams = {
  canvasScale: 1
}

let stats;
let showingStats = true;


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
  initGUI();
  initStats();

  restart();
}


function handleKeys(e) {
  switch (e.keyCode) {
    case 32:
      dat.GUI.toggleHide();

      if (showingStats) {
        stats.domElement.style.visibility = 'hidden';
        showingStats = false;
      } else {
        stats.domElement.style.visibility = 'visible';
        showingStats = true;
      }

  }
}


function resize() {
  canvasScale = 0.5 ** (guiParams.canvasScale - 1);
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


function initGUI() {
  gui = new dat.GUI();
  let fTitle = gui.addFolder('Press Space to hide')
  fTitle.add(guiParams, 'canvasScale').min(1).max(4).step(1).onChange(resize);
  fTitle.open();
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
}


function render() {
  renderer.setSize(cWidth, cHeight);
  renderer.render(mainScene, mainCamera);
  stats.update();
}
