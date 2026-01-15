import { useState, useEffect } from 'react';
import { processImage } from '@/utils/imageProcessor';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';

export default function DitherPreview({ imageUrl, initialContrast = 30, onContrastChange }) {
    const [contrast, setContrast] = useState(initialContrast);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(true);

    useEffect(() => {
        if (!imageUrl) return;

        setIsProcessing(true);
        const timer = setTimeout(async () => {
            try {
                const result = await processImage(imageUrl, { contrast });
                setPreviewUrl(result);
            } catch (error) {
                console.error('Error processing image:', error);
            } finally {
                setIsProcessing(false);
            }
        }, 150);

        return () => clearTimeout(timer);
    }, [imageUrl, contrast]);

    const handleContrastChange = (value) => {
        setContrast(value[0]);
        onContrastChange?.(value[0]);
    };

    return (
        <div className="space-y-4">
            <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                {previewUrl ? (
                    <img
                        src={previewUrl}
                        alt="Dithered preview"
                        className="max-w-full max-h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                    />
                ) : (
                    <Skeleton className="w-full h-full" />
                )}
                {isProcessing && previewUrl && (
                    <div className="absolute top-2 right-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contrast</span>
                    <span className="font-medium">{contrast}</span>
                </div>
                <Slider
                    value={[contrast]}
                    onValueChange={handleContrastChange}
                    min={-100}
                    max={100}
                    step={1}
                />
            </div>
        </div>
    );
}
