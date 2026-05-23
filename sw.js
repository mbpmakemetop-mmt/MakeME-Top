// MBP – MakeMeTop Business Profile — Service Worker v2.0
// Works on GitHub Pages /docs/ AND custom domains (makemetop.in)

const CACHE_NAME = 'mbp-v2';

// Only cache local files — use relative paths so it works on any host
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ── INSTALL: cache core assets ──
self.addEventListener('install', event => {
  console.log('[MBP SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache each asset individually — if one fails don't block install
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
          )
        );
      })
      .then(() => {
        console.log('[MBP SW] Installed');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  console.log('[MBP SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[MBP SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => console.log('[MBP SW] Active and controlling'))
  );
});

// ── FETCH: smart caching strategy ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Always network-first for Firebase / Google APIs — never cache these
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('script.google.com')
  ) {
    return; // Let browser handle — no SW involvement
  }

  // 2. Font/CDN resources — cache first (they don't change)
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

  // 3. HTML navigation — network first, fall back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 4. All other local assets — cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Only cache successful, non-opaque responses
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Your MBP has been updated',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || './' },
    actions: [
      { action: 'view', title: 'View MBP' },
      { action: 'close', title: 'Dismiss' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'MBP – MakeMeTop', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action !== 'close') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        const targetUrl = event.notification.data?.url || './';
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        return clients.openWindow(targetUrl);
      })
    );
  }
});

console.log('[MBP SW] Script loaded — MBP v2.0');
