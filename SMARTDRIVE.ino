/*
  ==============================================================================
  PROJECT: SMARTDRIVE - 4WD Bluetooth & Autonomous Obstacle-Avoiding Robot
  TARGET MCU: Arduino Uno R3 (ATmega328P)
  AUTHOR: Experienced Arduino Robotics Engineer & C/C++ Tutor
  VERSION: 2.1.0 - Production Release with Failsafe Watchdog & Active Braking
  ==============================================================================

  HARDWARE PIN CONNECTIONS:
  ------------------------------------------------------------------------------
  L298N Motor Driver:
    - ENA (Left Motor Speed PWM)   -> Digital Pin 5
    - IN1 (Left Motor Dir A)       -> Digital Pin 4
    - IN2 (Left Motor Dir B)       -> Digital Pin 7
    - IN3 (Right Motor Dir A)      -> Digital Pin 8
    - IN4 (Right Motor Dir B)      -> Digital Pin 12
    - ENB (Right Motor Speed PWM)  -> Digital Pin 6

  HC-05 Bluetooth Module:
    - VCC                          -> 5V (from Arduino 5V pin or 5V rail)
    - GND                          -> GND (Common Ground)
    - TXD                          -> Digital Pin 2 (Arduino Software RX)
    - RXD                          -> Digital Pin 3 (Arduino Software TX)
                                      *IMPORTANT: Use Voltage Divider (5V -> 3.3V)
                                      e.g., Arduino D3 -> 1kΩ -> HC-05 RXD -> 2kΩ -> GND

  HC-SR04 Ultrasonic Distance Sensor:
    - VCC                          -> 5V
    - GND                          -> GND
    - TRIG                         -> Analog Pin A0 (used as Digital Output)
    - ECHO                         -> Analog Pin A1 (used as Digital Input)

  SG90 Micro Servo Motor:
    - Brown / Black                -> GND
    - Red                          -> 5V (Servo power)
    - Orange / Yellow (Signal)     -> Digital Pin 9 (PWM)
  ==============================================================================
*/

#include <SoftwareSerial.h>
#include <Servo.h>

// ==============================================================================
// 1. PIN DEFINITIONS
// ==============================================================================
// L298N Motor Driver Pins
const uint8_t PIN_ENA  = 5;   // PWM speed control: Left Motors
const uint8_t PIN_IN1  = 4;   // Direction: Left Motors forward/reverse
const uint8_t PIN_IN2  = 7;   // Direction: Left Motors forward/reverse
const uint8_t PIN_IN3  = 8;   // Direction: Right Motors forward/reverse
const uint8_t PIN_IN4  = 12;  // Direction: Right Motors forward/reverse
const uint8_t PIN_ENB  = 6;   // PWM speed control: Right Motors

// HC-05 Bluetooth Pins (SoftwareSerial)
const uint8_t PIN_BT_RX = 2;  // Arduino receives from HC-05 TX
const uint8_t PIN_BT_TX = 3;  // Arduino sends to HC-05 RX (via voltage divider)

// HC-SR04 Ultrasonic Distance Sensor Pins
const uint8_t PIN_TRIG  = A0; // Trigger pin (pulse transmitter)
const uint8_t PIN_ECHO  = A1; // Echo pin (pulse receiver)

// SG90 Servo Signal Pin
const uint8_t PIN_SERVO = 9;  // Servo control PWM pin

// Built-in Status LED
const uint8_t PIN_LED_STATUS = 13;

// ==============================================================================
// 2. CONFIGURATION PARAMETERS & CONSTANTS
// ==============================================================================
// Operating Speeds (0 to 255 PWM)
const uint8_t DEFAULT_SPEED   = 180;  // Balanced cruise speed
const uint8_t TURN_SPEED      = 200;  // Slightly higher torque for skid turns
const uint8_t MIN_SPEED       = 100;  // Minimum stall prevention threshold
const uint8_t MAX_SPEED       = 255;  // 100% full battery voltage

// Obstacle Avoidance Thresholds (in centimeters)
const int DISTANCE_SAFE_THRESHOLD = 45; // Early obstacle warning & slow down (cm)
const int DISTANCE_CRITICAL_STOP  = 25; // Complete brake threshold (cm)
const int SENSOR_TIMEOUT_MICROS   = 25000; // ~4 meters max range timeout

// Servo Calibration Angles (in degrees)
const int SERVO_CENTER = 90;   // Looking straight ahead
const int SERVO_LEFT   = 150;  // Looking towards the left
const int SERVO_RIGHT  = 30;   // Looking towards the right
const int SERVO_SWEEP_DELAY_MS = 200; // Snappy delay for servo to reach mechanical position

// Bluetooth Watchdog / Connection Safety Timeout
const unsigned long BT_HEARTBEAT_TIMEOUT_MS = 1200; // Stop car if no command for 1.2s

// Robot Operating Modes
enum DriveMode {
  MODE_MANUAL,     // Controlled via Bluetooth app ('M')
  MODE_AUTONOMOUS  // Self-navigating obstacle avoidance ('A')
};

// Robot Motion States
enum MotionState {
  STATE_STOPPED,
  STATE_FORWARD,
  STATE_BACKWARD,
  STATE_LEFT,
  STATE_RIGHT
};

// ==============================================================================
// 3. GLOBAL OBJECTS & VARIABLES
// ==============================================================================
SoftwareSerial btSerial(PIN_BT_RX, PIN_BT_TX); // RX, TX
Servo scannerServo;

DriveMode currentMode = MODE_MANUAL;
MotionState currentMotion = STATE_STOPPED;
uint8_t currentSpeed = DEFAULT_SPEED;

unsigned long lastCommandTime = 0;   // Watchdog timestamp for Bluetooth commands
unsigned long lastTelemetryTime = 0; // Telemetry print interval
unsigned long lastScanTime = 0;

// Autonomous State Machine States
enum AutoSubState {
  AUTO_CRUISE,
  AUTO_DETECTED_STOP,
  AUTO_BACKUP,
  AUTO_SCAN_SURROUNDINGS,
  AUTO_DECIDE_AND_TURN
};
AutoSubState autoState = AUTO_CRUISE;

// ==============================================================================
// 4. FUNCTION PROTOTYPES
// ==============================================================================
void setupPins();
void initPeripherals();
void handleBluetoothInput();
void executeAutonomousLogic();
void checkWatchdogTimeout();
void printTelemetry();

// Motor Actuation Functions
void setMotorSpeed(uint8_t leftSpeed, uint8_t rightSpeed);
void moveForward();
void moveBackward();
void turnLeft();
void turnRight();
void stopMotors();
void emergencyBrake();

// Sensor & Servo Functions
int measureDistanceCm();
int getFilteredDistanceCm();
void scanLeftRight(int &leftDist, int &rightDist);

// ==============================================================================
// 5. SETUP (Runs Once at Boot)
// ==============================================================================
void setup() {
  // Initialize Hardware Serial for PC USB Debugging
  Serial.begin(9600);
  while (!Serial && millis() < 2000) {
    ; // Wait briefly for USB Serial (safe on Uno)
  }

  // Initialize Software Serial for HC-05 Bluetooth
  // Standard HC-05 default communication baud is 9600
  btSerial.begin(9600);

  // Configure Hardware Pins
  setupPins();

  // Attach and Center the Ultrasonic Servo
  initPeripherals();

  lastCommandTime = millis();

  Serial.println(F("=================================================="));
  Serial.println(F("  SMARTDRIVE 4WD ROBOT FIRMWARE INITIALIZED      "));
  Serial.println(F("  Default Mode: MANUAL | Speed: 180 / 255        "));
  Serial.println(F("  Type '?' or send 'H' via Bluetooth for help.   "));
  Serial.println(F("=================================================="));
}

// ==============================================================================
// 6. MAIN LOOP (Repeats Continuously)
// ==============================================================================
void loop() {
  // Process any incoming commands over Bluetooth or USB Serial
  handleBluetoothInput();

  // Mode-dependent execution
  if (currentMode == MODE_AUTONOMOUS) {
    executeAutonomousLogic();
  } else {
    // In Manual Mode: enforce failsafe watchdog
    checkWatchdogTimeout();

    // Active Braking Assist: If moving forward manually and obstacle gets dangerously close (<15cm)
    if (currentMotion == STATE_FORWARD) {
      int dist = measureDistanceCm();
      if (dist > 0 && dist < DISTANCE_CRITICAL_STOP) {
        Serial.println(F("[SAFETY] Front obstacle detected in manual mode! Active braking engaged."));
        emergencyBrake();
      }
    }
  }

  // Periodic Serial Debug Telemetry (every 1000 ms)
  if (millis() - lastTelemetryTime >= 1000) {
    lastTelemetryTime = millis();
    printTelemetry();
  }
}

// ==============================================================================
// 7. PIN & PERIPHERAL INITIALIZATION
// ==============================================================================
void setupPins() {
  // Motor driver control pins
  pinMode(PIN_ENA, OUTPUT);
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);
  pinMode(PIN_ENB, OUTPUT);

  // Ultrasonic sensor pins
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW); // Hold trigger LOW initially

  // Status LED
  pinMode(PIN_LED_STATUS, OUTPUT);
  digitalWrite(PIN_LED_STATUS, LOW);

  // Ensure motors start in complete stop
  stopMotors();
}

void initPeripherals() {
  scannerServo.attach(PIN_SERVO);
  scannerServo.write(SERVO_CENTER); // Face center 90 degrees
  delay(350); // Allow physical movement
}

// ==============================================================================
// 8. BLUETOOTH & SERIAL COMMAND HANDLER
// ==============================================================================
void handleBluetoothInput() {
  char cmd = 0;

  // Read from Bluetooth Module
  if (btSerial.available() > 0) {
    cmd = (char)btSerial.read();
  }
  // Also accept commands from Arduino Serial Monitor for easy workbench testing!
  else if (Serial.available() > 0) {
    cmd = (char)Serial.read();
  }

  if (cmd == 0 || cmd == '\r' || cmd == '\n' || cmd == ' ') {
    return; // Ignore empty / whitespace characters
  }

  // Update watchdog timestamp whenever valid input arrives
  lastCommandTime = millis();

  // Visual heartbeat on Pin 13 LED
  digitalWrite(PIN_LED_STATUS, !digitalRead(PIN_LED_STATUS));

  Serial.print(F("[COMMAND RECEIVED]: '"));
  Serial.print(cmd);
  Serial.println(F("'"));

  switch (cmd) {
    // Mode Selection Commands
    case 'A':
    case 'a':
      currentMode = MODE_AUTONOMOUS;
      autoState = AUTO_CRUISE;
      scannerServo.write(SERVO_CENTER);
      Serial.println(F(">>> SWITCHED TO AUTONOMOUS AVOIDANCE MODE <<<"));
      btSerial.println(F("MODE: AUTONOMOUS"));
      break;

    case 'M':
    case 'm':
      currentMode = MODE_MANUAL;
      stopMotors();
      scannerServo.write(SERVO_CENTER);
      Serial.println(F(">>> SWITCHED TO MANUAL BLUETOOTH MODE <<<"));
      btSerial.println(F("MODE: MANUAL"));
      break;

    // Movement Commands (Only executed directly in MANUAL mode)
    case 'F':
    case 'f':
      if (currentMode == MODE_MANUAL) moveForward();
      break;

    case 'B':
    case 'b':
      if (currentMode == MODE_MANUAL) moveBackward();
      break;

    case 'L':
    case 'l':
      if (currentMode == MODE_MANUAL) turnLeft();
      break;

    case 'R':
    case 'r':
      if (currentMode == MODE_MANUAL) turnRight();
      break;

    case 'S':
    case 's':
      stopMotors();
      break;

    // Emergency Stop
    case 'E':
    case 'e':
      emergencyBrake();
      currentMode = MODE_MANUAL; // Switch back to manual for safety
      Serial.println(F("[ALERT] EMERGENCY STOP ENGAGED!"));
      btSerial.println(F("EMERGENCY STOP"));
      break;

    // Speed Preset Controls: '0' to '9'
    case '0': setSpeed(100); break;
    case '1': setSpeed(120); break;
    case '2': setSpeed(140); break;
    case '3': setSpeed(160); break;
    case '4': setSpeed(180); break;
    case '5': setSpeed(200); break;
    case '6': setSpeed(215); break;
    case '7': setSpeed(230); break;
    case '8': setSpeed(245); break;
    case '9': setSpeed(255); break;

    // Increment / Decrement Speed
    case '+':
      setSpeed(min((int)currentSpeed + 20, 255));
      break;
    case '-':
      setSpeed(max((int)currentSpeed - 20, (int)MIN_SPEED));
      break;

    // Help menu
    case '?':
    case 'H':
    case 'h':
      printHelpMenu();
      break;

    default:
      Serial.print(F("Unknown command: "));
      Serial.println(cmd);
      break;
  }
}

void setSpeed(uint8_t newSpeed) {
  currentSpeed = constrain(newSpeed, MIN_SPEED, MAX_SPEED);
  analogWrite(PIN_ENA, currentSpeed);
  analogWrite(PIN_ENB, currentSpeed);
  Serial.print(F("Motor Speed Adjusted: "));
  Serial.print(currentSpeed);
  Serial.println(F(" / 255"));
  btSerial.print(F("SPEED: "));
  btSerial.println(currentSpeed);
}

// ==============================================================================
// 9. AUTONOMOUS OBSTACLE AVOIDANCE ENGINE
// ==============================================================================
void executeAutonomousLogic() {
  // Ensure scanner faces front during cruising
  scannerServo.write(SERVO_CENTER);

  int frontDistance = getFilteredDistanceCm();

  // Check if reading is valid and if an obstacle is closer than the safe threshold
  if (frontDistance > 0 && frontDistance <= DISTANCE_SAFE_THRESHOLD) {
    Serial.print(F("[AUTO] Obstacle Detected ahead at: "));
    Serial.print(frontDistance);
    Serial.println(F(" cm. Executing avoidance maneuver..."));

    // Step 1: Stop immediately
    stopMotors();
    delay(100);

    // Step 2: Back up slightly to create turning clearance
    Serial.println(F("[AUTO] Backing up slightly..."));
    moveBackward();
    delay(280);
    stopMotors();
    delay(150);

    // Step 3: Scan surroundings using the SG90 servo
    int leftDist = 0;
    int rightDist = 0;
    scanLeftRight(leftDist, rightDist);

    Serial.print(F("[AUTO] Scan Results -> Left: "));
    Serial.print(leftDist);
    Serial.print(F(" cm | Right: "));
    Serial.print(rightDist);
    Serial.println(F(" cm"));

    // Step 4: Decision Making
    if (leftDist <= DISTANCE_SAFE_THRESHOLD && rightDist <= DISTANCE_SAFE_THRESHOLD) {
      // Both pathways are blocked: execute a 180-degree spin around
      Serial.println(F("[AUTO] Dead end detected! Performing 180 turnaround."));
      turnRight();
      delay(750); // Spin longer to face rear
    } else if (leftDist >= rightDist) {
      // Left side is clearer
      Serial.println(F("[AUTO] Choosing LEFT path."));
      turnLeft();
      delay(420); // Time calibrated for approx 60-90 degree skid turn
    } else {
      // Right side is clearer
      Serial.println(F("[AUTO] Choosing RIGHT path."));
      turnRight();
      delay(420); // Time calibrated for approx 60-90 degree skid turn
    }

    stopMotors();
    delay(150);
  } else {
    // Pathway is clear: cruise forward smoothly
    moveForward();
  }
}

// ==============================================================================
// 10. SENSOR & SERVO SCANNING UTILITIES
// ==============================================================================
/*
  Measures distance using HC-SR04 ultrasonic sensor.
  Uses sound speed c ≈ 343 m/s at 20°C -> 0.0343 cm/µs.
  Distance = (Duration_us * 0.0343) / 2 = Duration_us / 58.2
*/
int measureDistanceCm() {
  // Clear trigger pin
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);

  // Send 10µs HIGH pulse to start ultrasound ping
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Read echo pulse duration (timeout after 25ms to prevent code lockup)
  unsigned long duration = pulseIn(PIN_ECHO, HIGH, SENSOR_TIMEOUT_MICROS);

  if (duration == 0) {
    // Sensor timed out (no echo return within ~4 meters)
    return 400; // Treat as clear open path
  }

  int distanceCm = duration / 58;
  return distanceCm;
}

/*
  Takes 3 quick readings and returns the median value.
  Rejects electrical noise spikes and momentary false reflections.
*/
int getFilteredDistanceCm() {
  int r1 = measureDistanceCm();
  delay(12);
  int r2 = measureDistanceCm();
  delay(12);
  int r3 = measureDistanceCm();

  // Median calculation of 3 values
  if ((r1 >= r2 && r1 <= r3) || (r1 <= r2 && r1 >= r3)) return r1;
  if ((r2 >= r1 && r2 <= r3) || (r2 <= r1 && r2 >= r3)) return r2;
  return r3;
}

void scanLeftRight(int &leftDist, int &rightDist) {
  // Turn servo to look LEFT
  scannerServo.write(SERVO_LEFT);
  delay(SERVO_SWEEP_DELAY_MS);
  leftDist = getFilteredDistanceCm();

  // Turn servo to look RIGHT
  scannerServo.write(SERVO_RIGHT);
  delay(SERVO_SWEEP_DELAY_MS * 1.5); // Allow extra time to cross full span
  rightDist = getFilteredDistanceCm();

  // Re-center servo forward
  scannerServo.write(SERVO_CENTER);
  delay(SERVO_SWEEP_DELAY_MS);
}

// ==============================================================================
// 11. MOTOR ACTUATION & DIFFERENTIAL STEERING
// ==============================================================================
/*
  L298N Logic Truth Table:
  IN1  IN2  Left Motors
  HIGH LOW  Forward
  LOW  HIGH Backward
  LOW  LOW  Stop / Coast
  HIGH HIGH Brake

  IN3  IN4  Right Motors
  HIGH LOW  Forward
  LOW  HIGH Backward
  LOW  LOW  Stop / Coast
  HIGH HIGH Brake
*/
void moveForward() {
  currentMotion = STATE_FORWARD;
  analogWrite(PIN_ENA, currentSpeed);
  analogWrite(PIN_ENB, currentSpeed);

  digitalWrite(PIN_IN1, HIGH);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, HIGH);
  digitalWrite(PIN_IN4, LOW);
}

void moveBackward() {
  currentMotion = STATE_BACKWARD;
  analogWrite(PIN_ENA, currentSpeed);
  analogWrite(PIN_ENB, currentSpeed);

  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, HIGH);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, HIGH);
}

void turnLeft() {
  // Skid steering: Left wheels reverse, Right wheels forward
  currentMotion = STATE_LEFT;
  analogWrite(PIN_ENA, TURN_SPEED);
  analogWrite(PIN_ENB, TURN_SPEED);

  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, HIGH);
  digitalWrite(PIN_IN3, HIGH);
  digitalWrite(PIN_IN4, LOW);
}

void turnRight() {
  // Skid steering: Left wheels forward, Right wheels reverse
  currentMotion = STATE_RIGHT;
  analogWrite(PIN_ENA, TURN_SPEED);
  analogWrite(PIN_ENB, TURN_SPEED);

  digitalWrite(PIN_IN1, HIGH);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, HIGH);
}

void stopMotors() {
  currentMotion = STATE_STOPPED;
  analogWrite(PIN_ENA, 0);
  analogWrite(PIN_ENB, 0);

  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
}

void emergencyBrake() {
  // Short motor coils to GND for active electric dynamic braking
  currentMotion = STATE_STOPPED;
  analogWrite(PIN_ENA, 255);
  analogWrite(PIN_ENB, 255);

  digitalWrite(PIN_IN1, HIGH);
  digitalWrite(PIN_IN2, HIGH);
  digitalWrite(PIN_IN3, HIGH);
  digitalWrite(PIN_IN4, HIGH);
  delay(120);

  // Then cut power
  stopMotors();
}

// ==============================================================================
// 12. WATCHDOG, TELEMETRY & HELP
// ==============================================================================
void checkWatchdogTimeout() {
  // In manual mode, if the car is actively driving and no command has arrived
  // within BT_HEARTBEAT_TIMEOUT_MS, stop to prevent runaway robot!
  if (currentMotion != STATE_STOPPED) {
    if (millis() - lastCommandTime > BT_HEARTBEAT_TIMEOUT_MS) {
      Serial.println(F("[WATCHDOG TIMEOUT] No Bluetooth signal received! Stopping car safely."));
      stopMotors();
    }
  }
}

void printTelemetry() {
  int dist = measureDistanceCm();
  Serial.print(F("[STATUS] Mode: "));
  Serial.print(currentMode == MODE_AUTONOMOUS ? F("AUTONOMOUS") : F("MANUAL    "));
  Serial.print(F(" | Motion: "));
  switch (currentMotion) {
    case STATE_STOPPED:  Serial.print(F("STOPPED ")); break;
    case STATE_FORWARD:  Serial.print(F("FORWARD ")); break;
    case STATE_BACKWARD: Serial.print(F("REVERSE ")); break;
    case STATE_LEFT:     Serial.print(F("LEFT    ")); break;
    case STATE_RIGHT:    Serial.print(F("RIGHT   ")); break;
  }
  Serial.print(F(" | Speed: "));
  Serial.print(currentSpeed);
  Serial.print(F(" | Ping: "));
  if (dist >= 400) Serial.print(F(">400"));
  else Serial.print(dist);
  Serial.println(F(" cm"));
}

void printHelpMenu() {
  Serial.println(F("\n--- SMARTDRIVE COMMAND GUIDE ---"));
  Serial.println(F("  F : Drive Forward"));
  Serial.println(F("  B : Drive Backward"));
  Serial.println(F("  L : Turn Left (Pivot)"));
  Serial.println(F("  R : Turn Right (Pivot)"));
  Serial.println(F("  S : Stop Motors"));
  Serial.println(F("  E : Emergency Brake"));
  Serial.println(F("  A : Autonomous Obstacle Avoidance Mode"));
  Serial.println(F("  M : Manual Bluetooth Control Mode"));
  Serial.println(F("  0..9 : Set Speed (100 to 255 PWM)"));
  Serial.println(F("  + / - : Nudge Speed up / down"));
  Serial.println(F("--------------------------------\n"));
}
