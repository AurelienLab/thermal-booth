<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
        DB::statement('PRAGMA foreign_keys=off');

        DB::statement('ALTER TABLE print_jobs RENAME TO print_jobs_old');

        DB::statement('
            CREATE TABLE print_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                device_id INTEGER NOT NULL,
                photo_id INTEGER,
                type VARCHAR CHECK (type IN (\'photo\', \'qrcode\', \'text\')) NOT NULL DEFAULT \'photo\',
                options TEXT,
                status VARCHAR CHECK (status IN (\'pending\', \'processing\', \'printed\', \'failed\', \'canceled\', \'expired\')) NOT NULL DEFAULT \'pending\',
                error_message VARCHAR,
                escpos_path VARCHAR,
                printed_at DATETIME,
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
                FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL
            )
        ');

        DB::statement('INSERT INTO print_jobs SELECT * FROM print_jobs_old');

        DB::statement('DROP TABLE print_jobs_old');

        DB::statement('PRAGMA foreign_keys=on');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('PRAGMA foreign_keys=off');

        // Update any 'expired' status to 'canceled' before removing the option
        DB::statement("UPDATE print_jobs SET status = 'canceled' WHERE status = 'expired'");

        DB::statement('ALTER TABLE print_jobs RENAME TO print_jobs_old');

        DB::statement('
            CREATE TABLE print_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                device_id INTEGER NOT NULL,
                photo_id INTEGER,
                type VARCHAR CHECK (type IN (\'photo\', \'qrcode\', \'text\')) NOT NULL DEFAULT \'photo\',
                options TEXT,
                status VARCHAR CHECK (status IN (\'pending\', \'processing\', \'printed\', \'failed\', \'canceled\')) NOT NULL DEFAULT \'pending\',
                error_message VARCHAR,
                escpos_path VARCHAR,
                printed_at DATETIME,
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
                FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL
            )
        ');

        DB::statement('INSERT INTO print_jobs SELECT * FROM print_jobs_old');

        DB::statement('DROP TABLE print_jobs_old');

        DB::statement('PRAGMA foreign_keys=on');
    }
};
