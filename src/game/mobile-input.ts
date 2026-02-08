export class MobileInputManager {
  // Joystick state
  moveX = 0;
  moveY = 0;
  isMoving = false;

  // Camera state
  cameraDeltaX = 0;
  cameraDeltaY = 0;

  // Buttons
  jumpPressed = false;
  slidePressed = false;

  // Touch tracking
  private joystickTouchId: number | null = null;
  private cameraTouchId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickRadius = 50;

  // DOM elements
  private container: HTMLElement | null = null;
  private joystickBase: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;

  init(container: HTMLElement) {
    this.container = container;
    this.createUI();
    this.bindEvents();
    // Start hidden — only show when game starts
    this.setVisible(false);
  }

  private createUI() {
    if (!this.container) return;

    // Joystick
    this.joystickBase = document.createElement("div");
    this.joystickBase.setAttribute("data-mobile-ui", "joystick");
    Object.assign(this.joystickBase.style, {
      position: "fixed",
      bottom: "80px",
      left: "40px",
      width: "120px",
      height: "120px",
      borderRadius: "50%",
      background: "rgba(255,255,255,0.1)",
      border: "2px solid rgba(255,255,255,0.2)",
      zIndex: "50",
      touchAction: "none",
    });
    this.container.appendChild(this.joystickBase);

    this.joystickKnob = document.createElement("div");
    Object.assign(this.joystickKnob.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "50px",
      height: "50px",
      borderRadius: "50%",
      background: "rgba(255,255,255,0.3)",
      border: "2px solid rgba(255,255,255,0.4)",
    });
    this.joystickBase.appendChild(this.joystickKnob);

    // Jump button
    const jumpBtn = document.createElement("div");
    jumpBtn.setAttribute("data-mobile-ui", "jump");
    Object.assign(jumpBtn.style, {
      position: "fixed",
      bottom: "100px",
      right: "20px",
      width: "60px",
      height: "60px",
      borderRadius: "50%",
      background: "rgba(0,212,255,0.2)",
      border: "2px solid rgba(0,212,255,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "28px",
      lineHeight: "1",
      textAlign: "center",
      zIndex: "50",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    });
    jumpBtn.textContent = "⬆";
    jumpBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.jumpPressed = true;
    });
    jumpBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.jumpPressed = false;
    });
    this.container.appendChild(jumpBtn);

    // Slide button
    const slideBtn = document.createElement("div");
    slideBtn.setAttribute("data-mobile-ui", "slide");
    Object.assign(slideBtn.style, {
      position: "fixed",
      bottom: "170px",
      right: "20px",
      width: "50px",
      height: "50px",
      borderRadius: "50%",
      background: "rgba(255,107,53,0.2)",
      border: "2px solid rgba(255,107,53,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "22px",
      lineHeight: "1",
      textAlign: "center",
      zIndex: "50",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    });
    slideBtn.textContent = "💨";
    slideBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.slidePressed = true;
    });
    slideBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.slidePressed = false;
    });
    this.container.appendChild(slideBtn);
  }

  private bindEvents() {
    // Use document-level touch events for camera
    document.addEventListener("touchstart", this.onTouchStart, { passive: false });
    document.addEventListener("touchmove", this.onTouchMove, { passive: false });
    document.addEventListener("touchend", this.onTouchEnd, { passive: false });
    document.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  // When false, all touch events pass through (menu mode)
  private _active = false;

  setActive(active: boolean) {
    this._active = active;
    if (!active) {
      // Reset all input state when deactivated (e.g. level-up modal)
      this.moveX = 0;
      this.moveY = 0;
      this.isMoving = false;
      this.cameraDeltaX = 0;
      this.cameraDeltaY = 0;
      this.jumpPressed = false;
      this.slidePressed = false;
      this.joystickTouchId = null;
      this.cameraTouchId = null;
      this._lastCameraX = null;
      this._lastCameraY = null;
      if (this.joystickKnob) {
        this.joystickKnob.style.transform = "translate(-50%, -50%)";
      }
    }
  }

  private onTouchStart = (e: TouchEvent) => {
    if (!this._active) return; // Don't capture touches when inactive (menu)

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const screenW = window.innerWidth;

      // Left side → joystick
      if (x < screenW * 0.4 && this.joystickTouchId === null) {
        this.joystickTouchId = touch.identifier;
        this.joystickOrigin = { x: touch.clientX, y: touch.clientY };
        e.preventDefault();
      }
      // Right side (not on buttons) → camera
      else if (x > screenW * 0.4 && this.cameraTouchId === null) {
        // Check if it's not on a button (buttons are bottom-right)
        if (touch.clientY < window.innerHeight - 200 || x < screenW * 0.7) {
          this.cameraTouchId = touch.identifier;
          e.preventDefault();
        }
      }
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this._active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        const dx = touch.clientX - this.joystickOrigin.x;
        const dy = touch.clientY - this.joystickOrigin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, this.joystickRadius);
        const angle = Math.atan2(dy, dx);

        this.moveX = (clampedDist / this.joystickRadius) * Math.cos(angle);
        this.moveY = (clampedDist / this.joystickRadius) * Math.sin(angle);
        this.isMoving = clampedDist > 5;

        // Move knob visually
        if (this.joystickKnob) {
          const knobX = (clampedDist * Math.cos(angle));
          const knobY = (clampedDist * Math.sin(angle));
          this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
        }
        e.preventDefault();
      }

      if (touch.identifier === this.cameraTouchId) {
        this.cameraDeltaX += touch.clientX - (this._lastCameraX ?? touch.clientX);
        this.cameraDeltaY += touch.clientY - (this._lastCameraY ?? touch.clientY);
        this._lastCameraX = touch.clientX;
        this._lastCameraY = touch.clientY;
        e.preventDefault();
      }
    }
  };

  private _lastCameraX: number | null = null;
  private _lastCameraY: number | null = null;

  private onTouchEnd = (e: TouchEvent) => {
    if (!this._active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.moveX = 0;
        this.moveY = 0;
        this.isMoving = false;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = "translate(-50%, -50%)";
        }
      }

      if (touch.identifier === this.cameraTouchId) {
        this.cameraTouchId = null;
        this._lastCameraX = null;
        this._lastCameraY = null;
      }
    }
  };

  consumeCameraDelta() {
    const dx = this.cameraDeltaX;
    const dy = this.cameraDeltaY;
    this.cameraDeltaX = 0;
    this.cameraDeltaY = 0;
    return { dx, dy };
  }

  setVisible(visible: boolean) {
    document.querySelectorAll('[data-mobile-ui]').forEach(el => {
      const s = (el as HTMLElement).style;
      s.display = visible ? "" : "none";
      s.pointerEvents = visible ? "auto" : "none";
    });
  }

  dispose() {
    document.removeEventListener("touchstart", this.onTouchStart);
    document.removeEventListener("touchmove", this.onTouchMove);
    document.removeEventListener("touchend", this.onTouchEnd);
    document.removeEventListener("touchcancel", this.onTouchEnd);
    // Remove DOM elements
    if (this.joystickBase?.parentNode) this.joystickBase.parentNode.removeChild(this.joystickBase);
    // Remove all fixed-position mobile UI elements
    document.querySelectorAll('[data-mobile-ui]').forEach(el => el.remove());
  }
}
