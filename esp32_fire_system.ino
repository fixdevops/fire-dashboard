#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <math.h>

// ===== SUPABASE (samakan dengan project di dashboard) =====
const char* SUPABASE_URL = "https://lvgnrhyowjsofgkukvbk.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2Z25yaHlvd2pzb2Zna3VrdmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDAwMTAsImV4cCI6MjA5MzQ3NjAxMH0.jMiNs9KBsRIPYja0CCl5reLNcsNaRUrkafIMN7wJPis";

// ===== WIFI MANAGER AP =====
const char* WIFI_AP_NAME = "FIRE_SYSTEM_FIKRI";
const char* WIFI_AP_PASS = "12345678";

// ================= PIN =================
#define FLAME_SENSOR 34
#define RELAY 27
#define LED 2
#define BUZZER 14

#define SERVO_SCAN_PIN 13
#define SERVO_NOZZLE_PIN 12

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// Pulsa servo (µs) — sesuaikan jika servo Anda tidak full 0–180
#define SERVO_MIN_US 500
#define SERVO_MAX_US 2400

// Interval tulis servo (~50 Hz max; 15–20 ms lebih halus untuk SG90/MG90S)
const unsigned long SERVO_FRAME_MS = 16;

// ================= SERVO =================
Servo servoScan;
Servo servoNozzle;

// ===== RADAR (SIMETRIS) =====
float angle = 90.0f;
const float speed = 3.0f;
bool direction = true;

const int center = 90;
const int range = 80;

int lastScanWritten = -1;
int lastNozzleWritten = -1;

// ================= STATE =================
bool flameDetected = false;
bool relayState = false;

// ================= FILTER SENSOR =================
int detectCount = 0;
const int threshold = 3;

// ================= TIMER =================
unsigned long lastSend = 0;
unsigned long lastScanTick = 0;
unsigned long lastNozzleTick = 0;
unsigned long lastAlarm = 0;

unsigned long lastWifiResetPoll = 0;
unsigned long lastWifiReconnectTry = 0;

const unsigned long SUPABASE_SEND_MS = 1500;
const unsigned long WIFI_RESET_POLL_MS = 5000;
const unsigned long WIFI_RECONNECT_MS = 20000;
const unsigned long HTTP_TIMEOUT_MS = 10000;

static inline int clampDeg(int a) {
  if (a < 0) return 0;
  if (a > 180) return 180;
  return a;
}

static void writeScanIfChanged(int deg) {
  deg = clampDeg(deg);
  if (deg != lastScanWritten) {
    lastScanWritten = deg;
    servoScan.write(deg);
  }
}

static void writeNozzleIfChanged(int deg) {
  deg = clampDeg(deg);
  if (deg != lastNozzleWritten) {
    lastNozzleWritten = deg;
    servoNozzle.write(deg);
  }
}

static void attachServoCalibrated(Servo& s, int pin) {
  s.setPeriodHertz(50);
  s.attach(pin, SERVO_MIN_US, SERVO_MAX_US);
}

// ================= SERVO SCAN =================
void updateServoScan() {
  if (millis() - lastScanTick < SERVO_FRAME_MS) return;
  lastScanTick = millis();

  const float leftLimit = (float)(center - range);
  const float rightLimit = (float)(center + range);

  if (direction) {
    angle += speed;
    if (angle >= rightLimit) {
      angle = rightLimit;
      direction = false;
    }
  } else {
    angle -= speed;
    if (angle <= leftLimit) {
      angle = leftLimit;
      direction = true;
    }
  }

  writeScanIfChanged((int)lroundf(angle));
}

// ================= SUPABASE =================
void sendToSupabase(bool flame, bool relay, int angleDeg) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout((int)HTTP_TIMEOUT_MS);

  String url = String(SUPABASE_URL) + "/rest/v1/fire_logs";
  http.begin(url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer", "return=minimal");

  String body = "{";
  body += "\"flame\":" + String(flame ? "true" : "false") + ",";
  body += "\"relay\":" + String(relay ? "true" : "false") + ",";
  body += "\"angle\":" + String(angleDeg) + ",";
  body += "\"locked\":false";
  body += "}";

  int code = http.POST(body);

  if (code < 0) {
    Serial.printf("fire_logs POST gagal: %s\n", http.errorToString(code).c_str());
  } else if (code != 201 && code != 200) {
    Serial.printf("fire_logs RESP: %d body: %s\n", code, http.getString().c_str());
  }

  http.end();
}

// ===== RESET WIFI (dashboard: control.wifi_reset = true) =====
void clearWifiResetFlag() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(8000);
  String url = String(SUPABASE_URL) + "/rest/v1/control?id=eq.1";
  http.begin(url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int c = http.PATCH("{\"wifi_reset\":false}");
  Serial.printf("clear wifi_reset RESP: %d\n", c);
  http.end();
}

void pollWifiResetFromDashboard() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastWifiResetPoll < WIFI_RESET_POLL_MS) return;
  lastWifiResetPoll = millis();

  HTTPClient http;
  http.setTimeout(8000);
  String url = String(SUPABASE_URL) + "/rest/v1/control?select=wifi_reset&id=eq.1";
  http.begin(url);

  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int code = http.GET();
  if (code == 200) {
    String resp = http.getString();
    if (resp.indexOf("\"wifi_reset\":true") >= 0 || resp.indexOf("\"wifi_reset\": true") >= 0) {
      Serial.println("WiFi reset dari web — hapus credential & restart");
      http.end();
      clearWifiResetFlag();
      delay(400);
      WiFiManager wm;
      wm.resetSettings();
      ESP.restart();
      return;
    }
  } else if (code < 0) {
    Serial.printf("wifi_reset poll error: %s\n", http.errorToString(code).c_str());
  }

  http.end();
}

void tryWifiReconnect() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiReconnectTry < WIFI_RECONNECT_MS) return;
  lastWifiReconnectTry = millis();
  Serial.println("WiFi putus — coba reconnect");
  WiFi.reconnect();
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(FLAME_SENSOR, INPUT);
  pinMode(RELAY, OUTPUT);
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  digitalWrite(RELAY, RELAY_OFF);
  digitalWrite(LED, LOW);
  digitalWrite(BUZZER, LOW);

  attachServoCalibrated(servoScan, SERVO_SCAN_PIN);
  attachServoCalibrated(servoNozzle, SERVO_NOZZLE_PIN);

  angle = (float)center;
  lastScanWritten = lastNozzleWritten = -1;
  writeScanIfChanged(center);
  writeNozzleIfChanged(center);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  WiFiManager wm;
  wm.setConnectTimeout(30);
  if (!wm.autoConnect(WIFI_AP_NAME, WIFI_AP_PASS)) {
    Serial.println("WiFiManager gagal — restart");
    delay(2000);
    ESP.restart();
  }

  Serial.println("WiFi OK");
  Serial.println(WiFi.localIP());
  Serial.println("FIRE SYSTEM READY");
}

// ================= LOOP =================
void loop() {
  tryWifiReconnect();

  int flameRaw = digitalRead(FLAME_SENSOR);

  if (flameRaw == LOW) {
    detectCount++;
  } else {
    detectCount = 0;
  }

  flameDetected = (detectCount >= threshold);

  if (flameDetected) {

    relayState = true;
    digitalWrite(RELAY, RELAY_ON);

    if (millis() - lastAlarm > 300) {
      lastAlarm = millis();
      digitalWrite(LED, !digitalRead(LED));
      digitalWrite(BUZZER, !digitalRead(BUZZER));
    }

    if (millis() - lastNozzleTick >= SERVO_FRAME_MS) {
      lastNozzleTick = millis();
      writeNozzleIfChanged((int)lroundf(angle));
    }

  } else {

    relayState = false;
    digitalWrite(RELAY, RELAY_OFF);
    digitalWrite(LED, LOW);
    digitalWrite(BUZZER, LOW);

    updateServoScan();
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastSend >= SUPABASE_SEND_MS) {
    lastSend = millis();
    sendToSupabase(flameDetected, relayState, clampDeg((int)lroundf(angle)));
  }

  if (WiFi.status() == WL_CONNECTED) {
    pollWifiResetFromDashboard();
  }

  yield();
  delay(2);
}
