// Foto de un look: de una foto de cuerpo entero (con cualquier fondo) saca cada prenda, la reconoce,
// busca pistas de la marca (texto o logotipos con letras) y prendas parecidas en tiendas. Si no ve la
// marca, te propone escanear la etiqueta o escribir lo que sepas para buscarla.
import * as A from './advisor.js';
import * as V from './vision.js';
import * as CU from './cutout.js';
import * as W from './web.js';
import { parse, parserReady, loadParser, guided, applyAlpha, C } from './parse.js';
import { itemFromScan, colorsOf } from './scanner.js';
import { saveItem } from './closet.js';
import * as db from './db.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON, pickFile, prepareImage, slotOf, refresh, go } from './core.js';

// Qué se busca en la foto (clases del analizador) y entre qué tipos de Vestia puede estar cada pieza
const PARTS = [
  { key: 'one', cls: [C.Dress], types: ['Vestido', 'Mono'], def: 'Vestido', min: 0.01, label: 'Vestido o mono', ocr: true },
  { key: 'top', cls: [C['Upper-clothes']], types: ['Camiseta', 'Camisa', 'Top', 'Jersey', 'Sudadera', 'Chaqueta', 'Abrigo', 'Americana'], def: 'Camiseta', min: 0.008, label: 'Parte de arriba', ocr: true },
  { key: 'pants', cls: [C.Pants], types: ['Pantalón', 'Vaqueros', 'Shorts'], def: 'Pantalón', min: 0.008, label: 'Pantalón', ocr: true },
  { key: 'skirt', cls: [C.Skirt], types: ['Falda'], def: 'Falda', min: 0.006, label: 'Falda' },
  { key: 'shoes', cls: [C['Left-shoe'], C['Right-shoe']], types: ['Zapatos', 'Zapatillas', 'Botas', 'Sandalias'], def: 'Zapatillas', min: 0.002, label: 'Calzado', ocr: true },
  { key: 'bag', cls: [C.Bag], types: ['Bolso'], def: 'Bolso', min: 0.003, label: 'Bolso', ocr: true },
  { key: 'hat', cls: [C.Hat], types: ['Accesorio'], def: 'Accesorio', sub: 'Gorro', min: 0.0015, label: 'Gorro o gorra', ocr: true },
  { key: 'scarf', cls: [C.Scarf], types: ['Accesorio'], def: 'Accesorio', sub: 'Bufanda', min: 0.002, label: 'Bufanda' },
  { key: 'belt', cls: [C.Belt], types: ['Accesorio'], def: 'Accesorio', sub: 'Cinturón', min: 0.0012, label: 'Cinturón' },
  { key: 'glasses', cls: [C.Sunglasses], types: ['Accesorio'], def: 'Accesorio', sub: 'Gafas de sol', min: 0.0008, label: 'Gafas de sol' },
];
// Marcas que suelen verse escritas en la ropa (además de las conocidas por Vistelo)
const MORE_BRANDS = ['Puma', 'Reebok', 'The North Face', 'Champion', 'Tommy Hilfiger', 'Tommy Jeans', 'Calvin Klein', 'Lacoste', 'Polo Ralph Lauren', 'Carhartt', 'Supreme',
  'Gucci', 'Louis Vuitton', 'Prada', 'Balenciaga', 'Fila', 'Kappa', 'Ellesse', 'Under Armour', 'Columbia', 'Patagonia', 'Diesel', 'Guess', 'Hollister', 'Abercrombie',
  'Gap', 'Superdry', 'Jack & Jones', 'Kenzo', 'Moncler', 'Stone Island', 'Off-White', 'Dickies', 'Timberland', 'Dr. Martens', 'Asics', 'Salomon', 'Primark', 'Shein',
  'Desigual', 'El Ganso', 'Pepe Jeans', 'Armani', 'Hugo Boss', 'Boss', 'Burberry', 'Versace', 'Fendi', 'Dior', 'Chanel', 'New Era', 'Kith', 'Napapijri', 'Fred Perry',
  'Wrangler', 'Lee', 'Jordan', 'Ecoalf', 'Munich', 'Joma', 'Kelme', 'Skechers', 'Crocs', 'Birkenstock', 'Hoka', 'Veja', 'Ugg', 'Clarks', 'Geox', 'Camper', 'Michael Kors',
  'Coach', 'Longchamp', 'Tous', 'Parfois', 'Springfield', 'Women\'secret', 'Oysho', 'Zara Home', 'Decathlon', 'Quechua', 'Kiabi', 'C&A', 'Benetton', 'Mustang', 'Moschino',
  'Valentino', 'Givenchy', 'Saint Laurent', 'Loewe', 'Bottega Veneta', 'Celine', 'Miu Miu', 'Palm Angels', 'Represent', 'Corteiz', 'Trapstar', 'Essentials', 'Fear of God'];
const BRANDS = [...new Set([...Object.keys(A.KNOWN_BRANDS), ...MORE_BRANDS])].sort((a, b) => b.length - a.length);
const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Marca dentro de un texto (palabra completa; «LEVIS» vale por «Levi's»)
export function brandIn(text) {
  const t = ` ${fold(text).replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ')} `;
  const tight = t.replace(/\s+/g, '');
  for (const b of BRANDS) {
    const n = fold(b).replace(/[^a-z0-9& ]+/g, '').trim();
    if (n.length < 3) continue;
    if (t.includes(` ${n} `) || (n.length >= 5 && tight.includes(n.replace(/\s+/g, '')))) return b;
  }
  return '';
}
// Referencia de producto: «1234/567/800» (Inditex), «Ref. 12345», «Art. 123456»…
const refIn = (text) => text.match(/\b\d{4}\s?\/\s?\d{3}(?:\s?\/\s?\d{3})?\b/)?.[0]?.replace(/\s/g, '') || text.match(/\b(?:ref|art|style|mod)\.?\s*(?:n[ºo°.]?\s*)?[:#]?\s*([A-Z0-9-]{5,14})\b/i)?.[1] || '';
// Marca a partir de la web de la tienda (las tiendas multimarca no cuentan)
const MARKETS = /amazon|zalando|vinted|wallapop|ebay|asos|farfetch|elcorteingles|aliexpress|shein|temu|zalando|aboutyou|miinto|mytheresa|ssense|yoox|lyst|privalia|veepee|kiabi|primark|decathlon|google|idealo/;
function brandFromSite(site) {
  const known = Object.keys(A.KNOWN_BRANDS).find((b) => site.includes(fold(b).replace(/[^a-z]/g, ''))) || BRANDS.find((b) => fold(b).replace(/[^a-z]/g, '').length > 3 && site.includes(fold(b).replace(/[^a-z]/g, '')));
  if (known) return known;
  if (MARKETS.test(site)) return '';
  const name = site.split('.').filter((p) => !/^(www|shop|store|es|en|m)$/.test(p))[0] || '';
  const clean = name.replace(/(shop|store|online|tienda|oficial|official)$/, '').replace(/[-_]+/g, ' ').trim();
  return clean.length >= 3 ? clean.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

// ---------- Análisis ----------
export async function analyzeLook(photo, onStep = () => {}) {
  onStep(parserReady() ? 'Buscando las prendas…' : 'Descargando el analizador de ropa (solo la primera vez, ~29 MB)…');
  await loadParser();
  onStep('Buscando las prendas…');
  const P = await parse(photo);
  // Contorno fino de la persona con el recorte por IA, si lo tienes activado
  let person = null;
  if (CU.mlReady() || state.profile.cutoutAI) {
    try { onStep('Recortando los contornos…'); if (!CU.mlReady()) await CU.loadML(); person = await CU.matte(photo); } catch { person = null; }
  }
  const found = [];
  for (const part of PARTS) {
    const b = P.box(part.cls, part.min);
    if (!b) continue;
    // Un vestido a veces también sale como «falda»: se queda el vestido
    if (part.key === 'skirt' && found.some((f) => f.part.key === 'one')) continue;
    onStep(`Recortando: ${part.label.toLowerCase()}…`);
    const pad = Math.max(b.w, b.h) * 0.06;
    const x0 = Math.max(0, Math.floor(b.x - pad)), y0 = Math.max(0, Math.floor(b.y - pad));
    const x1 = Math.min(photo.width, Math.ceil(b.x + b.w + pad)), y1 = Math.min(photo.height, Math.ceil(b.y + b.h + pad));
    const bw = x1 - x0, bh = y1 - y0, k = Math.min(1.5, 900 / Math.max(bw, bh));
    const cw = Math.max(8, Math.round(bw * k)), ch = Math.max(8, Math.round(bh * k));
    const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
    const cx = crop.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high';
    cx.drawImage(photo, x0, y0, bw, bh, 0, 0, cw, ch);
    const q = guided(crop, P.softBox(part.cls, x0, y0, bw, bh, cw, ch), Math.max(2, Math.round(Math.max(cw, ch) / 170)), 1e-3);
    const alpha = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let a = sstep(0.38, 0.66, q[y * cw + x]);
      if (person) a *= person[Math.min(photo.height - 1, y0 + Math.floor(y / k)) * photo.width + Math.min(photo.width - 1, x0 + Math.floor(x / k))] / 255;
      alpha[y * cw + x] = a;
    }
    const res = applyAlpha(crop, alpha, { pad: 0.03, maxSide: 900 });
    if (!res) continue;
    const fin = CU.refineGarment(part.key === 'shoes' ? res.canvas : CU.dropSpecks(res.canvas), { category: 'acc' }); // solo limpia el borde (sin enderezar)
    found.push({ part, canvas: fin.canvas, crop, area: b.frac });
  }
  return found;
}

async function toItem(f) {
  const { colors, primary, colorName } = colorsOf(f.canvas);
  let rec = { type: f.part.def, subtype: f.part.sub || '', confidence: null, ranking: [], subtypes: [], material: '', style: '' };
  if (state.profile.vision) {
    try { rec = await V.analyze(f.canvas, { types: f.part.types }); } catch { /* básico */ }
  } else {
    const g = A.guessItem({ canvas: f.canvas, color: colorName });
    if (f.part.types.includes(g.type)) rec.type = g.type;
  }
  if (f.part.sub) rec.subtype = f.part.sub;
  let pattern = CU.patternHint(f.canvas, colors);
  if (rec.pattern && rec.pattern !== 'Liso') pattern = rec.pattern;
  const it = itemFromScan({ img: f.canvas.toDataURL('image/png'), colors, primary, colorName, pattern, rec, cat: { id: 'look' } });
  return { ...it, fromLook: true };
}

// Texto legible en la prenda (logotipos con letras, estampados): pistas para la marca
async function readClues(f) {
  const { loadOCR } = await import('./label.js');
  const w = await loadOCR();
  const c = document.createElement('canvas');
  const k = Math.max(1, Math.min(2.5, 1400 / Math.max(f.crop.width, f.crop.height)));
  c.width = Math.round(f.crop.width * k); c.height = Math.round(f.crop.height * k);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.filter = 'grayscale(1) contrast(1.5)'; x.drawImage(f.crop, 0, 0, c.width, c.height);
  const { data } = await w.recognize(c);
  const text = data.text || '';
  const words = (data.words || []).filter((wd) => wd.confidence > 72 && /^[A-Za-zÀ-ÿ&'.-]{3,}$/.test(wd.text)).map((wd) => wd.text);
  return { brand: brandIn(text) || brandIn(words.join(' ')), words: [...new Set(words)].slice(0, 6), ref: refIn(text) };
}

// ---------- Hoja ----------
export function openLookScan(source = null) {
  const sheet = openSheet(`
    <p class="eyebrow accent">${ICON.person} Foto de un look</p>
    <h3 class="detail-title">Sube una foto de cuerpo entero</h3>
    <div id="lkBody">
      <ul class="bp-tips">
        <li>Con <b>cualquier fondo</b>: Vestia separa cada prenda (parte de arriba, pantalón o falda, vestido, calzado, bolso, gorro…).</li>
        <li>Busca la <b>marca</b> en lo que se lee en la ropa y te enseña <b>prendas parecidas en tiendas</b>.</li>
        <li>Si no se ve la marca, podrás <b>escanear la etiqueta</b> o escribir lo que sepas.</li>
      </ul>
      <p class="small muted">La foto se analiza en tu iPhone. Para buscar en tiendas solo se envía el texto de la búsqueda (marca, tipo y color), nunca la foto.</p>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost" id="lkGallery">${ICON.image} Elegir foto</button>
        <button class="btn primary" id="lkCamera">${ICON.camera} Hacer foto</button>
      </div>
    </div>`);
  sheet.classList.add('sheet-tall');
  const host = $('#lkBody', sheet);
  const run = async (photo) => {
    host.innerHTML = `<div class="scan-stage"><img src="${photo.toDataURL('image/jpeg', 0.85)}" alt=""><div class="scan-grid"></div><div class="scan-line"></div></div>
      <p class="center small" id="lkStep"><span class="spinner"></span> Preparando…</p>`;
    const step = (t) => { const el = $('#lkStep', host); if (el) el.innerHTML = `<span class="spinner"></span> ${esc(t)}`; };
    try {
      const found = await analyzeLook(photo, step);
      if (!found.length) throw new Error('No encuentro prendas en la foto. Prueba con una foto de cuerpo entero, de frente y con buena luz.');
      const items = [];
      for (const f of found) {
        step(`Reconociendo: ${f.part.label.toLowerCase()}…`);
        const it = await toItem(f);
        items.push({ it, f, on: f.part.key !== 'glasses' && f.part.key !== 'belt', clue: '' });
      }
      // Pistas de marca: texto legible en las prendas principales
      for (const x of items.filter((y) => y.f.part.ocr)) {
        step(`Buscando la marca en ${x.f.part.label.toLowerCase()}…`);
        try {
          const c = await readClues(x.f);
          if (c.brand) { x.it.brand = c.brand; x.clue = `Leído en la prenda: «${c.brand}»`; }
          if (c.ref) x.it.ref = c.ref;
          x.words = c.words;
        } catch { /* sin lector de texto */ }
      }
      review(host, items, photo);
    } catch (e) {
      host.innerHTML = `<p class="notice">${esc(e.message)}</p><button class="btn primary block" id="lkRetry">Probar con otra foto</button>`;
      $('#lkRetry', host).addEventListener('click', () => openLookScan());
    }
  };
  if (source) { run(source); return; }
  const pick = async (capture) => { const f = await pickFile('image/*', capture); if (f) run((await prepareImage(f, 1400)).canvas); };
  $('#lkGallery', sheet).addEventListener('click', () => pick(false));
  $('#lkCamera', sheet).addEventListener('click', () => pick('environment'));
}

const TYPE_OPTS = (types, cur) => types.map((t) => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
const queryOf = (it, words = []) => [it.brand, it.ref, it.model || it.subtype || it.type, (it.color || '').toLowerCase(), ...words.slice(0, 2)].filter(Boolean).join(' ');

function review(host, items, photo) {
  host.innerHTML = `
    <p class="small muted" style="margin:-4px 0 10px">He encontrado ${items.length} ${items.length === 1 ? 'prenda' : 'prendas'}. Revisa el tipo y la marca, busca la prenda en tiendas y elige cuáles añadir.</p>
    <div class="lk-list">${items.map((x, i) => `
      <div class="lk-item" data-i="${i}">
        <label class="lk-check"><input type="checkbox" ${x.on ? 'checked' : ''} data-f="on"><span></span></label>
        <div class="lk-img"><img src="${x.it.img}" alt=""></div>
        <div class="lk-info">
          <div class="lk-row"><select data-f="type">${TYPE_OPTS(x.f.part.types, x.it.type)}</select><span class="lk-color" style="background:${x.it.hex}" title="${esc(x.it.color)}"></span></div>
          <input data-f="brand" value="${esc(x.it.brand || '')}" placeholder="Marca (si la sabes)">
          <p class="lk-clue small ${x.clue ? 'ok' : ''}">${x.clue ? `${ICON.check} ${esc(x.clue)}` : 'No veo la marca en la foto.'}</p>
          <div class="lk-acts">
            <button class="chip" data-act="search">${ICON.link} Buscar en tiendas</button>
            <button class="chip" data-act="lens">${ICON.image} Buscar por imagen</button>
            <button class="chip" data-act="label">${ICON.tag} Escanear etiqueta</button>
            <button class="chip" data-act="details">Escribir detalles</button>
          </div>
          <div class="lk-details" hidden>
            <input data-f="model" placeholder="Nombre o modelo (p. ej. «sudadera parche estrella»)">
            <input data-f="ref" placeholder="Referencia de la etiqueta (p. ej. 1234/567/800)" value="${esc(x.it.ref || '')}">
            <button class="btn ghost" data-act="search">Buscar con estos datos</button>
          </div>
          <div class="lk-results"></div>
        </div>
      </div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="lkTry">${ICON.person} Probármelo</button><button class="btn primary" id="lkSave">${ICON.check} Añadir al armario</button></div>`;
  const card = (i) => $(`.lk-item[data-i="${i}"]`, host);
  const sync = (i) => {
    const x = items[i], c = card(i);
    x.on = $('[data-f="on"]', c).checked;
    x.it.type = $('[data-f="type"]', c).value;
    x.it.brand = $('[data-f="brand"]', c).value.trim();
    const m = $('[data-f="model"]', c).value.trim(), r = $('[data-f="ref"]', c).value.trim();
    if (m) { x.it.model = m; x.it.name = m; }
    x.it.ref = r || x.it.ref || '';
  };
  items.forEach((x, i) => {
    const c = card(i);
    $$('[data-f]', c).forEach((el) => el.addEventListener('change', () => sync(i)));
    $$('[data-act]', c).forEach((b) => b.addEventListener('click', async () => {
      sync(i);
      const act = b.dataset.act, out = $('.lk-results', c);
      if (act === 'details') { $('.lk-details', c).hidden = !$('.lk-details', c).hidden; return; }
      if (act === 'lens') return lens(x.it);
      if (act === 'label') return label(x, c, () => search(x, out));
      search(x, out);
    }));
  });
  async function search(x, out) {
    const q = queryOf(x.it, x.it.brand ? [] : x.words || []);
    out.innerHTML = `<p class="small muted"><span class="spinner"></span> Buscando «${esc(q)}»…</p>`;
    try {
      const res = await W.searchProducts(q);
      if (!res.length) { out.innerHTML = '<p class="small muted">No he encontrado nada parecido. Prueba con la marca, el nombre o la referencia de la etiqueta.</p>'; return; }
      out.innerHTML = res.slice(0, 5).map((r, j) => `<div class="lk-res">
          <div><b>${esc(r.title.slice(0, 70))}</b><small>${esc(r.site)}${r.product ? ' · ficha de producto' : ''}</small></div>
          <a class="chip" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a>
          <button class="chip" data-pick="${j}">Es esta</button></div>`).join('');
      $$('[data-pick]', out).forEach((pb) => pb.addEventListener('click', async () => {
        const r = res[+pb.dataset.pick];
        pb.innerHTML = '<span class="spinner"></span>';
        x.it.link = r.url; x.it.shop = r.site;
        x.it.brand ||= brandFromSite(r.site);
        try {
          const page = await W.readPage(r.url);
          if (page.price) x.it.price = page.price;
          x.it.name = page.title.replace(/\s*[|–-]\s*[^|–-]*$/, '').slice(0, 60) || x.it.name;
        } catch { /* se queda con el enlace */ }
        const c = out.closest('.lk-item');
        $('[data-f="brand"]', c).value = x.it.brand || '';
        out.innerHTML = `<p class="lk-linked">${ICON.check} Vinculada a <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.site)}</a>${x.it.price ? ` · ${esc(x.it.price)}` : ''}</p>`;
      }));
    } catch (e) { out.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; }
  }
  // Buscar por imagen: se comparte la foto de la prenda (en el iPhone, elige la app de Google para usar Lens)
  async function lens(it) {
    try {
      const blob = await (await fetch(it.img)).blob();
      const file = new File([blob], 'prenda.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        toast('Elige la app de Google para buscarla con Lens');
        await navigator.share({ files: [file], title: 'Buscar esta prenda' });
      } else {
        window.open('https://lens.google.com/', '_blank', 'noopener');
        toast('Sube a Google Lens la foto de la prenda');
      }
    } catch { /* cancelado */ }
  }
  // Etiqueta: se lee la marca, la referencia y la composición
  async function label(x, c, then) {
    const f = await pickFile('image/*', 'environment');
    if (!f) return;
    const out = $('.lk-results', c);
    out.innerHTML = '<p class="small muted"><span class="spinner"></span> Leyendo la etiqueta…</p>';
    try {
      const L = await import('./label.js');
      const { canvas } = await prepareImage(f, 2000);
      const r = await L.readLabel(canvas);
      const brand = brandIn(r.text), ref = refIn(r.text);
      if (brand) { x.it.brand = brand; $('[data-f="brand"]', c).value = brand; }
      if (ref) { x.it.ref = ref; $('[data-f="ref"]', c).value = ref; }
      if (r.composition?.length) {
        x.it.composition = r.composition;
        x.it.material ||= r.composition[0].fiber;
      }
      if (r.size) x.it.size = r.size;
      const got = [brand && `marca ${brand}`, ref && `referencia ${ref}`, r.composition?.length && r.composition.map((k) => `${k.pct ? `${k.pct} % ` : ''}${k.fiber.toLowerCase()}`).join(', ')].filter(Boolean);
      $('.lk-clue', c).classList.toggle('ok', !!got.length);
      $('.lk-clue', c).innerHTML = got.length ? `${ICON.check} Etiqueta: ${esc(got.join(' · '))}` : 'No he leído la marca en la etiqueta. Escribe lo que sepas.';
      if (!brand && !ref) { $('.lk-details', c).hidden = false; out.innerHTML = ''; return; }
      then();
    } catch (e) { out.innerHTML = `<p class="small muted">${esc(e.message || 'No he podido leer la etiqueta')}</p>`; }
  }
  const save = async () => {
    items.forEach((_, i) => sync(i));
    const chosen = items.filter((x) => x.on);
    if (!chosen.length) { toast('Marca al menos una prenda'); return []; }
    const t = Date.now(), saved = [];
    for (const [i, x] of chosen.entries()) {
      const { model, ...it } = x.it;
      if (!it.name || /^(Camiseta|Pantalón|Vaqueros|Falda|Vestido|Zapatillas|Bolso)\s/.test(it.name)) it.name = `${it.subtype || it.type} ${String(it.color || '').toLowerCase()}`.trim();
      const rec = { ...it, id: db.uid(), fav: false, createdAt: t + i };
      await saveItem(rec);
      saved.push(rec);
    }
    refresh();
    toast(`${saved.length} ${saved.length === 1 ? 'prenda añadida' : 'prendas añadidas'} a tu armario`);
    return saved;
  };
  $('#lkSave', host).addEventListener('click', async () => { if ((await save()).length) closeSheet(); });
  $('#lkTry', host).addEventListener('click', async () => {
    const saved = await save();
    if (!saved.length) return;
    // Se pone el look en el maniquí
    const worn = {};
    saved.forEach((it) => { const s = slotOf(it.type); if (!worn[s]) worn[s] = it.id; });
    state.worn = worn; state.profile.lastWorn = worn; saveProfile();
    closeSheet(); go('dress');
  });
}
