// THE SALTLINE — bootstrap and interaction.
//
// Two ways in: a screenshot scene (?shot=start|play|tide|end&seed=n),
// which stages a deterministic world through shots.js, draws one frame
// and raises window.__shotReady for the capture tool; and the live game
// (?seed=n), a title screen that clicks through to the build/wave loop.
//
// The loop itself is plain requestAnimationFrame: step the world, drain
// its sound events into the synth, draw the frame render.js composes.

import { BTN_BARRICADE, BTN_LANTERN, BTN_START, VIEW_H, VIEW_W } from './config.js';
import { World } from './world.js';
import { drawFrame } from './render.js';
import { cellAt, hitRect, keyIntent, toLogical } from './input.js';
import { SoundFX } from './sound.js';
import { buildShotScene } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const baseSeed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 7;

const sound = new SoundFX();
const ui = { selected: 'lantern', hover: null, mode: 'title', muted: false };

// --- screenshot mode ------------------------------------------------------

const shotName = params.get('shot');
if (shotName) {
  const scene = buildShotScene(shotName, baseSeed);
  ui.mode = scene.mode;
  drawFrame(ctx, scene.world, ui);
  window.__shotReady = true;
} else {
  startLiveGame();
}

// --- live game --------------------------------------------------------------

function startLiveGame() {
  let world = new World(baseSeed);
  ui.mode = 'title';
  let last = performance.now();
  let overSince = 0; // guards the restart click: see handlePoint

  function restart() {
    world = new World(baseSeed);
    ui.mode = 'title';
    ui.selected = 'lantern';
  }

  function handlePoint(x, y) {
    sound.unlock();
    if (ui.mode === 'title') {
      ui.mode = 'play';
      return;
    }
    if (ui.mode === 'over') {
      // The click that lands the killing blow must not also restart the
      // run: the end screen takes clicks only after a short beat.
      if (performance.now() - overSince > 800) restart();
      return;
    }
    // HUD buttons first: they live below the grid.
    if (hitRect(x, y, BTN_LANTERN)) {
      ui.selected = 'lantern';
      return;
    }
    if (hitRect(x, y, BTN_BARRICADE)) {
      ui.selected = 'barricade';
      return;
    }
    if (hitRect(x, y, BTN_START)) {
      if (world.phase === 'build') world.startWave();
      return;
    }
    const cell = cellAt(x, y);
    if (cell && world.phase === 'build') {
      world.build(ui.selected, cell.col, cell.row);
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    const p = toLogical(canvas, ev.clientX, ev.clientY);
    handlePoint(p.x, p.y);
  });

  canvas.addEventListener('pointermove', (ev) => {
    const p = toLogical(canvas, ev.clientX, ev.clientY);
    ui.hover = cellAt(p.x, p.y);
  });

  window.addEventListener('keydown', (ev) => {
    const intent = keyIntent(ev.key);
    if (!intent) return;
    sound.unlock();
    if (intent === 'mute') {
      ui.muted = sound.toggleMute();
      return;
    }
    if (ui.mode !== 'play') {
      if (intent === 'restart' && ui.mode === 'over') restart();
      return;
    }
    if (intent === 'select-lantern') ui.selected = 'lantern';
    if (intent === 'select-barricade') ui.selected = 'barricade';
    if (intent === 'start-wave' && world.phase === 'build') world.startWave();
    if (intent === 'restart' && (world.phase === 'won' || world.phase === 'lost')) restart();
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (ui.mode === 'play') {
      world.update(dt);
      for (const name of world.events) sound.play(name);
      world.events.length = 0;
      if (world.phase === 'won' || world.phase === 'lost') {
        if (ui.mode !== 'over') overSince = now;
        ui.mode = 'over';
      }
    }
    drawFrame(ctx, world, ui);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
