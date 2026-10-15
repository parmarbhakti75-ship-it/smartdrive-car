/* ==============================================================================
   SMARTDRIVE ROBOTICS SIMULATOR - FIRMWARE DIGITAL TWIN (firmware_sim.js)
   Exact replica of SMARTDRIVE.ino Arduino Uno State Machine
   ============================================================================== */

class ArduinoFirmwareTwin {
  constructor(sim, onSerialLog, onPinChange) {
    this.sim = sim;
    this.onSerialLog = onSerialLog;
    this.onPinChange = onPinChange;

    // Operating Modes
    this.MODE_MANUAL = 'MANUAL';
    this.MODE_AUTONOMOUS = 'AUTONOMOUS';
    this.currentMode = this.MODE_MANUAL;

    // Motion States
    this.currentMotion = 'STOPPED';
    this.currentSpeed = 180;
    this.turnSpeed = 200;

    // Safety & Autonomous Thresholds (match Arduino C++ constants)
    this.SAFE_THRESHOLD_CM = 30;
    this.CRITICAL_STOP_CM = 15;
    this.WATCHDOG_TIMEOUT_MS = 1200; // 1.2 second watchdog

    // Watchdog timestamp
    this.lastCommandTime = performance.now();
    this.isBluetoothConnected = false;

    // Autonomous State Machine
    this.autoStep = 'CRUISE';
    this.autoTimer = 0;
    this.scannedLeftDist = 0;
    this.scannedRightDist = 0;

    // Telemetry ticker
    this.lastTelemetryTime = 0;

    this.log("SMARTDRIVE 4WD FIRMWARE SIMULATOR INITIALIZED");
    this.log("Default Mode: MANUAL | Speed: 180/255 | 9600 Baud");
    this.updateHardwarePins();
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
      this.log("HC-05: Client connected via RFCOMM (9600 baud)", "cmd");
    } else {
      this.log("HC-05: Bluetooth connection lost / disconnected", "alert");
      if (this.currentMode === this.MODE_MANUAL) {
        this.stopMotors();
      }
    }
  }

  // Receive a character command (F, B, L, R, S, A, M, E, 0-9, etc.)
  processCommand(cmdChar) {
    cmdChar = cmdChar.trim();
    if (!cmdChar) return;

    this.lastCommandTime = performance.now();
    this.log(`[CMD RECV]: '${cmdChar}'`, 'cmd');

    // D2 / D3 blink indicator
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

      // Speed presets
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

      case '?':
      case 'H':
        this.printHelp();
        break;

      default:
        this.log(`Unknown command: ${cmdChar}`);
        break;
    }

    this.updateHardwarePins();
  }

  setSpeed(val) {
    this.currentSpeed = Math.max(100, Math.min(255, val));
    this.log(`Motor Speed Adjusted: ${this.currentSpeed} / 255`);
    this.updateHardwarePins();
  }

  // --- MOTOR ACTUATION ROUTINES ---
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

  // --- MAIN FIRMWARE TICK (Equivalent to Arduino loop()) ---
  tick(dt) {
    const now = performance.now();

    // 1. Autonomous Engine
    if (this.currentMode === this.MODE_AUTONOMOUS) {
      this.runAutonomousLogic(dt, now);
    } 
    // 2. Manual Mode Watchdog & Active Braking
    else {
      // Bluetooth Watchdog: auto-stop if no command received for >1.2s while driving
      if (this.currentMotion !== 'STOPPED') {
        if (now - this.lastCommandTime > this.WATCHDOG_TIMEOUT_MS) {
          this.log("[WATCHDOG TIMEOUT] No Bluetooth signal for 1.2s! Safe stop activated.", "alert");
          this.stopMotors();
        }
      }

      // Active Braking Safety: If driving forward in manual mode and obstacle gets < 15cm
      if (this.currentMotion === 'FORWARD') {
        const dist = this.sim.measuredDistanceCm;
        if (dist > 0 && dist < this.CRITICAL_STOP_CM) {
          this.log(`[SAFETY ASSIST] Front obstacle at ${dist}cm! Auto emergency brake.`, "alert");
          this.emergencyBrake();
        }
      }
    }

    // Pass physics to simulator
    const speedPwm = (this.currentMotion === 'LEFT' || this.currentMotion === 'RIGHT') ? this.turnSpeed : this.currentSpeed;
    this.sim.updatePhysics(dt, this.currentMotion, speedPwm);

    // Periodic 1-second Serial Telemetry
    if (now - this.lastTelemetryTime >= 1000) {
      this.lastTelemetryTime = now;
      this.outputTelemetryLine();
    }
  }

  // Exact step-by-step state machine from SMARTDRIVE.ino
  runAutonomousLogic(dt, now) {
    const dist = this.sim.measuredDistanceCm;

    switch (this.autoStep) {
      case 'CRUISE':
        this.sim.servoAngleDeg = 90; // Face forward
        this.currentMotion = 'FORWARD';

        if (dist > 0 && dist <= this.SAFE_THRESHOLD_CM) {
          this.log(`[AUTO] Obstacle at ${dist}cm! Stopping and preparing scan...`, "auto");
          this.currentMotion = 'STOPPED';
          this.autoStep = 'BACKUP';
          this.autoTimer = now;
        }
        break;

      case 'BACKUP':
        this.currentMotion = 'BACKWARD';
        if (now - this.autoTimer >= 280) { // 280ms reverse
          this.currentMotion = 'STOPPED';
          this.autoStep = 'SCAN_LEFT';
          this.autoTimer = now;
          this.sim.servoAngleDeg = 150; // Look Left
          this.sim.audio.playPing();
        }
        break;

      case 'SCAN_LEFT':
        // Wait 300ms for servo to reach 150° and settle
        if (now - this.autoTimer >= 300) {
          this.scannedLeftDist = this.sim.measuredDistanceCm;
          this.log(`[AUTO SCAN] Left: ${this.scannedLeftDist} cm`, "auto");
          this.autoStep = 'SCAN_RIGHT';
          this.autoTimer = now;
          this.sim.servoAngleDeg = 30; // Look Right
          this.sim.audio.playPing();
        }
        break;

      case 'SCAN_RIGHT':
        // Wait 450ms for servo to sweep from 150° to 30°
        if (now - this.autoTimer >= 450) {
          this.scannedRightDist = this.sim.measuredDistanceCm;
          this.log(`[AUTO SCAN] Right: ${this.scannedRightDist} cm`, "auto");
          this.autoStep = 'DECIDE';
          this.autoTimer = now;
          this.sim.servoAngleDeg = 90; // Return center
        }
        break;

      case 'DECIDE':
        // Center settling
        if (now - this.autoTimer >= 250) {
          const left = this.scannedLeftDist;
          const right = this.scannedRightDist;

          // Both blocked: 180° turnaround
          if (left <= this.SAFE_THRESHOLD_CM && right <= this.SAFE_THRESHOLD_CM) {
            this.log("[AUTO] Dead end! Performing 180° turnaround.", "auto");
            this.currentMotion = 'RIGHT';
            this.autoStep = 'TURNING';
            this.autoDuration = 750; // Turn duration
          } else if (left >= right) {
            this.log("[AUTO] Choosing LEFT clear path.", "auto");
            this.currentMotion = 'LEFT';
            this.autoStep = 'TURNING';
            this.autoDuration = 420;
          } else {
            this.log("[AUTO] Choosing RIGHT clear path.", "auto");
            this.currentMotion = 'RIGHT';
            this.autoStep = 'TURNING';
            this.autoDuration = 420;
          }
          this.autoTimer = now;
        }
        break;

      case 'TURNING':
        if (now - this.autoTimer >= this.autoDuration) {
          this.currentMotion = 'STOPPED';
          this.autoStep = 'CRUISE';
          this.log("[AUTO] Resuming forward cruise.", "auto");
        }
        break;
    }

    this.updateHardwarePins();
  }

  outputTelemetryLine() {
    const dist = this.sim.measuredDistanceCm;
    const modeStr = this.currentMode === this.MODE_AUTONOMOUS ? 'AUTONOMOUS' : 'MANUAL    ';
    const motionStr = this.currentMotion.padEnd(8, ' ');
    const pingStr = dist >= 400 ? '>400 cm' : `${dist} cm`;
    this.log(`[STATUS] ${modeStr} | Motion: ${motionStr} | Speed: ${this.currentSpeed} | Ping: ${pingStr}`);
  }

  printHelp() {
    this.log("--- SMARTDRIVE COMMAND GUIDE ---");
    this.log("  F: Forward  |  B: Backward  |  L: Left  |  R: Right  |  S: Stop");
    this.log("  A: Autonomous Mode  |  M: Manual Mode  |  E: Emergency Brake");
    this.log("  0..9: Speed (100 to 255 PWM)");
    this.log("--------------------------------");
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
      }, 80);
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

    this.onPinChange('pinD5', `${ena} PWM`, ena > 0);
    this.onPinChange('pinD4', in1, in1 === 'HIGH');
    this.onPinChange('pinD7', in2, in2 === 'HIGH');
    this.onPinChange('pinD8', in3, in3 === 'HIGH');
    this.onPinChange('pinD12', in4, in4 === 'HIGH');
    this.onPinChange('pinD6', `${enb} PWM`, enb > 0);
    this.onPinChange('pinD9', `${Math.round(this.sim.servoAngleDeg)}°`, true);

    const isClose = this.sim.measuredDistanceCm <= this.SAFE_THRESHOLD_CM;
    this.onPinChange('pinA0', 'PULSE', true);
    this.onPinChange('pinA1', `${this.sim.measuredDistanceCm}cm`, isClose);
  }
}
