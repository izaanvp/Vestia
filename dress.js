// Vestidor: probador con maniquí, ideas de looks y looks guardados.
import * as db from './db.js';
import * as C from './color.js';
import * as A from './advisor.js';
import * as F from './fitting.js';
import { renderReal } from './realwear.js';
import { POSES } from './wear.js';
import { describe } from './skin.js';
import { openSkinSheet } from './skinui.js';
import { openBodySheet } from './bodyui.js';
import { showItem, bestMatches } from './closet.js';
import { renderDiary, wearToday } from './diary.js';
import { shareLook } from './share.js';
import { markDirty } from './sync.js';
import { customBody, openBodyPhoto, wearBody } from './photobody.js';
import {
  state, $, $$, esc, toast, openSheet, saveProfile, label, byId, ICON, SLOT, SLOT_LABEL, OCCASIONS, slotOf, go,
} from './core.js';

// ---------- Generación de looks ----------
export function scoreOutfit(pieces, occasion = state.occasion, weather = null) {
  let h = 0, n = 0;
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    h += C.harmony(pieces[i].hex, pieces[i].color, pieces[j].hex, pieces[j].color); n++;
  }
  const harm = n ? h / n : 0.7;
  const season = state.profile.season;
  const fit = season ? pieces.reduce((a, p) => a + C.paletteFit(p.hex, season), 0) / pieces.length : 0.5;
  const occ = OCCASIONS[occasion] || OCCASIONS.Casual;
  const occFit = pieces.filter((p) => occ.types.includes(p.type) || (p.style && occ.styles.includes(p.style))).length / pieces.length;
  const loud = new Set(pieces.filter((p) => !C.isNeutral(p.color)).map((p) => p.color)).size;
  const patterns = pieces.filter((p) => p.pattern && p.pattern !== 'Liso').length;
  let wFit = 0;
  if (weather) {
    const cold = weather.temp <= 13, hot = weather.temp >= 25;
    pieces.forEach((p) => {
      if (cold && (p.season === 'Verano' || ['Shorts', 'Sandalias'].includes(p.type))) wFit -= 0.15;
      if (hot && (p.season === 'Invierno' || ['Abrigo', 'Botas', 'Jersey'].includes(p.type))) wFit -= 0.15;
      if (weather.rain && p.type === 'Sandalias') wFit -= 0.2;
    });
    if (cold && pieces.some((p) => slotOf(p.type) === 'outer')) wFit += 0.1;
  }
  return harm * 0.55 + fit * 0.2 + occFit * 0.2 - (loud > 2 ? 0.12 : 0) - (patterns > 1 ? 0.1 : 0) + wFit + 0.05;
}

// opts: { n, occasion, anchorId, weather, exclude: [ids] }
export function generateOutfits(opts = {}) {
  const { n = 4, occasion = state.occasion, anchorId = state.anchor, weather = null, exclude = [] } = opts;
  const by = {};
  state.items.forEach((it) => (by[slotOf(it.type)] ||= []).push(it));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const anchor = byId(anchorId);
  const aSlot = anchor && slotOf(anchor.type);
  const canSplit = (by.top?.length || aSlot === 'top') && (by.bottom?.length || aSlot === 'bottom');
  const canOne = by.one?.length || aSlot === 'one';
  if (!canSplit && !canOne) return [];
  const cold = weather && weather.temp <= 15;
  const excludeKey = [...exclude].sort().join('|');

  const seen = new Set(), results = [];
  for (let t = 0; t < 500; t++) {
    const pieces = [];
    const useOne = aSlot === 'one' || (aSlot !== 'top' && aSlot !== 'bottom' && canOne && (!canSplit || Math.random() < 0.35));
    const take = (slot) => (aSlot === slot ? anchor : by[slot]?.length ? pick(by[slot]) : null);
    if (useOne) pieces.push(take('one'));
    else pieces.push(take('top'), take('bottom'));
    if (aSlot === 'outer' || (by.outer?.length && (cold || Math.random() < 0.4))) pieces.push(take('outer'));
    if (by.shoes?.length || aSlot === 'shoes') pieces.push(take('shoes'));
    if (aSlot === 'bag' || (by.bag?.length && Math.random() < 0.45)) pieces.push(take('bag'));
    if (aSlot === 'acc' || (by.acc?.length && Math.random() < 0.3)) pieces.push(take('acc'));
    const clean = pieces.filter(Boolean);
    const key = clean.map((p) => p.id).sort().join('|');
    if (seen.has(key) || key === excludeKey) continue;
    seen.add(key);
    results.push({ pieces: clean, occasion, score: scoreOutfit(clean, occasion, weather) + Math.random() * 0.05 });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, n);
}

export function tryOn(ids) {
  state.worn = {};
  ids.map(byId).filter(Boolean).forEach((it) => (state.worn[slotOf(it.type)] = it.id));
  if (state.worn.one) { delete state.worn.top; delete state.worn.bottom; }
  state.dressView = 'probador';
  go('dress');
}

// ---------- Vista ----------
export function renderDress() {
  const v = $('#view');
  v.innerHTML = `
    <div class="seg seg-lg" style="margin-bottom:14px">
      ${[['probador', 'Probador'], ['ideas', 'Ideas'], ['guardados', `Looks${state.outfits.length ? ` · ${state.outfits.length}` : ''}`], ['diario', 'Diario']].map(([k, l]) =>
        `<button data-dv="${k}" class="${state.dressView === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div id="dressBody"></div>`;
  $$('[data-dv]', v).forEach((b) => b.addEventListener('click', () => { state.dressView = b.dataset.dv; renderDress(); }));
  ({ probador: renderProbador, ideas: renderIdeas, guardados: renderSaved, diario: () => renderDiary($('#dressBody'), { onTry: tryOn }) })[state.dressView]();
}

function wornPieces() {
  return Object.entries(state.worn).map(([slot, id]) => ({ slot, item: byId(id) })).filter((w) => w.item);
}

function railHTML() {
  const slotItems = state.items.filter((i) => SLOT[state.dressSlot].includes(i.type));
  return `<button class="rail-item none ${state.worn[state.dressSlot] ? '' : 'on'}" data-wear="" style="--i:0">${ICON.x}<small>Nada</small></button>
    ${slotItems.map((i, n) => `<button class="rail-item ${state.worn[state.dressSlot] === i.id ? 'on' : ''}" data-wear="${i.id}" style="--i:${n + 1}"><img src="${i.img}" alt=""><small>${esc(label(i))}</small></button>`).join('')
      || `<p class="small muted rail-empty">No tienes prendas de «${SLOT_LABEL[state.dressSlot]}»</p>`}`;
}
function slotTabsHTML() {
  return Object.keys(SLOT).map((s) => {
    const w = byId(state.worn[s]);
    return `<button data-slot="${s}" class="slot-tab ${state.dressSlot === s ? 'on' : ''}">
      <span class="slot-thumb">${w ? `<img src="${w.img}" alt="">` : '<i></i>'}</span>${SLOT_LABEL[s]}</button>`;
  }).join('');
}
const currentItems = () => wornPieces().map((w) => w.item);

// Redibuja solo el maniquí, la puntuación y los selectores (sin recargar la pantalla).
let drawToken = 0;
async function updateProbador(changedSlot = null) {
  const host = $('#dressBody');
  if (!host || !$('#mannequin')) return;
  const p = state.profile;
  const skin = p.skin?.hex || '#d4a37f';
  const body = F.bodyOf(p);
  const pieces = wornPieces();
  const items = pieces.map((w) => w.item);

  const scoreEl = $('#scoreChip');
  if (items.length > 1) {
    scoreEl.hidden = false;
    scoreEl.innerHTML = `${ICON.spark} Armonía ${Math.round(Math.min(1, scoreOutfit(items)) * 100)}%`;
    scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
  } else scoreEl.hidden = true;
  $('#slotTabs').innerHTML = slotTabsHTML();
  $$('[data-slot]', host).forEach((b) => b.addEventListener('click', () => {
    state.dressSlot = b.dataset.slot;
    $$('[data-slot]', host).forEach((x) => x.classList.toggle('on', x === b));
    renderRail();
    b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }));

  // Se recuerda el último look del probador aunque cierres la app.
  p.lastWorn = { ...state.worn }; saveProfile();
  const token = ++drawToken;
  const worn = {};
  const custom = wearBody();
  // Con tu foto solo se usa el modo real (las prendas adaptadas a tu cuerpo)
  const mode = custom?.photo ? 'real' : p.wearMode === 'digital' || p.wearMode === 'foto' ? p.wearMode : 'real';
  await Promise.all(pieces.map(async (w) => {
    const src = await F.trim(w.item);
    worn[w.slot] = { item: w.item, src, fabric: await F.fabric(w.item, w.slot) };
    if (mode === 'real') worn[w.slot].real = await renderReal(w.item, w.slot, body.figure, src, custom);
  }));
  const m = $('#mannequin');
  if (!m || token !== drawToken) return; // se cambió de pestaña o hubo otro cambio mientras cargaba
  m.innerHTML = F.mannequinSVG({ skin, body, worn, mode, photo: custom?.photo });
  m.classList.toggle('is-photo', !!custom?.photo);
  if (changedSlot) m.querySelector(`.cloth[data-slot="${changedSlot}"]`)?.classList.add('fresh');
  $$('.cloth', m).forEach((el) => el.addEventListener('click', () => showItem(byId(state.worn[el.dataset.slot]))));
  m.dataset.worn = JSON.stringify(Object.keys(worn));
  probadorWorn = worn;
}
let probadorWorn = {};

function renderRail() {
  const rail = $('#rail');
  rail.innerHTML = railHTML();
  rail.scrollLeft = 0;
  $$('[data-wear]', rail).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.wear, s = state.dressSlot;
    if (!id) delete state.worn[s];
    else {
      state.worn[s] = id;
      if (s === 'one') { delete state.worn.top; delete state.worn.bottom; }
      if (s === 'top' || s === 'bottom') delete state.worn.one;
    }
    $$('[data-wear]', rail).forEach((x) => x.classList.toggle('on', x === b));
    updateProbador(id ? s : null);
  }));
}

function renderProbador() {
  const host = $('#dressBody');
  const p = state.profile;
  const skin = p.skin?.hex || '#d4a37f';
  const body = F.bodyOf(p);

  host.innerHTML = `
    <div class="body-switch" role="group" aria-label="Quién se prueba la ropa">
      <span>Te lo pruebas en</span>
      <button data-bsrc="mannequin" class="${p.bodySource !== 'photo' ? 'on' : ''}">${ICON.hanger} Maniquí</button>
      <button data-bsrc="photo" class="${p.bodySource === 'photo' ? 'on' : ''}">${ICON.person} Mi foto</button>
    </div>
    <div class="fitting-stage">
      <div class="stage-curtain left"></div><div class="stage-curtain right"></div>
      <div class="stage-light"></div><div class="stage-dust"></div>
      <div class="mannequin-wrap" id="mannequin"><div class="loader-ring"></div></div>
      <button class="stage-chip skin-chip" id="skinChip"><i style="background:${skin}"></i>${p.skin ? esc(describe(skin).depth) : 'Tu tono de piel'}</button>
      <span class="stage-chip score-chip" id="scoreChip" hidden></span>
      <div class="mode-switch" role="group" aria-label="Cómo se ven las prendas" ${p.bodySource === 'photo' && state.bodyPhoto ? 'hidden' : ''}>
        <button data-mode="real" class="${!['digital', 'foto'].includes(p.wearMode) ? 'on' : ''}">Real</button>
        <button data-mode="digital" class="${p.wearMode === 'digital' ? 'on' : ''}">Ilustrada</button>
        <button data-mode="foto" class="${p.wearMode === 'foto' ? 'on' : ''}">Foto</button>
      </div>
      ${!state.items.length && body.chosen ? '<p class="stage-empty">Sube prendas en Armario o carga el armario de ejemplo en Perfil</p>' : ''}
      ${!body.chosen ? `<div class="figure-intro"><b>¿Cómo quieres tu maniquí?</b>
        <div class="figure-pick">${Object.entries(F.FIGURES).map(([k, l]) => `<button data-quickfig="${k}"><span class="fig-mini">${F.mannequinSVG({ skin, body: { figure: k, hairStyle: k === 'mujer' ? 'Largo' : k === 'hombre' ? 'Corto' : 'Sin pelo', hairColor: body.hairColor, face: k !== 'neutro' }, bare: true })}</span><b>${l}</b></button>`).join('')}</div>
        <button class="chip" id="moreBody">Más opciones</button></div>` : ''}
    </div>

    ${p.bodySource === 'photo' && state.bodyPhoto ? '' : `<div class="pose-row" role="group" aria-label="Pose del maniquí">
      ${Object.entries(POSES).map(([k, v]) => `<button data-pose="${k}" class="${(p.pose || 'relajada') === k ? 'on' : ''}" aria-label="${v.label}">
        <span class="pose-fig">${F.mannequinSVG({ skin, body: { ...body, pose: k, face: false, hairStyle: 'Sin pelo' }, bare: true })}</span><small>${v.label}</small></button>`).join('')}
    </div>`}
    <div class="slot-tabs" id="slotTabs"></div>
    <div class="rail" id="rail"></div>

    <div class="action-grid">
      <button class="action" id="complete">${ICON.wand}<span>Completar con Vistelo</span></button>
      <button class="action" id="random">${ICON.shuffle}<span>Sorpréndeme</span></button>
      <button class="action" id="analyze">${ICON.spark}<span>Analizar look</span></button>
      <button class="action" id="saveLook">${ICON.heart}<span>Guardar look</span></button>
      <button class="action" id="wearToday">${ICON.calendar}<span>Me lo pongo hoy</span></button>
      <button class="action" id="shareLook">${ICON.share}<span>Compartir</span></button>
    </div>
    <div class="card body-card">
      <div class="body-summary">
        <span class="fig-mini">${F.mannequinSVG({ skin, body, bare: true })}</span>
        <div><p class="section-label" style="margin:0 0 2px">Tu maniquí</p><b>${F.FIGURES[body.figure]} · ${esc(body.build)}</b>
          <p class="small muted" style="margin:2px 0 0">${esc(body.hairStyle)}${body.hairStyle !== 'Sin pelo' ? ` · ${esc(body.hairColor.toLowerCase())}` : ''}${body.beard ? ' · barba' : ''}</p></div>
        <button class="btn ghost small-btn" id="editBody">Personalizar</button>
      </div>
    </div>`;

  renderRail();
  updateProbador();

  $('#skinChip').addEventListener('click', () => openSkinSheet(() => renderDress()));
  $$('[data-pose]', host).forEach((b) => b.addEventListener('click', () => {
    p.pose = b.dataset.pose; saveProfile();
    $$('[data-pose]', host).forEach((x) => x.classList.toggle('on', x === b));
    const m = $('#mannequin'); m.classList.remove('posing'); void m.offsetWidth; m.classList.add('posing');
    updateProbador();
  }));
  $$('[data-bsrc]', host).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.bsrc === 'photo') {
      if (!state.bodyPhoto) return openBodyPhoto(() => renderDress());
      if (p.bodySource === 'photo') return openBodyPhoto(() => renderDress()); // segunda pulsación: cambiar o borrar la foto
    }
    p.bodySource = b.dataset.bsrc; saveProfile(); renderDress();
  }));
  $$('[data-mode]', host).forEach((b) => b.addEventListener('click', () => {
    p.wearMode = b.dataset.mode; saveProfile();
    $$('[data-mode]', host).forEach((x) => x.classList.toggle('on', x === b));
    updateProbador();
  }));
  $('#editBody').addEventListener('click', () => openBodySheet(() => renderDress(), probadorWorn));
  $('#moreBody')?.addEventListener('click', () => openBodySheet(() => renderDress(), probadorWorn));
  $$('[data-quickfig]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.quickfig;
    p.body = { figure: f, build: 'Media', hairStyle: f === 'mujer' ? 'Largo' : f === 'hombre' ? 'Corto' : 'Sin pelo', face: f !== 'neutro', beard: false };
    saveProfile(); renderDress(); toast(`Maniquí ${F.FIGURES[f].toLowerCase()}. Personalízalo cuando quieras.`);
  }));
  $('#complete').addEventListener('click', () => {
    const base = currentItems()[0];
    if (!base) return toast('Elige primero una prenda y la completo');
    const o = generateOutfits({ n: 1, anchorId: base.id })[0];
    if (!o) return toast('Necesito más prendas para completar el look');
    o.pieces.forEach((it) => { const s = slotOf(it.type); if (!state.worn[s]) state.worn[s] = it.id; });
    if (state.worn.one) { delete state.worn.top; delete state.worn.bottom; }
    renderRail(); updateProbador(); toast('Look completado por Vistelo');
  });
  $('#random').addEventListener('click', () => {
    const list = generateOutfits({ n: 3, anchorId: null });
    const o = list[Math.floor(Math.random() * list.length)];
    if (!o) return toast('Necesito más prendas');
    state.worn = {};
    o.pieces.forEach((it) => (state.worn[slotOf(it.type)] = it.id));
    if (state.worn.one) { delete state.worn.top; delete state.worn.bottom; }
    const m = $('#mannequin'); m.classList.remove('spin'); void m.offsetWidth; m.classList.add('spin');
    renderRail(); updateProbador();
  });
  $('#analyze').addEventListener('click', () => {
    const items = currentItems();
    if (items.length < 2) return toast('Ponle al menos dos prendas');
    openSheet(`<h3>Análisis de Vistelo</h3>${lookAnalysis(items)}`);
  });
  $('#wearToday').addEventListener('click', async (e) => {
    const items = currentItems();
    if (!items.length) return toast('Ponle alguna prenda al maniquí');
    await wearToday(items.map((x) => x.id)); sparkle(e.currentTarget);
  });
  $('#shareLook').addEventListener('click', () => {
    const items = currentItems();
    shareLook(items, { title: 'Mi look', subtitle: new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }), score: items.length > 1 ? scoreOutfit(items) : null });
  });
  $('#saveLook').addEventListener('click', async (e) => {
    const items = currentItems();
    if (items.length < 2) return toast('Ponle al menos dos prendas');
    const rec = { id: db.uid(), ids: items.map((x) => x.id), score: scoreOutfit(items), occasion: state.occasion, createdAt: Date.now() };
    await db.put('outfits', rec); state.outfits.push(rec); markDirty('looks');
    sparkle(e.currentTarget);
    toast('Look guardado');
  });
}

// Pequeña explosión de destellos turquesa al guardar.
export function sparkle(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.style.left = `${r.left + r.width / 2}px`; s.style.top = `${r.top + r.height / 2}px`;
    const a = (Math.PI * 2 * i) / 10, d = 28 + Math.random() * 22;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`); s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

// Análisis del look con el tono de piel.
function lookAnalysis(items) {
  const p = state.profile;
  const score = Math.round(Math.min(1, scoreOutfit(items)) * 100);
  const lines = A.explainOutfit(items, p.season, state.occasion).split('\n');
  const top = items.find((i) => ['top', 'one', 'outer'].includes(slotOf(i.type)));
  if (p.skin && top) {
    const skinL = C.rgbToLab(...C.hexToRgb(p.skin.hex))[0];
    const topL = C.rgbToLab(...C.hexToRgb(top.hex))[0];
    const diff = Math.abs(skinL - topL);
    const d = describe(p.skin.hex);
    lines.push(`• Junto a tu piel (${d.depth}, subtono ${d.undertone}) el ${top.color.toLowerCase()} crea un contraste ${diff > 40 ? 'alto: aporta fuerza y definición' : diff > 18 ? 'medio: equilibrado y favorecedor' : 'bajo: se funde con tu piel; añade un collar o un pañuelo para separar'}.`);
    const warmCloth = C.rgbToLab(...C.hexToRgb(top.hex))[2] > 8;
    if (!C.isNeutral(top.color) && ((d.undertone === 'frío' && warmCloth) || (d.undertone === 'cálido' && !warmCloth))) {
      lines.push(`• Tu subtono es ${d.undertone} y este color va en sentido contrario; funciona mejor con un neutro de tu paleta cerca de la cara.`);
    }
  } else if (!p.skin) lines.push('• Mide tu tono de piel para un análisis más personal.');
  return `<div class="outfit" style="margin-bottom:14px">${items.map((x) => `<div class="piece"><img src="${x.img}" alt=""></div>`).join('')}</div>
    <div class="meter big"><i style="width:${score}%"></i></div><p class="small muted" style="margin:6px 0 14px">Armonía general ${score}%</p>
    <p style="line-height:1.7;white-space:pre-wrap;margin:0">${esc(lines.join('\n'))}</p>`;
}

function outfitHTML(o, i, saved = false) {
  const pct = Math.round(Math.min(1, o.score) * 100);
  return `<div class="outfit-card">
    <div class="outfit">${o.pieces.map((p) => `<div class="piece"><img src="${p.img}" alt="${esc(label(p))}"></div>`).join('')}</div>
    <div class="outfit-foot">
      <span class="score">Armonía ${pct}%</span>
      <span class="small muted" style="flex:1">${esc(o.occasion || '')}</span>
      <button class="chip" data-why="${i}">¿Por qué?</button>
      <button class="chip" data-share="${i}" aria-label="Compartir">${ICON.share}</button>
      <button class="chip on" data-try="${i}">${ICON.hanger} Probar</button>
      <button class="heart" data-${saved ? 'unsave' : 'save'}="${i}" aria-label="${saved ? 'Quitar' : 'Guardar'}">${saved ? '♥' : '♡'}</button>
    </div>
  </div>`;
}

function bindOutfitList(root, list, saved) {
  $$('[data-why]', root).forEach((b) => b.addEventListener('click', () => {
    const o = list[+b.dataset.why];
    openSheet(`<h3>Por qué funciona</h3>${lookAnalysis(o.pieces)}`);
  }));
  $$('[data-try]', root).forEach((b) => b.addEventListener('click', () => tryOn(list[+b.dataset.try].pieces.map((x) => x.id))));
  $$('[data-share]', root).forEach((b) => b.addEventListener('click', () => { const o = list[+b.dataset.share]; shareLook(o.pieces, { title: 'Mi look', subtitle: o.occasion || '', score: o.score }); }));
  $$('[data-save]', root).forEach((b) => b.addEventListener('click', async () => {
    const o = list[+b.dataset.save];
    const rec = { id: db.uid(), ids: o.pieces.map((p) => p.id), score: o.score, occasion: o.occasion, createdAt: Date.now() };
    await db.put('outfits', rec); state.outfits.push(rec); markDirty('looks');
    b.textContent = '♥'; toast('Look guardado');
  }));
  $$('[data-unsave]', root).forEach((b) => b.addEventListener('click', async () => {
    const o = list[+b.dataset.unsave];
    await db.remove('outfits', o.id); state.outfits = state.outfits.filter((x) => x.id !== o.id); markDirty('looks');
    renderDress();
  }));
}

function renderIdeas() {
  const body = $('#dressBody');
  const anchor = byId(state.anchor);
  body.innerHTML = `
    <div class="card tint">
      <p class="section-label">Ocasión</p>
      <div class="chips">${Object.keys(OCCASIONS).map((o) => `<button class="chip ${state.occasion === o ? 'on' : ''}" data-occ="${o}">${o}</button>`).join('')}</div>
      ${anchor ? `<div class="picked" style="margin-top:12px"><img src="${anchor.img}" class="mini"> <span class="small">A partir de <b>${esc(label(anchor))}</b></span> <button class="chip" id="clearAnchor">Quitar</button></div>` : ''}
      <button class="btn primary block" id="gen" style="margin-top:14px">${ICON.spark} ${state.generated.length ? 'Nuevas ideas' : 'Generar ideas'}</button>
    </div>
    <div id="genList">${state.generated.length ? state.generated.map((o, i) => outfitHTML(o, i)).join('')
      : state.items.length < 2 ? '<p class="empty-line">Sube al menos una parte de arriba y una de abajo (o un vestido).</p>' : ''}</div>`;
  $$('[data-occ]', body).forEach((b) => b.addEventListener('click', () => { state.occasion = b.dataset.occ; state.generated = generateOutfits(); renderDress(); }));
  $('#clearAnchor', body)?.addEventListener('click', () => { state.anchor = null; state.generated = []; renderDress(); });
  $('#gen').addEventListener('click', () => {
    state.generated = generateOutfits();
    if (!state.generated.length) toast('Necesitas más prendas para combinar');
    renderDress();
  });
  bindOutfitList(body, state.generated, false);
}

function renderSaved() {
  const body = $('#dressBody');
  const list = state.outfits.map((o) => ({ ...o, pieces: o.ids.map(byId).filter(Boolean) })).filter((o) => o.pieces.length)
    .sort((a, b) => b.createdAt - a.createdAt);
  body.innerHTML = list.length ? list.map((o, i) => outfitHTML(o, i, true)).join('')
    : `<div class="empty"><div class="empty-art">${ICON.heart}</div><h3>Sin looks guardados</h3><p>Crea un look en el probador o en Ideas y guárdalo con el corazón.</p></div>`;
  bindOutfitList(body, list, true);
}

export { bestMatches };
