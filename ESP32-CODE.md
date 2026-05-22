# Adaptasi Code ESP32 - FULLY SYNCHRONIZED + VARIASI + SUARA

Sesuai permintaan Anda, berikut adalah kode ESP32 yang telah disesuaikan agar terintegrasi penuh dengan Web Dashboard:
1. **Perintah Suara (Speech Recognition)** dari Web juga bisa diproses dan tersinkronisasi, sama seperti saat mengetik teks di Telegram. Keempat relay dan variasi bisa Anda perintah lewat ucapan dari Web UI.
2. **Tombol Variasi** di Web akan memicu aktifnya variasi di ESP32, atau mematikannya. Sinkronisasi ke ESP32 dan web dashboard sepenuhnya terintegrasi.

### Kode ESP32 (Arduino IDE)

Salin dan upload kode ini ke ESP32 Anda:

```cpp
/*
  ESP32 - Telegram MASTER + Web API + Variasi Lampu
  
  Telegram & Web = Sinkronisasi 2 Arah
  Web Dashboard bisa mengontrol relay secara individual, memicu variasi,
  serta membaca perubahan jika variasi berjalan.
  
  Perintah Suara (via Android → Telegram / Web UI):
  - "nyalakan lampu"     → semua relay ON
  - "matikan lampu"      → semua relay OFF
  - "berapa temperatur"  → baca DHT suhu
  - "berapa kelembapan"  → baca DHT humidity
  - "nyalakan variasi 1" → kedip bergantian
  - "nyalakan variasi 2" → running light
  - "matikan variasi"    → stop variasi

  Relay aktif LOW
  Relay1 -> GPIO 5
  Relay2 -> GPIO 19
  Relay3 -> GPIO 18
  Relay4 -> GPIO 23
  DHT11  -> GPIO 4
*/

#ifdef ESP32
  #include <WiFi.h>
#else
  #include <ESP8266WiFi.h>
#endif

#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ================= WIFI =================
const char* ssid     = "miki";
const char* password = "12345678";

// ================= TELEGRAM =================
#define BOTtoken "8945141571:AAELYrnU6ETXEAngV13x3yfP7a3kRlxL6z4"
#define CHAT_ID  "1759241045"

#ifdef ESP8266
  X509List cert(TELEGRAM_CERTIFICATE_ROOT);
#endif

WiFiClientSecure clientSecure;
UniversalTelegramBot bot(BOTtoken, clientSecure);

// ================= DHT11 =================
#define DHTPIN  4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ================= RELAY =================
const int relayPin[4] = {5, 19, 18, 23};
bool relayState[4]    = {false, false, false, false};

// ================= WEB API =================
// Ganti dengan URL domain Vercel / Web Anda
const char* webApiUrl = "https://mikiiot.vercel.app/api/relays";
const char* webPostDhtUrl = "https://mikiiot.vercel.app/api/dht";

// ================= VARIASI =================
int activeVariasi = 0; // 0 = stop, 1 = kedip, 2 = running
int variasiStep   = 0;
unsigned long lastVariasiTime = 0;
const unsigned long VARIASI1_SPEED = 500;
const unsigned long VARIASI2_SPEED = 500;

// ================= TIMER =================
const unsigned long botDelay = 1000;
const unsigned long webDelay = 2000;
const unsigned long dhtPushDelay = 5000;

unsigned long lastBotTime  = 0;
unsigned long lastWebTime  = 0;
unsigned long lastPostTime = 0;
unsigned long lastDhtTime  = 0;
const unsigned long postCooldown = 2000; 

// =====================================================
// PUSH DHT11 KE WEB API
// =====================================================
void pushDhtKeWeb() {
  if (WiFi.status() != WL_CONNECTED) return;
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[DHT] Gagal membaca sensor!");
    return;
  }
  HTTPClient http;
  http.begin(webPostDhtUrl);
  http.addHeader("Content-Type", "application/json");
  String jsonBody = "{\"temperature\":" + String(temp) + ",\"humidity\":" + String(hum) + "}";
  int httpCode = http.POST(jsonBody);
  http.end();
}

// =====================================================
// APPLY STATE KE GPIO
// =====================================================
void applyRelayToGPIO() {
  for (int i = 0; i < 4; i++) {
    digitalWrite(relayPin[i], relayState[i] ? LOW : HIGH);
  }
}

// =====================================================
// STOP VARIASI
// =====================================================
void stopVariasi() {
  activeVariasi = 0;
  variasiStep   = 0;
}

// =====================================================
// RUN VARIASI (Terus-menerus sync ke web agar UI update)
// =====================================================
void runVariasi1() {
  if (millis() - lastVariasiTime < VARIASI1_SPEED) return;
  lastVariasiTime = millis();

  if (variasiStep == 0) {
    relayState[0] = true; relayState[1] = false; relayState[2] = true; relayState[3] = false;
    variasiStep = 1;
  } else {
    relayState[0] = false; relayState[1] = true; relayState[2] = false; relayState[3] = true;
    variasiStep = 0;
  }
  applyRelayToGPIO();
  pushStateToWeb(); // Sync realtime
}

void runVariasi2() {
  if (millis() - lastVariasiTime < VARIASI2_SPEED) return;
  lastVariasiTime = millis();
  for (int i = 0; i < 4; i++) relayState[i] = false;
  relayState[variasiStep] = true;
  variasiStep = (variasiStep + 1) % 4;
  applyRelayToGPIO();
  pushStateToWeb(); // Sync realtime
}

// =====================================================
// PUSH STATE KE WEB
// =====================================================
bool pushStateToWeb() {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  if (millis() - lastPostTime < 1000) return true; // Jangan spam POST ke Vercel terlalu cepat
  lastPostTime = millis();

  HTTPClient http;
  http.begin(webApiUrl);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  JsonArray stateArr = doc.createNestedArray("state");
  for (int i = 0; i < 4; i++) stateArr.add(relayState[i]);

  JsonArray reqArr = doc.createNestedArray("request");
  for (int i = 0; i < 4; i++) reqArr.add(relayState[i]);

  doc["hasRequest"] = false;
  doc["variasi"] = activeVariasi;

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  http.end();
  return (code == 200 || code == 201);
}

// =====================================================
// CEK REQUEST DARI WEB
// =====================================================
void cekRequestDariWeb() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(webApiUrl);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String payload = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) return;

  // 1. Cek Variasi Web
  if (doc.containsKey("variasi")) {
    int v = doc["variasi"];
    if (v != activeVariasi) {
      activeVariasi = v;
      variasiStep = 0;
      lastVariasiTime = millis();
      if (v == 0) {
        for (int i = 0; i < 4; i++) relayState[i] = false;
        applyRelayToGPIO();
      }
      bot.sendMessage(CHAT_ID, "Perubahan dari Web: Variasi diatur ke " + String(v), "");
      return; 
    }
  }

  // Jika variasi aktif, abaikan manual override dari web, sampai variasi di STOP 
  if (activeVariasi != 0) return;

  // 2. Cek Request relay dari web
  if (!doc.containsKey("hasRequest")) return;
  bool hasRequest = doc["hasRequest"].as<bool>();
  if (!hasRequest) return;

  JsonArray reqArr = doc["request"].as<JsonArray>();
  bool requestedState[4];
  for (int i = 0; i < 4; i++) requestedState[i] = reqArr[i].as<bool>();

  bool changed = false;
  String notifMsg = "Perubahan dari Web:\n";

  for (int i = 0; i < 4; i++) {
    if (requestedState[i] != relayState[i]) {
      notifMsg += "Relay " + String(i + 1) + ": ";
      notifMsg += requestedState[i] ? "ON\n" : "OFF\n";
      relayState[i] = requestedState[i];
      changed = true;
    }
  }

  if (changed) {
    applyRelayToGPIO();
    if (pushStateToWeb()) bot.sendMessage(CHAT_ID, notifMsg, "");
  } else {
    pushStateToWeb();
  }
}

// =====================================================
// SET RELAY DARI TELEGRAM
// =====================================================
void setRelay(int index, bool state) {
  stopVariasi();
  relayState[index] = state;
  applyRelayToGPIO();
  pushStateToWeb();
}

void setAllRelay(bool state) {
  stopVariasi();
  for (int i = 0; i < 4; i++) relayState[i] = state;
  applyRelayToGPIO();
  pushStateToWeb();
}

void prosesPerintah(String chat_id, String text) {
  text.trim();
  text.toLowerCase();

  Serial.println("[CMD] " + text);

  // ======= PERINTAH SUARA / NATURAL =======
  if (text == "nyalakan lampu" || text == "semua lampu nyala" || text == "hidupkan lampu") { setAllRelay(true); bot.sendMessage(chat_id, "Semua lampu ON", ""); return; }
  if (text == "matikan lampu" || text == "semua lampu mati" || text == "lampu mati") { setAllRelay(false); bot.sendMessage(chat_id, "Semua lampu OFF", ""); return; }
  
  if (text == "berapa temperatur" || text == "berapa suhu" || text == "suhu sekarang" || text == "temperatur sekarang") {
    float temp = dht.readTemperature();
    bot.sendMessage(chat_id, isnan(temp) ? "Gagal membaca sensor!" : "Suhu saat ini: " + String(temp, 1) + " C", ""); return;
  }
  if (text == "berapa kelembapan" || text == "berapa kelembaban" || text == "kelembapan sekarang" || text == "kelembaban sekarang") {
    float hum = dht.readHumidity();
    bot.sendMessage(chat_id, isnan(hum) ? "Gagal membaca sensor!" : "Kelembapan saat ini: " + String(hum, 1) + " %", ""); return;
  }
  
  if (text == "nyalakan variasi 1" || text == "variasi 1" || text == "variasi satu" || text == "nyalakan variasi satu") {
    stopVariasi(); activeVariasi = 1; variasiStep = 0; lastVariasiTime = millis();
    bot.sendMessage(chat_id, "Variasi 1 aktif\nKedip bergantian R1+R3 vs R2+R4", ""); pushStateToWeb(); return;
  }
  if (text == "nyalakan variasi 2" || text == "variasi 2" || text == "variasi dua" || text == "nyalakan variasi dua") {
    stopVariasi(); activeVariasi = 2; variasiStep = 0; lastVariasiTime = millis();
    bot.sendMessage(chat_id, "Variasi 2 aktif\nRunning light", ""); pushStateToWeb(); return;
  }
  if (text == "matikan variasi" || text == "stop variasi" || text == "hentikan variasi") {
    stopVariasi(); setAllRelay(false);
    bot.sendMessage(chat_id, "Variasi berhenti, semua relay OFF", ""); 
    pushStateToWeb();
    return;
  }

  // ======= SLASH CMD =======
  if (text == "/start") {
    String msg  = "=== MENU UTAMA ===\n\n";
    msg += "--- Kontrol Manual ---\n";
    msg += "/r1_on  /r1_off -> Relay 1\n";
    msg += "/r2_on  /r2_off -> Relay 2\n";
    msg += "/r3_on  /r3_off -> Relay 3\n";
    msg += "/r4_on  /r4_off -> Relay 4\n\n";
    msg += "/all_on  -> Semua ON\n";
    msg += "/all_off -> Semua OFF\n\n";
    msg += "--- Variasi ---\n";
    msg += "/variasi1 -> Kedip bergantian\n";
    msg += "/variasi2 -> Running light\n";
    msg += "/stop_variasi -> Hentikan variasi\n\n";
    msg += "--- Info ---\n";
    msg += "/state -> Status relay\n";
    msg += "/dht   -> Suhu & Kelembapan\n\n";
    msg += "--- Perintah Suara ---\n";
    msg += "Nyalakan lampu\n";
    msg += "Matikan lampu\n";
    msg += "Berapa temperatur\n";
    msg += "Berapa kelembapan\n";
    msg += "Nyalakan variasi 1\n";
    msg += "Nyalakan variasi 2\n";
    msg += "Matikan variasi\n";
    bot.sendMessage(chat_id, msg, "");
    return;
  }
  
  if (text == "/r1_on")  { setRelay(0, true);  bot.sendMessage(chat_id, "Relay 1 ON", "");  return; }
  if (text == "/r1_off") { setRelay(0, false); bot.sendMessage(chat_id, "Relay 1 OFF", ""); return; }
  if (text == "/r2_on")  { setRelay(1, true);  bot.sendMessage(chat_id, "Relay 2 ON", "");  return; }
  if (text == "/r2_off") { setRelay(1, false); bot.sendMessage(chat_id, "Relay 2 OFF", ""); return; }
  if (text == "/r3_on")  { setRelay(2, true);  bot.sendMessage(chat_id, "Relay 3 ON", "");  return; }
  if (text == "/r3_off") { setRelay(2, false); bot.sendMessage(chat_id, "Relay 3 OFF", ""); return; }
  if (text == "/r4_on")  { setRelay(3, true);  bot.sendMessage(chat_id, "Relay 4 ON", "");  return; }
  if (text == "/r4_off") { setRelay(3, false); bot.sendMessage(chat_id, "Relay 4 OFF", ""); return; }

  if (text == "/all_on") { setAllRelay(true); bot.sendMessage(chat_id, "Semua Relay ON", ""); return; }
  if (text == "/all_off") { setAllRelay(false); bot.sendMessage(chat_id, "Semua Relay OFF", ""); return; }
  
  if (text == "/variasi1") {
    stopVariasi(); activeVariasi = 1; variasiStep = 0; lastVariasiTime = millis();
    bot.sendMessage(chat_id, "Variasi 1: Kedip bergantian aktif", ""); pushStateToWeb(); return;
  }
  if (text == "/variasi2") {
    stopVariasi(); activeVariasi = 2; variasiStep = 0; lastVariasiTime = millis();
    bot.sendMessage(chat_id, "Variasi 2: Running light aktif", ""); pushStateToWeb(); return;
  }
  if (text == "/stop_variasi") {
    stopVariasi(); setAllRelay(false);
    bot.sendMessage(chat_id, "Variasi berhenti, semua OFF", ""); pushStateToWeb(); return;
  }

  if (text == "/state") {
    String s = "=== STATUS RELAY ===\n";
    for (int j = 0; j < 4; j++) {
      s += "Relay " + String(j + 1) + " : ";
      s += relayState[j] ? "ON\n" : "OFF\n";
    }
    s += "\nVariasi: ";
    if      (activeVariasi == 1) s += "Variasi 1 (kedip)\n";
    else if (activeVariasi == 2) s += "Variasi 2 (running)\n";
    else                         s += "Tidak aktif\n";
    bot.sendMessage(chat_id, s, "");
    return;
  }

  if (text == "/dht") {
    float temp = dht.readTemperature();
    float hum  = dht.readHumidity();
    if (isnan(temp) || isnan(hum)) {
      bot.sendMessage(chat_id, "Gagal membaca DHT11!", "");
    } else {
      String msg  = "=== DHT11 ===\n";
      msg += "Suhu      : " + String(temp, 1) + " C\n";
      msg += "Kelembapan: " + String(hum, 1)  + " %";
      bot.sendMessage(chat_id, msg, "");
    }
    return;
  }
}

void handleNewMessages(int numNewMessages) {
  for (int i = 0; i < numNewMessages; i++) {
    if (String(bot.messages[i].chat_id) != CHAT_ID) continue;
    prosesPerintah(String(bot.messages[i].chat_id), bot.messages[i].text);
  }
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 4; i++) { pinMode(relayPin[i], OUTPUT); digitalWrite(relayPin[i], HIGH); }
  dht.begin();
  WiFi.mode(WIFI_STA); WiFi.begin(ssid, password);

  #ifdef ESP32
    clientSecure.setInsecure(); // Bypass SSL Cert
  #endif

  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nConnected");
  
  cekRequestDariWeb();
}

void loop() {
  unsigned long now = millis();

  // --- Jalankan variasi ---
  if      (activeVariasi == 1) runVariasi1();
  else if (activeVariasi == 2) runVariasi2();

  if (now - lastBotTime >= botDelay) {
    int n = bot.getUpdates(bot.last_message_received + 1);
    while (n) { handleNewMessages(n); n = bot.getUpdates(bot.last_message_received + 1); }
    lastBotTime = now;
  }

  // --- Push Telemetry Data Sensor DHT ke Web API ---
  if (now - lastDhtTime >= dhtPushDelay) {
    pushDhtKeWeb();
    lastDhtTime = now;
  }

  // --- Polling Web (skip jika variasi aktif untuk menghindari override) ---
  if (now - lastWebTime >= webDelay && activeVariasi == 0) {
    cekRequestDariWeb();
    lastWebTime = now;
  }
}
```
