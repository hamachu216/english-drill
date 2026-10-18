// Stale-while-revalidate: serve from cache instantly (works offline), refresh the cache in the background.
const CACHE = 'eng-v1';
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    const fresh = fetch(e.request).then((r) => (r.ok && cache.put(e.request, r.clone()), r)).catch(() => hit);
    if (hit) e.waitUntil(fresh);
    return hit || fresh;
  }));
});
