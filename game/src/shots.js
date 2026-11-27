// The screenshot scenes behind ?shot=title|chase|kitchen|escaped. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by an
// autopilot, so the frame is what a real game really looks like and the same seed
// always gives the same frame.
//
// The autopilot plans 2.5 seconds ahead: it stays in its lane while that lane is
// safe, moves to the lane whose first obstacle arrives latest when it is not, jumps
// low walls in the lane it is heading for, dashes when the farmer gets close, tosses
// a decoy when he is on the bird's tail, and dives into a haystack when one is in
// reach. The 'caught' variant uses a doomed pilot (never moves, never jumps) so the
// farmer catches the bird — that is the CAUGHT end screen. The 'escaped' variant
// runs the good pilot until the bird reaches the forest gate.
import { STEP } from './config.js';
import { EVENT_OVER, KIND_BALE, KIND_CORN, KIND_FENCE, KIND_HAYSTACK, KIND_KNIFE, KIND_OVEN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TALL = new Set([KIND_OVEN, KIND_KNIFE]);
const LOW = new Set([KIND_BALE, KIND_FENCE]);
const LANES = [-1, 0, 1];
const HORIZON = 2.5;

/** Seconds until the first obstacle in `lane` reaches the turkey; Infinity if none. */
function firstHitInLane(state, lane, approach) {
  let worst = Infinity;
  for (const entity of state.entities) {
    if (!entity.active) continue;
    if (entity.lane !== lane) continue;
    if (!TALL.has(entity.kind) && !LOW.has(entity.kind)) continue;
    const seconds = entity.z / approach;
    if (seconds < HORIZON && seconds < worst) worst = seconds;
  }
  return worst;
}

function nearestEntity(state, kinds, maxZ, lane = null) {
  let best = null;
  for (const entity of state.entities) {
    if (!entity.active || !kinds.has(entity.kind)) continue;
    if (lane !== null && entity.lane !== lane) continue;
    if (entity.z > maxZ || entity.z < -10) continue;
    if (best === null || entity.z < best.z) best = entity;
  }
  return best;
}

function autopilot(state) {
  const approach = 250 + (state.level - 1) * 22;
  const player = state.player;
  const input = { move: 0, jump: false, dash: false, hide: false, decoy: false };

  // Hide when a haystack is in reach and the farmer is close.
  const hay = nearestEntity(state, new Set([KIND_HAYSTACK]), 120);
  if (hay && Math.abs(hay.lane - player.lane) <= 0.5 && state.farmerDist < 40) {
    if (hay.lane !== player.targetLane) input.move = Math.sign(hay.lane - player.targetLane);
    else input.hide = true;
    return input;
  }

  // Decoy + dash when the farmer is on the bird's tail.
  if (state.farmerDist < 28 && state.decoys > 0) input.decoy = true;
  if (state.farmerDist < 22 && state.dashCd <= 0) input.dash = true;

  const target = player.targetLane;
  const safeFor = firstHitInLane(state, target, approach);
  if (safeFor <= 1.6) {
    // The lane ahead is not safe: move to the lane whose first obstacle is latest.
    let bestLane = target;
    let bestTime = safeFor;
    for (const lane of LANES) {
      const t = firstHitInLane(state, lane, approach);
      if (t > bestTime + 0.1) {
        bestTime = t;
        bestLane = lane;
      }
    }
    if (bestLane !== target) input.move = Math.sign(bestLane - target);
  } else {
    // Safe for now: drift toward the nearest corn trail, if its lane is safe too.
    const corn = nearestEntity(state, new Set([KIND_CORN]), 420);
    if (corn && corn.lane !== target && firstHitInLane(state, corn.lane, approach) > 1.6) {
      input.move = Math.sign(corn.lane - target);
    }
  }

  // Jump a low obstacle in the lane the bird is heading for, timed to the approach.
  const headed = Math.max(-1, Math.min(1, target + input.move));
  const low = nearestEntity(state, LOW, approach * 0.55, headed);
  if (low && player.jumpY <= 0.01) input.jump = true;
  return input;
}

/** The doomed pilot: stands still, never jumps — the farmer always catches it. */
function doomedPilot() {
  return { move: 0, jump: false, dash: false, hide: false, decoy: false };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Names: title, chase, kitchen, escaped, caught.
 */
export function stageShot(name, world) {
  if (name === 'caught') {
    world.reset();
    for (let i = 0; i < 600 / STEP; i += 1) {
      if (world.step(STEP, doomedPilot(), false) & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'escaped') {
    world.reset();
    for (let i = 0; i < 900 / STEP; i += 1) {
      const events = world.step(STEP, autopilot(world.state), false);
      if (events & EVENT_OVER) break;
    }
    return { screen: world.state.escaped ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'kitchen') {
    world.reset();
    // The good pilot as far as it gets; if it is caught before the kitchen, the
    // attract run carries the bird there instead — the frame is still a real run.
    let reached = false;
    for (let i = 0; i < 900 / STEP; i += 1) {
      if (world.state.distance >= 640) {
        reached = true;
        break;
      }
      if (world.step(STEP, autopilot(world.state), false) & EVENT_OVER) break;
    }
    if (!reached) {
      world.reset();
      for (let i = 0; i < 900 / STEP; i += 1) {
        if (world.state.distance >= 640) break;
        world.step(STEP, autopilot(world.state), true);
      }
    }
    // Keep playing until an oven is close in frame and a carving knife is in
    // frame too — the kitchen shot has to show the hazards, not an empty road.
    // (The oven must be near, z 30–150, so it reads big; the knife may be
    // further out, z 30–500.)
    for (let i = 0; i < 25 / STEP; i += 1) {
      const hasOven = world.state.entities.some((e) => e.active && e.kind === KIND_OVEN && e.z > 30 && e.z < 150);
      const hasKnife = world.state.entities.some((e) => e.active && e.kind === KIND_KNIFE && e.z > 30 && e.z < 500);
      if (hasOven && hasKnife) break;
      world.step(STEP, autopilot(world.state), !reached);
    }
    for (let i = 0; i < 3 / STEP; i += 1) world.step(STEP, autopilot(world.state), !reached);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'chase') {
    world.reset();
    // Run well, take one hit — two, if the bird can spare the life — so the farmer
    // is visibly right behind it, then run well again. The frame is mid-chase.
    for (let i = 0; i < 20 / STEP; i += 1) world.step(STEP, autopilot(world.state), false);
    const hitsBefore = world.state.stats.hits;
    if (world.state.lives > 1) {
      const wantHits = world.state.lives > 2 ? 2 : 1;
      for (let i = 0; i < 10 / STEP; i += 1) {
        if (world.step(STEP, doomedPilot(), false) & EVENT_OVER) break;
        if (world.state.stats.hits >= hitsBefore + wantHits) break;
        if (world.state.lives <= 1 && world.state.stats.hits > hitsBefore) break;
      }
    }
    for (let i = 0; i < 2.5 / STEP; i += 1) {
      if (world.step(STEP, autopilot(world.state), false) & EVENT_OVER) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // title: the attract run, five seconds of the farm scrolling by.
  world.reset();
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, autopilot(world.state), true);
  return { screen: SCREEN_TITLE, best: 0 };
}
