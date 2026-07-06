// Keyboard + pointer unified into one swim intent (see docs/02-movement-and-input.md).
// Physics never knows which device produced it.

const POINTER_DEADZONE = 14;  // px — intent goes inactive within this of the head
const POINTER_ARRIVE = 150;   // px — full throttle beyond this; eases down inside (arrive)

// The virtual joystick (touch devices, docs/02, 2026-07-05): the pad is a
// fixed ZONE — the stick origin floats to wherever the touch first lands
// inside it, and the intent vector runs from that origin to the drag point.
const JOY_R = 48;             // px of drag for full throttle
const JOY_DEADZONE = 8;       // px — micro-wobble around the origin is idle
const JOY_NUB_MAX = 52;       // px — how far the visual nub travels

const KEYMAP = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };
let steerPtr = null;   // field steering belongs to one pointer at a time
const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
let coarse = false;    // touch device — the joystick is the steering there
let greetQueued = false;
let shiftHeld = false;
let flareHeld = false;   // J — the eel-light flare (docs/10)

// Edge-triggered greet (I key / the touch button via ui.js → main).
export function consumeGreet() {
  const g = greetQueued;
  greetQueued = false;
  return g;
}

// Speed-burst want (docs/02): Shift held. (The two-finger touch gesture is
// retired, 2026-07-05 — the sprint button goes through ui.js → main, like
// greet and flare.)
export function getBoost() {
  return shiftHeld;
}

// Eel-light flare want (docs/10): J held. The touch ✦ button goes through
// ui.js → main, same as greet.
export function getFlare() {
  return flareHeld;
}

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
    } else if (e.code === 'KeyI') {
      greetQueued = true;
      firstInput();
    } else if (e.code === 'KeyJ') {
      flareHeld = true;
      firstInput();
    } else if (e.key === 'Shift') {
      shiftHeld = true;
    }
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'KeyJ') flareHeld = false;
    if (e.key === 'Shift') shiftHeld = false;
  });
  window.addEventListener('blur', () => {
    keys.clear();
    shiftHeld = false;
    flareHeld = false;
    steerPtr = null;
    pointer.active = false;
  });

  // On touch devices the joystick is the ONE steering authority (docs/02,
  // 2026-07-05): field touches do nothing, which keeps the tap gesture free
  // (a future "aim") and stray touches from darting the eel. Mouse (and pen)
  // press-and-hold steering is unchanged.
  coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  window.addEventListener('pointerdown', e => {
    // UI touches (pause, menu, action buttons, the joypad) never reach here.
    if (e.target && e.target.closest && e.target.closest('#ui')) return;
    if (coarse && e.pointerType === 'touch') return;   // joystick-only on touch
    // Steering locks to one pointer: another button/finger must never move
    // the target or inherit steering when it lifts.
    if (steerPtr === null) {
      steerPtr = e.pointerId;
      pointer.active = true;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    firstInput();
  });
  window.addEventListener('pointermove', e => {
    if (pointer.active && e.pointerId === steerPtr) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
  });
  const release = e => {
    if (e.pointerId === steerPtr) {
      steerPtr = null;
      pointer.active = false;
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // The joystick pad. Origin = first contact point inside the pad; the nub
  // rides the clamped drag vector as feedback. Pointer capture keeps the
  // stick tracking even when the finger wanders off the pad.
  const pad = document.getElementById('joypad');
  const nub = document.getElementById('joynub');
  if (pad && nub) {
    let cx = 0, cy = 0;   // pad center (client px), cached on grab
    const setNub = () => {
      const d = Math.hypot(joy.dx, joy.dy) || 1;
      const k = Math.min(1, JOY_NUB_MAX / d);
      nub.style.transform = `translate(${(joy.ox - cx + joy.dx * k).toFixed(1)}px, ${(joy.oy - cy + joy.dy * k).toFixed(1)}px)`;
    };
    pad.addEventListener('pointerdown', e => {
      if (joy.active) return;   // one finger owns the stick
      e.preventDefault();
      const r = pad.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      joy.active = true;
      joy.id = e.pointerId;
      joy.ox = e.clientX;
      joy.oy = e.clientY;
      joy.dx = 0;
      joy.dy = 0;
      pad.classList.add('live');
      pad.setPointerCapture(e.pointerId);
      setNub();
      firstInput();
    });
    pad.addEventListener('pointermove', e => {
      if (!joy.active || e.pointerId !== joy.id) return;
      joy.dx = e.clientX - joy.ox;
      joy.dy = e.clientY - joy.oy;
      setNub();
    });
    const joyEnd = e => {
      if (e.pointerId !== joy.id) return;
      joy.active = false;
      joy.id = null;
      pad.classList.remove('live');
      nub.style.transform = '';
    };
    pad.addEventListener('pointerup', joyEnd);
    pad.addEventListener('pointercancel', joyEnd);
  }
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
  if (joy.active) {
    // Stick vector → intent: direction from the drag, throttle ramping to
    // full at JOY_R px. Inside the deadzone the eel just glides.
    const d = Math.hypot(joy.dx, joy.dy);
    if (d > JOY_DEADZONE) {
      return {
        active: true, dirX: joy.dx / d, dirY: joy.dy / d,
        throttle: Math.min(1, (d - JOY_DEADZONE) / (JOY_R - JOY_DEADZONE)),
        mouth: false,
      };
    }
    return { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
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
