// Network-first: always fresh when online, cached copy when offline.
// skipWaiting + claim: a new version takes over on the next load instead of waiting for every tab to close.
const CACHE = 'eng-v1';
// Every file the app needs, saved when the worker is installed, so it opens offline after a single visit
// (test/sw.test.js keeps the list complete). 'reload': the server's copy, not one from the browser's HTTP cache.
const FILES = [
  './', 'index.html', 'style.css', 'theme.js', 'app.js', 'core.js', 'plan.js', 'colloc.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png',
  'data/1-basic.json', 'data/2-advanced.json', 'data/3-discussion.json', 'data/4-conference.json', 'data/5-defense.json',
  'data/patterns.json', 'data/qa.json', 'data/collocations.json', 'data/replies.json', 'data/backchannels.json', 'data/listening.json',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE)
  .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  // Only this app's own files: the origin is shared with the user's other GitHub Pages sites.
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => {
    const copy = r.clone();
    if (r.ok) e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
    return r;
  // Offline: the saved copy, whatever query the URL carries (a home-screen launch may add one); a page opened
  // at any other URL inside the app gets the app itself.
  }).catch(async () => (await caches.match(e.request, { ignoreSearch: true })) ?? (e.request.mode === 'navigate' ? caches.match('./') : undefined)));
});
