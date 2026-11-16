// THE SALTLINE — tuning and layout constants.
//
// The view is a 896x768 canvas: a 28x20 grid of 32px cells on top and a
// 128px HUD bar underneath. Every number the game balances on lives in
// this file, so world.js and render.js stay free of magic values.

export const VIEW_W = 896;
export const VIEW_H = 768;
export const CELL = 32;
export const COLS = 28;
export const ROWS = 20;
export const GRID_H = ROWS * CELL; // 640
export const HUD_Y = GRID_H;

// The beacon stands on the headland at the west edge; if its flame dies
// the shore is lost.
export const BEACON_COL = 1;
export const BEACON_ROW = 10;
export const BEACON_MAX_HP = 20;

export const START_DRIFTWOOD = 40;
export const TOTAL_WAVES = 10;

// Raiders land on these rows, walking the shore path to the beacon.
export const LANES = [3, 10, 17];

// The shoreline starts at this column and the tide moves it by up to
// TIDE_SWING columns after every wave, never past the clamps: the
// headland (cols 0..5) is always dry, and some sea always remains.
export const SHORE_START = 22;
export const SHORE_MIN = 17;
export const SHORE_MAX = 25;
export const TIDE_SWING = 3;

export const COSTS = { lantern: 20, barricade: 10 };
export const LANTERN_RANGE = 104;
export const LANTERN_DAMAGE = 6;
export const LANTERN_COOLDOWN = 0.55;
export const PROJECTILE_SPEED = 320;
export const BARRICADE_MAX_HP = 46;
export const SALVAGE = 5; // driftwood returned when the tide takes a tower
export const WAVE_CLEAR_BONUS = 25;

// Enemy archetypes: hit points and speed grow with the wave number.
export function enemyStats(kind, wave) {
  if (kind === 'runner') {
    return { hp: 10 + wave * 2, speed: 54, damage: 1, bounty: 4, radius: 9 };
  }
  if (kind === 'brute') {
    return { hp: 55 + wave * 8, speed: 19, damage: 3, bounty: 7, radius: 14 };
  }
  return { hp: 18 + wave * 3, speed: 31, damage: 1, bounty: 3, radius: 11 };
}

// How many raiders a wave sends, and how its mix toughens.
export function waveSize(wave) {
  return 4 + wave * 2;
}

// HUD buttons, in logical canvas coordinates. main.js routes clicks with
// these same rectangles, so what is drawn is exactly what is clickable.
export const BTN_LANTERN = { x: 16, y: 700, w: 150, h: 44 };
export const BTN_BARRICADE = { x: 182, y: 700, w: 164, h: 44 };
export const BTN_START = { x: 744, y: 700, w: 136, h: 44 };

// Palette: dusk over a cold sea — deep water, wet sand, lantern amber.
export const COLORS = {
  waterDeep: '#14425e',
  waterShallow: '#1d5f7d',
  foam: '#cfe8dd',
  sand: '#c9a86a',
  sandDark: '#b08d4f',
  landEdge: '#8a6d3b',
  night: '#0d1b26',
  panel: '#10222f',
  panelEdge: '#2b4a5e',
  ink: '#f3e9d2',
  inkDim: '#a8b8ae',
  amber: '#ffb43a',
  amberHot: '#ffd97a',
  red: '#e2483d',
  wood: '#7a5230',
  woodDark: '#5d3d22',
};
