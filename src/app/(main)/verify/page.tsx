'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTripStore } from '@/stores/tripStore';
import { useAuth } from '@/hooks/useAuth';
import VerificationForm from '@/components/VerificationForm';

export default function VerifyPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const {
    extraction,
    photoPreviewUrl,
    setDistanceKm,
    setAvgMileageKmpl,
    setFuelPricePerLiter,
    setPhotoPreviewUrl,
  } = useTripStore();

  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!extraction) {
      router.replace('/capture');
      return;
    }

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

  }, [extraction, photoPreviewUrl, router, setPhotoPreviewUrl]);

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
    sessionStorage.setItem('paytrol_verified_v2', JSON.stringify(data));
    sessionStorage.removeItem('paytrol_manualEntry');
    router.push('/split');
  };

  if (!extraction) return null;

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
        extraction={extraction}
        photoUrl={activePhoto}
        defaultFuelPrice={profile?.lastFuelPrice || 0}
        currency={profile?.currency || 'INR'}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
