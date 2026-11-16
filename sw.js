/* CAD Pocket Guide – Service Worker
 * Strategy:
 *  - Precache the app shell on install (index.html, manifest.json, root URL).
 *  - Navigations: network-first (fresh content when online), fall back to cached index.html offline.
 *  - Other same-origin GETs: cache-first, then network (and cache the response).
 *  - Old caches are removed on activate. Bump CACHE_VERSION when you change any file.
 */
const CACHE_VERSION = 'cad-guide-v1.0.1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // app is fully self-contained

  // Page navigations: network-first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // Static assets: cache-first, then network (stale entries refreshed on next version bump)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// Allow the page to trigger an immediate update: registration.waiting.postMessage('SKIP_WAITING')
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
