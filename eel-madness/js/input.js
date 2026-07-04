// Keyboard + pointer unified into one swim intent (see docs/02-movement-and-input.md).
// Physics never knows which device produced it.

const POINTER_DEADZONE = 14;  // px — intent goes inactive within this of the head
const POINTER_ARRIVE = 150;   // px — full throttle beyond this; eases down inside (arrive)

const KEYMAP = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };

export function initInput(onFirstInput) {
  let first = false;
  const firstInput = () => {
    if (!first) { first = true; onFirstInput && onFirstInput(); }
  };

  window.addEventListener('keydown', e => {
    if (KEYMAP[e.code]) {
      keys.add(e.code);
      firstInput();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
  });
  window.addEventListener('blur', () => keys.clear());

  window.addEventListener('pointerdown', e => {
    // UI touches (pause, menu, action buttons) never reach steering.
    if (e.target && e.target.closest && e.target.closest('#ui')) return;
    pointer.active = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    firstInput();
  });
  window.addEventListener('pointermove', e => {
    if (pointer.active) { pointer.x = e.clientX; pointer.y = e.clientY; }
  });
  const release = () => { pointer.active = false; };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
}

// Returns { active, dirX, dirY, throttle, mouth } — dir unit-length, throttle
// in [0,1]. mouth is a placeholder: the game sets it (auto-mouth, docs/02).
export function getIntent(headX, headY) {
  let dx = 0, dy = 0;
  for (const k of keys) { dx += KEYMAP[k][0]; dy += KEYMAP[k][1]; }
  if (dx || dy) {
    const m = Math.hypot(dx, dy);
    return { active: true, dirX: dx / m, dirY: dy / m, throttle: 1, mouth: false };
  }
  if (pointer.active) {
    const tx = pointer.x - headX, ty = pointer.y - headY;
    const d = Math.hypot(tx, ty);
    // Arrive behavior: throttle eases down near the held point so the eel
    // settles there instead of orbiting. Small deadzone against jitter.
    if (d > POINTER_DEADZONE) {
      return { active: true, dirX: tx / d, dirY: ty / d, throttle: Math.min(1, d / POINTER_ARRIVE), mouth: false };
    }
  }
  return { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
}
