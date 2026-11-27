// Wattle's Corn-Decoy Run — the renderer. Genuine 3D on a 2D canvas: every thing in the
// world has a 3D position (x lateral in metres, y up, z depth ahead), and the camera
// projects it with a perspective divide onto a fixed 1280x720 logical field, which is
// then scaled to the window. Boxes are drawn as boxes (front, top and side faces,
// shaded differently), the road is a perspective strip, and the turkey is seen from
// behind in a chase view — the farmer looming up behind it as he closes in.
//
// Screens: title, play, paused, game over (caught / escaped). The HUD is drawn big
// and legible: score, distance, lives, combo, dash cooldown, decoys, and the farmer.
import { DEPTH, FIELD, FONT, GAME_NAME, GAME_TAGLINE, GOAL_DISTANCE, PALETTE, ZONES } from './config.js';
import { KIND_BALE, KIND_CORN, KIND_FEATHER, KIND_FENCE, KIND_HAYSTACK, KIND_KNIFE, KIND_OVEN, KIND_PUMPKIN } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const CX = FIELD.width / 2;
const FOCAL = 880;
const CAM_HEIGHT = 2.3;
const CAM_BEHIND = 7;
const LANE_X = 2.2;
const ROAD_HALF = 3.6;
const UNITS_PER_METRE = 18.5;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexLerp(a, b, t) {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`;
}

/** Deterministic hash of an integer mark, for scenery that never changes. */
function hashMark(m) {
  let h = (m * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let camX = 0;
  let lastZone = 0;
  let zoneBanner = 0;
  let zoneBannerText = '';

  /** Project a 3D point to screen space; null when behind the camera. */
  function project(x, y, z) {
    const dz = z - -CAM_BEHIND;
    if (dz < 0.6) return null;
    const s = FOCAL / dz;
    return { x: CX + (x - camX) * s, y: FIELD.horizonY + (CAM_HEIGHT - y) * s, s };
  }

  /** The screen-space width of one metre at depth z. */
  function scaleAt(z) {
    return FOCAL / Math.max(0.6, z + CAM_BEHIND);
  }

  function quad(points, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
  }

  function ellipse(x, y, rx, ry, fill, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** A 3D box: front face toward the camera, plus top and right faces, shaded. */
  function box(cx, yBase, cz, w, h, d, front, top, side) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const zF = cz - d / 2;
    const zB = cz + d / 2;
    const a = project(x0, yBase, zF);
    const b = project(x1, yBase, zF);
    const c = project(x1, yBase + h, zF);
    const e = project(x0, yBase + h, zF);
    const f = project(x1, yBase + h, zB);
    const g = project(x0, yBase + h, zB);
    if (!a || !b || !c || !e || !f || !g) return;
    quad([a, b, c, e], front); // front face
    quad([e, c, f, g], top); // top face
    const h2 = project(x1, yBase, zB);
    if (h2) quad([b, h2, f, c], side); // right face
  }

  function groundShadow(x, z, w, alpha) {
    const p = project(x, 0.02, z);
    if (!p) return;
    ellipse(p.x, p.y, w * p.s * 0.55, w * p.s * 0.14, 'rgba(20,10,8,0.45)', alpha);
  }

  function drawSky(state, zone, blend) {
    const z0 = ZONES[zone];
    const z1 = ZONES[Math.min(zone + 1, ZONES.length - 1)];
    const top = hexLerp(z0.skyTop, z1.skyTop, blend);
    const mid = hexLerp(z0.skyMid, z1.skyMid, blend);
    const low = hexLerp(z0.skyLow, z1.skyLow, blend);
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY + 30);
    grad.addColorStop(0, top);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, low);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 30);
    // Sun in the farmyard, barn and kitchen; a moon over the woods.
    if (zone < 3) {
      const sx = FIELD.width * 0.72;
      const sy = FIELD.horizonY - 96;
      const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 130);
      glow.addColorStop(0, 'rgba(255,217,122,0.85)');
      glow.addColorStop(1, 'rgba(255,179,71,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 140, sy - 140, 280, 280);
      ellipse(sx, sy, 44, 44, PALETTE.sun);
    } else {
      const sx = FIELD.width * 0.72;
      const sy = FIELD.horizonY - 110;
      ellipse(sx, sy, 36, 36, '#e8ecf5');
      ellipse(sx - 12, sy - 8, 30, 30, hexLerp(z0.skyTop, z1.skyTop, blend));
    }
    // Slow clouds.
    ctx.fillStyle = 'rgba(255,230,200,0.16)';
    for (let i = 0; i < 4; i += 1) {
      const cx = ((i * 340 + state.time * 6) % (FIELD.width + 260)) - 130;
      const cy = 52 + i * 34;
      ellipse(cx, cy, 90, 16, 'rgba(255,230,200,0.16)');
      ellipse(cx + 50, cy + 8, 60, 12, 'rgba(255,230,200,0.12)');
    }
    // Distant hills.
    ctx.fillStyle = PALETTE.hillFar;
    ctx.beginPath();
    ctx.moveTo(0, FIELD.horizonY);
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.lineTo(x, FIELD.horizonY - 26 - 18 * Math.sin(x * 0.006 + 1.2));
    }
    ctx.lineTo(FIELD.width, FIELD.horizonY);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround(state, zone, blend) {
    const z0 = ZONES[zone];
    const z1 = ZONES[Math.min(zone + 1, ZONES.length - 1)];
    const ground = hexLerp(z0.ground, z1.ground, blend);
    const groundDark = hexLerp(z0.groundDark, z1.groundDark, blend);
    const road = hexLerp(z0.road, z1.road, blend);
    // Fields either side of the road.
    ctx.fillStyle = ground;
    ctx.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);
    // The road, in perspective strips, far to near — down past the camera plane
    // (z = -6.2) so it runs off the bottom of the screen instead of ending mid-frame.
    const step = 45;
    const clampZ = (z) => Math.max(-6.2, z);
    for (let z = DEPTH.far; z > -6; z -= step) {
      const near = project(-ROAD_HALF, 0, clampZ(z - step));
      const far = project(-ROAD_HALF, 0, z);
      const nearR = project(ROAD_HALF, 0, clampZ(z - step));
      const farR = project(ROAD_HALF, 0, z);
      if (!near || !far || !nearR || !farR) continue;
      const band = Math.floor(z / step) % 2 === 0;
      quad([far, farR, nearR, near], band ? road : groundDark);
      // Centre dashes.
      if (band) {
        const l1 = project(-0.12, 0, z);
        const l2 = project(0.12, 0, z);
        const l3 = project(0.12, 0, clampZ(z - step));
        const l4 = project(-0.12, 0, clampZ(z - step));
        if (l1 && l2 && l3 && l4) quad([l1, l2, l3, l4], PALETTE.roadLine);
      }
      // Fence rails along both road edges, so the posts read as fences.
      for (const side of [-1, 1]) {
        const r0 = project(side * 4.4, 0.95, z);
        const r1 = project(side * 4.4, 0.95, clampZ(z - step));
        const r2 = project(side * 4.4, 0.7, clampZ(z - step));
        const r3 = project(side * 4.4, 0.7, z);
        if (r0 && r1 && r2 && r3) quad([r0, r1, r2, r3], PALETTE.fence);
      }
    }
  }

  /** Fence posts, trees and barns placed by absolute metre mark — deterministic. */
  function drawScenery(state) {
    const dist = state.distance;
    const firstMark = Math.max(0, Math.floor(dist / 12) * 12);
    // Fence posts every 12 m.
    for (let m = firstMark; m < dist + 60; m += 12) {
      const z = (m - dist) * UNITS_PER_METRE;
      if (z < 2 || z > DEPTH.far) continue;
      for (const side of [-1, 1]) {
        box(side * 4.4, 0, z, 0.22, 1.1, 0.22, PALETTE.fenceTop, PALETTE.fence, PALETTE.fence);
      }
    }
    // Trees every 26 m, alternating sides, close enough to the road to read.
    for (let m = firstMark - 40; m < dist + 60; m += 26) {
      const z = (m - dist) * UNITS_PER_METRE;
      if (z < 2 || z > DEPTH.far) continue;
      const side = hashMark(m) > 0.5 ? 1 : -1;
      const x = side * (5.2 + hashMark(m + 7) * 2);
      const s = scaleAt(z);
      const base = project(x, 0, z);
      if (!base) continue;
      // Trunk + three puffs of autumn foliage.
      box(x, 0, z, 0.6, 2.2, 0.6, PALETTE.treeTrunk, PALETTE.treeTrunk, '#4a2c1c');
      const puffs = [
        [0, 3.1, 1.9],
        [-1, 2.5, 1.4],
        [1, 2.5, 1.4],
      ];
      for (const [dx, dy, r] of puffs) {
        const p = project(x + dx, dy, z);
        if (!p) continue;
        const col = [PALETTE.leafA, PALETTE.leafB, PALETTE.leafC][Math.floor(hashMark(m + dx * 10) * 3)];
        ellipse(p.x, p.y, r * s, r * s * 0.85, col);
      }
    }
    // Grass tufts along the roadside, every 8 m — texture for the mid-ground.
    for (let m = firstMark; m < dist + 60; m += 8) {
      const z = (m - dist) * UNITS_PER_METRE;
      if (z < 2 || z > DEPTH.far) continue;
      const side = hashMark(m + 3) > 0.5 ? 1 : -1;
      const x = side * (4.1 + hashMark(m + 11) * 1.1);
      const p = project(x, 0, z);
      if (!p) continue;
      const s = scaleAt(z);
      const col = [PALETTE.leafB, PALETTE.grassNear, PALETTE.leafA][Math.floor(hashMark(m + 5) * 3)];
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, 1.6 * s);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 0.25 * s, p.y - 0.7 * s);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.25 * s, p.y - 0.8 * s);
      ctx.stroke();
    }
    // Landmark barns: one per zone, looming at the roadside.
    const barns = [
      { m: 150, x: -10 },
      { m: 470, x: 10 },
      { m: 760, x: -10 },
      { m: 1050, x: 10 },
    ];
    for (const barn of barns) {
      const z = (barn.m - dist) * UNITS_PER_METRE;
      if (z < 2 || z > DEPTH.far) continue;
      box(barn.x, 0, z, 7, 4.5, 5, PALETTE.barn, '#5d363e', '#3a2027');
      // Roof prism: two slanted quads.
      const r0 = project(barn.x - 3.9, 4.5, z - 2.5);
      const r1 = project(barn.x + 3.9, 4.5, z - 2.5);
      const r2 = project(barn.x, 6.4, z - 2.5);
      const r3 = project(barn.x - 3.9, 4.5, z + 2.5);
      const r4 = project(barn.x + 3.9, 4.5, z + 2.5);
      const r5 = project(barn.x, 6.4, z + 2.5);
      if (r0 && r1 && r2) quad([r0, r1, r2], '#6d2f33');
      if (r1 && r4 && r5 && r2) quad([r1, r4, r5, r2], '#54242a');
      // Warm lit door.
      const d0 = project(barn.x - 1, 0, z - 2.6);
      const d1 = project(barn.x + 1, 0, z - 2.6);
      const d2 = project(barn.x + 1, 2.4, z - 2.6);
      const d3 = project(barn.x - 1, 2.4, z - 2.6);
      if (d0 && d1 && d2 && d3) quad([d0, d1, d2, d3], PALETTE.ovenGlow);
    }
  }

  function drawEntity(entity) {
    const x = entity.lane * LANE_X;
    const z = entity.z;
    const s = scaleAt(z);
    const kind = entity.kind;
    groundShadow(x, z, kind === KIND_OVEN || kind === KIND_KNIFE ? 1.4 : 1, 1);
    if (kind === KIND_OVEN) {
      box(x, 0, z, 2.6, 3.1, 1.8, PALETTE.oven, '#33333e', '#17171d');
      // Glowing oven door + handle + chimney.
      const d0 = project(x - 0.7, 0.5, z - 0.95);
      const d1 = project(x + 0.7, 0.5, z - 0.95);
      const d2 = project(x + 0.7, 1.9, z - 0.95);
      const d3 = project(x - 0.7, 1.9, z - 0.95);
      if (d0 && d1 && d2 && d3) {
        quad([d0, d1, d2, d3], PALETTE.ovenDoor);
        quad([d0, d1, d2, d3], 'rgba(255,122,42,0.35)');
      }
      box(x + 0.7, 2.8, z, 0.4, 0.9, 0.4, '#33333e', '#44444f', '#17171d');
      const glow = project(x, 1.2, z - 1);
      if (glow) {
        // A tight radial glow, capped so it never washes the whole screen.
        const r = Math.min(90 * s, 140);
        const g = ctx.createRadialGradient(glow.x, glow.y, 4, glow.x, glow.y, r);
        g.addColorStop(0, 'rgba(255,122,42,0.4)');
        g.addColorStop(1, 'rgba(255,122,42,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(glow.x, glow.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    if (kind === KIND_KNIFE) {
      const tilt = Math.sin(entity.spin) * 0.35;
      const tip = project(x + Math.sin(tilt) * 2, 4.2, z);
      const base = project(x, 0, z);
      if (!tip || !base) return;
      ctx.save();
      ctx.translate(base.x, base.y);
      ctx.rotate(-tilt);
      const h = (base.y - tip.y) || 10;
      ctx.fillStyle = PALETTE.knifeBlade;
      ctx.beginPath();
      ctx.moveTo(-0.38 * s, 0);
      ctx.lineTo(-0.38 * s, -h * 0.72);
      ctx.lineTo(0, -h);
      ctx.lineTo(0.38 * s, -h * 0.72);
      ctx.lineTo(0.38 * s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.knifeEdge;
      ctx.fillRect(-0.38 * s, -h * 0.72, 0.1 * s, h * 0.72);
      ctx.fillStyle = PALETTE.knifeHandle;
      ctx.fillRect(-0.42 * s, -h * 0.18, 0.84 * s, h * 0.2);
      ctx.restore();
      return;
    }
    if (kind === KIND_BALE) {
      box(x, 0, z, 2, 1.4, 1.4, PALETTE.hay, PALETTE.hayDark, '#a8822e');
      const p = project(x, 0.7, z - 0.75);
      if (p) {
        ctx.strokeStyle = 'rgba(120,90,20,0.7)';
        ctx.lineWidth = Math.max(1, 1.5 * s);
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.moveTo(p.x - 0.8 * s, p.y + i * 0.35 * s);
          ctx.lineTo(p.x + 0.8 * s, p.y + i * 0.35 * s);
          ctx.stroke();
        }
      }
      return;
    }
    if (kind === KIND_FENCE) {
      box(x, 0, z, 2.2, 1.1, 0.3, PALETTE.fenceTop, PALETTE.fence, '#4a3018');
      const p = project(x, 0.55, z - 0.2);
      if (p) {
        ctx.strokeStyle = 'rgba(40,24,8,0.8)';
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(p.x - 1 * s, p.y);
        ctx.lineTo(p.x + 1 * s, p.y);
        ctx.stroke();
      }
      return;
    }
    if (kind === KIND_HAYSTACK) {
      const base = project(x, 0, z);
      const apex = project(x, 2.6, z);
      const l = project(x - 1.6, 0, z);
      const r = project(x + 1.6, 0, z);
      if (!base || !apex || !l || !r) return;
      quad([l, r, apex], PALETTE.hay);
      quad([apex, r, { x: (apex.x + r.x) / 2 + 0.3 * s, y: (apex.y + r.y) / 2 }], PALETTE.hayDark);
      ctx.strokeStyle = 'rgba(120,90,20,0.6)';
      ctx.lineWidth = Math.max(1, 1.2 * s);
      for (let i = 1; i <= 3; i += 1) {
        const t = i / 4;
        ctx.beginPath();
        ctx.moveTo(lerp(l.x, apex.x, t), lerp(l.y, apex.y, t));
        ctx.lineTo(lerp(r.x, apex.x, t), lerp(r.y, apex.y, t));
        ctx.stroke();
      }
      return;
    }
    if (kind === KIND_CORN || kind === KIND_PUMPKIN || kind === KIND_FEATHER) {
      const bob = Math.sin(entity.spin * 2) * 0.12;
      const p = project(x, 0.55 + bob, z);
      if (!p) return;
      if (kind === KIND_CORN) {
        ellipse(p.x, p.y, 0.42 * s, 0.3 * s, PALETTE.corn);
        ctx.strokeStyle = PALETTE.cornHusk;
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.beginPath();
        ctx.moveTo(p.x - 0.42 * s, p.y + 0.1 * s);
        ctx.lineTo(p.x - 0.7 * s, p.y + 0.45 * s);
        ctx.moveTo(p.x + 0.42 * s, p.y + 0.1 * s);
        ctx.lineTo(p.x + 0.7 * s, p.y + 0.45 * s);
        ctx.stroke();
      } else if (kind === KIND_PUMPKIN) {
        ellipse(p.x, p.y, 0.5 * s, 0.42 * s, PALETTE.pumpkin);
        ctx.strokeStyle = PALETTE.pumpkinDark;
        ctx.lineWidth = Math.max(1, 1.5 * s);
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 0.5 * s * Math.abs(i) * 0.5 + 0.08 * s, 0.42 * s, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = '#3a5a2a';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 0.4 * s);
        ctx.lineTo(p.x + 0.1 * s, p.y - 0.65 * s);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(entity.spin) * 0.5);
        ellipse(0, 0, 0.45 * s, 0.18 * s, PALETTE.feather);
        ctx.strokeStyle = '#b8a888';
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(-0.45 * s, 0);
        ctx.lineTo(0.45 * s, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawTurkey(state) {
    const player = state.player;
    const px = player.lane * LANE_X;
    const jump = player.jumpY;
    const bob = Math.sin(player.running * 2) * 3;
    // The turkey's screen x follows the same projection as the road, so it
    // stands in its lane — not on the centre line — when it switches lanes.
    const sx = CX + (px - camX) * scaleAt(0);
    const groundY = 600;
    const lift = jump * 150;
    const y = groundY - lift + bob * 0.4;
    const scale = 1 + jump * 0.08;
    const blink = player.invuln > 0 && Math.floor(state.time * 12) % 2 === 0;
    // Ground shadow, shrinking as the bird rises.
    ellipse(sx, groundY + 26, 52 * (1 - jump * 0.25), 12 * (1 - jump * 0.25), 'rgba(20,10,8,0.5)');
    if (state.hiding > 0) {
      // Hidden in the hay: just a rustling haystack where the turkey was.
      const wob = Math.sin(state.time * 9) * 3;
      ctx.save();
      ctx.translate(sx + wob, groundY);
      ctx.fillStyle = PALETTE.hay;
      ctx.beginPath();
      ctx.moveTo(-58, 0);
      ctx.quadraticCurveTo(-30, -66, 0, -72);
      ctx.quadraticCurveTo(30, -66, 58, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.hayDark;
      ctx.beginPath();
      ctx.moveTo(0, -72);
      ctx.quadraticCurveTo(30, -66, 58, 0);
      ctx.lineTo(20, 0);
      ctx.quadraticCurveTo(12, -50, 0, -72);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 26px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('HIDDEN!', sx, groundY - 96);
      return;
    }
    ctx.save();
    ctx.translate(sx, y);
    ctx.scale(scale, scale);
    if (blink) ctx.globalAlpha = 0.35;
    // Tail fan, fanned behind and above the body.
    const sway = Math.sin(player.running) * 4;
    const tailCols = PALETTE.tail;
    for (let i = 0; i < 5; i += 1) {
      const ang = (-52 + i * 26 + sway * 0.3) * (Math.PI / 180);
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = tailCols[i % tailCols.length];
      ctx.beginPath();
      ctx.ellipse(0, -58, 13, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,150,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, -82, 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Legs, running.
    const legSwing = Math.sin(player.running * 2) * 10;
    ctx.strokeStyle = PALETTE.beak;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-12, 26);
    ctx.lineTo(-12 + legSwing, 44);
    ctx.moveTo(12, 26);
    ctx.lineTo(12 - legSwing, 44);
    ctx.stroke();
    // Wings, flapping.
    const flap = Math.sin(player.running * 2) * 6;
    ctx.fillStyle = PALETTE.turkeyDark;
    ctx.beginPath();
    ctx.ellipse(-34, -6 + flap, 14, 24, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(34, -6 - flap, 14, 24, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Body, seen from behind.
    ctx.fillStyle = PALETTE.turkeyBody;
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.turkeyLight;
    ctx.beginPath();
    ctx.ellipse(0, 8, 28, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head peeking over the top, wattle dangling.
    ctx.fillStyle = PALETTE.head;
    ctx.beginPath();
    ctx.arc(0, -46, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.wattle;
    ctx.beginPath();
    ctx.ellipse(4, -34, 4, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.beak;
    ctx.beginPath();
    ctx.moveTo(-4, -48);
    ctx.lineTo(8, -45);
    ctx.lineTo(-4, -42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Dash streaks.
    if (state.dashTime > 0) {
      ctx.strokeStyle = 'rgba(255,217,122,0.7)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const yy = y - 30 + i * 26;
        ctx.beginPath();
        ctx.moveTo(sx - 60, yy);
        ctx.lineTo(sx - 110 - i * 18, yy);
        ctx.stroke();
      }
    }
    // Decoy toss: corn arcing away behind the bird.
    for (const fx of state.decoyFx) {
      const t = fx.t;
      const fxX = sx - 40 - t * 160;
      const fxY = y - 20 - Math.sin(t * 3) * 30;
      ellipse(fxX, fxY, 10, 7, PALETTE.corn);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 18px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('DECOY!', fxX, fxY - 18);
    }
  }

  function drawFarmer(state) {
    const closeness = 1 - state.farmerDist / 85;
    // Feet below the bottom edge, head rising as he closes in: far away he is just
    // a hat at the bottom edge; close up he looms over the turkey — but the turkey
    // is drawn after him, so it always stays in front.
    const h = 60 + closeness * 320;
    // He chases from directly behind, leaning in from the side as he closes in,
    // so his head and reaching arms show beside the turkey instead of hiding
    // behind it. His screen x follows the same projection as the turkey.
    const fx = CX + (state.player.lane * LANE_X - camX) * scaleAt(0) + 70 * closeness;
    const fy = FIELD.height + 30;
    const eating = state.farmerEating > 0;
    const runPhase = state.time * 9;
    const bob = Math.sin(runPhase) * 4;
    ctx.save();
    ctx.translate(fx, fy + bob);
    ctx.globalAlpha = 0.35 + closeness * 0.65;
    const s = h / 170;
    // Legs.
    ctx.strokeStyle = '#2a2a33';
    ctx.lineWidth = 10 * s;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -52 * s);
    ctx.lineTo(-16 * s + Math.sin(runPhase) * 8 * s, 0);
    ctx.moveTo(10 * s, -52 * s);
    ctx.lineTo(16 * s - Math.sin(runPhase) * 8 * s, 0);
    ctx.stroke();
    // Overalls + shirt.
    ctx.fillStyle = PALETTE.farmerShirt;
    ctx.fillRect(-29 * s, -118 * s, 58 * s, 68 * s);
    ctx.fillStyle = '#2a3a5a';
    ctx.fillRect(-24 * s, -96 * s, 48 * s, 46 * s);
    // Arms reaching forward (or bent, eating corn).
    ctx.strokeStyle = PALETTE.farmerShirt;
    ctx.lineWidth = 12 * s;
    ctx.beginPath();
    if (eating) {
      ctx.moveTo(-24 * s, -108 * s);
      ctx.lineTo(-36 * s, -72 * s);
      ctx.moveTo(24 * s, -108 * s);
      ctx.lineTo(36 * s, -72 * s);
    } else {
      ctx.moveTo(-24 * s, -108 * s);
      ctx.lineTo(-48 * s, -130 * s);
      ctx.moveTo(24 * s, -108 * s);
      ctx.lineTo(48 * s, -130 * s);
    }
    ctx.stroke();
    // Head + straw hat.
    ctx.fillStyle = PALETTE.farmerSkin;
    ctx.beginPath();
    ctx.arc(0, -138 * s, 18 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.farmerHat;
    ctx.beginPath();
    ctx.ellipse(0, -152 * s, 30 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -158 * s, 15 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Moustache.
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(-10 * s, -132 * s, 20 * s, 4 * s);
    ctx.restore();
    if (eating) {
      ctx.fillStyle = PALETTE.corn;
      ctx.font = 'bold 20px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('MUNCH MUNCH…', fx, fy - h - 30);
    }
  }

  function drawLeaves(state) {
    const cols = [PALETTE.leafA, PALETTE.leafB, PALETTE.leafC];
    for (const leaf of state.leaves) {
      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(leaf.sway);
      ctx.fillStyle = cols[leaf.hue];
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(24,16,30,0.92)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
  }

  function drawHud(state, best) {
    // Top bar.
    ctx.fillStyle = 'rgba(20,12,26,0.78)';
    ctx.fillRect(0, 0, FIELD.width, 74);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 74, FIELD.width, 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('SCORE', 24, 26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 34px ' + FONT;
    ctx.fillText(String(Math.floor(state.score)), 24, 60);
    // Distance + zone, centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(`${state.zoneName.toUpperCase()}  •  ${Math.floor(state.distance)} m / ${GOAL_DISTANCE} m`, CX, 26);
    ctx.fillStyle = 'rgba(255,246,232,0.25)';
    ctx.fillRect(CX - 220, 38, 440, 12);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(CX - 220, 38, 440 * Math.min(1, state.distance / GOAL_DISTANCE), 12);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(`BEST ${Math.floor(Math.max(best, state.score))}`, CX, 68);
    // Lives + combo + dash + decoys, right.
    ctx.textAlign = 'right';
    let hearts = '';
    for (let i = 0; i < 3; i += 1) hearts += i < state.lives ? '♥ ' : '♡ ';
    ctx.fillStyle = state.lives === 1 ? PALETTE.danger : '#ff7a6a';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(hearts, FIELD.width - 24, 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillText(`COMBO x${state.mult}   🌽 DECOY ${state.decoys}   DASH ${state.dashCd <= 0 ? 'READY' : Math.ceil(state.dashCd) + 's'}`, FIELD.width - 24, 66);
    // Farmer meter, bottom-left.
    const fx = 24;
    const fy = FIELD.height - 58;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText('FARMER BRAM', fx, fy - 8);
    ctx.fillStyle = 'rgba(255,246,232,0.25)';
    ctx.fillRect(fx, fy, 220, 12);
    const frac = state.farmerDist / 85;
    ctx.fillStyle = frac > 0.5 ? '#7ac74f' : frac > 0.25 ? PALETTE.gold : PALETTE.danger;
    ctx.fillRect(fx, fy, 220 * frac, 12);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(`${Math.floor(state.farmerDist)} m behind`, fx + 230, fy + 11);
    // Warnings.
    if (state.farmerDist < 20 && !state.over) {
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? PALETTE.danger : PALETTE.text;
      ctx.font = 'bold 26px ' + FONT;
      ctx.fillText("HE'S RIGHT BEHIND YOU!", CX, 116);
    }
    // Context prompts.
    let nearHay = false;
    for (const e of state.entities) {
      if (e.active && e.kind === KIND_HAYSTACK && e.z < 130 && e.z > -10 && Math.abs(e.lane - state.player.lane) <= 0.62) nearHay = true;
    }
    if (nearHay && state.hiding <= 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText('HAYSTACK! Press ↓ to HIDE', CX, FIELD.height - 92);
    } else if (state.decoys > 0 && state.farmerDist < 30) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText('Press C — toss a CORN DECOY!', CX, FIELD.height - 92);
    }
    if (zoneBanner > 0) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, zoneBanner);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 54px ' + FONT;
      ctx.fillText(zoneBannerText, CX, 220);
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(ZONES[state.zone].name === 'Kitchen Yard' ? 'ovens and knives everywhere — keep moving' : ZONES[state.zone].name === 'Moonlit Woods' ? 'the gate is close — don’t stop now' : ZONES[state.zone].name === 'Barn' ? 'haystacks to hide in — mind the farmer' : 'run, Wattle, run!', CX, 252);
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(16,10,24,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(190, 96, 900, 480);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('THANKSGIVING MORNING  •  THISTLEDOWN FARM', CX, 150);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 62px ' + FONT;
    ctx.fillText("Wattle's Corn-Decoy Run", CX, 216);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '22px ' + FONT;
    ctx.fillText(GAME_TAGLINE, CX, 254);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '20px ' + FONT;
    ctx.fillText('Farmer Bram has the oven hot and the carving knife out.', CX, 296);
    ctx.fillText('Run 1,200 m through farmyard, barn, kitchen yard and woods.', CX, 324);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('← →  move lanes      SPACE / ↑  jump      SHIFT  dash', CX, 372);
    ctx.fillText('↓  hide in a haystack      C  toss a corn decoy      P  pause', CX, 402);
    ctx.fillText('Mouse: click left / right to move, click the turkey to jump', CX, 432);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText('Press SPACE or click to start', CX, 486);
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '20px ' + FONT;
      ctx.fillText(`Best score: ${Math.floor(best)}`, CX, 524);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px ' + FONT;
    ctx.fillText('A deterministic game: the same seed always runs the same farm.', CX, 552);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(16,10,24,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(CX - 260, 260, 520, 180);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 48px ' + FONT;
    ctx.fillText('PAUSED', CX, 330);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '20px ' + FONT;
    ctx.fillText('Press P or SPACE to keep running', CX, 372);
  }

  function drawOver(state, best) {
    const escaped = state.cause === 'escaped';
    ctx.fillStyle = escaped ? 'rgba(10,30,16,0.62)' : 'rgba(40,8,10,0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(290, 110, 700, 470);
    ctx.textAlign = 'center';
    ctx.fillStyle = escaped ? PALETTE.gold : PALETTE.danger;
    ctx.font = 'bold 72px ' + FONT;
    ctx.fillText(escaped ? 'ESCAPED!' : 'CAUGHT!', CX, 196);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px ' + FONT;
    if (escaped) {
      ctx.fillText('Wattle slipped through the forest gate — no roast today.', CX, 238);
      ctx.fillText('Farmer Bram is still looking in the haystacks.', CX, 266);
    } else {
      ctx.fillText('Farmer Bram caught up — the oven was already hot.', CX, 238);
      ctx.fillText('The corn decoys were delicious, though. He admits it.', CX, 266);
    }
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(`SCORE  ${Math.floor(state.score)}`, CX, 330);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '21px ' + FONT;
    ctx.fillText(`Distance  ${Math.floor(state.distance)} m  •  Corn ${state.stats.corn}  •  Hides ${state.stats.hides}  •  Decoys ${state.stats.decoysUsed}  •  Dashes ${state.stats.dashes}`, CX, 372);
    ctx.fillText(`Best score  ${Math.floor(Math.max(best, state.score))}`, CX, 404);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText('Press SPACE or click to run again', CX, 470);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '17px ' + FONT;
    ctx.fillText(escaped ? 'The gate stays open. Run it again, faster.' : 'Tip: hide in haystacks and toss decoys when Bram gets close.', CX, 512);
  }

  function draw(state, screen, best) {
    // Camera follows the turkey's lane, lagging a little so lane moves read on screen.
    const targetCamX = state.player.lane * LANE_X * 0.55;
    camX += (targetCamX - camX) * 0.12;
    // Zone banner.
    if (state.zone !== lastZone) {
      lastZone = state.zone;
      zoneBanner = 2.4;
      zoneBannerText = ZONES[state.zone].name.toUpperCase();
    }
    if (zoneBanner > 0) zoneBanner -= 1 / 60;
    const zone = state.zone;
    const zoneStart = zone * ZONES[0].length;
    const blend = Math.min(1, Math.max(0, (state.distance - (zoneStart + ZONES[0].length - 40)) / 40));

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth || FIELD.width;
    const ch = canvas.clientHeight || FIELD.height;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const ox = (canvas.width - FIELD.width * scale) / 2;
    const oy = (canvas.height - FIELD.height * scale) / 2;
    // Fill the letterbox bars with the sky's top colour so they match the scene.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ZONES[zone].skyTop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);

    drawSky(state, zone, blend);
    drawGround(state, zone, blend);
    drawScenery(state);
    // Entities, far to near.
    const live = state.entities.filter((e) => e.active).sort((a, b) => b.z - a.z);
    for (const entity of live) drawEntity(entity);
    drawLeaves(state);
    // The farmer first, low at the bottom edge and partly behind the turkey:
    // he is chasing from behind the camera, so the turkey — drawn after him —
    // stays in front and readable, with his hat and reaching arms showing over it.
    drawFarmer(state);
    drawTurkey(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(state, best);
  }

  return { draw };
}
