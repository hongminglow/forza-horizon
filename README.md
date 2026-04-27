# Jungle Sprint Racer

Jungle Sprint Racer is a first-person 3D browser racing game built with Vite, TypeScript, Three.js, and Rapier. The player drives a cockpit-view rally car around a single jungle track, racing through mud, dense vegetation, rocks, logs, and narrow forest edges.

The project is focused on a playable driving loop rather than a menu-heavy experience. The main screen is the race: speed, lap count, timing, and the road ahead.

## Game Concept

The game is a compact jungle time-trial racer. The player starts near the finish line and must complete 3 valid laps around a closed forest track. The track uses procedural geometry and generated materials for the road, terrain, vegetation, water, rocks, and jungle props.

The intended feel is closer to a lightweight rally prototype than an arcade character controller. The car should accelerate forward, brake or reverse, steer through tire angle, slide slightly under load, and react to track boundaries or obstacles.

## Controls

- `W`: throttle
- `S`: brake, then reverse once the car slows down
- `A`: steer left
- `D`: steer right
- `R`: reset the race

## Game Mechanics

The car uses a custom fixed-step vehicle controller layered over a Rapier physics world. Instead of moving the car directly left or right, WASD input is interpreted as driving controls:

- `W` applies engine acceleration along the car body.
- `S` applies braking force, then reverse acceleration.
- `A` and `D` change the steering angle, similar to turning front tires.
- Steering affects yaw rate from signed speed, input direction, and grip. `A` and `D` only rotate heading; they never directly change world `x` or `z`.
- The car advances through signed longitudinal speed, so normal driving follows the body direction instead of sliding sideways like a free-moving object.
- Reversing uses the same steering angle with inverted yaw response, so `S + D` backs the car to the driver's right and `S + A` backs it to the driver's left.
- Track edges apply pushback and drag when the car leaves the driveable lane.
- Logs, rocks, and trees use collision proxies so the car cannot pass through them.
- Lap counting requires forward motion through the full checkpoint sequence before crossing the finish line.

## Technical Notes

- Rendering: Three.js WebGL scene with a first-person camera inside the car rig.
- Physics: Rapier world for base colliders plus custom vehicle/collision response for deterministic driving feel.
- Track: Catmull-Rom closed jungle route sampled into road mesh, boundaries, checkpoints, and collision data.
- Assets: Procedural meshes and generated canvas textures for terrain, road, bark, leaves, rocks, mud, water, and vegetation.
- UI: Lightweight DOM HUD for speed, lap count, time, and best lap.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```

The development server defaults to Vite's host configuration from `package.json`.
