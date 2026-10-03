/* Service Worker para docentqrpres: permite recargar la aplicación sin Internet. */
const CACHE_NAME = 'docente-app-v2';
const APP_FILE = 'docente.html';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Guardar la aplicación principal para que una recarga offline siga funcionando.
    try {
      const appUrl = new URL(APP_FILE, self.registration.scope).href;
      const response = await fetch(appUrl, { cache: 'no-cache' });
      if (response.ok) await cache.put(appUrl, response);
    } catch (e) {
      // La página actual también se cacheará con el fetch handler cuando esté disponible.
    }

    // Supabase JS viene de jsDelivr. Guardarlo permite arrancar la app sin Internet.
    try {
      const response = await fetch(SUPABASE_JS, { mode: 'no-cors', cache: 'no-cache' });
      await cache.put(SUPABASE_JS, response);
    } catch (e) {}

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Navegación: primero Internet para obtener una versión nueva; si no hay red,
  // usar la copia guardada. Así actualizar/recargar no borra la aplicación.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        const exact = await cache.match(request);
        if (exact) return exact;

        const appUrl = new URL(APP_FILE, self.registration.scope).href;
        const app = await cache.match(appUrl);
        if (app) return app;

        return new Response('Aplicación no disponible sin conexión.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Supabase JS: cache-first para que el script siga disponible offline.
  if (url.href === SUPABASE_JS) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response) await cache.put(request, response.clone());
        return response;
      } catch (e) {
        return cached || new Response('', { status: 503 });
      }
    })());
  }
});
