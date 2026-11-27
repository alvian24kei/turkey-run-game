// Wattle's Corn-Decoy Run — input: keyboard and mouse/touch, edge-triggered.
// The loop reads `direction()` (the lane change requested this frame) and `takeActions()`
// (one-shot actions: confirm, pause, jump, dash, hide, decoy), so holding a key never
// fires twice and a tap always fires once.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_JUMP = 4;
export const ACTION_DASH = 8;
export const ACTION_HIDE = 16;
export const ACTION_DECOY = 32;

export function createInput(canvas) {
  let actions = 0;
  let direction = 0;
  const held = new Set();

  function press(action) {
    actions |= action;
  }

  function onKeyDown(event) {
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      if (!held.has('left')) direction -= 1;
      held.add('left');
      event.preventDefault();
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      if (!held.has('right')) direction += 1;
      held.add('right');
      event.preventDefault();
    } else if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') {
      press(ACTION_JUMP);
      if (key === ' ') press(ACTION_CONFIRM);
      event.preventDefault();
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      press(ACTION_HIDE);
      event.preventDefault();
    } else if (key === 'Shift') {
      press(ACTION_DASH);
      event.preventDefault();
    } else if (key === 'c' || key === 'C') {
      press(ACTION_DECOY);
    } else if (key === 'Enter') {
      press(ACTION_CONFIRM);
    } else if (key === 'p' || key === 'P' || key === 'Escape') {
      press(ACTION_PAUSE);
    }
  }

  function onKeyUp(event) {
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') held.delete('left');
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') held.delete('right');
  }

  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (y > 0.72) {
      // Tapping the turkey itself jumps.
      if (x > 0.38 && x < 0.62) press(ACTION_JUMP);
      else if (x < 0.38) direction -= 1;
      else direction += 1;
      return;
    }
    if (x < 0.33) direction -= 1;
    else if (x > 0.67) direction += 1;
    else press(ACTION_JUMP);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointer);

  return {
    /** The lane change requested since the last call; consuming it. */
    direction() {
      const value = direction;
      direction = 0;
      return value;
    },
    /** The one-shot actions pressed since the last call; consuming them. */
    takeActions() {
      const value = actions;
      actions = 0;
      return value;
    },
  };
}
