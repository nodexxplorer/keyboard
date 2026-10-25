const CACHE_NAME = 'auxkeys-v2';
const APP_SHELL = [
  './',
  './index.html',
  './chart.html',
  './pitch-processor.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];
const TONE_URL = 'https://cdn.jsdelivr.net/npm/tone@15.1.22/build/Tone.js';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isTone = url.href === TONE_URL;
  const isSameOriginAppAsset = url.origin === self.location.origin &&
    !url.pathname.endsWith('/state') && !url.pathname.endsWith('/update');
  if (!isTone && !isSameOriginAppAsset) return;

  // Network-first refreshes updated app files while retaining a usable offline
  // copy. The pinned Tone.js dependency is cached after its first successful
  // load; /state and /update are deliberately never cached.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
