import { NextResponse } from 'next/server';
import { describeDatabaseConfigProblem, getStorageMode, pingDatabase } from '@/lib/db';
import { hasBlobConfig, pingBlobStorage } from '@/lib/blob-storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeminiModelNames, hasGeminiConfig, probeGeminiModels } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

type Check = { status: 'ok' | 'warning' | 'error'; detail: string };

async function check(run: () => Promise<void>, okDetail: string): Promise<Check> {
  try {
    await run();
    return { status: 'ok', detail: okDetail };
  } catch (err) {
    console.error('[health] check failed:', err);
    return { status: 'error', detail: err instanceof Error ? err.message.slice(0, 200) : 'Check failed' };
  }
}

/**
 * Reports which backing services this instance is actually using, without
 * exposing any secrets. The deploy workflow calls it after every deploy.
 */
export async function GET(req: Request) {
  // /api/health?gemini=1 sends a tiny test request to each Gemini model and
  // shows Google's answer. Signed-in users only, since each call uses quota.
  if (new URL(req.url).searchParams.get('gemini') === '1') {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in to Paytrol first, then open this page again.' }, { status: 401 });
    }
    return NextResponse.json(
      { configuredModel: process.env.GEMINI_MODEL || null, models: await probeGeminiModels() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const storageMode = getStorageMode();

  const database: Check =
    storageMode === 'mongo'
      ? await check(pingDatabase, 'Connected to MongoDB')
      : storageMode === 'memory'
        ? { status: 'warning', detail: 'Using the temporary in-memory store: data is lost on restart' }
        : { status: 'error', detail: describeDatabaseConfigProblem() };

  const photos: Check = hasBlobConfig()
    ? await check(pingBlobStorage, 'Connected to Azure Blob Storage')
    : { status: 'warning', detail: 'AZURE_STORAGE_CONNECTION_STRING is not set: photos are stored inline in trips' };

  const scanning: Check = hasGeminiConfig()
    ? { status: 'ok', detail: `Gemini models, tried in order: ${getGeminiModelNames().join(', ')}` }
    : { status: 'error', detail: 'GEMINI_API_KEY is not set: dashboard scanning is unavailable' };

  const auth: Check =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET
      ? { status: 'ok', detail: 'Google sign-in configured' }
      : { status: 'error', detail: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or NEXTAUTH_SECRET is not set' };

  const checks = { database, photos, scanning, auth };
  const healthy = Object.values(checks).every((c) => c.status !== 'error');

  return NextResponse.json(
    { status: healthy ? 'ok' : 'error', version: process.env.BUILD_SHA || 'dev', checks },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
