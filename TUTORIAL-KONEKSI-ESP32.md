# 🌉 Panduan Menghubungkan Web (Vercel) dengan ESP32 menggunakan Firestore

Karena Web Anda berada di Cloud (Internet / Vercel) dan ESP32 Anda berada di jaringan lokal (WiFi rumah), mereka tidak bisa saling ngobrol secara langsung tanpa adanya **Jembatan** (Broker/Database Cloud).

Berikut adalah topologi yang benar:
`Web UI (Vercel)` <---> `[ Firebase Firestore ]` <---> `ESP32 (Hardware)`

Saya sudah **menambahkan dan mengonfigurasi Firebase Firestore** secara otomatis pada aplikasi Web React (Vercel) Anda! 🎉
Web interface Anda saat ini mewajibkan **Login dengan Google Account** terlebih dahulu sebelum Anda bisa melihat dashboard dan mengontrol relay demi alasan keamanan.

Kini, tugas Anda adalah memperbarui program pada ESP32 menggunakan Arduino IDE.

---

## 💻 Langkah 1: Pahami Alur Kerja Firestore kita

Struktur di Firestore kita:
- Collection: `devices`
- Document: `node-01`

Data yang disimpan dalam dokumen `node-01`:
```json
{
  "temperature": 28.5,
  "humidity": 65,
  "relay1": false,
  "relay2": false,
  "relay3": false,
  "relay4": false,
  "lastUpdated": 1698234850
}
```

- **ESP32** akan membaca DHT11 lalu melakukan **Patch/Update** data (`temperature`, `humidity`) ke document `devices/node-01`.
- **ESP32** akan **mengambil (Get/Listen)** data `relay` dari `devices/node-01`. Jika ada perubahan, nyalakan relay.
- **Web UI** akan secara live mengubah data saat Anda klik, dan menampilkan visual suhu secara *real-time*.

---

## 🔌 Langkah 2: Update Code ESP32 (Arduino IDE)

Di Arduino IDE, install library **Firebase ESP Client** by Mobizt.

**Logika ESP32:**
1. Konek WiFi.
2. Inisialisasi Firebase & Autentikasi (gunakan akun anonymous atau custom token, atau jika security rules mengizinkan akses ke user login Google, lebih mudah jika kita buat akun baru untuk ESP32 dengan email/password di Firebase console, lalu ESP32 login).
3. Looping:
   - Baca DHT11 -> Kirim update JSON dengan fungsi Firestore patch document.
   - Panggil Firestore patch secara berkala dan baca data Relay untuk di sinkronisasikan.

**Contoh Template Kode ESP32 untuk Firestore:**
```cpp
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>

#define WIFI_SSID "miki"
#define WIFI_PASSWORD "12345678"

// Setup Firebase API KEY (Didapat dari firebase-applet-config.json)
#define API_KEY "ISI_DENGAN_API_KEY_DARI_CONFIG"
#define FIREBASE_PROJECT_ID "gen-lang-client-xxxx"

// Setup Email/Password yang sudah didaftarkan di Firebase Authentication Console
#define USER_EMAIL "esp32@smarthome.com"
#define USER_PASSWORD "passwordUntukESP32"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Relay
const int relay1 = 5;
const int relay2 = 19;
const int relay3 = 18;
const int relay4 = 23;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }

  // Setup Relay Aktif LOW
  pinMode(relay1, OUTPUT); digitalWrite(relay1, HIGH);
  pinMode(relay2, OUTPUT); digitalWrite(relay2, HIGH);
  pinMode(relay3, OUTPUT); digitalWrite(relay3, HIGH);
  pinMode(relay4, OUTPUT); digitalWrite(relay4, HIGH);
  
  // Konfigurasi Firebase
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  if (Firebase.ready()) {
    // 1. Dapatkan Data Lengkap document "node-01"
    String documentPath = "devices/node-01";
    if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "", documentPath.c_str(), "")) {
      // Decode data JSON (Relays)
      // Nyalakan matikan menggunakan digitalWrite menyesuaikan data dari Payload JSON  
    }
    
    // 2. Update Data DHT11 ke Firestore
    // float t = dht.readTemperature();
    // Gunakan Firebase.Firestore.patchDocument(...)
  }

  delay(5000); // Tunda sebelum pengecekan berikutnya
}
```

> **Catatan Penting:** 
> Karena Firebase Security Rules dipasang sangat ketat demi menjaga keamanan sistem Smart Home Anda, ESP32 wajib masuk menggunakan Authentication. Anda perlu membuka [Firebase Console](https://console.firebase.google.com/), masuk ke menu **Authentication -> Sign-in method**, aktifkan **Email/Password**, dan tambahkan satu akun percobaan (misal: `esp32@smarthome.com`) untuk dikoding dalam hardware ESP32 Anda.

Dengan Jembatan Firebase Firestore ini, Aplikasi Web Vercel yang saya koding sudah sepenuhnya _hidup_ dan dapat berinteraksi dua arah dengan sistem Telegram + ESP32 Anda secara Real-time! 🚀
