// Kill-switch: unregister all service workers and clear caches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(reg) { reg.unregister(); });
  });
}
if ('caches' in window) {
  caches.keys().then(function(keys) {
    keys.forEach(function(key) { caches.delete(key); });
  });
}
