// THE SALTLINE — every pixel the player sees.
//
// Canvas 2D, drawn fresh each frame from the world state: sand and sea
// split by the shoreline, a dashed preview of the NEXT tide line, the
// beacon and its flame on the headland, lantern towers with visible
// range rings, raiders wading ashore, light-bolt projectiles, floating
// reward text, and the HUD bar with wave / beacon / driftwood / score /
// tide phase / sound state. Title and end screens draw over the shore.

import {
  BEACON_COL, BEACON_MAX_HP, BEACON_ROW, BTN_BARRICADE, BTN_LANTERN,
  BTN_START, CELL, COLORS, COLS, COSTS, GRID_H, HUD_Y, ROWS,
  TOTAL_WAVES, VIEW_H, VIEW_W,
} from './config.js';
import { cellHash } from './random.js';

function cellCenter(col, row) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

// --- terrain ------------------------------------------------------------

function drawTerrain(ctx, world) {
  // Sand first, edge to edge; the sea is painted over it row by row so
  // the shoreline keeps its per-row offsets.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(0, 0, VIEW_W, GRID_H);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const h = cellHash(c, r);
      if (h < 0.24) {
        ctx.fillStyle = 'rgba(138,109,59,0.25)';
        ctx.fillRect(c * CELL + 4 + h * 40, r * CELL + 6 + h * 30, 3, 2);
      }
      if (h > 0.93) {
        // A driftwood pile drying on the sand: pure decoration, drawn
        // from the cell hash so it never swims between frames.
        ctx.strokeStyle = COLORS.woodDark;
        ctx.lineWidth = 2;
        const x = c * CELL + 8;
        const y = r * CELL + 18;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y - 3);
        ctx.moveTo(x + 2, y + 4);
        ctx.lineTo(x + 15, y + 2);
        ctx.stroke();
      }
    }
  }

  // Sea: two blues banded by distance from the shore, foam at the edge.
  for (let r = 0; r < ROWS; r++) {
    const shore = world.shoreAt(r);
    for (let c = shore; c < COLS; c++) {
      ctx.fillStyle = c - shore < 2 ? COLORS.waterShallow : COLORS.waterDeep;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      const h = cellHash(c * 3 + 1, r * 5 + 2);
      if (h > 0.82) {
        ctx.fillStyle = 'rgba(207,232,221,0.35)';
        ctx.fillRect(c * CELL + h * 20, r * CELL + h * 22, 7, 2);
      }
    }
    // Foam line crawling with the clock (and surging after a redraw).
    const surge = world.tideFlash > 0 ? Math.sin(world.time * 10 + r) * 3 : 0;
    const fx = shore * CELL + Math.sin(world.time * 1.7 + r * 1.3) * 2 + surge;
    ctx.fillStyle = 'rgba(207,232,221,0.8)';
    ctx.fillRect(fx - 2, r * CELL, 3, CELL);
  }

  // The headland the beacon stands on reads slightly darker.
  ctx.fillStyle = 'rgba(138,109,59,0.18)';
  ctx.fillRect(0, 8 * CELL, 4 * CELL, 5 * CELL);
}

function drawNextTide(ctx, world) {
  // Dashed pale line: where the water will reach after this wave. The
  // judge and the player both plan against this line.
  ctx.save();
  ctx.strokeStyle = 'rgba(160,225,255,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  for (let r = 0; r < ROWS; r++) {
    const x = world.shoreAt(r, world.nextShoreBase) * CELL;
    if (r === 0) ctx.moveTo(x, 0);
    else ctx.lineTo(x, r * CELL);
    ctx.lineTo(x, (r + 1) * CELL);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(160,225,255,0.9)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  const labelX = world.shoreAt(0, world.nextShoreBase) * CELL;
  ctx.fillText('NEXT TIDE', Math.min(VIEW_W - 70, labelX + 6), 14);
  ctx.restore();
}

// During the build phase the raiders' walking route is dotted onto the
// sand from the middle landing: the player defends a line they can see,
// not one they have to guess. (During a wave the raiders themselves are
// the route, so the dots retire.)
function drawPathPreview(ctx, world) {
  if (world.phase !== 'build') return;
  const landing = world.landingCell(10);
  const path = world.findPath(landing.col, landing.row);
  if (!path) return;
  ctx.fillStyle = 'rgba(226,72,61,0.35)';
  for (const cell of path) {
    const { x, y } = cellCenter(cell.col, cell.row);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrid(ctx) {
  ctx.strokeStyle = 'rgba(13,27,38,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, GRID_H);
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(VIEW_W, r * CELL);
  }
  ctx.stroke();
}

// --- actors ---------------------------------------------------------------

function drawBeacon(ctx, world) {
  const { x, y } = cellCenter(BEACON_COL, BEACON_ROW);
  const hpFrac = world.beaconHp / BEACON_MAX_HP;
  // A cone of light sweeping the sea lanes.
  const sweep = Math.sin(world.time * 0.7) * 0.35;
  ctx.save();
  ctx.translate(x, y - 10);
  ctx.rotate(sweep);
  const grad = ctx.createLinearGradient(0, 0, 300, 0);
  grad.addColorStop(0, 'rgba(255,217,122,0.20)');
  grad.addColorStop(1, 'rgba(255,217,122,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(300, -46);
  ctx.lineTo(300, 46);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Stone tower.
  ctx.fillStyle = '#5b6670';
  ctx.fillRect(x - 9, y - 16, 18, 30);
  ctx.fillStyle = '#454f58';
  ctx.fillRect(x - 12, y - 20, 24, 6);
  ctx.fillRect(x - 12, y + 12, 24, 4);
  // Lamp room and flame: the flame shrinks as the beacon takes hits.
  ctx.fillStyle = '#2c343c';
  ctx.fillRect(x - 7, y - 30, 14, 11);
  const flicker = 1 + Math.sin(world.time * 9) * 0.12;
  const flameR = (3 + 6 * hpFrac) * flicker;
  const glow = ctx.createRadialGradient(x, y - 24, 1, x, y - 24, 34);
  glow.addColorStop(0, 'rgba(255,217,122,0.85)');
  glow.addColorStop(1, 'rgba(255,180,58,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 24, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.amberHot;
  ctx.beginPath();
  ctx.arc(x, y - 24, Math.max(1.5, flameR), 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('BEACON', x, y + 30);
  ctx.textAlign = 'left';
}

function drawTowers(ctx, world, ui) {
  for (const t of world.towers) {
    const { x, y } = cellCenter(t.col, t.row);
    if (t.kind === 'lantern') {
      if (ui.hover && ui.hover.col === t.col && ui.hover.row === t.row) {
        ctx.strokeStyle = 'rgba(255,217,122,0.5)';
        ctx.beginPath();
        ctx.arc(x, y, 104, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.woodDark;
      ctx.fillRect(x - 3, y - 4, 6, 16);
      const glow = ctx.createRadialGradient(x, y - 10, 1, x, y - 10, 22);
      glow.addColorStop(0, 'rgba(255,217,122,0.9)');
      glow.addColorStop(1, 'rgba(255,180,58,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y - 10, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.amber;
      ctx.beginPath();
      ctx.arc(x, y - 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.woodDark;
      ctx.strokeRect(x - 5, y - 16, 10, 11);
    } else {
      // Barricade: stacked planks, with a damage bar once it is chewed.
      ctx.fillStyle = COLORS.wood;
      ctx.fillRect(x - 13, y - 10, 26, 7);
      ctx.fillRect(x - 13, y - 2, 26, 7);
      ctx.fillRect(x - 13, y + 6, 26, 7);
      ctx.fillStyle = COLORS.woodDark;
      ctx.fillRect(x - 13, y - 10, 3, 23);
      ctx.fillRect(x + 10, y - 10, 3, 23);
      if (t.hp < 46) {
        ctx.fillStyle = 'rgba(13,27,38,0.6)';
        ctx.fillRect(x - 12, y - 16, 24, 4);
        ctx.fillStyle = COLORS.amber;
        ctx.fillRect(x - 12, y - 16, 24 * Math.max(0, t.hp / 46), 4);
      }
    }
  }
}

function drawEnemies(ctx, world) {
  for (const e of world.enemies) {
    const bob = Math.sin(world.time * 6 + e.wobble) * 1.5;
    const y = e.y + bob * 0.3;
    // A dark wading figure: cloak, head, coloured band by kind.
    ctx.fillStyle = '#23272e';
    ctx.beginPath();
    ctx.arc(e.x, y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9b18c';
    ctx.beginPath();
    ctx.arc(e.x, y - e.radius * 0.35, e.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = e.kind === 'brute' ? '#7a2fd0' : e.kind === 'runner' ? '#e2b13c' : COLORS.red;
    ctx.fillRect(e.x - e.radius * 0.5, y - e.radius * 0.62, e.radius, 3);
    // Health bar.
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(13,27,38,0.65)';
    ctx.fillRect(e.x - e.radius, y - e.radius - 8, w, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#7fc95e' : COLORS.red;
    ctx.fillRect(e.x - e.radius, y - e.radius - 8, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}

function drawProjectiles(ctx, world) {
  for (const p of world.projectiles) {
    ctx.strokeStyle = 'rgba(255,217,122,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.amberHot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects(ctx, world) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px system-ui, sans-serif';
  for (const fx of world.effects) {
    const a = 1 - fx.t / fx.life;
    ctx.fillStyle = fx.color;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillText(fx.text, fx.x, fx.y - fx.t * 22);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawBanner(ctx, world) {
  if (!world.banner) return;
  const b = world.banner;
  const a = Math.min(1, (b.life - b.t) / 0.5, b.t / 0.25 + 0.2);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(13,27,38,0.82)';
  ctx.fillRect(VIEW_W / 2 - 260, 18, 520, 52);
  ctx.strokeStyle = COLORS.amber;
  ctx.strokeRect(VIEW_W / 2 - 260, 18, 520, 52);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.amberHot;
  ctx.font = 'bold 19px Georgia, serif';
  ctx.fillText(b.text, VIEW_W / 2, 42);
  ctx.fillStyle = COLORS.ink;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(b.sub, VIEW_W / 2, 61);
  ctx.restore();
  ctx.textAlign = 'left';
}

// --- HUD --------------------------------------------------------------------

function drawButton(ctx, rect, label, sub, active, enabled) {
  ctx.fillStyle = active ? '#2b4a5e' : '#1a3242';
  ctx.strokeStyle = active ? COLORS.amber : COLORS.panelEdge;
  ctx.globalAlpha = enabled ? 1 : 0.45;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + 19);
  ctx.fillStyle = COLORS.inkDim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(sub, rect.x + rect.w / 2, rect.y + 35);
  ctx.textAlign = 'left';
}

function drawHud(ctx, world, ui) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, HUD_Y, VIEW_W, VIEW_H - HUD_Y);
  ctx.fillStyle = COLORS.amber;
  ctx.fillRect(0, HUD_Y, VIEW_W, 2);

  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`WAVE ${Math.max(1, world.wave)}/${TOTAL_WAVES}`, 16, HUD_Y + 26);
  ctx.fillStyle = world.beaconHp <= 6 ? COLORS.red : COLORS.ink;
  ctx.fillText(`BEACON ${world.beaconHp}`, 150, HUD_Y + 26);
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`DRIFTWOOD ${world.driftwood}`, 268, HUD_Y + 26);
  ctx.fillText(`SCORE ${world.score}`, 424, HUD_Y + 26);

  // Tide phase: which way the dashed line will jump after this wave.
  // Kept short on purpose: this row shares its line with the sound
  // indicator at the right edge, and the two must never collide.
  const move = world.nextShoreBase - world.shoreBase;
  const tideText = move > 0 ? 'TIDE FALLING' : move < 0 ? 'TIDE RISING' : 'TIDE STEADY';
  ctx.fillStyle = '#a0e1ff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(tideText, 556, HUD_Y + 26);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = COLORS.inkDim;
  ctx.fillText(ui.muted ? '♪ SOUND OFF (M)' : '♪ SOUND ON (M)', 762, HUD_Y + 26);
  ctx.fillText('Click a sand cell to build. Lanterns shoot; barricades block. Hold all 10 waves.', 362, HUD_Y + 48);

  drawButton(ctx, BTN_LANTERN, 'LANTERN', `${COSTS.lantern} wood — shoots raiders`, ui.selected === 'lantern', world.driftwood >= COSTS.lantern);
  drawButton(ctx, BTN_BARRICADE, 'BARRICADE', `${COSTS.barricade} wood — blocks the path`, ui.selected === 'barricade', world.driftwood >= COSTS.barricade);

  if (world.phase === 'build') {
    drawButton(ctx, BTN_START, 'START WAVE', world.wave === 0 ? 'wave 1 lands' : `wave ${world.wave + 1} lands`, false, true);
  } else if (world.phase === 'wave') {
    const left = world.enemies.length + world.spawnQueue.length;
    drawButton(ctx, BTN_START, 'WAVE LIVE', `${left} raider(s) ashore`, true, false);
  } else {
    drawButton(ctx, BTN_START, world.phase === 'won' ? 'SHORE HELD' : 'FLAME OUT', 'press R to retry', false, true);
  }

  // Build ghost on the hovered cell.
  if (ui.hover && world.phase === 'build') {
    const { col, row } = ui.hover;
    const ok = world.canBuild(ui.selected, col, row);
    ctx.strokeStyle = ok ? 'rgba(127,201,94,0.9)' : 'rgba(226,72,61,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
  }
}

// --- overlays -----------------------------------------------------------------

function drawTitle(ctx, world) {
  ctx.fillStyle = 'rgba(13,27,38,0.55)';
  ctx.fillRect(0, 0, VIEW_W, GRID_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.amberHot;
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('THE SALTLINE', VIEW_W / 2, 218);
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('light the beacon, hold the shore the tide redraws', VIEW_W / 2, 254);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Raiders land from the sea and walk the shore to your beacon.', VIEW_W / 2, 316);
  ctx.fillText('Build lantern towers and barricades from driftwood between waves.', VIEW_W / 2, 342);
  ctx.fillText('After every wave the tide redraws the shoreline — routes and building ground change.', VIEW_W / 2, 368);
  ctx.fillText('The dashed line shows the next tide before it arrives. Survive 10 waves.', VIEW_W / 2, 394);
  ctx.fillStyle = COLORS.amber;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('CLICK TO BEGIN', VIEW_W / 2, 452);
  ctx.textAlign = 'left';
}

function drawEnd(ctx, world) {
  ctx.fillStyle = world.phase === 'won' ? 'rgba(13,27,38,0.45)' : 'rgba(30,8,8,0.62)';
  ctx.fillRect(0, 0, VIEW_W, GRID_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = world.phase === 'won' ? COLORS.amberHot : COLORS.red;
  ctx.font = 'bold 46px Georgia, serif';
  ctx.fillText(world.phase === 'won' ? 'THE BEACON BURNS ON' : 'THE FLAME IS OUT', VIEW_W / 2, 268);
  ctx.fillStyle = COLORS.ink;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(
    world.phase === 'won'
      ? 'Ten waves broken on your shore. The Saltline holds.'
      : `The raiders reached the beacon on wave ${world.wave}.`,
    VIEW_W / 2, 310,
  );
  ctx.fillText(`Score ${world.score} · Raiders turned back ${world.kills} · Driftwood left ${world.driftwood}`, VIEW_W / 2, 344);
  ctx.fillStyle = COLORS.amber;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('CLICK OR PRESS R TO PLAY AGAIN', VIEW_W / 2, 396);
  ctx.textAlign = 'left';
}

// One entry point: draw the whole frame for the given screen mode.
export function drawFrame(ctx, world, ui) {
  drawTerrain(ctx, world);
  drawGrid(ctx);
  drawPathPreview(ctx, world);
  drawNextTide(ctx, world);
  drawTowers(ctx, world, ui);
  drawBeacon(ctx, world);
  drawEnemies(ctx, world);
  drawProjectiles(ctx, world);
  drawEffects(ctx, world);
  drawHud(ctx, world, ui);
  drawBanner(ctx, world);
  if (ui.mode === 'title') drawTitle(ctx, world);
  if (ui.mode === 'over') drawEnd(ctx, world);
}
