// THE SALTLINE — the simulation: shore, tide, raiders, towers, beacon.
//
// The one mechanic everything hangs on: after every wave the tide
// redraws the map. The shoreline column moves, cells flood or dry out,
// towers standing in new water are washed away, fresh land leaves
// driftwood behind, and the raiders' path to the beacon is re-walked
// over the new shore. The next shoreline is always computed one wave
// ahead and drawn as a preview line, so the player plans against it.

import {
  BEACON_COL, BEACON_ROW, BEACON_MAX_HP, BARRICADE_MAX_HP, CELL, COLS,
  COSTS, LANES, LANTERN_COOLDOWN, LANTERN_DAMAGE, LANTERN_RANGE,
  PROJECTILE_SPEED, ROWS, SALVAGE, SHORE_MAX, SHORE_MIN, SHORE_START,
  START_DRIFTWOOD, TIDE_SWING, TOTAL_WAVES, WAVE_CLEAR_BONUS,
  enemyStats, waveSize,
} from './config.js';
import { makeRng, rngInt } from './random.js';

let nextId = 1;

export class World {
  constructor(seed) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.time = 0;
    this.wave = 0; // waves started so far
    this.phase = 'build'; // build | wave | won | lost
    this.beaconHp = BEACON_MAX_HP;
    this.driftwood = START_DRIFTWOOD;
    this.score = 0;
    this.kills = 0;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = []; // floating texts: {x, y, text, t, life, color}
    this.events = []; // sound event names, drained by main.js each frame
    this.banner = null; // {text, sub, t, life}
    this.version = 0; // bumped whenever paths must be re-walked

    // The shore is not a straight line: each row keeps its own offset.
    this.rowOffset = [];
    for (let r = 0; r < ROWS; r++) this.rowOffset.push(rngInt(this.rng, -1, 1));
    this.shoreBase = SHORE_START;
    this.nextShoreBase = this.rollShore(this.shoreBase);
    this.tideFlash = 0; // seconds of foam animation left after a redraw

    this.spawnQueue = [];
    this.spawnTimer = 0;
  }

  // --- shore geometry -------------------------------------------------

  shoreAt(row, base = this.shoreBase) {
    const s = base + this.rowOffset[row];
    return Math.max(6, Math.min(COLS, s));
  }

  isWater(col, row, base) {
    return col >= this.shoreAt(row, base);
  }

  isBeaconCell(col, row) {
    return col === BEACON_COL && row === BEACON_ROW;
  }

  rollShore(from) {
    const delta = rngInt(this.rng, -TIDE_SWING, TIDE_SWING);
    return Math.max(SHORE_MIN, Math.min(SHORE_MAX, from + delta));
  }

  towerAt(col, row) {
    return this.towers.find((t) => t.col === col && t.row === row) || null;
  }

  // --- pathfinding ------------------------------------------------------
  // Breadth-first walk over dry cells. Barricades block; lanterns do not.
  // The beacon cell is the goal and is always enterable as the last step.

  findPath(fromCol, fromRow) {
    const key = (c, r) => r * COLS + c;
    const prev = new Map();
    const seen = new Set([key(fromCol, fromRow)]);
    const queue = [[fromCol, fromRow]];
    const goal = key(BEACON_COL, BEACON_ROW);
    while (queue.length) {
      const [c, r] = queue.shift();
      if (key(c, r) === goal) {
        const path = [];
        let k = goal;
        while (k !== undefined) {
          path.push({ col: k % COLS, row: Math.floor(k / COLS) });
          k = prev.get(k);
        }
        return path.reverse();
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const nk = key(nc, nr);
        if (seen.has(nk)) continue;
        if (this.isWater(nc, nr)) continue;
        const tower = this.towerAt(nc, nr);
        if (tower && tower.kind === 'barricade' && nk !== goal) continue;
        seen.add(nk);
        prev.set(nk, key(c, r));
        queue.push([nc, nr]);
      }
    }
    return null;
  }

  // The dry cell where a lane's raiders step ashore.
  landingCell(row) {
    return { col: this.shoreAt(row) - 1, row };
  }

  anyPathExists(extraBlock) {
    for (const row of LANES) {
      const cell = this.landingCell(row);
      if (extraBlock && extraBlock.col === cell.col && extraBlock.row === cell.row) continue;
      if (this.findPath(cell.col, cell.row)) return true;
    }
    return false;
  }

  // --- building ---------------------------------------------------------

  canBuild(kind, col, row) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    if (this.isWater(col, row)) return false;
    if (this.isBeaconCell(col, row)) return false;
    if (this.towerAt(col, row)) return false;
    if (this.driftwood < COSTS[kind]) return false;
    if (kind === 'barricade') {
      // A barricade may narrow the shore but never seal it: at least one
      // landing must keep a path to the beacon with this cell blocked.
      const probe = { kind: 'barricade', col, row, hp: 1 };
      this.towers.push(probe);
      const ok = this.anyPathExists(null);
      this.towers.pop();
      if (!ok) return false;
    }
    return true;
  }

  build(kind, col, row) {
    if (!this.canBuild(kind, col, row)) return false;
    this.driftwood -= COSTS[kind];
    this.towers.push({
      id: nextId++, kind, col, row,
      hp: kind === 'barricade' ? BARRICADE_MAX_HP : 999,
      cooldown: 0,
    });
    this.version++;
    this.events.push('build');
    this.addEffect(col * CELL + CELL / 2, row * CELL, kind === 'lantern' ? 'LANTERN LIT' : 'BARRICADE UP', '#ffd97a');
    return true;
  }

  // --- waves ------------------------------------------------------------

  startWave() {
    if (this.phase !== 'build' || this.wave >= TOTAL_WAVES) return false;
    this.wave++;
    const total = waveSize(this.wave);
    const kinds = [];
    const brutes = this.wave >= 5 ? Math.min(4, this.wave - 4) : 0;
    const runners = this.wave >= 3 ? Math.floor(total / 3) : 0;
    for (let i = 0; i < total - brutes - runners; i++) kinds.push('raider');
    for (let i = 0; i < runners; i++) kinds.push('runner');
    for (let i = 0; i < brutes; i++) kinds.push('brute');
    // Shuffle the march order so lanes and kinds interleave.
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    this.spawnQueue = kinds;
    this.spawnTimer = 0.4;
    this.phase = 'wave';
    this.events.push('waveStart');
    this.setBanner(`WAVE ${this.wave} OF ${TOTAL_WAVES}`, 'the raiders are landing');
    return true;
  }

  spawnEnemy(kind, row, pathFraction = 0) {
    const stats = enemyStats(kind, Math.max(1, this.wave));
    const cell = this.landingCell(row);
    const path = this.findPath(cell.col, cell.row);
    if (!path) return null;
    const idx = Math.min(path.length - 1, Math.floor(pathFraction * path.length));
    const at = path[Math.max(0, idx - 1)] || path[0];
    // A touch of per-raider variance keeps the march from looking like a
    // conveyor belt; it comes from the world stream, so seeds stay exact.
    const pace = 0.9 + this.rng() * 0.2;
    const enemy = {
      id: nextId++, kind, row,
      x: at.col * CELL + CELL / 2, y: at.row * CELL + CELL / 2,
      hp: stats.hp, maxHp: stats.hp, speed: stats.speed * pace,
      damage: stats.damage, bounty: stats.bounty, radius: stats.radius,
      path, pathI: Math.max(1, idx), pathVersion: this.version,
      wobble: this.rng() * Math.PI * 2,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  // --- the tide -----------------------------------------------------------

  applyTide() {
    const oldBase = this.shoreBase;
    this.shoreBase = this.nextShoreBase;
    this.nextShoreBase = this.rollShore(this.shoreBase);
    this.tideFlash = 1.4;
    this.version++;
    this.events.push('tide');

    // Towers the sea now covers are washed away, returning some wood.
    let salvaged = 0;
    this.towers = this.towers.filter((t) => {
      if (this.isWater(t.col, t.row)) {
        salvaged++;
        this.addEffect(t.col * CELL + CELL / 2, t.row * CELL, 'WASHED AWAY', '#cfe8dd');
        return false;
      }
      return true;
    });
    if (salvaged) this.driftwood += salvaged * SALVAGE;

    // Raiders caught standing where the sea now reaches are swept off
    // the shore with it — no bounty, but no threat either. The tide is
    // a weapon for whoever reads the dashed line better.
    this.enemies = this.enemies.filter((e) => {
      const col = Math.floor(e.x / CELL);
      const row = Math.floor(e.y / CELL);
      if (this.isWater(col, row)) {
        this.addEffect(e.x, e.y, 'SWEPT AWAY', '#a0e1ff');
        return false;
      }
      return true;
    });

    // Land the tide uncovers is littered with driftwood: free timber.
    const exposed = Math.max(0, this.shoreBase - oldBase) * ROWS;
    const found = exposed > 0 ? Math.round(exposed * 0.9) + rngInt(this.rng, 0, 6) : rngInt(this.rng, 2, 7);
    this.driftwood += found;

    const dir = this.shoreBase > oldBase ? 'falls' : this.shoreBase < oldBase ? 'rises' : 'holds';
    this.setBanner(
      'THE TIDE REDRAWS THE SHORE',
      `the tide ${dir} — driftwood +${found}${salvaged ? `, ${salvaged} tower(s) lost` : ''}`,
    );
  }

  setBanner(text, sub) {
    this.banner = { text, sub, t: 0, life: 2.6 };
  }

  addEffect(x, y, text, color) {
    this.effects.push({ x, y, text, color, t: 0, life: 1.1 });
  }

  // --- per-frame update ---------------------------------------------------

  update(dt) {
    this.time += dt;
    if (this.tideFlash > 0) this.tideFlash -= dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < fx.life);
    if (this.phase === 'won' || this.phase === 'lost') return;

    // Spawning.
    if (this.phase === 'wave' && this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const kind = this.spawnQueue.shift();
        const row = LANES[Math.floor(this.rng() * LANES.length)];
        this.spawnEnemy(kind, row, 0);
        this.spawnTimer = 1.05;
      }
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);

    // Wave cleared?
    if (this.phase === 'wave' && !this.spawnQueue.length && !this.enemies.length) {
      this.score += WAVE_CLEAR_BONUS;
      if (this.wave >= TOTAL_WAVES) {
        this.phase = 'won';
        this.events.push('win');
        this.setBanner('THE BEACON BURNS ON', 'you held the Saltline through ten waves');
      } else {
        this.phase = 'build';
        this.applyTide();
      }
    }
  }

  updateEnemies(dt) {
    const beaconX = BEACON_COL * CELL + CELL / 2;
    const beaconY = BEACON_ROW * CELL + CELL / 2;
    for (const e of this.enemies) {
      if (e.pathVersion !== this.version) {
        const cell = { col: Math.floor(e.x / CELL), row: Math.floor(e.y / CELL) };
        const path = this.findPath(
          Math.max(0, Math.min(COLS - 1, cell.col)),
          Math.max(0, Math.min(ROWS - 1, cell.row)),
        );
        if (path) {
          e.path = path;
          e.pathI = 1;
          e.pathVersion = this.version;
        }
      }
      const target = e.path[Math.min(e.pathI, e.path.length - 1)];
      if (!target) continue;
      const tx = target.col * CELL + CELL / 2;
      const ty = target.row * CELL + CELL / 2;
      const dx = tx - e.x;
      const dy = ty - e.y;
      const dist = Math.hypot(dx, dy);
      const step = e.speed * dt;
      if (dist <= Math.max(2, step)) {
        e.x = tx;
        e.y = ty;
        e.pathI++;
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
      // Reached the beacon: strike the flame and vanish into the surf.
      if (Math.hypot(beaconX - e.x, beaconY - e.y) < 14 && e.pathI >= e.path.length) {
        e.hp = 0;
        e.struck = true;
        this.beaconHp -= e.damage;
        this.events.push('beaconHit');
        this.addEffect(beaconX, beaconY - 24, `BEACON -${e.damage}`, '#e2483d');
        if (this.beaconHp <= 0) {
          this.beaconHp = 0;
          this.phase = 'lost';
          this.events.push('lose');
          this.setBanner('THE FLAME IS OUT', 'the shore is lost');
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  updateTowers(dt) {
    for (const t of this.towers) {
      if (t.kind !== 'lantern') continue;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const cx = t.col * CELL + CELL / 2;
      const cy = t.row * CELL + CELL / 2;
      // Fire on the raider closest to the beacon (deepest along its path).
      let best = null;
      let bestProgress = -1;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d > LANTERN_RANGE) continue;
        const progress = e.pathI * 1000 - d;
        if (progress > bestProgress) {
          bestProgress = progress;
          best = e;
        }
      }
      if (best) {
        t.cooldown = LANTERN_COOLDOWN;
        this.projectiles.push({
          id: nextId++, x: cx, y: cy - 8, target: best,
          damage: LANTERN_DAMAGE, speed: PROJECTILE_SPEED,
        });
        this.events.push('shoot');
      }
    }
  }

  updateProjectiles(dt) {
    const alive = [];
    for (const p of this.projectiles) {
      const target = p.target;
      if (!target || target.hp <= 0) continue;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= Math.max(3, step)) {
        target.hp -= p.damage;
        this.events.push('hit');
        if (target.hp <= 0 && !target.struck) {
          this.kills++;
          this.score += 10 + this.wave;
          this.driftwood += target.bounty;
          this.events.push('die');
          this.addEffect(target.x, target.y - 14, `+${target.bounty} WOOD`, '#ffd97a');
        }
        continue;
      }
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      alive.push(p);
    }
    this.projectiles = alive;
  }
}
