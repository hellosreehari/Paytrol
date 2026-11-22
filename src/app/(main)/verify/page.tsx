'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTripStore } from '@/stores/tripStore';
import { useAuth } from '@/hooks/useAuth';
import VerificationForm from '@/components/VerificationForm';
import type { ExtractionResult } from '@/types';

export default function VerifyPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const {
    extraction,
    photoPreviewUrl,
    setDistanceKm,
    setAvgMileageKmpl,
    setFuelPricePerLiter,
    setExtraction,
    setPhotoPreviewUrl,
  } = useTripStore();

  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have photo or extraction from store or sessionStorage
    const manualEntry = sessionStorage.getItem('paytrol_manualEntry') === 'true';
    const storedPhoto = sessionStorage.getItem('paytrol_photoURL');
    if (!manualEntry && storedPhoto) {
      setActivePhoto(storedPhoto);
    } else if (!manualEntry && photoPreviewUrl) {
      setActivePhoto(photoPreviewUrl);
    } else {
      setActivePhoto(null);
    }

    // If no extraction in memory, check if we should populate with demo extraction (from sample cluster)
    if (!extraction && !manualEntry) {
      const demoExtraction: ExtractionResult = {
        distanceKm: 6.0,
        avgMileageKmpl: 5.8,
        confidenceDistance: 'high',
        confidenceMileage: 'high',
        rawText: 'Since start: 0:35h, 6km, Avg 5.8 km/l, Avg 11km/h, 12km/h, Range 460km, Odo 66639km',
      };
      setExtraction(demoExtraction);
      if (!storedPhoto) {
        setActivePhoto('/sample-cluster.jpg');
        setPhotoPreviewUrl('/sample-cluster.jpg');
      }
    }
  }, [extraction, photoPreviewUrl, setExtraction, setPhotoPreviewUrl]);

  const handleConfirm = (data: {
    distanceKm: number;
    avgMileageKmpl: number;
    fuelPricePerLiter: number;
    fuelUsedLiters: number;
    totalCost: number;
  }) => {
    setDistanceKm(data.distanceKm);
    setAvgMileageKmpl(data.avgMileageKmpl);
    setFuelPricePerLiter(data.fuelPricePerLiter);

    // Save verified calculation to sessionStorage for Split screen
    sessionStorage.setItem('paytrol_verified', JSON.stringify(data));
    sessionStorage.removeItem('paytrol_manualEntry');
    router.push('/split');
  };

  const currentExtraction = extraction || {
    distanceKm: 6.0,
    avgMileageKmpl: 5.8,
    confidenceDistance: 'high' as const,
    confidenceMileage: 'high' as const,
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/capture')}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            ←
          </button>
          <h1 className="text-2xl font-black text-white">Verification Screen</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Review the AI-extracted readings against your cluster photo before computing fuel cost.
        </p>
      </header>

      <VerificationForm
        extraction={currentExtraction}
        photoUrl={activePhoto}
        defaultFuelPrice={profile?.lastFuelPrice || 105.0}
        currency={profile?.currency || 'INR'}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
