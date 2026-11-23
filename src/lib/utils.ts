import { splitEqually } from '@/lib/money';

/**
 * Calculate fuel used in liters
 */
export function calculateFuelUsed(distanceKm: number, avgMileageKmpl: number): number {
  if (avgMileageKmpl <= 0) return 0;
  return distanceKm / avgMileageKmpl;
}

/**
 * Calculate total trip cost
 */
export function calculateTotalCost(distanceKm: number, avgMileageKmpl: number, fuelPricePerLiter: number): number {
  const fuelUsed = calculateFuelUsed(distanceKm, avgMileageKmpl);
  return Math.round(fuelUsed * fuelPricePerLiter * 100) / 100;
}

/**
 * Calculate equal split amount
 */
export function calculateEqualSplit(totalCost: number, numParticipants: number): number {
  return splitEqually(totalCost, numParticipants)[0] ?? 0;
}

/**
 * Calculate custom split amounts based on percentages
 */
export function calculateCustomSplit(
  totalCost: number,
  splits: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [uid, percentage] of Object.entries(splits)) {
    result[uid] = Math.round((totalCost * percentage / 100) * 100) / 100;
  }
  return result;
}

/**
 * Format currency with symbol
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Compress image file to max size (in bytes)
 */
export async function compressImage(file: File, maxSizeBytes: number = 1024 * 1024): Promise<Blob> {
  const isHeic =
    /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  let imageBlob: Blob = file;

  if (isHeic) {
    try {
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9,
      });
      const jpeg = Array.isArray(converted) ? converted[0] : converted;
      if (!jpeg) throw new Error('HEIC conversion returned no image.');
      imageBlob = jpeg;
    } catch (error) {
      console.error('HEIC image conversion failed:', error);
      throw new Error('Could not convert this HEIC photo. Please try another photo.');
    }
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      const maxDim = 1920;

      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Failed to compress image'));
            if (blob.size > maxSizeBytes && quality > 0.1) {
              quality -= 0.1;
              tryCompress();
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          quality
        );
      };
      tryCompress();
    };

    img.onerror = () =>
      reject(new Error('Could not read this photo. Please choose a JPG, PNG, or HEIC image and try again.'));
    img.src = URL.createObjectURL(imageBlob);
  });
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * cn utility for conditional classNames
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
