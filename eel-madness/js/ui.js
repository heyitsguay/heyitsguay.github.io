// Pause menu (with the axis level meters) + reset + the mobile action buttons
// + the level-up popup queue (see docs/04, docs/07, docs/08). Menu/buttons live
// under #ui (the input layer ignores pointer-downs there); popups live in
// #levelups, pointer-events-free, so steering is unaffected.

import { progress } from './progress.js';
import { AXES, LEVELS, LEVEL_NOTES } from './tuning.js';
import { clamp } from './math.js';

const axisCss = axis => `rgb(${AXES[axis].color.map(c => Math.round(c * 255)).join(',')})`;

export function initUI({ onReset, onGreet, onStart, onSkip, onQuit, skipTitle }) {
  const menu = document.getElementById('menu');
  const pauseBtn = document.getElementById('pause');
  const resumeBtn = document.getElementById('resume');
  const resetBtn = document.getElementById('reset');
  const greetBtn = document.getElementById('btn-greet');
  const uiRoot = document.getElementById('ui');
  const title = document.getElementById('title');
  const titleSave = document.getElementById('title-save');
  const tStart = document.getElementById('t-start');
  const tSkip = document.getElementById('t-skip');
  const tReset = document.getElementById('t-reset');
  const tQuit = document.getElementById('t-quit');

  // Axis meters: level + progress through it, readable at a glance while paused.
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
    fill.style.background = axisCss(axis);
    track.appendChild(fill);
    const lv = document.createElement('span');
    lv.className = 'lv';
    row.append(label, track, lv);
    meters.appendChild(row);
    fills[axis] = { fill, label, lv };
  }
  const refreshMeters = () => {
    for (const [axis, m] of Object.entries(fills)) {
      const preview = axis in progress.override;
      const L = progress.level(axis);
      // fill = progress through the current level (full when pinned/maxed)
      const T = progress.T[axis];
      const frac = (preview || L >= LEVELS.COUNT) ? 1
        : clamp((progress.W[axis] - T[L]) / (T[L + 1] - T[L]), 0, 1);
      m.fill.style.width = `${(frac * 100).toFixed(1)}%`;
      m.lv.textContent = `LV ${L}`;
      // flag URL previews so a pinned axis is never mistaken for real progress
      m.label.textContent = AXES[axis].label + (preview ? ' (preview)' : '');
    }
  };

  // Level-up popups (docs/08): chained, one per level, FIFO. tick() drives the
  // queue from the frame loop, so pausing freezes the chain.
  const luRoot = document.getElementById('levelups');
  const luQueue = [];
  let luEl = null, luAge = 0, luDur = 0;
  const showNext = () => {
    const { axis, level } = luQueue.shift();
    const note = LEVEL_NOTES[axis] && LEVEL_NOTES[axis][level];
    const guide = typeof note === 'object';
    luDur = guide ? LEVELS.GUIDE_T : LEVELS.POP_T;
    luAge = 0;
    luEl = document.createElement('div');
    luEl.className = 'levelup';
    luEl.style.color = axisCss(axis);
    luEl.style.animationDuration = `${luDur}s`;
    const inner = document.createElement('div');
    inner.className = 'lu-inner';
    const pop = document.createElement('div');
    pop.className = 'lu-pop';
    pop.textContent = 'Level Up!';
    const label = document.createElement('div');
    label.className = 'lu-axis';
    label.textContent = `${AXES[axis].label} · LV ${level}`;
    inner.append(pop, label);
    if (note) {
      const line = document.createElement('div');
      line.className = 'lu-note';
      line.textContent = guide ? note.text : note;
      inner.appendChild(line);
    }
    luEl.appendChild(inner);
    luRoot.appendChild(luEl);
  };

  // Title screen (docs/08): shown at boot over the attract-mode sea. Start
  // hands off to main's onStart; Reset is two-step and stays on the title;
  // the saved-sea header lists real per-axis levels (demo only fakes values).
  // URL preview parameters skip the ceremony and load straight in (docs/08).
  let titleShown = !skipTitle;
  uiRoot.hidden = titleShown;
  title.hidden = !titleShown;
  const refreshTitle = () => {
    const has = progress.hasSave();
    tReset.hidden = !has;
    titleSave.hidden = !has;
    tReset.textContent = 'Reset';
    tReset.dataset.armed = '';
    if (has) {
      titleSave.textContent = '';
      const lead = document.createElement('span');
      lead.textContent = 'a saved sea sleeps here';
      titleSave.appendChild(lead);
      const row = document.createElement('div');
      for (const [axis, cfg] of Object.entries(AXES)) {
        const s = document.createElement('span');
        s.className = 'axis-lv';
        s.style.color = axisCss(axis);
        s.textContent = `${cfg.label} LV ${progress.level(axis)}`;
        row.appendChild(s);
      }
      titleSave.appendChild(row);
    }
  };
  refreshTitle();
  const leaveTitle = () => {
    titleShown = false;
    title.hidden = true;
    uiRoot.hidden = false;
  };
  tStart.addEventListener('click', () => {
    leaveTitle();
    onStart && onStart();
  });
  // Skip To The End (docs/08): a maxed-out sandbox — nothing it does is saved,
  // so the pause menu's reset is hidden there (it would wipe the REAL save).
  tSkip.addEventListener('click', () => {
    leaveTitle();
    resetBtn.hidden = true;
    onSkip && onSkip();
  });
  tReset.addEventListener('click', () => {
    tReset.blur();
    if (tReset.dataset.armed) {
      onReset();
      refreshTitle();
    } else {
      tReset.dataset.armed = '1';
      tReset.textContent = 'Really reset?';
    }
  });
  tQuit.addEventListener('click', () => { onQuit && onQuit(); });

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
    if (titleShown) {
      if (e.code === 'Enter' || e.code === 'Space') tStart.click();
      return;   // the title owns the keyboard — no pause toggles behind it
    }
    if (e.code === 'Escape') setPaused(!paused);
  });

  // Reset is two-step: arm, then confirm.
  resetBtn.addEventListener('click', () => {
    resetBtn.blur();
    if (resetBtn.dataset.armed) {
      luQueue.length = 0;   // a blank slate has no queued fanfare
      if (luEl) { luEl.remove(); luEl = null; }
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
    levelUp(ev) { luQueue.push(ev); },
    tick(dt) {
      if (luEl) {
        luAge += dt;
        if (luAge >= luDur) { luEl.remove(); luEl = null; }
      }
      if (!luEl && luQueue.length) showNext();
    },
  };
}
