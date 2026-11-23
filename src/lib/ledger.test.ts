import { describe, expect, it } from 'vitest';
import { adjustBalance, getBalanceKey } from '@/lib/ledger';
import { getDocument } from '@/lib/cosmos';
import type { Balance } from '@/types';

// No COSMOS_* variables are set in tests, so this runs on the in-memory store.

const alice = { uid: 'alice', name: 'Alice', photo: null };
const bob = { uid: 'bob', name: 'Bob', photo: null };

/** How much `debtor` owes `creditor`, from the stored balance. */
async function owed(creditor: string, debtor: string) {
  const balance = await getDocument<Balance>('balances', getBalanceKey(creditor, debtor));
  if (!balance) return 0;
  return balance.uid1 === creditor ? -balance.netAmount : balance.netAmount;
}

describe('adjustBalance', () => {
  it('creates a balance and nets trips in both directions', async () => {
    await adjustBalance(alice, bob, 102.5); // Bob owes Alice for her trip
    expect(await owed('alice', 'bob')).toBe(102.5);

    await adjustBalance(alice, bob, 73.8);
    expect(await owed('alice', 'bob')).toBe(176.3);

    await adjustBalance(bob, alice, 390); // Alice owes Bob for his trip
    expect(await owed('alice', 'bob')).toBe(-213.7);
    expect(await owed('bob', 'alice')).toBe(213.7);
  });

  it('never leaves floating point noise', async () => {
    const carol = { uid: 'carol', name: 'Carol', photo: null };
    await adjustBalance(alice, carol, 0.1);
    await adjustBalance(alice, carol, 0.2);
    expect(await owed('alice', 'carol')).toBe(0.3);
  });

  it('does not create a balance when asked not to', async () => {
    const dan = { uid: 'dan', name: 'Dan', photo: null };
    await adjustBalance(alice, dan, -50, { createIfMissing: false });
    expect(await getDocument('balances', getBalanceKey('alice', 'dan'))).toBeNull();
  });
});
