'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import CameraCapture from '@/components/CameraCapture';
import { useTripStore } from '@/stores/tripStore';
import { compressImage } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function CapturePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const distanceInputId = useId();
  const mileageInputId = useId();
  const fuelPriceInputId = useId();
  const {
    setPhoto,
    setPhotoPreviewUrl,
    setExtraction,
    setFuelPricePerLiter,
    setExtracting,
    setExtractionError,
  } = useTripStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [distanceKm, setDistanceKm] = useState('');
  const [avgMileageKmpl, setAvgMileageKmpl] = useState('');
  const [fuelPrice, setFuelPrice] = useState(
    profile?.lastFuelPrice ? String(profile.lastFuelPrice) : '105'
  );
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCapture = async (file: File) => {
    sessionStorage.removeItem('paytrol_manualEntry');
    setIsProcessing(true);
    setExtracting(true);
    setErrorMsg(null);
    setStatusMessage('Compressing photo for fast analysis...');

    try {
      setPhoto(file);

      const compressed = await compressImage(file, 1024 * 1024);
      const uploadFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg') || 'dashboard.jpg';
      const uploadFile =
        compressed instanceof File
          ? compressed
          : new File([compressed], uploadFileName, { type: 'image/jpeg' });

      setStatusMessage('Sending to Gemini Vision AI (analyzing cluster numbers)...');

      const formData = new FormData();
      formData.append('photo', uploadFile);

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
      sessionStorage.setItem(
        'paytrol_photoURL',
        data.data.photoURL || useTripStore.getState().photoPreviewUrl || ''
      );

      // Redirect immediately to Mandatory Verification Gate
      router.push('/verify');
    } catch (err: unknown) {
      console.error('Capture error:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Error processing dashboard photo. Please try again or re-take.';
      setErrorMsg(message);
      setExtractionError(message);
    } finally {
      setIsProcessing(false);
      setExtracting(false);
    }
  };

  const handleManualSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const distance = Number(distanceKm);
    const mileage = Number(avgMileageKmpl);
    const price = Number(fuelPrice);
    if (!Number.isFinite(distance) || distance <= 0) {
      setErrorMsg('Enter a distance greater than zero.');
      return;
    }
    if (!Number.isFinite(mileage) || mileage <= 0) {
      setErrorMsg('Enter a mileage greater than zero.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setErrorMsg('Enter a fuel price greater than zero.');
      return;
    }

    setErrorMsg(null);
    setFuelPricePerLiter(price);
    setPhotoPreviewUrl('');
    sessionStorage.removeItem('paytrol_photoURL');
    sessionStorage.setItem('paytrol_manualEntry', 'true');
    setExtraction({
      distanceKm: distance,
      avgMileageKmpl: mileage,
      confidenceDistance: 'high',
      confidenceMileage: 'high',
      rawText: 'Entered manually',
    });
    router.push('/verify');
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

      {manualEntry ? (
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => setManualEntry(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            ← Back to capture options
          </button>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Enter trip details</h2>
              <p className="mt-1 text-xs text-slate-500">
                Add the numbers shown by your vehicle or trip record.
              </p>
            </div>

            <label htmlFor={distanceInputId} className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Distance driven (km)</span>
              <input
                id={distanceInputId}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                required
                value={distanceKm}
                onChange={(event) => setDistanceKm(event.target.value)}
                placeholder="e.g. 6"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-base font-semibold text-slate-900 outline-none focus:border-slate-400"
              />
            </label>

            <label htmlFor={mileageInputId} className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Mileage (km/L)</span>
              <input
                id={mileageInputId}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                required
                value={avgMileageKmpl}
                onChange={(event) => setAvgMileageKmpl(event.target.value)}
                placeholder="e.g. 5.8"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-base font-semibold text-slate-900 outline-none focus:border-slate-400"
              />
            </label>

            <label htmlFor={fuelPriceInputId} className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Fuel price (₹/L)</span>
              <input
                id={fuelPriceInputId}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                required
                value={fuelPrice}
                onChange={(event) => setFuelPrice(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-base font-semibold text-slate-900 outline-none focus:border-slate-400"
              />
            </label>

            {Number(distanceKm) > 0 && Number(avgMileageKmpl) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">Fuel used</span>
                <span className="text-sm font-bold text-slate-900">
                  {(Number(distanceKm) / Number(avgMileageKmpl)).toFixed(3)} L
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-[#315e52] py-3.5 text-sm font-semibold text-white hover:bg-[#244a40]"
          >
            Continue to verification
          </button>
        </form>
      ) : isProcessing ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xl">🤖</div>
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
        <CameraCapture
          onCapture={handleCapture}
          onManualEntry={() => {
            setErrorMsg(null);
            setManualEntry(true);
          }}
          disabled={isProcessing}
        />
      )}
    </div>
  );
}
