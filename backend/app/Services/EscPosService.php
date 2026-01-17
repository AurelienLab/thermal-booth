<?php

namespace App\Services;

use Intervention\Image\ImageManager;
use Intervention\Image\Drivers\Gd\Driver;

class EscPosService
{
    const PRINTER_WIDTH = 384;

    // Gamma correction to compensate for thermal printer behavior
    // Values > 1 lighten midtones, < 1 darken them
    const PRINTER_GAMMA = 2.8;

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
        $gray = $this->extractAndProcessPixels($image, $width, $height, $contrast);

        // Apply Floyd-Steinberg dithering and convert to 1-bit
        $pixels = $this->floydSteinbergDither($gray, $width, $height);

        // Generate ESC/POS binary
        return $this->generateEscPosBinary($pixels, $widthBytes, $height);
    }

    private function extractAndProcessPixels($image, int $width, int $height, int $contrast): array
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
                $value = 255 * pow($value / 255, 1 / self::PRINTER_GAMMA);

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
