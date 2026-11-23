'use client';

import { useEffect, useState, useId } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import type { ExtractionResult } from '@/types';

interface VerificationFormProps {
  extraction: ExtractionResult;
  photoUrl: string | null;
  defaultFuelPrice: number;
  currency?: string;
  onConfirm: (data: {
    distanceKm: number;
    avgMileageKmpl: number;
    fuelPricePerLiter: number;
    fuelUsedLiters: number;
    totalCost: number;
  }) => void;
}

export default function VerificationForm({
  extraction,
  photoUrl,
  defaultFuelPrice,
  currency = 'INR',
  onConfirm,
}: VerificationFormProps) {
  const [distanceKm, setDistanceKm] = useState<number>(extraction.distanceKm);
  const [avgMileage, setAvgMileage] = useState<number>(extraction.avgMileageKmpl);
  const [fuelPrice, setFuelPrice] = useState<number>(defaultFuelPrice);
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  useEffect(() => {
    if (defaultFuelPrice > 0) {
      setFuelPrice((current) => current || defaultFuelPrice);
    }
  }, [defaultFuelPrice]);

  const distanceInputId = useId();
  const mileageInputId = useId();
  const fuelPriceInputId = useId();

  // Instant calculation based on current fields
  const fuelUsed = avgMileage > 0 ? distanceKm / avgMileage : 0;
  const totalCost = Math.round(fuelUsed * fuelPrice * 100) / 100;

  const isDistanceLow = extraction.confidenceDistance === 'low';
  const isMileageLow = extraction.confidenceMileage === 'low';
  const hasConfidenceIssue = isDistanceLow || isMileageLow;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (distanceKm <= 0 || avgMileage <= 0 || fuelPrice <= 0) return;

    onConfirm({
      distanceKm,
      avgMileageKmpl: avgMileage,
      fuelPricePerLiter: fuelPrice,
      fuelUsedLiters: Math.round(fuelUsed * 1000) / 1000,
      totalCost,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 1. Cropped dashboard photo display */}
      {photoUrl && (
        <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 group">
          <div className="max-h-48 overflow-hidden flex items-center justify-center bg-black/80">
            <img
              src={photoUrl}
              alt="Dashboard cluster crop"
              className={cn(
                'w-full object-cover transition-all duration-300',
                showFullPhoto ? 'max-h-none' : 'max-h-48'
              )}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFullPhoto(!showFullPhoto)}
            className="absolute bottom-2.5 right-2.5 text-[11px] bg-slate-950/80 hover:bg-slate-900 text-slate-200 px-2.5 py-1 rounded-md backdrop-blur-md border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <span>{showFullPhoto ? 'Collapse crop' : '🔍 Expand photo'}</span>
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span className="font-semibold uppercase tracking-wider text-indigo-400">
          Verification Gate
        </span>
        <span>Human-in-the-loop review</span>
      </div>

      {hasConfidenceIssue && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3.5 flex items-start gap-3 text-amber-200">
          <span className="text-lg">⚠️</span>
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-amber-100">Low AI Confidence Detected</p>
            <p className="text-amber-200/90">
              Glare or angle affected readings. Please inspect the highlighted yellow fields and correct values manually.
            </p>
          </div>
        </div>
      )}

      {/* 3. Pre-filled, editable numeric fields */}
      <div className="space-y-3.5">
        <div
          className={cn(
            'rounded-2xl border p-4 transition-all duration-150',
            isDistanceLow
              ? 'bg-amber-500/10 border-amber-400/80 shadow-sm shadow-amber-500/20'
              : 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600'
          )}
        >
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor={distanceInputId}
              className="text-xs font-medium text-slate-300 flex items-center gap-2 cursor-pointer"
            >
              <span>Distance Covered (km)</span>
              <span className="text-[10px] text-slate-500 font-normal">(Under &quot;Since start&quot;)</span>
            </label>
            {isDistanceLow ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-medium border border-amber-400/30">
                Low Confidence
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                Checked
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <input
              id={distanceInputId}
              type="number"
              step="0.1"
              min="0.1"
              required
              value={distanceKm || ''}
              onChange={(e) => setDistanceKm(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent text-2xl font-bold text-white outline-none"
              placeholder="Enter distance"
            />
            <span className="text-slate-400 text-sm font-semibold">km</span>
          </div>
        </div>

        <div
          className={cn(
            'rounded-2xl border p-4 transition-all duration-150',
            isMileageLow
              ? 'bg-amber-500/10 border-amber-400/80 shadow-sm shadow-amber-500/20'
              : 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600'
          )}
        >
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor={mileageInputId}
              className="text-xs font-medium text-slate-300 flex items-center gap-2 cursor-pointer"
            >
              <span>Average Mileage (km/L)</span>
              <span className="text-[10px] text-slate-500 font-normal">(Fuel pump icon)</span>
            </label>
            {isMileageLow ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-medium border border-amber-400/30">
                Low Confidence
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                Checked
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <input
              id={mileageInputId}
              type="number"
              step="0.1"
              min="0.1"
              required
              value={avgMileage || ''}
              onChange={(e) => setAvgMileage(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent text-2xl font-bold text-white outline-none"
              placeholder="Enter mileage"
            />
            <span className="text-slate-400 text-sm font-semibold">km/L</span>
          </div>
        </div>

        <div className="rounded-2xl border bg-slate-800/70 border-slate-700/80 hover:border-slate-600 p-4 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor={fuelPriceInputId}
              className="text-xs font-medium text-slate-300 cursor-pointer"
            >
              Fuel Price (per liter)
            </label>
            {fuelPrice > 0 && (
              <span className="text-[10px] text-slate-400">Saved fuel price</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-slate-400 text-lg font-bold">₹</span>
            <input
              id={fuelPriceInputId}
              type="number"
              step="0.1"
              min="1"
              required
              value={fuelPrice || ''}
              onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent text-2xl font-bold text-white outline-none"
              placeholder="Enter fuel price"
            />
            <span className="text-slate-400 text-sm font-semibold">/L</span>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 bg-slate-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-700">
          <span className="font-semibold uppercase tracking-wider">Computed Trip Economics</span>
          <span className="text-[11px] text-slate-400">
            {distanceKm} km ÷ {avgMileage} km/L
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <span className="text-[11px] text-slate-400 block mb-0.5">Fuel Consumed</span>
            <span className="text-lg font-bold text-white">
              {fuelUsed.toFixed(3)} <span className="text-xs text-indigo-300 font-normal">Liters</span>
            </span>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-indigo-500/20">
            <span className="text-[11px] text-slate-400 block mb-0.5">Total Trip Cost</span>
            <span className="text-lg font-bold text-slate-900">{formatCurrency(totalCost, currency)}</span>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200 space-y-0.5">
          <div className="flex justify-between">
            <span>Formula:</span>
            <span className="font-mono text-slate-700 text-[10px]">
              {distanceKm} ÷ {avgMileage} = {fuelUsed.toFixed(3)} L
            </span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Cost:</span>
            <span className="font-mono text-slate-700 text-[10px]">
              {fuelUsed.toFixed(3)} L × ₹{fuelPrice} = {formatCurrency(totalCost, currency)}
            </span>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={distanceKm <= 0 || avgMileage <= 0 || fuelPrice <= 0}
        className="w-full py-4 bg-[#315e52] hover:bg-[#244a40] active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-500 text-white font-semibold rounded-2xl transition-all text-base flex items-center justify-center gap-2"
      >
        <span>Confirm &amp; Calculate</span>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </button>
    </form>
  );
}
