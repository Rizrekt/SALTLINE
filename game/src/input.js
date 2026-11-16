// THE SALTLINE — pointer and keyboard translation.
//
// The canvas is stretched by CSS to fill the window, so every pointer
// event is converted back into the game's logical 896x768 space before
// main.js routes it. Buttons are plain rectangles from config.js; a hit
// test here is the same rectangle render.js draws.

import { CELL, COLS, GRID_H, ROWS } from './config.js';

// Client (CSS pixel) coordinates -> logical canvas coordinates.
export function toLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

// The grid cell under a logical point, or null outside the shore grid
// (the HUD bar below GRID_H is buttons, not building ground).
export function cellAt(x, y) {
  if (x < 0 || y < 0 || y >= GRID_H) return null;
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
  return { col, row };
}

export function hitRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Keyboard shortcuts, named by intent so main.js reads plainly:
// 1/2 choose what to build, Space starts the wave, M mutes, R restarts.
export function keyIntent(key) {
  if (key === '1') return 'select-lantern';
  if (key === '2') return 'select-barricade';
  if (key === ' ') return 'start-wave';
  if (key === 'm' || key === 'M') return 'mute';
  if (key === 'r' || key === 'R') return 'restart';
  return null;
}
