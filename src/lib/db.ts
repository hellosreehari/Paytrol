import type { Document, Filter } from 'mongodb';
import sift from 'sift';
import { isMongoConnectionString, MongoStore, sortNewestFirst } from './mongo-store';

export { equalsIgnoreCase } from './mongo-store';

/**
 * Data access for the app. Production uses MongoDB (Azure Cosmos DB for
 * MongoDB); local development and tests fall back to an in-memory store that
 * evaluates the same MongoDB filters.
 */

export type QueryFilter = Filter<Document>;
export interface QueryOptions {
  /** Sort by createdAt, newest first. */
  newestFirst?: boolean;
}

// Names the connection string can arrive under. App Service puts values from
// its "Connection strings" tab into prefixed variables (CUSTOMCONNSTR_,
// DOCDBCONNSTR_), while the "App settings" tab and Service Connector use the
// plain name.
export const CONNECTION_STRING_VARIABLES = [
  'MONGODB_URI',
  'AZURE_COSMOS_CONNECTIONSTRING',
  'CUSTOMCONNSTR_MONGODB_URI',
  'CUSTOMCONNSTR_AZURE_COSMOS_CONNECTIONSTRING',
  'DOCDBCONNSTR_AZURE_COSMOS_CONNECTIONSTRING',
] as const;

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

const connectionStringVariable = CONNECTION_STRING_VARIABLES.find((name) => process.env[name]?.trim());
const connectionString = connectionStringVariable ? unquote(process.env[connectionStringVariable] ?? '') : undefined;
const mongoUri = isMongoConnectionString(connectionString) ? connectionString : undefined;
const databaseName = process.env.MONGODB_DATABASE || process.env.COSMOS_DATABASE || 'paytrol';

let mongoStore: MongoStore | null = null;
function getMongoStore(): MongoStore {
  mongoStore ??= new MongoStore(mongoUri as string, databaseName);
  return mongoStore;
}

/**
 * In production the in-memory store is a silent data-loss trap (everything is
 * wiped on restart and every instance has its own copy), so it is refused
 * unless ALLOW_MEMORY_STORE=true is set explicitly.
 */
export function isMemoryStoreAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_MEMORY_STORE === 'true';
}

export function getStorageMode(): 'mongo' | 'memory' | 'unconfigured' {
  if (mongoUri) return 'mongo';
  return isMemoryStoreAllowed() ? 'memory' : 'unconfigured';
}

/** Explains, without revealing any secret, why no database is configured. */
export function describeDatabaseConfigProblem(): string {
  if (!connectionStringVariable) {
    return 'No database setting found. Set AZURE_COSMOS_CONNECTIONSTRING (or MONGODB_URI) to a mongodb:// connection string';
  }
  const raw = process.env[connectionStringVariable] ?? '';
  if (raw.trim().startsWith('@Microsoft.KeyVault')) {
    return `${connectionStringVariable} is an unresolved Key Vault reference; check the app's access to the vault`;
  }
  if (/AccountEndpoint=/i.test(raw)) {
    return `${connectionStringVariable} is a Cosmos DB for NoSQL connection string; the app needs a MongoDB one (mongodb://...)`;
  }
  return `${connectionStringVariable} is not a mongodb:// connection string`;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'Database is not configured. Set AZURE_COSMOS_CONNECTIONSTRING (or MONGODB_URI) to a mongodb:// connection ' +
        'string in the app settings (or ALLOW_MEMORY_STORE=true to knowingly use a temporary in-memory store).'
    );
    this.name = 'StorageNotConfiguredError';
  }
}

let warnedAboutStorage = false;

/** Which store to use for this call; throws when production has none. */
function backend(): 'mongo' | 'memory' {
  const mode = getStorageMode();
  if (mode === 'mongo') return mode;
  if (mode === 'unconfigured') {
    if (!warnedAboutStorage) {
      warnedAboutStorage = true;
      console.error(`[db] ${describeDatabaseConfigProblem()}. Refusing to use the in-memory store in production.`);
    }
    throw new StorageNotConfiguredError();
  }
  if (!warnedAboutStorage && process.env.NODE_ENV === 'production') {
    warnedAboutStorage = true;
    console.error('[db] Using the in-memory store (ALLOW_MEMORY_STORE=true): all data will be lost when the server restarts.');
  }
  return 'memory';
}

// ── In-memory store ──

const memoryStore = new Map<string, Map<string, unknown>>();

function memoryCollection(name: string): Map<string, unknown> {
  let collection = memoryStore.get(name);
  if (!collection) {
    collection = new Map();
    memoryStore.set(name, collection);
  }
  return collection;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── Public API ──

/** Cheap connectivity check for the health endpoint. */
export async function pingDatabase(): Promise<void> {
  if (getStorageMode() === 'mongo') await getMongoStore().ping();
}

export async function createDocument<T extends { id: string }>(collection: string, doc: T): Promise<T> {
  if (backend() === 'mongo') return getMongoStore().create(collection, doc);
  memoryCollection(collection).set(doc.id, clone(doc));
  return doc;
}

export async function getDocument<T>(collection: string, id: string): Promise<T | null> {
  if (backend() === 'mongo') return getMongoStore().get<T>(collection, id);
  const doc = memoryCollection(collection).get(id);
  return doc ? clone(doc as T) : null;
}

export async function updateDocument<T extends { id: string }>(collection: string, doc: T): Promise<T> {
  if (backend() === 'mongo') return getMongoStore().update(collection, doc);
  memoryCollection(collection).set(doc.id, clone(doc));
  return doc;
}

export async function deleteDocument(collection: string, id: string): Promise<void> {
  if (backend() === 'mongo') return getMongoStore().delete(collection, id);
  memoryCollection(collection).delete(id);
}

export async function queryDocuments<T>(
  collection: string,
  filter: QueryFilter,
  options: QueryOptions = {}
): Promise<T[]> {
  if (backend() === 'mongo') return getMongoStore().query<T>(collection, filter, !!options.newestFirst);
  const items = Array.from(memoryCollection(collection).values()).filter(
    sift(filter as Parameters<typeof sift>[0])
  ) as T[];
  if (options.newestFirst) sortNewestFirst(items);
  return clone(items);
}

/**
 * Read-modify-write a document with optimistic concurrency. `mutate` receives
 * the current document (or null when missing) and returns the document to
 * save, or null to leave it unchanged. On MongoDB the write only applies if
 * nobody changed the document since it was read, and is retried otherwise,
 * so concurrent balance updates are never lost.
 */
export async function upsertDocumentAtomically<T extends { id: string }>(
  collection: string,
  id: string,
  mutate: (current: T | null) => T | null,
  maxAttempts = 8
): Promise<T | null> {
  if (backend() === 'mongo') return getMongoStore().upsertAtomically(collection, id, mutate, maxAttempts);
  const current = await getDocument<T>(collection, id);
  const next = mutate(current);
  if (!next) return current;
  return updateDocument(collection, next);
}
