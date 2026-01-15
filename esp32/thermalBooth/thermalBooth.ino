// ThermalBooth ESP32 - WiFi + WebSocket + API + Impression
// Reçoit les jobs via WebSocket (Reverb/Pusher) avec fallback polling

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

// ============================================
// CONFIGURATION - À MODIFIER
// ============================================
const char* WIFI_SSID = "Freebox-615C75";
const char* WIFI_PASSWORD = "7wbt9qf2zmq57d34qvmmn9";

// App URL (without trailing slash)
const char* APP_URL = "https://rhtpavchez.sharedwithexpose.com";
const char* DEVICE_TOKEN = "d84d42e1b53138d2f57a391372488dfafabebf3a986d158ced8df55ea03d1d8f";

// WebSocket (Reverb) config
// Use the Expose URL from: ./start-reverb-expose.sh
const char* WS_HOST = "nt8kjkwyat.sharedwithexpose.com";
const int WS_PORT = 443;  // Expose uses HTTPS/WSS
const bool WS_USE_SSL = true;
const char* REVERB_APP_KEY = "u3t0oluwneliboxhbq4m";
const int DEVICE_ID = 1;

// QR Code settings
const int QR_MODULE_SIZE = 6;  // 1-16, size of each QR module in dots

// ============================================
// PRINTER CONFIG
// ============================================
#define PRINTER_RX 16
#define PRINTER_TX 17
#define PRINTER_BAUD 9600

// Polling interval (ms) - fallback when WebSocket disconnected
#define POLL_INTERVAL 5000

// Heartbeat interval (ms) - to update online status in admin
#define HEARTBEAT_INTERVAL 30000

// LED
#define LED_BUILTIN 2

// ============================================
// GLOBAL VARIABLES
// ============================================
WebSocketsClient webSocket;
bool wsConnected = false;
bool wsSubscribed = false;
unsigned long lastPoll = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastWsReconnect = 0;
const unsigned long WS_RECONNECT_INTERVAL = 10000;

void setup() {
    Serial.begin(115200);
    Serial2.begin(PRINTER_BAUD, SERIAL_8N1, PRINTER_RX, PRINTER_TX);

    pinMode(LED_BUILTIN, OUTPUT);

    Serial.println("\n=== ThermalBooth ESP32 ===");

    // Init printer
    initPrinter();

    // Connect WiFi
    connectWiFi();

    // Setup WebSocket
    setupWebSocket();

    // Send initial heartbeat to mark device as online
    sendHeartbeat();

    // Print QR code with app URL
    printAppQRCode();
}

void loop() {
    // Check WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected, reconnecting...");
        wsConnected = false;
        wsSubscribed = false;
        connectWiFi();
        setupWebSocket();
    }

    // Handle WebSocket
    webSocket.loop();

    // Send heartbeat periodically (for online status in admin)
    if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        lastHeartbeat = millis();
        sendHeartbeat();
    }

    // Fallback: Poll for jobs only if WebSocket is not connected
    if (!wsConnected || !wsSubscribed) {
        if (millis() - lastPoll >= POLL_INTERVAL) {
            lastPoll = millis();
            checkForJobs();
        }

        // Try to reconnect WebSocket periodically
        if (millis() - lastWsReconnect >= WS_RECONNECT_INTERVAL) {
            lastWsReconnect = millis();
            Serial.println("Attempting WebSocket reconnection...");
            setupWebSocket();
        }
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
// WEBSOCKET (Pusher/Reverb protocol)
// ============================================
void setupWebSocket() {
    // Build WebSocket URL path: /app/{key}?protocol=7&client=arduino&version=1.0
    String wsPath = "/app/";
    wsPath += REVERB_APP_KEY;
    wsPath += "?protocol=7&client=arduino&version=1.0";

    Serial.print("Connecting to WebSocket: ");
    Serial.print(WS_USE_SSL ? "wss://" : "ws://");
    Serial.print(WS_HOST);
    Serial.print(":");
    Serial.print(WS_PORT);
    Serial.println(wsPath);

    if (WS_USE_SSL) {
        webSocket.beginSSL(WS_HOST, WS_PORT, wsPath);
    } else {
        webSocket.begin(WS_HOST, WS_PORT, wsPath);
    }
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.println("[WS] Disconnected");
            wsConnected = false;
            wsSubscribed = false;
            break;

        case WStype_CONNECTED:
            Serial.println("[WS] Connected to Reverb");
            wsConnected = true;
            break;

        case WStype_TEXT:
            handlePusherMessage((char*)payload);
            break;

        case WStype_ERROR:
            Serial.println("[WS] Error");
            wsConnected = false;
            wsSubscribed = false;
            break;

        default:
            break;
    }
}

void handlePusherMessage(const char* payload) {
    Serial.print("[WS] Received: ");
    Serial.println(payload);

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
        Serial.println("[WS] JSON parse error");
        return;
    }

    const char* event = doc["event"];
    if (!event) return;

    // Connection established - subscribe to device channel
    if (strcmp(event, "pusher:connection_established") == 0) {
        Serial.println("[WS] Connection established, subscribing to channel...");
        subscribeToChannel();
    }
    // Subscription succeeded
    else if (strcmp(event, "pusher_internal:subscription_succeeded") == 0) {
        Serial.println("[WS] Subscription confirmed!");
        wsSubscribed = true;
    }
    // Print job created event
    else if (strcmp(event, "job.created") == 0) {
        Serial.println("[WS] New print job received!");
        handleJobCreatedEvent(doc["data"]);
    }
    // Ping - respond with pong
    else if (strcmp(event, "pusher:ping") == 0) {
        webSocket.sendTXT("{\"event\":\"pusher:pong\",\"data\":{}}");
    }
}

void subscribeToChannel() {
    String channelName = "device." + String(DEVICE_ID);

    JsonDocument doc;
    doc["event"] = "pusher:subscribe";
    doc["data"]["channel"] = channelName;

    String message;
    serializeJson(doc, message);

    Serial.print("[WS] Subscribing to: ");
    Serial.println(channelName);

    webSocket.sendTXT(message);
}

void handleJobCreatedEvent(JsonVariant data) {
    // When we receive a WebSocket notification, call the API to:
    // 1. Mark the job as "processing" (prevents expiration/duplicate processing)
    // 2. Get the official job data
    // This is more reliable than parsing the WebSocket payload directly
    Serial.println("[WS] Triggering job fetch via API...");
    checkForJobs();
}

// ============================================
// API
// ============================================
void checkForJobs() {
    if (wsConnected && wsSubscribed) {
        Serial.println("[API] Fetching job (triggered by WebSocket)...");
    } else {
        Serial.println("[API] Polling for jobs (WebSocket not connected)...");
    }

    HTTPClient http;
    String url = String(APP_URL) + "/api/device/jobs/next";

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
                delay(5);
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
    String url = String(APP_URL) + "/api/device/jobs/" + String(jobId) + "/ack";

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

void sendHeartbeat() {
    Serial.println("[Heartbeat] Sending...");

    HTTPClient http;
    String url = String(APP_URL) + "/api/device/heartbeat";

    http.begin(url);
    http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");

    // Send status info
    String body = "{\"ws_connected\":" + String(wsConnected ? "true" : "false") +
                  ",\"ws_subscribed\":" + String(wsSubscribed ? "true" : "false") +
                  ",\"free_heap\":" + String(ESP.getFreeHeap()) + "}";

    int httpCode = http.POST(body);

    if (httpCode == 200) {
        Serial.println("[Heartbeat] OK");
    } else {
        Serial.print("[Heartbeat] Failed: ");
        Serial.println(httpCode);
    }

    http.end();
}

// ============================================
// QR CODE PRINTING
// ============================================
void printAppQRCode() {
    Serial.println("[QR] Printing app QR code...");

    String qrData = String(APP_URL);
    printQRCode(qrData.c_str(), "Scannez pour prendre une photo");
}

void printQRCode(const char* data, const char* label) {
    int dataLen = strlen(data);

    // Center alignment
    Serial2.write(27);  // ESC
    Serial2.write(97);  // a
    Serial2.write(1);   // center

    // Print label if provided
    if (label && strlen(label) > 0) {
        Serial2.println();
        Serial2.println(label);
        Serial2.println();
    }

    // QR Code: Select model (Model 2)
    // GS ( k pL pH cn fn n1 n2
    Serial2.write(29);  // GS
    Serial2.write(40);  // (
    Serial2.write(107); // k
    Serial2.write(4);   // pL
    Serial2.write(0);   // pH
    Serial2.write(49);  // cn (49 = QR code)
    Serial2.write(65);  // fn (65 = select model)
    Serial2.write(50);  // n1 (50 = Model 2)
    Serial2.write(0);   // n2

    // QR Code: Set module size
    // GS ( k pL pH cn fn n
    Serial2.write(29);  // GS
    Serial2.write(40);  // (
    Serial2.write(107); // k
    Serial2.write(3);   // pL
    Serial2.write(0);   // pH
    Serial2.write(49);  // cn
    Serial2.write(67);  // fn (67 = set size)
    Serial2.write(QR_MODULE_SIZE);  // module size (1-16)

    // QR Code: Set error correction level (L = 48, M = 49, Q = 50, H = 51)
    // GS ( k pL pH cn fn n
    Serial2.write(29);  // GS
    Serial2.write(40);  // (
    Serial2.write(107); // k
    Serial2.write(3);   // pL
    Serial2.write(0);   // pH
    Serial2.write(49);  // cn
    Serial2.write(69);  // fn (69 = set error correction)
    Serial2.write(49);  // M level (good balance)

    // QR Code: Store data
    // GS ( k pL pH cn fn m d1...dk
    int storeLen = dataLen + 3;
    Serial2.write(29);  // GS
    Serial2.write(40);  // (
    Serial2.write(107); // k
    Serial2.write(storeLen & 0xFF);        // pL
    Serial2.write((storeLen >> 8) & 0xFF); // pH
    Serial2.write(49);  // cn
    Serial2.write(80);  // fn (80 = store data)
    Serial2.write(48);  // m

    // Write the data
    for (int i = 0; i < dataLen; i++) {
        Serial2.write(data[i]);
    }

    // QR Code: Print
    // GS ( k pL pH cn fn m
    Serial2.write(29);  // GS
    Serial2.write(40);  // (
    Serial2.write(107); // k
    Serial2.write(3);   // pL
    Serial2.write(0);   // pH
    Serial2.write(49);  // cn
    Serial2.write(81);  // fn (81 = print)
    Serial2.write(48);  // m

    // Feed paper
    Serial2.println();
    Serial2.println();
    Serial2.println();

    // Reset alignment to left
    Serial2.write(27);  // ESC
    Serial2.write(97);  // a
    Serial2.write(0);   // left

    Serial.println("[QR] Done");
}
