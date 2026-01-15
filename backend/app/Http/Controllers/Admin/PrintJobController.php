<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\PrintJob;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class PrintJobController extends Controller
{
    public function index(Request $request)
    {
        $query = PrintJob::with(['device', 'photo'])
            ->orderBy('created_at', 'desc');

        // Filters
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('device_id')) {
            $query->where('device_id', $request->device_id);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $jobs = $query->paginate(20)->withQueryString();

        return Inertia::render('Admin/PrintJobs/Index', [
            'jobs' => $jobs->through(fn ($job) => [
                'id' => $job->id,
                'photo_url' => $job->photo ? Storage::url($job->photo->path_original) : null,
                'photo_id' => $job->photo_id,
                'device_name' => $job->device->name,
                'device_id' => $job->device_id,
                'type' => $job->type,
                'status' => $job->status,
                'error_message' => $job->error_message,
                'options' => $job->options,
                'created_at' => $job->created_at->toISOString(),
                'printed_at' => $job->printed_at?->toISOString(),
            ]),
            'filters' => $request->only(['status', 'device_id', 'date_from', 'date_to']),
            'devices' => Device::all(['id', 'name']),
            'statuses' => ['pending', 'processing', 'printed', 'failed', 'canceled'],
        ]);
    }

    public function reprint(PrintJob $printJob)
    {
        PrintJob::create([
            'device_id' => $printJob->device_id,
            'photo_id' => $printJob->photo_id,
            'type' => $printJob->type,
            'options' => $printJob->options,
            'escpos_path' => $printJob->escpos_path,
            'status' => 'pending',
        ]);

        return back()->with('success', 'Reprint job created');
    }

    public function cancel(PrintJob $printJob)
    {
        if ($printJob->status !== 'pending') {
            return back()->withErrors(['error' => 'Only pending jobs can be canceled']);
        }

        $printJob->update(['status' => 'canceled']);

        return back()->with('success', 'Print job canceled');
    }
}
