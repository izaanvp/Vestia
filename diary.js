// Diario y calendario de looks: qué te pusiste cada día, looks planificados y avisos de repetición.
import * as db from './db.js';
import { shareLook } from './share.js';
import { markDirty } from './sync.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, label, byId, ICON, slotOf, refresh } from './core.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const niceDate = (k) => fromKey(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const entry = (k) => state.diary.find((e) => e.id === k);
const pieces = (e) => (e?.ids || []).map(byId).filter(Boolean);
// Orden para las miniaturas: lo de arriba primero
const ORDER = ['outer', 'one', 'top', 'bottom', 'shoes', 'bag', 'acc'];
const sorted = (items) => [...items].sort((a, b) => ORDER.indexOf(slotOf(a.type)) - ORDER.indexOf(slotOf(b.type)));

export async function loadDiary() {
  try { state.diary = await db.getAll('diary'); } catch { state.diary = []; }
}

async function bumpWears(ids, delta) {
  const { saveItem } = await import('./closet.js');
  for (const id of ids) {
    const it = byId(id);
    if (!it) continue;
    it.wears = Math.max(0, (it.wears || 0) + delta);
    if (delta > 0) it.lastWorn = Date.now();
    await saveItem(it);
  }
}

// ¿Llevaste exactamente este look hace poco?
export function lastSameLook(ids, beforeKey = dayKey()) {
  const sig = [...ids].sort().join('|');
  return state.diary.filter((e) => e.id < beforeKey && e.status !== 'planned' && [...e.ids].sort().join('|') === sig)
    .sort((a, b) => b.id.localeCompare(a.id))[0] || null;
}

// Apunta un look en un día. Los días futuros quedan como «planificado».
export async function logLook(ids, key = dayKey(), { note, replace = true } = {}) {
  const today = dayKey();
  const planned = key > today;
  const prev = entry(key);
  const old = prev && prev.status !== 'planned' ? prev.ids : [];
  const next = replace ? [...new Set(ids)] : [...new Set([...(prev?.ids || []), ...ids])];
  const rec = { id: key, ids: next, note: note ?? prev?.note ?? '', status: planned ? 'planned' : 'worn', createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now() };
  await db.put('diary', rec);
  state.diary = [...state.diary.filter((e) => e.id !== key), rec];
  markDirty('diary');
  if (!planned) {
    // Solo cuentan las prendas nuevas de ese día (y se descuentan las que se quitan)
    await bumpWears(next.filter((id) => !old.includes(id)), +1);
    await bumpWears(old.filter((id) => !next.includes(id)), -1);
  }
  return rec;
}

export async function removeDay(key) {
  const e = entry(key);
  if (!e) return;
  await db.remove('diary', key);
  state.diary = state.diary.filter((x) => x.id !== key);
  markDirty('diary');
  if (e.status !== 'planned') await bumpWears(e.ids, -1);
}

// «Me lo pongo hoy» desde el probador o desde una prenda
export async function wearToday(ids, { add = false } = {}) {
  if (!ids.length) return toast('Ponle alguna prenda al maniquí');
  const same = !add && lastSameLook(ids);
  await logLook(ids, dayKey(), { replace: !add });
  if (same) toast(`Apuntado. Ojo: ya llevaste este look el ${fromKey(same.id).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`);
  else toast('Apuntado en tu diario');
}

// ---------- Vista: calendario ----------
let cursor = null; // primer día del mes que se ve
export function renderDiary(host, { onTry } = {}) {
  const now = new Date();
  cursor ||= new Date(now.getFullYear(), now.getMonth(), 1);
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
  const days = new Date(y, m + 1, 0).getDate();
  const today = dayKey();
  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
  const inMonth = state.diary.filter((e) => e.id.startsWith(monthKey));
  const worn = inMonth.filter((e) => e.status !== 'planned');
  const planned = state.diary.filter((e) => e.status === 'planned' && e.id >= today).sort((a, b) => a.id.localeCompare(b.id));
  const streak = (() => { let n = 0; const d = new Date(); for (;;) { const e = entry(dayKey(d)); if (!e || e.status === 'planned') break; n++; d.setDate(d.getDate() - 1); } return n; })();
  const usedIds = new Set(worn.flatMap((e) => e.ids));
  const todayE = entry(today);

  const cell = (d) => {
    const k = `${monthKey}-${String(d).padStart(2, '0')}`;
    const e = entry(k);
    const ps = sorted(pieces(e)).slice(0, 2);
    return `<button class="cal-day ${k === today ? 'today' : ''} ${e ? (e.status === 'planned' ? 'planned' : 'worn') : ''} ${k > today ? 'future' : ''}" data-day="${k}">
      <span class="cal-num">${d}</span>
      ${ps.length ? `<span class="cal-look">${ps.map((p, i) => `<img src="${p.img}" alt="" class="p${i}">`).join('')}</span>` : ''}
      ${e?.note ? '<i class="cal-note"></i>' : ''}
    </button>`;
  };

  host.innerHTML = `
    <div class="card diary-today">
      <div class="diary-today-head">
        <div><p class="eyebrow">Hoy · ${esc(niceDate(today))}</p>
          <h3>${todayE ? (todayE.status === 'planned' ? 'Tenías un look planificado' : 'Tu look de hoy') : '¿Qué te pones hoy?'}</h3></div>
        ${streak > 1 ? `<span class="streak" title="Días seguidos apuntando tu look">${streak} días</span>` : ''}
      </div>
      ${todayE ? `<div class="outfit diary-outfit">${sorted(pieces(todayE)).map((x) => `<div class="piece"><img src="${x.img}" alt="${esc(label(x))}"></div>`).join('')}</div>` : '<p class="small muted" style="margin:0 0 10px">Apunta lo que llevas para saber cuánto usas cada prenda y no repetir look sin querer.</p>'}
      <div class="row">
        ${todayE?.status === 'planned' ? '<button class="btn primary" id="confirmToday">Sí, me lo he puesto</button>' : `<button class="btn primary" id="logToday">${ICON.hanger} ${todayE ? 'Usar el del probador' : 'Apuntar el del probador'}</button>`}
        ${todayE ? `<button class="btn ghost" id="shareToday">${ICON.share} Compartir</button>` : ''}
      </div>
    </div>

    <div class="card calendar">
      <div class="cal-head">
        <button class="icon-btn" id="calPrev" aria-label="Mes anterior">‹</button>
        <h3>${MONTHS[m]} <span>${y}</span></h3>
        <button class="icon-btn" id="calNext" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid">
        ${DOW.map((d) => `<span class="cal-dow">${d}</span>`).join('')}
        ${'<span></span>'.repeat(first)}
        ${Array.from({ length: days }, (_, i) => cell(i + 1)).join('')}
      </div>
      <div class="cal-legend"><span><i class="worn"></i>Puesto</span><span><i class="planned"></i>Planificado</span><span><i class="today"></i>Hoy</span></div>
    </div>

    <div class="diary-stats">
      <div><b>${worn.length}</b><span>días apuntados en ${MONTHS[m]}</span></div>
      <div><b>${usedIds.size}</b><span>prendas usadas</span></div>
      <div><b>${state.items.length ? Math.round((usedIds.size / state.items.length) * 100) : 0}%</b><span>de tu armario</span></div>
    </div>

    ${planned.length ? `<div class="card"><h3>${ICON.calendar} Próximos looks</h3>
      ${planned.map((e) => `<button class="plan-row" data-day="${e.id}"><span class="plan-date">${esc(fromKey(e.id).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
        <span class="plan-pieces">${sorted(pieces(e)).slice(0, 4).map((p) => `<img src="${p.img}" alt="">`).join('')}</span>${e.note ? `<small>${esc(e.note)}</small>` : ''}</button>`).join('')}
    </div>` : ''}`;

  const rerender = () => renderDiary(host, { onTry });
  $('#calPrev', host).addEventListener('click', () => { cursor = new Date(y, m - 1, 1); rerender(); });
  $('#calNext', host).addEventListener('click', () => { cursor = new Date(y, m + 1, 1); rerender(); });
  $$('[data-day]', host).forEach((b) => b.addEventListener('click', () => openDay(b.dataset.day, { onTry, onChange: rerender })));
  $('#logToday', host)?.addEventListener('click', async () => {
    const ids = Object.values(state.worn).filter(byId);
    if (!ids.length) { toast('Viste primero al maniquí en el Probador'); return; }
    await wearToday(ids); rerender();
  });
  $('#confirmToday', host)?.addEventListener('click', async () => { await logLook(todayE.ids, today); toast('¡Apuntado!'); rerender(); });
  $('#shareToday', host)?.addEventListener('click', () => shareLook(sorted(pieces(todayE)), { title: 'Mi look de hoy', subtitle: niceDate(today) }));
}

// ---------- Hoja de un día ----------
function openDay(key, { onTry, onChange } = {}) {
  const e = entry(key);
  const today = dayKey();
  const future = key > today;
  const ps = sorted(pieces(e));
  const currentIds = Object.values(state.worn).filter(byId);
  const saved = state.outfits.map((o) => ({ ...o, pieces: o.ids.map(byId).filter(Boolean) })).filter((o) => o.pieces.length).slice(-8).reverse();
  const sheet = openSheet(`
    <p class="eyebrow accent">${future ? 'Planificar' : key === today ? 'Hoy' : 'Diario'}</p>
    <h3 class="detail-title" style="text-transform:capitalize">${esc(niceDate(key))}</h3>
    ${ps.length ? `<div class="outfit diary-outfit">${ps.map((x) => `<div class="piece"><img src="${x.img}" alt="${esc(label(x))}"></div>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 14px">${ps.map((x) => esc(label(x))).join(' · ')}</p>` : `<p class="muted" style="margin:0 0 14px">${future ? 'Elige el look que te pondrás ese día.' : 'No apuntaste nada este día.'}</p>`}
    <div class="field"><label>Nota</label><textarea id="dayNote" placeholder="${future ? 'Cena con amigos, entrevista…' : 'Dónde fuiste, cómo te sentiste…'}">${esc(e?.note || '')}</textarea></div>
    ${currentIds.length ? `<button class="btn primary block" id="dayUseCurrent" style="margin-bottom:8px">${ICON.hanger} ${ps.length ? 'Cambiar por' : 'Usar'} el look del probador</button>` : ''}
    ${saved.length ? `<p class="section-label">O elige uno de tus looks guardados</p>
      <div class="saved-pick">${saved.map((o, i) => `<button data-pick="${i}">${o.pieces.slice(0, 3).map((p) => `<img src="${p.img}" alt="">`).join('')}</button>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:12px">
      ${ps.length ? `<button class="btn ghost" id="dayTry">${ICON.hanger} Probar</button><button class="btn ghost" id="dayShare">${ICON.share} Compartir</button>` : ''}
      ${e ? '<button class="btn danger" id="dayDel">Borrar</button>' : ''}
    </div>`);
  const note = () => $('#dayNote', sheet).value.trim();
  const done = (msg) => { closeSheet(); onChange?.(); refresh(); if (msg) toast(msg); };
  $('#dayNote', sheet).addEventListener('change', async () => { if (e) { e.note = note(); e.updatedAt = Date.now(); await db.put('diary', e); markDirty('diary'); onChange?.(); } });
  $('#dayUseCurrent', sheet)?.addEventListener('click', async () => {
    const same = !future && lastSameLook(currentIds, key);
    await logLook(currentIds, key, { note: note() });
    done(same ? `Apuntado. Ya lo llevaste el ${fromKey(same.id).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : future ? 'Look planificado' : 'Apuntado en tu diario');
  });
  $$('[data-pick]', sheet).forEach((b) => b.addEventListener('click', async () => {
    await logLook(saved[+b.dataset.pick].ids, key, { note: note() });
    done(future ? 'Look planificado' : 'Apuntado en tu diario');
  }));
  $('#dayTry', sheet)?.addEventListener('click', () => { closeSheet(); onTry?.(ps.map((p) => p.id)); });
  $('#dayShare', sheet)?.addEventListener('click', () => shareLook(ps, { title: future ? 'Mi próximo look' : 'Mi look', subtitle: niceDate(key) }));
  $('#dayDel', sheet)?.addEventListener('click', async () => { await removeDay(key); done('Día borrado del diario'); });
}
