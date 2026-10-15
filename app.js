/* ==============================================================================
   SMARTDRIVE ROBOTICS SIMULATOR - APPLICATION CONTROLLER (app.js)
   ============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Simulator & Firmware Twin
  const sim = new RobotSimulator('arenaCanvas');

  // Serial Monitor Logger
  const serialOutput = document.getElementById('serialOutput');
  const logToSerial = (text, type = 'normal') => {
    const line = document.createElement('div');
    line.className = `serial-line ${type}`;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(Math.floor(now.getMilliseconds() / 100))}`;

    line.innerHTML = `<span class="time">[${timeStr}]</span> ${escapeHtml(text)}`;
    serialOutput.appendChild(line);

    // Limit log lines to 200
    while (serialOutput.children.length > 200) {
      serialOutput.removeChild(serialOutput.firstChild);
    }
    serialOutput.scrollTop = serialOutput.scrollHeight;
  };

  // Pin Bus State updater
  const onPinChange = (pinElementId, valueStr, isActive) => {
    const el = document.getElementById(pinElementId);
    if (!el) return;
    const valSpan = el.querySelector('.pin-val');
    if (valSpan) valSpan.textContent = valueStr;

    if (isActive) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  };

  const firmware = new ArduinoFirmwareTwin(sim, logToSerial, onPinChange);

  // 2. Tab Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
      sim.audio.playClick();
    });
  });

  // 3. Bluetooth Connection Simulation
  const btnConnectBT = document.getElementById('btnConnectBT');
  const btStatusBadge = document.getElementById('btStatusBadge');
  const btStatusText = document.getElementById('btStatusText');
  const btConnectBtnText = document.getElementById('btConnectBtnText');

  let btConnected = true; // Auto-connect in simulator by default for instant gratification
  firmware.setBluetoothConnection(true);
  updateBTUI(true);

  btnConnectBT.addEventListener('click', () => {
    btConnected = !btConnected;
    firmware.setBluetoothConnection(btConnected);
    updateBTUI(btConnected);
    sim.audio.playClick();
  });

  function updateBTUI(connected) {
    if (connected) {
      btStatusBadge.className = 'badge connection-badge connected';
      btStatusText.textContent = 'Bluetooth: Paired (HC-05)';
      btConnectBtnText.textContent = 'Disconnect';
    } else {
      btStatusBadge.className = 'badge connection-badge disconnected';
      btStatusText.textContent = 'Bluetooth: Disconnected';
      btConnectBtnText.textContent = 'Simulate Connect';
    }
  }

  // 4. Mode Switching (Manual vs Autonomous)
  const btnModeManual = document.getElementById('btnModeManual');
  const btnModeAuto = document.getElementById('btnModeAuto');
  const modeBadge = document.getElementById('modeBadge');
  const modeText = document.getElementById('modeText');

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
      modeBadge.className = 'badge mode-badge auto';
      modeText.textContent = 'AUTONOMOUS (A)';
    } else {
      btnModeManual.classList.add('active');
      btnModeAuto.classList.remove('active');
      modeBadge.className = 'badge mode-badge manual';
      modeText.textContent = 'MANUAL MODE (M)';
    }
  }

  // 5. Directional D-Pad Gamepad Controls
  const dpadButtons = document.querySelectorAll('.dpad-btn');
  dpadButtons.forEach(btn => {
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
      // For movement keys, auto-stop on release if in manual mode
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

  // Emergency Stop Buttons
  const btnEmergencyStop = document.getElementById('btnEmergencyStop');
  btnEmergencyStop.addEventListener('click', () => {
    firmware.processCommand('E');
    updateModeUI('MANUAL');
  });

  // 6. Motor Speed Slider & Presets
  const motorSpeedSlider = document.getElementById('motorSpeedSlider');
  const speedDisplayVal = document.getElementById('speedDisplayVal');
  const presetBtns = document.querySelectorAll('.preset-btn');

  motorSpeedSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    speedDisplayVal.textContent = val;
    firmware.setSpeed(val);
  });

  presetBtns.forEach(pbtn => {
    pbtn.addEventListener('click', () => {
      const spd = parseInt(pbtn.getAttribute('data-speed'), 10);
      motorSpeedSlider.value = spd;
      speedDisplayVal.textContent = spd;
      firmware.setSpeed(spd);
      sim.audio.playClick();
    });
  });

  // 7. Keyboard Shortcuts (WASD / Arrows)
  const pressedKeys = new Set();
  window.addEventListener('keydown', (e) => {
    // If typing inside serial input box, do not trigger car movements!
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();
    if (pressedKeys.has(key)) return; // Prevent key repeat oscillation
    pressedKeys.add(key);

    sim.audio.init();

    if (key === 'W' || key === 'ARROWUP') {
      firmware.processCommand('F');
      highlightDpad('btnCmdForward', true);
    } else if (key === 'S' && !e.ctrlKey) {
      firmware.processCommand('B');
      highlightDpad('btnCmdBackward', true);
    } else if (key === 'A') {
      firmware.processCommand('L');
      highlightDpad('btnCmdLeft', true);
    } else if (key === 'D') {
      firmware.processCommand('R');
      highlightDpad('btnCmdRight', true);
    } else if (key === ' ') {
      firmware.processCommand('S');
      highlightDpad('btnCmdStop', true);
    } else if (key === 'E') {
      firmware.processCommand('E');
      updateModeUI('MANUAL');
    } else if (key === 'M') {
      firmware.processCommand('M');
      updateModeUI('MANUAL');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toUpperCase();
    pressedKeys.delete(key);

    if (key === 'W' || key === 'ARROWUP') {
      highlightDpad('btnCmdForward', false);
      firmware.processCommand('S');
    } else if (key === 'S') {
      highlightDpad('btnCmdBackward', false);
      firmware.processCommand('S');
    } else if (key === 'A') {
      highlightDpad('btnCmdLeft', false);
      firmware.processCommand('S');
    } else if (key === 'D') {
      highlightDpad('btnCmdRight', false);
      firmware.processCommand('S');
    } else if (key === ' ') {
      highlightDpad('btnCmdStop', false);
    }
  });

  function highlightDpad(id, isPressed) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isPressed) el.classList.add('pressed');
    else el.classList.remove('pressed');
  }

  // 8. Arena Controls (Obstacles, Reset, Audio)
  document.getElementById('btnSpawnObstacle').addEventListener('click', () => {
    sim.obstacles.push({
      x: 300 + Math.random() * 200,
      y: 150 + Math.random() * 200,
      w: 80,
      h: 60,
      label: `Box ${sim.obstacles.length + 1}`
    });
    sim.audio.playClick();
  });

  document.getElementById('btnRandomizeMaze').addEventListener('click', () => {
    sim.randomizeObstacles();
    sim.audio.playClick();
  });

  document.getElementById('btnClearObstacles').addEventListener('click', () => {
    sim.clearObstacles();
    sim.audio.playClick();
  });

  document.getElementById('btnResetRobot').addEventListener('click', () => {
    sim.resetRobot();
    firmware.stopMotors();
    sim.audio.playClick();
  });

  const chkSound = document.getElementById('chkSound');
  chkSound.addEventListener('change', (e) => {
    sim.audio.enabled = e.target.checked;
    if (!sim.audio.enabled) {
      sim.audio.setMotorHum(false);
    }
  });

  // 9. Serial Monitor Input Box
  const serialInputBox = document.getElementById('serialInputBox');
  const btnSendSerial = document.getElementById('btnSendSerial');
  const btnClearSerial = document.getElementById('btnClearSerial');

  const sendSerialMessage = () => {
    const val = serialInputBox.value.trim();
    if (!val) return;
    for (const char of val) {
      firmware.processCommand(char);
    }
    serialInputBox.value = '';
  };

  btnSendSerial.addEventListener('click', sendSerialMessage);
  serialInputBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendSerialMessage();
    }
  });

  btnClearSerial.addEventListener('click', () => {
    serialOutput.innerHTML = '';
  });

  // 10. Copy Arduino Code Button
  const btnCopyCode = document.getElementById('btnCopyCode');
  const arduinoCodeDisplay = document.getElementById('arduinoCodeDisplay');

  // Populate code display from embedded source or fetch
  if (window.SMARTDRIVE_SOURCE_CODE) {
    arduinoCodeDisplay.textContent = window.SMARTDRIVE_SOURCE_CODE;
  } else {
    fetch('SMARTDRIVE.ino')
      .then(r => r.text())
      .then(codeText => {
        arduinoCodeDisplay.textContent = codeText;
      })
      .catch(() => {});
  }

  btnCopyCode.addEventListener('click', () => {
    const code = arduinoCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
      const orig = btnCopyCode.textContent;
      btnCopyCode.textContent = '✅ Copied to Clipboard!';
      btnCopyCode.style.background = '#10b981';
      setTimeout(() => {
        btnCopyCode.textContent = orig;
        btnCopyCode.style.background = '';
      }, 2000);
    });
  });

  // 11. Canvas HUD & Telemetry Sync
  const hudDistance = document.getElementById('hudDistance');
  const hudServoAngle = document.getElementById('hudServoAngle');
  const hudMotionState = document.getElementById('hudMotionState');
  const hudSpeed = document.getElementById('hudSpeed');
  const loopHz = document.getElementById('loopHz');

  // 12. Main 60 FPS Animation & Firmware Loop
  let lastTime = performance.now();
  let frameCount = 0;
  let lastFpsTime = performance.now();

  function mainLoop(timestamp) {
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
    lastTime = timestamp;

    // Run firmware state machine
    firmware.tick(dt);

    // Render physics & graphics
    sim.render();

    // Update HUD values
    hudDistance.textContent = sim.measuredDistanceCm >= 400 ? '>400 cm' : `${sim.measuredDistanceCm} cm`;
    if (sim.measuredDistanceCm <= 15) {
      hudDistance.style.color = '#ef4444';
    } else if (sim.measuredDistanceCm <= 30) {
      hudDistance.style.color = '#f59e0b';
    } else {
      hudDistance.style.color = '#06b6d4';
    }

    const angleDeg = Math.round(sim.servoAngleDeg);
    let angleLabel = 'Center';
    if (angleDeg > 110) angleLabel = 'Looking Left';
    else if (angleDeg < 70) angleLabel = 'Looking Right';
    hudServoAngle.textContent = `${angleDeg}° (${angleLabel})`;

    hudMotionState.textContent = firmware.currentMotion;
    hudSpeed.textContent = `${firmware.currentSpeed} / 255`;

    // Keep mode UI in sync if changed internally by firmware
    if (firmware.currentMode === 'AUTONOMOUS' && !btnModeAuto.classList.contains('active')) {
      updateModeUI('AUTONOMOUS');
    } else if (firmware.currentMode === 'MANUAL' && !btnModeManual.classList.contains('active')) {
      updateModeUI('MANUAL');
    }

    // FPS counter
    frameCount++;
    if (timestamp - lastFpsTime >= 1000) {
      loopHz.textContent = `Simulation Loop: ${frameCount} FPS`;
      frameCount = 0;
      lastFpsTime = timestamp;
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
