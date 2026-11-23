import { CosmosClient, Database, Container, SqlParameter } from '@azure/cosmos';

/**
 * Parse a Cosmos connection string ("AccountEndpoint=https://...;AccountKey=...;")
 * into its endpoint and key. Returns empty values when a part is missing.
 */
export function parseCosmosConnectionString(connectionString: string | undefined): {
  endpoint?: string;
  key?: string;
} {
  if (!connectionString) return {};
  const parts: Record<string, string> = {};
  for (const segment of connectionString.split(';')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    // Only split on the first '=' because base64 keys end with '=' padding.
    parts[segment.slice(0, eq).trim().toLowerCase()] = segment.slice(eq + 1).trim();
  }
  return { endpoint: parts.accountendpoint || undefined, key: parts.accountkey || undefined };
}

// Names a Cosmos connection string can arrive under. App Service puts values
// from its "Connection strings" tab into prefixed variables (DOCDBCONNSTR_ for
// type DocDb, CUSTOMCONNSTR_ for Custom), while the "App settings" tab and
// Service Connector use the plain name.
export const COSMOS_CONNECTION_STRING_VARIABLES = [
  'AZURE_COSMOS_CONNECTIONSTRING',
  'COSMOS_CONNECTION_STRING',
  'DOCDBCONNSTR_AZURE_COSMOS_CONNECTIONSTRING',
  'CUSTOMCONNSTR_AZURE_COSMOS_CONNECTIONSTRING',
  'DOCDBCONNSTR_COSMOS_CONNECTION_STRING',
  'CUSTOMCONNSTR_COSMOS_CONNECTION_STRING',
] as const;

function findConnectionStringVariable(): string | undefined {
  return COSMOS_CONNECTION_STRING_VARIABLES.find((name) => process.env[name]?.trim());
}

const connectionStringVariable = findConnectionStringVariable();
// Either a connection string or an explicit endpoint + key. The explicit pair
// wins when both are present.
const connectionStringConfig = parseCosmosConnectionString(
  connectionStringVariable ? process.env[connectionStringVariable] : undefined
);
const endpoint = process.env.COSMOS_ENDPOINT || connectionStringConfig.endpoint;
const key = process.env.COSMOS_KEY || connectionStringConfig.key;
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

/**
 * Explains, without revealing any secret, why Cosmos isn't configured.
 * Used by /api/health so a failed deploy says what to fix.
 */
export function describeCosmosConfigProblem(): string {
  if (!connectionStringVariable && !process.env.COSMOS_ENDPOINT && !process.env.COSMOS_KEY) {
    return 'No Cosmos setting found. Set AZURE_COSMOS_CONNECTIONSTRING (or COSMOS_ENDPOINT and COSMOS_KEY) in App settings';
  }
  if (connectionStringVariable) {
    const raw = process.env[connectionStringVariable] ?? '';
    if (/^mongodb(\+srv)?:\/\//i.test(raw.trim())) {
      return `${connectionStringVariable} is a MongoDB connection string; the app needs the Cosmos DB for NoSQL one (AccountEndpoint=...;AccountKey=...)`;
    }
    if (raw.trim().startsWith('@Microsoft.KeyVault')) {
      return `${connectionStringVariable} is an unresolved Key Vault reference; check the app's access to the vault`;
    }
    if (!connectionStringConfig.endpoint) return `${connectionStringVariable} has no AccountEndpoint=... part`;
    if (!connectionStringConfig.key) {
      return `${connectionStringVariable} has no AccountKey=... part (identity-based connections are not supported; use the key-based connection string)`;
    }
  }
  if (!endpoint) return 'COSMOS_KEY is set but COSMOS_ENDPOINT is missing';
  if (!key) return 'COSMOS_ENDPOINT is set but COSMOS_KEY is missing';
  if (!endpoint.startsWith('https://')) return 'The Cosmos endpoint must start with https://';
  return 'The Cosmos settings still contain placeholder values';
}

function isAzureCosmosConfigured(): boolean {
  if (!endpoint || !key) return false;
  if (endpoint.includes('your-cosmos-account') || endpoint.includes('example.com')) return false;
  if (key.includes('your-') || key.includes('primary-cosmos-key')) return false;
  return endpoint.startsWith('https://');
}

/**
 * In production the in-memory store is a silent data-loss trap (everything is
 * wiped on restart and every instance has its own copy), so it is refused
 * unless ALLOW_MEMORY_STORE=true is set explicitly.
 */
export function isMemoryStoreAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_MEMORY_STORE === 'true';
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'Database is not configured. Set AZURE_COSMOS_CONNECTIONSTRING (or COSMOS_ENDPOINT and COSMOS_KEY) ' +
        'in the app settings ' +
        '(or ALLOW_MEMORY_STORE=true to knowingly use a temporary in-memory store).'
    );
    this.name = 'StorageNotConfiguredError';
  }
}

export function getStorageMode(): 'cosmos' | 'memory' | 'unconfigured' {
  if (isAzureCosmosConfigured()) return 'cosmos';
  return isMemoryStoreAllowed() ? 'memory' : 'unconfigured';
}

function hasAzureCosmosConfig(): boolean {
  const configured = isAzureCosmosConfigured();
  if (configured) return true;
  if (!isMemoryStoreAllowed()) {
    if (!warnedAboutMemoryStore) {
      warnedAboutMemoryStore = true;
      console.error('[cosmos] No Cosmos connection is configured (AZURE_COSMOS_CONNECTIONSTRING or COSMOS_ENDPOINT / COSMOS_KEY). Refusing to use the in-memory store in production.');
    }
    throw new StorageNotConfiguredError();
  }
  if (!warnedAboutMemoryStore && process.env.NODE_ENV === 'production') {
    warnedAboutMemoryStore = true;
    console.error(
      '[cosmos] Using the in-memory store (ALLOW_MEMORY_STORE=true): all data will be lost when the server restarts.'
    );
  }
  return false;
}

/** Cheap connectivity check for the health endpoint. */
export async function pingDatabase(): Promise<void> {
  if (!isAzureCosmosConfigured()) return;
  const db = await getDatabase();
  await db.read();
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
