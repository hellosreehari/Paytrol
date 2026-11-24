import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ExtractionError, extractDashboardReadings } from '@/lib/gemini';
import { deletePhoto, getPhotoReadUrl, hasBlobConfig, uploadPhoto } from '@/lib/blob-storage';

// Simple per-user guard so one account can't exhaust the shared Gemini quota.
// Counts are per server instance and reset every 24 hours.
const DAILY_SCAN_LIMIT = Number(process.env.DAILY_SCAN_LIMIT) || 60;
const scanCounts = new Map<string, { windowStart: number; count: number }>();

function allowScan(userKey: string): boolean {
  const now = Date.now();
  const entry = scanCounts.get(userKey);
  if (!entry || now - entry.windowStart > 24 * 60 * 60 * 1000) {
    scanCounts.set(userKey, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= DAILY_SCAN_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userKey = session.user.uid || session.user.email || 'unknown';
    if (!allowScan(userKey)) {
      return NextResponse.json(
        { success: false, error: 'Daily scan limit reached. Please enter the trip details manually.' },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('photo') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No photo provided. Please capture or select a photo.' },
        { status: 400 }
      );
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'Please select a valid image file.' },
        { status: 400 }
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Photo is too large. Please select an image under 10 MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // Run the AI extraction and the photo upload in parallel.
    const uploadPromise = uploadPhoto(buffer, file.name || 'cluster.jpg', mimeType).catch((err) => {
      // Never store a multi-MB data URL in the trip when blob storage is
      // configured but failing: save the trip without a photo instead.
      console.warn('Storage upload failed:', err);
      return hasBlobConfig() ? '' : `data:${mimeType};base64,${base64}`;
    });

    let extraction;
    try {
      extraction = await extractDashboardReadings(base64, mimeType);
    } catch (err) {
      // Don't leave an orphaned photo behind when the scan fails.
      void uploadPromise.then((url) => deletePhoto(url));
      throw err;
    }
    const photoURL = await uploadPromise;

    return NextResponse.json({
      success: true,
      data: {
        // Signed, short-lived link so the private photo can be previewed.
        photoURL: await getPhotoReadUrl(photoURL),
        distanceKm: extraction.distance_km,
        avgMileageKmpl: extraction.avg_mileage_kmpl,
        confidenceDistance: extraction.confidence_distance,
        confidenceMileage: extraction.confidence_mileage,
        rawText: extraction.raw_text,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ExtractionError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.httpStatus });
    }
    console.error('Extract API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze dashboard photo. Please try again or enter the trip manually.' },
      { status: 500 }
    );
  }
}
