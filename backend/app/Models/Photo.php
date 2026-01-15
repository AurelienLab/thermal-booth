<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Photo extends Model
{
    protected $fillable = [
        'path_original',
        'path_preview',
        'width',
        'height',
    ];

    public function printJobs()
    {
        return $this->hasMany(PrintJob::class);
    }
}
