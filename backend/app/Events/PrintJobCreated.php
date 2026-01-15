<?php

namespace App\Events;

use App\Models\PrintJob;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PrintJobCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public PrintJob $printJob
    ) {
        Log::info('PrintJobCreated event constructed', [
            'job_id' => $printJob->id,
            'device_id' => $printJob->device_id,
            'channel' => 'device.' . $printJob->device_id,
        ]);
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('device.'.$this->printJob->device_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'job.created';
    }

    public function broadcastWith(): array
    {
        return [
            'job_id' => $this->printJob->id,
            'type' => $this->printJob->type,
            'escpos_url' => $this->printJob->escpos_path
                ? url(Storage::url($this->printJob->escpos_path))
                : null,
        ];
    }
}
