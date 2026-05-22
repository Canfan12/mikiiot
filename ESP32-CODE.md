/*
  ESP32 - Telegram MASTER + Web API + Voice + Variasi
  OPTIMIZED: Minimal delay, timeout pendek, non-blocking
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

WiFiClientSecure clientSecure;
UniversalTelegramBot bot(BOTtoken, clientSecure);

// ================= DHT11 =================
#define DHTPIN  4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

float dhtTemp = 0.0;
float dhtHum  = 0.0;
bool  dhtOK   = false;

// ================= RELAY =================
const int relayPin[4] = {5, 19, 18, 23};
bool relayState[4]    = {false, false, false, false};

// ================= WEB API =================
const char* webApiUrl    = "https://mikiiot.vercel.app/api/relays";
const char* webDhtUrl    = "https://mikiiot.vercel.app/api/dht";

// ================= VARIASI =================
int  activeVariasi    = 0;
int  variasiStep      = 0;
unsigned long lastVariasiTime = 0;
const unsigned long VARIASI1_SPEED = 500;
const unsigned long VARIASI2_SPEED = 500;

// ================= TIMER - SEMUA DIPERCEPAT =================
const unsigned long BOT_DELAY      = 500;   // Telegram polling tiap 500ms (default 1000)
const unsigned long WEB_DELAY      = 1000;  // Web polling tiap 1 detik (default 2000)
const unsigned long DHT_DELAY      = 5000;  // Push DHT tiap 5 detik
const unsigned long DHT_READ_DELAY = 2000;  // Baca DHT lokal tiap 2 detik
const unsigned long POST_COOLDOWN  = 500;   // Cooldown POST (default 2000-3000)
const int           HTTP_TIMEOUT   = 3000;  // Timeout HTTP 3 detik (default tidak di-set)

unsigned long lastBotTime  = 0;
unsigned long lastWebTime  = 0;
unsigned long lastDhtPush  = 0;
unsigned long lastDhtRead  = 0;
unsigned long lastPostTime = 0;

// =====================================================
// HTTP CLIENT HELPER - timeout pendek, reusable
// =====================================================
HTTPClient httpClient;

bool httpBegin(const char* url) {
  httpClient.setReuse(true);          // keep-alive connection
  httpClient.setTimeout(HTTP_TIMEOUT); // timeout 3 detik
  return httpClient.begin(url);
}

// =====================================================
// BACA DHT LOKAL - non-blocking, periodik
// =====================================================
void bacaDHTLokal() {
  if (millis() - lastDhtRead < DHT_READ_DELAY) return;
  lastDhtRead = millis();

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t) && !isnan(h)) {
    dhtTemp = t;
    dhtHum  = h;
    dhtOK   = true;
  } else {
    dhtOK = false;
    Serial.println("[DHT] Gagal baca");
  }
}

// =====================================================
// PUSH DHT KE WEB - non-blocking
// =====================================================
void pushDhtKeWeb() {
  if (!dhtOK) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastDhtPush < DHT_DELAY) return;
  lastDhtPush = millis();

  if (!httpBegin(webDhtUrl)) return;
  httpClient.addHeader("Content-Type", "application/json");

  String body = "{\"temperature\":" + String(dhtTemp, 1) +
                ",\"humidity\":"    + String(dhtHum, 1)  + "}";

  int code = httpClient.POST(body);
  httpClient.end();

  Serial.println("[DHT PUSH] HTTP: " + String(code));
}

// =====================================================
// APPLY STATE KE GPIO
// =====================================================
void applyRelayToGPIO() {
  for (int i = 0; i < 4; i++) {
    digitalWrite(relayPin[i], relayState[i] ? LOW : HIGH);
  }
  Serial.print("[GPIO] ");
  for (int i = 0; i < 4; i++) {
    Serial.print("R"); Serial.print(i + 1);
    Serial.print(relayState[i] ? "=ON " : "=OFF ");
  }
  Serial.println();
}

// =====================================================
// STOP VARIASI
// =====================================================
void stopVariasi() {
  activeVariasi = 0;
  variasiStep   = 0;
  Serial.println("[VARIASI] Stop");
}

// =====================================================
// VARIASI 1: Kedip ganjil-genap
// =====================================================
void runVariasi1() {
  if (millis() - lastVariasiTime < VARIASI1_SPEED) return;
  lastVariasiTime = millis();

  if (variasiStep == 0) {
    relayState[0] = true;  relayState[1] = false;
    relayState[2] = true;  relayState[3] = false;
    variasiStep = 1;
  } else {
    relayState[0] = false; relayState[1] = true;
    relayState[2] = false; relayState[3] = true;
    variasiStep = 0;
  }
  applyRelayToGPIO();
}

// =====================================================
// VARIASI 2: Running light
// =====================================================
void runVariasi2() {
  if (millis() - lastVariasiTime < VARIASI2_SPEED) return;
  lastVariasiTime = millis();

  for (int i = 0; i < 4; i++) relayState[i] = false;
  relayState[variasiStep] = true;
  variasiStep = (variasiStep + 1) % 4;
  applyRelayToGPIO();
}

// =====================================================
// PUSH STATE KE WEB - dengan cooldown minimal
// =====================================================
bool pushStateToWeb() {
  if (WiFi.status() != WL_CONNECTED) return false;

  // Cooldown sangat pendek: 500ms
  if (millis() - lastPostTime < POST_COOLDOWN) return true;
  lastPostTime = millis();

  if (!httpBegin(webApiUrl)) return false;
  httpClient.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  JsonArray stateArr = doc.createNestedArray("state");
  for (int i = 0; i < 4; i++) stateArr.add(relayState[i]);

  JsonArray reqArr = doc.createNestedArray("request");
  for (int i = 0; i < 4; i++) reqArr.add(relayState[i]);

  doc["hasRequest"] = false;
  doc["variasi"]    = activeVariasi;

  String body;
  serializeJson(doc, body);
  Serial.println("[POST] " + body);

  int code = httpClient.POST(body);
  httpClient.end();
  Serial.println("[POST] HTTP: " + String(code));

  return (code == 200 || code == 201);
}

// =====================================================
// CEK REQUEST DARI WEB
// =====================================================
void cekRequestDariWeb() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (!httpBegin(webApiUrl)) return;
  int code = httpClient.GET();

  if (code != 200) {
    Serial.println("[GET] Error: " + String(code));
    httpClient.end();
    return;
  }

  String payload = httpClient.getString();
  httpClient.end();

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) return;

  // --- 1. Cek variasi dari web ---
  if (doc.containsKey("variasi")) {
    int webVar = doc["variasi"].as<int>();

    if (webVar != activeVariasi) {
      Serial.println("[GET] Variasi web: " + String(webVar));

      stopVariasi();
      activeVariasi   = webVar;
      variasiStep     = 0;
      lastVariasiTime = millis();

      if (webVar == 0) {
        for (int i = 0; i < 4; i++) relayState[i] = false;
        applyRelayToGPIO();
        pushStateToWeb();
        bot.sendMessage(CHAT_ID, "Variasi dihentikan dari Web", "");
      } else {
        String msg = "Variasi " + String(webVar) + " aktif dari Web\n";
        msg += (webVar == 1) ? "Kedip bergantian R1+R3 vs R2+R4"
                             : "Running light R1->R2->R3->R4";
        bot.sendMessage(CHAT_ID, msg, "");
      }
      return;
    }
  }

  // --- 2. Skip jika variasi aktif ---
  if (activeVariasi != 0) return;

  // --- 3. Cek relay manual dari web ---
  if (!doc.containsKey("hasRequest") ||
      !doc.containsKey("request")) return;

  if (!doc["hasRequest"].as<bool>()) return;

  JsonArray reqArr = doc["request"].as<JsonArray>();
  if (reqArr.size() != 4) return;

  bool changed = false;
  String notifMsg = "Perubahan dari Web:\n";

  for (int i = 0; i < 4; i++) {
    bool req = reqArr[i].as<bool>();
    if (req != relayState[i]) {
      notifMsg   += "Relay " + String(i + 1) + ": " + (req ? "ON\n" : "OFF\n");
      relayState[i] = req;
      changed = true;
    }
  }

  if (!changed) { pushStateToWeb(); return; }

  applyRelayToGPIO();
  if (pushStateToWeb()) bot.sendMessage(CHAT_ID, notifMsg, "");
}

// =====================================================
// SET RELAY
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

// =====================================================
// PROSES PERINTAH
// =====================================================
void prosesPerintah(String chat_id, String text) {
  text.trim();
  text.toLowerCase();
  Serial.println("[CMD] '" + text + "'");

  // ======= SUARA / TEKS BEBAS =======
  if (text == "nyalakan lampu" || text == "hidupkan lampu" ||
      text == "lampu nyala"    || text == "semua lampu nyala") {
    setAllRelay(true);
    bot.sendMessage(chat_id, "Semua lampu ON", ""); return;
  }
  if (text == "matikan lampu" || text == "lampu mati" ||
      text == "semua lampu mati") {
    setAllRelay(false);
    bot.sendMessage(chat_id, "Semua lampu OFF", ""); return;
  }
  if (text == "berapa temperatur" || text == "berapa suhu" ||
      text == "suhu sekarang"     || text == "temperatur sekarang" ||
      text == "/suhu") {
    bot.sendMessage(chat_id,
      dhtOK ? "Suhu saat ini: " + String(dhtTemp, 1) + " C"
            : "Sensor DHT belum siap!", "");
    return;
  }
  if (text == "berapa kelembapan"   || text == "berapa kelembaban" ||
      text == "kelembapan sekarang" || text == "kelembaban sekarang" ||
      text == "/kelembapan") {
    bot.sendMessage(chat_id,
      dhtOK ? "Kelembapan: " + String(dhtHum, 1) + " %"
            : "Sensor DHT belum siap!", "");
    return;
  }

  // ======= VARIASI SUARA =======
  if (text == "nyalakan variasi 1" || text == "variasi 1" ||
      text == "variasi satu"       || text == "nyalakan variasi satu") {
    stopVariasi();
    activeVariasi = 1; variasiStep = 0; lastVariasiTime = millis();
    pushStateToWeb();
    bot.sendMessage(chat_id, "Variasi 1 aktif\nKedip R1+R3 vs R2+R4", ""); return;
  }
  if (text == "nyalakan variasi 2" || text == "variasi 2" ||
      text == "variasi dua"        || text == "nyalakan variasi dua") {
    stopVariasi();
    activeVariasi = 2; variasiStep = 0; lastVariasiTime = millis();
    pushStateToWeb();
    bot.sendMessage(chat_id, "Variasi 2 aktif\nRunning light", ""); return;
  }
  if (text == "matikan variasi" || text == "stop variasi" ||
      text == "hentikan variasi") {
    stopVariasi(); setAllRelay(false);
    bot.sendMessage(chat_id, "Variasi berhenti, semua OFF", ""); return;
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
    msg += "/stop_variasi -> Hentikan\n\n";
    msg += "--- Info ---\n";
    msg += "/state -> Status relay\n";
    msg += "/dht   -> Suhu & Kelembapan\n";
    bot.sendMessage(chat_id, msg, ""); return;
  }

  if (text == "/r1_on")  { setRelay(0, true);  bot.sendMessage(chat_id, "Relay 1 ON",  ""); return; }
  if (text == "/r1_off") { setRelay(0, false); bot.sendMessage(chat_id, "Relay 1 OFF", ""); return; }
  if (text == "/r2_on")  { setRelay(1, true);  bot.sendMessage(chat_id, "Relay 2 ON",  ""); return; }
  if (text == "/r2_off") { setRelay(1, false); bot.sendMessage(chat_id, "Relay 2 OFF", ""); return; }
  if (text == "/r3_on")  { setRelay(2, true);  bot.sendMessage(chat_id, "Relay 3 ON",  ""); return; }
  if (text == "/r3_off") { setRelay(2, false); bot.sendMessage(chat_id, "Relay 3 OFF", ""); return; }
  if (text == "/r4_on")  { setRelay(3, true);  bot.sendMessage(chat_id, "Relay 4 ON",  ""); return; }
  if (text == "/r4_off") { setRelay(3, false); bot.sendMessage(chat_id, "Relay 4 OFF", ""); return; }

  if (text == "/all_on")  { setAllRelay(true);  bot.sendMessage(chat_id, "Semua Relay ON",  ""); return; }
  if (text == "/all_off") { setAllRelay(false); bot.sendMessage(chat_id, "Semua Relay OFF", ""); return; }

  if (text == "/variasi1") {
    stopVariasi();
    activeVariasi = 1; variasiStep = 0; lastVariasiTime = millis();
    pushStateToWeb();
    bot.sendMessage(chat_id, "Variasi 1: Kedip bergantian aktif", ""); return;
  }
  if (text == "/variasi2") {
    stopVariasi();
    activeVariasi = 2; variasiStep = 0; lastVariasiTime = millis();
    pushStateToWeb();
    bot.sendMessage(chat_id, "Variasi 2: Running light aktif", ""); return;
  }
  if (text == "/stop_variasi") {
    stopVariasi(); setAllRelay(false);
    bot.sendMessage(chat_id, "Variasi berhenti, semua OFF", ""); return;
  }

  if (text == "/state") {
    String s = "=== STATUS RELAY ===\n";
    for (int j = 0; j < 4; j++) {
      s += "Relay " + String(j + 1) + " : " + (relayState[j] ? "ON\n" : "OFF\n");
    }
    s += "\nVariasi : ";
    if      (activeVariasi == 1) s += "Variasi 1 aktif\n";
    else if (activeVariasi == 2) s += "Variasi 2 aktif\n";
    else                         s += "Tidak aktif\n";
    if (dhtOK) {
      s += "\nSuhu      : " + String(dhtTemp, 1) + " C\n";
      s += "Kelembapan: " + String(dhtHum, 1)  + " %";
    }
    bot.sendMessage(chat_id, s, ""); return;
  }

  if (text == "/dht") {
    if (!dhtOK) {
      bot.sendMessage(chat_id, "Sensor DHT belum terbaca!\nCek koneksi GPIO 4.", "");
    } else {
      String msg  = "=== DHT11 ===\n";
      msg += "Suhu      : " + String(dhtTemp, 1) + " C\n";
      msg += "Kelembapan: " + String(dhtHum, 1)  + " %";
      bot.sendMessage(chat_id, msg, "");
    }
    return;
  }
}

// =====================================================
// HANDLE TELEGRAM
// =====================================================
void handleNewMessages(int n) {
  for (int i = 0; i < n; i++) {
    if (String(bot.messages[i].chat_id) != CHAT_ID) {
      bot.sendMessage(bot.messages[i].chat_id, "Unauthorized", "");
      continue;
    }
    prosesPerintah(bot.messages[i].chat_id, bot.messages[i].text);
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < 4; i++) {
    pinMode(relayPin[i], OUTPUT);
    digitalWrite(relayPin[i], HIGH);
  }

  dht.begin();

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  // Bypass SSL — lebih cepat dari setCACert
  clientSecure.setInsecure();

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300); // lebih cepat dari 500
    Serial.print(".");
  }
  Serial.println("\nConnected: " + WiFi.localIP().toString());

  // Baca DHT awal
  delay(1500); // warm-up minimal
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) {
    dhtTemp = t; dhtHum = h; dhtOK = true;
    Serial.println("[DHT] Boot OK: " + String(t) + "C " + String(h) + "%");
  }

  pushStateToWeb(); // reset server state
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  unsigned long now = millis();

  // 1. Variasi (prioritas tertinggi, non-blocking)
  if      (activeVariasi == 1) runVariasi1();
  else if (activeVariasi == 2) runVariasi2();

  // 2. Baca DHT lokal (non-blocking)
  bacaDHTLokal();

  // 3. Polling Telegram (500ms)
  if (now - lastBotTime >= BOT_DELAY) {
    int n = bot.getUpdates(bot.last_message_received + 1);
    while (n) {
      handleNewMessages(n);
      n = bot.getUpdates(bot.last_message_received + 1);
    }
    lastBotTime = now;
  }

  // 4. Push DHT ke web (5 detik)
  pushDhtKeWeb();

  // 5. Polling web (1 detik, skip jika variasi aktif)
  if (now - lastWebTime >= WEB_DELAY && activeVariasi == 0) {
    cekRequestDariWeb();
    lastWebTime = now;
  }
}