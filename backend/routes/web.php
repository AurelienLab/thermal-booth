<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\Admin\AuthController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\PhotoController as AdminPhotoController;
use App\Http\Controllers\Admin\PrintJobController as AdminPrintJobController;
use App\Http\Controllers\Admin\DeviceController as AdminDeviceController;
use App\Http\Middleware\AdminAuthenticate;

// PWA (public)
Route::get('/', function () {
    return Inertia::render('Photobooth');
});

// Admin Auth (guest)
Route::get('/admin/login', [AuthController::class, 'showLogin'])->name('admin.login');
Route::post('/admin/login', [AuthController::class, 'login']);

// Admin Protected Routes
Route::prefix('admin')->middleware(AdminAuthenticate::class)->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('admin.logout');

    // Dashboard
    Route::get('/', [DashboardController::class, 'index'])->name('admin.dashboard');

    // Photos
    Route::get('/photos', [AdminPhotoController::class, 'index'])->name('admin.photos.index');
    Route::get('/photos/{photo}', [AdminPhotoController::class, 'show'])->name('admin.photos.show');
    Route::delete('/photos/{photo}', [AdminPhotoController::class, 'destroy'])->name('admin.photos.destroy');
    Route::post('/photos/{photo}/print', [AdminPhotoController::class, 'print'])->name('admin.photos.print');

    // Print Jobs
    Route::get('/print-jobs', [AdminPrintJobController::class, 'index'])->name('admin.print-jobs.index');
    Route::post('/print-jobs/{printJob}/reprint', [AdminPrintJobController::class, 'reprint'])->name('admin.print-jobs.reprint');
    Route::post('/print-jobs/{printJob}/cancel', [AdminPrintJobController::class, 'cancel'])->name('admin.print-jobs.cancel');

    // Devices
    Route::get('/devices', [AdminDeviceController::class, 'index'])->name('admin.devices.index');
    Route::post('/devices', [AdminDeviceController::class, 'store'])->name('admin.devices.store');
    Route::delete('/devices/{device}', [AdminDeviceController::class, 'destroy'])->name('admin.devices.destroy');
});
