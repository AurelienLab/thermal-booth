# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini photobooth system that captures photos via a mobile PWA, processes them through a Laravel backend, and prints on a 58mm thermal printer (EM5820) connected to an ESP32.

**Architecture:** PWA -> Laravel API -> (Polling for now) -> ESP32 -> UART TTL -> Thermal Printer

Key constraint: No direct browser-to-ESP32 communication. Everything routes through Laravel.

## Project Structure

```
thermalBooth/
├── backend/          # Laravel API
├── esp32/
│   └── thermalBooth/ # Arduino sketch
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

- **Backend:** Laravel 12 (PHP) with Intervention Image
- **Frontend:** PWA (to be built)
- **Firmware:** ESP32 (Arduino IDE)
- **Communication:** HTTP Polling (WebSocket planned for V2)
- **Printer:** EM5820 thermal printer (ESC/POS, 384 dots/line, 9600 baud)

## Data Models

- `devices` - ESP32 devices with hashed auth tokens
- `photos` - Uploaded images with original/preview paths
- `print_jobs` - Queue with status (pending/processing/printed/failed/canceled), stores escpos_path

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

## Image Processing Pipeline (Laravel)

Service: `app/Services/EscPosService.php`

1. Load image with Intervention Image
2. Resize to 384px width
3. Convert to grayscale
4. Increase contrast (+30)
5. Floyd-Steinberg dithering (1-bit)
6. Generate ESC/POS binary with GS v 0 command
7. Save to `storage/app/public/escpos/{job_id}.bin`

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

## Current Device Token

Device ID: 1 (ESP32-Booth)
Token: `d84d42e1b53138d2f57a391372488dfafabebf3a986d158ced8df55ea03d1d8f`

## MVP Progress

- [x] ESP32 prints text
- [x] ESP32 prints QR codes
- [x] ESP32 prints bitmap images
- [x] Laravel: photo upload + storage
- [x] Laravel: image → ESC/POS conversion
- [x] Laravel: print job API
- [x] ESP32: WiFi + API polling + print + ACK
- [ ] PWA: capture photo + send
- [ ] Admin UI: jobs list, retry, gallery
- [ ] WebSocket: replace polling with push

## Notes

- ESP32 polls API every 5 seconds
- For external access, use Expose or similar tunnel (backend.test won't resolve on ESP32)
- Increase print contrast by pre-processing images or adjusting delay in ESP32 streaming
