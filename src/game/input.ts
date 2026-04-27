export type DriveInput = {
  throttle: number;
  brake: number;
  steer: number;
  resetPressed: boolean;
};

export class InputController {
  private readonly keys = new Set<string>();
  private resetLatch = false;

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
    this.target.addEventListener("blur", this.handleBlur);
  }

  read(): DriveInput {
    const throttle = this.keys.has("KeyW") ? 1 : 0;
    const brake = this.keys.has("KeyS") ? 1 : 0;
    const steerLeft = this.keys.has("KeyA") ? 1 : 0;
    const steerRight = this.keys.has("KeyD") ? 1 : 0;
    const resetPressed = this.resetLatch;

    this.resetLatch = false;

    return {
      throttle,
      brake,
      steer: steerRight - steerLeft,
      resetPressed,
    };
  }

  destroy(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("blur", this.handleBlur);
  }

  clear(): void {
    this.keys.clear();
    this.resetLatch = false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const code = normalizeDriveCode(event);

    if (code) {
      event.preventDefault();
      this.keys.add(code);
    }

    if (code === "KeyR") {
      this.resetLatch = true;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const code = normalizeDriveCode(event);

    if (code) {
      this.keys.delete(code);
    }
  };

  private readonly handleBlur = (): void => {
    this.keys.clear();
  };
}

function normalizeDriveCode(event: KeyboardEvent): string | null {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyR"].includes(event.code)) {
    return event.code;
  }

  switch (event.key.toLowerCase()) {
    case "w":
    case "keyw":
      return "KeyW";
    case "a":
    case "keya":
      return "KeyA";
    case "s":
    case "keys":
      return "KeyS";
    case "d":
    case "keyd":
      return "KeyD";
    case "r":
    case "keyr":
      return "KeyR";
    default:
      return null;
  }
}
