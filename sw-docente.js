const CACHE_NAME = 'docente-offline-v1';

const ARCHIVOS = [
  './',
  './docente_con_automatico_offline.html'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

// Activar
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Interceptar solicitudes
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {

        // Si existe una copia local, usarla
        if (cachedResponse) {
          return cachedResponse;
        }

        // Si hay Internet, intentar obtenerla
        return fetch(event.request)
          .then(response => {

            // Guardar una copia para usarla después offline
            if (
              response &&
              response.status === 200 &&
              response.type === 'basic'
            ) {
              const copia = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, copia);
                });
            }

            return response;
          })
          .catch(() => {

            // Si no hay Internet y no existe copia
            return new Response(
              'Sin conexión. Este recurso todavía no está disponible sin Internet.',
              {
                status: 503,
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8'
                }
              }
            );
          });
      })
  );
});
