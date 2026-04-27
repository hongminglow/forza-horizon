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

const MAX_FORWARD_SPEED = 42;
const MAX_REVERSE_SPEED = -10;
const ENGINE_ACCELERATION = 27;
const BRAKING = 34;
const REVERSE_ACCELERATION = 13;
const ROLLING_RESISTANCE = 2.7;
const AERO_DRAG = 0.014;
const MAX_STEER_ANGLE = 0.44;
const STEER_RESPONSE = 5.6;
const STEER_RETURN_RESPONSE = 8.8;
const MAX_TURN_RATE = 2.35;
const YAW_RESPONSE = 8.4;
const YAW_DAMPING = 2.4;
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
  private bestLapTime: number | null = null;
  private finished = false;
  private lastCollision: string | null = null;

  constructor(
    private readonly body: RAPIER.RigidBody,
    private readonly samples: TrackSample[],
    private readonly collisions: WorldCollisionMap,
    private readonly startYaw: number,
    startTime: number,
  ) {
    this.reset(startTime);
  }

  update(input: DriveInput, fixedDelta: number, now: number): CarHudState {
    if (input.resetPressed) {
      this.reset(now);
    }

    if (!this.finished) {
      this.applyDriving(input, fixedDelta);
      this.updateRaceProgress(now);
    } else {
      this.applyFinishCoast(fixedDelta);
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
    };
  }

  getHudState(now: number): CarHudState {
    const nearest = findNearestTrackSample(this.samples, this.position);

    return {
      speedKph: Math.abs(this.speed) * 3.6,
      lap: this.completedLaps,
      targetLaps: TARGET_LAPS,
      raceTime: Math.max(0, now - this.raceStartTime),
      lapTime: Math.max(0, now - this.lapStartTime),
      bestLapTime: this.bestLapTime,
      finished: this.finished,
      progress: this.currentProgress,
      offTrackAmount: Math.max(0, nearest.distance - TRACK_LIMIT),
    };
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
    this.currentProgress = start.progress;
    this.previousProgress = start.progress;
    this.checkpointMask = 0;
    this.completedLaps = 0;
    this.finished = false;
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

  private applyDriving(input: DriveInput, fixedDelta: number): void {
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
    const absSpeed = Math.abs(this.speed);

    let acceleration = 0;

    if (input.throttle > 0) {
      const speedFalloff = THREE.MathUtils.clamp(
        1 - absSpeed / MAX_FORWARD_SPEED,
        0.26,
        1,
      );
      acceleration += ENGINE_ACCELERATION * speedFalloff * surfaceGrip;
    }

    if (input.brake > 0) {
      if (this.speed > 1.4) {
        acceleration -= BRAKING;
      } else {
        acceleration -= REVERSE_ACCELERATION;
      }
    }

    if (input.throttle === 0 && input.brake === 0) {
      acceleration -=
        Math.sign(this.speed) *
        Math.min(absSpeed / fixedDelta, ROLLING_RESISTANCE);
    }

    acceleration -= this.speed * absSpeed * AERO_DRAG;
    this.speed = THREE.MathUtils.clamp(
      this.speed + acceleration * fixedDelta,
      MAX_REVERSE_SPEED,
      MAX_FORWARD_SPEED,
    );

    const highSpeedSteerScale = THREE.MathUtils.lerp(
      1,
      0.58,
      THREE.MathUtils.clamp(absSpeed / MAX_FORWARD_SPEED, 0, 1),
    );
    const targetSteering = input.steer * MAX_STEER_ANGLE * highSpeedSteerScale;
    const steerResponse = input.steer === 0 ? STEER_RETURN_RESPONSE : STEER_RESPONSE;
    this.steeringAngle = damp(
      this.steeringAngle,
      targetSteering,
      steerResponse * surfaceGrip,
      fixedDelta,
    );

    const signedSpeedRatio = THREE.MathUtils.clamp(
      this.speed / MAX_FORWARD_SPEED,
      -1,
      1,
    );
    const targetYawRate =
      input.steer *
      MAX_TURN_RATE *
      signedSpeedRatio *
      highSpeedSteerScale *
      surfaceGrip;
    this.yawRate = damp(
      this.yawRate,
      targetYawRate,
      input.steer === 0 ? YAW_RESPONSE * 1.4 : YAW_RESPONSE,
      fixedDelta,
    );
    this.yawRate *= Math.exp(-YAW_DAMPING * fixedDelta * (input.steer === 0 ? 1 : 0.35));
    this.yaw = normalizeAngle(this.yaw + this.yawRate * fixedDelta);

    const nextForward = this.getForward();
    this.velocity.copy(nextForward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, fixedDelta);
    this.position.y = 0.62;

    this.keepInsideTrack(fixedDelta);
    this.resolveWorldCollisions(fixedDelta);
    this.keepInsideTrack(fixedDelta);
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

      const tangentSign = nearest.sample.tangent.dot(travelDirection) >= 0 ? 1 : -1;
      const tangent = nearest.sample.tangent.clone().multiplyScalar(tangentSign);
      this.rotateTowardTravelDirection(tangent, fixedDelta, 1.35 * outward);
    }
  }

  private resolveWorldCollisions(fixedDelta: number): void {
    for (const collider of this.collisions.circles) {
      this.resolveCircleCollision(collider, fixedDelta);
    }

    for (const collider of this.collisions.segments) {
      this.resolveSegmentCollision(collider, fixedDelta);
    }
  }

  private resolveCircleCollision(
    collider: CircleCollider,
    fixedDelta: number,
  ): void {
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
    this.applyCollisionImpulse(normal, false, fixedDelta);
  }

  private resolveSegmentCollision(
    collider: SegmentCollider,
    fixedDelta: number,
  ): void {
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
    this.applyCollisionImpulse(normal, true, fixedDelta);
  }

  private applyCollisionImpulse(
    normal: THREE.Vector3,
    slideFriendly: boolean,
    fixedDelta: number,
  ): void {
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

    const directHitLoss = slideFriendly ? 0.38 : 0.18;
    const retainedSpeed = THREE.MathUtils.lerp(
      0.96,
      directHitLoss,
      Math.pow(closing, 1.18),
    );
    this.speed *= retainedSpeed;
    this.velocity.copy(this.getForward()).multiplyScalar(this.speed);
    this.yawRate *= THREE.MathUtils.lerp(0.82, 0.34, closing);

    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
    const tangentDot = tangent.dot(travelDirection);

    if (Math.abs(tangentDot) > 0.06) {
      const slideDirection = tangent.multiplyScalar(tangentDot >= 0 ? 1 : -1);
      const authority = (slideFriendly ? 1.65 : 0.92) * closing;
      this.rotateTowardTravelDirection(slideDirection, fixedDelta, authority);
    }
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

  private rotateTowardTravelDirection(
    travelDirection: THREE.Vector3,
    fixedDelta: number,
    authority: number,
  ): void {
    const desiredForward = travelDirection
      .clone()
      .multiplyScalar(this.speed < 0 ? -1 : 1)
      .normalize();

    if (desiredForward.lengthSq() <= 0.0001) {
      return;
    }

    const targetYaw = yawFromDirection(desiredForward);
    this.yaw = rotateAngleToward(this.yaw, targetYaw, fixedDelta * authority);
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
    this.resolveWorldCollisions(fixedDelta);
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

function yawFromDirection(direction: THREE.Vector3): number {
  return Math.atan2(direction.x, -direction.z);
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function rotateAngleToward(current: number, target: number, maxDelta: number): number {
  const delta = normalizeAngle(target - current);

  if (Math.abs(delta) <= maxDelta) {
    return normalizeAngle(target);
  }

  return normalizeAngle(current + Math.sign(delta) * maxDelta);
}
