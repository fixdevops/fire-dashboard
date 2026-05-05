#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// ===== SUPABASE =====
const char* SUPABASE_URL = "https://lvgnrhyowjsofgkukvbk.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2Z25yaHlvd2pzb2Zna3VrdmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDAwMTAsImV4cCI6MjA5MzQ3NjAxMH0.jMiNs9KBsRIPYja0CCl5reLNcsNaRUrkafIMN7wJPis";

// ===== PIN =====
#define FLAME_SENSOR 34
#define RELAY 27
#define LED 2
#define BUZZER 14

#define SERVO_SCAN_PIN 13
#define SERVO_NOZZLE_PIN 12

#define RELAY_ON LOW
#define RELAY_OFF HIGH

Servo servoScan;
Servo servoNozzle;

int angle = 0;
bool arah = true;
bool ledState = false;

// ===== TIMER =====
unsigned long lastSend = 0;
const int sendInterval = 1000; // 1 detik

unsigned long lastWifiResetPoll = 0;
const unsigned long WIFI_RESET_POLL_MS = 5000;

// ===== FILTER SENSOR =====
int detectCount = 0;
const int threshold = 3;

// ===== KIRIM KE SUPABASE =====
void sendToSupabase(bool flame, bool relay, int angle) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/fire_logs";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  String body = "{";
  body += "\"flame\":" + String(flame ? "true" : "false") + ",";
  body += "\"relay\":" + String(relay ? "true" : "false") + ",";
  body += "\"angle\":" + String(angle);
  body += "}";

  int code = http.POST(body);

  Serial.print("SEND: ");
  Serial.println(body);

  Serial.print("RESP: ");
  Serial.println(code);

  http.end();
}

// ===== RESET WIFI (dari dashboard: PATCH control.wifi_reset = true) =====
void clearWifiResetFlag() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/control?id=eq.1";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  String body = "{\"wifi_reset\":false}";
  int c = http.PATCH(body);
  Serial.print("clear wifi_reset RESP: ");
  Serial.println(c);
  http.end();
}

void pollWifiResetFromDashboard() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastWifiResetPoll < WIFI_RESET_POLL_MS) return;
  lastWifiResetPoll = millis();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/control?select=wifi_reset&id=eq.1";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    if (body.indexOf("\"wifi_reset\":true") >= 0 || body.indexOf("\"wifi_reset\": true") >= 0) {
      Serial.println("WiFi reset diminta dari web — hapus credential & restart");
      http.end();
      clearWifiResetFlag();
      delay(400);
      WiFiManager wm;
      wm.resetSettings();
      ESP.restart();
      return;
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);

  pinMode(FLAME_SENSOR, INPUT);
  pinMode(RELAY, OUTPUT);
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  digitalWrite(RELAY, RELAY_OFF);

  servoScan.attach(SERVO_SCAN_PIN);
  servoNozzle.attach(SERVO_NOZZLE_PIN);

  servoScan.write(90);
  servoNozzle.write(90);

  // ===== WIFI =====
  WiFiManager wm;
  wm.autoConnect("FIRE_SYSTEM", "12345678");

  Serial.println("WiFi Connected!");
  Serial.println(WiFi.localIP());
}

void loop() {

  int flameRaw = digitalRead(FLAME_SENSOR);

  // ===== FILTER (ANTI NOISE) =====
  if (flameRaw == LOW) {
    detectCount++;
  } else {
    detectCount = 0;
  }

  bool flameDetected = detectCount >= threshold;

  // ===== API TERDETEKSI =====
  if (flameDetected) {

    digitalWrite(RELAY, RELAY_ON);

    ledState = !ledState;
    digitalWrite(LED, ledState);
    digitalWrite(BUZZER, ledState);

    // nozzle ikut arah scan terakhir
    servoNozzle.write(angle);

  } else {

    digitalWrite(RELAY, RELAY_OFF);
    digitalWrite(LED, LOW);
    digitalWrite(BUZZER, LOW);

    // ===== SCANNING =====
    if (arah) {
      angle += 2;
      if (angle >= 180) arah = false;
    } else {
      angle -= 2;
      if (angle <= 0) arah = true;
    }

    servoScan.write(angle);
  }

  // ===== KIRIM DATA TIAP INTERVAL =====
  if (millis() - lastSend > sendInterval) {
    lastSend = millis();
    sendToSupabase(flameDetected, flameDetected, angle);
  }

  pollWifiResetFromDashboard();

  delay(20);
}
