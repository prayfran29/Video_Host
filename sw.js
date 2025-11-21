// Service Worker for PWA
const CACHE_NAME = 'majin-streams-v1';
const urlsToCache = [
  '/',
  '/styles.css',
  '/script.js',
  '/public/icon.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});