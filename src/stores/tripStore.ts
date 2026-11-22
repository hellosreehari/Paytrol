import { create } from 'zustand';
import type { ExtractionResult } from '@/types';

interface TripStore {
  // Photo
  photoFile: File | null;
  photoPreviewUrl: string | null;

  // AI Extraction
  extraction: ExtractionResult | null;
  isExtracting: boolean;
  extractionError: string | null;

  // Verified values (editable by user)
  distanceKm: number;
  avgMileageKmpl: number;
  fuelPricePerLiter: number;

  // Computed
  fuelUsedLiters: number;
  totalCost: number;

  // Split
  selectedFriends: string[];
  includeMe: boolean;
  splitMode: 'equal' | 'custom';
  customSplits: Record<string, number>;

  // Actions
  setPhoto: (file: File) => void;
  setPhotoPreviewUrl: (url: string) => void;
  setExtraction: (result: ExtractionResult) => void;
  setExtracting: (val: boolean) => void;
  setExtractionError: (err: string | null) => void;
  setDistanceKm: (val: number) => void;
  setAvgMileageKmpl: (val: number) => void;
  setFuelPricePerLiter: (val: number) => void;
  computeCost: () => void;
  setSelectedFriends: (uids: string[]) => void;
  toggleIncludeMe: () => void;
  setSplitMode: (mode: 'equal' | 'custom') => void;
  setCustomSplits: (splits: Record<string, number>) => void;
  reset: () => void;
}

const initialState = {
  photoFile: null,
  photoPreviewUrl: null,
  extraction: null,
  isExtracting: false,
  extractionError: null,
  distanceKm: 0,
  avgMileageKmpl: 0,
  fuelPricePerLiter: 105.0,
  fuelUsedLiters: 0,
  totalCost: 0,
  selectedFriends: [],
  includeMe: true,
  splitMode: 'equal' as const,
  customSplits: {},
};

export const useTripStore = create<TripStore>((set, get) => ({
  ...initialState,

  setPhoto: (file: File) => {
    const url = URL.createObjectURL(file);
    set({ photoFile: file, photoPreviewUrl: url });
  },

  setPhotoPreviewUrl: (url: string) => set({ photoPreviewUrl: url }),

  setExtraction: (result: ExtractionResult) => {
    const fuelPrice = get().fuelPricePerLiter || 105.0;
    const distanceKm = result.distanceKm;
    const avgMileageKmpl = result.avgMileageKmpl;
    const fuelUsed = avgMileageKmpl > 0 ? distanceKm / avgMileageKmpl : 0;
    const cost = Math.round(fuelUsed * fuelPrice * 100) / 100;

    set({
      extraction: result,
      distanceKm: result.distanceKm,
      avgMileageKmpl: result.avgMileageKmpl,
      fuelUsedLiters: Math.round(fuelUsed * 1000) / 1000,
      totalCost: cost,
      isExtracting: false,
      extractionError: null,
    });
  },

  setExtracting: (val: boolean) => set({ isExtracting: val }),
  setExtractionError: (err: string | null) => set({ extractionError: err, isExtracting: false }),

  setDistanceKm: (val: number) => {
    set({ distanceKm: val });
    get().computeCost();
  },

  setAvgMileageKmpl: (val: number) => {
    set({ avgMileageKmpl: val });
    get().computeCost();
  },

  setFuelPricePerLiter: (val: number) => {
    set({ fuelPricePerLiter: val });
    get().computeCost();
  },

  computeCost: () => {
    const { distanceKm, avgMileageKmpl, fuelPricePerLiter } = get();
    if (avgMileageKmpl <= 0) {
      set({ fuelUsedLiters: 0, totalCost: 0 });
      return;
    }
    const fuelUsed = distanceKm / avgMileageKmpl;
    const cost = Math.round(fuelUsed * fuelPricePerLiter * 100) / 100;
    set({
      fuelUsedLiters: Math.round(fuelUsed * 1000) / 1000,
      totalCost: cost,
    });
  },

  setSelectedFriends: (uids: string[]) => set({ selectedFriends: uids }),
  toggleIncludeMe: () => set((s) => ({ includeMe: !s.includeMe })),
  setSplitMode: (mode) => set({ splitMode: mode }),
  setCustomSplits: (splits) => set({ customSplits: splits }),

  reset: () => {
    const state = get();
    if (state.photoPreviewUrl && state.photoPreviewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(state.photoPreviewUrl);
      } catch {
        // ignore
      }
    }
    set(initialState);
  },
}));
