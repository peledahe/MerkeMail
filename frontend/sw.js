const CACHE_NAME = 'merkemail-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/img/merke.png',
  '/img/merke.svg',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/static/css/app.css',
  '/static/js/vendor/tailwindcss-3.4.17.js',
  '/static/js/ui.js',
  '/static/js/composer.js',
  '/static/js/email.js',
  '/static/js/calendar.js',
  '/static/js/gemini.js',
  '/static/js/antigravity.js',
  '/static/js/signatures.js',
  '/static/js/app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Recursos cacheados parcialmente:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones a la API ni peticiones no-GET
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Network First con fallback a Cache para que los datos siempre estén actualizados
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
