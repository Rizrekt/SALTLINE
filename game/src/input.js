// THE SALTLINE — pointer and keyboard input. Pointer presses are
// classified by the renderer's own geometry (build bar first, then the
// coast grid) and queued as clicks; key presses queue tool selections
// and one-shot actions, so a press between frames is never lost.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const TOOLS = { Digit1: 'lantern', Digit2: 'cannon', Digit3: 'barricade' };

export function createInput(canvas, renderer) {
  let actions = 0;
  const clicks = []; // {cell:{c,r}} | {tool:'lantern'|...|'start'}

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (TOOLS[event.code] !== undefined) {
      clicks.push({ tool: TOOLS[event.code] });
    } else return;
    event.preventDefault();
  });

  canvas.addEventListener('pointerdown', (event) => {
    const tool = renderer.toolAt(event.clientX, event.clientY);
    if (tool !== null) {
      clicks.push({ tool });
      return;
    }
    const cell = renderer.cellAt(event.clientX, event.clientY);
    if (cell !== null) clicks.push({ cell });
    else actions |= ACTION_CONFIRM;
  });

  return {
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The clicks since the last call, oldest first. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
  };
}
