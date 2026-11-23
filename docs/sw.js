const cachePrefix = `booking-shell:${self.registration.scope}:`;
const cacheName = `${cachePrefix}4`;
const shell = ['./', './index.html', './style.css?v=4', './main.mjs?v=4', './calendar.mjs', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const shellUrls = new Set(shell.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell.map(path => new Request(path, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !shellUrls.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      return await fetch(request);
    } catch {
      const cached = await cache.match(navigation ? './' : request);
      return cached || Response.error();
    }
  })());
});
