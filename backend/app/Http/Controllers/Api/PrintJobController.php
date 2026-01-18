<?php

namespace App\Http\Controllers\Api;

use App\Events\PrintJobCreated;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Photo;
use App\Models\PrintJob;
use App\Services\EscPosService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PrintJobController extends Controller
{
    public function store(Request $request, Device $device)
    {
        $request->validate([
            'type' => 'required|in:photo,qrcode,text',
            'photo_id' => 'required_if:type,photo|exists:photos,id',
            'session_token' => 'required|string',
            'options' => 'nullable|array',
        ]);

        // Validate session token
        if ($device->session_token !== $request->session_token) {
            return response()->json([
                'error' => 'Invalid session token',
                'message' => 'The printer session has expired. Please refresh the page.',
            ], 403);
        }

        // Check device is online (seen in last minute)
        if (!$device->last_seen_at || $device->last_seen_at->lt(now()->subMinute())) {
            return response()->json([
                'error' => 'Device offline',
                'message' => 'The printer is currently offline.',
            ], 503);
        }

        $printJob = PrintJob::create([
            'device_id' => $device->id,
            'photo_id' => $request->photo_id,
            'type' => $request->type,
            'options' => $request->options ?? [],
            'status' => 'pending',
        ]);

        // Generate ESC/POS file if photo type
        if ($request->type === 'photo' && $request->photo_id) {
            $this->generateEscPosFile($printJob);
        }

        // Broadcast to device via WebSocket
        broadcast(new PrintJobCreated($printJob))->toOthers();

        return response()->json([
            'id' => $printJob->id,
            'status' => $printJob->status,
        ], 201);
    }

    public function index(Device $device)
    {
        return $device->printJobs()
            ->orderBy('created_at', 'desc')
            ->paginate(20);
    }

    public function reprint(PrintJob $printJob)
    {
        $newJob = PrintJob::create([
            'device_id' => $printJob->device_id,
            'photo_id' => $printJob->photo_id,
            'type' => $printJob->type,
            'options' => $printJob->options,
            'escpos_path' => $printJob->escpos_path,
            'status' => 'pending',
        ]);

        // Broadcast to device via WebSocket
        broadcast(new PrintJobCreated($newJob))->toOthers();

        return response()->json([
            'id' => $newJob->id,
            'status' => $newJob->status,
        ], 201);
    }

    private function generateEscPosFile(PrintJob $printJob): void
    {
        $photo = $printJob->photo;
        $device = $printJob->device;
        $imagePath = Storage::disk('public')->path($photo->path_original);

        // Merge device gamma with job options
        $options = array_merge($printJob->options ?? [], [
            'gamma' => $device->gamma,
        ]);

        $escPosService = new EscPosService();
        $binary = $escPosService->convertImageToEscPos($imagePath, $options);

        $escPosPath = 'escpos/' . $printJob->id . '.bin';
        Storage::disk('public')->put($escPosPath, $binary);

        $printJob->update(['escpos_path' => $escPosPath]);
    }
}
