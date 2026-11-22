import { CosmosClient, Database, Container, SqlParameter } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || 'paytrol';

let client: CosmosClient | null = null;
let database: Database | null = null;

// In-memory fallback store when Azure Cosmos credentials aren't supplied yet
const memoryStore: Record<string, Map<string, any>> = {
  users: new Map(),
  trips: new Map(),
  friendships: new Map(),
  balances: new Map(),
};

// Seed demo friends & sample balance for immediate testing if empty
function ensureSeedData() {
  const friendsMap = memoryStore.friendships;
  if (friendsMap.size === 0) {
    friendsMap.set('friend-1', {
      id: 'friend-1',
      fromUid: 'demo-user',
      fromName: 'Demo Driver',
      fromEmail: 'driver@example.com',
      fromPhoto: null,
      toUid: 'rahul-uid',
      toEmail: 'rahul@example.com',
      toName: 'Rahul Sharma',
      toPhoto: null,
      status: 'accepted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    friendsMap.set('friend-2', {
      id: 'friend-2',
      fromUid: 'demo-user',
      fromName: 'Demo Driver',
      fromEmail: 'driver@example.com',
      fromPhoto: null,
      toUid: 'priya-uid',
      toEmail: 'priya@example.com',
      toName: 'Priya Patel',
      toPhoto: null,
      status: 'accepted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const balancesMap = memoryStore.balances;
  if (balancesMap.size === 0) {
    balancesMap.set('demo-user_rahul-uid', {
      odataId: 'demo-user_rahul-uid',
      uid1: 'demo-user',
      uid2: 'rahul-uid',
      name1: 'You',
      name2: 'Rahul Sharma',
      photo1: null,
      photo2: null,
      netAmount: -420, // Rahul owes demo-user 420
    });
  }
}

function hasAzureCosmosConfig(): boolean {
  if (!endpoint || !key) return false;
  if (endpoint.includes('your-cosmos-account') || endpoint.includes('example.com')) return false;
  if (key.includes('your-') || key.includes('primary-cosmos-key')) return false;
  return endpoint.startsWith('https://');
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

async function getDatabase(): Promise<Database> {
  if (!database) {
    const c = getClient();
    const { database: db } = await c.databases.createIfNotExists({ id: databaseId });
    database = db;
  }
  return database;
}

async function getContainer(containerId: string): Promise<Container> {
  const db = await getDatabase();
  const { container } = await db.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: ['/id'] },
  });
  return container;
}

// ── Generic CRUD with Azure Cosmos DB & in-memory fallback ──

export async function createDocument<T extends { id: string }>(containerId: string, doc: T): Promise<T> {
  if (!hasAzureCosmosConfig()) {
    ensureSeedData();
    if (!memoryStore[containerId]) memoryStore[containerId] = new Map();
    memoryStore[containerId].set(doc.id, JSON.parse(JSON.stringify(doc)));
    return doc;
  }

  const container = await getContainer(containerId);
  const { resource } = await container.items.create(doc as any);
  return resource as unknown as T;
}

export async function getDocument<T>(containerId: string, id: string): Promise<T | null> {
  if (!hasAzureCosmosConfig()) {
    ensureSeedData();
    const map = memoryStore[containerId];
    if (!map) return null;
    const doc = map.get(id);
    return (doc ? JSON.parse(JSON.stringify(doc)) : null) as T;
  }

  try {
    const container = await getContainer(containerId);
    const { resource } = await container.item(id, id).read<any>();
    return (resource ?? null) as T | null;
  } catch (e: unknown) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

export async function updateDocument<T extends { id: string }>(containerId: string, doc: T): Promise<T> {
  if (!hasAzureCosmosConfig()) {
    ensureSeedData();
    if (!memoryStore[containerId]) memoryStore[containerId] = new Map();
    memoryStore[containerId].set(doc.id, JSON.parse(JSON.stringify(doc)));
    return doc;
  }

  const container = await getContainer(containerId);
  const { resource } = await container.item(doc.id, doc.id).replace(doc as any);
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
  parameters?: { name: string; value: any }[]
): Promise<T[]> {
  if (!hasAzureCosmosConfig()) {
    ensureSeedData();
    const map = memoryStore[containerId];
    if (!map) return [];
    let items = Array.from(map.values()) as any[];

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
              (item.participants && item.participants.some((p: any) => p.uid === param.value))
          );
        } else if (param.name === '@email') {
          items = items.filter((item) => item.email === param.value || item.toEmail === param.value);
        }
      }
    }

    // Sort by createdAt desc if applicable
    items.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return 0;
    });

    return JSON.parse(JSON.stringify(items)) as T[];
  }

  const container = await getContainer(containerId);
  const { resources } = await container.items
    .query<any>({
      query,
      parameters: (parameters as SqlParameter[]) || [],
    })
    .fetchAll();
  return resources as T[];
}
