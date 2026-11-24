'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * A small stale-while-revalidate cache for the app's GET endpoints.
 *
 * Pages used to fetch their data from scratch on every visit, so every tab
 * switch showed a skeleton while the same trips, balances and friends lists
 * were downloaded again. With this cache a page renders the last known data
 * immediately and refreshes it quietly in the background.
 *
 * The cache is scoped to the signed-in user and mirrored to localStorage, so a
 * cold launch of the installed app can show the last data before the network
 * answers. It is wiped on sign-out or when a different account signs in.
 */

interface Entry {
  data: unknown;
  fetchedAt: number;
}

const STORAGE_PREFIX = 'paytrol:cache:v1:';
// Revalidate on mount only when the data is older than this, so quickly
// switching tabs doesn't fire a request per tap.
const FRESH_FOR_MS = 15_000;

let owner: string | null = null;
let entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
// Keys whose last load failed with nothing cached, so pages can stop showing skeletons.
const loadFailed = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function notifyAll() {
  listeners.forEach((set) => set.forEach((listener) => listener()));
}

function storageKey(uid: string) {
  return `${STORAGE_PREFIX}${uid}`;
}

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (typeof window === 'undefined' || !owner) return;
  try {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage full or unavailable: the in-memory cache still works.
  }
}

function persistSoon() {
  if (typeof window === 'undefined' || !owner) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
}

// Write any pending change before the app is closed or sent to the background.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });
}

/** Remove every cached copy of user data from this device. */
export function clearAllCachedData() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  owner = null;
  entries = new Map();
  inflight.clear();
  loadFailed.clear();
  if (typeof window !== 'undefined') {
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }
  notifyAll();
}

/**
 * Point the cache at a user. Switching to another user drops the previous
 * user's data so it can never be shown to someone else.
 */
export function setCacheOwner(uid: string | null) {
  if (uid === owner) return;
  if (!uid) {
    clearAllCachedData();
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (owner && typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(storageKey(owner));
    } catch {
      // ignore
    }
  }
  owner = uid;
  entries = new Map();
  inflight.clear();
  loadFailed.clear();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(storageKey(uid));
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, Entry>;
        for (const [key, entry] of Object.entries(saved)) {
          // Data restored from storage is from an earlier visit: show it, but
          // always treat it as stale so it is refreshed straight away.
          if (entry && 'data' in entry) entries.set(key, { data: entry.data, fetchedAt: 0 });
        }
      }
    } catch {
      // Corrupt cache: start empty.
    }
  }
  notifyAll();
}

export function getCachedData<T>(key: string): T | undefined {
  return entries.get(key)?.data as T | undefined;
}

export function setCachedData<T>(key: string, updater: T | ((current: T | undefined) => T)) {
  const current = entries.get(key)?.data as T | undefined;
  const next =
    typeof updater === 'function' ? (updater as (current: T | undefined) => T)(current) : updater;
  entries.set(key, { data: next, fetchedAt: entries.get(key)?.fetchedAt ?? Date.now() });
  persistSoon();
  notify(key);
}

/**
 * Fetch `key` (an API path) and store the response's `data` field. Concurrent
 * calls for the same key share one request.
 */
export function revalidate<T = unknown>(key: string): Promise<T | undefined> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T | undefined>;

  const requestOwner = owner;
  const request = (async () => {
    try {
      const res = await fetch(key, { cache: 'no-store' });
      const body = (await res.json()) as { success?: boolean; data?: T; error?: string };
      if (!res.ok || !body.success) {
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      // Ignore the answer if the account changed while it was in flight.
      if (owner === requestOwner) {
        entries.set(key, { data: body.data, fetchedAt: Date.now() });
        loadFailed.delete(key);
        persistSoon();
        notify(key);
      }
      return body.data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}

/** Refresh several resources in the background, ignoring failures. */
export function prefetchData(keys: string[]) {
  for (const key of keys) {
    const entry = entries.get(key);
    if (entry && Date.now() - entry.fetchedAt < FRESH_FOR_MS) continue;
    revalidate(key).catch(() => {});
  }
}

/** Mark resources as out of date and refetch them now. */
export function invalidate(keys: string[]) {
  for (const key of keys) {
    revalidate(key).catch(() => {});
  }
}

function subscribe(key: string, listener: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

export interface CachedResource<T> {
  data: T | undefined;
  /** True only while there is nothing cached to show yet. */
  loading: boolean;
  /** Replace or update the cached value, like a useState setter. */
  mutate: (updater: T | ((current: T | undefined) => T)) => void;
  /** Fetch fresh data now. Rejects when the request fails. */
  refresh: () => Promise<T | undefined>;
}

export function useCachedData<T>(key: string, options: { enabled?: boolean } = {}): CachedResource<T> {
  const enabled = options.enabled ?? true;
  const data = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    () => entries.get(key)?.data as T | undefined,
    () => undefined
  );
  const hasEntry = data !== undefined;

  useEffect(() => {
    if (!enabled) return;
    const entry = entries.get(key);
    if (entry && Date.now() - entry.fetchedAt < FRESH_FOR_MS) return;
    revalidate<T>(key).catch((error) => {
      console.error(`Failed to load ${key}:`, error);
      // Nothing cached and the request failed: store an empty marker so the
      // page stops showing a skeleton forever.
      if (!entries.has(key)) {
        loadFailed.add(key);
        notify(key);
      }
    });
  }, [key, enabled]);

  const failed = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    () => loadFailed.has(key),
    () => false
  );

  const mutate = useCallback(
    (updater: T | ((current: T | undefined) => T)) => setCachedData<T>(key, updater),
    [key]
  );
  const refresh = useCallback(() => revalidate<T>(key), [key]);

  return { data, loading: !hasEntry && !failed, mutate, refresh };
}


/** The API resources the main screens share. */
export const RESOURCES = {
  trips: '/api/trips',
  balances: '/api/balances',
  friends: '/api/friends',
  guests: '/api/guests',
} as const;
