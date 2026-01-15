<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Device extends Model
{
    protected $fillable = [
        'name',
        'api_token_hash',
        'last_seen_at',
        'meta',
    ];

    protected $casts = [
        'meta' => 'array',
        'last_seen_at' => 'datetime',
    ];

    protected $hidden = [
        'api_token_hash',
    ];

    public function printJobs()
    {
        return $this->hasMany(PrintJob::class);
    }
}
