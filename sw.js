// sw.js — offline support for the pacing diary.
// Bump CACHE when you change any shell file, so phones pick up the update.

const CACHE = 'pacing-diary-v2';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/storage.js',
  'js/week.js',
  'js/patterns.js',
  'js/charts.js',
  'js/export.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon-180.png',
  'icons/favicon-32.png',
];

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // App navigation: try network, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  // jsPDF from CDN: cache-first so PDF export works offline after first use.
  if (req.url === JSPDF) {
    e.respondWith(cacheFirst(req));
    return;
  }

  // Same-origin assets: cache-first.
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req));
  }
});
