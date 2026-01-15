#!/bin/bash
# Start Reverb with Expose tunnel for ESP32 WebSocket access

echo "Starting Laravel Reverb..."
echo "WebSocket will be available at the Expose URL shown below"
echo ""

# Start Reverb in background
herd php artisan reverb:start &
REVERB_PID=$!

# Wait for Reverb to start
sleep 2

# Expose the Reverb port
echo "Creating Expose tunnel for WebSocket (port 8080)..."
expose share localhost:8080 --subdomain=thermalbooth-ws

# Cleanup on exit
trap "kill $REVERB_PID 2>/dev/null" EXIT
