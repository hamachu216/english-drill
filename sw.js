// Network-first: always fresh when online, cached copy when offline.
const CACHE = 'eng-v1';
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    if (r.ok) e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
    return r;
  }).catch(() => caches.match(e.request)));
});
