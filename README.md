# SMARTDRIVE 4WD Robot Car — Engineering Manual & Guide

> **Arduino Uno R3 • HC-05 Bluetooth • L298N Driver • HC-SR04 Ultrasonic • SG90 Servo**

---

## 🚀 Interactive Virtual Digital Twin & Simulator

A complete working prototype and digital twin simulator has been developed and is running locally:
- **Local Web Simulator URL:** [http://localhost:8085](http://localhost:8085)
- **Local Project Path:** `C:\Users\ASUS\.gemini\antigravity-ide\scratch\smartdrive-robot`
- **Source Files:**
  - `SMARTDRIVE.ino` — Arduino C++ firmware sketch
  - `index.html` — Simulator UI, Circuit schematic, and Testing console
  - `simulator.js` — 2D physics engine, raycasting, and Web Audio synthesizer
  - `firmware_sim.js` — Exact digital twin of the Arduino state machine
  - `app.js` — Telemetry handler, virtual gamepad, and serial console

---

## 📌 Pin-by-Pin Wiring Matrix

| Module | Pin | Arduino Uno Pin | Recommended Color | Engineering Notes |
| :--- | :--- | :--- | :--- | :--- |
| **L298N Motor Driver** | ENA | **D5** (PWM) | Blue | Remove black jumper cap to enable PWM speed |
| | IN1 | **D4** (Digital) | Yellow | Left Motors forward control |
| | IN2 | **D7** (Digital) | Orange | Left Motors reverse control |
| | IN3 | **D8** (Digital) | Green | Right Motors forward control |
| | IN4 | **D12** (Digital) | Purple | Right Motors reverse control |
| | ENB | **D6** (PWM) | White | Remove black jumper cap to enable PWM speed |
| | +12V Terminal | **Battery (+)** | Red (18-20 AWG) | 7.4V (2x 18650) or 11.1V (3S LiPo) through power switch |
| | GND Terminal | **Battery (-) & Arduino GND** | Black (18-20 AWG) | **CRITICAL:** Common ground tie point |
| | +5V Terminal | **Arduino 5V or Leave Open** | Red | See 5V regulator jumper rules below |
| | OUT1 & OUT2 | **Left 2 Motors** | Twisted Pair | Connect front-left and rear-left in parallel |
| | OUT3 & OUT4 | **Right 2 Motors** | Twisted Pair | Connect front-right and rear-right in parallel |
| **HC-05 Bluetooth** | VCC | **Arduino 5V** | Red | Module carrier has 3.3V LDO for core power |
| | GND | **Arduino GND** | Black | Ground reference |
| | TXD | **Arduino D2** (Software RX) | Green | 3.3V logic level safely accepted by Arduino 5V input |
| | RXD | **Via Voltage Divider to D3** | Orange | **REQUIRED:** 1kΩ from D3, 2kΩ to GND (reduces 5V to 3.33V) |
| **HC-SR04 Ultrasonic** | VCC | **Arduino 5V** | Red | Requires steady 5V for acoustic precision |
| | GND | **Arduino GND** | Black | Ground reference |
| | TRIG | **Arduino A0** (Digital Out) | Yellow | Analog A0 used as digital trigger output |
| | ECHO | **Arduino A1** (Digital In) | Cyan | Analog A1 used as digital echo input |
| **SG90 Servo** | Signal (Orange) | **Arduino D9** (PWM) | Orange | 50Hz PWM signal from `Servo.h` |
| | VCC (Red) | **5V Power Rail** | Red | Add 100µF capacitor across 5V/GND near servo |
| | GND (Brown) | **Arduino GND** | Black | Common ground |

---

## ⚡ HC-05 3.3V Voltage Divider Schematic

```
Arduino D3 (5V TX) ───[ 1 kΩ Resistor ]───┬───> HC-05 RXD Pin (Safe 3.3V)
                                          │
                                  [ 2 kΩ Resistor ]
                                          │
                                         GND
```
$$\text{Output Voltage} = 5.0\text{V} \times \frac{2000\,\Omega}{1000\,\Omega + 2000\,\Omega} = 3.33\text{V}$$

---

## 🛠️ Required Libraries & Installation

All required libraries are **built into the Arduino IDE core**:
1. `<SoftwareSerial.h>` — Included by default with the AVR board package.
2. `<Servo.h>` — Included by default with the Arduino IDE.

**No third-party `.zip` or external library installation is necessary!**

---

## 🧪 4-Stage Commissioning & Bench Testing Plan

### Stage 1: Motor Polarity & Direction (Wheels Off Ground)
- Prop the robot on a mug or stand so the 4 wheels spin freely in the air.
- Upload `SMARTDRIVE.ino` and open the Serial Monitor at **9600 baud**.
- Type `F` and hit Enter:
  - Both left wheels and right wheels should rotate **forward**.
  - If Left spins backward: Swap wires in L298N OUT1 and OUT2 (or swap D4 and D7 in code).
  - If Right spins backward: Swap wires in L298N OUT3 and OUT4 (or swap D8 and D12 in code).

### Stage 2: Bluetooth Pairing & Failsafe Watchdog Test
- Power on car. The HC-05 LED will blink rapidly (2 times per second).
- Open phone Bluetooth settings, scan and pair with `HC-05` (PIN: `1234` or `0000`).
- Install **Serial Bluetooth Terminal** (Android) or **Arduino Bluetooth Controller**.
- Send `F` — car wheels spin forward.
- **Watchdog Failsafe Test:** While wheels are spinning, turn off your phone's Bluetooth. Within **1.2 seconds**, the Arduino watchdog timer will trip and automatically stop the motors!

### Stage 3: HC-SR04 & SG90 Sensor Calibration
- Keep the car stationary on the bench.
- Observe Serial Monitor: it outputs real-time distance telemetry every 1 second.
- Hold a flat book 10 cm, 20 cm, and 30 cm away and verify the distance matches within ±1 cm.
- Ensure the servo horn is mounted so that `90°` points squarely ahead.

### Stage 4: Floor Obstacle Avoidance Run
- Place the car in a clear area surrounded by cardboard boxes.
- Send `A` via Bluetooth to engage Autonomous Mode.
- Observe:
  1. Car cruises forward.
  2. Front distance drops below 30 cm $\rightarrow$ Car halts.
  3. Reverses for 280ms to gain turning clearance.
  4. Servo sweeps Left (150°), samples distance.
  5. Servo sweeps Right (30°), samples distance.
  6. Compares both sides $\rightarrow$ turns toward the open path $\rightarrow$ continues forward cruise!

---

## ⚠️ Pre-Power Verification & Engineering Safety Rules

1. **Common Ground Rule:** Verify that the battery negative terminal, L298N GND terminal, and Arduino GND pin are electrically bonded together. Without common ground, digital signals cannot resolve voltage differences.
2. **Never Power Motors from Arduino 5V Pin:** The onboard 5V regulator on the Arduino Uno is rated for ~500mA. Four stalled gearmotors can pull over 3.5A. Powering motors through the Arduino 5V pin will permanently fry the board's onboard voltage regulator.
3. **L298N 5V Regulator Jumper:**
   - If using **7.4V to 12V** battery: Keep the jumper ON.
   - If using **>12V** battery: Remove the jumper.
4. **Inductive Noise (EMI) Suppression:** Solder a `0.1µF (104)` ceramic capacitor across the solder lugs of each DC motor to eliminate high-frequency spark noise that can reset the ATmega328P.
5. **Real-World Limitations Disclaimer:** This robot is designed as an educational demonstrator. Ultrasonic sensors have beam dispersion and cannot detect sound-absorbing cloth, thin obstacles, or surfaces angled steeper than 45°. This architecture must never be used for real-road passenger transport or safety-critical industrial automation.
