/**
 * Image processing utilities for thermal printer preview
 * Replicates the PHP EscPosService algorithm in JavaScript
 */

const PRINTER_WIDTH = 384;

/**
 * Load an image from URL into a canvas
 * @param {string} imageUrl - URL or blob URL of the image
 * @returns {Promise<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}>}
 */
export async function loadImage(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve({ canvas, ctx, img });
        };
        img.onerror = reject;
        img.src = imageUrl;
    });
}

/**
 * Resize image to printer width (384px) maintaining aspect ratio
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}}
 */
export function resizeToWidth(sourceCanvas, targetWidth = PRINTER_WIDTH) {
    const aspectRatio = sourceCanvas.height / sourceCanvas.width;
    const newHeight = Math.round(targetWidth * aspectRatio);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, newHeight);

    return { canvas, ctx };
}

/**
 * Convert image to grayscale
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
export function grayscale(imageData) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Standard grayscale conversion
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
        // Alpha unchanged
    }

    return imageData;
}

/**
 * Adjust contrast of grayscale image
 * @param {ImageData} imageData
 * @param {number} contrast - Contrast level (-100 to 100)
 * @returns {ImageData}
 */
export function adjustContrast(imageData, contrast) {
    const data = imageData.data;

    // Convert contrast to factor (similar to Intervention Image)
    // contrast of 0 = no change, positive = more contrast, negative = less
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(factor * (data[i] - 128) + 128);
        data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128);
        data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128);
    }

    return imageData;
}

/**
 * Floyd-Steinberg dithering algorithm
 * Converts grayscale image to 1-bit black/white
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
export function floydSteinbergDither(imageData) {
    const threshold = 128;
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // Create a copy of grayscale values for error diffusion
    const gray = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            gray[y * width + x] = data[idx]; // Use red channel (already grayscale)
        }
    }

    // Apply Floyd-Steinberg dithering
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const oldPixel = gray[idx];
            const newPixel = oldPixel < threshold ? 0 : 255;
            const error = oldPixel - newPixel;

            gray[idx] = newPixel;

            // Distribute error to neighbors
            if (x + 1 < width) {
                gray[idx + 1] += error * 7 / 16;
            }
            if (y + 1 < height) {
                if (x > 0) {
                    gray[(y + 1) * width + (x - 1)] += error * 3 / 16;
                }
                gray[(y + 1) * width + x] += error * 5 / 16;
                if (x + 1 < width) {
                    gray[(y + 1) * width + (x + 1)] += error * 1 / 16;
                }
            }
        }
    }

    // Write back to imageData
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const value = gray[y * width + x] < 128 ? 0 : 255;
            data[idx] = value;
            data[idx + 1] = value;
            data[idx + 2] = value;
        }
    }

    return imageData;
}

/**
 * Clamp value between 0 and 255
 */
function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Process image through the complete pipeline
 * @param {string} imageUrl - Source image URL
 * @param {Object} options - Processing options
 * @param {number} options.contrast - Contrast adjustment (-100 to 100, default 30)
 * @returns {Promise<string>} - Data URL of processed image
 */
export async function processImage(imageUrl, options = {}) {
    const { contrast = 30 } = options;

    // Load image
    const { canvas: sourceCanvas } = await loadImage(imageUrl);

    // Resize to printer width
    const { canvas, ctx } = resizeToWidth(sourceCanvas);

    // Get image data
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Apply transformations
    imageData = grayscale(imageData);
    imageData = adjustContrast(imageData, contrast);
    imageData = floydSteinbergDither(imageData);

    // Put processed data back
    ctx.putImageData(imageData, 0, 0);

    // Return as data URL
    return canvas.toDataURL('image/png');
}

/**
 * Debounced version of processImage for real-time preview
 */
let debounceTimer = null;
export function processImageDebounced(imageUrl, options, callback, delay = 100) {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
        const result = await processImage(imageUrl, options);
        callback(result);
    }, delay);
}
