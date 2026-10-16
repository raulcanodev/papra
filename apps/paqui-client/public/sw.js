/* eslint-disable no-restricted-globals -- the global scope of a service worker is `self` */
// Paqui service worker: a fast start for the installed app, never a stale or cached answer from the API.
// - the page itself: network first, the last copy when offline
// - the fingerprinted build files (/assets/*): cache first, they never change
// - everything else, and /api above all: straight to the network
// Bump the version to drop every cache of the previous worker.
const CACHE_NAME = 'paqui-shell-v1';
const SHELL_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([SHELL_URL, '/logo.svg', '/manifest.json'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// The app asks for it when the member chooses to reload after an update
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then(cached => cached ?? Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
