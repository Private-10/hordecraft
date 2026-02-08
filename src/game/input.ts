export class InputManager {
  keys: Record<string, boolean> = {};
  mouseX = 0;
  mouseY = 0;
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  scrollDelta = 0;
  isPointerLocked = false;
  private canvas: HTMLCanvasElement | null = null;

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isMobile) {
      canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (!this.isPointerLocked) {
          canvas.requestPointerLock();
        }
      });
    }

    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener("mousemove", (e) => {
      if (this.isPointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.scrollDelta += e.deltaY;
    }, { passive: false });
  }

  consumeScroll(): number {
    const d = this.scrollDelta;
    this.scrollDelta = 0;
    return d;
  }

  consumeMouseDelta() {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  isKeyDown(code: string): boolean {
    return !!this.keys[code];
  }

  get moveForward(): boolean { return this.isKeyDown("KeyW") || this.isKeyDown("ArrowUp"); }
  get moveBack(): boolean { return this.isKeyDown("KeyS") || this.isKeyDown("ArrowDown"); }
  get moveLeft(): boolean { return this.isKeyDown("KeyA") || this.isKeyDown("ArrowLeft"); }
  get moveRight(): boolean { return this.isKeyDown("KeyD") || this.isKeyDown("ArrowRight"); }
  get jump(): boolean { return this.isKeyDown("Space"); }
  get slide(): boolean { return this.isKeyDown("ShiftLeft") || this.isKeyDown("ShiftRight"); }

  dispose() {
    // cleanup handled by GC since we don't store refs
  }
}
