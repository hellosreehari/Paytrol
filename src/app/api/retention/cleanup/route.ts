import { NextRequest, NextResponse } from 'next/server';
import { queryDocuments, updateDocument } from '@/lib/cosmos';
import { deletePhoto } from '@/lib/blob-storage';
import type { Trip } from '@/types';

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const retentionLimit = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trips = await queryDocuments<Trip>('trips', 'SELECT * FROM c');
    let cleaned = 0;

    for (const trip of trips) {
      const createdAt = new Date(trip.createdAt).getTime();
      if (!trip.photoURL || !Number.isFinite(createdAt) || createdAt >= retentionLimit) continue;

      await deletePhoto(trip.photoURL);
      await updateDocument('trips', { ...trip, photoURL: '' });
      cleaned += 1;
    }

    return NextResponse.json({ success: true, cleaned });
  } catch (error: unknown) {
    console.error('Photo retention cleanup error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not complete photo retention cleanup.' },
      { status: 500 }
    );
  }
}

// Vercel Cron and most schedulers call the route with GET.
export const GET = POST;
