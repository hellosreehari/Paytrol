import { CosmosClient, Database, Container, SqlParameter } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || 'paytrol';

let client: CosmosClient | null = null;
let databasePromise: Promise<Database> | null = null;
const containerPromises = new Map<string, Promise<Container>>();
let warnedAboutMemoryStore = false;

// In-memory fallback store when Azure Cosmos credentials aren't supplied yet
const memoryStore: Record<string, Map<string, unknown>> = {
  users: new Map(),
  trips: new Map(),
  friendships: new Map(),
  balances: new Map(),
};

function isAzureCosmosConfigured(): boolean {
  if (!endpoint || !key) return false;
  if (endpoint.includes('your-cosmos-account') || endpoint.includes('example.com')) return false;
  if (key.includes('your-') || key.includes('primary-cosmos-key')) return false;
  return endpoint.startsWith('https://');
}

function hasAzureCosmosConfig(): boolean {
  const configured = isAzureCosmosConfigured();
  if (!configured && !warnedAboutMemoryStore && process.env.NODE_ENV === 'production') {
    warnedAboutMemoryStore = true;
    console.error(
      '[cosmos] COSMOS_ENDPOINT / COSMOS_KEY are not configured. Using the in-memory store: ' +
        'all data will be lost when the server restarts.'
    );
  }
  return configured;
}

function getClient(): CosmosClient {
  if (!client) {
    if (!endpoint || !key) {
      throw new Error('Azure Cosmos credentials not configured');
    }
    client = new CosmosClient({ endpoint, key });
  }
  return client;
}

function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = getClient()
      .databases.createIfNotExists({ id: databaseId })
      .then(({ database }) => database);
    databasePromise.catch(() => {
      databasePromise = null;
    });
  }
  return databasePromise;
}

// Containers are created once per process and memoised, instead of calling
// createIfNotExists (an extra round trip and RU charge) on every request.
function getContainer(containerId: string): Promise<Container> {
  let promise = containerPromises.get(containerId);
  if (!promise) {
    promise = getDatabase()
      .then((db) =>
        db.containers.createIfNotExists({
          id: containerId,
          partitionKey: { paths: ['/id'] },
        })
      )
      .then(({ container }) => container);
    promise.catch(() => containerPromises.delete(containerId));
    containerPromises.set(containerId, promise);
  }
  return promise;
}

// ── Generic CRUD with Azure Cosmos DB & in-memory fallback ──

export async function createDocument<T extends { id: string }>(containerId: string, doc: T): Promise<T> {
  if (!hasAzureCosmosConfig()) {
    if (!memoryStore[containerId]) memoryStore[containerId] = new Map();
    memoryStore[containerId].set(doc.id, JSON.parse(JSON.stringify(doc)));
    return doc;
  }

  const container = await getContainer(containerId);
  const { resource } = await container.items.create(doc as unknown as Record<string, unknown>);
  return resource as unknown as T;
}

export async function getDocument<T>(containerId: string, id: string): Promise<T | null> {
  if (!hasAzureCosmosConfig()) {
    const map = memoryStore[containerId];
    if (!map) return null;
    const doc = map.get(id);
    return (doc ? JSON.parse(JSON.stringify(doc)) : null) as T;
  }

  try {
    const container = await getContainer(containerId);
    const { resource } = await container.item(id, id).read();
    return (resource ?? null) as T | null;
  } catch (e: unknown) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

export async function updateDocument<T extends { id: string }>(containerId: string, doc: T): Promise<T> {
  if (!hasAzureCosmosConfig()) {
    if (!memoryStore[containerId]) memoryStore[containerId] = new Map();
    memoryStore[containerId].set(doc.id, JSON.parse(JSON.stringify(doc)));
    return doc;
  }

  const container = await getContainer(containerId);
  const { resource } = await container.item(doc.id, doc.id).replace(doc as unknown as Record<string, unknown>);
  return resource as unknown as T;
}

export async function deleteDocument(containerId: string, id: string): Promise<void> {
  if (!hasAzureCosmosConfig()) {
    const map = memoryStore[containerId];
    if (map) map.delete(id);
    return;
  }

  const container = await getContainer(containerId);
  await container.item(id, id).delete();
}

export async function queryDocuments<T>(
  containerId: string,
  query: string,
  parameters?: { name: string; value: unknown }[]
): Promise<T[]> {
  if (!hasAzureCosmosConfig()) {
    const map = memoryStore[containerId];
    if (!map) return [];
    let items = Array.from(map.values()) as Record<string, unknown>[];

    // Basic in-memory filter matching common query parameters
    if (parameters && parameters.length > 0) {
      for (const param of parameters) {
        if (param.name === '@uid') {
          items = items.filter(
            (item) =>
              item.creatorUid === param.value ||
              item.fromUid === param.value ||
              item.toUid === param.value ||
              item.uid1 === param.value ||
              item.uid2 === param.value ||
              (Array.isArray(item.participants) &&
                item.participants.some(
                  (participant) =>
                    typeof participant === 'object' &&
                    participant !== null &&
                    'uid' in participant &&
                    participant.uid === param.value
                ))
          );
        } else if (param.name === '@ownerUid') {
          items = items.filter((item) => item.ownerUid === param.value);
        } else if (param.name === '@contactId') {
          items = items.filter(
            (item) =>
              Array.isArray(item.participants) &&
              item.participants.some(
                (participant) =>
                  typeof participant === 'object' &&
                  participant !== null &&
                  'guestContactId' in participant &&
                  participant.guestContactId === param.value
              )
          );
        } else if (param.name === '@email') {
          items = items.filter(
            (item) =>
              (typeof item.email === 'string' && item.email.toLowerCase() === String(param.value).toLowerCase()) ||
              (typeof item.toEmail === 'string' && item.toEmail.toLowerCase() === String(param.value).toLowerCase())
          );
        }
      }
    }

    // Sort by createdAt desc if applicable
    items.sort((a, b) => {
      if (typeof a.createdAt === 'string' && typeof b.createdAt === 'string') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return 0;
    });

    return JSON.parse(JSON.stringify(items)) as T[];
  }

  const container = await getContainer(containerId);
  const { resources } = await container.items
    .query({
      query,
      parameters: (parameters as SqlParameter[]) || [],
    })
    .fetchAll();
  return resources as T[];
}

/**
 * Read-modify-write a document with optimistic concurrency. `mutate` receives
 * the current document (or null when missing) and returns the document to
 * save, or null to leave it unchanged. On Cosmos the write is conditioned on
 * the document's _etag and retried when another request changed it first,
 * so concurrent balance updates are never lost.
 */
export async function upsertDocumentAtomically<T extends { id: string }>(
  containerId: string,
  id: string,
  mutate: (current: T | null) => T | null,
  maxAttempts = 5
): Promise<T | null> {
  if (!hasAzureCosmosConfig()) {
    const current = await getDocument<T>(containerId, id);
    const next = mutate(current);
    if (!next) return current;
    return updateDocument(containerId, next);
  }

  const container = await getContainer(containerId);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let current: (T & { _etag?: string }) | null = null;
    try {
      const { resource } = await container.item(id, id).read<T & { _etag?: string }>();
      current = resource ?? null;
    } catch (e: unknown) {
      if ((e as { code?: number }).code !== 404) throw e;
    }

    const next = mutate(current ? (JSON.parse(JSON.stringify(current)) as T) : null);
    if (!next) return current;

    try {
      if (current?._etag) {
        const { resource } = await container
          .item(id, id)
          .replace(next as unknown as Record<string, unknown>, {
            accessCondition: { type: 'IfMatch', condition: current._etag },
          });
        return resource as unknown as T;
      }
      const { resource } = await container.items.create(next as unknown as Record<string, unknown>);
      return resource as unknown as T;
    } catch (e: unknown) {
      const code = (e as { code?: number }).code;
      // 412: someone else updated it first. 409: someone else created it first.
      if ((code === 412 || code === 409) && attempt < maxAttempts) continue;
      throw e;
    }
  }
  return null;
}

const KNOWN_CONTAINERS = ['users', 'trips', 'friendships', 'balances', 'guests', 'settlements'];

/**
 * Open the database and every container up front, in parallel. Called when
 * the server starts so the first request after a cold start doesn't pay for
 * the database and container setup round trips one after another.
 */
export async function warmUpCosmos(): Promise<void> {
  if (!isAzureCosmosConfigured()) return;
  await Promise.all(KNOWN_CONTAINERS.map((id) => getContainer(id)));
}
