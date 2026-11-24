import { describe, expect, it } from 'vitest';
import type { Friendship, GuestContact, Trip } from '@/types';
import { buildRiders, guestKey, matchesSearch, orderRiders, riderHistory } from './riders';

const me = { uid: 'me', name: 'Pika', photo: null };

const friend = (uid: string, name: string): Friendship => ({
  id: `f-${uid}`,
  fromUid: 'me',
  fromName: 'Pika',
  fromEmail: 'me@example.com',
  fromPhoto: null,
  toUid: uid,
  toEmail: `${uid}@example.com`,
  toName: name,
  toPhoto: null,
  status: 'accepted',
  createdAt: '',
  updatedAt: '',
});

const guest = (id: string, name: string, linkedUid: string | null = null): GuestContact => ({
  id,
  ownerUid: 'me',
  guestUid: `g-${id}`,
  name,
  email: null,
  linkedUid,
  createdAt: '',
  updatedAt: '',
});

const trip = (creatorUid: string, participants: Array<{ uid: string; guestContactId?: string }>): Trip =>
  ({
    id: Math.random().toString(),
    creatorUid,
    participants: participants.map((p) => ({ ...p, displayName: '', photoURL: null, shareAmount: 0, customPercentage: null, settled: false, settledAt: null })),
  }) as unknown as Trip;

describe('riders', () => {
  const riders = buildRiders(me, [friend('anu', 'Anu'), friend('rahul', 'Rahul')], [
    guest('g1', 'Meera'),
    guest('g2', 'Anu again', 'anu'),
    guest('g3', 'Arjun', 'arjun'),
  ]);

  it('lists you, friends, and guests who are not already friends', () => {
    expect(riders.map((r) => r.key)).toEqual(['me', 'anu', 'rahul', guestKey('g1'), guestKey('g3')]);
    expect(riders.find((r) => r.key === guestKey('g1'))?.verified).toBe(false);
    expect(riders.find((r) => r.key === guestKey('g3'))?.verified).toBe(true);
  });

  it('finds the last group and recent riders from your own trips', () => {
    const known = new Set(riders.map((r) => r.key));
    const history = riderHistory(
      [
        trip('someone-else', [{ uid: 'rahul' }]),
        trip('me', [{ uid: 'me' }, { uid: 'g-g1', guestContactId: 'g1' }]),
        trip('me', [{ uid: 'me' }, { uid: 'anu' }, { uid: 'deleted-friend' }]),
      ],
      'me',
      known
    );
    expect(history.lastGroup).toEqual(['me', guestKey('g1')]);
    expect(history.recent).toEqual(['me', guestKey('g1'), 'anu']);
  });

  it('orders you, then ticked, then recent, then by name', () => {
    const ordered = orderRiders(riders, [guestKey('g1')], ['anu']);
    expect(ordered.map((r) => r.name)).toEqual(['You', 'Meera', 'Anu', 'Arjun', 'Rahul']);
  });

  it('searches names without caring about case or accents', () => {
    expect(matchesSearch('Méera Krishnakumar', 'meera')).toBe(true);
    expect(matchesSearch('Rahul', 'anu')).toBe(false);
    expect(matchesSearch('Rahul', '  ')).toBe(true);
  });
});
