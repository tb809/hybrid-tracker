/* Hybrid Tracker service worker — bump CACHE on every release so phones pick up updates. */
const CACHE = 'hybrid-tracker-v2-1-3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './sync.js',
  './config.js',
  './vendor/supabase-js-2.118.0.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('hybrid-tracker-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function fromNetworkAndCache(req) {
  return fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase API etc. go straight to network

  if (req.mode === 'navigate') {
    // App shell: instant + offline. New versions arrive via SW update (cache name bump).
    event.respondWith(
      caches.match('./index.html').then((hit) => hit || fromNetworkAndCache(req)).catch(() => caches.match('./index.html'))
    );
    return;
  }
  if (url.pathname.endsWith('/config.js')) {
    // network-first so a newly filled config.js takes effect without a release
    event.respondWith(fromNetworkAndCache(req).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fromNetworkAndCache(req))
  );
});
