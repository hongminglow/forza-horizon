import * as THREE from "three";

export type CircleCollider = {
  center: THREE.Vector3;
  radius: number;
  kind: "tree" | "rock" | "post";
};

export type SegmentCollider = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  kind: "log";
};

export type WorldCollisionMap = {
  circles: CircleCollider[];
  segments: SegmentCollider[];
};

export function createCollisionMap(): WorldCollisionMap {
  return {
    circles: [],
    segments: [],
  };
}

export function closestPointOnSegment2D(
  point: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
): THREE.Vector3 {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ;

  if (lengthSq <= 0.0001) {
    return start.clone();
  }

  const t = THREE.MathUtils.clamp(
    ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSq,
    0,
    1,
  );

  return new THREE.Vector3(
    start.x + segmentX * t,
    0,
    start.z + segmentZ * t,
  );
}
