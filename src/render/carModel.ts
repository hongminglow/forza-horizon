import * as THREE from "three";

const FRONT_WHEEL_LEFT = "FrontWheelLeft";
const FRONT_WHEEL_RIGHT = "FrontWheelRight";
const STEERING_WHEEL = "SteeringWheel";
const STEERING_HUB = "SteeringHub";

export function createCarRig(camera: THREE.PerspectiveCamera): THREE.Group {
  const rig = new THREE.Group();
  rig.name = "CarRig";

  const paint = new THREE.MeshStandardMaterial({
    color: "#c43e24",
    roughness: 0.46,
    metalness: 0.18,
  });
  const darkPaint = new THREE.MeshStandardMaterial({
    color: "#261f19",
    roughness: 0.62,
    metalness: 0.08,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: "#11100f",
    roughness: 0.78,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: "#8fc8b4",
    roughness: 0.18,
    metalness: 0,
    transparent: true,
    opacity: 0.18,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: "#ffd36d",
    emissive: "#c26b22",
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 4.0), paint);
  chassis.position.set(0, 0.28, 0);
  chassis.castShadow = true;
  rig.add(chassis);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 1.75), paint);
  hood.position.set(0, 0.62, -1.1);
  hood.castShadow = true;
  rig.add(hood);

  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.18, 0.28), darkPaint);
  dash.position.set(0, 0.86, -0.18);
  rig.add(dash);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.68, 0.05), glass);
  windshield.position.set(0, 1.18, -0.68);
  windshield.rotation.x = -0.28;
  rig.add(windshield);

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.026, 10, 22), rubber);
  wheel.name = STEERING_WHEEL;
  wheel.position.set(0, 0.72, -0.02);
  wheel.rotation.x = Math.PI * 0.5;
  rig.add(wheel);

  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), glow);
  wheelHub.name = STEERING_HUB;
  wheelHub.position.copy(wheel.position);
  wheelHub.rotation.x = Math.PI * 0.5;
  rig.add(wheelHub);

  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 18);
  const wheelOffsets = [
    [-1.04, 0.12, -1.17],
    [1.04, 0.12, -1.17],
    [-1.04, 0.12, 1.2],
    [1.04, 0.12, 1.2],
  ] as const;

  for (const [index, [x, y, z]] of wheelOffsets.entries()) {
    const isFrontWheel = z < 0;
    const wheelPivot = new THREE.Group();
    wheelPivot.name =
      index === 0 ? FRONT_WHEEL_LEFT : index === 1 ? FRONT_WHEEL_RIGHT : "RearWheel";
    wheelPivot.position.set(x, y, z);

    const tire = new THREE.Mesh(wheelGeometry, rubber);
    tire.rotation.z = Math.PI * 0.5;
    tire.castShadow = true;

    if (isFrontWheel) {
      wheelPivot.add(tire);
      rig.add(wheelPivot);
    } else {
      tire.position.set(x, y, z);
      rig.add(tire);
    }
  }

  const pillarGeometry = new THREE.BoxGeometry(0.08, 0.72, 0.08);
  for (const x of [-0.94, 0.94]) {
    const pillar = new THREE.Mesh(pillarGeometry, darkPaint);
    pillar.position.set(x, 1.1, -0.58);
    pillar.rotation.z = x > 0 ? -0.16 : 0.16;
    rig.add(pillar);
  }

  camera.position.set(0, 1.48, 0.78);
  camera.rotation.set(-0.035, 0, 0);
  rig.add(camera);

  return rig;
}

export function updateCarRigSteering(
  rig: THREE.Group,
  steeringAngle: number,
): void {
  const visualSteer = THREE.MathUtils.clamp(steeringAngle, -0.5, 0.5);
  const steeringWheelTurn = -visualSteer * 2.4;

  for (const name of [FRONT_WHEEL_LEFT, FRONT_WHEEL_RIGHT]) {
    const wheelPivot = rig.getObjectByName(name);

    if (wheelPivot) {
      wheelPivot.rotation.y = -visualSteer;
    }
  }

  for (const name of [STEERING_WHEEL, STEERING_HUB]) {
    const steeringPart = rig.getObjectByName(name);

    if (steeringPart) {
      steeringPart.rotation.z = steeringWheelTurn;
    }
  }
}
