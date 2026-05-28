'use strict';

const CACHE_NAME = 'life-tracker-v1';
const PRECACHE = [
  './',
  './index.html',
  './css/main.css',
  './js/utils.js',
  './js/store.js',
  './js/budget.js',
  './js/habits.js',
  './js/savings.js',
  './js/projects.js',
  './js/dashboard.js',
  './js/charts.js',
  './js/app.js',
  './manifest.json',
  // Add icon paths here once icons/icon-192.png and icons/icon-512.png exist
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for same-origin assets, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
