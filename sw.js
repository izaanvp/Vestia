// Service worker: guarda la app para que funcione sin conexión.
const CACHE = 'vestia-v10';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/core.js', 'js/db.js', 'js/color.js', 'js/advisor.js',
  'js/closet.js', 'js/dress.js', 'js/fitting.js', 'js/skin.js', 'js/skinui.js', 'js/bodyui.js', 'js/demo.js', 'js/wear.js', 'js/cutout.js', 'js/scanner.js', 'js/swipe.js', 'js/intro.js', 'js/vistelo.js', 'js/shop.js', 'js/profile.js',
  'js/vision.js', 'js/vision-text.json', 'js/web.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || /r\.jina\.ai|allorigins|open-meteo|huggingface|hf\.co/.test(url.hostname)) return;
  // Red primero para la app (así recibes actualizaciones), caché como respaldo.
  e.respondWith(
    // Los archivos propios se revalidan siempre para que las actualizaciones lleguen al momento.
    (url.origin === location.origin ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request)).then((res) => {
      if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.') || url.hostname === 'cdn.jsdelivr.net')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
