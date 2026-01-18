import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { processImage } from '../utils/imageProcessor';

const DEVICE_ID = 1;
const STATUS_POLL_INTERVAL = 10000; // Check device status every 10s

export default function Photobooth() {
    const [screen, setScreen] = useState('loading'); // loading, invalid, camera, preview, adjust, printing, done
    const [photoBlob, setPhotoBlob] = useState(null);
    const [photoUrl, setPhotoUrl] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [facingMode, setFacingMode] = useState('user'); // 'user' = front, 'environment' = back

    // Device session
    const [deviceOnline, setDeviceOnline] = useState(false);
    const [sessionToken, setSessionToken] = useState(null);
    const [sessionValid, setSessionValid] = useState(false);
    const [deviceName, setDeviceName] = useState('');

    // Adjustment parameters
    const [contrast, setContrast] = useState(30);
    const [processedImageUrl, setProcessedImageUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const videoRef = useRef(null);
    const streamRef = useRef(null);

    // Get session token from URL
    const getUrlToken = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('session');
    }, []);

    // Validate session against device
    const validateSession = useCallback(async () => {
        const urlToken = getUrlToken();

        if (!urlToken) {
            setSessionValid(false);
            setScreen('invalid');
            return;
        }

        try {
            const res = await axios.get(`/api/devices/${DEVICE_ID}/status`);
            setDeviceOnline(res.data.is_online);
            setDeviceName(res.data.name);

            // Check if URL token matches current device session
            if (res.data.session_token === urlToken) {
                setSessionToken(urlToken);
                setSessionValid(true);
                if (screen === 'loading' || screen === 'invalid') {
                    setScreen('camera');
                }
            } else {
                setSessionToken(null);
                setSessionValid(false);
                setScreen('invalid');
            }
        } catch (err) {
            console.error('Failed to validate session:', err);
            setDeviceOnline(false);
            setSessionValid(false);
            setScreen('invalid');
        }
    }, [getUrlToken, screen]);

    // Initial validation and periodic check
    useEffect(() => {
        validateSession();
        const interval = setInterval(validateSession, STATUS_POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [validateSession]);

    // Start camera
    const startCamera = useCallback(async (facing = facingMode) => {
        try {
            setError(null);
            setCameraReady(false);

            // Stop existing stream first
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                try {
                    await videoRef.current.play();
                } catch (playErr) {
                    // Ignore "play interrupted" error
                    if (!playErr.message.includes('interrupted')) {
                        throw playErr;
                    }
                }
                setCameraReady(true);
            }
        } catch (err) {
            setError('Impossible d\'acceder a la camera: ' + err.message);
        }
    }, [facingMode]);

    // Switch between front and back camera
    const switchCamera = useCallback(() => {
        const newFacing = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newFacing);
        startCamera(newFacing);
    }, [facingMode, startCamera]);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraReady(false);
    }, []);

    // Capture photo
    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !cameraReady) return;

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        // Mirror horizontally only for front camera (selfie)
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(blob => {
            setPhotoBlob(blob);
            setPhotoUrl(URL.createObjectURL(blob));
            setScreen('preview');
            stopCamera();
        }, 'image/jpeg', 0.9);
    }, [cameraReady, stopCamera, facingMode]);

    // Retake photo
    const retake = useCallback(() => {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        setPhotoBlob(null);
        setPhotoUrl(null);
        setProcessedImageUrl(null);
        setContrast(30);
        setError(null);
        setScreen('camera');
    }, [photoUrl, processedImageUrl]);

    // Go to adjust screen
    const goToAdjust = useCallback(async () => {
        setScreen('adjust');
        setIsProcessing(true);
        try {
            const processed = await processImage(photoUrl, { contrast });
            setProcessedImageUrl(processed);
        } catch (err) {
            console.error('Processing error:', err);
        } finally {
            setIsProcessing(false);
        }
    }, [photoUrl, contrast]);

    // Update preview when parameters change
    const updatePreview = useCallback(async () => {
        if (!photoUrl || screen !== 'adjust') return;
        setIsProcessing(true);
        try {
            const processed = await processImage(photoUrl, { contrast });
            setProcessedImageUrl(processed);
        } catch (err) {
            console.error('Processing error:', err);
        } finally {
            setIsProcessing(false);
        }
    }, [photoUrl, contrast, screen]);

    // Debounce preview updates
    useEffect(() => {
        if (screen !== 'adjust') return;
        const timer = setTimeout(updatePreview, 150);
        return () => clearTimeout(timer);
    }, [contrast, screen, updatePreview]);

    // Print photo
    const printPhoto = useCallback(async () => {
        if (!photoBlob) return;

        // Check device is online and we have a session token
        if (!deviceOnline || !sessionToken) {
            setError('L\'imprimante n\'est pas disponible. Veuillez patienter.');
            return;
        }

        setIsLoading(true);
        setScreen('printing');
        setError(null);

        try {
            // Upload photo
            const formData = new FormData();
            formData.append('photo', photoBlob, 'capture.jpg');
            const uploadRes = await axios.post('/api/photos', formData);

            // Create print job with session token
            await axios.post(`/api/devices/${DEVICE_ID}/print-jobs`, {
                type: 'photo',
                photo_id: uploadRes.data.id,
                session_token: sessionToken,
                options: {
                    contrast
                }
            });

            setScreen('done');
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.message || 'Erreur inconnue';

            // If session expired, refresh status and show message
            if (err.response?.status === 403) {
                fetchDeviceStatus();
                setError('Session expirée. L\'imprimante a été redémarrée. Veuillez réessayer.');
            } else if (err.response?.status === 503) {
                setError('L\'imprimante est hors ligne.');
            } else {
                setError(errorMsg);
            }
        } finally {
            setIsLoading(false);
        }
    }, [photoBlob, contrast, sessionToken, deviceOnline, fetchDeviceStatus]);

    // Restart
    const restart = useCallback(() => {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        setPhotoBlob(null);
        setPhotoUrl(null);
        setProcessedImageUrl(null);
        setContrast(30);
        setError(null);
        setIsLoading(false);
        setScreen('camera');
    }, [photoUrl, processedImageUrl]);

    // Auto-start camera when on camera screen and session is valid
    useEffect(() => {
        if (screen === 'camera' && sessionValid) {
            startCamera();
        }
        return () => {
            if (screen === 'camera') stopCamera();
        };
    }, [screen, sessionValid, startCamera, stopCamera]);

    // Auto-restart after success
    useEffect(() => {
        if (screen === 'done') {
            const timer = setTimeout(restart, 5000);
            return () => clearTimeout(timer);
        }
    }, [screen, restart]);

    return (
        <div className="fixed inset-0 flex flex-col bg-black">
            {/* Loading Screen */}
            {screen === 'loading' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-6" />
                    <div className="text-white text-lg">Verification de la session...</div>
                </div>
            )}

            {/* Invalid Session Screen */}
            {screen === 'invalid' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
                        <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="text-white text-xl font-medium mb-2">Session invalide</div>
                    <div className="text-gray-400 text-center max-w-sm">
                        {!getUrlToken()
                            ? "Veuillez scanner le QR code sur l'imprimante pour acceder a l'application."
                            : "Cette session a expire. L'imprimante a ete redemarree. Veuillez scanner le nouveau QR code."}
                    </div>
                </div>
            )}

            {/* Device offline overlay */}
            {!deviceOnline && sessionValid && screen === 'camera' && (
                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656m-7.072 7.072a9 9 0 010-12.728m3.536 3.536a4 4 0 010 5.656" />
                        </svg>
                    </div>
                    <div className="text-white text-xl font-medium mb-2">Imprimante hors ligne</div>
                    <div className="text-gray-400 text-center">En attente de connexion...</div>
                    <div className="mt-4 w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
            )}

            {/* Printer status indicator */}
            {sessionValid && (
                <div className="absolute top-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur">
                    <span className={`w-2 h-2 rounded-full ${deviceOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-white text-xs">{deviceOnline ? 'Imprimante connectee' : 'Hors ligne'}</span>
                </div>
            )}

            {/* Camera Screen */}
            {screen === 'camera' && (
                <>
                    <div className="flex-1 relative overflow-hidden">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                        />
                        {!cameraReady && !error && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-white text-lg">Chargement camera...</div>
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                <div className="text-center">
                                    <div className="text-red-500 text-lg mb-4">Erreur</div>
                                    <div className="text-gray-400 text-sm">{error}</div>
                                </div>
                            </div>
                        )}

                        {/* Switch camera button */}
                        <button
                            onClick={switchCamera}
                            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-black/50 flex items-center justify-center active:scale-95 transition-transform"
                            aria-label="Changer de camera"
                        >
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                    <div className="p-6 flex justify-center bg-black/80">
                        <button
                            onClick={capturePhoto}
                            disabled={!cameraReady || !deviceOnline}
                            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 disabled:opacity-50 active:scale-95 transition-transform"
                        />
                    </div>
                </>
            )}

            {/* Preview Screen */}
            {screen === 'preview' && (
                <>
                    <div className="flex-1 relative overflow-hidden">
                        <img src={photoUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                    </div>
                    <div className="p-6 flex justify-center gap-6 bg-black/80">
                        <button
                            onClick={retake}
                            className="px-8 py-4 rounded-full bg-gray-700 text-white font-medium active:scale-95 transition-transform"
                        >
                            Reprendre
                        </button>
                        <button
                            onClick={goToAdjust}
                            className="px-8 py-4 rounded-full bg-white text-black font-medium active:scale-95 transition-transform"
                        >
                            Suivant
                        </button>
                    </div>
                </>
            )}

            {/* Adjust Screen */}
            {screen === 'adjust' && (
                <>
                    <div className="flex-1 relative overflow-hidden bg-gray-900">
                        {/* Processed preview */}
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            {processedImageUrl ? (
                                <img
                                    src={processedImageUrl}
                                    alt="Preview traite"
                                    className="max-w-full max-h-full object-contain border border-gray-700"
                                    style={{ imageRendering: 'pixelated' }}
                                />
                            ) : (
                                <div className="text-white">Traitement...</div>
                            )}
                        </div>
                        {isProcessing && (
                            <div className="absolute top-4 right-4 w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        )}
                    </div>

                    {/* Controls */}
                    <div className="p-4 bg-black/90 space-y-4">
                        {/* Contrast slider */}
                        <div>
                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                <span>Contraste</span>
                                <span>{contrast}</span>
                            </div>
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                value={contrast}
                                onChange={(e) => setContrast(Number(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
                            />
                        </div>

                        {/* Buttons */}
                        <div className="flex justify-center gap-4 pt-2">
                            <button
                                onClick={() => setScreen('preview')}
                                className="px-6 py-3 rounded-full bg-gray-700 text-white font-medium active:scale-95 transition-transform"
                            >
                                Retour
                            </button>
                            <button
                                onClick={() => setContrast(30)}
                                className="px-6 py-3 rounded-full bg-gray-700 text-white font-medium active:scale-95 transition-transform"
                            >
                                Reset
                            </button>
                            <button
                                onClick={printPhoto}
                                className="px-6 py-3 rounded-full bg-white text-black font-medium active:scale-95 transition-transform"
                            >
                                Imprimer
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Printing Screen */}
            {screen === 'printing' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    {error ? (
                        <div className="text-center">
                            <div className="text-red-500 text-6xl mb-6">!</div>
                            <div className="text-white text-xl mb-4">Erreur</div>
                            <div className="text-gray-400 mb-8">{error}</div>
                            <button
                                onClick={restart}
                                className="px-8 py-4 rounded-full bg-white text-black font-medium active:scale-95 transition-transform"
                            >
                                Reessayer
                            </button>
                        </div>
                    ) : (
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-8" />
                            <div className="text-white text-xl">Envoi vers l'imprimante...</div>
                        </div>
                    )}
                </div>
            )}

            {/* Done Screen */}
            {screen === 'done' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mb-8">
                        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="text-white text-2xl font-medium mb-2">Photo envoyee !</div>
                    <div className="text-gray-400 mb-8">Impression en cours...</div>
                    <button
                        onClick={restart}
                        className="px-8 py-4 rounded-full bg-white text-black font-medium active:scale-95 transition-transform"
                    >
                        Nouvelle photo
                    </button>
                    <div className="text-gray-600 text-sm mt-4">Redemarrage auto dans 5s</div>
                </div>
            )}
        </div>
    );
}
