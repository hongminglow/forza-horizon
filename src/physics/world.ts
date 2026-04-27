import RAPIER from "@dimforge/rapier3d-compat";

export type PhysicsContext = {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
};

export async function createPhysicsWorld(): Promise<PhysicsContext> {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.numSolverIterations = 6;
  world.integrationParameters.numAdditionalFrictionIterations = 4;

  const ground = RAPIER.ColliderDesc.cuboid(180, 0.12, 180)
    .setTranslation(18, -0.14, 0)
    .setFriction(0.12);
  world.createCollider(ground);

  return { RAPIER, world };
}

export function createCarBody(context: PhysicsContext): RAPIER.RigidBody {
  const { RAPIER: Rapier, world } = context;
  const body = world.createRigidBody(
    Rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, 0.68, 0)
      .setCanSleep(false),
  );

  const collider = Rapier.ColliderDesc.cuboid(0.92, 0.36, 1.82)
    .setFriction(0.08)
    .setRestitution(0.03);
  world.createCollider(collider, body);

  return body;
}
