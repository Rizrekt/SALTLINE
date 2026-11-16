// THE SALTLINE — seeded randomness.
//
// One mulberry32 stream per world: a seed always grows the same shore, the
// same tides and the same raiders, which is what makes the screenshot
// scenes in shots.js reproducible frame for frame.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Inclusive integer in [lo, hi] drawn from the stream.
export function rngInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// One element of a non-empty array, drawn from the stream.
export function rngPick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

// A stable 0..1 hash of a grid cell, for decoration that must not move
// between frames (sand speckles, driftwood piles, foam flecks).
export function cellHash(col, row) {
  let h = (col * 374761393 + row * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
