import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'dashboard-photos';

let containerClient: ContainerClient | null = null;

function hasBlobConfig(): boolean {
  if (!connectionString) return false;
  if (connectionString.includes('AccountName=...') || connectionString.includes('your_account')) return false;
  return connectionString.includes('DefaultEndpointsProtocol=');
}

async function getContainerClient(): Promise<ContainerClient> {
  if (!containerClient) {
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
    }
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();
    await containerClient.setAccessPolicy(undefined, []);
  }
  return containerClient;
}

/**
 * Upload a photo buffer to Azure Blob Storage, or return a base64 Data URL fallback.
 */
export async function uploadPhoto(
  buffer: Buffer,
  fileName: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  if (!hasBlobConfig()) {
    // Graceful fallback for local development or preview without Azure storage connection string
    const base64 = buffer.toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  const container = await getContainerClient();
  const blobName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const blockBlobClient = container.getBlockBlobClient(blobName);

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlobClient.url;
}

/**
 * Delete a photo from Azure Blob Storage.
 */
export async function deletePhoto(blobUrl: string): Promise<void> {
  if (!hasBlobConfig() || blobUrl.startsWith('data:')) {
    return;
  }

  try {
    const container = await getContainerClient();
    const blobName = blobUrl.split('/').pop()!;
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  } catch (err) {
    console.warn('Failed to delete blob:', err);
  }
}
