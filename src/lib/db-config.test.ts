import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./db');
}

describe('database configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses MongoDB for a mongodb:// connection string', async () => {
    const m = await load({
      NODE_ENV: 'production',
      AZURE_COSMOS_CONNECTIONSTRING: 'mongodb://acct:pw@acct.mongo.cosmos.azure.com:10255/?ssl=true',
    });
    expect(m.getStorageMode()).toBe('mongo');
  });

  it('accepts a quoted value from the Connection strings tab', async () => {
    const m = await load({ NODE_ENV: 'production', CUSTOMCONNSTR_MONGODB_URI: '"mongodb+srv://u:p@cluster/"' });
    expect(m.getStorageMode()).toBe('mongo');
  });

  it('explains a Cosmos NoSQL connection string', async () => {
    const m = await load({
      NODE_ENV: 'production',
      AZURE_COSMOS_CONNECTIONSTRING: 'AccountEndpoint=https://acct.documents.azure.com:443/;AccountKey=abc==;',
    });
    expect(m.getStorageMode()).toBe('unconfigured');
    expect(m.describeDatabaseConfigProblem()).toMatch(/NoSQL/);
    await expect(m.getDocument('users', 'x')).rejects.toBeInstanceOf(m.StorageNotConfiguredError);
  });

  it('says when nothing is set', async () => {
    const m = await load({ NODE_ENV: 'production' });
    expect(m.describeDatabaseConfigProblem()).toMatch(/No database setting found/);
  });

  it('falls back to memory outside production', async () => {
    const m = await load({ NODE_ENV: 'test' });
    expect(m.getStorageMode()).toBe('memory');
  });
});
