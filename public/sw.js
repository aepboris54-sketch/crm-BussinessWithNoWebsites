// Minimal service worker: just enough for "Add to Home Screen" installability.
// No caching — this is a live-data CRM, stale leads would be worse than a network request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
