<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('print_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->onDelete('cascade');
            $table->foreignId('photo_id')->nullable()->constrained()->onDelete('set null');
            $table->enum('type', ['photo', 'qrcode', 'text'])->default('photo');
            $table->json('options')->nullable();
            $table->enum('status', ['pending', 'processing', 'printed', 'failed', 'canceled'])->default('pending');
            $table->string('error_message')->nullable();
            $table->string('escpos_path')->nullable();
            $table->timestamp('printed_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('print_jobs');
    }
};
