# Jungle Sprint Racer - Master Game Spec

This document is the shared source of truth for the game. Any future implementation work should follow this spec before changing code.

## Development Progress Checklist

- [x] Defined the game identity: first-person jungle car racing prototype.
- [x] Defined the required WASD driving contract.
- [x] Defined the no-strafing vehicle movement rule.
- [x] Defined forward/reverse steering behavior, including `S + A` and `S + D`.
- [x] Defined lap validation requirements to prevent false lap counts.
- [x] Defined obstacle collision expectations.
- [x] Defined runtime ownership boundaries between input, car simulation, visuals, jungle map, and main loop.
- [x] Added suggested starting vehicle tuning values.
- [x] Defined capped real delta-time handling.
- [x] Defined exact `S` brake/reverse threshold behavior.
- [x] Locked camera yaw/pitch to car heading during normal driving.
- [x] Defined per-frame requestAnimationFrame update order.
- [ ] User review and approval of this master spec.
- [ ] Apply final control fixes strictly from this spec.
- [ ] Re-test parked steering, forward turning, reverse turning, collisions, lap counting, desktop render, and mobile render.

## Product Summary

Build a first-person 3D jungle racing game in the browser. The player drives a rally-style car through one closed jungle track, avoids obstacles, completes laps, and sees speed/lap/time through a compact HUD.

The game should feel like a lightweight rally-driving prototype, not a free-moving object controller. The player is controlling a car through throttle, brake/reverse, steering angle, heading, and speed. The player is not controlling a character that can strafe.

## Technical Stack

- Runtime: Vite + TypeScript.
- Rendering: Three.js WebGL.
- Physics: Rapier for world/collider infrastructure, with a custom deterministic vehicle controller for car feel.
- UI: DOM HUD layered over the WebGL canvas.
- Camera: first-person cockpit camera attached to the car rig.
- Assets: procedural or generated jungle road, vegetation, rocks, logs, water, and terrain textures.

## Game Loop

1. Player starts near the finish line inside the cockpit camera.
2. Player drives around the jungle track using WASD.
3. Player avoids logs, rocks, trees, and track edges.
4. Lap only counts after the car passes required checkpoints in order and crosses the finish line in the correct forward direction.
5. Race finishes after 3 valid laps.
6. `R` resets the car and race timer.

## requestAnimationFrame Ownership

`main` owns the single browser `requestAnimationFrame` loop. Simulation must update before rendering so the camera and HUD use the current frame's physics state.

Loop order per frame:

1. Read input.
2. Step `CarController` physics.
3. Sync `carModel` mesh to simulation state.
4. Update camera from car position and heading.
5. Update HUD.
6. Call `renderer.render()`.

There must be no second gameplay loop inside the car controller, input system, HUD, or render helpers.

## Delta Time Handling

Physics must use real frame delta time from the Three.js clock, capped to avoid large jumps after tab unfocus or frame stalls:

```ts
const dt = Math.min(clock.getDelta(), 0.05);
```

Fixed-dt assumptions are not allowed for the main browser loop. Any per-frame tuning value based on 60fps should be normalized against `dt`.

## Coordinate Convention

The game uses Three.js-style world coordinates:

- `x`: world left/right axis.
- `y`: vertical axis.
- `z`: world depth axis.
- Car heading is stored as yaw in radians.
- Car forward vector is derived from heading:

```ts
forward.x = Math.sin(heading);
forward.z = -Math.cos(heading);
```

The exact sign of `z` is less important than consistency. All movement must use the car's current heading vector, not direct world-axis input.

## Input Contract

Physical keyboard input maps to driving actions:

- `W`: throttle forward.
- `S`: brake if moving forward; reverse if stopped or already reversing.
- `A`: steer left.
- `D`: steer right.
- `R`: reset race.

Important: `A` and `D` must never directly change `position.x` or `position.z`.

`S` has a numeric threshold so floating point drift does not break brake/reverse behavior:

```ts
if (S && speed > 0.1) {
  // Brake while still moving forward.
  speed -= brakingForce * dt;
}

if (S && speed <= 0.1) {
  // Reverse once nearly stopped.
  speed -= reverseAcceleration * dt;
}
```

Default `reverseAcceleration` can start equal to `acceleration` unless it is split into a separate tuning value later.

## Vehicle State

The vehicle simulation should own these values outside the Three.js mesh:

- `position`: car world position.
- `heading` or `yaw`: car facing angle.
- `speed`: signed scalar speed along the car forward axis.
- `steeringAngle`: visual and simulation steering angle.
- `yawRate`: smoothed turn velocity.
- `lapState`: checkpoints, current progress, lap count, best lap, race finish state.

The Three.js car mesh is only a visual adapter. It should copy simulation state each frame.

## Suggested Starting Vehicle Values

Use these as the first tuning baseline before playtesting:

```ts
const maxForwardSpeed = 18; // m/s, about 65 km/h
const maxReverseSpeed = -6; // m/s
const acceleration = 12; // m/s^2
const brakingForce = 18; // m/s^2
const damping = 0.97; // multiplied per frame at 60fps
const turnSpeed = 1.8; // rad/s at reference speed
const referenceSpeed = 8; // m/s; full turn authority starts here
const steeringEaseSpeed = 5.0; // steeringAngle lerp speed
```

When using variable `dt`, apply damping as a 60fps-normalized value:

```ts
speed *= Math.pow(damping, dt * 60);
```

## Core Steering Logic

The intended model is intentionally simple and strict:

```ts
if (W) speed += acceleration * dt;
if (S) speed -= brakingOrReverseAcceleration * dt;

speed *= damping;
speed = clamp(speed, maxReverseSpeed, maxForwardSpeed);

if (A) steeringInput = -1;
if (D) steeringInput = 1;

turnAuthority = clamp(abs(speed) / referenceSpeed, 0, 1);
yawRate = steeringInput * turnSpeed * sign(speed) * turnAuthority;
heading += yawRate * dt;

position.x += Math.sin(heading) * speed * dt;
position.z += -Math.cos(heading) * speed * dt;
```

Required behavior:

- Parked `A` or `D`: front tires/steering wheel may turn visually, but car heading and position do not change.
- `W`: car moves forward along current heading.
- `S`: car moves backward along current heading after braking/reverse transition.
- `A` while moving forward: heading rotates left over time.
- `D` while moving forward: heading rotates right over time.
- `W + A`: car curves forward-left.
- `W + D`: car curves forward-right.
- `S + A`: car reverses backward-left from the driver's perspective.
- `S + D`: car reverses backward-right from the driver's perspective.

## Explicit Anti-Bugs

These behaviors are incorrect and must be treated as regressions:

- `A` or `D` directly changes world `position.x` or `position.z`.
- Car slides sideways while the camera still faces forward.
- `W + D` moves diagonally in world space without rotating heading.
- `S + D` reverses backward-left from the driver's perspective.
- Car spins in place when parked and only `A` or `D` is pressed.
- Steering instantly snaps the heading without speed-scaled turn authority.
- Camera yaw changes independently from car heading during normal driving.

## Steering Feel

The steering should feel weighted:

- Low speed: smaller yaw movement, but enough turn authority once rolling.
- Higher speed: wider turn radius, not instant pivoting.
- Steering angle should ease in and out instead of snapping.
- Front wheels and cockpit steering wheel should visually follow `steeringAngle`.
- Camera lean/roll can respond subtly to steering, but must not imply strafing.

## Movement Rules

The car always moves from this formula:

```ts
position += forwardFromHeading * signedSpeed * dt;
```

There is no independent lateral input. If lateral displacement appears over time, it must be the result of changing heading while moving forward/backward, not direct sideways motion.

## Speed Rules

- `W` increases positive speed up to max forward speed.
- `S` reduces positive speed first, then creates negative speed.
- Natural damping/friction reduces speed when neither `W` nor `S` is pressed.
- Drag can increase with speed.
- Reverse speed should be lower than forward speed.
- Collision and off-track drag may reduce speed.

## Collision Rules

The car must not pass through gameplay obstacles:

- Track boundary logs block the car.
- Rocks block the car.
- Tree trunks block the car where collision proxies exist.
- Decorative grass, ferns, and small vegetation can be pass-through unless explicitly promoted to obstacles.

Collision response should:

- Push the car out of penetration.
- Reduce speed on direct impact.
- Allow glancing contact to slide along logs/edges without full stop.
- Never teleport the car across the track.

## Track And Lap Rules

Lap counting should be conservative:

- Race starts at lap `0/3`.
- Reversing across the finish line must not count as a lap.
- Crossing the finish line immediately at the start must not count as a lap.
- A lap only counts after passing checkpoints around the circuit.
- The finish crossing must happen while moving generally forward along track direction.

## Camera Rules

- Camera is inside the cockpit / first-person car rig.
- Camera follows car position and heading.
- Camera may add small roll/lean based on steering/yaw rate.
- Mouse input must not affect camera yaw or pitch during normal driving. Camera orientation is derived solely from car heading plus optional roll offset.
- Camera should not independently rotate left/right from `A/D`; steering rotates the car, and the camera follows the car.

## HUD Rules

Persistent HUD should stay compact:

- Speed in km/h.
- Lap count.
- Race time.
- Best lap or finish panel only when relevant.

The center of the screen must remain clear for driving.

## Browser Playtest Acceptance Checks

Use automated or manual browser tests after changing driving logic:

- Parked `A`: `speed == 0`, `position` unchanged, `heading` unchanged, steering angle negative.
- Parked `D`: `speed == 0`, `position` unchanged, `heading` unchanged, steering angle positive.
- `W + A`: positive forward movement, negative yaw delta, local-left displacement from curved path.
- `W + D`: positive forward movement, positive yaw delta, local-right displacement from curved path.
- `S + A`: negative forward movement, reverse-left displacement from driver's perspective.
- `S + D`: negative forward movement, reverse-right displacement from driver's perspective.
- No test should show direct lateral movement without heading change.
- Screenshots must show nonblank WebGL on desktop and mobile.

## Implementation Boundary

Keep these responsibilities separate:

- `InputController`: maps keyboard keys to drive actions only.
- `CarController`: owns speed, yaw, steering, lap state, and collision response.
- `carModel`: visual car rig only, including steering wheel and tire animation.
- `jungle`: track/environment meshes and collision map generation.
- `main`: runtime loop, camera, renderer, HUD update, and simulation/render sync.

## Master Implementation Prompt

When asking an AI agent to continue this game, use this prompt:

```md
You are working on Jungle Sprint Racer, a first-person Three.js jungle car racing game.

Follow the vehicle control contract exactly:
- W/S modify signed scalar speed.
- A/D only modify steering/heading. They must never directly modify position.x or position.z.
- Movement is always position += forwardFromHeading * signedSpeed * dt.
- dt comes from Math.min(clock.getDelta(), 0.05), not a fixed frame assumption.
- S brakes while speed > 0.1 and reverses only when speed <= 0.1.
- Parked steering may animate wheels but must not spin or move the car.
- W+D curves forward-right, W+A curves forward-left.
- S+D reverses backward-right from the driver's perspective, S+A reverses backward-left.
- Lap counting requires checkpoints and forward finish crossing.
- Obstacles use collision proxies and must block the car.
- Camera yaw/pitch must not use mouse look during normal driving.
- Main loop order is input, physics, model sync, camera, HUD, render.

Keep simulation state outside Three.js objects. Use Three.js as the visual adapter, DOM for HUD, and Rapier/collision proxies for world collision support.

Before finalizing any control change, run lint/build and browser playtests for parked A/D, W+A, W+D, S+A, S+D, plus desktop/mobile screenshot sanity.
```
