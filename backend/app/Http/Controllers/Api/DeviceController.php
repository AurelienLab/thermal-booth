<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\PrintJob;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DeviceController extends Controller
{
    public function nextJob(Request $request)
    {
        $device = $request->attributes->get('device');

        // Expire pending jobs older than 1 minute
        PrintJob::where('device_id', $device->id)
            ->where('status', 'pending')
            ->where('created_at', '<', now()->subMinute())
            ->update(['status' => 'expired']);

        $job = PrintJob::where('device_id', $device->id)
            ->where('status', 'pending')
            ->orderBy('created_at', 'asc')
            ->first();

        if (!$job) {
            return response()->json(['job' => null]);
        }

        $job->update(['status' => 'processing']);

        return response()->json([
            'job' => [
                'id' => $job->id,
                'type' => $job->type,
                'escpos_url' => $job->escpos_path ? url(Storage::url($job->escpos_path)) : null,
                'options' => $job->options,
            ],
        ]);
    }

    public function ack(Request $request, PrintJob $printJob)
    {
        $request->validate([
            'status' => 'required|in:printed,failed',
            'error' => 'nullable|string',
            'meta' => 'nullable|array',
        ]);

        $printJob->update([
            'status' => $request->status,
            'error_message' => $request->error,
            'printed_at' => $request->status === 'printed' ? now() : null,
        ]);

        return response()->json(['success' => true]);
    }

    public function heartbeat(Request $request)
    {
        $device = $request->attributes->get('device');

        $device->update([
            'last_seen_at' => now(),
            'meta' => array_merge($device->meta ?? [], $request->all()),
        ]);

        return response()->json(['success' => true]);
    }

    public function index()
    {
        return Device::all();
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $token = bin2hex(random_bytes(32));

        $device = Device::create([
            'name' => $request->name,
            'api_token_hash' => hash('sha256', $token),
        ]);

        return response()->json([
            'id' => $device->id,
            'name' => $device->name,
            'token' => $token, // Only shown once
        ], 201);
    }
}
