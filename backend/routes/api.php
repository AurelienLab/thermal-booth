<?php

use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\PhotoController;
use App\Http\Controllers\Api\PrintJobController;
use App\Http\Middleware\DeviceAuthenticate;
use Illuminate\Support\Facades\Route;

// PWA API
Route::post('/photos', [PhotoController::class, 'store']);
Route::get('/photos', [PhotoController::class, 'index']);
Route::get('/photos/{photo}', [PhotoController::class, 'show']);

Route::post('/devices/{device}/print-jobs', [PrintJobController::class, 'store']);
Route::get('/devices/{device}/print-jobs', [PrintJobController::class, 'index']);
Route::get('/devices/{device}/status', [DeviceController::class, 'status']);
Route::post('/print-jobs/{printJob}/reprint', [PrintJobController::class, 'reprint']);

// Admin API
Route::get('/devices', [DeviceController::class, 'index']);
Route::post('/devices', [DeviceController::class, 'store']);

// Device API (authenticated by token)
Route::middleware(DeviceAuthenticate::class)->prefix('device')->group(function () {
    Route::get('/jobs/next', [DeviceController::class, 'nextJob']);
    Route::post('/jobs/{printJob}/ack', [DeviceController::class, 'ack']);
    Route::post('/heartbeat', [DeviceController::class, 'heartbeat']);
});
