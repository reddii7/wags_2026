// Kill-switch service worker.
// Replaces the old PWA service worker, clears all caches, and unregisters itself.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() =>
      self.registration.unregister()
    ).then(() =>
      self.clients.matchAll({ type: 'window' })
    ).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    })
  );
});
