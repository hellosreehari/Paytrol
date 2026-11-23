import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./cosmos');
}

describe('Cosmos configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses a connection string from the App Service "Connection strings" tab', async () => {
    const m = await load({
      NODE_ENV: 'production',
      DOCDBCONNSTR_AZURE_COSMOS_CONNECTIONSTRING: 'AccountEndpoint=https://acct.documents.azure.com:443/;AccountKey=abc==;',
    });
    expect(m.getStorageMode()).toBe('cosmos');
  });

  it('explains a MongoDB connection string', async () => {
    const m = await load({ NODE_ENV: 'production', AZURE_COSMOS_CONNECTIONSTRING: 'mongodb://acct:pw@host:10255/' });
    expect(m.getStorageMode()).toBe('unconfigured');
    expect(m.describeCosmosConfigProblem()).toMatch(/MongoDB/);
  });

  it('explains a connection string without a key', async () => {
    const m = await load({ NODE_ENV: 'production', AZURE_COSMOS_CONNECTIONSTRING: 'AccountEndpoint=https://acct.documents.azure.com:443/;' });
    expect(m.describeCosmosConfigProblem()).toMatch(/no AccountKey/);
  });

  it('says when nothing is set', async () => {
    const m = await load({ NODE_ENV: 'production' });
    expect(m.describeCosmosConfigProblem()).toMatch(/No Cosmos setting found/);
  });
});
