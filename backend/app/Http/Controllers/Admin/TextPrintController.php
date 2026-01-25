<?php

namespace App\Http\Controllers\Admin;

use App\Events\PrintJobCreated;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\PrintJob;
use App\Services\EscPosService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class TextPrintController extends Controller
{
    public function index()
    {
        $devices = Device::all()->map(fn($device) => [
            'id' => $device->id,
            'name' => $device->name,
            'online' => $device->last_seen_at && $device->last_seen_at->gt(now()->subMinutes(1)),
        ]);

        return Inertia::render('Admin/TextPrint', [
            'devices' => $devices,
        ]);
    }

    public function print(Request $request)
    {
        $validated = $request->validate([
            'device_id' => 'required|exists:devices,id',
            'blocks' => 'required|array|min:1',
            'blocks.*.type' => 'required|in:text,separator,qr,feed',
            'blocks.*.content' => 'nullable|string',
            'blocks.*.align' => 'nullable|in:left,center,right',
            'blocks.*.size' => 'nullable|in:normal,wide,tall,big',
            'blocks.*.bold' => 'nullable|boolean',
            'blocks.*.underline' => 'nullable|boolean',
            'blocks.*.invert' => 'nullable|boolean',
            'blocks.*.char' => 'nullable|string|max:1',
            'blocks.*.lines' => 'nullable|integer|min:1|max:10',
        ]);

        $device = Device::findOrFail($validated['device_id']);

        // Create print job
        $printJob = PrintJob::create([
            'device_id' => $device->id,
            'photo_id' => null,
            'type' => 'text',
            'options' => ['blocks' => $validated['blocks']],
            'status' => 'pending',
        ]);

        // Generate ESC/POS binary
        $escPosService = new EscPosService();
        $binary = $escPosService->convertTextToEscPos($validated['blocks']);

        // Save to file
        $filename = "escpos/{$printJob->id}.bin";
        Storage::disk('public')->put($filename, $binary);

        $printJob->update(['escpos_path' => $filename]);

        // Broadcast to device
        broadcast(new PrintJobCreated($printJob))->toOthers();

        return back()->with('success', 'Impression envoyée !');
    }
}
