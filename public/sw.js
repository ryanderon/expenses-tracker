const CACHE_NAME = 'penny-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg?v=2',
  '/icons/icon-192.png?v=2',
  '/icons/icon-512.png?v=2',
  '/icons/apple-touch-icon.png?v=2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension')) return;

  const url = new URL(request.url);

  // Dev servers change modules on every edit; caching them mixes old and new.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Live data (stock quotes) must never be served from the cache.
  if (url.pathname.startsWith('/api/')) return;

  // Manrope and the Material Symbols icons come from Google Fonts. Keep a copy,
  // or opening the app offline after the browser's own cache has expired shows
  // every icon as its name ("calendar_month") and pushes the layout apart.
  // Serve the copy straight away and refresh it in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    const cached = caches.match(request);
    const fresh = fetch(request).then(async (response) => {
      // The stylesheet link is a no-cors request, so its response is opaque.
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    });
    event.respondWith(cached.then((hit) => hit || fresh));
    event.waitUntil(fresh.catch(() => {}));
    return;
  }

  // For navigation requests, try network first then fall back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For assets, try cache first then network (and cache new responses)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache same-origin, successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
