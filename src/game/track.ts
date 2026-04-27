import * as THREE from "three";

export const TRACK_WIDTH = 16;

const CONTROL_POINTS = [
  [0, 0],
  [0, -55],
  [22, -98],
  [66, -116],
  [108, -84],
  [122, -36],
  [90, 10],
  [122, 62],
  [72, 110],
  [8, 98],
  [-42, 68],
  [-82, 20],
  [-66, -38],
  [-30, -52],
] as const;

export type TrackSample = {
  center: THREE.Vector3;
  left: THREE.Vector3;
  right: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  progress: number;
};

export type BoundarySegment = {
  center: THREE.Vector3;
  direction: THREE.Vector3;
  length: number;
};

export type TrackNearest = {
  progress: number;
  distance: number;
  sample: TrackSample;
};

export function createTrackCurve(): THREE.CatmullRomCurve3 {
  const points = CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  return new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.42);
}

export function buildTrackSamples(
  curve: THREE.CatmullRomCurve3,
  segments = 360,
  width = TRACK_WIDTH,
): TrackSample[] {
  const samples: TrackSample[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const center = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const left = center.clone().addScaledVector(normal, width * 0.5);
    const right = center.clone().addScaledVector(normal, width * -0.5);

    samples.push({ center, left, right, tangent, normal, progress });
  }

  return samples;
}

export function createTrackGeometry(samples: TrackSample[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  samples.forEach((sample, index) => {
    positions.push(sample.left.x, 0.035, sample.left.z);
    positions.push(sample.right.x, 0.035, sample.right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, index * 0.12, 1, index * 0.12);
  });

  for (let index = 0; index < samples.length - 1; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

export function createBoundarySegments(
  samples: TrackSample[],
  side: "left" | "right",
  stride = 5,
): BoundarySegment[] {
  const segments: BoundarySegment[] = [];
  const edgeKey = side;

  for (let index = 0; index < samples.length - stride; index += stride) {
    const start = samples[index][edgeKey];
    const end = samples[index + stride][edgeKey];
    const delta = end.clone().sub(start);
    const length = delta.length();

    if (length < 0.01) {
      continue;
    }

    segments.push({
      center: start.clone().add(end).multiplyScalar(0.5),
      direction: delta.normalize(),
      length,
    });
  }

  return segments;
}

export function findNearestTrackSample(
  samples: TrackSample[],
  position: THREE.Vector3,
): TrackNearest {
  let bestSample = samples[0];
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const sample of samples) {
    const distanceSq =
      (sample.center.x - position.x) ** 2 + (sample.center.z - position.z) ** 2;

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestSample = sample;
    }
  }

  return {
    progress: bestSample.progress,
    distance: Math.sqrt(bestDistanceSq),
    sample: bestSample,
  };
}

export function yawFromTangent(tangent: THREE.Vector3): number {
  return Math.atan2(tangent.x, -tangent.z);
}

export function yawQuaternion(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
}
