// Simply Krisp service worker: makes the site installable and lets the app
// shell open without a connection. Private data (/api/*) is never cached.
const VERSION = 'sk-2026-11-12c';
const SHELL = [
  '/krisper',
  '/manifest.webmanifest',
  '/assets/sk-header.js',
  '/crisper/catalog.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdn.shopify.com'];

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && (url.pathname.startsWith('/api/') || url.pathname === '/sw.js')) return; // always network

  if (req.mode === 'navigate' && same) {
    // Network first; offline falls back to the last copy of that page, then the app.
    const key = url.origin + url.pathname; // ignore ?k= and utm params
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key).then((r) => r || caches.match('/krisper')))
    );
    return;
  }

  if (same || STATIC_HOSTS.includes(url.hostname)) {
    // Stale-while-revalidate for scripts, styles, fonts, images and catalog data.
    e.respondWith(
      caches.open(VERSION).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
