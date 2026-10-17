/* ==============================================================================
   SMARTDRIVE ROBOTICS SIMULATOR - PHYSICS, HIGH-SPEED RAYCASTING & RENDERING
   ============================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.motorOsc = null;
    this.motorGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClick() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {}
  }

  playPing() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.035);
    } catch (e) {}
  }

  playBuzzer() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }

  setMotorHum(isMoving, speedPwm = 180) {
    if (!this.enabled || !this.ctx) return;
    try {
      if (isMoving) {
        if (!this.motorOsc) {
          this.motorOsc = this.ctx.createOscillator();
          this.motorGain = this.ctx.createGain();
          this.motorOsc.type = 'sawtooth';
          this.motorGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
          this.motorOsc.connect(this.motorGain);
          this.motorGain.connect(this.ctx.destination);
          this.motorOsc.start();
        }
        const freq = 60 + (speedPwm / 255) * 80;
        this.motorOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
      } else {
        if (this.motorOsc) {
          this.motorGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
          setTimeout(() => {
            if (this.motorOsc) {
              this.motorOsc.stop();
              this.motorOsc.disconnect();
              this.motorOsc = null;
              this.motorGain = null;
            }
          }, 50);
        }
      }
    } catch (e) {}
  }
}

class RobotSimulator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioEngine();

    // Scale conversion: 2 pixels = 1 cm (so 100 pixels = 50 cm)
    this.PX_PER_CM = 2.0;

    // Robot dimensions
    this.width = 36 * this.PX_PER_CM;  // ~18 cm wide
    this.length = 48 * this.PX_PER_CM; // ~24 cm long

    // Robot state
    this.x = 220;
    this.y = 260;
    this.heading = 0; // In radians (0 = facing right)
    this.speed = 0;   // In pixels/sec
    this.angularSpeed = 0; // In rad/sec

    // Servo & ultrasonic state
    this.servoAngleDeg = 90; // 90 = center (straight ahead), 150 = left, 30 = right
    this.measuredDistanceCm = 400;
    this.pingWaveAnim = 0;

    // Wheel rotation animation
    this.leftWheelDist = 0;
    this.rightWheelDist = 0;

    // Obstacles
    this.obstacles = [];
    this.initDefaultObstacles();

    // Interaction handling
    this.draggedObstacle = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.setupInteractions();

    this.lastTimestamp = performance.now();
  }

  initDefaultObstacles() {
    this.obstacles = [
      { x: 120, y: 100, w: 90, h: 70, label: 'Obstacle A' },
      { x: 480, y: 190, w: 90, h: 140, label: 'Wall' },
      { x: 650, y: 350, w: 100, h: 80, label: 'Obstacle B' },
      { x: 640, y: 90, w: 90, h: 70, label: 'Barrier' },
      { x: 250, y: 400, w: 120, h: 50, label: 'Block' }
    ];
  }

  randomizeObstacles() {
    this.obstacles = [];
    const count = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const w = 70 + Math.random() * 70;
      const h = 60 + Math.random() * 60;
      const x = 50 + Math.random() * (this.canvas.width - w - 100);
      const y = 50 + Math.random() * (this.canvas.height - h - 100);

      const distToRobot = Math.hypot(x + w / 2 - this.x, y + h / 2 - this.y);
      if (distToRobot > 150) {
        this.obstacles.push({ x, y, w, h, label: `Obj ${i + 1}` });
      }
    }
  }

  clearObstacles() {
    this.obstacles = [];
  }

  addObstacleBox() {
    this.obstacles.push({
      x: 350 + Math.random() * 150,
      y: 180 + Math.random() * 150,
      w: 80,
      h: 70,
      label: `Box ${this.obstacles.length + 1}`
    });
  }

  resetRobot() {
    this.x = 180;
    this.y = 260;
    this.heading = 0;
    this.speed = 0;
    this.angularSpeed = 0;
    this.servoAngleDeg = 90;
  }

  setupInteractions() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.init();
      const pos = getPos(e);
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        if (pos.x >= obs.x && pos.x <= obs.x + obs.w &&
            pos.y >= obs.y && pos.y <= obs.y + obs.h) {
          this.draggedObstacle = obs;
          this.dragOffsetX = pos.x - obs.x;
          this.dragOffsetY = pos.y - obs.y;
          return;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.draggedObstacle) {
        const pos = getPos(e);
        this.draggedObstacle.x = Math.max(10, Math.min(this.canvas.width - this.draggedObstacle.w - 10, pos.x - this.dragOffsetX));
        this.draggedObstacle.y = Math.max(10, Math.min(this.canvas.height - this.draggedObstacle.h - 10, pos.y - this.dragOffsetY));
      }
    });

    window.addEventListener('mouseup', () => {
      this.draggedObstacle = null;
    });

    this.canvas.addEventListener('dblclick', (e) => {
      const pos = getPos(e);
      this.obstacles.push({
        x: pos.x - 40,
        y: pos.y - 35,
        w: 80,
        h: 70,
        label: `Box ${this.obstacles.length + 1}`
      });
      this.audio.playClick();
    });
  }

  // High-Speed Multi-Ray Acoustic Sensing
  measureUltrasonicRay() {
    const frontOffset = this.length / 2 - 2;
    const sensorX = this.x + Math.cos(this.heading) * frontOffset;
    const sensorY = this.y + Math.sin(this.heading) * frontOffset;

    const servoOffsetRad = (90 - this.servoAngleDeg) * (Math.PI / 180);
    const rayAngle = this.heading + servoOffsetRad;

    // Collect all boundary segments
    const segments = [
      { x1: 5, y1: 5, x2: this.canvas.width - 5, y2: 5 },
      { x1: this.canvas.width - 5, y1: 5, x2: this.canvas.width - 5, y2: this.canvas.height - 5 },
      { x1: this.canvas.width - 5, y1: this.canvas.height - 5, x2: 5, y2: this.canvas.height - 5 },
      { x1: 5, y1: this.canvas.height - 5, x2: 5, y2: 5 }
    ];

    for (const obs of this.obstacles) {
      segments.push(
        { x1: obs.x, y1: obs.y, x2: obs.x + obs.w, y2: obs.y },
        { x1: obs.x + obs.w, y1: obs.y, x2: obs.x + obs.w, y2: obs.y + obs.h },
        { x1: obs.x + obs.w, y1: obs.y + obs.h, x2: obs.x, y2: obs.y + obs.h },
        { x1: obs.x, y1: obs.y + obs.h, x2: obs.x, y2: obs.y }
      );
    }

    // 25-degree wide acoustic beam with 7 multi-ray samples for instant detection
    let minDistancePx = 400 * this.PX_PER_CM;
    let closestHit = null;

    const coneHalfAngleRad = 12 * (Math.PI / 180);
    const numSubRays = 7;

    for (let i = 0; i < numSubRays; i++) {
      const t = numSubRays > 1 ? (i / (numSubRays - 1) - 0.5) * 2 : 0;
      const currentRayAngle = rayAngle + t * coneHalfAngleRad;

      const rDirX = Math.cos(currentRayAngle);
      const rDirY = Math.sin(currentRayAngle);

      for (const seg of segments) {
        const hit = this.raySegmentIntersect(sensorX, sensorY, rDirX, rDirY, seg.x1, seg.y1, seg.x2, seg.y2);
        if (hit && hit.dist < minDistancePx) {
          minDistancePx = hit.dist;
          closestHit = { x: hit.x, y: hit.y, dist: hit.dist, angle: currentRayAngle };
        }
      }
    }

    const distanceCm = Math.min(400, Math.max(2, Math.round(minDistancePx / this.PX_PER_CM)));
    this.measuredDistanceCm = distanceCm;

    return {
      sensorX,
      sensorY,
      rayAngle,
      coneHalfAngleRad,
      hit: closestHit,
      distanceCm
    };
  }

  raySegmentIntersect(rx, ry, rdx, rdy, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const det = rdx * dy - rdy * dx;
    if (Math.abs(det) < 1e-6) return null;

    const u = ((x1 - rx) * dy - (y1 - ry) * dx) / det;
    const v = ((x1 - rx) * rdy - (y1 - ry) * rdx) / det;

    if (u >= 0 && v >= 0 && v <= 1) {
      return {
        dist: u,
        x: rx + rdx * u,
        y: ry + rdy * u
      };
    }
    return null;
  }

  updatePhysics(dt, motionState, speedPwm) {
    // Linear speed: responsive acceleration
    const baseLinearSpeed = (speedPwm / 255) * 150;
    const baseTurnSpeed = 2.8;

    let targetSpeed = 0;
    let targetAngular = 0;

    switch (motionState) {
      case 'FORWARD':
        targetSpeed = baseLinearSpeed;
        targetAngular = 0;
        break;
      case 'BACKWARD':
        targetSpeed = -baseLinearSpeed * 0.9;
        targetAngular = 0;
        break;
      case 'LEFT':
        targetSpeed = 0;
        targetAngular = -baseTurnSpeed;
        break;
      case 'RIGHT':
        targetSpeed = 0;
        targetAngular = baseTurnSpeed;
        break;
      case 'STOPPED':
      default:
        targetSpeed = 0;
        targetAngular = 0;
        break;
    }

    // High response inertia
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 18);
    this.angularSpeed += (targetAngular - this.angularSpeed) * Math.min(1, dt * 20);

    // Apply motion
    this.heading += this.angularSpeed * dt;
    const newX = this.x + Math.cos(this.heading) * this.speed * dt;
    const newY = this.y + Math.sin(this.heading) * this.speed * dt;

    // Chassis Collision Check
    if (!this.checkChassisCollision(newX, newY)) {
      this.x = newX;
      this.y = newY;
    } else {
      this.speed = 0;
    }

    // Arena boundary clamp
    const margin = this.length / 2;
    this.x = Math.max(margin, Math.min(this.canvas.width - margin, this.x));
    this.y = Math.max(margin, Math.min(this.canvas.height - margin, this.y));

    // Update wheel animation distances
    const vLeft = this.speed - this.angularSpeed * (this.width / 2);
    const vRight = this.speed + this.angularSpeed * (this.width / 2);
    this.leftWheelDist += vLeft * dt;
    this.rightWheelDist += vRight * dt;

    // Ultrasonic ping wave ripple
    this.pingWaveAnim += dt * 4;
    if (this.pingWaveAnim > 1) this.pingWaveAnim = 0;

    const isMoving = Math.abs(this.speed) > 2 || Math.abs(this.angularSpeed) > 0.1;
    this.audio.setMotorHum(isMoving, speedPwm);
  }

  checkChassisCollision(testx, testy) {
    const radius = this.width * 0.44;
    for (const obs of this.obstacles) {
      const closestX = Math.max(obs.x, Math.min(testx, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(testy, obs.y + obs.h));
      const distance = Math.hypot(testx - closestX, testy - closestY);
      if (distance < radius) {
        return true;
      }
    }
    return false;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderGrid(ctx);
    this.renderObstacles(ctx);

    const rayData = this.measureUltrasonicRay();
    this.renderUltrasonicBeam(ctx, rayData);

    this.renderRobot(ctx);
  }

  renderGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < this.canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, this.canvas.width - 4, this.canvas.height - 4);
    ctx.restore();
  }

  renderObstacles(ctx) {
    ctx.save();
    for (const obs of this.obstacles) {
      const isDragged = this.draggedObstacle === obs;

      ctx.shadowColor = isDragged ? 'rgba(139, 92, 246, 0.6)' : 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = isDragged ? 20 : 8;
      ctx.shadowOffsetY = 4;

      const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
      grad.addColorStop(0, '#2e1065');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.strokeStyle = isDragged ? '#a855f7' : '#6366f1';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.fillRect(obs.x + 2, obs.y + 2, obs.w - 4, 6);

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#c7d2fe';
      ctx.font = '600 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(obs.label, obs.x + obs.w / 2, obs.y + obs.h / 2 + 4);
    }
    ctx.restore();
  }

  renderUltrasonicBeam(ctx, rayData) {
    ctx.save();
    const { sensorX, sensorY, rayAngle, coneHalfAngleRad, hit } = rayData;

    const maxReach = 400 * this.PX_PER_CM;
    const hitDist = hit ? hit.dist : maxReach;

    // Visual color depends on distance zone:
    // < 35cm: Critical RED
    // 35cm - 55cm: Caution AMBER (Early Warning)
    // > 55cm: Safe CYAN
    const grad = ctx.createRadialGradient(sensorX, sensorY, 5, sensorX, sensorY, hitDist);
    if (this.measuredDistanceCm <= 35) {
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0.04)');
    } else if (this.measuredDistanceCm <= 55) {
      grad.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0.03)');
    } else {
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.02)');
    }

    ctx.beginPath();
    ctx.moveTo(sensorX, sensorY);
    ctx.arc(sensorX, sensorY, hitDist, rayAngle - coneHalfAngleRad, rayAngle + coneHalfAngleRad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Central ray beam
    ctx.beginPath();
    ctx.moveTo(sensorX, sensorY);
    ctx.lineTo(
      sensorX + Math.cos(rayAngle) * hitDist,
      sensorY + Math.sin(rayAngle) * hitDist
    );
    ctx.strokeStyle = this.measuredDistanceCm <= 35 ? 'rgba(239, 68, 68, 0.9)' :
                     (this.measuredDistanceCm <= 55 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(56, 189, 248, 0.8)');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated ultrasonic pulse ripples
    for (let i = 0; i < 3; i++) {
      const wavePhase = (this.pingWaveAnim + i / 3) % 1;
      const rippleR = wavePhase * hitDist;
      ctx.beginPath();
      ctx.arc(sensorX, sensorY, rippleR, rayAngle - coneHalfAngleRad, rayAngle + coneHalfAngleRad);
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 * (1 - wavePhase)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Impact marker
    if (hit) {
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = this.measuredDistanceCm <= 35 ? '#ef4444' :
                     (this.measuredDistanceCm <= 55 ? '#f59e0b' : '#06b6d4');
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.fill();
    }
    ctx.restore();
  }

  renderRobot(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    const halfW = this.width / 2;
    const halfL = this.length / 2;

    // 1. Four 4WD Wheels (Yellow rims with rotating treads)
    const wheelL = 26 * (this.PX_PER_CM / 2);
    const wheelW = 10 * (this.PX_PER_CM / 2);
    const wheelOffsets = [
      { x: halfL - 18, y: -halfW - 3, dist: this.leftWheelDist },
      { x: -halfL + 18, y: -halfW - 3, dist: this.leftWheelDist },
      { x: halfL - 18, y: halfW + 3, dist: this.rightWheelDist },
      { x: -halfL + 18, y: halfW + 3, dist: this.rightWheelDist }
    ];

    for (const w of wheelOffsets) {
      ctx.save();
      ctx.translate(w.x, w.y);

      ctx.fillStyle = '#111827';
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#eab308';
      ctx.fillRect(-wheelL / 2 + 3, -wheelW / 2 + 2, wheelL - 6, wheelW - 4);

      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 1;
      const treadStep = 5;
      const offset = (w.dist % treadStep);
      for (let tx = -wheelL / 2 + 4 + offset; tx < wheelL / 2 - 4; tx += treadStep) {
        ctx.beginPath();
        ctx.moveTo(tx, -wheelW / 2 + 2);
        ctx.lineTo(tx, wheelW / 2 - 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Main Chassis (Blue acrylic with neon edge)
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(2, 132, 199, 0.4)';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, this.length, this.width, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Direction arrow
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(halfL - 6, 0);
    ctx.lineTo(halfL - 14, -8);
    ctx.lineTo(halfL - 14, 8);
    ctx.closePath();
    ctx.fill();

    // 3. Arduino Uno Module
    ctx.fillStyle = '#0891b2';
    ctx.strokeStyle = '#155e75';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-halfL + 12, -halfW + 8, 38, halfW - 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-halfL + 8, -halfW + 12, 8, 12); // USB port
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-halfL + 22, -halfW + 14, 20, 10); // MCU IC

    // 4. L298N Motor Driver Module
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-halfL + 12, 4, 38, halfW - 12);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-halfL + 20, 10, 22, 18); // Heatsink

    // 5. SG90 Micro Servo & HC-SR04 Ultrasonic Eyes
    const servoMountX = halfL - 18;
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(servoMountX - 6, -6, 12, 12);

    ctx.save();
    ctx.translate(servoMountX, 0);
    const servoRotRad = (90 - this.servoAngleDeg) * (Math.PI / 180);
    ctx.rotate(servoRotRad);

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(-3, -12, 6, 24, 2);
    ctx.fill();

    // HC-SR04 PCB
    ctx.fillStyle = '#0369a1';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.fillRect(4, -18, 8, 36);

    // Dual Ultrasonic Transducers (Metal Cylinders)
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    ctx.arc(10, -9, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(10, 9, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(10, -9, 3.5, 0, Math.PI * 2);
    ctx.arc(10, 9, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.restore();
  }
}
