// Armario: lista, subida con reconocimiento, ficha y edición de prendas.
import * as db from './db.js';
import * as C from './color.js';
import * as A from './advisor.js';
import * as V from './vision.js';
import { forgetTrim, forgetFabric } from './fitting.js';
import { runDemo } from './demo.js';
import * as CU from './cutout.js';
import { openScanner } from './scanner.js';
import {
  state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, colorHex, label, byId, ICON,
  TYPES, SEASONS_WEAR, PATTERNS, ITEM_STYLES, slotOf, prepareImage, go, refresh,
} from './core.js';

// ---------- Tarjetas ----------
export function itemCard(it) {
  const fit = state.profile.season && C.paletteFit(it.hex, state.profile.season) > 0.55;
  return `<button class="item" data-id="${it.id}" aria-label="${esc(label(it))}">
    <span class="item-media">
      <img src="${it.img}" alt="" loading="lazy">
      ${fit ? '<span class="badge-fit">✓ Tu paleta</span>' : ''}
      ${it.fav ? '<span class="fav">★</span>' : ''}
    </span>
    <span class="item-info">
      <span class="item-brand">${esc(it.brand || 'Sin marca')}</span>
      <span class="item-name">${esc(label(it))}</span>
      <span class="item-sub"><i class="dot" style="background:${it.hex}"></i>${esc(it.color)} · ${esc(it.subtype || it.type)}</span>
    </span>
  </button>`;
}
export const bindItemCards = (root) => $$('.item[data-id]', root).forEach((b) => b.addEventListener('click', () => showItem(byId(b.dataset.id))));

function colorSpectrum(items) {
  const count = {};
  items.forEach((i) => (count[i.color] = (count[i.color] || 0) + 1));
  return Object.entries(count).sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<span style="flex:${n};background:${colorHex(c)}" title="${esc(c)}: ${n}"></span>`).join('');
}

function groupKey(item) {
  if (state.groupBy === 'type') return item.type;
  if (state.groupBy === 'color') return item.color;
  if (state.groupBy === 'brand') return item.brand || 'Sin marca';
  return 'Todas las prendas';
}
function groupOrder(keys) {
  if (state.groupBy === 'type') return keys.sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b));
  if (state.groupBy === 'color') return keys.sort((a, b) => C.NAMED_COLORS.findIndex((c) => c.name === a) - C.NAMED_COLORS.findIndex((c) => c.name === b));
  return keys.sort((a, b) => (a === 'Sin marca') - (b === 'Sin marca') || a.localeCompare(b));
}

export function renderCloset() {
  const v = $('#view');
  const items = state.items;
  const q = state.query.toLowerCase();
  const list = items.filter((it) => !q || [it.name, it.subtype, it.type, it.color, it.brand, it.season, it.notes, it.material, it.pattern, it.style].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const brands = new Set(items.map((i) => i.brand).filter(Boolean));
  const colors = new Set(items.map((i) => i.color));
  const groups = {};
  list.forEach((it) => (groups[groupKey(it)] ||= []).push(it));
  const season = state.profile.season;

  v.innerHTML = items.length ? `
    <section class="hero">
      <p class="eyebrow">Tu colección</p>
      <div class="hero-stats">
        <div><b>${items.length}</b><span>prendas</span></div>
        <div><b>${brands.size}</b><span>marcas</span></div>
        <div><b>${colors.size}</b><span>colores</span></div>
        <div><b>${state.outfits.length}</b><span>looks</span></div>
      </div>
      <div class="spectrum">${colorSpectrum(items)}</div>
      <p class="hero-foot">${season ? `Paleta <b>${esc(season)}</b> · ${items.filter((i) => C.paletteFit(i.hex, season) > 0.55).length} prendas te favorecen` : 'Haz el test de color en Vistelo para ver qué prendas te favorecen'}</p>
    </section>
    <div class="toolbar">
      <div class="seg" role="tablist">
        ${[['type', 'Tipo'], ['color', 'Color'], ['brand', 'Marca'], ['all', 'Todo']].map(([k, l]) =>
          `<button data-group="${k}" class="${state.groupBy === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <input class="search" type="search" placeholder="Buscar prenda, color, marca, estampado…" value="${esc(state.query)}">
    </div>
    <div id="groups">
      ${groupOrder(Object.keys(groups)).map((k) => `
        <section class="group">
          <div class="group-head">
            ${state.groupBy === 'color' ? `<span class="dot" style="background:${colorHex(k)}"></span>` : ''}
            <h3>${esc(k)}</h3><span class="count">${groups[k].length}</span><span class="line"></span>
          </div>
          <div class="grid">${groups[k].map(itemCard).join('')}</div>
        </section>`).join('') || '<p class="empty-line">Nada coincide con la búsqueda.</p>'}
    </div>` : `
    <div class="empty">
      <div class="empty-art">${ICON.hanger}</div>
      <h3>Tu armario está vacío</h3>
      <p>Escanea tu ropa con la cámara: Vistelo AI recorta el fondo, la digitaliza y reconoce el tipo, el color y el material.</p>
      <div class="row" style="justify-content:center;max-width:340px;margin:0 auto">
        <button class="btn primary" id="emptyScan">${ICON.camera} Escanear</button>
        <button class="btn ghost" id="emptyUpload">Subir fotos</button>
      </div>
      <button class="link-btn" id="emptyDemo">${ICON.spark} o prueba con un armario de ejemplo</button>
    </div>`;

  $$('[data-group]', v).forEach((b) => b.addEventListener('click', () => { state.groupBy = b.dataset.group; renderCloset(); }));
  $('.search', v)?.addEventListener('input', (e) => {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    renderCloset();
    const ns = $('.search'); ns.focus(); ns.setSelectionRange(pos, pos);
  });
  bindItemCards(v);
  $('#emptyUpload', v)?.addEventListener('click', () => $('#fileInput').click());
  $('#emptyScan', v)?.addEventListener('click', () => startScan());
  $('#emptyDemo', v)?.addEventListener('click', (e) => runDemo(e.currentTarget));

  addFab();
}

// Botón + con menú: escanear con la cámara o subir fotos.
function addFab() {
  const wrap = document.createElement('div');
  wrap.className = 'fab-wrap';
  wrap.innerHTML = `
    <button class="fab-option" data-act="scan" style="--d:1">${ICON.camera}<span>Escanear con la cámara</span></button>
    <button class="fab-option" data-act="upload" style="--d:0">${ICON.image}<span>Subir fotos</span></button>
    <button class="fab" aria-label="Añadir prendas" aria-expanded="false"><span>+</span></button>`;
  const fab = $('.fab', wrap);
  const close = () => toggle(false);
  const toggle = (open) => {
    wrap.classList.toggle('open', open); fab.setAttribute('aria-expanded', open);
    if (open) setTimeout(() => document.addEventListener('click', close, { once: true }));
  };
  fab.addEventListener('click', (e) => { e.stopPropagation(); toggle(!wrap.classList.contains('open')); });
  $$('.fab-option', wrap).forEach((b) => b.addEventListener('click', () => {
    toggle(false);
    if (b.dataset.act === 'scan') startScan(); else $('#fileInput').click();
  }));
  $('#app').appendChild(wrap);
}
export function startScan() {
  openScanner((item) => editItem({ ...item, id: db.uid(), fav: false, createdAt: Date.now(), isNew: true, guessed: true }));
}

// ---------- Reconocimiento ----------
export async function recognize(canvas, base) {
  const out = { ...base };
  if (!state.profile.vision) return out;
  try {
    const r = await V.analyze(canvas);
    if (r.confidence > 0.25) { out.type = r.type; out.subtype = r.subtype; }
    if (r.pattern !== 'Liso' || !out.pattern) out.pattern = r.pattern;
    out.style = r.style; out.visionAt = Date.now();
    if (r.material && !out.material) out.material = r.material;
    out.visionConfidence = Math.round(r.confidence * 100);
    if (out.autoName) out.name = `${out.subtype || out.type} ${out.color.toLowerCase()}`;
    const SEASON = { Abrigo: 'Invierno', Jersey: 'Invierno', Botas: 'Invierno', Shorts: 'Verano', Sandalias: 'Verano' };
    if (out.season === 'Todo el año' && SEASON[out.type]) out.season = SEASON[out.type];
  } catch (e) { toast(`Visión no disponible: ${e.message}`); }
  return out;
}

export async function handleUpload(files) {
  toast(`Vistelo está analizando ${files.length} ${files.length > 1 ? 'prendas' : 'prenda'}…`);
  const queue = [];
  for (const f of files) {
    try {
      let { canvas, dataUrl } = await prepareImage(f, 1600);
      // Recorte automático del fondo (fotos sin transparencia)
      if (state.profile.autoCutout !== false && !CU.hasTransparency(canvas)) {
        try {
          if (state.profile.cutoutAI && !CU.mlReady()) await CU.loadML();
          const res = await CU.cutout(canvas, { method: state.profile.cutoutAI ? 'ia' : 'auto' });
          if (res.coverage > 0.03) { canvas = res.canvas; dataUrl = res.canvas.toDataURL('image/png'); }
        } catch { /* se usa la foto tal cual */ }
      } else if (Math.max(canvas.width, canvas.height) > 900) {
        ({ canvas, dataUrl } = await prepareImage(f, 900));
      }
      const colors = CU.garmentColors(canvas);
      const hex = colors[0]?.hex || C.dominantColor(canvas);
      const color = C.nearestNamed(hex).name;
      const g = A.guessItem({ fileName: f.name, canvas, color, extraBrands: state.profile.brands });
      const looksRandom = g.name.toLowerCase() === `${g.type} ${color}`.toLowerCase();
      let item = {
        id: db.uid(), img: dataUrl, hex, color, colors, type: g.type, subtype: '', brand: g.brand, name: g.name, season: g.season,
        pattern: CU.patternHint(canvas, colors), style: '', notes: '', fav: false, createdAt: Date.now(), isNew: true, guessed: true, autoName: looksRandom,
      };
      item = await recognize(canvas, item);
      delete item.autoName;
      queue.push(item);
    } catch { toast(`No se pudo leer ${f.name}`); }
  }
  const next = () => { const it = queue.shift(); if (it) editItem(it, next, queue.length); };
  next();
}

// ---------- Guardado ----------
export async function saveItem(it) {
  await db.put('items', it);
  const i = state.items.findIndex((x) => x.id === it.id);
  if (i >= 0) state.items[i] = it; else state.items.push(it);
}

export function bestMatches(it, n = 4) {
  const slot = slotOf(it.type);
  return state.items.filter((o) => o.id !== it.id && slotOf(o.type) !== slot && !(slot === 'one' && ['top', 'bottom'].includes(slotOf(o.type))) && !(slotOf(o.type) === 'one' && ['top', 'bottom'].includes(slot)))
    .map((o) => ({ o, h: C.harmony(it.hex, it.color, o.hex, o.color) }))
    .sort((a, b) => b.h - a.h)
    .filter((m, i, arr) => arr.findIndex((x) => slotOf(x.o.type) === slotOf(m.o.type)) === i)
    .slice(0, n);
}

// ---------- Ficha ----------
export function showItem(it) {
  if (!it) return;
  const season = state.profile.season;
  const fit = season ? Math.round(C.paletteFit(it.hex, season) * 100) : null;
  const added = new Date(it.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const wears = it.wears || 0;
  const price = parseFloat(String(it.price || '').replace(',', '.').replace(/[^\d.]/g, ''));
  const perWear = price && wears ? price / wears : null;
  const inOutfits = state.outfits.filter((o) => o.ids.includes(it.id)).length;
  const matches = bestMatches(it);
  const spec = (k, v) => `<div class="spec"><span>${k}</span><b>${v}</b></div>`;
  const sheet = openSheet(`
    <div class="detail-media">
      <img src="${it.img}" alt="">
      <button class="detail-fav ${it.fav ? 'on' : ''}" id="dFav" aria-label="Favorita">${it.fav ? '★' : '☆'}</button>
      ${it.visionAt ? `<span class="detail-ai">${ICON.spark} Vistelo · ${it.visionConfidence || ''}%</span>` : it.scanned ? `<span class="detail-ai">${ICON.camera} Escaneada</span>` : ''}
    </div>
    <p class="eyebrow accent">${esc(it.brand || 'Sin marca')}</p>
    <h3 class="detail-title">${esc(label(it))}</h3>
    <div class="chips" style="margin-bottom:18px">
      <span class="chip">${esc(it.subtype || it.type)}</span><span class="chip">${esc(it.season)}</span>
      ${it.pattern ? `<span class="chip">${esc(it.pattern)}</span>` : ''}${it.style ? `<span class="chip">${esc(it.style)}</span>` : ''}
      ${it.size ? `<span class="chip">Talla ${esc(it.size)}</span>` : ''}
    </div>

    <p class="section-label">Especificaciones</p>
    <div class="spec-grid">
      ${spec('Color', `<i class="dot" style="background:${it.hex}"></i>${esc(it.color)}`)}
      ${spec('Código', it.hex.toUpperCase())}
      ${it.colors?.length > 1 ? `<div class="spec wide"><span>Colores de la prenda</span><b class="swatch-line">${it.colors.map((c) => `<i class="dot" style="background:${c.hex}"></i>${esc(c.name)} ${Math.round(c.share * 100)}%`).join(' ')}</b></div>` : ''}
      ${spec('Tipo', esc(it.type))}
      ${spec('Prenda', esc(it.subtype || '—'))}
      ${spec('Estampado', esc(it.pattern || '—'))}
      ${spec('Estilo', esc(it.style || '—'))}
      ${spec('Marca', esc(it.brand || '—'))}
      ${spec('Temporada', esc(it.season))}
      ${spec('Talla', esc(it.size || '—'))}
      ${spec('Material', esc(it.material || '—'))}
      ${spec('Precio', esc(it.price || '—'))}
      ${spec('Añadida', added)}
      ${spec('Veces puesta', wears)}
      ${spec('En looks', inOutfits)}
      ${spec('Coste por uso', perWear ? `${perWear.toFixed(2).replace('.', ',')} €` : '—')}
      ${spec('Último uso', it.lastWorn ? new Date(it.lastWorn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—')}
    </div>

    ${fit !== null ? `<p class="section-label">Encaje con tu paleta · ${esc(season)}</p>
      <div class="meter"><i style="width:${fit}%"></i></div>
      <p class="small muted" style="margin:6px 0 18px">${fit}% · ${fit > 70 ? 'Te favorece mucho: úsala cerca de la cara.' : fit > 40 ? 'Te queda bien; combínala con colores de tu paleta.' : 'No es de tu paleta: mejor lejos de la cara o con un neutro de tu paleta arriba.'}</p>` : ''}

    ${matches.length ? `<p class="section-label">Combina bien con</p>
      <div class="match-row">${matches.map(({ o, h }) => `<button class="match" data-match="${o.id}"><span><img src="${o.img}" alt=""></span><small>${esc(label(o))}</small><em>${Math.round(h * 100)}%</em></button>`).join('')}</div>` : ''}

    ${it.notes ? `<p class="section-label">Notas</p><p style="line-height:1.55;margin:0 0 18px">${esc(it.notes)}</p>` : ''}

    <div class="row" style="margin-bottom:8px">
      <button class="btn primary" id="dWear">Me la he puesto hoy</button>
      <button class="btn navy" id="dTry">${ICON.hanger} Probar</button>
    </div>
    <div class="row">
      <button class="btn ghost" id="dEdit">Editar</button>
      ${state.profile.vision ? `<button class="btn ghost" id="dVision">${ICON.spark} Reanalizar</button>` : ''}
      <button class="btn danger" id="dDel">Eliminar</button>
    </div>
  `);

  $('#dFav', sheet).addEventListener('click', async () => { it.fav = !it.fav; await saveItem(it); showItem(it); refresh(); });
  $('#dWear', sheet).addEventListener('click', async () => { it.wears = wears + 1; it.lastWorn = Date.now(); await saveItem(it); showItem(it); toast('¡Apuntado!'); });
  $('#dEdit', sheet).addEventListener('click', () => editItem(it));
  $('#dTry', sheet).addEventListener('click', () => {
    state.worn[slotOf(it.type)] = it.id;
    if (slotOf(it.type) === 'one') { delete state.worn.top; delete state.worn.bottom; }
    if (['top', 'bottom'].includes(slotOf(it.type))) delete state.worn.one;
    state.dressView = 'probador'; closeSheet(); go('dress');
  });
  $('#dVision', sheet)?.addEventListener('click', async (e) => {
    e.currentTarget.innerHTML = '<span class="spinner"></span> Analizando…';
    const img = new Image(); img.src = it.img; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    const r = await recognize(c, { ...it });
    await saveItem(r); showItem(r); refresh(); toast(`Vistelo: ${r.subtype || r.type}`);
  });
  $('#dDel', sheet).addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta prenda del armario?')) return;
    await db.remove('items', it.id);
    state.items = state.items.filter((x) => x.id !== it.id);
    Object.keys(state.worn).forEach((k) => state.worn[k] === it.id && delete state.worn[k]);
    closeSheet(); refresh(); toast('Prenda eliminada');
  });
  $$('[data-match]', sheet).forEach((b) => b.addEventListener('click', () => showItem(byId(b.dataset.match))));
}

// ---------- Editor ----------
export function editItem(item, onDone = null, remaining = 0) {
  const it = { ...item };
  const brandOptions = [...new Set([...state.profile.brands, ...state.items.map((i) => i.brand).filter(Boolean), ...Object.keys(A.KNOWN_BRANDS)])];
  const opt = (list, cur) => ['', ...list].map((t) => `<option value="${t}" ${t === (cur || '') ? 'selected' : ''}>${t || '—'}</option>`).join('');
  const sheet = openSheet(`
    <h3>${it.isNew ? 'Nueva prenda' : 'Editar prenda'}</h3>
    <div class="preview"><img src="${it.img}" alt=""></div>
    ${it.guessed ? `<p class="assist-note">${ICON.spark} ${it.visionAt ? `Vistelo AI ha reconocido: <b>${esc(it.subtype || it.type)}</b>${it.pattern ? ` · ${esc(it.pattern)}` : ''}${it.style ? ` · ${esc(it.style)}` : ''} (${it.visionConfidence}% de seguridad).` : 'Vistelo ha rellenado tipo, color y temporada por la silueta. Activa la visión avanzada en Perfil para reconocer prendas complejas.'} Revísalo antes de guardar.</p>` : ''}
    <div class="field"><label>Nombre</label><input id="fName" value="${esc(it.name)}" placeholder="Ej. Camisa de lino"></div>
    <div class="two">
      <div class="field"><label>Tipo</label><select id="fType">${TYPES.map((t) => `<option ${t === it.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Prenda concreta</label><input id="fSub" value="${esc(it.subtype || '')}" placeholder="Ej. Gabardina"></div>
    </div>
    <div class="three">
      <div class="field"><label>Temporada</label><select id="fSeason">${SEASONS_WEAR.map((t) => `<option ${t === it.season ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Estampado</label><select id="fPattern">${opt(PATTERNS, it.pattern)}</select></div>
      <div class="field"><label>Estilo</label><select id="fStyle">${opt(ITEM_STYLES, it.style)}</select></div>
    </div>
    <div class="field"><label>Color · <span id="fColorName">${esc(it.color)}</span></label>
      <div class="color-pick">${C.NAMED_COLORS.map((c) => `<button type="button" data-color="${c.name}" title="${c.name}" style="background:${c.hex}" class="${c.name === it.color ? 'on' : ''}"></button>`).join('')}</div>
    </div>
    <div class="field"><label>Marca</label><input id="fBrand" list="brandList" value="${esc(it.brand)}" placeholder="Ej. Zara, COS, Nike…" autocapitalize="words">
      <datalist id="brandList">${brandOptions.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></div>
    <div class="three">
      <div class="field"><label>Talla</label><input id="fSize" value="${esc(it.size || '')}" placeholder="M · 38"></div>
      <div class="field"><label>Material</label><input id="fMaterial" value="${esc(it.material || '')}" placeholder="Algodón"></div>
      <div class="field"><label>Precio</label><input id="fPrice" value="${esc(it.price || '')}" inputmode="decimal" placeholder="29,95 €"></div>
    </div>
    <div class="field"><label>Notas</label><textarea id="fNotes" placeholder="Dónde la compraste, cuidados…">${esc(it.notes)}</textarea></div>
    <button class="btn primary block" id="fSave">${it.isNew ? (remaining ? `Guardar y siguiente (${remaining})` : 'Guardar en el armario') : 'Guardar cambios'}</button>
  `, onDone);

  $$('[data-color]', sheet).forEach((b) => b.addEventListener('click', () => {
    it.color = b.dataset.color;
    $$('[data-color]', sheet).forEach((x) => x.classList.toggle('on', x === b));
    $('#fColorName').textContent = it.color;
  }));
  $('#fSave').addEventListener('click', async () => {
    Object.assign(it, {
      name: $('#fName').value.trim(), type: $('#fType').value, subtype: $('#fSub').value.trim(), season: $('#fSeason').value,
      pattern: $('#fPattern').value, style: $('#fStyle').value, brand: $('#fBrand').value.trim(), notes: $('#fNotes').value.trim(),
      size: $('#fSize').value.trim(), material: $('#fMaterial').value.trim(), price: $('#fPrice').value.trim(),
    });
    if (C.nearestNamed(it.hex).name !== it.color) it.hex = colorHex(it.color);
    const wasNew = it.isNew;
    delete it.isNew; delete it.guessed;
    forgetTrim(it.id); forgetFabric(it.id);
    await saveItem(it);
    if (it.brand && !state.profile.brands.includes(it.brand)) { state.profile.brands.push(it.brand); saveProfile(); }
    if (wasNew) closeSheet(); else showItem(it);
    refresh();
    toast('Prenda guardada');
  });
}
