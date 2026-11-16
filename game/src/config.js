// THE SALTLINE — shared constants: field, tide, waves, economy, palette.
// Every number the rules use lives here so world.js, render.js and the
// screenshot scenes all read the same game.

export const FIELD = {
  cols: 16,
  rows: 11,
  cell: 56, // logical pixels per cell; the canvas is cols*cell by rows*cell
};
FIELD.width = FIELD.cols * FIELD.cell; // 896
FIELD.height = FIELD.rows * FIELD.cell; // 616

/** Fixed simulation step, seconds. The world only ever advances by this. */
export const STEP = 1 / 30;

/** Beacon flame (player health) and the wave count that wins the game. */
export const BEACON = { health: 20 };
export const WAVES_TO_WIN = 10;

/**
 * Water level during each wave, by wave number (wave 1 uses index 0).
 * The level for the NEXT wave is always shown to the player: the tide is
 * a plan, not a surprise. A cell is water when elevation <= water level.
 */
export const TIDE_BY_WAVE = [0, 1, 0, 1, 2, 1, 0, 2, 1, 2];

/** Buildables: driftwood cost, and what the render/input layers call them. */
export const BUILD = {
  lantern: { cost: 3, name: 'Lantern Tower' },
  cannon: { cost: 5, name: 'Salt Cannon' },
  barricade: { cost: 1, name: 'Barricade' },
};

/** Starting driftwood: enough for two lantern towers. */
export const START_WOOD = 6;

/** Driftwood the tide leaves on newly exposed land, and per cleared wave. */
export const WOOD_PER_WAVE = 3;

/** Palette — land, shallows and deep water stay unmistakable at 300px. */
export const COLORS = {
  deepWater: '#123a5e',
  shallowWater: '#2e6ea3',
  wetSand: '#8a7a52',
  land: '#c9b078',
  highLand: '#e3cd96',
  beaconFlame: '#ffd76a',
  beaconGlow: 'rgba(255, 190, 80, 0.20)',
  wood: '#9a6a3f',
  raider: '#d95f4b',
  runner: '#e8a13a',
  brute: '#8e44ad',
  lanternShot: '#ffe9a8',
  cannonShot: '#f5f0e6',
  hudText: '#f3ead2',
  hudDim: '#b8ab8d',
  title: '#ffd76a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'saltline.best';
