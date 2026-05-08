// Kill-switch service worker.
// Clears all caches, passes every request straight to the network,
// then unregisters itself so users get fresh assets immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          try { client.navigate(client.url); } catch (e) {}
        });
      })
      .then(() => self.registration.unregister())
  );
});

// Pass every fetch straight to the network — no caching at all.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
