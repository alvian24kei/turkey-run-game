// Wattle's Corn-Decoy Run — the world: a turkey sprinting 1,200 m through four zones
// (Farmyard, Barn, Kitchen Yard, Moonlit Woods) with the farmer closing in behind.
// Fixed-step, seeded, and free of any drawing: the renderer only reads state.
//
// The turkey runs in true 3D space: x is lateral (lanes at -2.2, 0, +2.2 metres),
// y is height, z is depth ahead of the camera. Things rush toward the camera while
// the turkey stays near it, so a collision is an entity reaching depth ~0 in the
// turkey's lane. The renderer projects these coordinates with a real perspective
// divide — this is a 3D game drawn on a 2D canvas, not a side-view sprite game.
//
// Systems beyond run-and-jump:
//   - DASH (Shift / double-tap): a burst of speed and brief invulnerability, on cooldown.
//   - HIDE (Down near a haystack): vanish into the hay; the farmer loses ground.
//   - CORN DECOY (C): toss corn behind; the farmer stops to eat it and loses ground.
// Two ways to lose: three hits, or the farmer closing the gap to zero. One way to win:
// reach the forest gate at 1,200 m.
import {
  APPROACH,
  DASH,
  DECOY,
  DEPTH,
  FARMER,
  FIELD,
  GOAL_DISTANCE,
  HIDE,
  LIVES,
  PLAYER,
  POOL_SIZE,
  SCORE,
  SPAWN,
  SPEED,
  ZONES,
} from './config.js';

export const KIND_OVEN = 'oven';
export const KIND_KNIFE = 'knife';
export const KIND_BALE = 'bale';
export const KIND_FENCE = 'fence';
export const KIND_HAYSTACK = 'haystack';
export const KIND_CORN = 'corn';
export const KIND_PUMPKIN = 'pumpkin';
export const KIND_FEATHER = 'feather';

/** Tall things: the turkey must change lanes. Low things: a jump clears them. */
const TALL = new Set([KIND_OVEN, KIND_KNIFE, KIND_HAYSTACK]);
const LOW = new Set([KIND_BALE, KIND_FENCE]);

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_ESCAPED = 8;
export const EVENT_DASH = 16;
export const EVENT_HIDE = 32;
export const EVENT_DECOY = 64;

/** Depth window in which an entity can touch the turkey. */
const HIT_NEAR = -16;
const HIT_FAR = 30;
/** Jump height that clears a low obstacle. */
const CLEAR_HEIGHT = 0.42;
/** How close a haystack must be to hide in it. */
const HIDE_RANGE = 120;

function blankEntity() {
  return { active: false, kind: KIND_CORN, lane: 0, z: 0, seed: 0, spin: 0, taken: false };
}

export function createWorld(random) {
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i += 1) pool.push(blankEntity());

  const state = {
    time: 0,
    distance: 0,
    score: 0,
    lives: LIVES,
    combo: 0,
    mult: 1,
    level: 1,
    speed: SPEED.base,
    farmerDist: FARMER.start,
    farmerEating: 0,
    over: false,
    escaped: false,
    cause: '',
    zone: 0,
    zoneName: ZONES[0].name,
    dashCd: 0,
    dashTime: 0,
    decoys: DECOY.start,
    hiding: 0,
    hiddenFlash: 0,
    stats: { hits: 0, hides: 0, decoysUsed: 0, dashes: 0, corn: 0 },
    player: { lane: 0, targetLane: 0, jumpY: 0, jumpV: 0, invuln: 0, running: 0 },
    entities: pool,
    leaves: [],
    decoyFx: [],
  };

  let spawnTimer = 0.9;
  let spawnCount = 0;
  let hayTimer = 7;
  let leafTimer = 0;

  function zoneIndex() {
    return Math.min(ZONES.length - 1, Math.floor(state.distance / ZONES[0].length));
  }

  function level() {
    return Math.min(SPEED.maxLevel, 1 + Math.floor(state.distance / SPEED.levelEveryMetres));
  }

  function spawn(kind, lane, z) {
    for (let i = 0; i < pool.length; i += 1) {
      const e = pool[i];
      if (e.active) continue;
      e.active = true;
      e.kind = kind;
      e.lane = lane;
      e.z = z;
      e.seed = random.next();
      e.spin = random.range(0, Math.PI * 2);
      e.taken = false;
      return e;
    }
    return null;
  }

  function otherLane(lane) {
    const lanes = [-1, 0, 1].filter((l) => l !== lane);
    return lanes[Math.floor(random.next() * lanes.length)];
  }

  /** Obstacle mix by zone: the kitchen is all ovens and knives; the woods are fences and logs. */
  function zoneObstacle() {
    const zone = state.zone;
    const table =
      zone === 2
        ? [KIND_OVEN, KIND_OVEN, KIND_KNIFE, KIND_KNIFE, KIND_BALE, KIND_FENCE]
        : zone === 3
          ? [KIND_FENCE, KIND_FENCE, KIND_BALE, KIND_BALE, KIND_KNIFE, KIND_OVEN]
          : [KIND_OVEN, KIND_KNIFE, KIND_BALE, KIND_FENCE, KIND_BALE, KIND_FENCE];
    return table[Math.floor(random.next() * table.length)];
  }

  /** One spawn event: a pattern that is always survivable — a free lane, or a low wall to jump. */
  function spawnPattern() {
    spawnCount += 1;
    const roll = random.next();
    const z = DEPTH.far;
    if (spawnCount % SPAWN.cornEvery === 0) {
      // A corn trail in one lane, with an obstacle in another to keep it honest.
      const lane = random.int(-1, 1);
      for (let i = 0; i < 4; i += 1) spawn(KIND_CORN, lane, z + i * 55);
      if (random.next() < 0.6) spawn(zoneObstacle(), otherLane(lane), z + 40);
      return;
    }
    if (roll < 0.13) {
      // A low wall across all three lanes: jump it.
      for (const lane of [-1, 0, 1]) spawn(random.pick([KIND_BALE, KIND_FENCE]), lane, z + random.range(-8, 8));
      return;
    }
    if (roll < 0.36) {
      // Two lanes blocked, one free — staggered, so the free lane reads early.
      const free = random.int(-1, 1);
      for (const lane of [-1, 0, 1]) {
        if (lane === free) continue;
        spawn(zoneObstacle(), lane, z + random.range(0, 90));
      }
      return;
    }
    if (roll < 0.44) {
      // A rare golden pumpkin, guarded by a knife in the next lane.
      const lane = random.int(-1, 1);
      spawn(KIND_PUMPKIN, lane, z);
      spawn(KIND_KNIFE, otherLane(lane), z + 30);
      return;
    }
    if (roll < 0.5) {
      // A feather: a free life for the bird that reaches it.
      spawn(KIND_FEATHER, random.int(-1, 1), z);
      return;
    }
    // The common case: one obstacle, one lane.
    spawn(zoneObstacle(), random.int(-1, 1), z);
  }

  function hit() {
    state.lives -= 1;
    state.stats.hits += 1;
    state.combo = 0;
    state.mult = 1;
    state.farmerDist = Math.max(0, state.farmerDist - FARMER.hitGain);
    state.player.invuln = PLAYER.invulnerable;
    if (state.lives <= 0 || state.farmerDist <= 0) {
      state.over = true;
      state.cause = 'caught';
    }
    return EVENT_HIT;
  }

  function pickup(entity) {
    entity.taken = true;
    entity.active = false;
    if (entity.kind === KIND_CORN) {
      state.combo += 1;
      state.stats.corn += 1;
      state.mult = Math.min(SCORE.comboMax, 1 + Math.floor(state.combo / SCORE.comboEvery));
      state.score += SCORE.corn * state.mult;
      state.farmerDist = Math.min(FARMER.max, state.farmerDist + FARMER.cornPush);
      if (state.stats.corn % 12 === 0) state.decoys += 1; // every 12th corn earns a decoy
      return EVENT_PICKUP;
    }
    if (entity.kind === KIND_PUMPKIN) {
      state.combo += 2;
      state.mult = Math.min(SCORE.comboMax, 1 + Math.floor(state.combo / SCORE.comboEvery));
      state.score += SCORE.pumpkin * state.mult;
      state.decoys += 1;
      return EVENT_PICKUP;
    }
    // A feather mends the bird: one life back, up to the starting three.
    state.lives = Math.min(LIVES, state.lives + 1);
    return EVENT_PICKUP;
  }

  function step(dt, input, attract) {
    if (state.over || state.escaped) return 0;
    let events = 0;
    state.time += dt;
    state.zone = zoneIndex();
    state.zoneName = ZONES[state.zone].name;
    state.level = level();
    const metresPerSecond = SPEED.base + (state.level - 1) * SPEED.perLevel;
    const dashing = state.dashTime > 0;
    state.speed = metresPerSecond * (dashing ? DASH.speedMult : 1);
    const approach = APPROACH.base + (state.level - 1) * APPROACH.perLevel;

    // --- dash: a burst with a cooldown ------------------------------------
    if (state.dashCd > 0) state.dashCd -= dt;
    if (state.dashTime > 0) state.dashTime -= dt;
    if (input.dash && state.dashCd <= 0 && state.hiding <= 0) {
      state.dashTime = DASH.time;
      state.dashCd = DASH.cooldown;
      state.player.invuln = Math.max(state.player.invuln, DASH.time);
      state.stats.dashes += 1;
      events |= EVENT_DASH;
    }

    // --- the turkey -------------------------------------------------------
    const player = state.player;
    player.running += dt * (6 + state.level * (dashing ? 2 : 1));
    if (input.move !== 0 && state.hiding <= 0) {
      player.targetLane = Math.max(-1, Math.min(1, player.targetLane + input.move));
    }
    const laneDelta = player.targetLane - player.lane;
    const laneStep = PLAYER.laneSpeed * dt;
    player.lane += Math.max(-laneStep, Math.min(laneStep, laneDelta));
    if (input.jump && player.jumpY <= 0.001 && player.jumpV === 0 && state.hiding <= 0) {
      player.jumpV = PLAYER.jumpSpeed;
    }
    if (player.jumpV !== 0 || player.jumpY > 0) {
      player.jumpY += player.jumpV * dt;
      player.jumpV -= PLAYER.gravity * dt;
      if (player.jumpY <= 0) {
        player.jumpY = 0;
        player.jumpV = 0;
      }
    }
    if (player.invuln > 0) player.invuln -= dt;
    if (state.hiddenFlash > 0) state.hiddenFlash -= dt;

    // --- hide: dive into a nearby haystack -------------------------------
    if (state.hiding > 0) {
      state.hiding -= dt;
      if (state.hiding <= 0) state.hiddenFlash = 0.4;
    } else if (input.hide) {
      for (const entity of pool) {
        if (!entity.active || entity.kind !== KIND_HAYSTACK) continue;
        if (entity.z > HIDE_RANGE || entity.z < -10) continue;
        if (Math.abs(entity.lane - player.lane) > PLAYER.width) continue;
        entity.active = false;
        state.hiding = HIDE.time;
        state.player.invuln = Math.max(state.player.invuln, HIDE.time);
        state.farmerDist = Math.min(FARMER.max, state.farmerDist + HIDE.farmerLoss);
        state.score += HIDE.points;
        state.stats.hides += 1;
        events |= EVENT_HIDE;
        break;
      }
    }

    // --- corn decoy: toss corn behind, the farmer stops to eat -----------
    if (state.farmerEating > 0) state.farmerEating -= dt;
    if (input.decoy && state.decoys > 0 && state.hiding <= 0) {
      state.decoys -= 1;
      state.stats.decoysUsed += 1;
      state.farmerDist = Math.min(FARMER.max, state.farmerDist + DECOY.farmerLoss);
      state.farmerEating = DECOY.eatTime;
      state.decoyFx.push({ t: 0 });
      events |= EVENT_DECOY;
    }
    for (const fx of state.decoyFx) fx.t += dt;
    state.decoyFx = state.decoyFx.filter((fx) => fx.t < 1.2);

    // --- the run ----------------------------------------------------------
    state.distance += state.speed * dt;
    state.score += state.speed * dt * SCORE.perMetre;
    if (!attract && state.farmerEating <= 0 && state.hiding <= 0) {
      state.farmerDist = Math.max(0, state.farmerDist - FARMER.drain * dt);
    }
    if (state.farmerDist <= 0 && !attract) {
      state.over = true;
      state.cause = 'caught';
      return EVENT_OVER;
    }
    if (state.distance >= GOAL_DISTANCE) {
      state.escaped = true;
      state.over = true;
      state.cause = 'escaped';
      return EVENT_OVER | EVENT_ESCAPED;
    }

    // --- spawning ---------------------------------------------------------
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnPattern();
      const interval = Math.max(SPAWN.min, SPAWN.base - (state.level - 1) * SPAWN.perLevel);
      spawnTimer = interval * random.range(0.85, 1.2);
    }
    // Haystacks to hide in: regular in the farmyard and barn, rare later.
    hayTimer -= dt;
    if (hayTimer <= 0) {
      hayTimer = state.zone <= 1 ? random.range(9, 14) : random.range(16, 24);
      spawn(KIND_HAYSTACK, random.int(-1, 1), DEPTH.far + 60);
    }

    // --- leaves drifting down ---------------------------------------------
    leafTimer -= dt;
    if (leafTimer <= 0) {
      leafTimer = 0.12;
      state.leaves.push({ x: random.range(0, FIELD.width), y: -12, vy: random.range(24, 60), sway: random.range(0, 6.28), hue: random.int(0, 2) });
      if (state.leaves.length > 40) state.leaves.shift();
    }
    for (const leaf of state.leaves) {
      leaf.y += leaf.vy * dt;
      leaf.sway += dt * 2;
      leaf.x += Math.sin(leaf.sway) * 22 * dt;
    }
    state.leaves = state.leaves.filter((leaf) => leaf.y < FIELD.height + 16);

    // --- entities rush toward the camera ----------------------------------
    for (const entity of pool) {
      if (!entity.active) continue;
      entity.z -= approach * dt;
      entity.spin += dt * 2;
      if (entity.z < DEPTH.kill) {
        entity.active = false;
        continue;
      }
      if (entity.z > HIT_FAR || entity.z < HIT_NEAR) continue;
      if (Math.abs(entity.lane - player.lane) > PLAYER.width) continue;
      if (entity.kind === KIND_CORN || entity.kind === KIND_PUMPKIN || entity.kind === KIND_FEATHER) {
        if (player.jumpY < 0.7) events |= pickup(entity);
        continue;
      }
      if (entity.kind === KIND_HAYSTACK) continue; // haystacks never hurt; they hide you
      // An obstacle in the turkey's lane.
      if (attract) continue;
      if (player.invuln > 0 || state.hiding > 0) continue;
      if (LOW.has(entity.kind) && player.jumpY > CLEAR_HEIGHT) {
        entity.active = false; // cleared it — it tumbles past.
        continue;
      }
      entity.active = false;
      events |= hit();
      if (state.over) return events | EVENT_OVER;
    }

    return events;
  }

  function reset() {
    state.time = 0;
    state.distance = 0;
    state.score = 0;
    state.lives = LIVES;
    state.combo = 0;
    state.mult = 1;
    state.level = 1;
    state.speed = SPEED.base;
    state.farmerDist = FARMER.start;
    state.farmerEating = 0;
    state.over = false;
    state.escaped = false;
    state.cause = '';
    state.zone = 0;
    state.zoneName = ZONES[0].name;
    state.dashCd = 0;
    state.dashTime = 0;
    state.decoys = DECOY.start;
    state.hiding = 0;
    state.hiddenFlash = 0;
    state.stats = { hits: 0, hides: 0, decoysUsed: 0, dashes: 0, corn: 0 };
    state.player.lane = 0;
    state.player.targetLane = 0;
    state.player.jumpY = 0;
    state.player.jumpV = 0;
    state.player.invuln = 0;
    state.player.running = 0;
    state.leaves = [];
    state.decoyFx = [];
    for (const entity of pool) entity.active = false;
    spawnTimer = 0.9;
    spawnCount = 0;
    hayTimer = 7;
    leafTimer = 0;
  }

  return { state, step, reset };
}
