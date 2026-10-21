// ============================================================
// GOLFIE — SERVICE WORKER
// ============================================================
// Hace que la app abra sin señal. Antes, al ser un único archivo, sobrevivía
// offline sólo por suerte de la caché del navegador; ahora son ~15 archivos y
// hace falta precachearlos de verdad.
//
// Reglas:
//   - /api  -> SIEMPRE red, nunca caché. Los datos los maneja la cola de
//              sync, que ya sabe reintentar; una respuesta cacheada de /api
//              le haría creer que una escritura se guardó cuando no.
//   - resto -> red primero con 2,5s de paciencia, y si no contesta, caché.
//
// Por qué red primero y no caché primero: con caché primero, cada vez que se
// despliega una versión nueva el usuario ve la vieja una vez más (la nueva
// recién queda para la carga siguiente), que es exactamente la clase de cosa
// que hace pensar "no cambió nada". El timeout corto conserva lo importante:
// sin señal en la cancha, a los 2,5s sirve lo cacheado y la app abre igual.
// ============================================================

const CACHE_VERSION = 'golfie-v2.8';
const NETWORK_TIMEOUT_MS = 2500;

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-transparent.svg',
  '/icon.png',
  '/css/fonts.css',
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/css/responsive.css',
  '/fonts/bebas-neue-latin.woff2',
  '/fonts/bebas-neue-latin-ext.woff2',
  '/fonts/dm-sans-latin.woff2',
  '/fonts/dm-sans-latin-ext.woff2',
  '/js/main.js',
  '/js/context.js',
  '/js/state.js',
  '/js/store.js',
  '/js/sync.js',
  '/js/util.js',
  '/js/catalog.js',
  '/js/friends.js',
  '/data/courses.json',
  '/js/core/courses.js',
  '/js/core/handicap.js',
  '/js/core/scorecard.js',
  '/js/core/formats.js',
  '/js/core/standings.js',
  '/js/core/stats.js',
  '/js/core/insights.js',
  '/js/ui/router.js',
  '/js/ui/toast.js',
  '/js/ui/modal.js',
  '/js/ui/charts.js',
  '/js/ui/home.js',
  '/js/ui/history.js',
  '/js/ui/setup.js',
  '/js/ui/course-form.js',
  '/js/ui/tracker.js',
  '/js/ui/clubs.js',
  '/js/ui/dashboard.js',
  '/js/ui/repair.js',
  '/js/ui/friends.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll es todo-o-nada: si un archivo falla no se instala nada y la
      // app sigue funcionando online. Mejor eso que una caché a medias.
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fuentes, etc.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;  // nunca cachear datos

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Ni red ni caché: que falle como fallaría sin service worker.
    return fetch(req);
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}
