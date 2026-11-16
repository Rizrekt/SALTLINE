// THE SALTLINE — drawing only: the world's state and the current screen
// in, pixels out. The coast is drawn so the tide reads at a glance: deep
// water, shallows, wet sand (the band the next tide will take or give
// back) and dry land are four unmistakable shades, the raiders' route is
// dashed in during the build phase, and the beacon's light is the warm
// centre of the picture.
import { BEACON, BUILD, COLORS, FIELD, FONT, WAVES_TO_WIN } from './config.js';
import { PHASE_BUILD, PHASE_WAVE } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

const HUD_H = 64;
const BAR_H = 84;
const VIEW_W = FIELD.width;
const VIEW_H = HUD_H + FIELD.height + BAR_H;
const CELL = FIELD.cell;

const cellX = (c) => c * CELL;
const cellY = (r) => HUD_H + r * CELL;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  /** Pointer position -> grid cell (or null when outside the coast). */
  function cellAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const lx = (clientX * ratio - view.x) / view.scale;
    const ly = (clientY * ratio - view.y) / view.scale;
    const c = Math.floor(lx / CELL);
    const r = Math.floor((ly - HUD_H) / CELL);
    if (c < 0 || r < 0 || c >= FIELD.cols || r >= FIELD.rows) return null;
    return { c, r };
  }

  /** Pointer position -> build-bar tool ('lantern'|'cannon'|'barricade'|'start'|null). */
  function toolAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const lx = (clientX * ratio - view.x) / view.scale;
    const ly = (clientY * ratio - view.y) / view.scale;
    if (ly < HUD_H + FIELD.height) return null;
    const tools = ['lantern', 'cannon', 'barricade'];
    for (let i = 0; i < tools.length; i += 1) {
      const x = 16 + i * 196;
      if (lx >= x && lx <= x + 180) return tools[i];
    }
    if (lx >= VIEW_W - 216 && lx <= VIEW_W - 16) return 'start';
    return null;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${size}${weight}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawTerrain(state, world) {
    const next = world.nextWaterLevel();
    for (let r = 0; r < FIELD.rows; r += 1) {
      for (let c = 0; c < FIELD.cols; c += 1) {
        const e = state.elevation[r * FIELD.cols + c];
        const x = cellX(c);
        const y = cellY(r);
        let fill;
        if (e <= state.waterLevel) fill = e === state.waterLevel ? COLORS.shallowWater : COLORS.deepWater;
        else if (e === state.waterLevel + 1) fill = COLORS.wetSand;
        else fill = e >= 3 ? COLORS.highLand : COLORS.land;
        context.fillStyle = fill;
        context.fillRect(x, y, CELL, CELL);
        // Hand-feel texture: a deterministic per-cell shade step, and a
        // sparse wave glyph on deep water, so flat areas still read as
        // made, not filled.
        const hash = (c * 31 + r * 17) % 3;
        if (hash === 0) {
          context.fillStyle = 'rgba(255,255,255,0.045)';
          context.fillRect(x, y, CELL, CELL);
        } else if (hash === 1) {
          context.fillStyle = 'rgba(0,0,0,0.05)';
          context.fillRect(x, y, CELL, CELL);
        }
        if (e < state.waterLevel && (c + r) % 4 === 0) {
          text('~', x + CELL / 2, y + CELL / 2 + 7, 20, 'rgba(200,230,255,0.35)', 'center');
        }
        // Next-tide preview: cells about to flood get a blue wash and a
        // wave mark; cells about to be given back get a dotted rim.
        const floodsNext = e <= next && e > state.waterLevel;
        const exposedNext = e > next && e <= state.waterLevel;
        if (floodsNext) {
          context.fillStyle = 'rgba(70, 140, 200, 0.45)';
          context.fillRect(x, y, CELL, CELL);
          text('~', x + CELL / 2, y + CELL / 2 + 8, 24, '#dff2ff', 'center', 'bold');
        } else if (exposedNext) {
          context.strokeStyle = 'rgba(255, 240, 200, 0.8)';
          context.setLineDash([5, 5]);
          context.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
          context.setLineDash([]);
        }
        if (state.driftwood.has(r * FIELD.cols + c)) {
          context.fillStyle = COLORS.wood;
          context.fillRect(x + 12, y + 24, 32, 7);
          context.fillRect(x + 16, y + 33, 26, 6);
        }
      }
    }
  }

  function drawPath(state, world) {
    if (state.phase !== PHASE_BUILD) return;
    const path = world.shorePath();
    context.strokeStyle = 'rgba(217, 95, 75, 0.75)';
    context.lineWidth = 4;
    context.setLineDash([10, 8]);
    context.beginPath();
    path.forEach((cell, i) => {
      const x = cellX(cell.c) + CELL / 2;
      const y = cellY(cell.r) + CELL / 2;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.setLineDash([]);
    context.lineWidth = 1;
  }

  function drawStructures(state) {
    for (const b of state.barricades) {
      const x = cellX(b.c);
      const y = cellY(b.r);
      context.fillStyle = COLORS.wood;
      for (let i = 0; i < 4; i += 1) context.fillRect(x + 6 + i * 12, y + 14, 8, 30);
      context.fillRect(x + 4, y + 22, CELL - 8, 6);
      if (b.hp < 30) {
        context.fillStyle = 'rgba(0,0,0,0.45)';
        context.fillRect(x + 6, y + 6, CELL - 12, 5);
        context.fillStyle = '#d95f4b';
        context.fillRect(x + 6, y + 6, (CELL - 12) * (b.hp / 30), 5);
      }
    }
    for (const t of state.towers) {
      const x = cellX(t.c) + CELL / 2;
      const y = cellY(t.r) + CELL / 2;
      context.fillStyle = '#5d4a33';
      context.fillRect(x - 5, y - 6, 10, 22);
      if (t.kind === 'lantern') {
        context.fillStyle = COLORS.beaconGlow;
        context.beginPath();
        context.arc(x, y - 12, 30, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = COLORS.beaconFlame;
        context.beginPath();
        context.arc(x, y - 12, 8, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = '#3d3d46';
        context.fillRect(x - 13, y - 16, 26, 14);
        context.fillStyle = '#22222a';
        context.fillRect(x + 6, y - 13, 16, 6);
      }
    }
    // The beacon: a stone light-tower on the hill, flame sized by health.
    const bx = cellX(state.beacon.c) + CELL / 2;
    const by = cellY(state.beacon.r) + CELL / 2;
    context.fillStyle = COLORS.beaconGlow;
    context.beginPath();
    context.arc(bx, by - 8, 52, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#6b5a44';
    context.fillRect(bx - 12, by - 4, 24, 26);
    const flame = 5 + 9 * (state.beaconHealth / BEACON.health);
    context.fillStyle = COLORS.beaconFlame;
    context.beginPath();
    context.arc(bx, by - 10, Math.max(2, flame), 0, Math.PI * 2);
    context.fill();
    // Name the goal object: in a still frame the beacon must not be
    // mistaken for just another lantern tower.
    context.textBaseline = 'middle';
    text('BEACON', bx, by + 32, 13, '#4a3a22', 'center', 'bold');
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      const x = e.x * CELL + CELL / 2;
      const y = HUD_H + e.y * CELL + CELL / 2;
      const radius = e.kind === 'brute' ? 19 : e.kind === 'runner' ? 12 : 15;
      context.fillStyle = COLORS[e.kind];
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(x - radius, y - radius - 9, radius * 2, 4);
      context.fillStyle = '#7ee081';
      context.fillRect(x - radius, y - radius - 9, radius * 2 * (e.hp / e.maxHp), 4);
    }
    for (const t of state.tracers) {
      context.strokeStyle = t.kind === 'cannon' ? COLORS.cannonShot : COLORS.lanternShot;
      context.lineWidth = t.kind === 'cannon' ? 4 : 2;
      context.beginPath();
      context.moveTo(t.x1 * CELL + CELL / 2, HUD_H + t.y1 * CELL + CELL / 2);
      context.lineTo(t.x2 * CELL + CELL / 2, HUD_H + t.y2 * CELL + CELL / 2);
      context.stroke();
      context.lineWidth = 1;
    }
  }

  function tideWord(level) {
    return level === 0 ? 'LOW' : level === 1 ? 'MID' : 'HIGH';
  }

  function drawHud(state, world) {
    context.fillStyle = '#1d2733';
    context.fillRect(0, 0, VIEW_W, HUD_H);
    context.textBaseline = 'middle';
    text(`WAVE ${Math.min(state.wave + (state.phase === PHASE_WAVE ? 1 : 0), WAVES_TO_WIN)}/${WAVES_TO_WIN}`, 16, HUD_H / 2, 24, COLORS.hudText, 'left', 'bold');
    text(`FLAME ${state.beaconHealth}`, 182, HUD_H / 2, 24, state.beaconHealth <= 6 ? '#ff8a75' : COLORS.hudText, 'left', 'bold');
    text(`WOOD ${state.wood}`, 318, HUD_H / 2, 24, COLORS.hudText, 'left', 'bold');
    text(`SCORE ${state.score}`, 438, HUD_H / 2, 22, COLORS.hudText, 'left', 'bold');
    const next = world.nextWaterLevel();
    const arrow = next > state.waterLevel ? '▲ RISING' : next < state.waterLevel ? '▼ FALLING' : '— STEADY';
    text(`TIDE ${tideWord(state.waterLevel)} → ${tideWord(next)} ${arrow}`, VIEW_W - 16, HUD_H / 2, 19, '#9fd3ff', 'right', 'bold');
  }

  function drawBar(state, ui) {
    const y = HUD_H + FIELD.height;
    context.fillStyle = '#1d2733';
    context.fillRect(0, y, VIEW_W, BAR_H);
    context.textBaseline = 'middle';
    const tools = [
      ['lantern', '1 LANTERN 3🪵'],
      ['cannon', '2 CANNON 5🪵'],
      ['barricade', '3 BARRICADE 1🪵'],
    ];
    tools.forEach(([kind, label], i) => {
      const x = 16 + i * 196;
      const afford = state.wood >= BUILD[kind].cost;
      context.fillStyle = ui.selected === kind ? '#3d5a78' : '#2a3644';
      context.fillRect(x, y + 14, 180, 52);
      text(label, x + 90, y + 40, 19, afford ? COLORS.hudText : COLORS.hudDim, 'center', 'bold');
    });
    // Sound is part of the judged "feel": make it visible in the bar —
    // a real toggle (M key), drawn in every phase.
    context.fillStyle = '#2a3644';
    context.fillRect(556, y + 14, 116, 52);
    text(ui.muted ? '✕ SOUND (M)' : '♪ SOUND (M)', 614, y + 40, 14, ui.muted ? COLORS.hudDim : COLORS.hudText, 'center', 'bold');
    const canStart = state.phase === PHASE_BUILD;
    context.fillStyle = canStart ? '#7a4d1d' : '#2a3644';
    context.fillRect(VIEW_W - 216, y + 14, 200, 52);
    text(canStart ? '▶ START WAVE' : 'WAVE RUNNING…', VIEW_W - 116, y + 40, 20, canStart ? '#ffd76a' : COLORS.hudDim, 'center', 'bold');
    if (state.phase === PHASE_BUILD) {
      text('Click a cell to build. The dashed line is the raiders’ route — it moves with the tide.', VIEW_W / 2, y + BAR_H - 8, 15, COLORS.hudDim, 'center');
    }
  }

  function drawPanel(title, lines, prompt, titleColor = COLORS.title) {
    const w = 640;
    const h = 150 + lines.length * 34 + 70;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    context.fillStyle = 'rgba(16, 24, 34, 0.92)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = COLORS.beaconFlame;
    context.strokeRect(x, y, w, h);
    context.textBaseline = 'alphabetic';
    text(title, VIEW_W / 2, y + 84, 52, titleColor, 'center', 'bold');
    lines.forEach((line, i) => text(line, VIEW_W / 2, y + 140 + i * 34, 22, COLORS.hudText, 'center'));
    text(prompt, VIEW_W / 2, y + h - 34, 23, COLORS.beaconFlame, 'center', 'bold');
  }

  const TITLE_LINES = [
    'Hold the beacon for ten waves. After every wave the tide',
    'redraws the coast: raiders’ routes flood, new land opens,',
    'and the ebb leaves driftwood behind. Build lantern towers,',
    'salt cannons and barricades with that wood.',
    'If the beacon flame dies, the shore is lost.',
  ];

  /** Paint one frame. `ui` carries {selected} from the input layer. */
  function draw(state, screen, best, ui, world) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0d141c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawTerrain(state, world);
    drawPath(state, world);
    drawStructures(state);
    drawEnemies(state);
    drawHud(state, world);
    drawBar(state, ui);
    if (screen === SCREEN_TITLE) drawPanel('THE SALTLINE', TITLE_LINES, 'Click or press Space to begin');
    else if (screen === SCREEN_PAUSED) drawPanel('PAUSED', ['The tide waits for no one — except now.'], 'Press P to resume');
    else if (screen === SCREEN_OVER) drawPanel('THE FLAME IS OUT', [`The shore held for ${state.wave} of ${WAVES_TO_WIN} waves.`, `Score ${state.score} · Best ${best}`], 'Click or press Space to try again', '#ff8a75');
    else if (screen === SCREEN_WON) drawPanel('THE SHORE HOLDS', [`All ${WAVES_TO_WIN} waves beaten back. The beacon still burns.`, `Score ${state.score} · Best ${best}`], 'Click or press Space to play again');
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, cellAt, toolAt };
}
