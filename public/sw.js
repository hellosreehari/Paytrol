// Paytrol service worker.
//
// - App code and icons under /_next/static and /icons have content-hashed or
//   fixed names, so they are served from the cache first. This makes launching
//   the installed app fast even on a slow connection.
// - Pages are fetched from the network first, but if the server takes longer
//   than a few seconds (for example while Azure wakes the app up from idle),
//   the last cached copy is shown instead and refreshed in the background.
// - API calls and sign-in routes are never cached here.

const VERSION = 'v4';
const PAGE_CACHE = `paytrol-pages-${VERSION}`;
const ASSET_CACHE = `paytrol-assets-${VERSION}`;
const PAGE_TIMEOUT_MS = 3000;
const MAX_ASSET_ENTRIES = 200;

const PRECACHE_URLS = ['/', '/home', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== PAGE_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const clone = response.clone();
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.put(request, clone))
      .then(() => trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES))
      .catch(() => {});
  }
  return response;
}

async function networkFirstWithTimeout(event) {
  const request = event.request;
  const network = fetch(request).then((response) => {
    // Only keep successful, same-origin, non-redirected pages.
    if (response && response.ok && response.type === 'basic' && !response.redirected) {
      const clone = response.clone();
      caches.open(PAGE_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
    }
    return response;
  });
  // Let the network update the cache even when we answer from the cache.
  event.waitUntil(network.catch(() => {}));

  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS));
  const winner = await Promise.race([network.catch(() => undefined), timeout]);
  if (winner) return winner;

  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Full page loads (launching the app, reloads). In-app navigation uses
  // React Server Component requests, which go straight to the network.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithTimeout(event));
  }
});
