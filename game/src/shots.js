// THE SALTLINE — the screenshot scenes behind ?shot=start|play|tide|end.
// Each scene plays the real rules forward from a fresh world, steered by
// a deterministic autopilot builder, so the frame is what a real game
// looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { PHASE_BUILD, PHASE_LOST, PHASE_WAVE, PHASE_WON } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

/**
 * The autopilot's build policy: lanterns on high dry ground beside the
 * raiders' route (eastern half first — the last ground before the
 * beacon), then a cannon when rich, then barricades on the route itself
 * while wood remains.
 */
function autopilotBuild(world) {
  const { state } = world;
  for (let guard = 0; guard < 40; guard += 1) {
    const path = world.shorePath();
    const nearRoute = new Set(path.map((p) => `${p.c},${p.r}`));
    const candidates = [];
    for (let r = 0; r < FIELD.rows; r += 1) {
      for (let c = 0; c < FIELD.cols; c += 1) {
        const dry = !world.isWater(c, r) && world.towerAt(c, r) === null && world.barricadeAt(c, r) === null;
        if (!dry) continue;
        let beside = 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (nearRoute.has(`${c + dc},${r + dr}`)) beside += 1;
        }
        candidates.push({ c, r, beside, elev: state.elevation[r * FIELD.cols + c], onPath: nearRoute.has(`${c},${r}`) });
      }
    }
    const lanternSpots = candidates
      .filter((s) => !s.onPath && s.beside > 0)
      .sort((a, b) => b.beside - a.beside || b.elev - a.elev || b.c - a.c);
    // Towers before walls, always: a barricade bought with lantern money
    // is how the first autopilot starved. Walls only once two towers
    // stand, and only from what is left after tower money.
    if (state.wood >= 3 && lanternSpots.length > 0) {
      if (world.build(lanternSpots[0].c, lanternSpots[0].r, 'lantern')) continue;
    }
    if (state.wood >= 5 && state.towers.length >= 2 && lanternSpots.length > 1) {
      if (world.build(lanternSpots[1].c, lanternSpots[1].r, 'cannon')) continue;
    }
    const walls = candidates.filter((s) => s.onPath && s.c < FIELD.cols - 2);
    if (state.wood >= 1 && state.towers.length >= 2 && walls.length > 0) {
      if (world.build(walls[walls.length - 1].c, walls[walls.length - 1].r, 'barricade')) continue;
    }
    break;
  }
}

/** Play forward until `stop(state)` or the step cap. With `buildOnce`,
 * the autopilot builds only in the first build phase and never again —
 * the abandoned shore the end scene needs. */
function playUntil(world, stop, capSeconds, buildOnce = false) {
  const cap = Math.floor(capSeconds / STEP);
  let built = false;
  for (let i = 0; i < cap; i += 1) {
    if (stop(world.state)) return;
    if (world.state.phase === PHASE_BUILD) {
      if (!buildOnce || !built) {
        autopilotBuild(world);
        built = true;
      }
      world.startWave();
    }
    world.step(STEP);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: a prepared coast under the title. play: wave 1 mid-fight.
 * tide: the build phase before the first HIGH tide (wave 5) — the flood
 * preview and the redrawn route are the picture. end: a lost shore.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    autopilotBuild(world);
    world.startWave();
    playUntil(world, (s) => s.phase !== PHASE_WAVE || s.elapsed > 21, 60);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'tide') {
    playUntil(world, (s) => (s.phase === PHASE_BUILD && s.wave === 4) || s.phase === PHASE_LOST || s.phase === PHASE_WON, 600);
    return { screen: world.state.phase === PHASE_LOST ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    // A shore defended once and then abandoned: the flame goes out.
    playUntil(world, (s) => s.phase === PHASE_LOST || s.phase === PHASE_WON, 900, true);
    return { screen: world.state.phase === PHASE_WON ? SCREEN_WON : SCREEN_OVER, best: 0 };
  }
  autopilotBuild(world);
  for (let i = 0; i < 3 / STEP; i += 1) world.step(STEP);
  return { screen: SCREEN_TITLE, best: 0 };
}
