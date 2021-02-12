let vertShaderFile = 'quad.vert';
let shaderSources = {};
let lastWorkingFragShader = null;

let mainDiv, mainCode, compileButton, errorText, fullDiv;

let canvas;
let canvasScale = 1;
let cWidth;
let cHeight;
let screenResolution = new THREE.Vector2(0, 0);

let renderer;
let quadGeometry;

let mainScene;
let mainCamera;
let mainMaterial;
let mainMesh;
let mainUniforms = {
  time: {value: 0},
  resolution: {value: screenResolution},
  startSeed: {value: null}
}

let ua = navigator.userAgent.toLowerCase();
let isAndroid = ua.indexOf("android") > -1; //&& ua.indexOf("mobile");

$(document).ready(function() {

  mainDiv = document.getElementById("maindiv");
  fullDiv = document.getElementById("fulldiv");

  mainCode = document.getElementById("maincode");
if (isAndroid) {
    mainCode.style.fontSize = "12";
    mainCode.style.height = "80vh";
  }
  // compileButton = document.getElementById('compilebutton');
  errorText = document.getElementById('errortext');

  mainUniforms.startSeed.value = (new Date().getTime() / 1000000) % 10.;

  loadFiles().then(main);
});

function checkLocalStorage() {
  return $.when().then(function() {
    if (localStorage.getItem('lastShader')) {
      mainCode.innerHTML = localStorage.getItem('lastShader');
    } else {
      localStorage.setItem('lastShader', mainCode.innerHTML);
    }

    if (localStorage.getItem('lastWorkingShader')) {
      lastWorkingFragShader = localStorage.getItem('lastWorkingShader');
    } else {
      localStorage.setItem('lastWorkingShader', mainCode.innerText);
    }
  });
}

function loadFiles() {
  return $.when().then(checkLocalStorage).then(loadFragShader).then(loadVertShader);
  // return $.when.apply($, ['frag', 'vert'].map(loadFile));
}

function reloadFragShader() {
  shaderSources['frag'] = mainCode.innerText;
  localStorage.setItem('lastShader', mainCode.innerHTML);
  setupGL();
  // mainMaterial = new THREE.RawShaderMaterial({
  //   vertexShader: shaderSources['vert'],
  //   fragmentShader: shaderSources['frag'],
  //   uniforms: mainUniforms
  // });
}

function loadFragShader() {
  return $.when().then(function() {
  shaderSources['frag'] = mainCode.innerText;
  });
}

function loadVertShader() {
  let fullName = './glsl/' + vertShaderFile;
  return $.ajax(fullName).then(function(data) {
    shaderSources['vert'] = data;
  })
}


let originalConsoleErrorFunction = console.error;
function main() {
  // refreshHighlighting();
  Prism.highlightAll();
  canvas = document.getElementById('canvas');

  $(window).resize(resize);
  window.addEventListener('keyup', handleKeysUp);
  window.addEventListener('keydown', handleKeysDown);

  console.error = parseError;

  restart();
}

let enterPressed = false;
let tabPressed = false;
let lastKeyDownTime;
let shaderCanReload = false;
let showingEditor = true;
function handleKeysDown(e) {
  lastKeyDownTime = new Date().getTime();
  shaderCanReload = true;
  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (!enterPressed) {
        refreshHighlighting();

        let doc1 = mainCode.ownerDocument.defaultView;
        let sel1 = doc1.getSelection();
        let range1 = sel1.getRangeAt(0);

        let newLineNode = document.createTextNode("\u000a");
        range1.insertNode(newLineNode);

        range1.setStartAfter(newLineNode);
        range1.setEndAfter(newLineNode);
        sel1.removeAllRanges();
        sel1.addRange(range1);
      }
      break;

    case 'Tab':
      e.preventDefault();  // this will prevent us from tabbing out of the editor
      if (!tabPressed) {
        // now insert four non-breaking spaces for the tab key
        let doc = mainCode.ownerDocument.defaultView;
        let sel = doc.getSelection();
        let range = sel.getRangeAt(0);

        let tabNode = document.createTextNode("\u00a0\u00a0\u00a0\u00a0");
        range.insertNode(tabNode);

        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      break;

  }
}

function handleKeysUp(e) {
  if (e.keyCode >= 0x30 || e.keyCode == 0x20) {
    refreshHighlighting();
  }

  if (e.key === 'Enter') {
    enterPressed = false;
  } else if (e.key === 'Tab') {
    tabPressed = false;
  } else if (e.key === ' ') {
    if (e.ctrlKey) {
      if (showingEditor) {
        fullDiv.style.visibility = 'hidden';
        showingEditor = false;
      } else {
        fullDiv.style.visibility = 'visible';
        showingEditor = true;
      }
    }
  }


}

let shaderErrorMessage = '';
function parseError(...args) {
  if (args[0].substring(0, 18) === "THREE.WebGLProgram") {
    if (args.length > 7) {
      let errorLine = args[7];
      let errorParts = errorLine.split('ERROR:');
      if (errorParts.length > 1) {
        shaderErrorMessage = "● ERROR:" + errorParts[1].substring(0, errorParts[1].length - 1);
        return;
      }
    }
  }
  originalConsoleErrorFunction(...args);
}

function restart() {
  resize();
  setupGL();
  animate();
}

function resize() {
  cWidth = Math.floor(canvasScale * window.innerWidth);
  cHeight = Math.floor(canvasScale * window.innerHeight);
  canvas.width = cWidth;
  canvas.height = cHeight;
  screenResolution.x = cWidth;
  screenResolution.y = cHeight;
  if (mainCamera) {
    mainCamera.aspect = cWidth / cHeight;
  }
}

let gl;
function setupGL() {
  let context = canvas.getContext('webgl2');
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    context: context});
  renderer.autoClear = false;
  gl = renderer.getContext();

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
    vertexShader: shaderSources['vert'],
    fragmentShader: shaderSources['frag'],
    uniforms: mainUniforms
  });

  mainMesh = new THREE.Mesh(quadGeometry, mainMaterial);
  mainScene.add(mainMesh);

  renderer.compile(mainScene, mainCamera);
  let compileSuccess = gl.getProgramParameter(mainMaterial.program.program, gl.LINK_STATUS);
  if (compileSuccess) {
    lastWorkingFragShader = shaderSources['frag'];
    errorText.style.color = 'rgba(150, 250, 150, 1)';
    errorText.innerHTML = '●';
    localStorage.setItem('lastWorkingShader', lastWorkingFragShader);
  } else {
    errorText.style.color = 'rgba(250, 150, 150, 1)';
    errorText.innerHTML = shaderErrorMessage;
    mainMaterial = new THREE.RawShaderMaterial({
      vertexShader: shaderSources['vert'],
      fragmentShader: lastWorkingFragShader,
      uniforms: mainUniforms
    });

    mainMesh = new THREE.Mesh(quadGeometry, mainMaterial);
    mainScene.add(mainMesh);

    renderer.compile(mainScene, mainCamera);
  }
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

  if (shaderCanReload && (thisTime - lastKeyDownTime > 1500)) {
    reloadFragShader();
    shaderCanReload = false;
  }
}

function render() {
  renderer.setSize(cWidth, cHeight);
  renderer.render(mainScene, mainCamera);
}



function refreshHighlighting() {
  let pos = caret();
  Prism.highlightAll();
  setCaret(pos, mainCode);
}


function caret() {
  let doc = mainCode.ownerDocument.defaultView;
  const range = doc.getSelection().getRangeAt(0);
  const prefix = range.cloneRange();
  prefix.selectNodeContents(mainCode);
  prefix.setEnd(range.endContainer, range.endOffset);
  return prefix.toString().length;
}

const setCaret = (pos, parent) => {
  for (const node of parent.childNodes) {
    if (node.nodeType == Node.TEXT_NODE) {
      if (node.length >= pos) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(node, pos);
        // range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return -1;
      } else {
        pos = pos - node.length;
      }
    } else {
      pos = setCaret(pos, node);
      if (pos < 0) {
        return pos;
      }
    }
  }
  return pos;
};
