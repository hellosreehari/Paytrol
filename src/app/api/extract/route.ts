import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { extractDashboardReadings } from '@/lib/gemini';
import { uploadPhoto } from '@/lib/blob-storage';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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

    // 1. Upload to Azure Blob Storage (or fallback data URL)
    let photoURL = '';
    try {
      photoURL = await uploadPhoto(buffer, file.name || 'cluster.jpg', mimeType);
    } catch (err) {
      console.warn('Storage upload warning, fallback to data url:', err);
      photoURL = `data:${mimeType};base64,${base64}`;
    }

    // 2. Extract readings via Vision LLM (Gemini Flash)
    const extraction = await extractDashboardReadings(base64, mimeType);

    return NextResponse.json({
      success: true,
      data: {
        photoURL,
        distanceKm: extraction.distance_km,
        avgMileageKmpl: extraction.avg_mileage_kmpl,
        confidenceDistance: extraction.confidence_distance,
        confidenceMileage: extraction.confidence_mileage,
        rawText: extraction.raw_text,
      },
    });
  } catch (error: unknown) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze dashboard photo.',
      },
      { status: 500 }
    );
  }
}
