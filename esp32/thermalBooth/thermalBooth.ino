// ThermalBooth ESP32 - WiFi + API + Impression
// Récupère les jobs depuis Laravel et imprime les fichiers ESC/POS

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================================
// CONFIGURATION - À MODIFIER
// ============================================
const char* WIFI_SSID = "Freebox-615C75";
const char* WIFI_PASSWORD = "7wbt9qf2zmq57d34qvmmn9";
const char* API_BASE_URL = "https://htzgrrz0tx.sharedwithexpose.com/api";
const char* DEVICE_TOKEN = "d84d42e1b53138d2f57a391372488dfafabebf3a986d158ced8df55ea03d1d8f";

// ============================================
// PRINTER CONFIG
// ============================================
#define PRINTER_RX 16
#define PRINTER_TX 17
#define PRINTER_BAUD 9600

// Polling interval (ms)
#define POLL_INTERVAL 5000

// LED
#define LED_BUILTIN 2

// ============================================
// GLOBAL VARIABLES
// ============================================
unsigned long lastPoll = 0;

void setup() {
    Serial.begin(115200);
    Serial2.begin(PRINTER_BAUD, SERIAL_8N1, PRINTER_RX, PRINTER_TX);

    pinMode(LED_BUILTIN, OUTPUT);

    Serial.println("\n=== ThermalBooth ESP32 ===");

    // Init printer
    initPrinter();

    // Connect WiFi
    connectWiFi();

    // Print startup message
    Serial2.println("ThermalBooth Ready!");
    Serial2.println();
    Serial2.println();
}

void loop() {
    // Check WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected, reconnecting...");
        connectWiFi();
    }

    // Poll for jobs
    if (millis() - lastPoll >= POLL_INTERVAL) {
        lastPoll = millis();
        checkForJobs();
    }
}

// ============================================
// WIFI
// ============================================
void connectWiFi() {
    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected!");
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());
        digitalWrite(LED_BUILTIN, HIGH);
    } else {
        Serial.println("\nWiFi connection failed!");
        digitalWrite(LED_BUILTIN, LOW);
    }
}

// ============================================
// PRINTER
// ============================================
void initPrinter() {
    Serial2.write(27);  // ESC @
    Serial2.write(64);
    delay(100);
}

// ============================================
// API
// ============================================
void checkForJobs() {
    Serial.println("Checking for jobs...");

    HTTPClient http;
    String url = String(API_BASE_URL) + "/device/jobs/next";

    http.begin(url);
    http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
    http.addHeader("Accept", "application/json");

    int httpCode = http.GET();

    if (httpCode == 200) {
        String payload = http.getString();
        Serial.println("Response: " + payload);

        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (!error && !doc["job"].isNull()) {
            int jobId = doc["job"]["id"];
            const char* escposUrl = doc["job"]["escpos_url"];

            Serial.print("Job found: ");
            Serial.println(jobId);

            if (escposUrl) {
                bool success = downloadAndPrint(escposUrl);
                sendAck(jobId, success);
            }
        } else {
            Serial.println("No pending jobs");
        }
    } else {
        Serial.print("HTTP error: ");
        Serial.println(httpCode);
    }

    http.end();
}

bool downloadAndPrint(const char* url) {
    Serial.print("Downloading: ");
    Serial.println(url);

    HTTPClient http;
    http.begin(url);

    int httpCode = http.GET();

    if (httpCode != 200) {
        Serial.print("Download failed: ");
        Serial.println(httpCode);
        http.end();
        return false;
    }

    int contentLength = http.getSize();
    Serial.print("Size: ");
    Serial.print(contentLength);
    Serial.println(" bytes");

    // LED blink while printing
    digitalWrite(LED_BUILTIN, LOW);

    // Stream directly to printer
    WiFiClient* stream = http.getStreamPtr();

    uint8_t buffer[128];
    int totalRead = 0;

    while (http.connected() && (contentLength > 0 || contentLength == -1)) {
        size_t available = stream->available();

        if (available) {
            int bytesRead = stream->readBytes(buffer, min(available, sizeof(buffer)));

            // Send to printer
            for (int i = 0; i < bytesRead; i++) {
                Serial2.write(buffer[i]);
            }

            totalRead += bytesRead;

            // Small delay to not overflow printer buffer
            if (totalRead % 384 == 0) {
                delay(20);
            }

            if (contentLength > 0) {
                contentLength -= bytesRead;
            }
        }
        delay(1);
    }

    Serial.print("Printed: ");
    Serial.print(totalRead);
    Serial.println(" bytes");

    // Feed paper
    Serial2.println();
    Serial2.println();
    Serial2.println();

    digitalWrite(LED_BUILTIN, HIGH);
    http.end();

    return true;
}

void sendAck(int jobId, bool success) {
    Serial.print("Sending ACK for job ");
    Serial.print(jobId);
    Serial.print(": ");
    Serial.println(success ? "printed" : "failed");

    HTTPClient http;
    String url = String(API_BASE_URL) + "/device/jobs/" + String(jobId) + "/ack";

    http.begin(url);
    http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");

    String body = success ? "{\"status\":\"printed\"}" : "{\"status\":\"failed\",\"error\":\"PRINT_ERROR\"}";

    int httpCode = http.POST(body);

    if (httpCode == 200) {
        Serial.println("ACK sent successfully");
    } else {
        Serial.print("ACK failed: ");
        Serial.println(httpCode);
    }

    http.end();
}
