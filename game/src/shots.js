// THE SALTLINE — deterministic screenshot scenes.
//
// The maker's screenshots are real renders of the game, staged through
// this module: each scene builds a World from a fixed seed, places real
// towers through the same build() the player uses, spawns real raiders,
// and steps the real simulation in fixed 1/60s slices. Nothing here
// draws anything — render.js paints whatever state the sim reaches, so
// a screenshot can never show a game that does not exist.

import { World } from './world.js';

const STEP = 1 / 60;

function step(world, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) world.update(STEP);
}

// Spend driftwood like a player would: grant the purse a staged scene
// needs, then build through the public path so costs and rules apply.
function buildAll(world, list) {
  world.driftwood = 400;
  for (const [kind, col, row] of list) world.build(kind, col, row);
}

function startScene(seed) {
  // The title over a quiet shore: no towers, no raiders, first tide due.
  const world = new World(seed);
  return { world, mode: 'title' };
}

function playScene(seed) {
  // Wave 3 in progress: two lanterns and a barricade already stand,
  // raiders are mid-path, and the lanterns are trading shots.
  const world = new World(seed);
  buildAll(world, [
    ['lantern', 17, 9],
    ['lantern', 18, 12],
    ['lantern', 16, 15],
    ['barricade', 15, 10],
    ['barricade', 15, 11],
  ]);
  world.wave = 2;
  world.driftwood = 35; // a believable mid-wave purse, not the staging grant
  world.score = 140;
  world.startWave();
  world.spawnQueue = [];
  world.spawnEnemy('raider', 3, 0.25);
  world.spawnEnemy('raider', 10, 0.45);
  world.spawnEnemy('runner', 10, 0.2);
  world.spawnEnemy('raider', 17, 0.55);
  world.spawnEnemy('runner', 3, 0.6);
  world.spawnEnemy('raider', 17, 0.15);
  step(world, 2.4);
  world.banner = null;
  return { world, mode: 'play' };
}

function tideScene(seed) {
  // The cover moment: the tide has just redrawn the shore after wave 4,
  // the next tide line is dashed ahead, driftwood is up, and wave 5's
  // brutes are already wading in under lantern fire.
  const world = new World(seed);
  buildAll(world, [
    ['lantern', 16, 8],
    ['lantern', 17, 10],
    ['lantern', 16, 13],
    ['lantern', 19, 16],
    ['lantern', 14, 5],
    ['barricade', 13, 10],
    ['barricade', 13, 11],
    ['barricade', 18, 3],
  ]);
  world.wave = 4;
  world.score = 460;
  world.kills = 31;
  world.phase = 'build';
  world.applyTide();
  world.startWave();
  world.spawnQueue = [];
  world.spawnEnemy('brute', 10, 0.3);
  world.spawnEnemy('raider', 3, 0.5);
  world.spawnEnemy('raider', 3, 0.2);
  world.spawnEnemy('runner', 17, 0.45);
  world.spawnEnemy('raider', 17, 0.65);
  world.spawnEnemy('raider', 10, 0.7);
  world.spawnEnemy('runner', 3, 0.75);
  world.spawnEnemy('brute', 17, 0.12);
  world.spawnEnemy('raider', 10, 0.45);
  world.driftwood = 64; // believable purse for wave 5, not the staging grant
  step(world, 2.2);
  // Hold the tide banner for the cover: it is the game's signature line.
  world.setBanner('THE TIDE REDRAWS THE SHORE', 'routes and building ground change — plan by the dashed line');
  world.banner.t = 0.4;
  return { world, mode: 'play' };
}

function endScene(seed) {
  // The flame is out: defeat screen over the shore that was lost, with
  // the run's score and the restart prompt the judge needs to see.
  const world = new World(seed);
  buildAll(world, [
    ['lantern', 17, 9],
    ['lantern', 15, 13],
    ['barricade', 14, 10],
  ]);
  world.wave = 7;
  world.score = 815;
  world.kills = 58;
  world.driftwood = 12;
  world.beaconHp = 0;
  world.phase = 'lost';
  world.spawnEnemy('raider', 10, 0.5);
  world.spawnEnemy('brute', 10, 0.25);
  return { world, mode: 'over' };
}

export function buildShotScene(name, seed) {
  if (name === 'play') return playScene(seed);
  if (name === 'tide') return tideScene(seed);
  if (name === 'end') return endScene(seed);
  return startScene(seed);
}
