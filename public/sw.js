const CACHE_NAME = 'fitquest-v1';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase and authentication calls
  if (event.request.url.includes('supabase.co') || event.request.url.includes('/auth/')) {
    return;
  }

  // Network-First with Cache fallback strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If it's a valid response, cache it (except for HTML/navigation to prevent caching old JS bundles)
        if (response && response.status === 200 && response.type === 'basic') {
          const url = new URL(event.request.url);
          if (event.request.mode !== 'navigate' && !url.pathname.endsWith('.html') && !url.pathname.endsWith('/')) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
        }
        return response;
      })
      .catch(() => {
        // Network failed, check cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigation page fails, return the cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
