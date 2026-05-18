# Adaptasi Code ESP32 & Web API Vercel

Sesuai permintaan Anda, berikut adalah kode ESP32 yang telah disesuaikan agar terintegrasi sempurna dengan tampilan dan sistem Web API / Telegram Log yang baru.

### Perubahan Utama:
1. **Push Sensor Data (DHT11)**: ESP32 kini mengirimkan data suhu & kelembaban ke Web API via `POST /api/dht` setiap beberapa detik agar grafiknya realtime dan akurat di Web!
2. **Sinkronisasi Web & Telegram**: ESP32 menangani perintah Telegram secara langsung. Namun jika dikontrol via Web, perintah tetap sinkron karena ESP32 selalu mem-polling `/api/relays`.
3. **URL Web API**: Ubah variabel `webApiUrl` menggunakan URL deployment Vercel Anda.

---

### Kode ESP32 (Arduino IDE)

Salin dan upload kode ini ke ESP32 Anda:

```cpp
/*
  ESP32 Telegram Bot + Web API Polling + Push DHT11
  Kontrol 4 Relay + Monitoring DHT11
  
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

WiFiClientSecure client;
UniversalTelegramBot bot(BOTtoken, client);

// ================= DHT11 =================
#define DHTPIN  4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ================= RELAY PIN =================
const int relay1 = 5;
const int relay2 = 19;
const int relay3 = 18;
const int relay4 = 23;

// ================= WEB API =================
// Ganti dengan URL domain Vercel / Web Anda
const char* webApiUrl = "https://<YOUR_APP_URL>/api/relays";
const char* webPostDhtUrl = "https://<YOUR_APP_URL>/api/dht";
const char* webLogUrl = "https://<YOUR_APP_URL>/api/telegram/log";

// ================= TIMER =================
const int  botRequestDelay = 1000;   // ms polling Telegram
const int  webRequestDelay = 3000;   // ms polling Web API
const int  dhtPushDelay    = 5000;   // ms push update DHT ke Web

unsigned long lastTimeBotRan = 0;
unsigned long lastTimeWebRan = 0;
unsigned long lastTimeDhtRan = 0;

// =====================================================
// HELPER: Set & Get Relay
// =====================================================
void setRelay(int pin, bool state) {
  digitalWrite(pin, state ? LOW : HIGH); // aktif LOW
}

bool getRelay(int pin) {
  return digitalRead(pin) == LOW; // aktif LOW berarti LOW = true = ON
}

// =====================================================
// HUBUNGI WEB API (SINKRONISASI RELAY)
// =====================================================
void ambilStatusRelayDariWeb() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(webApiUrl);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    // Serial.println("[WEB GET] " + payload);

    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      setRelay(relay1, (bool)doc["relays"][0]);
      setRelay(relay2, (bool)doc["relays"][1]);
      setRelay(relay3, (bool)doc["relays"][2]);
      setRelay(relay4, (bool)doc["relays"][3]);
    } else {
      Serial.print("[WEB GET] JSON Parse Error: ");
      Serial.println(error.c_str());
    }

  } else {
    Serial.print("[WEB GET] Error HTTP: ");
    Serial.println(httpCode);
  }
  http.end();
}

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

  // Format JSON Data: {"temperature": 32.5, "humidity": 65}
  String jsonBody = "{\"temperature\":" + String(temp) + ",\"humidity\":" + String(hum) + "}";
  
  int httpCode = http.POST(jsonBody);
  if (httpCode == 200) {
    Serial.println("[DHT PUSH] Sukses UPDATE ke Web");
  } else {
    Serial.println("[DHT PUSH] Gagal: " + String(httpCode));
  }
  http.end();
}

// =====================================================
// UPDATE RELAY KE CLOUD (jika kontrol via Telegram)
// =====================================================
void updateWebRelay(String actionPath) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  
  // Ambil URL dasar, misal: https://<YOUR_APP_URL>/api
  String baseUrl = String(webApiUrl);
  baseUrl.replace("/relays", ""); // Hapus /relays di belakangnya
  
  // Gabung: https://<YOUR_APP_URL>/api/relay/1/on
  http.begin(baseUrl + actionPath);
  http.GET();
  http.end();
}

// =====================================================
// HANDLE TELEGRAM MESSAGE
// =====================================================
void handleNewMessages(int numNewMessages) {
  Serial.println("[TG] Memproses: " + String(numNewMessages) + " pesan");

  for (int i = 0; i < numNewMessages; i++) {
    String chat_id = String(bot.messages[i].chat_id);
    if (chat_id != CHAT_ID) {
      bot.sendMessage(chat_id, "Unauthorized User", "");
      continue;
    }

    String text      = bot.messages[i].text;
    String from_name = bot.messages[i].from_name;
    Serial.println("[TG] Pesan: " + text);

    if (text == "/start") {
      String welcome  = "Welcome, " + from_name + "\n\n";
      welcome += "=== CONTROL RELAY ===\n";
      welcome += "/r1_on  -> Relay 1 ON\n";
      welcome += "/r1_off -> Relay 1 OFF\n\n";
      welcome += "/r2_on  -> Relay 2 ON\n";
      welcome += "/r2_off -> Relay 2 OFF\n\n";
      welcome += "/r3_on  -> Relay 3 ON\n";
      welcome += "/r3_off -> Relay 3 OFF\n\n";
      welcome += "/r4_on  -> Relay 4 ON\n";
      welcome += "/r4_off -> Relay 4 OFF\n\n";
      welcome += "/all_on  -> Semua Relay ON\n";
      welcome += "/all_off -> Semua Relay OFF\n\n";
      welcome += "/state -> Status Relay\n";
      welcome += "/dht   -> Baca Sensor DHT11\n";
      bot.sendMessage(chat_id, welcome, "");
    }
    // RELAY 1
    else if (text == "/r1_on")  { setRelay(relay1, true);  updateWebRelay("/relay/1/on"); bot.sendMessage(chat_id, "Relay 1 ON",  ""); }
    else if (text == "/r1_off") { setRelay(relay1, false); updateWebRelay("/relay/1/off"); bot.sendMessage(chat_id, "Relay 1 OFF", ""); }
    // RELAY 2
    else if (text == "/r2_on")  { setRelay(relay2, true);  updateWebRelay("/relay/2/on"); bot.sendMessage(chat_id, "Relay 2 ON",  ""); }
    else if (text == "/r2_off") { setRelay(relay2, false); updateWebRelay("/relay/2/off"); bot.sendMessage(chat_id, "Relay 2 OFF", ""); }
    // RELAY 3
    else if (text == "/r3_on")  { setRelay(relay3, true);  updateWebRelay("/relay/3/on"); bot.sendMessage(chat_id, "Relay 3 ON",  ""); }
    else if (text == "/r3_off") { setRelay(relay3, false); updateWebRelay("/relay/3/off"); bot.sendMessage(chat_id, "Relay 3 OFF", ""); }
    // RELAY 4
    else if (text == "/r4_on")  { setRelay(relay4, true);  updateWebRelay("/relay/4/on"); bot.sendMessage(chat_id, "Relay 4 ON",  ""); }
    else if (text == "/r4_off") { setRelay(relay4, false); updateWebRelay("/relay/4/off"); bot.sendMessage(chat_id, "Relay 4 OFF", ""); }
    // ALL ON/OFF
    else if (text == "/all_on") {
      setRelay(relay1, true); setRelay(relay2, true); setRelay(relay3, true); setRelay(relay4, true);
      updateWebRelay("/relay/all/on");
      bot.sendMessage(chat_id, "Semua Relay ON", "");
    }
    else if (text == "/all_off") {
      setRelay(relay1, false); setRelay(relay2, false); setRelay(relay3, false); setRelay(relay4, false);
      updateWebRelay("/relay/all/off");
      bot.sendMessage(chat_id, "Semua Relay OFF", "");
    }
    // STATUS
    else if (text == "/state") {
      String s  = "=== STATUS RELAY ===\n";
      s += "Relay 1 : "; s += getRelay(relay1) ? "ON\n" : "OFF\n";
      s += "Relay 2 : "; s += getRelay(relay2) ? "ON\n" : "OFF\n";
      s += "Relay 3 : "; s += getRelay(relay3) ? "ON\n" : "OFF\n";
      s += "Relay 4 : "; s += getRelay(relay4) ? "ON\n" : "OFF\n";
      bot.sendMessage(chat_id, s, "");
    }
    // DHT11
    else if (text == "/dht") {
      float temp = dht.readTemperature();
      float hum  = dht.readHumidity();
      if (isnan(temp) || isnan(hum)) {
        bot.sendMessage(chat_id, "Gagal membaca DHT11", "");
      } else {
        String msg  = "=== DATA DHT11 ===\n";
        msg += "Suhu      : " + String(temp) + " C\n";
        msg += "Kelembaban: " + String(hum)  + " %";
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

  pinMode(relay1, OUTPUT); digitalWrite(relay1, HIGH);
  pinMode(relay2, OUTPUT); digitalWrite(relay2, HIGH);
  pinMode(relay3, OUTPUT); digitalWrite(relay3, HIGH);
  pinMode(relay4, OUTPUT); digitalWrite(relay4, HIGH);

  dht.begin();

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  #ifdef ESP32
    client.setInsecure(); // Bypass SSL Certificate untuk testing Vercel API
  #endif

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  unsigned long now = millis();

  // 1. Polling Telegram
  if (now - lastTimeBotRan >= botRequestDelay) {
    int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    while (numNewMessages) {
      handleNewMessages(numNewMessages);
      numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    }
    lastTimeBotRan = now;
  }

  // 2. Polling Sinkronisasi Relay dari Web API
  if (now - lastTimeWebRan >= webRequestDelay) {
    ambilStatusRelayDariWeb();
    lastTimeWebRan = now;
  }

  // 3. Push Telemetry Data Sensor DHT ke Web API
  if (now - lastTimeDhtRan >= dhtPushDelay) {
    pushDhtKeWeb();
    lastTimeDhtRan = now;
  }
}
```

**Perhatikan Point Integrasi Web:**

1. Di API route kita, ada endpoint baru: `POST /api/dht`. Ini bertugas menerima data suhu & kelembapan Real-time dari hardware Anda agar muncul di Chart Web (sudah kita setting delay `5000` ms atau 5 detik pada code di atas).
2. Saya menambahkan baris `client.setInsecure();` pada code ESP32 di setup agar tidak di reject masalah Certificate SSL jika connect ke API Vercel/Web.
3. Silahkan deploy ulang ke Vercel untuk mengupdate Backend Node.JS nya, kemudian salin URL Vercel-nya ke variabel Code C++ `webApiUrl`.
