// THE SALTLINE — the rules and the state, with no drawing and no browser
// in it: a grid coast, a tide that redraws it after every wave, raiders
// who path over land (and wade, slowly, when the land runs out), towers
// and barricades bought with driftwood, and the beacon's flame.
// step() advances one fixed step and returns what happened as bit flags.
// All randomness comes from the injected seeded generator, in a fixed
// order, so the same seed always plays the same game.
import { BEACON, BUILD, FIELD, START_WOOD, TIDE_BY_WAVE, WAVES_TO_WIN, WOOD_PER_WAVE } from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_CANNON = 2;
export const EVENT_LEAK = 4; // a raider reached the beacon
export const EVENT_TIDE = 8; // the water level changed
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_WIN = 32;
export const EVENT_LOSE = 64;
export const EVENT_BUILD = 128;

export const PHASE_BUILD = 'build';
export const PHASE_WAVE = 'wave';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

const ENEMY_TYPES = {
  raider: { hp: 6, speed: 0.95, damage: 1, score: 10 },
  runner: { hp: 4, speed: 1.65, damage: 1, score: 15 },
  brute: { hp: 26, speed: 0.55, damage: 3, score: 30 },
};

const TOWER_TYPES = {
  lantern: { range: 2.6, rate: 2.0, damage: 1 },
  cannon: { range: 3.3, rate: 0.55, damage: 6 },
};

const BARRICADE_HP = 30;
/** Path cost of a barricaded cell: avoided unless there is no other way. */
const BARRICADE_COST = 40;
/** Driftwood chance on a cell the falling tide has just exposed. */
const DRIFTWOOD_CHANCE = 0.6;

const idx = (c, r) => r * FIELD.cols + c;
const inGrid = (c, r) => c >= 0 && r >= 0 && c < FIELD.cols && r < FIELD.rows;

export function createWorld(random) {
  // --- terrain: a designed coast, jittered by the seed -----------------
  // Elevation rises from the western sea to the eastern beacon hill, with
  // a lagoon carved mid-map that only floods at high tide.
  const elevation = new Array(FIELD.cols * FIELD.rows).fill(0);
  const beacon = { c: FIELD.cols - 2, r: Math.floor(FIELD.rows / 2) };
  for (let r = 0; r < FIELD.rows; r += 1) {
    for (let c = 0; c < FIELD.cols; c += 1) {
      let e = c < 3 ? 0 : c < 6 ? 1 : c < 10 ? 2 : c < 13 ? 2 : 3;
      if (c >= 6 && c <= 9 && r >= 4 && r <= 6) e = 0; // the lagoon
      if (c >= 3 && c <= 12 && random() < 0.22) e = Math.max(0, e - 1);
      elevation[idx(c, r)] = e;
    }
  }
  elevation[idx(beacon.c, beacon.r)] = 3;

  const state = {
    elevation,
    beacon,
    waterLevel: TIDE_BY_WAVE[0],
    wave: 0, // waves completed
    phase: PHASE_BUILD,
    wood: START_WOOD,
    score: 0,
    beaconHealth: BEACON.health,
    towers: [], // {c, r, kind, cooldown}
    barricades: [], // {c, r, hp}
    enemies: [], // {x, y, hp, maxHp, kind, path, next, attackCd}
    tracers: [], // {x1, y1, x2, y2, ttl, kind}
    driftwood: new Set(), // cell indexes holding driftwood right now
    spawnQueue: [],
    spawnTimer: 0,
    elapsed: 0,
    kills: 0,
  };

  const isWater = (c, r) => elevation[idx(c, r)] <= state.waterLevel;
  const barricadeAt = (c, r) => state.barricades.find((b) => b.c === c && b.r === r) ?? null;
  const towerAt = (c, r) => state.towers.find((t) => t.c === c && t.r === r) ?? null;

  /** The water level the NEXT wave will play at (shown to the player). */
  function nextWaterLevel() {
    const nextWave = Math.min(state.wave + 1, WAVES_TO_WIN);
    return TIDE_BY_WAVE[nextWave - 1] ?? state.waterLevel;
  }

  /** Dijkstra over the grid: land 1, shallow 2.5, deep 5, barricade 40. */
  function findPath(fromC, fromR) {
    const total = FIELD.cols * FIELD.rows;
    const dist = new Array(total).fill(Infinity);
    const prev = new Array(total).fill(-1);
    const done = new Array(total).fill(false);
    const start = idx(fromC, fromR);
    const goal = idx(beacon.c, beacon.r);
    dist[start] = 0;
    for (let n = 0; n < total; n += 1) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < total; i += 1) {
        if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      }
      if (u === -1 || u === goal) break;
      done[u] = true;
      const uc = u % FIELD.cols;
      const ur = Math.floor(u / FIELD.cols);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const vc = uc + dc;
        const vr = ur + dr;
        if (!inGrid(vc, vr)) continue;
        const v = idx(vc, vr);
        let cost = 1;
        if (barricadeAt(vc, vr) !== null) cost = BARRICADE_COST;
        else if (isWater(vc, vr)) cost = elevation[v] === state.waterLevel ? 2.5 : 5;
        if (dist[u] + cost < dist[v]) {
          dist[v] = dist[u] + cost;
          prev[v] = u;
        }
      }
    }
    const path = [];
    let cur = goal;
    while (cur !== -1) {
      path.push({ c: cur % FIELD.cols, r: Math.floor(cur / FIELD.cols) });
      if (cur === start) break;
      cur = prev[cur];
    }
    path.reverse();
    return path;
  }

  /** The route from the busiest spawn shore to the beacon, for display. */
  function shorePath() {
    return findPath(0, beacon.r);
  }

  function canBuild(c, r, kind) {
    if (!inGrid(c, r)) return false;
    if (c === beacon.c && r === beacon.r) return false;
    if (isWater(c, r)) return false;
    if (towerAt(c, r) !== null || barricadeAt(c, r) !== null) return false;
    if (kind !== 'barricade' && c === 0) return false; // towers need footing ashore
    return state.wood >= BUILD[kind].cost;
  }

  function build(c, r, kind) {
    if (!canBuild(c, r, kind)) return false;
    state.wood -= BUILD[kind].cost;
    if (kind === 'barricade') state.barricades.push({ c, r, hp: BARRICADE_HP });
    else state.towers.push({ c, r, kind, cooldown: 0 });
    for (const enemy of state.enemies) enemy.path = findPath(Math.round(enemy.x), Math.round(enemy.y));
    return true;
  }

  function planWave() {
    const wave = state.wave + 1;
    const queue = [];
    const count = 6 + wave * 3;
    for (let i = 0; i < count; i += 1) {
      let kind = 'raider';
      const roll = random();
      if (wave >= 5 && roll < 0.16) kind = 'brute';
      else if (wave >= 3 && roll < 0.45) kind = 'runner';
      queue.push(kind);
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0;
  }

  function startWave() {
    if (state.phase !== PHASE_BUILD) return 0;
    let events = 0;
    const target = nextWaterLevel();
    if (target !== state.waterLevel) {
      const falling = target < state.waterLevel;
      state.waterLevel = target;
      events |= EVENT_TIDE;
      if (falling) {
        // The tide gives back land — and leaves driftwood on it.
        for (let i = 0; i < elevation.length; i += 1) {
          if (elevation[i] === target + 1 && random() < DRIFTWOOD_CHANCE) state.driftwood.add(i);
        }
      }
    }
    planWave();
    state.phase = PHASE_WAVE;
    return events;
  }

  function collectDriftwood() {
    const gained = state.driftwood.size;
    state.driftwood.clear();
    return gained;
  }

  function spawnEnemy() {
    const kind = state.spawnQueue.shift();
    const spec = ENEMY_TYPES[kind];
    const hpScale = 1 + 0.15 * state.wave;
    // Raiders land anywhere along the western shore.
    const r = Math.floor(random() * FIELD.rows);
    const enemy = {
      x: -0.6,
      y: r,
      hp: Math.round(spec.hp * hpScale),
      maxHp: Math.round(spec.hp * hpScale),
      kind,
      path: findPath(0, r),
      next: 1,
      attackCd: 0,
    };
    enemy.path = findPath(0, r);
    state.enemies.push(enemy);
  }

  function enemyProgress(enemy) {
    const remain = enemy.path.length - enemy.next;
    const target = enemy.path[Math.min(enemy.next, enemy.path.length - 1)];
    const dx = target.c - enemy.x;
    const dy = target.r - enemy.y;
    return -(remain * 10 + Math.hypot(dx, dy));
  }

  function stepWave(dt) {
    let events = 0;
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        state.spawnTimer = 1.1;
      }
    }
    // Towers fire at the most advanced enemy in range.
    for (const tower of state.towers) {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const spec = TOWER_TYPES[tower.kind];
      let bestEnemy = null;
      let bestProgress = -Infinity;
      for (const enemy of state.enemies) {
        const d = Math.hypot(enemy.x - tower.c, enemy.y - tower.r);
        if (d <= spec.range && enemyProgress(enemy) > bestProgress) {
          bestProgress = enemyProgress(enemy);
          bestEnemy = enemy;
        }
      }
      if (bestEnemy !== null) {
        tower.cooldown = 1 / spec.rate;
        bestEnemy.hp -= spec.damage;
        state.tracers.push({
          x1: tower.c, y1: tower.r, x2: bestEnemy.x, y2: bestEnemy.y,
          ttl: 0.09, kind: tower.kind,
        });
        events |= tower.kind === 'cannon' ? EVENT_CANNON : EVENT_SHOOT;
      }
    }
    // Enemies advance, wade, batter barricades, or strike the beacon.
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const spec = ENEMY_TYPES[enemy.kind];
      if (enemy.next >= enemy.path.length) {
        state.beaconHealth -= spec.damage;
        enemy.hp = 0;
        enemy.leaked = true;
        events |= EVENT_LEAK;
        continue;
      }
      const target = enemy.path[enemy.next];
      const blocker = barricadeAt(target.c, target.r);
      const dx = target.c - enemy.x;
      const dy = target.r - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (blocker !== null && dist < 0.55) {
        enemy.attackCd -= dt;
        if (enemy.attackCd <= 0) {
          enemy.attackCd = 0.8;
          blocker.hp -= 4;
          if (blocker.hp <= 0) {
            state.barricades = state.barricades.filter((b) => b !== blocker);
            for (const other of state.enemies) other.path = findPath(Math.round(other.x), Math.round(other.y));
          }
        }
        continue;
      }
      const wading = isWater(Math.round(enemy.x), Math.round(enemy.y));
      const speed = spec.speed * (wading ? 0.45 : 1);
      const move = Math.min(dist, speed * dt);
      if (dist > 0.001) {
        enemy.x += (dx / dist) * move;
        enemy.y += (dy / dist) * move;
      }
      if (dist - move < 0.05) enemy.next += 1;
    }
    // Reap the dead.
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 && !enemy.leaked) {
        state.score += ENEMY_TYPES[enemy.kind].score;
        state.kills += 1;
      }
    }
    state.enemies = state.enemies.filter((e) => e.hp > 0);
    if (state.beaconHealth <= 0) {
      state.beaconHealth = 0;
      state.phase = PHASE_LOST;
      events |= EVENT_LOSE;
      return events;
    }
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.wave += 1;
      state.wood += WOOD_PER_WAVE + collectDriftwood();
      if (state.wave >= WAVES_TO_WIN) {
        state.phase = PHASE_WON;
        events |= EVENT_WIN;
      } else {
        state.phase = PHASE_BUILD;
        events |= EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  /** One fixed step. In build phase the world idles (render ambience). */
  function step(dt) {
    state.elapsed += dt;
    for (const tracer of state.tracers) tracer.ttl -= dt;
    state.tracers = state.tracers.filter((t) => t.ttl > 0);
    if (state.phase === PHASE_WAVE) return stepWave(dt);
    return 0;
  }

  function reset() {
    state.waterLevel = TIDE_BY_WAVE[0];
    state.wave = 0;
    state.phase = PHASE_BUILD;
    state.wood = START_WOOD;
    state.score = 0;
    state.beaconHealth = BEACON.health;
    state.towers = [];
    state.barricades = [];
    state.enemies = [];
    state.tracers = [];
    state.driftwood = new Set();
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.elapsed = 0;
    state.kills = 0;
  }

  return {
    state, reset, step, startWave, build, canBuild, isWater,
    nextWaterLevel, shorePath, barricadeAt, towerAt,
  };
}
