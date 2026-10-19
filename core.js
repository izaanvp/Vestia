// Núcleo compartido: catálogos, estado, utilidades y navegación.
import * as db from './db.js';
import * as C from './color.js';

export const TYPES = ['Camiseta', 'Camisa', 'Top', 'Jersey', 'Sudadera', 'Chaqueta', 'Abrigo', 'Americana',
  'Pantalón', 'Vaqueros', 'Falda', 'Shorts', 'Vestido', 'Mono', 'Zapatos', 'Zapatillas', 'Botas',
  'Sandalias', 'Bolso', 'Accesorio'];
export const SLOT = {
  top: ['Camiseta', 'Camisa', 'Top', 'Jersey', 'Sudadera'],
  bottom: ['Pantalón', 'Vaqueros', 'Falda', 'Shorts'],
  one: ['Vestido', 'Mono'],
  outer: ['Chaqueta', 'Abrigo', 'Americana'],
  shoes: ['Zapatos', 'Zapatillas', 'Botas', 'Sandalias'],
  bag: ['Bolso'],
  acc: ['Accesorio'],
};
export const SLOT_LABEL = { top: 'Arriba', bottom: 'Abajo', one: 'Vestido', outer: 'Abrigo', shoes: 'Calzado', bag: 'Bolso', acc: 'Accesorio' };
export const slotOf = (type) => Object.keys(SLOT).find((k) => SLOT[k].includes(type)) || 'acc';
export const SEASONS_WEAR = ['Todo el año', 'Verano', 'Invierno', 'Entretiempo'];
export const PATTERNS = ['Liso', 'Rayas', 'Cuadros', 'Floral', 'Lunares', 'Animal print', 'Estampado gráfico', 'Camuflaje', 'Punto texturizado', 'Lentejuelas'];
export const ITEM_STYLES = ['Casual', 'Formal', 'Deportivo', 'Fiesta', 'Streetwear'];
export const OCCASIONS = {
  Casual: { types: ['Camiseta', 'Vaqueros', 'Zapatillas', 'Sudadera', 'Shorts'], styles: ['Casual', 'Streetwear'] },
  Trabajo: { types: ['Camisa', 'Pantalón', 'Americana', 'Falda', 'Zapatos', 'Jersey'], styles: ['Formal', 'Casual'] },
  Noche: { types: ['Vestido', 'Top', 'Mono', 'Sandalias', 'Bolso', 'Zapatos'], styles: ['Fiesta', 'Formal'] },
  Deporte: { types: ['Sudadera', 'Camiseta', 'Shorts', 'Zapatillas', 'Chaqueta'], styles: ['Deportivo'] },
};
export const STYLES = ['Minimalista', 'Streetwear', 'Clásico', 'Boho', 'Deportivo', 'Elegante', 'Vintage', 'Romántico', 'Y2K', 'Old money'];
export const STYLE_KEYS = {
  Minimalista: ['Camisa blanca oversize', 'Pantalón recto negro'],
  Streetwear: ['Sudadera oversize', 'Cargo', 'Zapatillas de caña alta'],
  Clásico: ['Americana', 'Mocasines', 'Trench'],
  Boho: ['Vestido midi fluido', 'Sandalias planas'],
  Deportivo: ['Chaqueta cortavientos', 'Zapatillas running'],
  Elegante: ['Vestido lencero', 'Zapatos de tacón'],
  Vintage: ['Vaquero mom', 'Cárdigan de punto'],
  Romántico: ['Blusa de volantes', 'Falda midi plisada'],
  Y2K: ['Baby tee', 'Pantalón de tiro bajo'],
  'Old money': ['Jersey de cuello redondo', 'Pantalón de pinzas', 'Mocasines'],
};
export const ACCENTS = ['#19b5ad', '#2ec4c9', '#0f9aa0', '#40e0d0', '#1b7f8f'];

export const state = {
  profile: db.loadProfile(),
  items: [],
  outfits: [],
  diary: [],
  bodyPhoto: null,
  tab: 'closet',
  groupBy: 'type',
  query: '',
  // vestidor
  dressView: 'probador',
  worn: {},
  dressSlot: 'top',
  anchor: null,
  occasion: 'Casual',
  generated: [],
  // vistelo
  test: null,
  chat: [],
  // drops
  news: {},
  newsLoading: false,
  linkResult: null,
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const saveProfile = () => db.saveProfile(state.profile);
export const shopLink = (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
export const colorHex = (name) => C.NAMED_COLORS.find((c) => c.name === name)?.hex || '#ccc';
export const label = (it) => it.name || it.subtype || it.type;
export const byId = (id) => state.items.find((i) => i.id === id);

export const ICON = {
  spark: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" class="ic"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
  link: '<svg viewBox="0 0 24 24" class="ic"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  sun: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  palette: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-2-.5-1.3.3-2.5 1.7-2.5H17a4 4 0 0 0 4-4C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.3" r="1.2"/><circle cx="14.5" cy="7.3" r="1.2"/></svg>',
  hanger: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 5.5a1.8 1.8 0 1 1 1.8 1.8c-.8 0-1.8.5-1.8 1.4v1L3.4 15.5c-.8.5-.4 1.5.5 1.5h16.2c.9 0 1.3-1 .5-1.5L12 9.7"/></svg>',
  wand: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 20 15 9"/><path d="M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3l.7 1.3L20 5l-1.3.7L18 7l-.7-1.3L16 5l1.3-.7z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" class="ic"><path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  send: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" class="ic"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  x: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  layers: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5" opacity=".55"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" class="ic"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1" fill="currentColor"/><circle cx="12" cy="14.5" r="1" fill="currentColor"/></svg>',
  share: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v6.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V12"/></svg>',
  chart: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
  qr: '<svg viewBox="0 0 24 24" class="ic"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h3v3M20.5 14v.01M14 20.5h.01M17 20.5h3.5v-3"/></svg>',
  tag: '<svg viewBox="0 0 24 24" class="ic"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  person: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="5" r="2.4"/><path d="M8 21v-6.5L6.5 9.5 12 8l5.5 1.5L16 14.5V21M12 14.5V21"/></svg>',
  down: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 7l6 6 3.5-3.5L20 16"/><path d="M14 16h6v-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="ic"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

let toastTimer, toastOut;
export function toast(msg) {
  const t = $('#toast');
  clearTimeout(toastTimer); clearTimeout(toastOut);
  t.textContent = msg; t.classList.remove('out'); t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  toastTimer = setTimeout(() => { t.classList.add('out'); toastOut = setTimeout(() => (t.hidden = true), 260); }, 2800);
}

let onSheetClose = null, sheetClosing = null;
export function openSheet(html, onClose = null) {
  const sheet = $('#sheet'), back = $('#sheetBackdrop');
  clearTimeout(sheetClosing);
  sheet.classList.remove('closing'); back.classList.remove('closing');
  sheet.style.transform = '';
  sheet.innerHTML = `<div class="grab"></div><button class="sheet-close" aria-label="Cerrar">${ICON.x}</button>${html}`;
  const wasOpen = !sheet.hidden;
  sheet.hidden = false; back.hidden = false;
  if (!wasOpen) { sheet.classList.remove('opening'); void sheet.offsetWidth; sheet.classList.add('opening'); }
  sheet.scrollTop = 0;
  onSheetClose = onClose;
  $('.sheet-close', sheet).addEventListener('click', closeSheet);
  return sheet;
}
export function closeSheet() {
  const sheet = $('#sheet'), back = $('#sheetBackdrop');
  if (sheet.hidden) return;
  sheet.classList.add('closing'); back.classList.add('closing');
  const cb = onSheetClose; onSheetClose = null;
  sheetClosing = setTimeout(() => {
    sheet.hidden = true; back.hidden = true;
    sheet.classList.remove('closing', 'opening'); back.classList.remove('closing');
    sheet.style.transform = '';
  }, 240);
  cb?.();
}

// Arrastrar la hoja hacia abajo para cerrarla (gesto de iPhone).
(function sheetDrag() {
  const sheet = document.getElementById('sheet');
  if (!sheet) return;
  let startY = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0) return;
    startY = e.touches[0].clientY; dy = 0;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (startY === null) return;
    sheet.style.transition = '';
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
    startY = null;
  });
})();

export const fileToDataURL = (file) => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file);
});
export const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
});
export async function prepareImage(file, max = 900) {
  const img = await loadImage(typeof file === 'string' ? file : await fileToDataURL(file));
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const keepAlpha = typeof file !== 'string' && /png|webp|gif/.test(file.type);
  const ctx = c.getContext('2d');
  if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, dataUrl: c.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.86) };
}
export function pickFiles(accept = 'image/*') {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = true;
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}
export function pickFile(accept = 'image/*', capture = false) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    if (capture) inp.setAttribute('capture', typeof capture === 'string' ? capture : 'user');
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

// Navegación: las vistas se registran desde app.js
export const views = {};
export function go(tab) { views.go(tab); }
export function refresh() { views.go(state.tab, { keepScroll: true }); }
