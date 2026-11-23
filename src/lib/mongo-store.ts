import { randomUUID } from 'node:crypto';
import { MongoClient, MongoServerError, type Collection, type Db, type Document, type Filter } from 'mongodb';

/**
 * Storage backend for Azure Cosmos DB for MongoDB (or any MongoDB). Documents
 * keep the app's own `id` field and use the same value as `_id`. `_version`
 * is a token that changes on every write, used for optimistic concurrency. Neither internal field is returned to callers.
 */

export function isMongoConnectionString(value: string | undefined): boolean {
  return !!value && /^mongodb(\+srv)?:\/\//i.test(value.trim());
}

let clientPromise: Promise<MongoClient> | null = null;
const collectionPromises = new Map<string, Promise<Collection<Document>>>();

function getDb(uri: string, databaseId: string): Promise<Db> {
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, {
      // Cosmos DB for MongoDB doesn't support retryable writes.
      retryWrites: false,
      serverSelectionTimeoutMS: 15_000,
    }).connect();
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise.then((client) => client.db(databaseId));
}

function getCollection(uri: string, databaseId: string, name: string): Promise<Collection<Document>> {
  let promise = collectionPromises.get(name);
  if (!promise) {
    promise = getDb(uri, databaseId).then(async (db) => {
      const collection = db.collection(name);
      // Cosmos DB for MongoDB (3.6+) only indexes _id by default, so filtering
      // on other fields can fail. A wildcard index covers every field. Best
      // effort: plain MongoDB or an existing index makes this a no-op.
      try {
        await collection.createIndex({ '$**': 1 });
      } catch (e) {
        console.warn(`[mongo] could not create wildcard index on ${name}:`, (e as Error).message);
      }
      return collection;
    });
    promise.catch(() => collectionPromises.delete(name));
    collectionPromises.set(name, promise);
  }
  return promise;
}

function byId(id: string): Filter<Document> {
  return { _id: id } as unknown as Filter<Document>;
}

function toStored<T extends { id: string }>(doc: T): Document {
  const copy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  delete copy._version;
  return { ...copy, _id: doc.id, _version: randomUUID() } as Document;
}

/** Sort documents by their createdAt timestamp, newest first, in place. */
export function sortNewestFirst<T>(items: T[]): T[] {
  const time = (item: T) => {
    const value = (item as { createdAt?: unknown }).createdAt;
    return typeof value === 'string' ? new Date(value).getTime() || 0 : 0;
  };
  return items.sort((a, b) => time(b) - time(a));
}

function fromStored<T>(doc: Document | null): T | null {
  if (!doc) return null;
  const { _id, _version, ...rest } = doc;
  void _id;
  void _version;
  return rest as T;
}

function isDuplicateKey(e: unknown): boolean {
  return e instanceof MongoServerError && e.code === 11000;
}

/** Escape a string for use inside a regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact match, like Cosmos SQL's LOWER(c.field) = @value. */
export function equalsIgnoreCase(value: string): { $regex: string; $options: string } {
  return { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
}

export class MongoStore {
  constructor(
    private readonly uri: string,
    private readonly databaseId: string
  ) {}

  private collection(name: string) {
    return getCollection(this.uri, this.databaseId, name);
  }

  async ping(): Promise<void> {
    const db = await getDb(this.uri, this.databaseId);
    await db.command({ ping: 1 });
  }

  async create<T extends { id: string }>(name: string, doc: T): Promise<T> {
    const collection = await this.collection(name);
    await collection.insertOne(toStored(doc));
    return doc;
  }

  async get<T>(name: string, id: string): Promise<T | null> {
    const collection = await this.collection(name);
    return fromStored<T>(await collection.findOne(byId(id)));
  }

  async update<T extends { id: string }>(name: string, doc: T): Promise<T> {
    const collection = await this.collection(name);
    const result = await collection.replaceOne(byId(doc.id), toStored(doc));
    if (result.matchedCount === 0) {
      const error = new Error(`Document ${doc.id} not found in ${name}`) as Error & { code: number };
      error.code = 404;
      throw error;
    }
    return doc;
  }

  async delete(name: string, id: string): Promise<void> {
    const collection = await this.collection(name);
    await collection.deleteOne(byId(id));
  }

  async query<T>(name: string, filter: Filter<Document>, sortByCreatedAtDesc: boolean): Promise<T[]> {
    const collection = await this.collection(name);
    const docs = await collection.find(filter).toArray();
    const items = docs.map((doc) => fromStored<T>(doc) as T);
    // Sorted here rather than in the database: Cosmos DB for MongoDB rejects
    // a sort on a field without a matching index.
    return sortByCreatedAtDesc ? sortNewestFirst(items) : items;
  }

  /** Read-modify-write conditioned on _version, retried on conflicts. */
  async upsertAtomically<T extends { id: string }>(
    name: string,
    id: string,
    mutate: (current: T | null) => T | null,
    maxAttempts: number
  ): Promise<T | null> {
    const collection = await this.collection(name);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const stored = await collection.findOne(byId(id));
      const current = fromStored<T>(stored);
      const next = mutate(current ? (JSON.parse(JSON.stringify(current)) as T) : null);
      if (!next) return current;

      if (stored) {
        // Only replace the copy we read: a write in between changes _version.
        const versionFilter = stored._version === undefined ? { _version: { $exists: false } } : { _version: stored._version };
        const result = await collection.replaceOne({ ...byId(id), ...versionFilter } as Filter<Document>, toStored(next));
        if (result.matchedCount === 1) return next;
      } else {
        try {
          await collection.insertOne(toStored(next));
          return next;
        } catch (e) {
          if (!isDuplicateKey(e)) throw e;
        }
      }
      // Someone else changed or created it first: retry with the fresh copy
      // after a short random pause so competing writers spread out.
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 * attempt));
    }
    throw new Error(`Could not update ${name}/${id}: too many concurrent changes`);
  }
}
