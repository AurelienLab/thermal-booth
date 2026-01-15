<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Photo;
use App\Models\PrintJob;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index()
    {
        $now = now();

        return Inertia::render('Admin/Dashboard', [
            'stats' => [
                'totalPhotos' => Photo::count(),
                'totalPrintJobs' => PrintJob::count(),
                'printedJobs' => PrintJob::where('status', 'printed')->count(),
                'pendingJobs' => PrintJob::where('status', 'pending')->count(),
                'failedJobs' => PrintJob::where('status', 'failed')->count(),
                'successRate' => $this->calculateSuccessRate(),
            ],
            'recentPhotos' => Photo::with('printJobs')
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->get()
                ->map(fn ($p) => [
                    'id' => $p->id,
                    'url' => Storage::url($p->path_original),
                    'created_at' => $p->created_at->toISOString(),
                    'print_count' => $p->printJobs->count(),
                ]),
            'activeDevices' => Device::where('last_seen_at', '>=', $now->subMinutes(5))
                ->get()
                ->map(fn ($d) => [
                    'id' => $d->id,
                    'name' => $d->name,
                    'last_seen_at' => $d->last_seen_at?->toISOString(),
                ]),
            'totalDevices' => Device::count(),
        ]);
    }

    private function calculateSuccessRate(): float
    {
        $total = PrintJob::whereIn('status', ['printed', 'failed'])->count();
        if ($total === 0) {
            return 100;
        }

        $success = PrintJob::where('status', 'printed')->count();

        return round(($success / $total) * 100, 1);
    }
}
