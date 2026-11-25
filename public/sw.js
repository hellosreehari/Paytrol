// Paytrol service worker.
//
// The app's pages are static shells: everything personal (trips, balances,
// the profile) comes from /api and is cached on the device by the app itself.
// So the service worker can open the app from its own copy straight away:
//
// - Pages (launching the app, reloads) are served from the cache at once and
//   refreshed in the background, so the next launch gets any new version.
//   Before, a launch waited up to 3 seconds for the server first, which is
//   the blank screen people saw while Azure woke the app from idle.
// - In-app page changes use small "RSC" payloads that the app prefetches for
//   each tab. Prefetches are answered from the cache at once (and refreshed
//   in the background); a direct page change falls back to the cache when the
//   server takes too long. So switching tabs right after a cold launch no
//   longer waits for the server either.
// - App code and icons under /_next/static and /icons have content-hashed or
//   fixed names, so they are served from the cache first. When a page is
//   cached, the code it refers to is cached with it, so an older cached page
//   never asks the server for files a newer deploy has removed.
// - API calls and sign-in routes are never cached here.

const VERSION = 'v5';
const PAGE_CACHE = `paytrol-pages-${VERSION}`;
const RSC_CACHE = `paytrol-rsc-${VERSION}`;
const ASSET_CACHE = `paytrol-assets-${VERSION}`;
const RSC_TIMEOUT_MS = 1500;
const MAX_ASSET_ENTRIES = 300;
const MAX_RSC_ENTRIES = 60;

// The tabs of the installed app, so any of them opens instantly.
const PRECACHE_URLS = ['/home', '/history', '/friends', '/balances', '/profile', '/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all(PRECACHE_URLS.map((url) => refreshPage(new Request(url)).catch(() => {})))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = [PAGE_CACHE, RSC_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
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

/** Every /_next/static file a page refers to: scripts, styles, fonts, route chunks. */
function staticUrls(html) {
  const urls = new Set();
  const pattern = /\/_next\/static\/[A-Za-z0-9_\-./~%@[\]]+\.(?:js|css|woff2?)/g;
  for (const match of html.matchAll(pattern)) urls.add(match[0]);
  return [...urls];
}

/** Cache the files a page needs, so the cached page works without the server. */
async function cacheAssetsFor(html) {
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(
    staticUrls(html).map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url).catch(() => null);
      if (response && response.ok) await cache.put(url, response);
    })
  );
  await trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
}

/** Fetch a page from the server and keep it (and its code) for the next launch. */
async function refreshPage(request) {
  // A navigation request is passed on as is, so a redirect (for example an
  // old /capture link) reaches the browser as a redirect.
  const response = await (request.mode === 'navigate' ? fetch(request) : fetch(request.url, { cache: 'no-store' }));
  // Only keep successful, same-origin pages that weren't redirected (for
  // example to sign-in), so the cache never holds someone else's screen.
  if (response.ok && response.type === 'basic' && !response.redirected) {
    const html = await response.clone().text();
    await cacheAssetsFor(html);
    const cache = await caches.open(PAGE_CACHE);
    const previous = await cache.match(pageKey(request.url));
    // Static pages only change with a new deploy. Saved in-app payloads
    // belong to the old version then, so drop them.
    if (previous && (await previous.text()) !== html) await caches.delete(RSC_CACHE);
    await cache.put(pageKey(request.url), response.clone());
  }
  return response;
}

function pageKey(url) {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}`;
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

async function servePage(event) {
  const { request } = event;
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(pageKey(request.url));
  const fresh = refreshPage(request);
  if (cached) {
    // Show the saved copy now; the server's copy is used on the next launch.
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

/**
 * In-app navigation payloads. They depend on the request headers Next sends,
 * so the cache key includes them.
 */
function rscKey(request) {
  const url = new URL(request.url);
  url.searchParams.delete('_rsc');
  const vary = ['next-router-prefetch', 'next-router-segment-prefetch', 'next-router-state-tree', 'next-url']
    .map((name) => `${name}=${request.headers.get(name) ?? ''}`)
    .join('&');
  url.searchParams.set('__sw', vary);
  return url.toString();
}

function keepRsc(key, response) {
  if (!response.ok || response.type !== 'basic' || response.redirected) return;
  const clone = response.clone();
  caches
    .open(RSC_CACHE)
    .then((cache) => cache.put(key, clone))
    .then(() => trimCache(RSC_CACHE, MAX_RSC_ENTRIES))
    .catch(() => {});
}

async function serveRsc(event) {
  const { request } = event;
  const key = rscKey(request);
  const cached = await caches.match(key);
  const network = fetch(request).then((response) => {
    keepRsc(key, response);
    return response;
  });
  event.waitUntil(network.catch(() => {}));

  // Prefetches (the app loading the other tabs ahead of a tap) are answered
  // from the saved copy at once, like pages, so tabs open instantly even
  // while the server is waking up.
  if (cached && request.headers.get('next-router-prefetch') === '1') return cached;

  const timeout = new Promise((resolve) => setTimeout(resolve, RSC_TIMEOUT_MS));
  const winner = await Promise.race([network.catch(() => undefined), timeout]);
  if (winner) return winner;
  return cached || network;
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

  // Full page loads: launching the installed app, or a reload.
  if (request.mode === 'navigate') {
    event.respondWith(servePage(event));
    return;
  }

  if (request.headers.get('rsc') === '1') {
    event.respondWith(serveRsc(event));
  }
});
