// Service worker: guarda la app para que funcione sin conexión.
const CACHE = 'vestia-v15';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'core.js', 'db.js', 'color.js', 'advisor.js',
  'closet.js', 'dress.js', 'fitting.js', 'skin.js', 'skinui.js', 'bodyui.js', 'demo.js', 'wear.js', 'realwear.js', 'cutout.js', 'scanner.js', 'swipe.js', 'intro.js', 'vistelo.js', 'shop.js', 'profile.js',
  'vision.js', 'vision-text.json', 'web.js', 'share.js', 'diary.js', 'stats.js', 'prices.js', 'label.js', 'transfer.js', 'pose.js', 'photobody.js', 'sync.js', 'card.js', 'parse.js', 'face.js', 'poseui.js', 'lookscan.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

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
