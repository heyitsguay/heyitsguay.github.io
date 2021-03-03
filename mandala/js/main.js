
on4KScreen = ((screen.height < screen.width) ? (screen.width > 3000 / window.devicePixelRatio ) : (screen.height > 3000 / window.devicePixelRatio ) );

const shaderFiles = [
  'lab.frag',
  'garden.frag',
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

let labMode = false;

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
let screenMinSize;
let screenInverseResolution = new THREE.Vector2(0, 0);
let rawScreenResolution = new THREE.Vector2(0, 0);

let renderer;
let quadGeometry;

let mainScene;
let mainCamera;
let mainMaterial;
let labMaterial;
let mainMesh;
let labMesh;
let mainUniforms = {
  time: {value: 0},
  resolution: {value: screenResolution},
  iResolution: {value: screenInverseResolution},
  startSeed: {value: 0},
  center: {value: center},
  viewScale: {value: viewScale},
  selectedCenter: {value: new THREE.Vector2(0, 0)},
  selectedTime: {value: 0}
};


let stats;
let showingStats = true;

let lastTap = 0;

let divCleared = false;
function clearDiv() {
  document.getElementById('introdiv').remove();
  document.getElementById('fullscreendiv').remove();
  divCleared = true;
}


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
  canvas.addEventListener('dblclick', handleDoubleClick)

  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchmove', handleTouchMove);
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchCancel);

  initGUI();
  initStats();

  let now = new Date().getTime();
  mainUniforms.startSeed.value = (now / 1000000) % 10;
  toggleHide();
  restart();
}

function checkForCenterQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('cx') && params.has('cy')) {
    let cx = parseFloat(params.get('cx'));
    let cy = parseFloat(params.get('cy'));
    center = new THREE.Vector2(cx * 4.5, cy * 4.5);
    selectedCenter = new THREE.Vector2(cx, cy);
    mainUniforms.selectedCenter.value = selectedCenter;
    toggleMeshes();
  }
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
  mainUniforms.selectedCenter.value = selectedCenter;
}

function getCenter(p, size) {
  let halfSize = size * 0.5;
  let c = new THREE.Vector2(
    Math.floor((p.x + halfSize) / size),
    Math.floor((p.y + halfSize) / size));
  return c;
}

let lastTouchStartTime;

function handleTouchStart(e) {
  e.preventDefault();
  if (!divCleared) {
    clearDiv();
  }
  lastTouchStartTime = new Date().getTime();
  switch(e.targetTouches.length) {
    case 1: handleSingleTouchStart(e); break;
    case 2: handleDoubleTouchStart(e); break;
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  switch(e.targetTouches.length) {
    case 1: handleSingleTouchMove(e); break;
    case 2: handleDoubleTouchMove(e); break;
  }
}

let startTouchPoint = null;
let latestTouchPoint;

function handleSingleTouchStart(e) {
  let touch = e.targetTouches[0];
  startTouchPoint = new THREE.Vector2(touch.clientX / screenMinSize, touch.clientY / screenMinSize);
  latestTouchPoint = startTouchPoint.clone();
}

function handleSingleTouchMove(e) {
  startTouchSpread = null;
  let touch = e.targetTouches[0];
  latestTouchPoint = new THREE.Vector2(touch.clientX / screenMinSize, touch.clientY / screenMinSize);
  selectedCenter = null;
}

let startTouchSpread = null;
let latestTouchSpread;
let touchZoomSpeed = 0.1;

function handleDoubleTouchStart(e) {
  let touch0 = e.targetTouches[0];
  let touch1 = e.targetTouches[1];
  let p0 = new THREE.Vector2(touch0.clientX / screenResolution.x, touch0.clientY / screenResolution.y);
  let p1 = new THREE.Vector2(touch1.clientX / screenResolution.x, touch1.clientY / screenResolution.y);
  startTouchSpread = p1.sub(p0).lengthSq();
  latestTouchSpread = startTouchSpread.clone();
}

function handleDoubleTouchMove(e) {
  startTouchPoint = null;
  let touch0 = e.targetTouches[0];
  let touch1 = e.targetTouches[1];
  let p0 = new THREE.Vector2(touch0.clientX / screenResolution.x, touch0.clientY / screenResolution.y);
  let p1 = new THREE.Vector2(touch1.clientX / screenResolution.x, touch1.clientY / screenResolution.y);
  latestTouchSpread = p1.sub(p0).lengthSq();
  selectedViewScale = null;
}

function handleTouchEnd(e) {
  e.preventDefault();
  startTouchPoint = null;
  startTouchSpread = null;
  let touchEndTime = new Date().getTime();
  let touchLength = (touchEndTime - lastTouchStartTime) / 1000;
  if (e.targetTouches.length === 0 && touchLength < 0.12) {
    let currentTime = new Date().getTime();
    let tapLength = currentTime - lastTap;
    if (tapLength < 250 && tapLength > 0) {
      // handleDoubleTap(e);
    } else {
      lastTap = currentTime;
    }
  }
}

function handleTouchCancel(e) {
  e.preventDefault();
  startTouchPoint = null;
  startTouchSpread = null;
}

pressed = {}

let contKeys = ['w', 'a', 's', 'd', 'Shift', 'r', 'f'];

function handleKeyUp(e) {
  if (contKeys.includes(e.key)) {
    pressed[e.key] = false;
  }
}

let lastViewScale = 4;
function handleKeyDown(e) {
  if (!divCleared) {
    clearDiv();
  }
  if (contKeys.includes(e.key)) {
    pressed[e.key] = true;
  }

  switch (e.key) {
    case ' ':
      // toggleHide();
      break;

    case 'q': {
      selectedCenter = new THREE.Vector2(0,0);
      mainUniforms.selectedCenter.value = selectedCenter;
      break;
    }

    case 'v': {
      selectedViewScale = 12;
      break;
    }

    case 'l': {
      // toggleMeshes();
      break;
    }

  }
}


function toggleMeshes() {
  labMode = !labMode;
  let tmp = viewScale;
  selectedViewScale = lastViewScale;
  lastViewScale = tmp;
  labMesh.visible = !labMesh.visible;
  mainMesh.visible = !mainMesh.visible;
  let thisTime = new Date().getTime();
  mainUniforms.selectedTime.value = (thisTime - startTime) * 0.001;
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
  screenMinSize = Math.min(cWidth, cHeight);
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

let firstTime = true;
function restart() {
  resize();

  if (mainCamera) {
    mainCamera.aspect = cWidth / cHeight;
  }

  setupGL();

  if (firstTime) {
    checkForCenterQuery();
    firstTime = false;
  }

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
    fragmentShader: shaderSources['garden.frag'],
    uniforms: mainUniforms
  });
  mainMesh = new THREE.Mesh(quadGeometry, mainMaterial);
  mainScene.add(mainMesh);
  labMaterial = new THREE.RawShaderMaterial({
    vertexShader: shaderSources['quad.vert'],
    fragmentShader: shaderSources['lab.frag'],
    uniforms: mainUniforms
  });
  labMesh = new THREE.Mesh(quadGeometry, labMaterial);
  mainScene.add(labMesh);
  labMesh.visible = false;
}


function animate() {
  requestAnimationFrame(animate);
  update();
  render();
}

let minViewScale = 0.5;
let maxViewScale = 500;

function updateViewScale(factor) {
  viewScale = Math.min(maxViewScale, Math.max(minViewScale, factor * viewScale));
}


let startTime = new Date().getTime();
let thisTime;
let elapsedTime;
let lastTouchVector = new THREE.Vector2(0, 0);
let touchScrollSpeed = 24;
let scrollMomentum = 0.9;
function update() {
  thisTime = new Date().getTime();
  elapsedTime = (thisTime - startTime) * 0.001;

  if (startTouchPoint != null) {
    let touchVector = latestTouchPoint.clone();
    touchVector.sub(startTouchPoint);
    touchVector.multiply(new THREE.Vector2(-1, 1));
    touchVector.multiplyScalar(viewScale / 12  * touchScrollSpeed);
    console.log(touchVector.length());
    center.add(touchVector);
    lastTouchVector = touchVector;
    startTouchPoint = latestTouchPoint.clone();
  } else {
    let lastLenSq = lastTouchVector.lengthSq();
    if (lastLenSq > 1e-8) {
      lastTouchVector.multiplyScalar(scrollMomentum);
      center.add(lastTouchVector);
    }
  }

  if (startTouchSpread != null) {
    let spreadDist = Math.min(1., 10. * Math.abs(latestTouchSpread - startTouchSpread));
    if (latestTouchSpread > startTouchSpread) {
      updateViewScale(1 - spreadDist * touchZoomSpeed);
    } else if (latestTouchSpread < startTouchSpread) {
      updateViewScale(1 + spreadDist * touchZoomSpeed);
    }
  }

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
    updateViewScale(1.025);
    selectedViewScale = null;
  }
  if (pressed['f']) {
    updateViewScale(0.975);
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
