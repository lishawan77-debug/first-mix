/* Warm-cache offline support. Never cache API/auth responses or third-party requests. */
const CACHE = 'first-mix-game-v2';
self.addEventListener('install', event => {
  // Warm cache on later controlled requests; never precache a possibly private document.
  event.waitUntil(caches.open(CACHE));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('first-mix-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = req.mode === 'navigate' && url.pathname === '/' && !url.search;
  const asset = /\.(?:js|css|woff2?|png|svg|webmanifest)$/.test(url.pathname) && !/^\/(?:api|auth)\//.test(url.pathname);
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(req);
      if (response.ok && response.type === 'basic' && !response.redirected && !/no-store|private/i.test(response.headers.get('cache-control') || '')) {
        event.waitUntil(cache.put(navigation ? '/' : req, response.clone()));
      }
      return response;
    } catch {
      return await cache.match(navigation ? '/' : req) || new Response('Reconnect once to load FIRST MIX, then try again.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
