# Adaptasi Code ESP32 & Web API Vercel

Sesuai permintaan Anda, berikut adalah kode ESP32 yang telah disesuaikan dengan permintaan Anda (sinkronisasi dua arah penuh).

```cpp
/*
  ESP32 Telegram Bot + Web API - FULLY SYNCHRONIZED
  Kontrol 4 Relay + Monitoring DHT11

  Setiap perubahan relay (dari Telegram ATAU Web) akan disinkronkan ke kedua arah.

  Relay aktif LOW (PNP module)
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

// ================= RELAY PIN =================
const int relayPin[4] = {5, 19, 18, 23};

// ================= STATE RELAY (sumber kebenaran lokal) =================
// true = ON, false = OFF
bool relayState[4] = {false, false, false, false};

// ================= WEB API =================
// Ganti dengan URL domain Vercel / Web Anda
const char* webApiUrl = "https://<YOUR_APP_URL>/api/relays";
const char* webPostDhtUrl = "https://<YOUR_APP_URL>/api/dht";

// ================= TIMER =================
const unsigned long botRequestDelay = 1000;   // polling Telegram
const unsigned long webRequestDelay = 3000;   // polling Web API
const unsigned long dhtPushDelay    = 5000;   // ms push update DHT ke Web

unsigned long lastTimeBotRan = 0;
unsigned long lastTimeWebRan = 0;
unsigned long lastTimeDhtRan = 0;

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
void applyRelayState() {
  for (int i = 0; i < 4; i++) {
    digitalWrite(relayPin[i], relayState[i] ? LOW : HIGH); // aktif LOW
  }
}

// =====================================================
// KIRIM STATE KE WEB API (POST)
// =====================================================
void kirimStateKeWeb() {

  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(webApiUrl);
  http.addHeader("Content-Type", "application/json");

  // Buat JSON body: {"relays": [true, false, true, false]}
  StaticJsonDocument<200> doc;
  JsonArray arr = doc.createNestedArray("relays");
  for (int i = 0; i < 4; i++) {
    arr.add(relayState[i]);
  }

  String body;
  serializeJson(doc, body);

  Serial.println("[WEB POST] " + body);

  int httpCode = http.POST(body);

  if (httpCode > 0) {
    Serial.println("[WEB POST] Response: " + String(httpCode));
  } else {
    Serial.println("[WEB POST] Gagal: " + http.errorToString(httpCode));
  }

  http.end();
}

// =====================================================
// BACA STATE DARI WEB API (GET) - hanya jika ada perubahan
// =====================================================
void bacaStateFromWeb() {

  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(webApiUrl);

  int httpCode = http.GET();

  if (httpCode == 200) {

    String payload = http.getString();
    // Serial.println("[WEB GET] " + payload);

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (err) {
      Serial.println("[WEB GET] JSON Error: " + String(err.c_str()));
      http.end();
      return;
    }

    // Cek apakah ada perubahan dari server
    bool changed = false;
    for (int i = 0; i < 4; i++) {
      bool serverState = (bool)doc["relays"][i];
      if (serverState != relayState[i]) {
        relayState[i] = serverState;
        changed = true;
      }
    }

    // Jika ada perubahan dari web, apply ke GPIO
    if (changed) {
      Serial.println("[WEB GET] State berubah dari server, apply ke relay...");
      applyRelayState();
    }

  } else {
    Serial.println("[WEB GET] Error HTTP: " + String(httpCode));
  }

  http.end();
}

// =====================================================
// SET RELAY TUNGGAL + SYNC KE WEB
// =====================================================
void setRelay(int index, bool state) {
  relayState[index] = state;
  applyRelayState();
  kirimStateKeWeb(); // langsung sync ke web
}

// =====================================================
// SET SEMUA RELAY + SYNC KE WEB
// =====================================================
void setAllRelay(bool state) {
  for (int i = 0; i < 4; i++) relayState[i] = state;
  applyRelayState();
  kirimStateKeWeb(); // langsung sync ke web
}

// =====================================================
// HANDLE TELEGRAM MESSAGE
// =====================================================
void handleNewMessages(int numNewMessages) {

  for (int i = 0; i < numNewMessages; i++) {

    String chat_id = String(bot.messages[i].chat_id);

    if (chat_id != CHAT_ID) {
      bot.sendMessage(chat_id, "Unauthorized User", "");
      continue;
    }

    String text      = bot.messages[i].text;
    String from_name = bot.messages[i].from_name;
    Serial.println("[TG] Pesan: " + text);

    // ================= /start =================
    if (text == "/start") {
      String welcome  = "Welcome, " + from_name + "!\n\n";
      welcome += "Sistem ini tersinkronisasi antara\nTelegram dan Web Dashboard.\n\n";
      welcome += "=== CONTROL RELAY ===\n";
      welcome += "/r1_on  /r1_off -> Relay 1\n";
      welcome += "/r2_on  /r2_off -> Relay 2\n";
      welcome += "/r3_on  /r3_off -> Relay 3\n";
      welcome += "/r4_on  /r4_off -> Relay 4\n\n";
      welcome += "/all_on  -> Semua Relay ON\n";
      welcome += "/all_off -> Semua Relay OFF\n\n";
      welcome += "/state -> Status Relay\n";
      welcome += "/dht   -> Baca Sensor DHT11\n";
      bot.sendMessage(chat_id, welcome, "");
    }

    // ================= RELAY 1 =================
    else if (text == "/r1_on")  { setRelay(0, true);  bot.sendMessage(chat_id, "Relay 1 ON  [Tersinkronisasi]",  ""); }
    else if (text == "/r1_off") { setRelay(0, false); bot.sendMessage(chat_id, "Relay 1 OFF [Tersinkronisasi]", ""); }

    // ================= RELAY 2 =================
    else if (text == "/r2_on")  { setRelay(1, true);  bot.sendMessage(chat_id, "Relay 2 ON  [Tersinkronisasi]",  ""); }
    else if (text == "/r2_off") { setRelay(1, false); bot.sendMessage(chat_id, "Relay 2 OFF [Tersinkronisasi]", ""); }

    // ================= RELAY 3 =================
    else if (text == "/r3_on")  { setRelay(2, true);  bot.sendMessage(chat_id, "Relay 3 ON  [Tersinkronisasi]",  ""); }
    else if (text == "/r3_off") { setRelay(2, false); bot.sendMessage(chat_id, "Relay 3 OFF [Tersinkronisasi]", ""); }

    // ================= RELAY 4 =================
    else if (text == "/r4_on")  { setRelay(3, true);  bot.sendMessage(chat_id, "Relay 4 ON  [Tersinkronisasi]",  ""); }
    else if (text == "/r4_off") { setRelay(3, false); bot.sendMessage(chat_id, "Relay 4 OFF [Tersinkronisasi]", ""); }

    // ================= ALL ON =================
    else if (text == "/all_on") {
      setAllRelay(true);
      bot.sendMessage(chat_id, "Semua Relay ON [Tersinkronisasi]", "");
    }

    // ================= ALL OFF =================
    else if (text == "/all_off") {
      setAllRelay(false);
      bot.sendMessage(chat_id, "Semua Relay OFF [Tersinkronisasi]", "");
    }

    // ================= STATUS =================
    else if (text == "/state") {
      String s = "=== STATUS RELAY ===\n";
      for (int j = 0; j < 4; j++) {
        s += "Relay " + String(j + 1) + " : ";
        s += relayState[j] ? "ON\n" : "OFF\n";
      }
      bot.sendMessage(chat_id, s, "");
    }

    // ================= DHT11 =================
    else if (text == "/dht") {
      float temp = dht.readTemperature();
      float hum  = dht.readHumidity();

      if (isnan(temp) || isnan(hum)) {
        bot.sendMessage(chat_id, "Gagal membaca DHT11!", "");
      } else {
        String msg  = "=== DATA DHT11 ===\n";
        msg += "Suhu      : " + String(temp, 1) + " C\n";
        msg += "Kelembaban: " + String(hum, 1)  + " %";
        bot.sendMessage(chat_id, msg, "");
      }
    }
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {

  Serial.begin(115200);

  // Relay setup - semua OFF awal
  for (int i = 0; i < 4; i++) {
    pinMode(relayPin[i], OUTPUT);
    digitalWrite(relayPin[i], HIGH); // aktif LOW, jadi HIGH = OFF
  }

  // DHT
  dht.begin();

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  #ifdef ESP32
    clientSecure.setInsecure(); // Disable SSL cert check
  #endif
  #ifdef ESP8266
    configTime(0, 0, "pool.ntp.org");
    clientSecure.setInsecure();
  #endif

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());

  // Baca state awal dari server saat boot
  Serial.println("Membaca state awal dari server...");
  bacaStateFromWeb();
  Serial.println("Siap!");
}

// =====================================================
// LOOP
// =====================================================
void loop() {

  unsigned long now = millis();

  // --- Polling Telegram (setiap 1 detik) ---
  if (now - lastTimeBotRan >= botRequestDelay) {
    int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    while (numNewMessages) {
      Serial.println("[TG] Got Response");
      handleNewMessages(numNewMessages);
      numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    }
    lastTimeBotRan = now;
  }

  // --- Polling Web API (setiap 3 detik) ---
  if (now - lastTimeWebRan >= webRequestDelay) {
    bacaStateFromWeb();
    lastTimeWebRan = now;
  }
  
  // --- Push Telemetry Data Sensor DHT ke Web API ---
  if (now - lastTimeDhtRan >= dhtPushDelay) {
    pushDhtKeWeb();
    lastTimeDhtRan = now;
  }
}
```
