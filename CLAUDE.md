# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini photobooth system that captures photos via a mobile PWA, processes them through a Laravel backend, and prints on a 58mm thermal printer (EM5820) connected to an ESP32.

**Architecture:** PWA -> Laravel API -> WebSocket (Reverb) -> ESP32 -> UART TTL -> Thermal Printer

Key constraint: No direct browser-to-ESP32 communication. Everything routes through Laravel.

## Project Structure

```
thermalBooth/
├── backend/                          # Laravel API + Frontend
│   ├── app/
│   │   ├── Http/Controllers/Admin/   # Admin controllers
│   │   ├── Http/Middleware/AdminAuthenticate.php
│   │   └── Services/EscPosService.php
│   ├── resources/js/
│   │   ├── Pages/
│   │   │   ├── Photobooth.jsx        # Main PWA component
│   │   │   └── Admin/                # Admin pages (Dashboard, Photos, PrintJobs, Devices)
│   │   ├── layouts/AdminLayout.jsx   # Admin sidebar layout
│   │   ├── components/ui/            # shadcn/ui components
│   │   ├── components/admin/         # Admin-specific components
│   │   └── utils/imageProcessor.js   # Client-side image processing
│   └── ...
├── esp32/
│   └── thermalBooth/                 # Arduino sketch
├── CLAUDE.md
└── photobooth-plan.md
```

## Commands

### Laravel Backend
```bash
cd backend
herd php artisan serve          # Run dev server (or use Herd)
herd php artisan migrate        # Run migrations
herd php artisan route:list     # List routes
herd composer require <pkg>     # Install package
```

Backend URL: http://backend.test (via Herd)

### ESP32
- Open `esp32/thermalBooth/thermalBooth.ino` in Arduino IDE
- Board: ESP32 Dev Module
- Upload and monitor at 115200 baud

## Technology Stack

- **Backend:** Laravel 12 (PHP) with Intervention Image, Inertia.js
- **Frontend:** React 19 PWA with Tailwind CSS v4, shadcn/ui
- **Firmware:** ESP32 (Arduino IDE)
- **Communication:** WebSocket (Laravel Reverb) with HTTP polling fallback
- **Printer:** EM5820 thermal printer (ESC/POS, 384 dots/line, 9600 baud)

## Data Models

- `devices` - ESP32 devices with hashed auth tokens
- `photos` - Uploaded images with original/preview paths
- `print_jobs` - Queue with status (pending/processing/printed/failed/canceled/expired), stores escpos_path. Jobs pending > 1 minute auto-expire.

## ESP32 Hardware Setup

**Printer:** EM5820 (requires ESC/POS mode, configured via USB utility)

**Wiring:**
- GPIO 17 (TX2) → Printer RX (yellow)
- GPIO 16 (RX2) → Printer TX (green, optional)
- GND → GND (common with printer)

**Power:**
- Printer needs BOTH USB power (logic) AND DC/TTL VCC (thermal head)
- Never power printer from ESP32 5V pin
- Printer peaks at 2A during image print

**Printer Settings (via USB utility):**
- Baud Rate: 9600
- Flow Control: NONE
- Instruction Set: ESC/POS

## ESP32 WiFi Provisioning (BLE)

The ESP32 supports WiFi configuration via Bluetooth Low Energy (BLE), with multi-network support (up to 5 networks).

### First Setup / No Saved Networks
1. ESP32 starts in provisioning mode (LED blinks slowly)
2. Thermal printer prints setup instructions
3. Download **ESP BLE Provisioning** app:
   - [Android](https://play.google.com/store/apps/details?id=com.espressif.provble)
   - [iOS](https://apps.apple.com/app/esp-ble-provisioning/id1473590141)
4. Connect to device: `ThermalBooth`
5. Enter password: `thermalbooth`
6. Select WiFi network and enter password
7. ESP32 saves the network and connects

### Multi-Network Support
- Up to 5 WiFi networks can be saved
- ESP32 automatically connects to the best available network
- New networks replace the oldest when at capacity
- Same SSID = credentials updated (no duplicate)

### Reset WiFi (BOOT Button)
- Hold the **BOOT button** (GPIO 0) for **3 seconds**
- LED blinks faster as reset approaches
- All saved networks are cleared
- ESP32 restarts in provisioning mode

### Configuration Constants
In `esp32/thermalBooth/thermalBooth.ino`:
```cpp
#define PROV_DEVICE_NAME    "ThermalBooth"   // BLE device name
#define PROV_POP            "thermalbooth"   // BLE password
#define MAX_WIFI_NETWORKS   5                // Max saved networks
#define RESET_HOLD_TIME     3000             // Reset button hold time (ms)
```

## Image Processing Pipeline

### Backend (Laravel)

Service: `app/Services/EscPosService.php`

1. Load image with Intervention Image
2. Resize to 384px width
3. Convert to grayscale
4. Adjust contrast (configurable, default +30)
5. Floyd-Steinberg dithering (1-bit, threshold 128)
6. Generate ESC/POS binary with GS v 0 command
7. Save to `storage/app/public/escpos/{job_id}.bin`

### Frontend (JavaScript)

Utility: `resources/js/utils/imageProcessor.js`

Replicates the backend algorithm for real-time preview:
- Same pipeline: resize → grayscale → contrast → Floyd-Steinberg dithering
- User can adjust contrast (-100 to +100) before printing
- Preview updates in real-time with debouncing

## API Endpoints

**PWA/Admin:**
- `POST /api/photos` - Upload photo (multipart)
- `GET /api/photos` - Gallery listing
- `GET /api/photos/{id}` - Photo details
- `POST /api/devices` - Create device (returns token once)
- `GET /api/devices` - List devices
- `POST /api/devices/{id}/print-jobs` - Create print job
- `GET /api/devices/{id}/print-jobs` - List device jobs
- `POST /api/print-jobs/{id}/reprint` - Reprint job

**Device (requires Bearer token):**
- `GET /api/device/jobs/next` - Get next pending job (marks as processing)
- `POST /api/device/jobs/{id}/ack` - Acknowledge completion
- `POST /api/device/heartbeat` - Device status update

## PWA User Flow

Component: `resources/js/Pages/Photobooth.jsx`

1. **Camera** - Live viewfinder with capture button, front/back camera switch
2. **Preview** - Review captured photo, option to retake or continue
3. **Adjust** - Real-time dithered preview, contrast slider (-100 to +100)
4. **Printing** - Loading state while uploading and creating print job
5. **Done** - Success confirmation, auto-restart after 5 seconds

## Current Device Token

Device ID: 1 (ESP32-Booth)
Token: `d84d42e1b53138d2f57a391372488dfafabebf3a986d158ced8df55ea03d1d8f`

## Admin Interface

**URL:** http://backend.test/admin
**Password:** admin (configurable via `ADMIN_PASSWORD_HASH` in .env)

### Features
- **Dashboard** - Stats overview, recent photos, active devices
- **Photos** - Gallery with dithered preview, contrast adjustment, print to device
- **Print Jobs** - History with filters (status, device, date), reprint/cancel actions
- **Devices** - Manage ESP32 devices, online status, create new (shows token once)

### Admin Routes
```
/admin/login     - Password login
/admin           - Dashboard
/admin/photos    - Photo gallery
/admin/photos/{id} - Photo detail + print
/admin/print-jobs - Print jobs history
/admin/devices   - Devices management
```

### Change Admin Password
```bash
php artisan tinker
> Hash::make('your-new-password')
# Copy the output to .env ADMIN_PASSWORD_HASH
```

## WebSocket (Reverb)

Laravel Reverb handles real-time communication with ESP32 devices using the Pusher protocol.

### Start Reverb locally
```bash
herd php artisan reverb:start
```

### Start Reverb with Expose (for ESP32 access)
```bash
./start-reverb-expose.sh
```
This creates a tunnel at `thermalbooth-ws.sharedwithexpose.com`

### ESP32 WebSocket Config
In `esp32/thermalBooth/thermalBooth.ino`:
- `WS_HOST` - Expose URL for WebSocket (e.g., `thermalbooth-ws.sharedwithexpose.com`)
- `WS_PORT` - 443 for SSL (Expose), 8080 for local
- `WS_USE_SSL` - true for Expose, false for local
- `REVERB_APP_KEY` - from `.env` REVERB_APP_KEY

### How it works
1. ESP32 connects to Reverb via WebSocket (Pusher protocol)
2. Subscribes to channel `device.{DEVICE_ID}`
3. Receives `job.created` events instantly when a print job is created
4. Falls back to HTTP polling every 5s if WebSocket disconnects

### Event: PrintJobCreated
- Channel: `device.{device_id}`
- Event name: `job.created`
- Payload: `{ job_id, type, escpos_url }`

## MVP Progress

- [x] ESP32 prints text
- [x] ESP32 prints QR codes
- [x] ESP32 prints bitmap images
- [x] Laravel: photo upload + storage
- [x] Laravel: image → ESC/POS conversion
- [x] Laravel: print job API
- [x] ESP32: WiFi + API polling + print + ACK
- [x] ESP32: BLE WiFi provisioning with multi-network support
- [x] PWA: camera capture (front/back switch)
- [x] PWA: photo preview before print
- [x] PWA: real-time dithering preview with contrast adjustment
- [x] PWA: send to print queue
- [x] Admin UI: dashboard, gallery, jobs list, retry, devices
- [x] WebSocket: Reverb + ESP32 client with polling fallback

## Notes

- ESP32 uses WebSocket for instant job notifications, falls back to polling every 5s if disconnected
- For external access, use Expose tunnels for both API and WebSocket (backend.test won't resolve on ESP32)
- Contrast is adjustable in PWA before printing (default +30)
- Print jobs pending > 1 minute are automatically expired to prevent stale prints
