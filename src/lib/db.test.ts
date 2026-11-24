import { describe, expect, it } from 'vitest';
import { createDocument, equalsIgnoreCase, queryDocuments } from './db';
import { getAcceptedFriendUids } from './ledger';

// No database is configured in tests, so this runs on the in-memory store,
// which evaluates the same MongoDB filters production uses.
describe('in-memory store queries', () => {
  it('only counts accepted friendships as friends', async () => {
    await createDocument('friendships', { id: 'f1', fromUid: 'me', toUid: 'ann', status: 'accepted' });
    await createDocument('friendships', { id: 'f2', fromUid: 'bob', toUid: 'me', status: 'pending' });
    expect([...(await getAcceptedFriendUids('me'))]).toEqual(['ann']);
  });

  it('matches email case-insensitively and sorts newest first', async () => {
    await createDocument('mem_users', { id: 'u1', email: 'Pat@Example.com', createdAt: '2026-01-01T00:00:00Z' });
    await createDocument('mem_users', { id: 'u2', email: 'pat@example.com', createdAt: '2026-02-01T00:00:00Z' });
    await createDocument('mem_users', { id: 'u3', email: 'pat@example.co', createdAt: '2026-03-01T00:00:00Z' });
    const found = await queryDocuments<{ id: string }>(
      'mem_users',
      { email: equalsIgnoreCase('pat@example.com') },
      { newestFirst: true }
    );
    expect(found.map((u) => u.id)).toEqual(['u2', 'u1']);
  });
});
