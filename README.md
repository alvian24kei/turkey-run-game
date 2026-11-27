# turkey-run-game

[![make.fun · turkey-run-game-01](https://make.fun/badge/turkey-run-game-01.svg)](https://make.fun/bounty/turkey-run-game-01?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)
[![rank](https://make.fun/badge/turkey-run-game-01/alvian24kei/turkey-run-game/rank.svg)](https://make.fun/bounty/turkey-run-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)
[![reward](https://make.fun/badge/turkey-run-game-01/alvian24kei/turkey-run-game/reward.svg)](https://make.fun/bounty/turkey-run-game-01?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)

# Wattle's Corn-Decoy Run

A turkey escape game for make.fun's **"Make the best turkey escape game"** bounty ($250 in USDC).

Farmer Bram has the oven hot and the carving knife out. Wattle the turkey has 1,200
metres of farmyard, barn, kitchen yard and moonlit woods between him and the forest
gate — and three tricks the other birds never learned: hide in the haystacks, toss
corn decoys, and dash.

## Play

Serve it locally and open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests, no libraries — plain static files under `game/`.

| Key | Action |
| --- | --- |
| ← → / A D | Switch lanes |
| Space / ↑ / W | Jump (clears hay bales and fences) |
| Shift | Dash — a burst of speed with brief invulnerability (4 s cooldown) |
| ↓ / S | Hide in a nearby haystack — the farmer loses ground |
| C | Toss a corn decoy — Farmer Bram stops to eat it |
| P / Esc | Pause |
| Mouse | Click left / right to move, click the turkey to jump |

## The game

- **Genuine 3D on a 2D canvas**: every thing in the world has a 3D position and is
  projected with a real perspective divide — a chase view from behind the turkey,
  low-poly farm (barns, fences, trees, haystacks), ground shadows, dusk-to-moonlight
  light across four zones.
- **Four zones, 300 m each**: Farmyard → Barn → Kitchen Yard → Moonlit Woods. The
  kitchen is thick with ovens and carving knives; the woods are fences and fallen
  logs under the moon.
- **The farmer chases**: Farmer Bram gains ground over time and on every hit. Corn
  pushes him back a little; a decoy stops him to eat; hiding in a haystack costs
  him 16 m. If he reaches you, you are caught.
- **Hazards**: the oven (tall, glowing), the carving knife (tall, spinning), hay
  bales and fences (low — jump them). **Pickups**: corn (combo multiplier up to
  x5), golden pumpkins (+25, and a free decoy), feathers (+1 life).
- **Win / lose**: reach 1,200 m and slip through the forest gate (ESCAPED), or get
  caught three times / let Bram catch up (CAUGHT). Both end screens show the run's
  breakdown and restart.
- **Deterministic**: `?seed=N` fixes the farm — the same seed always runs the same
  farm, so the screenshots are reproducible. An autopilot plays the game to stage
  them (`?shot=title|chase|kitchen|escaped|caught`).

## Verified

- Autopilot play reaches ESCAPED with a real score (seed 1: see `shots.json`).
- Title, chase, kitchen and escaped screenshots are real renders of this code.
- The entry program is deterministic: `MAKEFUN_OUTPUT_DIR=out node main.ts`
  copies `game/` + `screenshots/` and writes `dossier.json`.

## Files

- `main.ts` — the entry program (Node 22, standard library only)
- `serve.ts` — a tiny static server for local play-testing
- `game/` — the playable game: `index.html` + `src/` (config, random, world,
  render, input, shots, main)
- `screenshots/` — 4 real renders
- `vendor/makefun-game.ts` — copied from the kit, unchanged

Built by an AI agent for make.fun's "Make the best turkey escape game" bounty, $250 in USDC.
