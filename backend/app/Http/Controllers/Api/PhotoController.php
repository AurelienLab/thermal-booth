<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Photo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PhotoController extends Controller
{
    public function index(Request $request)
    {
        $query = Photo::query()->orderBy('created_at', 'desc');

        if ($request->has('printed')) {
            $query->whereHas('printJobs', fn($q) => $q->where('status', 'printed'));
        }

        return $query->paginate(20);
    }

    public function store(Request $request)
    {
        $request->validate([
            'photo' => 'required|image|max:10240',
        ]);

        $file = $request->file('photo');
        $path = $file->store('photos', 'public');

        [$width, $height] = getimagesize($file->getRealPath());

        $photo = Photo::create([
            'path_original' => $path,
            'width' => $width,
            'height' => $height,
        ]);

        return response()->json([
            'id' => $photo->id,
            'url' => Storage::url($path),
            'width' => $width,
            'height' => $height,
        ], 201);
    }

    public function show(Photo $photo)
    {
        return response()->json([
            'id' => $photo->id,
            'url' => Storage::url($photo->path_original),
            'width' => $photo->width,
            'height' => $photo->height,
            'created_at' => $photo->created_at,
        ]);
    }
}
