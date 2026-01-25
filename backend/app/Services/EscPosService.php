<?php

namespace App\Services;

use Intervention\Image\ImageManager;
use Intervention\Image\Drivers\Gd\Driver;

class EscPosService
{
    const PRINTER_WIDTH = 384;
    const DEFAULT_GAMMA = 1.8;
    const CHARS_PER_LINE = 32; // 58mm printer typical character width

    // Text alignment constants
    const ALIGN_LEFT = 0;
    const ALIGN_CENTER = 1;
    const ALIGN_RIGHT = 2;

    // Text size constants (for GS ! command)
    const SIZE_NORMAL = 0x00;
    const SIZE_DOUBLE_WIDTH = 0x10;
    const SIZE_DOUBLE_HEIGHT = 0x01;
    const SIZE_DOUBLE = 0x11; // Both width and height

    // UTF-8 to CP850 mapping for French accented characters
    private const UTF8_TO_CP850 = [
        'é' => "\x82", 'è' => "\x8A", 'ê' => "\x88", 'ë' => "\x89",
        'à' => "\x85", 'â' => "\x83", 'ä' => "\x84",
        'ù' => "\x97", 'û' => "\x96", 'ü' => "\x81",
        'ô' => "\x93", 'ö' => "\x94", 'ò' => "\x95",
        'î' => "\x8C", 'ï' => "\x8B", 'ì' => "\x8D",
        'ç' => "\x87", 'Ç' => "\x80",
        'É' => "\x90", 'È' => "\xD4", 'Ê' => "\xD2", 'Ë' => "\xD3",
        'À' => "\xB7", 'Â' => "\xB6", 'Ä' => "\x8E",
        'Ù' => "\xEB", 'Û' => "\xEA", 'Ü' => "\x9A",
        'Ô' => "\xE3", 'Ö' => "\x99",
        'Î' => "\xD8", 'Ï' => "\xD7",
        'ñ' => "\xA4", 'Ñ' => "\xA5",
        '€' => "\xD5",
        'œ' => "oe", 'Œ' => "OE", // No direct equivalent, use digraph
        '«' => "\xAE", '»' => "\xAF",
        '°' => "\xF8",
        '²' => "\xFD",
        '³' => "\xFC",
    ];

    /**
     * Convert structured text blocks to ESC/POS binary
     *
     * Block types:
     * - text: { type: "text", content: string, align?: "left"|"center"|"right", size?: "normal"|"wide"|"tall"|"big", bold?: bool, underline?: bool, invert?: bool }
     * - separator: { type: "separator", char?: string }
     * - qr: { type: "qr", content: string, size?: int (1-16) }
     * - feed: { type: "feed", lines?: int }
     */
    public function convertTextToEscPos(array $blocks): string
    {
        $data = '';

        // ESC @ - Initialize printer
        $data .= "\x1B\x40";

        // ESC t 2 - Select character code table CP850 (Multilingual Latin 1)
        $data .= "\x1B\x74\x02";

        foreach ($blocks as $block) {
            $type = $block['type'] ?? 'text';

            switch ($type) {
                case 'text':
                    $data .= $this->renderTextBlock($block);
                    break;
                case 'separator':
                    $data .= $this->renderSeparator($block);
                    break;
                case 'qr':
                    $data .= $this->renderQrCode($block);
                    break;
                case 'feed':
                    $data .= $this->renderFeed($block);
                    break;
            }
        }

        // Final paper feed
        $data .= "\n\n\n";

        return $data;
    }

    /**
     * Convert UTF-8 string to CP850 encoding for thermal printer
     */
    private function convertToCP850(string $text): string
    {
        $result = '';
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);

        foreach ($chars as $char) {
            if (isset(self::UTF8_TO_CP850[$char])) {
                $result .= self::UTF8_TO_CP850[$char];
            } elseif (ord($char) < 128) {
                // ASCII character, keep as-is
                $result .= $char;
            } else {
                // Unknown character, replace with ?
                $result .= '?';
            }
        }

        return $result;
    }

    /**
     * Word wrap text respecting word boundaries
     */
    private function wordWrap(string $text, int $width): array
    {
        if ($width <= 0) {
            $width = self::CHARS_PER_LINE;
        }

        $lines = [];
        $words = preg_split('/\s+/', $text);
        $currentLine = '';

        foreach ($words as $word) {
            // If word itself is longer than width, split it
            if (mb_strlen($word) > $width) {
                if ($currentLine !== '') {
                    $lines[] = $currentLine;
                    $currentLine = '';
                }
                // Split long word
                while (mb_strlen($word) > $width) {
                    $lines[] = mb_substr($word, 0, $width);
                    $word = mb_substr($word, $width);
                }
                if ($word !== '') {
                    $currentLine = $word;
                }
                continue;
            }

            // Check if word fits on current line
            $testLine = $currentLine === '' ? $word : $currentLine . ' ' . $word;
            if (mb_strlen($testLine) <= $width) {
                $currentLine = $testLine;
            } else {
                // Start new line
                if ($currentLine !== '') {
                    $lines[] = $currentLine;
                }
                $currentLine = $word;
            }
        }

        // Add remaining text
        if ($currentLine !== '') {
            $lines[] = $currentLine;
        }

        return $lines ?: [''];
    }

    private function renderTextBlock(array $block): string
    {
        $data = '';
        $content = $block['content'] ?? '';
        $sizeKey = $block['size'] ?? 'normal';

        // Calculate effective line width based on text size
        $lineWidth = match ($sizeKey) {
            'wide', 'big' => self::CHARS_PER_LINE / 2, // Double width = half the characters
            default => self::CHARS_PER_LINE,
        };

        // Set alignment
        $align = match ($block['align'] ?? 'left') {
            'center' => self::ALIGN_CENTER,
            'right' => self::ALIGN_RIGHT,
            default => self::ALIGN_LEFT,
        };
        $data .= "\x1B\x61" . chr($align);

        // Set text size
        $size = match ($sizeKey) {
            'wide' => self::SIZE_DOUBLE_WIDTH,
            'tall' => self::SIZE_DOUBLE_HEIGHT,
            'big' => self::SIZE_DOUBLE,
            default => self::SIZE_NORMAL,
        };
        $data .= "\x1D\x21" . chr($size);

        // Set bold
        $bold = ($block['bold'] ?? false) ? 1 : 0;
        $data .= "\x1B\x45" . chr($bold);

        // Set underline
        $underline = ($block['underline'] ?? false) ? 1 : 0;
        $data .= "\x1B\x2D" . chr($underline);

        // Set invert (white on black)
        $invert = ($block['invert'] ?? false) ? 1 : 0;
        $data .= "\x1D\x42" . chr($invert);

        // Word wrap and convert to CP850
        $lines = $this->wordWrap($content, (int) $lineWidth);
        foreach ($lines as $line) {
            $data .= $this->convertToCP850($line) . "\n";
        }

        // Reset styles
        $data .= "\x1D\x21\x00"; // Normal size
        $data .= "\x1B\x45\x00"; // Bold off
        $data .= "\x1B\x2D\x00"; // Underline off
        $data .= "\x1D\x42\x00"; // Invert off

        return $data;
    }

    private function renderSeparator(array $block): string
    {
        $char = $block['char'] ?? '-';
        $char = $this->convertToCP850($char);
        $line = str_repeat($char, self::CHARS_PER_LINE);

        // Center alignment for separator
        return "\x1B\x61\x01" . $line . "\n" . "\x1B\x61\x00";
    }

    private function renderQrCode(array $block): string
    {
        $content = $block['content'] ?? '';
        $moduleSize = $block['size'] ?? 6;
        $data = '';

        // Center alignment
        $data .= "\x1B\x61\x01";

        // QR Code: Select model (Model 2)
        $data .= "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00";

        // QR Code: Set module size
        $data .= "\x1D\x28\x6B\x03\x00\x31\x43" . chr($moduleSize);

        // QR Code: Set error correction level (M)
        $data .= "\x1D\x28\x6B\x03\x00\x31\x45\x31";

        // QR Code: Store data
        $len = strlen($content) + 3;
        $data .= "\x1D\x28\x6B" . chr($len % 256) . chr(intval($len / 256)) . "\x31\x50\x30" . $content;

        // QR Code: Print
        $data .= "\x1D\x28\x6B\x03\x00\x31\x51\x30";

        $data .= "\n";

        // Reset alignment
        $data .= "\x1B\x61\x00";

        return $data;
    }

    private function renderFeed(array $block): string
    {
        $lines = $block['lines'] ?? 1;
        return str_repeat("\n", $lines);
    }

    public function convertImageToEscPos(string $imagePath, array $options = []): string
    {
        $manager = new ImageManager(new Driver());
        $image = $manager->read($imagePath);

        // Resize to printer width
        $image->scale(width: self::PRINTER_WIDTH);

        // Convert to grayscale
        $image->greyscale();

        $width = $image->width();
        $height = $image->height();
        $widthBytes = (int) ceil($width / 8);

        // Extract pixels and apply contrast + gamma manually for consistency with frontend
        $contrast = $options['contrast'] ?? 30;
        $gamma = $options['gamma'] ?? self::DEFAULT_GAMMA;
        $gray = $this->extractAndProcessPixels($image, $width, $height, $contrast, $gamma);

        // Apply Floyd-Steinberg dithering and convert to 1-bit
        $pixels = $this->floydSteinbergDither($gray, $width, $height);

        // Generate ESC/POS binary
        return $this->generateEscPosBinary($pixels, $widthBytes, $height);
    }

    private function extractAndProcessPixels($image, int $width, int $height, int $contrast, float $gamma): array
    {
        // Contrast factor (same formula as frontend)
        $factor = (259 * ($contrast + 255)) / (255 * (259 - $contrast));

        $gray = [];
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $color = $image->pickColor($x, $y);
                $value = (float) $color->red()->value();

                // Apply contrast (same as frontend)
                $value = $factor * ($value - 128) + 128;
                $value = max(0, min(255, $value));

                // Apply gamma correction to compensate for thermal printer
                // This lightens midtones which thermal printers tend to darken
                $value = 255 * pow($value / 255, 1 / $gamma);

                $gray[$y][$x] = $value;
            }
        }

        return $gray;
    }

    private function floydSteinbergDither(array $gray, int $width, int $height): array
    {
        $threshold = 128;

        // Floyd-Steinberg dithering
        $output = [];
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $oldPixel = $gray[$y][$x];
                $newPixel = $oldPixel < $threshold ? 0 : 255;
                $output[$y][$x] = $newPixel === 0 ? 1 : 0; // 1 = black, 0 = white
                $error = $oldPixel - $newPixel;

                // Distribute error to neighbors
                if ($x + 1 < $width) {
                    $gray[$y][$x + 1] += $error * 7 / 16;
                }
                if ($y + 1 < $height) {
                    if ($x > 0) {
                        $gray[$y + 1][$x - 1] += $error * 3 / 16;
                    }
                    $gray[$y + 1][$x] += $error * 5 / 16;
                    if ($x + 1 < $width) {
                        $gray[$y + 1][$x + 1] += $error * 1 / 16;
                    }
                }
            }
        }

        return $output;
    }

    private function generateEscPosBinary(array $pixels, int $widthBytes, int $height): string
    {
        $data = '';

        // ESC @ - Initialize printer
        $data .= "\x1B\x40";

        // GS v 0 - Print raster bit image
        // Format: GS v 0 m xL xH yL yH [data]
        $data .= "\x1D\x76\x30";
        $data .= chr(0); // m = 0 (normal)
        $data .= chr($widthBytes % 256); // xL
        $data .= chr((int) ($widthBytes / 256)); // xH
        $data .= chr($height % 256); // yL
        $data .= chr((int) ($height / 256)); // yH

        // Pack pixels into bytes (MSB first)
        $width = $widthBytes * 8;
        for ($y = 0; $y < $height; $y++) {
            for ($byteIndex = 0; $byteIndex < $widthBytes; $byteIndex++) {
                $byte = 0;
                for ($bit = 0; $bit < 8; $bit++) {
                    $x = $byteIndex * 8 + $bit;
                    if ($x < count($pixels[$y]) && $pixels[$y][$x] === 1) {
                        $byte |= (0x80 >> $bit);
                    }
                }
                $data .= chr($byte);
            }
        }

        // Feed paper
        $data .= "\n\n\n";

        return $data;
    }
}
