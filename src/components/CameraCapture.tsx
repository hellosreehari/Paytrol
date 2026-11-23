'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onManualEntry?: () => void;
  disabled?: boolean;
}

export default function CameraCapture({ onCapture, onManualEntry, disabled }: CameraCaptureProps) {
  const [mode, setMode] = useState<'choose' | 'camera' | 'preview'>('choose');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setMode('camera');

      // Bind to video after mode changes and element mounts
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((e) => console.warn('Play error:', e));
        }
      }, 50);
    } catch (err: unknown) {
      console.error('Camera error:', err);
      setCameraError('Camera access unavailable or declined. Please choose a photo from gallery.');
      setMode('choose');
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `dashboard-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          stopCamera();
          setMode('preview');
          onCapture(file);
        }
      },
      'image/jpeg',
      0.92
    );
  }, [onCapture, stopCamera]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setMode('preview');
      onCapture(file);
    }
  };

  const retake = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setMode('choose');
  };

  return (
    <div className="space-y-4">
      {cameraError && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
          {cameraError}
        </div>
      )}

      {/* Mode 1: Camera Active */}
      {mode === 'camera' && (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center border border-slate-700 shadow-2xl">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />

          {/* Rectangular framing guide */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-xs aspect-[16/10] border-2 border-dashed border-indigo-400/80 rounded-2xl shadow-inner relative flex items-center justify-center">
              <span className="text-[11px] font-medium text-white/90 bg-slate-900/80 px-2.5 py-1 rounded-full backdrop-blur-md">
                Frame trip odometer & avg mileage
              </span>
              <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-indigo-400" />
              <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-indigo-400" />
              <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-indigo-400" />
              <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-indigo-400" />
            </div>
          </div>

          {/* Camera controls */}
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-around px-6">
            <button
              onClick={() => {
                stopCamera();
                setMode('choose');
              }}
              className="text-xs bg-slate-900/80 text-slate-300 px-3 py-1.5 rounded-full backdrop-blur-md"
            >
              Cancel
            </button>
            <button
              onClick={capturePhoto}
              disabled={disabled}
              className="w-16 h-16 rounded-full border-4 border-white bg-indigo-600 active:scale-95 transition-transform flex items-center justify-center shadow-lg"
            >
              <div className="w-12 h-12 rounded-full bg-white/20" />
            </button>
            <div className="w-12" /> {/* balance layout */}
          </div>
        </div>
      )}

      {/* Mode 2: Preview of captured image */}
      {mode === 'preview' && previewUrl && (
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/80 shadow-xl">
          <img
            src={previewUrl}
            alt="Dashboard photo preview"
            className="w-full max-h-72 object-contain bg-black/60"
          />
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={retake}
              disabled={disabled}
              className="text-xs bg-slate-900/80 hover:bg-slate-900 text-slate-200 px-3 py-1.5 rounded-lg backdrop-blur-md border border-slate-700 transition-colors"
            >
              Retake / Change
            </button>
          </div>
        </div>
      )}

      {/* Mode 3: Selection buttons */}
      {mode === 'choose' && (
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={startCamera}
            disabled={disabled}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white text-base">Open In-App Camera</p>
              <p className="text-xs text-slate-400">Live viewfinder with cluster framing guide</p>
            </div>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/60 border border-slate-700 hover:border-slate-600 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-slate-700/60 flex items-center justify-center text-slate-300 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white text-base">Choose from Gallery</p>
              <p className="text-xs text-slate-400">Pick an existing dashboard screenshot or photo</p>
            </div>
          </button>

          {onManualEntry && (
            <button
              type="button"
              onClick={onManualEntry}
              disabled={disabled}
              className="flex items-center justify-center py-3 px-4 rounded-xl border border-slate-700 text-slate-300 text-xs hover:border-slate-600 hover:text-white transition-colors"
            >
              Enter trip details manually
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
