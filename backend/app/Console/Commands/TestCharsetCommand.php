<?php

namespace App\Console\Commands;

use App\Events\PrintJobCreated;
use App\Models\Device;
use App\Models\PrintJob;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class TestCharsetCommand extends Command
{
    protected $signature = 'test:charset {device_id=1}';
    protected $description = 'Test different character code pages for accented characters';

    // Code pages to test
    private const CODE_PAGES = [
        0x00 => 'PC437 (USA)',
        0x02 => 'PC850 (Multilingual)',
        0x10 => 'WPC1252 (code 16)',
        0x13 => 'PC858 (Euro)',
        0x2D => 'WPC1252 (code 45)',
    ];

    // Test text with French accents
    private const TEST_TEXT = "éèêëàâäùûüôöîïç";

    public function handle()
    {
        $deviceId = $this->argument('device_id');
        $device = Device::find($deviceId);

        if (!$device) {
            $this->error("Device {$deviceId} not found");
            return 1;
        }

        $this->info("Sending test prints to device: {$device->name}");

        foreach (self::CODE_PAGES as $code => $name) {
            $this->info("Creating job for: {$name}");

            $binary = $this->generateTestPrint($code, $name);

            $printJob = PrintJob::create([
                'device_id' => $device->id,
                'photo_id' => null,
                'type' => 'text',
                'options' => ['test' => $name],
                'status' => 'pending',
            ]);

            $filename = "escpos/{$printJob->id}.bin";
            Storage::disk('public')->put($filename, $binary);
            $printJob->update(['escpos_path' => $filename]);

            broadcast(new PrintJobCreated($printJob))->toOthers();

            $this->info("  -> Job #{$printJob->id} created");

            // Small delay between jobs
            sleep(1);
        }

        $this->info("Done! Check which code page displays accents correctly.");
        return 0;
    }

    private function generateTestPrint(int $codePageNumber, string $codePageName): string
    {
        $data = '';

        // ESC @ - Initialize printer
        $data .= "\x1B\x40";

        // ESC t n - Select character code table
        $data .= "\x1B\x74" . chr($codePageNumber);

        // Print code page name (ASCII only)
        $data .= "\x1B\x61\x01"; // Center
        $data .= "=== {$codePageName} ===\n";
        $data .= "\x1B\x61\x00"; // Left

        // Print test text with conversion
        $data .= "Test: " . $this->convertText(self::TEST_TEXT) . "\n";
        $data .= "Accents: cafe, resume\n";
        $data .= $this->convertText("Café, résumé, où, naïf") . "\n";

        // Feed and cut
        $data .= "\n\n\n";

        return $data;
    }

    private function convertText(string $text): string
    {
        // WPC1252 / ISO-8859-1 mapping
        $map = [
            'à' => "\xE0", 'á' => "\xE1", 'â' => "\xE2", 'ã' => "\xE3", 'ä' => "\xE4",
            'è' => "\xE8", 'é' => "\xE9", 'ê' => "\xEA", 'ë' => "\xEB",
            'ì' => "\xEC", 'í' => "\xED", 'î' => "\xEE", 'ï' => "\xEF",
            'ò' => "\xF2", 'ó' => "\xF3", 'ô' => "\xF4", 'õ' => "\xF5", 'ö' => "\xF6",
            'ù' => "\xF9", 'ú' => "\xFA", 'û' => "\xFB", 'ü' => "\xFC",
            'ç' => "\xE7", 'ñ' => "\xF1",
            'À' => "\xC0", 'Á' => "\xC1", 'Â' => "\xC2", 'Ã' => "\xC3", 'Ä' => "\xC4",
            'È' => "\xC8", 'É' => "\xC9", 'Ê' => "\xCA", 'Ë' => "\xCB",
            'Ì' => "\xCC", 'Í' => "\xCD", 'Î' => "\xCE", 'Ï' => "\xCF",
            'Ò' => "\xD2", 'Ó' => "\xD3", 'Ô' => "\xD4", 'Õ' => "\xD5", 'Ö' => "\xD6",
            'Ù' => "\xD9", 'Ú' => "\xDA", 'Û' => "\xDB", 'Ü' => "\xDC",
            'Ç' => "\xC7", 'Ñ' => "\xD1",
        ];

        $result = '';
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);

        foreach ($chars as $char) {
            if (isset($map[$char])) {
                $result .= $map[$char];
            } elseif (ord($char) < 128) {
                $result .= $char;
            } else {
                $result .= '?';
            }
        }

        return $result;
    }
}
