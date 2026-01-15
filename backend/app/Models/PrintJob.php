<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrintJob extends Model
{
    protected $fillable = [
        'device_id',
        'photo_id',
        'type',
        'options',
        'status',
        'error_message',
        'escpos_path',
        'printed_at',
    ];

    protected $casts = [
        'options' => 'array',
        'printed_at' => 'datetime',
    ];

    public function device()
    {
        return $this->belongsTo(Device::class);
    }

    public function photo()
    {
        return $this->belongsTo(Photo::class);
    }
}
