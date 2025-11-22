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
  // Skip external resources and video files
  if (event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('cloudflareinsights.com') ||
      event.request.url.includes('/videos/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
      .catch(() => {
        // Fallback for failed requests
        return fetch(event.request);
      })
  );
});