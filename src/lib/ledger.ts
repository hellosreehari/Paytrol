import { queryDocuments, upsertDocumentAtomically } from '@/lib/cosmos';
import { roundMoney } from '@/lib/money';
import type { Balance, Friendship } from '@/types';

export function getBalanceKey(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join('_');
}

export interface LedgerParty {
  uid: string;
  name: string;
  photo: string | null;
}

/**
 * Change how much `other` owes `owner` by `owedToOwnerDelta` (negative values
 * reduce the debt). Balances use the stored convention
 * "netAmount > 0 means uid1 owes uid2", and every write is rounded to paise
 * and guarded against concurrent updates.
 */
export async function adjustBalance(
  owner: LedgerParty,
  other: LedgerParty & { isGuest?: boolean },
  owedToOwnerDelta: number,
  { createIfMissing = true }: { createIfMissing?: boolean } = {}
): Promise<void> {
  const delta = roundMoney(owedToOwnerDelta);
  if (delta === 0 || owner.uid === other.uid) return;

  const balanceId = getBalanceKey(owner.uid, other.uid);
  await upsertDocumentAtomically<Balance>('balances', balanceId, (balance) => {
    if (!balance) {
      if (!createIfMissing) return null;
      return {
        id: balanceId,
        odataId: balanceId,
        uid1: owner.uid,
        uid2: other.uid,
        name1: owner.name,
        name2: other.name || 'Friend',
        photo1: owner.photo,
        photo2: other.photo,
        netAmount: -delta, // uid2 (other) owes uid1 (owner)
        ...(other.isGuest ? { guestUid: other.uid } : {}),
      };
    }
    // If the owner is uid1, "other owes owner more" makes netAmount more negative.
    balance.netAmount = roundMoney(
      balance.uid1 === owner.uid ? balance.netAmount - delta : balance.netAmount + delta
    );
    if (other.isGuest) balance.guestUid = other.uid;
    return balance;
  });
}

/** The set of user ids with an accepted friendship with `uid`. One query per request. */
export async function getAcceptedFriendUids(uid: string): Promise<Set<string>> {
  const relationships = await queryDocuments<Friendship>(
    'friendships',
    'SELECT * FROM c WHERE c.status = @status AND (c.fromUid = @uid OR c.toUid = @uid)',
    [
      { name: '@status', value: 'accepted' },
      { name: '@uid', value: uid },
    ]
  );
  const friends = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.status !== 'accepted') continue;
    if (relationship.fromUid === uid && relationship.toUid) friends.add(relationship.toUid);
    if (relationship.toUid === uid) friends.add(relationship.fromUid);
  }
  return friends;
}
