
on4KScreen = ((screen.height < screen.width) ? (screen.width > 3000 / window.devicePixelRatio ) : (screen.height > 3000 / window.devicePixelRatio ) );

const shaderFiles = [
  'quad.frag',
  'quad.vert'
];
let shaderSources = {};

let gui;
let guiParams = {
  quality: on4KScreen ? 1. : 2.,
  resetOptions: function() {
    guiParams.quality = on4KScreen ? 1. : 2.;
    resize();
  }
}

let center = new THREE.Vector2(0, 0);
let baseMovementSpeed = 0.12;
let viewScale = 12;
let selectedCenter = null;
let selectedViewScale = null;

let devicePixelRatio;
let canvas;
let canvasScale = 1;
let cWidth;
let cHeight;
let screenResolution = new THREE.Vector2(0, 0);
let screenInverseResolution = new THREE.Vector2(0, 0);
let rawScreenResolution = new THREE.Vector2(0, 0);

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
  center: {value: center},
  viewScale: {value: viewScale}
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
  devicePixelRatio = window.devicePixelRatio;
  canvas = document.getElementById('canvas');
  $(window).resize(resize);
  document.onkeydown = handleKeyDown;
  document.onkeyup = handleKeyUp;
  document.addEventListener('dblclick', handleDoubleClick)

  canvas.addEventListener('touchstart', handleTouchStart);

  canvas.addEventListener('touchend', function(e) {
    let currentTime = new Date().getTime();
    let tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
      handleDoubleTap(e);
    }
    lastTap = currentTime;
  });

  initGUI();
  initStats();

  let now = new Date().getTime();
  mainUniforms.startSeed.value = (now / 1000000) % 10;
  toggleHide();
  restart();
}

function handleDoubleClick(e) {
  let screenPosition = new THREE.Vector2(e.offsetX, window.innerHeight - e.offsetY);
  handleSelect(screenPosition);
}

function handleDoubleTap(e) {
  let x = e.changedTouches[0].clientX;
  let y = e.changedTouches[0].clientY;
  let screenPosition = new THREE.Vector2(x, window.innerHeight - y);
  handleSelect(screenPosition);
}

function handleSelect(pos) {
  let uv = pos.divide(rawScreenResolution).subScalar(0.5);
  uv.x *= rawScreenResolution.x / rawScreenResolution.y;
  uv = uv.multiplyScalar(viewScale);
  uv = uv.add(center);
  selectedCenter = getCenter(uv, 4.5);
}

function getCenter(p, size) {
  let halfSize = size * 0.5;
  let c = new THREE.Vector2(
    Math.floor((p.x + halfSize) / size),
    Math.floor((p.y + halfSize) / size));
  return c;
}

function handleTouchStart(e) {
  switch(e.touches.length) {
    case 1: handleSingleTouch(e); break;
    case 2: handleDoubleTouch(e); break;
  }
}

function handleSingleTouch(e) {
  
}

pressed = {}

let contKeys = ['w', 'a', 's', 'd', 'Shift', 'r', 'f'];

function handleKeyUp(e) {
  if (contKeys.includes(e.key)) {
    pressed[e.key] = false;
  }
}


function handleKeyDown(e) {
  if (contKeys.includes(e.key)) {
    pressed[e.key] = true;
  }

  switch (e.key) {
    case ' ':
      toggleHide();
      break;

    case 'q': {
      selectedCenter = new THREE.Vector2(0,0);
      break;
    }

    case 'v': {
      selectedviewScale = 12;
      break;
    }

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
  cWidth = Math.floor(canvasScale * devicePixelRatio * window.innerWidth);
  cHeight = Math.floor(canvasScale * devicePixelRatio * window.innerHeight);
  screenInverseResolution.x = 1 / cWidth;
  screenInverseResolution.y = 1 / cHeight;
  screenResolution.x = cWidth;
  screenResolution.y = cHeight;
  canvas.width = cWidth;
  canvas.height = cHeight;

  rawScreenResolution.x = window.innerWidth;
  rawScreenResolution.y = window.innerHeight;

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

  setupGL();
  animate();
}

let fPerf;
function initGUI() {
  gui = new dat.GUI();
  let fTitle = gui.addFolder('To hide: press space or double tap');
  fPerf = gui.addFolder('Performance');
  fPerf.add(guiParams, 'quality', {'100%+AA': 2, '100%': 1, '75%': 0.75, '50%': 0.5, '30%': 0.3}).onChange(resize).listen();
  fPerf.open();
  gui.add(guiParams, 'resetOptions');
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

  if (selectedCenter != null) {
    let selectedCenterCoords = selectedCenter.clone();
    selectedCenterCoords.multiplyScalar(4.5);

    if (center.distanceTo(selectedCenterCoords) >= 1e-4) {
      let diff = selectedCenterCoords.clone();
      diff.sub(center);
      diff.multiplyScalar(0.1);
      center.add(diff);

    } else {
      center = selectedCenterCoords;
      selectedCenter = null;
    }
  }

  if (selectedViewScale != null) {
    if(Math.abs(selectedViewScale - viewScale) >= 1e-4) {
      viewScale += 0.1 * (selectedViewScale - viewScale);
    } else {
      viewScale = selectedViewScale;
      selectedViewScale = null;
    }
  }

  if (pressed['r']) {
    viewScale *= 1.025;
    selectedViewScale = null;
  }
  if (pressed['f']) {
    viewScale *= 0.975;
    selectedViewScale = null;
  }

  // let movementSpeed = pressed['Shift'] ? 4. * baseMovementSpeed : baseMovementSpeed;
  let movementSpeed = viewScale / 12 * baseMovementSpeed;

  if (pressed['a']) {
    center.x -= movementSpeed;
    selectedCenter = null;
  }
  if (pressed['d']) {
    center.x += movementSpeed;
    selectedCenter = null;
  }
  if (pressed['w']) {
    center.y += movementSpeed;
    selectedCenter = null;
  }
  if (pressed['s']) {
    center.y -= movementSpeed;
    selectedCenter = null;
  }


  mainUniforms.time.value = elapsedTime;
  mainUniforms.center.value = center;
  mainUniforms.viewScale.value = viewScale;

}


function render() {
  renderer.setSize(cWidth, cHeight);
  renderer.render(mainScene, mainCamera);
  stats.update();
}
