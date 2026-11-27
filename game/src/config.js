// Gobble Dash — tuning and palette. One place for every number the game runs on.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the screen size. Distances are in metres, depth in world units.

export const FIELD = { width: 1280, height: 720, horizonY: 236 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How far ahead, in world units, things appear (the horizon) and vanish (behind the camera). */
export const DEPTH = { far: 900, kill: -60 };

/** The turkey: three lanes, a jump, and a short grace period after a hit. */
export const PLAYER = {
  laneSpeed: 4.2, // lanes per second while switching
  jumpSpeed: 9.5, // jump velocity; gravity pulls it back down
  gravity: 26,
  invulnerable: 1.6,
  width: 0.5, // in lane units, for collision checks
};

export const LIVES = 3;

/** The forest gate that means escape, in metres down the lane. */
export const GOAL_DISTANCE = 1200;

/** Four zones, 300 m each: the run changes look and temper as it goes. */
export const ZONES = [
  { name: 'Farmyard', length: 300, skyTop: '#2e1a4d', skyMid: '#b83a4b', skyLow: '#f08a3c', ground: '#8a6d2f', groundDark: '#6d5423', road: '#a97e4f' },
  { name: 'Barn', length: 300, skyTop: '#241533', skyMid: '#8a2f3d', skyLow: '#d8722e', ground: '#7a5c26', groundDark: '#5d4620', road: '#96683d' },
  { name: 'Kitchen Yard', length: 300, skyTop: '#1c1030', skyMid: '#7a2438', skyLow: '#c95a2e', ground: '#6d4a2a', groundDark: '#523722', road: '#8a6a4a' },
  { name: 'Moonlit Woods', length: 300, skyTop: '#0d1230', skyMid: '#27355e', skyLow: '#4a5a8a', ground: '#2e4a2e', groundDark: '#223722', road: '#5d5142' },
];

/** Dash: a burst of speed with brief invulnerability, on a cooldown. */
export const DASH = { time: 0.55, cooldown: 4, speedMult: 1.55 };

/** Hide: dive into a haystack; the farmer loses ground while you are hidden. */
export const HIDE = { time: 2.2, farmerLoss: 16, points: 15 };

/** Corn decoy: toss corn behind; the farmer stops to eat and loses ground. */
export const DECOY = { start: 3, farmerLoss: 13, eatTime: 3 };

/** The farmer starts this far behind (metres) and gains ground over time and on every hit. */
export const FARMER = { start: 62, drain: 0.28, hitGain: 18, cornPush: 0.6, max: 85 };

/** Speed in metres per second at level 1, and how much each level adds. */
export const SPEED = { base: 13.5, perLevel: 1.25, maxLevel: 10, levelEveryMetres: 150 };

/** How fast things rush toward the camera, in depth units per second. */
export const APPROACH = { base: 250, perLevel: 22 };

/** Spawning: seconds between spawn events, shrinking as levels rise. */
export const SPAWN = { base: 1.18, perLevel: 0.07, min: 0.55, cornEvery: 4 };

/** Points: distance trickles in, corn pays, pumpkins pay big, and the combo multiplies pickups. */
export const SCORE = {
  perMetre: 0.6,
  corn: 10,
  pumpkin: 25,
  feather: 0,
  comboEvery: 4, // every 4 corn without a hit raises the multiplier by one
  comboMax: 5,
};

/** How many falling/scrolling things can exist at once; the pool is allocated once, at boot. */
export const POOL_SIZE = 96;

export const PALETTE = {
  skyTop: '#2e1a4d',
  skyMid: '#b83a4b',
  skyLow: '#f08a3c',
  sun: '#ffd97a',
  sunGlow: '#ffb347',
  hillFar: '#7a4a5e',
  hillNear: '#5d3a4a',
  barn: '#4a2c33',
  grassFar: '#8a6d2f',
  grassNear: '#6d8f3a',
  grassDark: '#55702c',
  road: '#a97e4f',
  roadEdge: '#7d5a35',
  roadLine: '#e8d9a8',
  fence: '#6b4a2a',
  fenceTop: '#8a6238',
  treeTrunk: '#5d3a24',
  leafA: '#e07840',
  leafB: '#e8b23c',
  leafC: '#c94f38',
  turkeyBody: '#7a4a26',
  turkeyDark: '#5d3419',
  turkeyLight: '#a06a3c',
  tail: ['#b85c2e', '#d2691e', '#e8a33c', '#c94f38', '#8a4a2a'],
  head: '#d8b596',
  wattle: '#e5534b',
  beak: '#e8a33c',
  farmerHat: '#d8c27a',
  farmerShirt: '#3a5a8a',
  farmerSkin: '#d8a878',
  oven: '#23232a',
  ovenDoor: '#3a3a44',
  ovenGlow: '#ff7a2a',
  knifeBlade: '#dfe5ec',
  knifeEdge: '#ffffff',
  knifeHandle: '#7a4a26',
  hay: '#e8c25e',
  hayDark: '#c9a13c',
  corn: '#f2c94c',
  cornHusk: '#5d8a3c',
  pumpkin: '#e07830',
  pumpkinDark: '#b85c1e',
  feather: '#f5f0e6',
  panel: '#241a2e',
  panelEdge: '#f08a3c',
  text: '#fff6e8',
  muted: '#d8bfae',
  danger: '#ff5a4a',
  gold: '#ffd97a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'wattles-corn-decoy-run.best';

/** The game's name — Wattle the turkey, and the corn decoys that save him. */
export const GAME_NAME = "Wattle's Corn-Decoy Run";
export const GAME_TAGLINE = 'Hide in the hay. Toss the corn. Dash past the oven. 1,200 m to the woods.';
