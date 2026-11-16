// THE SALTLINE — boot and the one loop: clicks and keys are read every
// frame, the world advances in fixed steps, and the renderer paints
// what is there. Screens: title, play (build and wave phases inside
// it), paused, won and game over.
//
// ?seed=N fixes the coast and the raiders. ?shot=start|play|tide|end
// (with &seed=N) stages that scene instead of running the loop, paints
// it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_CANNON, EVENT_LEAK, EVENT_LOSE, EVENT_TIDE,
  EVENT_WAVE_CLEAR, EVENT_WIN, PHASE_BUILD,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON,
} from './render.js';
import { stageShot } from './shots.js';
import { sound } from './sound.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { selected: 'lantern', muted: false };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, ui, world);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer);
  const ui = { selected: 'lantern', muted: false };
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function react(events) {
    if (events & EVENT_CANNON) sound.cannon();
    if (events & EVENT_LEAK) {
      sound.leak();
      announce(world.state.beaconHealth === 1 ? 'The flame gutters — 1 left.' : `A raider hit the beacon. Flame ${world.state.beaconHealth}.`);
    }
    if (events & EVENT_TIDE) {
      sound.tideBell();
      announce('The tide has turned. The coast is redrawn.');
    }
    if (events & EVENT_WAVE_CLEAR) announce(`Wave cleared. Wave ${world.state.wave + 1} approaches. Build, then start the wave.`);
    if (events & EVENT_WIN) {
      sound.win();
      screen = SCREEN_WON;
      finishScore();
    }
    if (events & EVENT_LOSE) {
      sound.lose();
      screen = SCREEN_OVER;
      finishScore();
    }
  }

  function finishScore() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(screen === SCREEN_WON ? `The shore holds! Score ${world.state.score}.` : `The flame is out. Score ${world.state.score}. Best ${best}.`);
  }

  function startGame() {
    world.reset();
    ui.selected = 'lantern';
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Build your defenses, then start wave 1. The dashed line is the raiders’ route.');
  }

  function startWave() {
    react(world.startWave());
  }

  function handleInput() {
    for (const click of input.takeClicks()) {
      sound.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) {
        startGame();
        return;
      }
      if (screen !== SCREEN_PLAY) continue;
      if (click.tool !== undefined) {
        if (click.tool === 'start') {
          if (world.state.phase === PHASE_BUILD) startWave();
        } else ui.selected = click.tool;
      } else if (click.cell !== undefined && world.state.phase === PHASE_BUILD) {
        if (world.build(click.cell.c, click.cell.r, ui.selected)) sound.build();
      }
    }
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) ui.muted = sound.toggleMuted();
    if (actions & ACTION_CONFIRM) {
      sound.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_PLAY && world.state.phase === PHASE_BUILD) startWave();
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleInput();
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        react(world.step(STEP));
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, ui, world);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('The Saltline. Click or press Space to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
