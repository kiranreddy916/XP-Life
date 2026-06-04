// Version 2
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through: By not calling event.respondWith(), the browser handles
  // all network requests natively. This satisfies PWA installability criteria
  // while avoiding any fetch interception or caching issues.
});
