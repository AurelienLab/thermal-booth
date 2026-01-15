<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Photo;
use App\Models\PrintJob;
use App\Services\EscPosService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class PhotoController extends Controller
{
    public function index(Request $request)
    {
        $photos = Photo::with(['printJobs' => fn ($q) => $q->latest()])
            ->orderBy('created_at', 'desc')
            ->paginate(24);

        return Inertia::render('Admin/Photos/Index', [
            'photos' => $photos->through(fn ($p) => [
                'id' => $p->id,
                'url' => Storage::url($p->path_original),
                'width' => $p->width,
                'height' => $p->height,
                'created_at' => $p->created_at->toISOString(),
                'print_count' => $p->printJobs->count(),
                'last_printed_at' => $p->printJobs->first()?->printed_at?->toISOString(),
            ]),
            'devices' => Device::all(['id', 'name']),
        ]);
    }

    public function show(Photo $photo)
    {
        return Inertia::render('Admin/Photos/Show', [
            'photo' => [
                'id' => $photo->id,
                'url' => Storage::url($photo->path_original),
                'width' => $photo->width,
                'height' => $photo->height,
                'created_at' => $photo->created_at->toISOString(),
                'print_jobs' => $photo->printJobs()->with('device')->latest()->get()->map(fn ($j) => [
                    'id' => $j->id,
                    'device_name' => $j->device->name,
                    'status' => $j->status,
                    'created_at' => $j->created_at->toISOString(),
                    'printed_at' => $j->printed_at?->toISOString(),
                    'error_message' => $j->error_message,
                ]),
            ],
            'devices' => Device::all(['id', 'name']),
        ]);
    }

    public function destroy(Photo $photo)
    {
        // Delete associated files
        if ($photo->path_original) {
            Storage::disk('public')->delete($photo->path_original);
        }
        if ($photo->path_preview) {
            Storage::disk('public')->delete($photo->path_preview);
        }

        // Delete ESC/POS files for related print jobs
        foreach ($photo->printJobs as $job) {
            if ($job->escpos_path) {
                Storage::disk('public')->delete($job->escpos_path);
            }
        }

        $photo->delete();

        return redirect()->route('admin.photos.index')
            ->with('success', 'Photo deleted successfully');
    }

    public function print(Request $request, Photo $photo)
    {
        $request->validate([
            'device_id' => 'required|exists:devices,id',
            'contrast' => 'integer|min:-100|max:100',
        ]);

        $printJob = PrintJob::create([
            'device_id' => $request->device_id,
            'photo_id' => $photo->id,
            'type' => 'photo',
            'options' => ['contrast' => $request->contrast ?? 30],
            'status' => 'pending',
        ]);

        // Generate ESC/POS file
        $this->generateEscPosFile($printJob);

        return back()->with('success', 'Print job created');
    }

    private function generateEscPosFile(PrintJob $printJob): void
    {
        $photo = $printJob->photo;
        $imagePath = Storage::disk('public')->path($photo->path_original);

        $escPosService = new EscPosService();
        $binary = $escPosService->convertImageToEscPos($imagePath, $printJob->options ?? []);

        $escPosPath = 'escpos/'.$printJob->id.'.bin';
        Storage::disk('public')->put($escPosPath, $binary);

        $printJob->update(['escpos_path' => $escPosPath]);
    }
}
