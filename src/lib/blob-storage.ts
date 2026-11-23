import { BlobSASPermissions, BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'dashboard-photos';
const READ_URL_TTL_MS = 60 * 60 * 1000; // signed photo links stay valid for 1 hour

let containerPromise: Promise<ContainerClient> | null = null;

export function hasBlobConfig(): boolean {
  if (!connectionString) return false;
  if (connectionString.includes('AccountName=...') || connectionString.includes('your_account')) return false;
  return connectionString.includes('DefaultEndpointsProtocol=');
}

function getContainerClient(): Promise<ContainerClient> {
  if (!containerPromise) {
    if (!connectionString) {
      return Promise.reject(new Error('AZURE_STORAGE_CONNECTION_STRING is not set'));
    }
    containerPromise = (async () => {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const client = blobServiceClient.getContainerClient(containerName);
      // The container is private: photos are only reachable through signed URLs.
      await client.createIfNotExists();
      return client;
    })();
    containerPromise.catch(() => {
      containerPromise = null;
    });
  }
  return containerPromise;
}

function getBlobName(blobUrl: string): string | null {
  try {
    const url = new URL(blobUrl);
    const prefix = `/${containerName}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length)) || null;
  } catch {
    return null;
  }
}

/**
 * Upload a photo buffer to Azure Blob Storage, or return a base64 Data URL
 * fallback when blob storage isn't configured (local development).
 * Returns the canonical (unsigned) blob URL that is stored on the trip.
 */
export async function uploadPhoto(
  buffer: Buffer,
  fileName: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  if (!hasBlobConfig()) {
    const base64 = buffer.toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  const container = await getContainerClient();
  const blobName = `${Date.now()}-${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const blockBlobClient = container.getBlockBlobClient(blobName);

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlobClient.url;
}

/**
 * Normalise a photo URL coming back from the client before it is stored:
 * signed query strings are stripped, and only photos from our own container
 * (or data URLs in local development) are accepted.
 */
export function normalizeStoredPhotoUrl(photoURL: unknown): string | null {
  if (typeof photoURL !== 'string' || photoURL === '') return '';
  if (photoURL.startsWith('data:image/')) {
    return hasBlobConfig() ? null : photoURL;
  }
  if (!hasBlobConfig()) return null;
  const blobName = getBlobName(photoURL);
  if (!blobName) return null;
  try {
    const url = new URL(photoURL);
    const expected = new URL(BlobServiceClient.fromConnectionString(connectionString!).url);
    if (url.host !== expected.host) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Turn a stored blob URL into a short-lived signed URL the browser can load.
 * Data URLs and empty values pass through unchanged.
 */
export async function getPhotoReadUrl(photoURL: string): Promise<string> {
  if (!photoURL || photoURL.startsWith('data:') || !hasBlobConfig()) return photoURL;
  const blobName = getBlobName(photoURL);
  if (!blobName) return photoURL;
  try {
    const container = await getContainerClient();
    return await container.getBlockBlobClient(blobName).generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + READ_URL_TTL_MS),
    });
  } catch (err) {
    console.warn('Could not sign photo URL:', err);
    return photoURL;
  }
}

/**
 * Delete a photo from Azure Blob Storage.
 */
export async function deletePhoto(blobUrl: string): Promise<void> {
  if (!blobUrl || !hasBlobConfig() || blobUrl.startsWith('data:')) {
    return;
  }

  try {
    const blobName = getBlobName(blobUrl);
    if (!blobName) return;
    const container = await getContainerClient();
    await container.getBlockBlobClient(blobName).deleteIfExists();
  } catch (err) {
    console.warn('Failed to delete blob:', err);
  }
}
