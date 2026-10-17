/* ==============================================================================
   SMARTDRIVE ROBOTICS SIMULATOR - FIRMWARE DIGITAL TWIN (firmware_sim.js)
   Fast-Detection & Smooth Obstacle-Avoidance State Machine
   ============================================================================== */

class ArduinoFirmwareTwin {
  constructor(sim, onSerialLog, onPinChange) {
    this.sim = sim;
    this.onSerialLog = onSerialLog;
    this.onPinChange = onPinChange;

    this.MODE_MANUAL = 'MANUAL';
    this.MODE_AUTONOMOUS = 'AUTONOMOUS';
    this.currentMode = this.MODE_MANUAL;

    this.currentMotion = 'STOPPED';
    this.currentSpeed = 180;
    this.turnSpeed = 210;

    // Fast-Reaction Obstacle Horizons (in centimeters)
    this.SAFE_THRESHOLD_CM = 45;   // Proactive detection horizon
    this.CRITICAL_STOP_CM  = 28;   // Complete halt well before touching
    this.WATCHDOG_TIMEOUT_MS = 1200;

    this.lastCommandTime = performance.now();
    this.isBluetoothConnected = true;

    // Autonomous State Machine
    this.autoStep = 'CRUISE';
    this.autoTimer = 0;
    this.scannedLeftDist = 0;
    this.scannedRightDist = 0;

    this.lastTelemetryTime = 0;

    this.log("SMARTDRIVE v2.2 ACTIVE - High-Speed Obstacle Sensing Engaged");
  }

  log(msg, type = 'normal') {
    if (this.onSerialLog) {
      this.onSerialLog(msg, type);
    }
  }

  setBluetoothConnection(connected) {
    this.isBluetoothConnected = connected;
    if (connected) {
      this.lastCommandTime = performance.now();
      this.log("HC-05: Connected via RFCOMM (9600 baud)", "cmd");
    } else {
      this.log("HC-05: Disconnected", "alert");
      if (this.currentMode === this.MODE_MANUAL) {
        this.stopMotors();
      }
    }
  }

  processCommand(cmdChar) {
    cmdChar = cmdChar.trim();
    if (!cmdChar) return;

    this.lastCommandTime = performance.now();
    this.flashBluetoothPins();

    const c = cmdChar.toUpperCase();

    switch (c) {
      case 'A':
        this.currentMode = this.MODE_AUTONOMOUS;
        this.autoStep = 'CRUISE';
        this.sim.servoAngleDeg = 90;
        this.log(">>> SWITCHED TO AUTONOMOUS AVOIDANCE MODE <<<", "auto");
        break;

      case 'M':
        this.currentMode = this.MODE_MANUAL;
        this.stopMotors();
        this.sim.servoAngleDeg = 90;
        this.log(">>> SWITCHED TO MANUAL BLUETOOTH MODE <<<");
        break;

      case 'F':
        if (this.currentMode === this.MODE_MANUAL) this.moveForward();
        break;

      case 'B':
        if (this.currentMode === this.MODE_MANUAL) this.moveBackward();
        break;

      case 'L':
        if (this.currentMode === this.MODE_MANUAL) this.turnLeft();
        break;

      case 'R':
        if (this.currentMode === this.MODE_MANUAL) this.turnRight();
        break;

      case 'S':
        this.stopMotors();
        break;

      case 'E':
        this.emergencyBrake();
        this.currentMode = this.MODE_MANUAL;
        this.log("[ALERT] EMERGENCY BRAKE ENGAGED!", "alert");
        break;

      case '0': this.setSpeed(100); break;
      case '1': this.setSpeed(120); break;
      case '2': this.setSpeed(140); break;
      case '3': this.setSpeed(160); break;
      case '4': this.setSpeed(180); break;
      case '5': this.setSpeed(200); break;
      case '6': this.setSpeed(215); break;
      case '7': this.setSpeed(230); break;
      case '8': this.setSpeed(245); break;
      case '9': this.setSpeed(255); break;

      case '+':
        this.setSpeed(Math.min(255, this.currentSpeed + 20));
        break;
      case '-':
        this.setSpeed(Math.max(100, this.currentSpeed - 20));
        break;

      default:
        break;
    }

    this.updateHardwarePins();
  }

  setSpeed(val) {
    this.currentSpeed = Math.max(100, Math.min(255, val));
    this.updateHardwarePins();
  }

  moveForward() {
    this.currentMotion = 'FORWARD';
    this.updateHardwarePins();
  }

  moveBackward() {
    this.currentMotion = 'BACKWARD';
    this.updateHardwarePins();
  }

  turnLeft() {
    this.currentMotion = 'LEFT';
    this.updateHardwarePins();
  }

  turnRight() {
    this.currentMotion = 'RIGHT';
    this.updateHardwarePins();
  }

  stopMotors() {
    this.currentMotion = 'STOPPED';
    this.updateHardwarePins();
  }

  emergencyBrake() {
    this.currentMotion = 'STOPPED';
    this.sim.speed = 0;
    this.sim.angularSpeed = 0;
    this.sim.audio.playBuzzer();
    this.updateHardwarePins();
  }

  tick(dt) {
    const now = performance.now();

    if (this.currentMode === this.MODE_AUTONOMOUS) {
      this.runAutonomousLogic(dt, now);
    } else {
      // Manual Mode Watchdog
      if (this.currentMotion !== 'STOPPED') {
        if (now - this.lastCommandTime > this.WATCHDOG_TIMEOUT_MS) {
          this.log("[WATCHDOG] No signal received for 1.2s -> Safe stop.", "alert");
          this.stopMotors();
        }
      }

      // Active Braking Safety in Manual Mode
      if (this.currentMotion === 'FORWARD') {
        const dist = this.sim.measuredDistanceCm;
        if (dist > 0 && dist < this.CRITICAL_STOP_CM) {
          this.log(`[SAFETY ASSIST] Front obstacle at ${dist}cm! Auto emergency brake.`, "alert");
          this.emergencyBrake();
        }
      }
    }

    // Dynamic speed adjustment based on proximity
    let effectiveSpeed = this.currentSpeed;
    if (this.currentMotion === 'LEFT' || this.currentMotion === 'RIGHT') {
      effectiveSpeed = this.turnSpeed;
    } else if (this.currentMotion === 'FORWARD') {
      // Progressive deceleration when entering safe zone (<45cm)
      const dist = this.sim.measuredDistanceCm;
      if (dist > this.CRITICAL_STOP_CM && dist <= this.SAFE_THRESHOLD_CM) {
        effectiveSpeed = Math.min(130, this.currentSpeed * 0.65);
      }
    }

    this.sim.updatePhysics(dt, this.currentMotion, effectiveSpeed);

    if (now - this.lastTelemetryTime >= 1000) {
      this.lastTelemetryTime = now;
      this.outputTelemetryLine();
    }
  }

  // Fast, Responsive Autonomous Obstacle Avoidance
  runAutonomousLogic(dt, now) {
    const dist = this.sim.measuredDistanceCm;

    switch (this.autoStep) {
      case 'CRUISE':
        this.sim.servoAngleDeg = 90;
        this.currentMotion = 'FORWARD';

        // Detect early and halt cleanly BEFORE reaching the obstacle
        if (dist > 0 && dist <= this.CRITICAL_STOP_CM) {
          this.log(`[AUTO] Obstacle detected early at ${dist}cm! Stopping cleanly...`, "auto");
          this.currentMotion = 'STOPPED';
          this.autoStep = 'BACKUP';
          this.autoTimer = now;
        }
        break;

      case 'BACKUP':
        this.currentMotion = 'BACKWARD';
        if (now - this.autoTimer >= 220) { // Quick 220ms reverse
          this.currentMotion = 'STOPPED';
          this.autoStep = 'SCAN_LEFT';
          this.autoTimer = now;
          this.sim.servoAngleDeg = 150; // Look Left
          this.sim.audio.playPing();
        }
        break;

      case 'SCAN_LEFT':
        if (now - this.autoTimer >= 180) { // Fast 180ms settle
          this.scannedLeftDist = this.sim.measuredDistanceCm;
          this.autoStep = 'SCAN_RIGHT';
          this.autoTimer = now;
          this.sim.servoAngleDeg = 30; // Look Right
          this.sim.audio.playPing();
        }
        break;

      case 'SCAN_RIGHT':
        if (now - this.autoTimer >= 240) { // Fast 240ms sweep
          this.scannedRightDist = this.sim.measuredDistanceCm;
          this.autoStep = 'DECIDE';
          this.autoTimer = now;
          this.sim.servoAngleDeg = 90; // Center
        }
        break;

      case 'DECIDE':
        if (now - this.autoTimer >= 140) {
          const left = this.scannedLeftDist;
          const right = this.scannedRightDist;

          this.log(`[AUTO SCAN] Left: ${left}cm | Right: ${right}cm`, "auto");

          // Both blocked: 180° turnaround
          if (left <= this.CRITICAL_STOP_CM && right <= this.CRITICAL_STOP_CM) {
            this.log("[AUTO] Dead end! 180° spin.", "auto");
            this.currentMotion = 'RIGHT';
            this.autoStep = 'TURNING';
            this.autoDuration = 680;
          } else if (left >= right) {
            this.log("[AUTO] Steering LEFT path.", "auto");
            this.currentMotion = 'LEFT';
            this.autoStep = 'TURNING';
            this.autoDuration = 360;
          } else {
            this.log("[AUTO] Steering RIGHT path.", "auto");
            this.currentMotion = 'RIGHT';
            this.autoStep = 'TURNING';
            this.autoDuration = 360;
          }
          this.autoTimer = now;
        }
        break;

      case 'TURNING':
        if (now - this.autoTimer >= this.autoDuration) {
          this.currentMotion = 'STOPPED';
          this.autoStep = 'CRUISE';
        }
        break;
    }

    this.updateHardwarePins();
  }

  outputTelemetryLine() {
    const dist = this.sim.measuredDistanceCm;
    const modeStr = this.currentMode === this.MODE_AUTONOMOUS ? 'AUTO' : 'MANUAL';
    const pingStr = dist >= 400 ? '>400cm' : `${dist}cm`;
    this.log(`[STATUS] Mode: ${modeStr} | Motion: ${this.currentMotion} | Speed: ${this.currentSpeed} | Sonar: ${pingStr}`);
  }

  flashBluetoothPins() {
    if (this.onPinChange) {
      this.onPinChange('pinD2', 'DATA', true);
      this.onPinChange('pinD3', 'DATA', true);
      setTimeout(() => {
        if (this.onPinChange) {
          this.onPinChange('pinD2', 'IDLE', false);
          this.onPinChange('pinD3', 'IDLE', false);
        }
      }, 70);
    }
  }

  updateHardwarePins() {
    if (!this.onPinChange) return;

    let in1 = 'LOW', in2 = 'LOW', in3 = 'LOW', in4 = 'LOW';
    let ena = 0, enb = 0;

    const speedVal = (this.currentMotion === 'LEFT' || this.currentMotion === 'RIGHT') ? this.turnSpeed : this.currentSpeed;

    switch (this.currentMotion) {
      case 'FORWARD':
        in1 = 'HIGH'; in2 = 'LOW';
        in3 = 'HIGH'; in4 = 'LOW';
        ena = speedVal; enb = speedVal;
        break;
      case 'BACKWARD':
        in1 = 'LOW'; in2 = 'HIGH';
        in3 = 'LOW'; in4 = 'HIGH';
        ena = speedVal; enb = speedVal;
        break;
      case 'LEFT':
        in1 = 'LOW'; in2 = 'HIGH';
        in3 = 'HIGH'; in4 = 'LOW';
        ena = speedVal; enb = speedVal;
        break;
      case 'RIGHT':
        in1 = 'HIGH'; in2 = 'LOW';
        in3 = 'LOW'; in4 = 'HIGH';
        ena = speedVal; enb = speedVal;
        break;
      case 'STOPPED':
      default:
        in1 = 'LOW'; in2 = 'LOW';
        in3 = 'LOW'; in4 = 'LOW';
        ena = 0; enb = 0;
        break;
    }

    this.onPinChange('pinD5', `${ena}`, ena > 0);
    this.onPinChange('pinD4', in1, in1 === 'HIGH');
    this.onPinChange('pinD7', in2, in2 === 'HIGH');
    this.onPinChange('pinD8', in3, in3 === 'HIGH');
    this.onPinChange('pinD12', in4, in4 === 'HIGH');
    this.onPinChange('pinD6', `${enb}`, enb > 0);
    this.onPinChange('pinD9', `${Math.round(this.sim.servoAngleDeg)}°`, true);

    const isClose = this.sim.measuredDistanceCm <= this.CRITICAL_STOP_CM;
    this.onPinChange('pinA0', 'PULSE', true);
    this.onPinChange('pinA1', `${this.sim.measuredDistanceCm}cm`, isClose);
  }
}
