'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import { useTripStore } from '@/stores/tripStore';

export default function CapturePage() {
  const router = useRouter();
  const { setPhoto, setPhotoPreviewUrl, setExtraction, setExtracting, setExtractionError } = useTripStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCapture = async (file: File) => {
    setIsProcessing(true);
    setExtracting(true);
    setErrorMsg(null);
    setStatusMessage('Compressing photo for fast analysis...');

    try {
      setPhoto(file);

      // Create preview url for instant display
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreviewUrl(previewUrl);

      setStatusMessage('Sending to Gemini Vision AI (analyzing cluster numbers)...');

      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract readings from photo');
      }

      setStatusMessage('Readings detected! Preparing verification...');

      // Store in Zustand store
      setExtraction({
        distanceKm: data.data.distanceKm,
        avgMileageKmpl: data.data.avgMileageKmpl,
        confidenceDistance: data.data.confidenceDistance,
        confidenceMileage: data.data.confidenceMileage,
        rawText: data.data.rawText,
      });

      // Save public URL or base64 preview into sessionStorage
      sessionStorage.setItem('paytrol_photoURL', data.data.photoURL || previewUrl);

      // Redirect immediately to Mandatory Verification Gate
      router.push('/verify');
    } catch (err: any) {
      console.error('Capture error:', err);
      setErrorMsg(err.message || 'Error processing dashboard photo. Please try again or re-take.');
      setExtractionError(err.message);
    } finally {
      setIsProcessing(false);
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Capture Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">
          Aim at your car&apos;s digital cluster to capture trip distance &amp; average mileage.
        </p>
      </header>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-3">
          <span className="text-base">❌</span>
          <div className="space-y-1">
            <p className="font-semibold text-red-200">Extraction Failed</p>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      {isProcessing ? (
        <div className="rounded-3xl border border-indigo-500/40 bg-gradient-to-b from-indigo-950/40 to-slate-900 p-8 text-center space-y-4 shadow-2xl">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xl">
              🤖
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Analyzing Cluster with AI</p>
            <p className="text-xs text-indigo-300 mt-1">{statusMessage}</p>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
            Distinguishing trip odometer (e.g. 6 km under &quot;Since start&quot;) from total odometer (66639 km) and range (460 km).
          </p>
        </div>
      ) : (
        <CameraCapture onCapture={handleCapture} disabled={isProcessing} />
      )}
    </div>
  );
}
