import type { ExtractionResult } from '@/types';

export interface ScanReading extends ExtractionResult {
  /** Short-lived link to the stored photo, or '' when none was kept. */
  photoURL: string;
}

/** A failed read. `retryable` is false when scanning is broken or out of quota, so retrying won't help. */
export class ScanError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'ScanError';
  }
}

/** True when the reading found at least one of the two numbers. */
export function foundAnything(reading: ExtractionResult): boolean {
  return reading.distanceKm > 0 || reading.avgMileageKmpl > 0;
}

/** True when the reading found both numbers. */
export function foundBoth(reading: ExtractionResult): boolean {
  return reading.distanceKm > 0 && reading.avgMileageKmpl > 0;
}

/** Send one dashboard photo to the server and get the two readings back. */
export async function readDashboard(photo: Blob, signal?: AbortSignal): Promise<ScanReading> {
  const formData = new FormData();
  const file = photo instanceof File ? photo : new File([photo], 'dashboard.jpg', { type: photo.type || 'image/jpeg' });
  formData.append('photo', file);

  // Older iPhones lack AbortSignal.any, so combine the caller's signal and the timeout by hand.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 75_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let res: Response;
  try {
    res = await fetch('/api/extract', { method: 'POST', body: formData, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ScanError(
      timedOut
        ? 'Reading the photo took too long. Try again, or type the trip in.'
        : 'Could not reach Paytrol. Check your connection and try again.',
      true
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  // A proxy or crash can answer with an HTML page instead of JSON.
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    const message = data?.error || `Scanning failed (error ${res.status}). Try again, or type the trip in.`;
    // 429 = daily limit, 503 = scanning not set up or Gemini down: stop auto-scanning.
    throw new ScanError(message, !(res.status === 429 || res.status === 503 || res.status === 401));
  }

  return {
    distanceKm: Number(data.data.distanceKm) || 0,
    avgMileageKmpl: Number(data.data.avgMileageKmpl) || 0,
    confidenceDistance: data.data.confidenceDistance,
    confidenceMileage: data.data.confidenceMileage,
    rawText: data.data.rawText || '',
    photoURL: data.data.photoURL || '',
  };
}
