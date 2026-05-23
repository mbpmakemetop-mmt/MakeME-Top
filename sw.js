// Kashmir Stay – Service Worker v1.0
// PWA for kashmirstay.in

const CACHE_NAME = 'kashmir-stay-v1';

// Cache core assets
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './shared.css'
];

// ── INSTALL: cache core assets ──
self.addEventListener('install', event => {
  console.log('[Kashmir Stay SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
          )
        );
      })
      .then(() => {
        console.log('[Kashmir Stay SW] Installed');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  console.log('[Kashmir Stay SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[Kashmir Stay SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => console.log('[Kashmir Stay SW] Active'))
  );
});

// ── FETCH: smart caching strategy ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never cache Firebase/Google APIs
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // Let browser handle
  }

  // 2. Cache fonts/CDN resources
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. HTML navigation – network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 4. Other assets – cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

console.log('[Kashmir Stay SW] Loaded v1.0');