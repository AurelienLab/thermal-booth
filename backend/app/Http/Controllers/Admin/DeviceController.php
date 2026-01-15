<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DeviceController extends Controller
{
    public function index()
    {
        $devices = Device::withCount([
            'printJobs',
            'printJobs as printed_count' => fn ($q) => $q->where('status', 'printed'),
            'printJobs as pending_count' => fn ($q) => $q->where('status', 'pending'),
            'printJobs as failed_count' => fn ($q) => $q->where('status', 'failed'),
        ])->get();

        return Inertia::render('Admin/Devices/Index', [
            'devices' => $devices->map(fn ($d) => [
                'id' => $d->id,
                'name' => $d->name,
                'last_seen_at' => $d->last_seen_at?->toISOString(),
                'is_online' => $d->last_seen_at && $d->last_seen_at->gt(now()->subMinutes(5)),
                'meta' => $d->meta,
                'print_jobs_count' => $d->print_jobs_count,
                'printed_count' => $d->printed_count,
                'pending_count' => $d->pending_count,
                'failed_count' => $d->failed_count,
                'created_at' => $d->created_at->toISOString(),
            ]),
        ]);
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

        return back()->with([
            'success' => 'Device created successfully',
            'newDevice' => [
                'id' => $device->id,
                'name' => $device->name,
                'token' => $token,
            ],
        ]);
    }

    public function destroy(Device $device)
    {
        $device->delete();

        return back()->with('success', 'Device deleted successfully');
    }
}
