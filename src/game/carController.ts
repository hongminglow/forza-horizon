import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { DriveInput } from "./input";
import {
  findNearestTrackSample,
  TRACK_WIDTH,
  type TrackSample,
  yawQuaternion,
} from "./track";
import {
  closestPointOnSegment2D,
  type CircleCollider,
  type SegmentCollider,
  type WorldCollisionMap,
} from "./collisions";

const MAX_FORWARD_SPEED = 18;
const MAX_REVERSE_SPEED = -6;
const ACCELERATION = 12;
const BRAKING_FORCE = 18;
const REVERSE_ACCELERATION = 12;
const DAMPING_PER_60FPS_FRAME = 0.97;
const REVERSE_THRESHOLD = 0.1;
const MAX_STEER_ANGLE = 0.46;
const STEERING_EASE_SPEED = 5;
const STEERING_RETURN_SPEED = 7.5;
const TURN_SPEED = 1.8;
const REFERENCE_SPEED = 8;
const YAW_RATE_EASE_SPEED = 8;
const CAR_COLLISION_RADIUS = 0.9;
const TARGET_LAPS = 3;
const TRACK_LIMIT = TRACK_WIDTH * 0.5 - 0.72;
const CHECKPOINT_1 = 0.25;
const CHECKPOINT_2 = 0.5;
const CHECKPOINT_3 = 0.75;

export type CarHudState = {
  speedKph: number;
  lap: number;
  targetLaps: number;
  raceTime: number;
  lapTime: number;
  bestLapTime: number | null;
  finished: boolean;
  progress: number;
  offTrackAmount: number;
  collisionSerial: number;
  collisionImpact: number;
  collisionKind: string | null;
};

export type CarDebugState = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steeringAngle: number;
  yawRate: number;
  lap: number;
  progress: number;
  collisionCircles: number;
  collisionSegments: number;
  lastCollision: string | null;
  collisionSerial: number;
};

export class CarController {
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private yaw = 0;
  private speed = 0;
  private steeringAngle = 0;
  private yawRate = 0;
  private currentProgress = 0;
  private previousProgress = 0;
  private checkpointMask = 0;
  private completedLaps = 0;
  private raceStartTime = 0;
  private lapStartTime = 0;
  private pauseStartTime: number | null = null;
  private finishTime: number | null = null;
  private bestLapTime: number | null = null;
  private finished = false;
  private lastCollision: string | null = null;
  private collisionSerial = 0;
  private collisionImpact = 0;

  constructor(
    private readonly body: RAPIER.RigidBody,
    private readonly samples: TrackSample[],
    private readonly collisions: WorldCollisionMap,
    private readonly startYaw: number,
    startTime: number,
  ) {
    this.reset(startTime);
  }

  update(input: DriveInput, delta: number, now: number): CarHudState {
    if (input.resetPressed) {
      this.reset(now);
    }

    if (!this.finished) {
      this.applyDriving(input, delta);
      this.updateRaceProgress(now);
    } else {
      this.applyFinishCoast(delta);
    }

    this.syncPhysicsBody();
    return this.getHudState(now);
  }

  syncObject(object: THREE.Object3D): void {
    const translation = this.body.translation();
    object.position.set(translation.x, translation.y - 0.08, translation.z);
    object.quaternion.copy(yawQuaternion(this.yaw));
  }

  getYaw(): number {
    return this.yaw;
  }

  getSteeringLean(): number {
    return THREE.MathUtils.clamp(this.steeringAngle / MAX_STEER_ANGLE, -1, 1);
  }

  getSteeringAngle(): number {
    return this.steeringAngle;
  }

  getYawRate(): number {
    return this.yawRate;
  }

  getDebugState(): CarDebugState {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      speed: this.speed,
      steeringAngle: this.steeringAngle,
      yawRate: this.yawRate,
      lap: this.completedLaps,
      progress: this.currentProgress,
      collisionCircles: this.collisions.circles.length,
      collisionSegments: this.collisions.segments.length,
      lastCollision: this.lastCollision,
      collisionSerial: this.collisionSerial,
    };
  }

  getHudState(now: number): CarHudState {
    const nearest = findNearestTrackSample(this.samples, this.position);
    const stateTime = this.finishTime ?? this.pauseStartTime ?? now;

    return {
      speedKph: Math.abs(this.speed) * 3.6,
      lap: this.completedLaps,
      targetLaps: TARGET_LAPS,
      raceTime: Math.max(0, stateTime - this.raceStartTime),
      lapTime: Math.max(0, stateTime - this.lapStartTime),
      bestLapTime: this.bestLapTime,
      finished: this.finished,
      progress: this.currentProgress,
      offTrackAmount: Math.max(0, nearest.distance - TRACK_LIMIT),
      collisionSerial: this.collisionSerial,
      collisionImpact: this.collisionImpact,
      collisionKind: this.lastCollision,
    };
  }

  restart(now: number): void {
    this.reset(now);
  }

  setPaused(paused: boolean, now: number): void {
    if (this.finished) {
      return;
    }

    if (paused) {
      this.pauseStartTime = this.pauseStartTime ?? now;
      return;
    }

    if (this.pauseStartTime === null) {
      return;
    }

    const pausedDuration = Math.max(0, now - this.pauseStartTime);
    this.raceStartTime += pausedDuration;
    this.lapStartTime += pausedDuration;
    this.pauseStartTime = null;
  }

  private reset(now: number): void {
    const start = this.samples[2];
    const startPosition = start.center.clone().addScaledVector(start.tangent, -5.5);

    this.position.set(startPosition.x, 0.62, startPosition.z);
    this.velocity.set(0, 0, 0);
    this.yaw = this.startYaw;
    this.speed = 0;
    this.steeringAngle = 0;
    this.yawRate = 0;
    this.collisionImpact = 0;
    this.currentProgress = start.progress;
    this.previousProgress = start.progress;
    this.checkpointMask = 0;
    this.completedLaps = 0;
    this.finished = false;
    this.pauseStartTime = null;
    this.finishTime = null;
    this.raceStartTime = now;
    this.lapStartTime = now;
    this.bestLapTime = null;

    this.body.setTranslation(
      { x: this.position.x, y: this.position.y, z: this.position.z },
      true,
    );
    this.body.setRotation(yawQuaternion(this.yaw), true);
    this.body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    });
    this.body.setNextKinematicRotation(yawQuaternion(this.yaw));
  }

  private applyDriving(input: DriveInput, delta: number): void {
    this.lastCollision = null;
    const nearest = findNearestTrackSample(this.samples, this.position);
    const lateralOffset = this.position
      .clone()
      .sub(nearest.sample.center)
      .dot(nearest.sample.normal);
    const edgePressure = THREE.MathUtils.clamp(
      (Math.abs(lateralOffset) - TRACK_LIMIT * 0.8) / (TRACK_LIMIT * 0.2),
      0,
      1,
    );
    const surfaceGrip = THREE.MathUtils.clamp(1 - edgePressure * 0.34, 0.66, 1);
    let nextSpeed = this.speed;

    if (input.throttle > 0) {
      nextSpeed += ACCELERATION * surfaceGrip * delta;
    }

    if (input.brake > 0) {
      if (this.speed > REVERSE_THRESHOLD) {
        nextSpeed = Math.max(0, nextSpeed - BRAKING_FORCE * delta);
      } else {
        nextSpeed -= REVERSE_ACCELERATION * delta;
      }
    }

    if (input.throttle === 0 && input.brake === 0) {
      nextSpeed *= Math.pow(DAMPING_PER_60FPS_FRAME, delta * 60);

      if (Math.abs(nextSpeed) < 0.025) {
        nextSpeed = 0;
      }
    }

    this.speed = THREE.MathUtils.clamp(
      nextSpeed,
      MAX_REVERSE_SPEED,
      MAX_FORWARD_SPEED,
    );

    const targetSteering = input.steer * MAX_STEER_ANGLE;
    const steerResponse =
      input.steer === 0 ? STEERING_RETURN_SPEED : STEERING_EASE_SPEED;
    this.steeringAngle = damp(
      this.steeringAngle,
      targetSteering,
      steerResponse * surfaceGrip,
      delta,
    );

    const speedSign =
      Math.abs(this.speed) > REVERSE_THRESHOLD ? Math.sign(this.speed) : 0;
    const turnAuthority = THREE.MathUtils.clamp(
      Math.abs(this.speed) / REFERENCE_SPEED,
      0,
      1,
    );
    const steeringRatio = THREE.MathUtils.clamp(
      this.steeringAngle / MAX_STEER_ANGLE,
      -1,
      1,
    );
    const targetYawRate =
      steeringRatio *
      TURN_SPEED *
      speedSign *
      turnAuthority *
      surfaceGrip;
    this.yawRate = damp(this.yawRate, targetYawRate, YAW_RATE_EASE_SPEED, delta);
    this.yaw = normalizeAngle(this.yaw + this.yawRate * delta);

    const nextForward = this.getForward();
    this.velocity.copy(nextForward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, delta);
    this.position.y = 0.62;

    this.keepInsideTrack(delta);
    this.resolveWorldCollisions();
    this.keepInsideTrack(delta);
  }

  private keepInsideTrack(fixedDelta: number): void {
    const nearest = findNearestTrackSample(this.samples, this.position);
    const offset = this.position.clone().sub(nearest.sample.center);
    const lateral = offset.dot(nearest.sample.normal);

    if (Math.abs(lateral) <= TRACK_LIMIT) {
      return;
    }

    const edgeNormal = nearest.sample.normal.clone().multiplyScalar(Math.sign(lateral));
    const penetration = Math.abs(lateral) - TRACK_LIMIT;
    this.position.addScaledVector(edgeNormal, -penetration - 0.002);
    this.position.y = 0.62;

    const travelDirection = this.getTravelDirection();
    const outward = Math.max(0, travelDirection.dot(edgeNormal));

    if (outward > 0.02) {
      const drag = Math.exp(-THREE.MathUtils.lerp(0.8, 3.1, outward) * fixedDelta);
      this.speed *= drag;
      this.velocity.copy(this.getForward()).multiplyScalar(this.speed);
      this.yawRate *= THREE.MathUtils.lerp(0.82, 0.42, outward);
    }
  }

  private resolveWorldCollisions(): void {
    for (const collider of this.collisions.circles) {
      this.resolveCircleCollision(collider);
    }

    for (const collider of this.collisions.segments) {
      this.resolveSegmentCollision(collider);
    }
  }

  private resolveCircleCollision(collider: CircleCollider): void {
    const combinedRadius = collider.radius + CAR_COLLISION_RADIUS;
    const dx = this.position.x - collider.center.x;
    const dz = this.position.z - collider.center.z;

    if (Math.abs(dx) > combinedRadius || Math.abs(dz) > combinedRadius) {
      return;
    }

    const distanceSq = dx * dx + dz * dz;

    if (distanceSq >= combinedRadius * combinedRadius) {
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const normal = this.getCollisionNormal(dx, dz, distance);
    const penetration = combinedRadius - distance;
    this.position.addScaledVector(normal, penetration + 0.006);
    this.lastCollision = collider.kind;
    this.applyCollisionImpulse(normal, false);
  }

  private resolveSegmentCollision(collider: SegmentCollider): void {
    const closest = closestPointOnSegment2D(this.position, collider.start, collider.end);
    const combinedRadius = collider.radius + CAR_COLLISION_RADIUS;
    const dx = this.position.x - closest.x;
    const dz = this.position.z - closest.z;

    if (Math.abs(dx) > combinedRadius || Math.abs(dz) > combinedRadius) {
      return;
    }

    const distanceSq = dx * dx + dz * dz;

    if (distanceSq >= combinedRadius * combinedRadius) {
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const normal = this.getCollisionNormal(dx, dz, distance);
    const penetration = combinedRadius - distance;
    this.position.addScaledVector(normal, penetration + 0.006);
    this.lastCollision = collider.kind;
    this.applyCollisionImpulse(normal, true);
  }

  private applyCollisionImpulse(normal: THREE.Vector3, slideFriendly: boolean): void {
    const absSpeed = Math.abs(this.speed);

    if (absSpeed <= 0.02) {
      return;
    }

    const travelDirection = this.getTravelDirection();
    const closing = Math.max(0, -travelDirection.dot(normal));

    if (closing <= 0.01) {
      this.speed *= 0.985;
      this.velocity.copy(this.getForward()).multiplyScalar(this.speed);
      return;
    }

    const impact = absSpeed * closing;

    if (impact > 1.15) {
      this.collisionSerial += 1;
      this.collisionImpact = THREE.MathUtils.clamp(impact / 12, 0.2, 1);
    }

    const directHitLoss = slideFriendly ? 0.38 : 0.18;
    const retainedSpeed = THREE.MathUtils.lerp(
      0.96,
      directHitLoss,
      Math.pow(closing, 1.18),
    );
    this.speed *= retainedSpeed;
    this.velocity.copy(this.getForward()).multiplyScalar(this.speed);
    this.yawRate *= THREE.MathUtils.lerp(0.82, 0.34, closing);
  }

  private getForward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private getCollisionNormal(dx: number, dz: number, distance: number): THREE.Vector3 {
    if (distance <= 0.0001) {
      return this.getTravelDirection().multiplyScalar(-1);
    }

    return new THREE.Vector3(dx / distance, 0, dz / distance);
  }

  private getTravelDirection(): THREE.Vector3 {
    return this.getForward().multiplyScalar(this.speed < 0 ? -1 : 1);
  }

  private updateRaceProgress(now: number): void {
    const nearest = findNearestTrackSample(this.samples, this.position);
    const progress = nearest.progress;
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const forwardAlongTrack = forward.dot(nearest.sample.tangent);

    if (progress > CHECKPOINT_1) {
      this.checkpointMask |= 1;
    }

    if (progress > CHECKPOINT_2) {
      this.checkpointMask |= 2;
    }

    if (progress > CHECKPOINT_3) {
      this.checkpointMask |= 4;
    }

    const crossedFinishForward =
      this.previousProgress > 0.92 &&
      progress < 0.08 &&
      this.checkpointMask === 7 &&
      this.speed > 2 &&
      forwardAlongTrack > 0.2;

    if (crossedFinishForward) {
      const lapTime = now - this.lapStartTime;
      this.bestLapTime =
        this.bestLapTime === null ? lapTime : Math.min(this.bestLapTime, lapTime);
      this.lapStartTime = now;
      this.checkpointMask = 0;
      this.completedLaps += 1;

      if (this.completedLaps >= TARGET_LAPS) {
        this.finished = true;
        this.finishTime = now;
      }
    }

    if (progress > 0.92 && this.previousProgress < 0.08 && this.speed < -1) {
      this.checkpointMask = 0;
    }

    this.previousProgress = progress;
    this.currentProgress = progress;
  }

  private applyFinishCoast(fixedDelta: number): void {
    this.speed = approach(this.speed, 0, 10 * fixedDelta);
    this.velocity.copy(this.getForward()).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, fixedDelta);
    this.keepInsideTrack(fixedDelta);
    this.resolveWorldCollisions();
  }

  private syncPhysicsBody(): void {
    this.body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    });
    this.body.setNextKinematicRotation(yawQuaternion(this.yaw));
  }
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) {
    return Math.min(current + amount, target);
  }

  return Math.max(current - amount, target);
}

function damp(current: number, target: number, response: number, delta: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-response * delta));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
