// Boot and the one loop: input is read once per frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between four screens: title, play, paused and game over
// (caught or escaped — the world knows which).
//
// ?seed=N fixes the farm. ?shot=title|chase|kitchen|escaped|caught (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot. A tiny WebAudio gobble plays on jumps and hits, after the first
// key press or click; it is silent until then and never blocks the game.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_OVER } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_DASH,
  ACTION_DECOY,
  ACTION_HIDE,
  ACTION_JUMP,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

let audio = null;
function beep(freq, dur, type = 'sine', vol = 0.05) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  } catch {
    // Sound is garnish: a browser without audio still plays the game.
  }
}
function gobble() {
  beep(520, 0.09, 'square', 0.04);
  window.setTimeout(() => beep(660, 0.09, 'square', 0.04), 90);
}
function thud() {
  beep(140, 0.18, 'sawtooth', 0.07);
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Paint many frames: the zone banner fades over ~2.4 s of draws, and the staged
  // scene starts with it showing (the renderer has not seen this zone before).
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 160) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Three lives. Run 1,200 metres to the woods.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(world.state.cause === 'escaped' ? `Escaped! Score ${world.state.score}.` : `Caught. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(frameInput) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: 0, jump: false, dash: false, hide: false, decoy: false }, true);
      return;
    }
    const actions = frameInput.actions;
    const events = world.step(
      STEP,
      {
        move: frameInput.move,
        jump: Boolean(actions & ACTION_JUMP),
        dash: Boolean(actions & ACTION_DASH),
        hide: Boolean(actions & ACTION_HIDE),
        decoy: Boolean(actions & ACTION_DECOY),
      },
      false,
    );
    if (events & EVENT_HIT) {
      thud();
      announce(world.state.lives === 1 ? 'Hit. 1 life left. The farmer is closer.' : `Hit. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Input is read once per frame; only the first simulation step of the frame
    // gets the edge-triggered actions, so a tap never fires twice.
    const frameInput = { move: input.direction(), actions: input.takeActions() };
    handleActions(frameInput.actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? frameInput : { move: 0, actions: 0 });
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the farmer catch up unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A jump keypress also gobbles, once the game has started.
  window.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'ArrowUp') && screen === SCREEN_PLAY) gobble();
  });

  announce("Wattle's Corn-Decoy Run. Press Space or click to start.");
  requestAnimationFrame(frame);
}

// A handle for automated play-tests: the state, the screen and the world itself.
window.__turkey = { get state() { return world.state; }, get world() { return world; } };

if (shot) runShot(shot);
else runGame();
