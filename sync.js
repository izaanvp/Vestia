// Sincronización con tu servidor Vestia (servidor.js en Cloudflare): tu armario en todos tus móviles,
// consultable desde cualquier sitio y con una «mini Vestia» pública opcional.
import * as db from './db.js';
import * as W from './web.js';
import { state, saveProfile, toast } from './core.js';

const PUBLIC_PROFILE = ['name', 'bio', 'styles', 'season', 'accent', 'brands', 'avatar'];
const srv = () => state.profile.server || null;
export const isLinked = () => !!(srv()?.url && srv()?.id && srv()?.secret);
export const miniUrl = () => (isLinked() ? `${srv().url}/u/${srv().id}` : '');
export const cleanUrl = (u) => (u || '').trim().replace(/\/+$/, '');

async function api(path, { method = 'GET', body } = {}) {
  const s = srv();
  const res = await fetch(`${s.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${s.secret}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `El servidor respondió ${res.status}`);
  return data;
}

// Conecta con un servidor nuevo (crea tu armario allí)
export async function connect(url) {
  url = cleanUrl(url);
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) throw new Error('La dirección debe empezar por https://');
  const res = await fetch(`${url}/api/cuenta`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data.error || 'Ese no parece un servidor de Vestia');
  state.profile.server = { url, id: data.id, secret: data.secret, public: false, lastSync: 0 };
  saveProfile();
  W.setCustomReader(url); // el servidor también lee webs para Vistelo
  return sync({ full: true });
}

// Vincula este móvil a un armario existente (desde el QR privado del otro móvil)
export async function link({ s, u, k }) {
  state.profile.server = { url: cleanUrl(s), id: u, secret: k, public: false, lastSync: 0 };
  saveProfile();
  W.setCustomReader(cleanUrl(s));
  return sync({ full: true });
}
export function unlink() { delete state.profile.server; saveProfile(); }

// Texto del QR privado: abre Vestia en el otro móvil y lo vincula a este armario
export function linkCode() {
  const s = srv();
  const raw = btoa(unescape(encodeURIComponent(JSON.stringify({ s: s.url, u: s.id, k: s.secret })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}?vincular=${raw}`;
}
export function readLinkCode(param) {
  const b = param.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
}
// Datos de vinculación dentro de un texto escaneado (o null si no es un QR de vincular)
export function linkFromText(text) {
  const m = String(text || '').match(/[?&]vincular=([\w-]+)/);
  if (!m) return null;
  try { const d = readLinkCode(m[1]); return d?.s && d?.u && d?.k ? d : null; } catch { return null; }
}
export const linkQuestion = (d) => `¿Usar en este iPhone el armario vinculado (${d.s.replace(/^https?:\/\//, '')})? Las prendas de los dos se juntarán y se mantendrán sincronizadas.`;

const stamp = (it) => it.updatedAt || it.createdAt || 0;
let running = null;
let timer = null;
// Sincroniza en segundo plano poco después de un cambio
export function scheduleSync() {
  if (!isLinked()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync().catch(() => {}), 2500);
}

export function sync({ full = false, onProgress = () => {} } = {}) {
  if (!isLinked()) return Promise.resolve(null);
  if (running) return running;
  running = (async () => {
    const p = state.profile, s = srv();
    const remote = await api(`/api/u/${s.id}/indice`);
    let up = 0, down = 0, removed = 0;
    // 1) Borrados: los del servidor se aplican aquí; los de aquí se envían
    const localDeleted = p.deletedItems || {};
    for (const [id, at] of Object.entries(remote.deleted || {})) {
      const it = state.items.find((x) => x.id === id);
      if (it && stamp(it) <= at) { await db.remove('items', id); state.items = state.items.filter((x) => x.id !== id); removed++; }
    }
    for (const id of Object.keys(localDeleted)) {
      if (remote.items[id]) { await api(`/api/u/${s.id}/prendas/${id}`, { method: 'DELETE' }); removed++; }
    }
    p.deletedItems = {};
    // 2) Prendas: sube las nuevas o más recientes; baja las que faltan o son más nuevas allí
    const toUp = state.items.filter((it) => !remote.items[it.id] || stamp(it) > remote.items[it.id]);
    const toDown = Object.entries(remote.items).filter(([id, at]) => { const it = state.items.find((x) => x.id === id); return !it || at > stamp(it); });
    const total = toUp.length + toDown.length;
    for (const it of toUp) { onProgress(++up + down, total); await api(`/api/u/${s.id}/prendas/${it.id}`, { method: 'PUT', body: { ...it, updatedAt: stamp(it) } }); }
    for (const [id] of toDown) {
      onProgress(up + ++down, total);
      const it = await api(`/api/u/${s.id}/prendas/${id}`);
      await db.put('items', it);
      const i = state.items.findIndex((x) => x.id === id);
      if (i >= 0) state.items[i] = it; else state.items.push(it);
    }
    // 3) Looks y diario: si cambiaron aquí, se sube esta versión; si no, se baja la del servidor
    const dirty = s.dirty || {};
    for (const [kind, store, path] of [['looks', 'outfits', `/api/u/${s.id}/looks`], ['diary', 'diary', `/api/u/${s.id}/diario`]]) {
      const local = kind === 'looks' ? state.outfits : state.diary;
      if (dirty[kind] || (full && !(kind === 'looks' ? remote.looksAt : remote.diaryAt))) await api(path, { method: 'PUT', body: local });
      else {
        const theirs = await api(path);
        await db.clear(store);
        for (const x of theirs) await db.put(store, x);
        if (kind === 'looks') state.outfits = theirs; else state.diary = theirs;
      }
    }
    s.dirty = {};
    // 4) Perfil: lo público y la lista de deseos (para la mini Vestia y la vigilancia de precios)
    const profile = Object.fromEntries(PUBLIC_PROFILE.map((k) => [k, p[k]]));
    profile.wishlist = (p.wishlist || []).map((w) => ({ title: w.title, url: w.url, price: w.price, site: w.site, image: w.image }));
    if (full && !p.name && remote.profile?.name) Object.assign(p, Object.fromEntries(PUBLIC_PROFILE.map((k) => [k, remote.profile[k] ?? p[k]])));
    await api(`/api/u/${s.id}/perfil`, { method: 'PUT', body: { profile, public: !!s.public } });
    // 5) Precios vigilados por el servidor aunque la app esté cerrada
    try {
      const prices = await api(`/api/u/${s.id}/precios`);
      (p.wishlist || []).forEach((w) => {
        const sp = prices[w.url];
        if (!sp?.lastPrice || (w.checkedAt || 0) >= sp.checkedAt) return;
        w.lastPrice = sp.lastPrice; w.checkedAt = sp.checkedAt; w.history = sp.history;
        const base = parseFloat(String(w.price || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
        if (base && sp.lastPrice < base - 0.009) w.drop = { from: base, to: sp.lastPrice, at: sp.checkedAt, seen: false };
      });
    } catch { /* sin precios todavía */ }
    s.lastSync = Date.now();
    saveProfile();
    return { up, down, removed };
  })().finally(() => { running = null; });
  return running;
}

// Mini Vestia pública: activar o desactivar
export async function setPublic(on) {
  srv().public = !!on; saveProfile();
  return sync();
}

// Looks o diario cambiados en este móvil (se subirán en la próxima sincronización)
export function markDirty(kind) {
  if (!isLinked()) return;
  srv().dirty = { ...(srv().dirty || {}), [kind]: true };
  saveProfile();
  scheduleSync();
}

export function noteDeleted(id) {
  if (!isLinked()) return;
  state.profile.deletedItems = { ...(state.profile.deletedItems || {}), [id]: Date.now() };
  saveProfile();
  scheduleSync();
}

