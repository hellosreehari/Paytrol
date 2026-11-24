import type { Friendship, GuestContact, Trip } from '@/types';

/** Someone who can be picked as a rider on a new trip. */
export interface Rider {
  /** The signed-in user's uid, a friend's uid, or `guest:<contact id>`. */
  key: string;
  name: string;
  photo: string | null;
  /** Has a Paytrol login. */
  verified: boolean;
  kind: 'me' | 'friend' | 'guest';
  friendUid?: string;
  guest?: GuestContact;
}

export const guestKey = (id: string) => `guest:${id}`;

/** Everyone the user can split with: themselves, accepted friends, and guests not already listed as friends. */
export function buildRiders(
  me: { uid: string; name: string; photo: string | null },
  friends: Friendship[],
  guests: GuestContact[]
): Rider[] {
  const riders: Rider[] = [{ key: me.uid, name: 'You', photo: me.photo, verified: true, kind: 'me' }];
  const friendUids = new Set<string>();
  for (const friend of friends) {
    const isFrom = friend.fromUid === me.uid;
    const uid = isFrom ? friend.toUid : friend.fromUid;
    if (!uid || friendUids.has(uid) || uid === me.uid) continue;
    friendUids.add(uid);
    riders.push({
      key: uid,
      name: (isFrom ? friend.toName || friend.toEmail : friend.fromName) || 'Friend',
      photo: (isFrom ? friend.toPhoto : friend.fromPhoto) ?? null,
      verified: true,
      kind: 'friend',
      friendUid: uid,
    });
  }
  for (const guest of guests) {
    if (guest.linkedUid && friendUids.has(guest.linkedUid)) continue;
    riders.push({
      key: guestKey(guest.id),
      name: guest.name,
      photo: null,
      verified: Boolean(guest.linkedUid),
      kind: 'guest',
      guest,
    });
  }
  return riders;
}

/** The key a past trip's participant maps to in the rider list. */
function participantKey(participant: Trip['participants'][number]): string {
  return participant.guestContactId ? guestKey(participant.guestContactId) : participant.uid;
}

/**
 * From past trips (newest first): who rode on the user's last trip, and
 * everyone who rode recently, most recent first. Only keys in `known` count.
 */
export function riderHistory(trips: Trip[], meUid: string, known: Set<string>) {
  const mine = trips.filter((trip) => trip.creatorUid === meUid);
  const lastGroup = (mine[0]?.participants ?? []).map(participantKey).filter((key) => known.has(key));
  const recent: string[] = [];
  for (const trip of mine) {
    for (const participant of trip.participants ?? []) {
      const key = participantKey(participant);
      if (known.has(key) && !recent.includes(key)) recent.push(key);
    }
  }
  return { lastGroup, recent };
}

/**
 * Order the list once, when the sheet opens: you first, then the people
 * ticked by default, then recent riders, then everyone else by name. The
 * order doesn't change as boxes are ticked, so rows never jump.
 */
export function orderRiders(riders: Rider[], ticked: string[], recent: string[]): Rider[] {
  const rank = (rider: Rider): [number, number] => {
    if (rider.kind === 'me') return [0, 0];
    const t = ticked.indexOf(rider.key);
    if (t >= 0) return [1, t];
    const r = recent.indexOf(rider.key);
    if (r >= 0) return [2, r];
    return [3, 0];
  };
  return [...riders].sort((a, b) => {
    const [ga, ia] = rank(a);
    const [gb, ib] = rank(b);
    if (ga !== gb) return ga - gb;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Case- and accent-insensitive name search. */
export function matchesSearch(name: string, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
  const q = normalize(query.trim());
  return !q || normalize(name).includes(q);
}
