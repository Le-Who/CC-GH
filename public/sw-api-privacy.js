/* Retire only the legacy personal HTTP-response cache. Player IDB is unrelated. */
self.addEventListener('activate', event => {
  event.waitUntil(caches.delete('api-get-cache'));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_LEGACY_API_CACHE') {
    event.waitUntil(caches.delete('api-get-cache'));
  }
});
