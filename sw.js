// Network-first: always fresh when online, cached copy when offline.
// skipWaiting + claim: a new version takes over on the next load instead of waiting for every tab to close.
const CACHE = 'eng-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => {
    const copy = r.clone();
    if (r.ok) e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
    return r;
  }).catch(() => caches.match(e.request)));
});
