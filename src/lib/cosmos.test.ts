import { describe, expect, it } from 'vitest';
import { parseCosmosConnectionString } from './cosmos';

describe('parseCosmosConnectionString', () => {
  it('reads the endpoint and key, keeping base64 padding in the key', () => {
    expect(
      parseCosmosConnectionString('AccountEndpoint=https://acct.documents.azure.com:443/;AccountKey=abc+/def==;')
    ).toEqual({ endpoint: 'https://acct.documents.azure.com:443/', key: 'abc+/def==' });
  });

  it('is case-insensitive on names and tolerates spaces', () => {
    expect(parseCosmosConnectionString(' accountendpoint = https://x/ ; ACCOUNTKEY=k= ')).toEqual({
      endpoint: 'https://x/',
      key: 'k=',
    });
  });

  it('returns nothing for a missing or keyless string', () => {
    expect(parseCosmosConnectionString(undefined)).toEqual({});
    expect(parseCosmosConnectionString('AccountEndpoint=https://x/;')).toEqual({ endpoint: 'https://x/', key: undefined });
  });
});
