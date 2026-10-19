// Avisos de bajada de precio de tu lista de deseos.
// Vestia vuelve a leer cada producto (con el mismo lector web) cuando abres la app, como mucho cada 12 horas.
// Sin servidor no puede vigilar los precios con la app cerrada.
import * as W from './web.js';
import * as A from './advisor.js';
import { state, saveProfile, toast } from './core.js';

const EVERY = 12 * 3600e3;
export const num = (p) => { const n = parseFloat(String(p || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
export const euro = (n) => `${n.toFixed(2).replace('.', ',')} €`;
let running = null;

export const dropsOf = () => (state.profile.wishlist || []).filter((w) => w.drop && !w.drop.seen);

// Comprueba los precios. onProgress(i, n) informa del avance. Devuelve las prendas que han bajado.
export function checkPrices({ force = false, onProgress = () => {} } = {}) {
  const p = state.profile;
  const list = p.wishlist || [];
  if (!list.length) return Promise.resolve([]);
  if (!force && p.pricesCheckedAt && Date.now() - p.pricesCheckedAt < EVERY) return Promise.resolve([]);
  if (running) return running;
  running = (async () => {
    const found = [];
    for (const [i, w] of list.entries()) {
      onProgress(i, list.length);
      try {
        const prod = A.productFromPage(await W.readPage(w.url, { force: true }));
        const now = num(prod.price);
        const base = num(w.price);
        w.checkedAt = Date.now();
        if (!now) continue;
        w.history ||= base ? [{ at: w.savedAt || Date.now(), price: base }] : [];
        if (w.history.at(-1)?.price !== now) w.history.push({ at: Date.now(), price: now });
        w.history = w.history.slice(-20);
        w.lastPrice = now;
        if (prod.image && !w.image) w.image = prod.image;
        // Bajada respecto al precio con el que lo guardaste (o al último aviso)
        const ref = w.drop?.to ?? base;
        if (ref && now < ref - 0.009) {
          w.drop = { from: base || ref, to: now, at: Date.now(), seen: false };
          found.push(w);
        } else if (base && now >= base) delete w.drop; // volvió a subir
      } catch { /* la tienda no se pudo leer esta vez */ }
    }
    onProgress(list.length, list.length);
    p.pricesCheckedAt = Date.now();
    saveProfile();
    if (found.length) await notify(found);
    return found;
  })().finally(() => { running = null; });
  return running;
}

async function notify(found) {
  const first = found[0];
  const text = found.length === 1
    ? `${first.title}: de ${euro(first.drop.from)} a ${euro(first.drop.to)}`
    : `${found.length} prendas de tu lista de deseos han bajado de precio`;
  toast(`↓ ${text}`);
  updateBadge();
  if (state.profile.priceNotify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: text, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'vestia-precios' };
      if (reg) await reg.showNotification('Bajada de precio · Vestia', opts); else new Notification('Bajada de precio · Vestia', opts);
    } catch { /* sin permiso o no disponible */ }
  }
}

// Punto en la pestaña Drops cuando hay bajadas sin ver
export function updateBadge() {
  const tab = document.querySelector('.tabbar [data-tab="shop"]');
  if (tab) tab.classList.toggle('has-badge', dropsOf().length > 0);
}

export async function enableNotifications() {
  if (!('Notification' in window)) { toast('Este navegador no permite notificaciones. En iPhone, añade Vestia a la pantalla de inicio.'); return false; }
  const r = await Notification.requestPermission();
  state.profile.priceNotify = r === 'granted';
  saveProfile();
  toast(r === 'granted' ? 'Te avisaré cuando algo baje de precio' : 'Sin permiso para notificaciones');
  return r === 'granted';
}
