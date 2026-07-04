// Pause menu (with the axis meters) + reset + the mobile action buttons
// (see docs/04, docs/07). Everything lives under #ui; the input layer ignores
// pointer-downs here.

import { progress } from './progress.js';
import { AXES } from './tuning.js';

export function initUI({ onReset, onGreet }) {
  const menu = document.getElementById('menu');
  const pauseBtn = document.getElementById('pause');
  const resumeBtn = document.getElementById('resume');
  const resetBtn = document.getElementById('reset');
  const greetBtn = document.getElementById('btn-greet');

  // Axis meters: the progression state, readable at a glance while paused.
  const meters = document.getElementById('meters');
  const fills = {};
  for (const [axis, cfg] of Object.entries(AXES)) {
    const row = document.createElement('div');
    row.className = 'meter';
    const label = document.createElement('span');
    label.textContent = cfg.label;
    const track = document.createElement('div');
    track.className = 'track';
    const fill = document.createElement('div');
    fill.className = 'fill';
    fill.style.background = `rgb(${cfg.color.map(c => Math.round(c * 255)).join(',')})`;
    track.appendChild(fill);
    row.append(label, track);
    meters.appendChild(row);
    fills[axis] = { fill, label };
  }
  const refreshMeters = () => {
    for (const [axis, m] of Object.entries(fills)) {
      m.fill.style.width = `${(progress.value(axis) * 100).toFixed(1)}%`;
      // flag URL previews so a pinned axis is never mistaken for real progress
      m.label.textContent = AXES[axis].label + (axis in progress.override ? ' (preview)' : '');
    }
  };

  let paused = false;
  const setPaused = p => {
    paused = p;
    menu.hidden = !p;
    if (p) refreshMeters();   // fresh meters each open
    resetBtn.textContent = 'Reset progress';
    resetBtn.dataset.armed = '';
  };

  pauseBtn.addEventListener('click', () => { pauseBtn.blur(); setPaused(!paused); });
  resumeBtn.addEventListener('click', () => { resumeBtn.blur(); setPaused(false); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') setPaused(!paused);
  });

  // Reset is two-step: arm, then confirm.
  resetBtn.addEventListener('click', () => {
    resetBtn.blur();
    if (resetBtn.dataset.armed) {
      onReset();
      refreshMeters();
      setPaused(false);
    } else {
      resetBtn.dataset.armed = '1';
      resetBtn.textContent = 'Really reset?';
    }
  });

  // The mouth is automatic (food.probe → intent.mouth, docs/02) — no eat
  // button. The greet button appears on touch devices once the greet dial
  // unlocks (main drives visibility via showGreet).
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let greetShown = false;
  greetBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    onGreet && onGreet();
  });

  return {
    paused: () => paused,
    showGreet(v) {
      const want = !!v && coarse;
      if (want !== greetShown) {
        greetShown = want;
        greetBtn.hidden = !want;
      }
    },
  };
}
