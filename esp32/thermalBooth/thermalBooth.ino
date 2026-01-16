// ThermalBooth ESP32 - WiFi + WebSocket + API + Impression
// Reçoit les jobs via WebSocket (Reverb/Pusher) avec fallback polling
// WiFi provisioning via Bluetooth (BLE) avec support multi-réseau

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiProv.h>
#include <Preferences.h>
#include <esp_wifi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

// ============================================
// WIFI PROVISIONING CONFIG
// ============================================
#define PROV_DEVICE_NAME    "ThermalBooth"   // Nom visible en Bluetooth
#define PROV_POP            "thermalbooth"   // Proof of Possession (mot de passe BLE)
#define MAX_WIFI_NETWORKS   5                // Nombre max de réseaux sauvegardés
#define RESET_BUTTON_PIN    0                // GPIO 0 = BOOT button
#define RESET_HOLD_TIME     3000             // 3 secondes pour reset WiFi

// ============================================
// WIFI MULTI
// ============================================
WiFiMulti wifiMulti;
Preferences preferences;
bool provisioningActive = false;
bool wifiConnected = false;

// Event flags (set in callback, processed in loop)
volatile bool eventGotIP = false;
volatile bool eventProvCredRecv = false;
volatile bool eventProvCredFail = false;
volatile bool eventProvCredSuccess = false;
volatile uint8_t lastDisconnectReason = 0;

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
    pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

    Serial.println("\n=== ThermalBooth ESP32 ===");
    Serial.println("Hold BOOT button for 3s to reset WiFi");

    // Init printer
    initPrinter();

    // Setup WiFi event handler
    WiFi.onEvent(onWiFiEvent);

    // Load saved networks and try to connect
    loadSavedNetworks();

    if (getSavedNetworkCount() > 0) {
        Serial.println("Connecting to saved networks...");
        connectWiFiMulti();
    }

    // If no saved networks or connection failed, start provisioning
    if (!wifiConnected) {
        startProvisioning();
    } else {
        // Connected! Setup the rest
        setupAfterWiFiConnected();
    }
}

void loop() {
    // Process WiFi events (from lightweight callback)
    processWiFiEvents();

    // Check reset button (BOOT button)
    checkResetButton();

    // If provisioning is active, just wait for WiFi
    if (provisioningActive) {
        blinkLED(500);  // Slow blink during provisioning
        delay(10);
        return;
    }

    // Check WiFi
    if (WiFi.status() != WL_CONNECTED) {
        if (wifiConnected) {
            Serial.println("WiFi disconnected, reconnecting...");
            wifiConnected = false;
            wsConnected = false;
            wsSubscribed = false;
        }

        // Try to reconnect with saved networks
        if (wifiMulti.run() == WL_CONNECTED) {
            Serial.println("WiFi reconnected to: " + WiFi.SSID());
            wifiConnected = true;
            setupWebSocket();
        }
        return;
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
// WIFI MULTI-NETWORK MANAGEMENT
// ============================================
void loadSavedNetworks() {
    preferences.begin("wifi", true);  // read-only

    for (int i = 0; i < MAX_WIFI_NETWORKS; i++) {
        String ssidKey = "ssid" + String(i);
        String passKey = "pass" + String(i);

        String ssid = preferences.getString(ssidKey.c_str(), "");
        String pass = preferences.getString(passKey.c_str(), "");

        if (ssid.length() > 0) {
            wifiMulti.addAP(ssid.c_str(), pass.c_str());
            Serial.println("Loaded network: " + ssid);
        }
    }

    preferences.end();
}

void saveNetwork(const char* ssid, const char* password) {
    preferences.begin("wifi", false);

    // Find next slot (rotation)
    int slot = preferences.getInt("nextSlot", 0);

    // Check if this SSID already exists (update instead of duplicate)
    for (int i = 0; i < MAX_WIFI_NETWORKS; i++) {
        String existingSsid = preferences.getString(("ssid" + String(i)).c_str(), "");
        if (existingSsid == ssid) {
            slot = i;  // Use existing slot
            Serial.println("Updating existing network in slot " + String(slot));
            break;
        }
    }

    String ssidKey = "ssid" + String(slot);
    String passKey = "pass" + String(slot);

    preferences.putString(ssidKey.c_str(), ssid);
    preferences.putString(passKey.c_str(), password);

    // Update next slot (only if we didn't reuse an existing slot)
    int currentNext = preferences.getInt("nextSlot", 0);
    if (slot == currentNext) {
        preferences.putInt("nextSlot", (slot + 1) % MAX_WIFI_NETWORKS);
    }

    preferences.end();

    Serial.print("Network saved in slot ");
    Serial.print(slot);
    Serial.print(": ");
    Serial.println(ssid);

    // Add to WiFiMulti immediately
    wifiMulti.addAP(ssid, password);
}

int getSavedNetworkCount() {
    preferences.begin("wifi", true);
    int count = 0;

    for (int i = 0; i < MAX_WIFI_NETWORKS; i++) {
        String ssid = preferences.getString(("ssid" + String(i)).c_str(), "");
        if (ssid.length() > 0) count++;
    }

    preferences.end();
    return count;
}

void clearAllNetworks() {
    Serial.println("Clearing all saved WiFi networks...");

    preferences.begin("wifi", false);
    preferences.clear();
    preferences.end();

    // Also clear ESP32's internal WiFi credentials
    WiFi.disconnect(true, true);

    Serial.println("All networks cleared!");
}

void connectWiFiMulti() {
    Serial.println("Trying saved networks...");

    int attempts = 0;
    while (wifiMulti.run() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi connected to: " + WiFi.SSID());
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());
        digitalWrite(LED_BUILTIN, HIGH);
        wifiConnected = true;
    } else {
        Serial.println();
        Serial.println("Could not connect to any saved network");
        digitalWrite(LED_BUILTIN, LOW);
        wifiConnected = false;
    }
}

// ============================================
// BLE PROVISIONING
// ============================================
void startProvisioning() {
    Serial.println();
    Serial.println("========================================");
    Serial.println("Starting BLE WiFi Provisioning...");
    Serial.println("Device name: " + String(PROV_DEVICE_NAME));
    Serial.println("Password (POP): " + String(PROV_POP));
    Serial.println("Use 'ESP BLE Provisioning' app");
    Serial.println("  Android: https://play.google.com/store/apps/details?id=com.espressif.provble");
    Serial.println("  iOS: https://apps.apple.com/app/esp-ble-provisioning/id1473590141");
    Serial.println("========================================");
    Serial.println();

    provisioningActive = true;

    // Print instructions on thermal printer
    printProvisioningInstructions();

    Serial.println("[Prov] Calling WiFiProv.beginProvision()...");

    WiFiProv.beginProvision(
        NETWORK_PROV_SCHEME_BLE,
        NETWORK_PROV_SCHEME_HANDLER_FREE_BTDM,
        NETWORK_PROV_SECURITY_1,
        PROV_POP,
        PROV_DEVICE_NAME
    );

    Serial.println("[Prov] beginProvision() called - BLE should be advertising now");
}

void printProvisioningInstructions() {
    // Center alignment
    Serial2.write(27);
    Serial2.write(97);
    Serial2.write(1);

    Serial2.println();
    Serial2.println("=== WiFi Setup ===");
    Serial2.println();
    Serial2.println("1. Download app:");
    Serial2.println("ESP BLE Provisioning");
    Serial2.println();
    Serial2.println("2. Connect to:");
    Serial2.println(PROV_DEVICE_NAME);
    Serial2.println();
    Serial2.println("3. Password:");
    Serial2.println(PROV_POP);
    Serial2.println();
    Serial2.println("==================");
    Serial2.println();
    Serial2.println();

    // Reset alignment
    Serial2.write(27);
    Serial2.write(97);
    Serial2.write(0);
}

// Lightweight event handler - just sets flags, processing done in loop()
void onWiFiEvent(arduino_event_t *event) {
    switch (event->event_id) {
        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            lastDisconnectReason = event->event_info.wifi_sta_disconnected.reason;
            wifiConnected = false;
            break;

        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            eventGotIP = true;
            wifiConnected = true;
            break;

        case ARDUINO_EVENT_PROV_CRED_RECV:
            eventProvCredRecv = true;
            break;

        case ARDUINO_EVENT_PROV_CRED_FAIL:
            eventProvCredFail = true;
            break;

        case ARDUINO_EVENT_PROV_CRED_SUCCESS:
            eventProvCredSuccess = true;
            break;

        default:
            break;
    }
}

// Process events in loop (safe, no stack issues)
void processWiFiEvents() {
    if (lastDisconnectReason != 0) {
        Serial.print("[WiFi] Disconnected - reason: ");
        Serial.println(lastDisconnectReason);
        lastDisconnectReason = 0;
    }

    if (eventProvCredRecv) {
        eventProvCredRecv = false;
        Serial.println("[Prov] Credentials received, connecting...");
    }

    if (eventProvCredFail) {
        eventProvCredFail = false;
        Serial.println("[Prov] Credentials FAILED!");
    }

    if (eventProvCredSuccess) {
        eventProvCredSuccess = false;
        Serial.println("[Prov] Credentials SUCCESS!");
    }

    if (eventGotIP) {
        eventGotIP = false;
        Serial.println("[WiFi] Connected!");
        Serial.print("[WiFi] IP: ");
        Serial.println(WiFi.localIP());
        Serial.print("[WiFi] SSID: ");
        Serial.println(WiFi.SSID());

        if (provisioningActive) {
            // Save the new network
            wifi_sta_config_t conf;
            esp_wifi_get_config(WIFI_IF_STA, (wifi_config_t*)&conf);
            Serial.print("[Prov] Saving network: ");
            Serial.println((const char*)conf.ssid);
            saveNetwork((const char*)conf.ssid, (const char*)conf.password);

            provisioningActive = false;
            Serial.println("[Prov] Provisioning complete!");

            setupAfterWiFiConnected();
        }
    }
}

void setupAfterWiFiConnected() {
    digitalWrite(LED_BUILTIN, HIGH);

    // Setup WebSocket
    setupWebSocket();

    // Send initial heartbeat
    sendHeartbeat();

    // Print QR code with app URL
    printAppQRCode();
}

// ============================================
// RESET BUTTON (BOOT button on GPIO 0)
// ============================================
unsigned long buttonPressStart = 0;
bool buttonWasPressed = false;

void checkResetButton() {
    bool buttonPressed = (digitalRead(RESET_BUTTON_PIN) == LOW);

    if (buttonPressed && !buttonWasPressed) {
        // Button just pressed
        buttonPressStart = millis();
        buttonWasPressed = true;
        Serial.println("Button pressed - hold 3s to reset WiFi...");
    }
    else if (buttonPressed && buttonWasPressed) {
        // Button held
        unsigned long holdTime = millis() - buttonPressStart;

        if (holdTime >= RESET_HOLD_TIME) {
            Serial.println("Resetting WiFi credentials...");
            clearAllNetworks();
            delay(500);
            ESP.restart();
        }

        // Blink faster as we approach reset time
        if (holdTime > 1000) {
            blinkLED(100);
        }
    }
    else if (!buttonPressed && buttonWasPressed) {
        // Button released
        buttonWasPressed = false;
        digitalWrite(LED_BUILTIN, wifiConnected ? HIGH : LOW);
    }
}

// ============================================
// LED HELPER
// ============================================
unsigned long lastBlinkTime = 0;
bool ledState = false;

void blinkLED(int interval) {
    if (millis() - lastBlinkTime >= interval) {
        lastBlinkTime = millis();
        ledState = !ledState;
        digitalWrite(LED_BUILTIN, ledState ? HIGH : LOW);
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
