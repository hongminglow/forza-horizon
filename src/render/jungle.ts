import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  createBoundarySegments,
  createTrackGeometry,
  findNearestTrackSample,
  TRACK_WIDTH,
  type BoundarySegment,
  type TrackSample,
} from "../game/track";
import {
  createCollisionMap,
  type WorldCollisionMap,
} from "../game/collisions";
import { createJungleMaterials, type JungleMaterials } from "./materials";

export function buildJungleTrack(
  scene: THREE.Scene,
  world: RAPIER.World,
  Rapier: typeof RAPIER,
  samples: TrackSample[],
): WorldCollisionMap {
  const materials = createJungleMaterials();
  const collisions = createCollisionMap();

  createTerrain(scene, materials);
  createRoad(scene, samples, materials);
  createFinishLine(scene, samples, materials);

  const leftSegments = createBoundarySegments(samples, "left", 5);
  const rightSegments = createBoundarySegments(samples, "right", 5);
  createBoundaryLogs(scene, leftSegments, samples, materials, collisions);
  createBoundaryLogs(scene, rightSegments, samples, materials, collisions);
  createBarrierColliders(world, Rapier, leftSegments);
  createBarrierColliders(world, Rapier, rightSegments);

  createJungleCanopy(scene, samples, materials, collisions);
  createUndergrowth(scene, samples, materials);
  createRocks(scene, samples, materials, collisions);

  return collisions;
}

function createTerrain(scene: THREE.Scene, materials: JungleMaterials): void {
  const geometry = new THREE.PlaneGeometry(420, 420, 82, 82);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const height =
      Math.sin(x * 0.035) * 0.38 +
      Math.cos(y * 0.028) * 0.34 +
      Math.sin((x + y) * 0.012) * 0.46;
    positions.setZ(index, height);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, materials.terrain);
  ground.rotation.x = -Math.PI * 0.5;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  const water = new THREE.Mesh(new THREE.CircleGeometry(34, 72), materials.water);
  water.rotation.x = -Math.PI * 0.5;
  water.position.set(-102, 0.015, -74);
  water.scale.set(1.35, 0.72, 1);
  scene.add(water);
}

function createRoad(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
): void {
  const road = new THREE.Mesh(createTrackGeometry(samples), materials.road);
  road.receiveShadow = true;
  scene.add(road);

  createTireRuts(scene, samples, materials);
  createMudPuddles(scene, samples, materials);
}

function createTireRuts(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
): void {
  const stride = 3;
  const rutGeometry = new THREE.BoxGeometry(0.78, 0.035, 3.5);
  const rutCount = Math.floor((samples.length - 2) / stride) * 2;
  const ruts = new THREE.InstancedMesh(rutGeometry, materials.rut, rutCount);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let instance = 0;

  for (let index = 0; index < samples.length - 2; index += stride) {
    const sample = samples[index];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));

    for (const offset of [-2.85, 2.85]) {
      const position = sample.center
        .clone()
        .addScaledVector(sample.normal, offset);
      position.y = 0.092;
      scale.set(0.8 + Math.sin(index * 0.11) * 0.08, 1, 0.86 + Math.cos(index * 0.05) * 0.12);
      matrix.compose(position, quaternion, scale);
      ruts.setMatrixAt(instance, matrix);
      instance += 1;
    }
  }

  ruts.receiveShadow = true;
  scene.add(ruts);
}

function createMudPuddles(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
): void {
  const rng = createRandom(314);
  const geometry = new THREE.CircleGeometry(1, 28);

  for (let index = 0; index < 34; index += 1) {
    const sample = samples[Math.floor(rng() * (samples.length - 1))];
    const puddle = new THREE.Mesh(geometry, materials.wetMud);
    puddle.position.copy(sample.center);
    puddle.position.addScaledVector(sample.normal, (rng() - 0.5) * 6.4);
    puddle.position.addScaledVector(sample.tangent, (rng() - 0.5) * 3.2);
    puddle.position.y = 0.104;
    puddle.rotation.x = -Math.PI * 0.5;
    puddle.rotation.z = rng() * Math.PI;
    puddle.scale.set(0.75 + rng() * 2.4, 0.28 + rng() * 0.75, 1);
    puddle.receiveShadow = true;
    scene.add(puddle);
  }
}

function createFinishLine(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
): void {
  const start = samples[0];
  const tangentYaw = Math.atan2(start.tangent.x, start.tangent.z);
  const stripeGeometry = new THREE.BoxGeometry(TRACK_WIDTH, 0.05, 1.2);

  for (let index = 0; index < 8; index += 1) {
    const stripe = new THREE.Mesh(
      stripeGeometry,
      index % 2 === 0 ? materials.finishLight : materials.finishDark,
    );
    stripe.position.copy(start.center);
    stripe.position.y = 0.12 + index * 0.002;
    stripe.position.addScaledVector(start.tangent, (index - 3.5) * 0.32);
    stripe.rotation.y = tangentYaw;
    stripe.scale.x = 0.125;
    stripe.receiveShadow = true;
    scene.add(stripe);
  }

  const postGeometry = new THREE.CylinderGeometry(0.22, 0.3, 4.1, 12);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, materials.post);
    post.position
      .copy(start.center)
      .addScaledVector(start.normal, side * (TRACK_WIDTH * 0.5 + 1.2));
    post.position.y = 2.05;
    post.castShadow = true;
    scene.add(post);
  }
}

function createBoundaryLogs(
  scene: THREE.Scene,
  segments: BoundarySegment[],
  samples: TrackSample[],
  materials: JungleMaterials,
  collisions: WorldCollisionMap,
): void {
  const geometry = new THREE.CylinderGeometry(0.34, 0.42, 1, 12);
  const up = new THREE.Vector3(0, 1, 0);

  for (const segment of segments) {
    if (!hasTrackClearance(samples, segment.center, TRACK_WIDTH * 0.47)) {
      continue;
    }

    const log = new THREE.Mesh(geometry, materials.log);
    log.position.set(segment.center.x, 0.56, segment.center.z);
    log.scale.y = segment.length;
    log.quaternion.setFromUnitVectors(up, segment.direction);
    log.castShadow = true;
    log.receiveShadow = true;
    scene.add(log);
    collisions.segments.push({
      start: segment.center.clone().addScaledVector(segment.direction, -segment.length * 0.5),
      end: segment.center.clone().addScaledVector(segment.direction, segment.length * 0.5),
      radius: 0.32,
      kind: "log",
    });
  }
}

function createBarrierColliders(
  world: RAPIER.World,
  Rapier: typeof RAPIER,
  segments: BoundarySegment[],
): void {
  for (const segment of segments) {
    const yaw = Math.atan2(segment.direction.x, segment.direction.z);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const desc = Rapier.ColliderDesc.cuboid(0.48, 0.95, segment.length * 0.5)
      .setTranslation(segment.center.x, 0.78, segment.center.z)
      .setRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      })
      .setFriction(1.2)
      .setRestitution(0.08);

    world.createCollider(desc);
  }
}

function createJungleCanopy(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
  collisions: WorldCollisionMap,
): void {
  const rng = createRandom(42);
  const treeCount = 260;
  const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.5, 1, 12);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 2);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.bark, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.canopy, treeCount * 3);
  const darkCrowns = new THREE.InstancedMesh(
    crownGeometry,
    materials.canopyDark,
    treeCount,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let crownInstance = 0;

  let placedTrees = 0;
  let attempts = 0;

  while (placedTrees < treeCount && attempts < treeCount * 26) {
    attempts += 1;
    const sample = samples[Math.floor(rng() * (samples.length - 1))];
    const side = rng() > 0.5 ? 1 : -1;
    const distance = TRACK_WIDTH * 0.5 + 35 + rng() * 58;
    const lean = (rng() - 0.5) * 0.16;
    const trunkHeight = 6.2 + rng() * 9.2;
    const trunkRadius = 0.42 + rng() * 0.34;
    const nearTrackScale = THREE.MathUtils.clamp((distance - TRACK_WIDTH * 0.5) / 24, 0.62, 1);
    const crownRadius = (1.35 + rng() * 2.2) * nearTrackScale;
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, side * distance)
      .addScaledVector(sample.tangent, (rng() - 0.5) * 17);

    if (!hasTrackClearance(samples, position, TRACK_WIDTH * 0.5 + 12)) {
      continue;
    }

    collisions.circles.push({
      center: new THREE.Vector3(position.x, 0, position.z),
      radius: trunkRadius + 0.72,
      kind: "tree",
    });

    quaternion.setFromEuler(new THREE.Euler(lean, rng() * Math.PI * 2, -lean));
    scale.set(trunkRadius, trunkHeight, trunkRadius);
    matrix.compose(
      new THREE.Vector3(position.x, trunkHeight * 0.5 - 0.1, position.z),
      quaternion,
      scale,
    );
    trunks.setMatrixAt(placedTrees, matrix);

    for (let cluster = 0; cluster < 3; cluster += 1) {
      const clusterAngle = rng() * Math.PI * 2;
      const clusterOffset = 0.45 + rng() * 1.6;
      const clusterPosition = new THREE.Vector3(
        position.x + Math.cos(clusterAngle) * clusterOffset,
        trunkHeight + 1.8 + rng() * 3.4,
        position.z + Math.sin(clusterAngle) * clusterOffset,
      );
      scale.set(
        crownRadius * (0.7 + rng() * 0.45),
        crownRadius * (0.55 + rng() * 0.52),
        crownRadius * (0.7 + rng() * 0.45),
      );
      quaternion.setFromEuler(
        new THREE.Euler(rng() * 0.18, rng() * Math.PI * 2, rng() * 0.18),
      );
      matrix.compose(clusterPosition, quaternion, scale);
      crowns.setMatrixAt(crownInstance, matrix);
      crownInstance += 1;
    }

    scale.set(crownRadius * 1.08, crownRadius * 0.58, crownRadius * 1.08);
    quaternion.setFromEuler(new THREE.Euler(0.08, rng() * Math.PI * 2, -0.08));
    matrix.compose(
      new THREE.Vector3(position.x, trunkHeight + 0.75, position.z),
      quaternion,
      scale,
    );
    darkCrowns.setMatrixAt(placedTrees, matrix);
    placedTrees += 1;
  }

  trunks.count = placedTrees;
  crowns.count = crownInstance;
  darkCrowns.count = placedTrees;
  trunks.castShadow = true;
  crowns.castShadow = false;
  darkCrowns.castShadow = false;
  trunks.receiveShadow = true;
  crowns.receiveShadow = true;
  darkCrowns.receiveShadow = true;
  scene.add(trunks, crowns, darkCrowns);
}

function createUndergrowth(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
): void {
  const rng = createRandom(128);
  const bushGeometry = new THREE.IcosahedronGeometry(1, 1);
  const fernGeometry = new THREE.PlaneGeometry(1.25, 2.2);
  const grassGeometry = new THREE.ConeGeometry(0.1, 1, 5);
  const bushCount = 260;
  const fernCount = 720;
  const grassCount = 1100;
  const bushes = new THREE.InstancedMesh(
    bushGeometry,
    materials.undergrowth,
    bushCount,
  );
  const ferns = new THREE.InstancedMesh(
    fernGeometry,
    materials.fernBillboard,
    fernCount,
  );
  const grasses = new THREE.InstancedMesh(
    grassGeometry,
    materials.grassBlade,
    grassCount,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let index = 0; index < bushCount; index += 1) {
    const sample = samples[Math.floor(rng() * (samples.length - 1))];
    const side = rng() > 0.5 ? 1 : -1;
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, side * (TRACK_WIDTH * 0.5 + 3 + rng() * 17))
      .addScaledVector(sample.tangent, (rng() - 0.5) * 9);
    const size = 0.8 + rng() * 2.2;
    quaternion.setFromEuler(new THREE.Euler(rng() * 0.14, rng() * Math.PI * 2, 0));
    scale.set(size * (1 + rng() * 0.6), size * (0.42 + rng() * 0.42), size);
    matrix.compose(new THREE.Vector3(position.x, scale.y * 0.85, position.z), quaternion, scale);
    bushes.setMatrixAt(index, matrix);
  }

  for (let index = 0; index < fernCount; index += 1) {
    const sample = samples[Math.floor(rng() * (samples.length - 1))];
    const side = rng() > 0.5 ? 1 : -1;
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, side * (TRACK_WIDTH * 0.5 + 1.8 + rng() * 13))
      .addScaledVector(sample.tangent, (rng() - 0.5) * 8);
    const size = 0.65 + rng() * 1.25;
    quaternion.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    scale.set(size, size, size);
    matrix.compose(new THREE.Vector3(position.x, size * 1.02, position.z), quaternion, scale);
    ferns.setMatrixAt(index, matrix);
  }

  for (let index = 0; index < grassCount; index += 1) {
    const sample = samples[Math.floor(rng() * (samples.length - 1))];
    const side = rng() > 0.5 ? 1 : -1;
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, side * (TRACK_WIDTH * 0.5 + 0.7 + rng() * 8))
      .addScaledVector(sample.tangent, (rng() - 0.5) * 7);
    const height = 0.35 + rng() * 1.3;
    quaternion.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.24, rng() * Math.PI * 2, 0));
    scale.set(1, height, 1);
    matrix.compose(new THREE.Vector3(position.x, height * 0.5, position.z), quaternion, scale);
    grasses.setMatrixAt(index, matrix);
  }

  bushes.castShadow = true;
  ferns.castShadow = true;
  grasses.castShadow = true;
  bushes.receiveShadow = true;
  grasses.receiveShadow = true;
  scene.add(bushes, ferns, grasses);
}

function createRocks(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
  collisions: WorldCollisionMap,
): void {
  const rng = createRandom(96);
  const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const rockTargetCount = 120;
  const rocks = new THREE.InstancedMesh(rockGeometry, materials.rock, rockTargetCount);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();

  let placedRocks = 0;
  let attempts = 0;

  while (placedRocks < rockTargetCount && attempts < rockTargetCount * 24) {
    attempts += 1;
    const sample = samples[Math.floor(rng() * (samples.length - 1))];
    const side = rng() > 0.5 ? 1 : -1;
    const distance = TRACK_WIDTH * 0.5 + 4 + rng() * 27;
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, side * distance)
      .addScaledVector(sample.tangent, (rng() - 0.5) * 10);
    const scale = 0.45 + rng() * 1.5;

    if (!hasTrackClearance(samples, position, TRACK_WIDTH * 0.5 + scale * 1.55)) {
      continue;
    }

    quaternion.setFromEuler(
      new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI),
    );
    matrix.compose(
      new THREE.Vector3(position.x, scale * 0.52, position.z),
      quaternion,
      new THREE.Vector3(scale * 1.2, scale * 0.72, scale),
    );
    rocks.setMatrixAt(placedRocks, matrix);
    collisions.circles.push({
      center: new THREE.Vector3(position.x, 0, position.z),
      radius: scale * 0.98,
      kind: "rock",
    });
    placedRocks += 1;
  }

  rocks.count = placedRocks;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
}

function hasTrackClearance(
  samples: TrackSample[],
  position: THREE.Vector3,
  minimumDistance: number,
): boolean {
  return findNearestTrackSample(samples, position).distance >= minimumDistance;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
