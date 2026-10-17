/* ==============================================================================
   SMARTDRIVE ROBOTICS SIMULATOR - APPLICATION CONTROLLER (app.js)
   ============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const sim = new RobotSimulator('arenaCanvas');

  // Serial Monitor Logger
  const logStream = document.getElementById('logStream');
  const logToSerial = (text, type = 'normal') => {
    if (!logStream) return;
    const line = document.createElement('div');
    line.className = `log-line ${type}`;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(Math.floor(now.getMilliseconds() / 100))}`;

    line.innerHTML = `<span class="t">[${timeStr}]</span> ${escapeHtml(text)}`;
    logStream.appendChild(line);

    while (logStream.children.length > 80) {
      logStream.removeChild(logStream.firstChild);
    }
    logStream.scrollTop = logStream.scrollHeight;
  };

  const firmware = new ArduinoFirmwareTwin(sim, logToSerial, null);

  // 1. Modals (Wiring & Code)
  const modalWiring = document.getElementById('modalWiring');
  const modalCode = document.getElementById('modalCode');
  const btnOpenWiring = document.getElementById('btnOpenWiring');
  const btnOpenCode = document.getElementById('btnOpenCode');
  const btnCloseWiring = document.getElementById('btnCloseWiring');
  const btnCloseCode = document.getElementById('btnCloseCode');
  const codeViewer = document.getElementById('codeViewer');
  const btnCopyCode = document.getElementById('btnCopyCode');

  if (window.SMARTDRIVE_SOURCE_CODE && codeViewer) {
    codeViewer.textContent = window.SMARTDRIVE_SOURCE_CODE;
  }

  btnOpenWiring.addEventListener('click', () => {
    modalWiring.classList.add('open');
    sim.audio.playClick();
  });
  btnCloseWiring.addEventListener('click', () => modalWiring.classList.remove('open'));

  btnOpenCode.addEventListener('click', () => {
    modalCode.classList.add('open');
    sim.audio.playClick();
  });
  btnCloseCode.addEventListener('click', () => modalCode.classList.remove('open'));

  [modalWiring, modalCode].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });

  btnCopyCode.addEventListener('click', () => {
    const code = codeViewer.textContent;
    navigator.clipboard.writeText(code).then(() => {
      const orig = btnCopyCode.textContent;
      btnCopyCode.textContent = '✅ Copied!';
      setTimeout(() => { btnCopyCode.textContent = orig; }, 1800);
    });
  });

  // 2. Mode Toggles (Manual vs Autonomous)
  const btnModeManual = document.getElementById('btnModeManual');
  const btnModeAuto = document.getElementById('btnModeAuto');

  btnModeManual.addEventListener('click', () => {
    firmware.processCommand('M');
    updateModeUI('MANUAL');
    sim.audio.playClick();
  });

  btnModeAuto.addEventListener('click', () => {
    firmware.processCommand('A');
    updateModeUI('AUTONOMOUS');
    sim.audio.playClick();
  });

  function updateModeUI(mode) {
    if (mode === 'AUTONOMOUS') {
      btnModeAuto.classList.add('active');
      btnModeManual.classList.remove('active');
    } else {
      btnModeManual.classList.add('active');
      btnModeAuto.classList.remove('active');
    }
  }

  // 3. Tactile Gamepad Controls
  const padButtons = document.querySelectorAll('.pad-btn');
  padButtons.forEach(btn => {
    const cmd = btn.getAttribute('data-cmd');

    const handlePress = (e) => {
      e.preventDefault();
      sim.audio.init();
      sim.audio.playClick();
      btn.classList.add('pressed');
      firmware.processCommand(cmd);
    };

    const handleRelease = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      if (cmd === 'F' || cmd === 'B' || cmd === 'L' || cmd === 'R') {
        firmware.processCommand('S');
      }
    };

    btn.addEventListener('mousedown', handlePress);
    btn.addEventListener('mouseup', handleRelease);
    btn.addEventListener('mouseleave', handleRelease);

    btn.addEventListener('touchstart', handlePress, { passive: false });
    btn.addEventListener('touchend', handleRelease, { passive: false });
  });

  // Emergency Stop
  document.getElementById('btnEmergencyStop').addEventListener('click', () => {
    firmware.processCommand('E');
    updateModeUI('MANUAL');
  });

  // 4. Speed Slider & Presets
  const speedSlider = document.getElementById('speedSlider');
  const speedNum = document.getElementById('speedNum');
  const presetChips = document.querySelectorAll('.preset-chip');

  speedSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    speedNum.textContent = val;
    firmware.setSpeed(val);
    presetChips.forEach(c => c.classList.remove('active'));
  });

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const spd = parseInt(chip.getAttribute('data-speed'), 10);
      speedSlider.value = spd;
      speedNum.textContent = spd;
      firmware.setSpeed(spd);
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      sim.audio.playClick();
    });
  });

  // 5. Arena Tools
  document.getElementById('btnAddBox').addEventListener('click', () => {
    sim.addObstacleBox();
    sim.audio.playClick();
  });

  document.getElementById('btnRandomMaze').addEventListener('click', () => {
    sim.randomizeObstacles();
    sim.audio.playClick();
  });

  document.getElementById('btnClearObs').addEventListener('click', () => {
    sim.clearObstacles();
    sim.audio.playClick();
  });

  document.getElementById('btnResetCar').addEventListener('click', () => {
    sim.resetRobot();
    firmware.stopMotors();
    sim.audio.playClick();
  });

  const chkSound = document.getElementById('chkSound');
  chkSound.addEventListener('change', (e) => {
    sim.audio.enabled = e.target.checked;
    if (!sim.audio.enabled) sim.audio.setMotorHum(false);
  });

  document.getElementById('btnClearLog').addEventListener('click', () => {
    logStream.innerHTML = '';
  });

  // 6. Keyboard Shortcuts
  const pressedKeys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();
    if (pressedKeys.has(key)) return;
    pressedKeys.add(key);

    sim.audio.init();

    if (key === 'W' || key === 'ARROWUP') {
      firmware.processCommand('F');
      highlightPad('padF', true);
    } else if (key === 'S' && !e.ctrlKey) {
      firmware.processCommand('B');
      highlightPad('padB', true);
    } else if (key === 'A') {
      firmware.processCommand('L');
      highlightPad('padL', true);
    } else if (key === 'D') {
      firmware.processCommand('R');
      highlightPad('padR', true);
    } else if (key === ' ') {
      firmware.processCommand('S');
      highlightPad('padS', true);
    } else if (key === 'E') {
      firmware.processCommand('E');
      updateModeUI('MANUAL');
    } else if (key === 'M') {
      firmware.processCommand('M');
      updateModeUI('MANUAL');
    } else if (key === 'A' && e.shiftKey) {
      firmware.processCommand('A');
      updateModeUI('AUTONOMOUS');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toUpperCase();
    pressedKeys.delete(key);

    if (key === 'W' || key === 'ARROWUP') {
      highlightPad('padF', false);
      firmware.processCommand('S');
    } else if (key === 'S') {
      highlightPad('padB', false);
      firmware.processCommand('S');
    } else if (key === 'A') {
      highlightPad('padL', false);
      firmware.processCommand('S');
    } else if (key === 'D') {
      highlightPad('padR', false);
      firmware.processCommand('S');
    } else if (key === ' ') {
      highlightPad('padS', false);
    }
  });

  function highlightPad(id, isPressed) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isPressed) el.classList.add('pressed');
    else el.classList.remove('pressed');
  }

  // 7. HUD & Radar Pill Elements
  const hudDistance = document.getElementById('hudDistance');
  const hudServoAngle = document.getElementById('hudServoAngle');
  const hudMotion = document.getElementById('hudMotion');
  const hudPwm = document.getElementById('hudPwm');
  const radarPill = document.getElementById('radarPill');
  const radarPillText = document.getElementById('radarPillText');

  // 8. 60 FPS Animation & Simulation Loop
  let lastTime = performance.now();

  function mainLoop(timestamp) {
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
    lastTime = timestamp;

    firmware.tick(dt);
    sim.render();

    // HUD distance & radar status pill
    const dist = sim.measuredDistanceCm;
    hudDistance.textContent = dist >= 400 ? '>400 cm' : `${dist} cm`;

    if (dist <= 28) {
      hudDistance.style.color = '#ef4444';
      radarPill.className = 'status-pill danger';
      radarPillText.textContent = `CRITICAL STOP (${dist}cm)`;
    } else if (dist <= 45) {
      hudDistance.style.color = '#f59e0b';
      radarPill.className = 'status-pill warning';
      radarPillText.textContent = `CAUTION SLOWING (${dist}cm)`;
    } else {
      hudDistance.style.color = '#06b6d4';
      radarPill.className = 'status-pill safe';
      radarPillText.textContent = `RADAR CLEAR (${dist >= 400 ? '>400' : dist}cm)`;
    }

    const angleDeg = Math.round(sim.servoAngleDeg);
    let angleLabel = 'Center';
    if (angleDeg > 110) angleLabel = 'Left';
    else if (angleDeg < 70) angleLabel = 'Right';
    hudServoAngle.textContent = `${angleDeg}° ${angleLabel}`;

    hudMotion.textContent = firmware.currentMotion;
    hudPwm.textContent = `${firmware.currentSpeed} / 255`;

    if (firmware.currentMode === 'AUTONOMOUS' && !btnModeAuto.classList.contains('active')) {
      updateModeUI('AUTONOMOUS');
    } else if (firmware.currentMode === 'MANUAL' && !btnModeManual.classList.contains('active')) {
      updateModeUI('MANUAL');
    }

    requestAnimationFrame(mainLoop);
  }

  requestAnimationFrame(mainLoop);

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
