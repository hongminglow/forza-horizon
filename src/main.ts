import * as THREE from "three";
import "./style.css";
import {
  CarController,
  type CarDebugState,
  type CarHudState,
} from "./game/carController";
import { InputController } from "./game/input";
import {
  buildTrackSamples,
  createTrackCurve,
  yawFromTangent,
} from "./game/track";
import { createCarBody, createPhysicsWorld } from "./physics/world";
import { createCarRig, updateCarRigSteering } from "./render/carModel";
import { buildJungleTrack } from "./render/jungle";

async function bootstrap(): Promise<void> {
  const runtimeWindow = window as Window & {
    __jungleSprintCleanup?: () => void;
    __jungleSprintDebug?: () => CarDebugState;
  };
  runtimeWindow.__jungleSprintCleanup?.();
  runtimeWindow.__jungleSprintCleanup = undefined;
  runtimeWindow.__jungleSprintDebug = undefined;

  const container = document.querySelector<HTMLDivElement>("#game");

  if (!container) {
    throw new Error("Missing #game container");
  }

  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.08,
    520,
  );
  const renderer = createRenderer();
  container.appendChild(renderer.domElement);

  const curve = createTrackCurve();
  const samples = buildTrackSamples(curve);
  const physics = await createPhysicsWorld();

  const collisionMap = buildJungleTrack(scene, physics.world, physics.RAPIER, samples);

  const carBody = createCarBody(physics);
  const startYaw = yawFromTangent(samples[2].tangent);
  const carController = new CarController(
    carBody,
    samples,
    collisionMap,
    startYaw,
    performance.now() / 1000,
  );
  const carRig = createCarRig(camera);
  scene.add(carRig);

  const input = new InputController();
  const hud = createHud();
  const clock = new THREE.Clock();

  setupLighting(scene);
  const cleanupResize = setupResize(camera, renderer);
  const cleanupContextRecovery = setupContextRecovery(renderer);

  let latestHud = carController.getHudState(performance.now() / 1000);

  renderer.setAnimationLoop((time) => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const now = time / 1000;
    const driveInput = input.read();

    physics.world.timestep = delta;
    latestHud = carController.update(driveInput, delta, now);
    physics.world.step();
    carController.syncObject(carRig);
    updateCarRigSteering(carRig, carController.getSteeringAngle());
    updateCameraFeel(
      camera,
      latestHud,
      carController.getYaw(),
      carController.getSteeringLean(),
      carController.getYawRate(),
    );
    hud.update(latestHud);
    renderer.render(scene, camera);
  });

  const cleanup = (): void => {
    renderer.setAnimationLoop(null);
    input.destroy();
    cleanupResize();
    cleanupContextRecovery();
    renderer.dispose();
    renderer.domElement.remove();
    physics.world.free();
    runtimeWindow.__jungleSprintDebug = undefined;
  };

  runtimeWindow.__jungleSprintCleanup = cleanup;
  runtimeWindow.__jungleSprintDebug = () => carController.getDebugState();
  import.meta.hot?.dispose(cleanup);
}

function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#bac8b5");
  scene.fog = new THREE.FogExp2("#a9bba5", 0.0058);
  return scene;
}

function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  return renderer;
}

function setupLighting(scene: THREE.Scene): void {
  const hemisphere = new THREE.HemisphereLight("#f5ecd2", "#2e4329", 2.35);
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight("#c6d0bd", 0.34);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight("#ffe2a8", 3.1);
  sun.position.set(-56, 82, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  scene.add(sun);

  const fill = new THREE.DirectionalLight("#c5ddc8", 1.05);
  fill.position.set(42, 28, -68);
  scene.add(fill);
}

function setupResize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): () => void {
  const handleResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}

function setupContextRecovery(renderer: THREE.WebGLRenderer): () => void {
  const handleContextLost = (event: Event): void => {
    event.preventDefault();
  };

  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  return () =>
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
}

function updateCameraFeel(
  camera: THREE.PerspectiveCamera,
  hud: CarHudState,
  yaw: number,
  steeringLean: number,
  yawRate: number,
): void {
  const speedFactor = THREE.MathUtils.clamp(hud.speedKph / 125, 0, 1);
  const roadPulse = Math.sin(performance.now() * 0.012 + yaw * 2) * 0.012 * speedFactor;
  const targetRoll = THREE.MathUtils.clamp(
    -steeringLean * 0.028 - yawRate * 0.018,
    -0.05,
    0.05,
  );
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.12);
  camera.position.y = 1.48 + roadPulse;
  camera.rotation.x = -0.035;
  camera.rotation.y = 0;
  camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, targetRoll, 0.045);
  camera.fov = THREE.MathUtils.lerp(camera.fov, 72 + speedFactor * 6, 0.035);
  camera.updateProjectionMatrix();
}

function createHud(): { update: (state: CarHudState) => void } {
  const speed = document.querySelector<HTMLElement>("#speed");
  const lap = document.querySelector<HTMLElement>("#lap");
  const time = document.querySelector<HTMLElement>("#time");
  const best = document.querySelector<HTMLElement>("#best");
  const finish = document.querySelector<HTMLElement>("#finish");

  return {
    update(state: CarHudState): void {
      if (speed) {
        speed.textContent = Math.round(state.speedKph).toString();
      }

      if (lap) {
        lap.textContent = state.finished
          ? `${state.targetLaps}/${state.targetLaps}`
          : `${state.lap}/${state.targetLaps}`;
      }

      if (time) {
        time.textContent = formatTime(state.finished ? state.bestLapTime ?? 0 : state.raceTime);
      }

      if (best && finish) {
        finish.hidden = !state.finished;
        best.textContent = state.bestLapTime === null ? "--" : formatTime(state.bestLapTime);
      }
    },
  };
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unable to start game";
  document.body.innerHTML = `<pre>${message}</pre>`;
  throw error;
});
