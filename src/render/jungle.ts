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

  const leftSegments = createBoundarySegments(samples, "left", 2);
  const rightSegments = createBoundarySegments(samples, "right", 2);
  createBoundaryLogs(scene, leftSegments, samples, materials, collisions);
  createBoundaryLogs(scene, rightSegments, samples, materials, collisions);
  createProtectedEdgePosts(scene, samples, materials, collisions);
  createFinishApproachChevrons(scene, samples);
  createBarrierColliders(world, Rapier, leftSegments);
  createBarrierColliders(world, Rapier, rightSegments);

  createTrackObstacles(scene, samples, materials, collisions);
  createJungleCanopy(scene, samples, materials, collisions);
  createUndergrowth(scene, samples, materials, collisions);
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
      position.y = 0.155;
      scale.set(0.8 + Math.sin(index * 0.11) * 0.08, 1, 0.86 + Math.cos(index * 0.05) * 0.12);
      matrix.compose(position, quaternion, scale);
      ruts.setMatrixAt(instance, matrix);
      instance += 1;
    }
  }

  ruts.receiveShadow = true;
  ruts.renderOrder = 3;
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
    puddle.position.y = 0.162;
    puddle.rotation.x = -Math.PI * 0.5;
    puddle.rotation.z = rng() * Math.PI;
    puddle.scale.set(0.75 + rng() * 2.4, 0.28 + rng() * 0.75, 1);
    puddle.receiveShadow = true;
    puddle.renderOrder = 2;
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
  const finishLine = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.055, 2.8),
    createFinishLineMaterial(materials),
  );
  finishLine.position.copy(start.center);
  finishLine.position.y = 0.19;
  finishLine.rotation.y = tangentYaw;
  finishLine.receiveShadow = true;
  finishLine.renderOrder = 4;
  scene.add(finishLine);

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

function createTrackObstacles(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
  collisions: WorldCollisionMap,
): void {
  const obstacleLayout = [
    [0.085, -2.8, 1.08],
    [0.14, 2.6, 0.92],
    [0.19, 0.4, 1.2],
    [0.255, -3.15, 1.02],
    [0.315, 2.25, 1.18],
    [0.39, -1.4, 0.96],
    [0.465, 3.1, 1.1],
    [0.535, -2.45, 1.26],
    [0.61, 1.1, 0.98],
    [0.68, -3, 1.16],
    [0.745, 2.8, 1.04],
    [0.81, -0.8, 1.2],
    [0.885, 2.35, 1],
  ] as const;
  const geometry = new THREE.DodecahedronGeometry(1, 1);
  const rocks = new THREE.InstancedMesh(geometry, materials.rock, obstacleLayout.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();

  obstacleLayout.forEach(([progress, offset, scale], index) => {
    const sample = samples[Math.floor(progress * (samples.length - 1))];
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, offset)
      .addScaledVector(sample.tangent, index % 2 === 0 ? 0.85 : -0.65);
    const visualScale = new THREE.Vector3(scale * 1.35, scale * 0.72, scale * 1.05);
    quaternion.setFromEuler(
      new THREE.Euler(index * 0.73, index * 1.11, index * 0.39),
    );
    matrix.compose(
      new THREE.Vector3(position.x, scale * 0.52, position.z),
      quaternion,
      visualScale,
    );
    rocks.setMatrixAt(index, matrix);
    collisions.circles.push({
      center: new THREE.Vector3(position.x, 0, position.z),
      radius: scale * 1.34,
      kind: "rock",
    });
  });

  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
}

function createBoundaryLogs(
  scene: THREE.Scene,
  segments: BoundarySegment[],
  samples: TrackSample[],
  materials: JungleMaterials,
  collisions: WorldCollisionMap,
): void {
  const geometry = new THREE.CylinderGeometry(0.42, 0.5, 1, 12);
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
      radius: 0.72,
      kind: "log",
    });
  }
}

function createProtectedEdgePosts(
  scene: THREE.Scene,
  samples: TrackSample[],
  materials: JungleMaterials,
  collisions: WorldCollisionMap,
): void {
  const stride = 6;
  const sides = [-1, 1] as const;
  const postCount = Math.ceil(samples.length / stride) * sides.length;
  const postGeometry = new THREE.CylinderGeometry(0.16, 0.22, 1.35, 10);
  const ropeGeometry = new THREE.BoxGeometry(0.14, 0.14, 1);
  const posts = new THREE.InstancedMesh(postGeometry, materials.post, postCount);
  const ropes = new THREE.InstancedMesh(ropeGeometry, materials.log, postCount);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let instance = 0;

  for (let index = 0; index < samples.length - stride; index += stride) {
    const sample = samples[index];
    const nextSample = samples[index + stride];
    const edgeDirection = nextSample.center.clone().sub(sample.center).setY(0).normalize();

    for (const side of sides) {
      const edgePosition = sample.center
        .clone()
        .addScaledVector(sample.normal, side * (TRACK_WIDTH * 0.5 + 0.55));
      edgePosition.y = 0.72;
      matrix.compose(edgePosition, quaternion.identity(), new THREE.Vector3(1, 1, 1));
      posts.setMatrixAt(instance, matrix);

      const nextEdgePosition = nextSample.center
        .clone()
        .addScaledVector(nextSample.normal, side * (TRACK_WIDTH * 0.5 + 0.55));
      const ropeCenter = edgePosition.clone().add(nextEdgePosition).multiplyScalar(0.5);
      const ropeLength = edgePosition.distanceTo(nextEdgePosition);
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), edgeDirection);
      scale.set(1, 1, ropeLength);
      matrix.compose(new THREE.Vector3(ropeCenter.x, 1.18, ropeCenter.z), quaternion, scale);
      ropes.setMatrixAt(instance, matrix);

      collisions.circles.push({
        center: new THREE.Vector3(edgePosition.x, 0, edgePosition.z),
        radius: 0.72,
        kind: "post",
      });
      collisions.segments.push({
        start: new THREE.Vector3(edgePosition.x, 0, edgePosition.z),
        end: new THREE.Vector3(nextEdgePosition.x, 0, nextEdgePosition.z),
        radius: 0.55,
        kind: "log",
      });
      instance += 1;
    }
  }

  posts.count = instance;
  ropes.count = instance;
  posts.castShadow = true;
  ropes.castShadow = true;
  posts.receiveShadow = true;
  ropes.receiveShadow = true;
  scene.add(posts, ropes);
}

function createFinishApproachChevrons(
  scene: THREE.Scene,
  samples: TrackSample[],
): void {
  const boardMaterial = createChevronBoardMaterial();
  const boardGeometry = new THREE.BoxGeometry(2.4, 1.08, 0.12);
  const progressMarks = [0.84, 0.875, 0.91, 0.945, 0.98];

  for (const progress of progressMarks) {
    const sample = samples[Math.floor(progress * (samples.length - 1))];

    for (const side of [-1, 1] as const) {
      const board = new THREE.Mesh(boardGeometry, boardMaterial);
      board.position
        .copy(sample.center)
        .addScaledVector(sample.normal, side * (TRACK_WIDTH * 0.5 + 1.05));
      board.position.y = 1.18;
      board.lookAt(sample.center.x, 1.18, sample.center.z);
      board.rotation.z = side > 0 ? -0.04 : 0.04;
      board.castShadow = true;
      board.receiveShadow = true;
      scene.add(board);
    }
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
  collisions: WorldCollisionMap,
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
    const size = 0.65 + rng() * 1.28;
    const position = sample.center
      .clone()
      .addScaledVector(sample.normal, side * (TRACK_WIDTH * 0.5 + 8 + rng() * 19))
      .addScaledVector(sample.tangent, (rng() - 0.5) * 9);
    quaternion.setFromEuler(new THREE.Euler(rng() * 0.14, rng() * Math.PI * 2, 0));
    scale.set(size * (1 + rng() * 0.6), size * (0.42 + rng() * 0.42), size);
    matrix.compose(new THREE.Vector3(position.x, scale.y * 0.85, position.z), quaternion, scale);
    bushes.setMatrixAt(index, matrix);

    if (size > 1.35) {
      collisions.circles.push({
        center: new THREE.Vector3(position.x, 0, position.z),
        radius: size * 1.24,
        kind: "rock",
      });
    }
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
    const distance = TRACK_WIDTH * 0.5 + 7 + rng() * 29;
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
      radius: scale * 1.48,
      kind: "rock",
    });
    placedRocks += 1;
  }

  rocks.count = placedRocks;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
}

function createChevronBoardMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create chevron texture canvas");
  }

  ctx.fillStyle = "#f2c84b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#18140b";
  ctx.fillRect(0, 0, canvas.width, 12);
  ctx.fillRect(0, canvas.height - 12, canvas.width, 12);

  for (let x = -34; x < canvas.width + 34; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x + 42, canvas.height * 0.5);
    ctx.lineTo(x, canvas.height - 18);
    ctx.lineTo(x + 25, canvas.height - 18);
    ctx.lineTo(x + 68, canvas.height * 0.5);
    ctx.lineTo(x + 25, 18);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    map: texture,
    color: "#ffffff",
    roughness: 0.44,
    metalness: 0.04,
  });
}

function createFinishLineMaterial(materials: JungleMaterials): THREE.MeshStandardMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create finish line texture canvas");
  }

  const cellsX = 16;
  const cellsY = 4;
  const cellWidth = canvas.width / cellsX;
  const cellHeight = canvas.height / cellsY;

  for (let y = 0; y < cellsY; y += 1) {
    for (let x = 0; x < cellsX; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#efe1ba" : "#15120d";
      ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.68,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    color: materials.finishLight.color,
  });
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
