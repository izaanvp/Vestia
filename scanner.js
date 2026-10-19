// Escáner de prendas: foto con la cámara (o de la galería) → recorte del fondo → análisis → al armario.
import * as C from './color.js';
import * as A from './advisor.js';
import * as V from './vision.js';
import * as CU from './cutout.js';
import * as F from './fitting.js';
import { renderReal, forgetReal } from './realwear.js';
import { wearBody } from './photobody.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON, prepareImage, pickFile, pickFiles, slotOf, TYPES } from './core.js';

let stream = null;
const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };

const STEPS = [
  ['cut', 'Recortando el fondo'],
  ['type', 'Reconociendo la prenda'],
  ['fit', 'Enderezando y limpiando los bordes'],
  ['colors', 'Detectando colores y estampado'],
  ['try', 'Probándola en tu maniquí'],
];

// Qué vas a escanear: limita lo que puede reconocer Vistelo, cambia la guía de la cámara y
// le dice al maniquí cómo ponerse la prenda. Silueta guía en un lienzo de 100 × 120.
export const SCAN_CATS = [
  { id: 'auto', label: 'Automático', types: null, path: 'M32 8 Q50 16 68 8 L94 22 L84 44 L74 38 L74 112 L26 112 L26 38 L16 44 L6 22 Z', tip: 'Extiende la prenda sobre un fondo liso y con buena luz' },
  { id: 'tee', label: 'Camiseta / Top', types: ['Camiseta', 'Top'], def: 'Camiseta', path: 'M32 8 Q50 16 68 8 L94 22 L84 44 L74 38 L74 112 L26 112 L26 38 L16 44 L6 22 Z', tip: 'Extiéndela con las mangas abiertas y el cuello arriba' },
  { id: 'shirt', label: 'Camisa / Blusa', types: ['Camisa'], def: 'Camisa', path: 'M34 8 L42 3 L50 12 L58 3 L66 8 L88 20 L98 92 L86 94 L76 40 L76 114 L24 114 L24 40 L14 94 L2 92 L12 20 Z M50 12 L50 114', tip: 'Abotónala y extiéndela con las mangas a los lados' },
  { id: 'knit', label: 'Jersey / Sudadera', types: ['Jersey', 'Sudadera'], def: 'Jersey', path: 'M34 8 Q50 16 66 8 L86 18 L98 90 L86 94 L76 44 L76 110 L24 110 L24 44 L14 94 L2 90 L14 18 Z', tip: 'Extiéndelo con las mangas abiertas o caídas junto al cuerpo' },
  { id: 'jacket', label: 'Chaqueta / Abrigo', types: ['Chaqueta', 'Abrigo', 'Americana'], def: 'Chaqueta', path: 'M30 6 L42 4 L50 18 L58 4 L70 6 L88 18 L98 92 L86 95 L77 44 L77 114 L23 114 L23 44 L14 95 L2 92 L12 18 Z M50 18 L50 114', tip: 'Ciérrala y extiéndela; las mangas, a los lados' },
  { id: 'pants', label: 'Pantalón / Vaqueros', types: ['Pantalón', 'Vaqueros'], def: 'Pantalón', path: 'M24 6 L76 6 L82 114 L58 114 L50 40 L42 114 L18 114 Z', tip: 'Extiéndelo entero, con las perneras separadas' },
  { id: 'skirt', label: 'Falda', types: ['Falda'], def: 'Falda', path: 'M30 12 L70 12 L88 108 L12 108 Z', tip: 'Extiéndela de la cinturilla al bajo' },
  { id: 'shorts', label: 'Shorts', types: ['Shorts'], def: 'Shorts', path: 'M22 22 L78 22 L86 82 L56 86 L50 52 L44 86 L14 82 Z', tip: 'Extiéndelos con las perneras separadas' },
  { id: 'dress', label: 'Vestido / Mono', types: ['Vestido', 'Mono'], def: 'Vestido', path: 'M36 4 L42 4 L50 14 L58 4 L64 4 L66 30 L62 46 L88 114 L12 114 L38 46 L34 30 Z', tip: 'Extiéndelo entero, de los tirantes al bajo' },
  { id: 'shoes', label: 'Calzado', types: ['Zapatos', 'Zapatillas', 'Botas', 'Sandalias'], def: 'Zapatillas', path: 'M8 72 L8 92 L92 92 Q97 83 88 78 L60 68 L46 52 L30 54 Q24 68 8 72 Z', tip: 'Coloca el zapato de lado, con la puntera a la derecha' },
  { id: 'bag', label: 'Bolso', types: ['Bolso'], def: 'Bolso', path: 'M22 50 L78 50 L84 106 L16 106 Z M36 50 Q36 24 50 24 Q64 24 64 50', tip: 'Colócalo de frente, con el asa hacia arriba' },
  { id: 'acc', label: 'Accesorio', types: ['Accesorio'], def: 'Accesorio', path: 'M16 74 Q18 42 50 40 Q82 42 84 74 Z M84 74 L98 80 L84 84', tip: 'Ponlo en el centro, sobre un fondo liso' },
];
const catOf = (id) => SCAN_CATS.find((c) => c.id === id) || SCAN_CATS[0];
const WEARABLE = ['top', 'outer', 'one', 'bottom', 'shoes', 'bag'];
const SEASON_BY_TYPE = { Abrigo: 'Invierno', Jersey: 'Invierno', Botas: 'Invierno', Sudadera: 'Entretiempo', Chaqueta: 'Entretiempo', Shorts: 'Verano', Sandalias: 'Verano', Top: 'Verano' };

// source (opcional): imagen o archivo para analizar directamente, sin abrir la cámara.
// opts.onBatch(items): guarda varias prendas a la vez (escaneo en serie). opts.files: fotos para revisar en serie.
export function openScanner(onAdd, source = null, opts = {}) {
  batch = { shots: [], running: false, onBatch: opts.onBatch || null };
  camMode = opts.series ? 'many' : 'one';
  const sheet = openSheet(`
    <div class="scanner">
      <div class="scan-head"><h3>Escanear prenda</h3><span class="pill on" id="scanMode">${CU.mlReady() || state.profile.cutoutAI ? `${ICON.spark} Recorte IA` : 'Recorte rápido'}</span></div>
      <div id="scanBody"></div>
    </div>`, () => { stopCam(); batch.closed = true; });
  sheet.classList.add('sheet-tall');
  if (opts.files?.length) { queueFiles(opts.files, catOf('auto')); showReview(onAdd); return; }
  showPicker(onAdd, source);
}

// ---------- 0. ¿Qué vas a escanear? ----------
function showPicker(onAdd, source = null) {
  const body = $('#scanBody');
  if (!body) return;
  const last = state.profile.scanCat || 'auto';
  body.innerHTML = `
    <p class="scan-ask">¿Qué vas a escanear?</p>
    <div class="scan-cats">${SCAN_CATS.map((c) => `
      <button class="scan-cat ${c.id === last ? 'on' : ''}" data-cat="${c.id}">
        ${c.id === 'auto' ? ICON.spark : `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="${c.path}"/></svg>`}<span>${c.label}</span>
      </button>`).join('')}</div>
    <p class="small muted scan-why">Así Vistelo la reconoce mejor, la cámara te enseña cómo colocarla y el maniquí sabe ponérsela. Consejo: la prenda sola (sin nadie dentro), extendida sobre un fondo liso.</p>`;
  $$('[data-cat]', body).forEach((b) => b.addEventListener('click', () => {
    const cat = catOf(b.dataset.cat);
    state.profile.scanCat = cat.id; saveProfile();
    if (source) process(source, onAdd, { cat }); else showCamera(onAdd, cat);
  }));
}

// ---------- 1. Cámara (una prenda o en serie) ----------
let camMode = 'one';
async function showCamera(onAdd, cat = catOf(state.profile.scanCat)) {
  const body = $('#scanBody');
  if (!body) return;
  if (batch.shots.length) camMode = 'many';
  body.innerHTML = `
    <div class="seg scan-modes" id="scanModes">
      <button data-cmode="one" class="${camMode === 'one' ? 'on' : ''}">Una prenda</button>
      <button data-cmode="many" class="${camMode === 'many' ? 'on' : ''}">${ICON.layers} En serie</button>
    </div>
    <div class="scan-cam ${camMode === 'many' ? 'compact' : ''}">
      <video id="scanVideo" autoplay playsinline muted></video>
      <div class="scan-guide"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
        <svg viewBox="0 0 100 120" class="scan-shape"><path id="scanShapePath" d="${cat.path}"/></svg></div>
      <div class="scan-catchips" id="scanCats">${SCAN_CATS.map((c) => `<button class="${c.id === cat.id ? 'on' : ''}" data-ccat="${c.id}">${esc(c.label)}</button>`).join('')}</div>
      <p class="scan-tip" id="scanTip">${esc(cat.tip)}</p>
      <span class="scan-count" id="scanCount" hidden></span>
    </div>
    <div class="scan-tray" id="scanTray" ${camMode === 'many' ? '' : 'hidden'}></div>
    <div class="scan-controls">
      <button class="round-btn" id="scanGallery" aria-label="Elegir de la galería">${ICON.image}</button>
      <button class="shutter" id="scanShot" aria-label="Hacer foto"><span></span></button>
      <button class="round-btn" id="scanFlip" aria-label="Cambiar de cámara">${ICON.refresh}</button>
    </div>
    <button class="btn primary block scan-review" id="scanReview" hidden></button>`;
  const setCat = (c) => {
    cat = c; state.profile.scanCat = c.id; saveProfile();
    $('#scanShapePath').setAttribute('d', c.path); $('#scanTip').textContent = c.tip;
    $$('[data-ccat]', body).forEach((x) => x.classList.toggle('on', x.dataset.ccat === c.id));
  };
  $$('[data-ccat]', body).forEach((b) => b.addEventListener('click', () => setCat(catOf(b.dataset.ccat))));
  $('[data-ccat].on', body)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const setMode = (m) => {
    camMode = m;
    $$('[data-cmode]', body).forEach((x) => x.classList.toggle('on', x.dataset.cmode === m));
    $('#scanTray').hidden = m !== 'many';
    $('.scan-cam')?.classList.toggle('compact', m === 'many');
    $('#scanGallery').setAttribute('aria-label', m === 'many' ? 'Añadir varias fotos de la galería' : 'Elegir de la galería');
    renderTray(onAdd);
  };
  $$('[data-cmode]', body).forEach((b) => b.addEventListener('click', () => setMode(b.dataset.cmode)));

  let facing = 'environment';
  const start = async () => {
    stopCam();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      const v = $('#scanVideo'); v.srcObject = stream; await v.play();
    } catch {
      $('.scan-cam').innerHTML = `<div class="notice" style="margin:12px">No puedo usar la cámara aquí. Puedes abrir la cámara del sistema o elegir fotos.</div>
        <button class="btn navy" id="scanSystem" style="margin:0 12px 12px">${ICON.camera} Abrir la cámara del sistema</button>`;
      $('#scanSystem').addEventListener('click', async () => {
        const f = await pickFile('image/*', 'environment');
        if (!f) return;
        if (camMode === 'many') { queueFiles([f], cat); renderTray(onAdd); } else process(f, onAdd, { cat });
      });
    }
  };
  start();
  $('#scanFlip').addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
  $('#scanGallery').addEventListener('click', async () => {
    if (camMode === 'many') {
      const files = await pickFiles('image/*');
      if (files.length) { queueFiles(files, cat); renderTray(onAdd); toast(`${files.length} ${files.length > 1 ? 'fotos añadidas' : 'foto añadida'} a la serie`); }
      return;
    }
    const f = await pickFile('image/*'); if (f) { stopCam(); process(f, onAdd, { cat }); }
  });
  $('#scanShot').addEventListener('click', () => {
    const v = $('#scanVideo');
    if (!v?.videoWidth) return toast('La cámara aún no está lista');
    const c = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const camEl = $('.scan-cam'); camEl.classList.remove('flash'); void camEl.offsetWidth; camEl.classList.add('flash');
    if (camMode === 'many') {
      // En serie: la cámara sigue abierta y la foto se procesa en segundo plano
      queueShot(c, cat); renderTray(onAdd);
      const n = $('#scanCount'); n.hidden = false; n.textContent = batch.shots.length; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
      return;
    }
    stopCam();
    setTimeout(() => process(c, onAdd, { cat }), 180);
  });
  $('#scanReview').addEventListener('click', () => { stopCam(); showReview(onAdd); });
  renderTray(onAdd);
}

// ---------- Escaneo en serie ----------
let batch = { shots: [], running: false, onBatch: null };
let shotSeq = 0;
function queueShot(canvas, cat) {
  const t = document.createElement('canvas');
  const k = 160 / Math.max(canvas.width, canvas.height);
  t.width = Math.round(canvas.width * k); t.height = Math.round(canvas.height * k);
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  batch.shots.push({ id: ++shotSeq, cat, canvas, thumb: t.toDataURL('image/jpeg', 0.7), status: 'queued', keep: true });
  runBatch();
}
function queueFiles(files, cat) {
  files.forEach((f) => batch.shots.push({ id: ++shotSeq, cat, file: f, thumb: '', status: 'queued', keep: true }));
  runBatch();
}
async function runBatch() {
  if (batch.running) return;
  batch.running = true;
  const mine = batch;
  for (let s; !mine.closed && (s = mine.shots.find((x) => x.status === 'queued'));) {
    s.status = 'working'; updateBatchUI();
    try {
      if (s.file) {
        s.canvas = (await prepareImage(s.file, 1600)).canvas;
        const k = 160 / Math.max(s.canvas.width, s.canvas.height);
        const t = document.createElement('canvas'); t.width = Math.round(s.canvas.width * k); t.height = Math.round(s.canvas.height * k);
        t.getContext('2d').drawImage(s.canvas, 0, 0, t.width, t.height); s.thumb = t.toDataURL('image/jpeg', 0.7);
      }
      s.result = await analyzeGarment(s.canvas, { cat: s.cat });
      s.type = s.result.rec.type; s.subtype = s.result.rec.subtype || '';
      s.status = 'done';
    } catch { s.status = 'error'; s.keep = false; }
    s.canvas = null; s.file = null; // libera memoria: ya no hace falta la foto grande
    updateBatchUI();
  }
  mine.running = false;
}
let batchUI = () => {};
const updateBatchUI = () => batchUI();

function renderTray(onAdd) {
  const tray = $('#scanTray'), rev = $('#scanReview');
  if (!tray) return;
  batchUI = () => renderTray(onAdd);
  const shots = batch.shots;
  const done = shots.filter((s) => s.status === 'done').length;
  tray.innerHTML = shots.length ? shots.map((s) => `<span class="tray-shot ${s.status}">
      <img src="${s.status === 'done' ? s.result.img : s.thumb || ''}" alt="">${s.status === 'done' ? '<i class="ok">✓</i>' : s.status === 'error' ? '<i class="ko">!</i>' : '<i class="spinner"></i>'}</span>`).join('')
    : `<p class="small muted tray-empty">Haz una foto por prenda: Vistelo las va recortando mientras sigues.</p>`;
  tray.scrollLeft = tray.scrollWidth;
  if (rev) {
    rev.hidden = !(camMode === 'many' && shots.length);
    rev.innerHTML = `${ICON.layers} Revisar ${shots.length} ${shots.length === 1 ? 'prenda' : 'prendas'}${done < shots.length ? ` · ${done} listas` : ''}`;
  }
}

function showReview(onAdd) {
  const body = $('#scanBody');
  if (!body) return;
  batchUI = () => { if ($('#batchList')) drawReview(); };
  const drawReview = () => {
    const shots = batch.shots;
    const ready = shots.filter((s) => s.status === 'done');
    const keep = ready.filter((s) => s.keep);
    const pending = shots.filter((s) => ['queued', 'working'].includes(s.status)).length;
    $('#batchList').innerHTML = shots.map((s, i) => {
      if (s.status !== 'done') return `<div class="batch-card ${s.status}"><span class="batch-media"><img src="${s.thumb}" alt="">${s.status === 'error' ? '<b class="ko">No se pudo leer</b>' : '<span class="spinner"></span>'}</span><small>${s.status === 'error' ? 'Descartada' : s.status === 'working' ? 'Recortando…' : 'En cola'}</small></div>`;
      const r = s.result;
      const subs = [...new Set([s.subtype, ...(r.rec.subtypes || []).map((x) => x.subtype), ...subtypesOf(s.type)].filter(Boolean))];
      return `<div class="batch-card ${s.keep ? '' : 'off'}" data-b="${i}">
        <button class="batch-keep" data-keep="${i}" aria-label="${s.keep ? 'Quitar' : 'Incluir'}">${s.keep ? '✓' : ''}</button>
        <span class="batch-media checker"><img src="${r.img}" alt=""></span>
        <select data-btype="${i}" aria-label="Tipo">${TYPES.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select data-bsub="${i}" aria-label="Prenda concreta"><option value="">${esc(s.type)}</option>${subs.map((n) => `<option ${n === s.subtype ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <small><i class="dot" style="background:${r.primary.hex}"></i>${esc(r.colorName)}${r.rec.confidence != null ? ` · ${Math.round(r.rec.confidence * 100)}%` : ''}</small>
      </div>`;
    }).join('');
    $('#batchSave').disabled = !keep.length;
    $('#batchSave').innerHTML = pending ? `<span class="spinner"></span> Procesando ${pending}… (puedes guardar ya ${keep.length})` : `Guardar ${keep.length} ${keep.length === 1 ? 'prenda' : 'prendas'} en el armario`;
    $$('[data-keep]', body).forEach((b) => b.addEventListener('click', () => { const s = batch.shots[+b.dataset.keep]; s.keep = !s.keep; drawReview(); }));
    $$('[data-btype]', body).forEach((sel) => sel.addEventListener('change', () => { const s = batch.shots[+sel.dataset.btype]; s.type = sel.value; s.subtype = ''; drawReview(); }));
    $$('[data-bsub]', body).forEach((sel) => sel.addEventListener('change', () => { batch.shots[+sel.dataset.bsub].subtype = sel.value; }));
  };
  body.innerHTML = `
    <div class="batch-head"><p class="scan-ask" style="margin:0">Revisa tu serie</p>
      <button class="chip" id="batchMore">${ICON.camera} Seguir escaneando</button></div>
    <p class="small muted" style="margin:4px 0 12px">Corrige el tipo si hace falta y quita las que no quieras. Todas se guardan con su recorte, colores y prenda concreta.</p>
    <div class="batch-grid" id="batchList"></div>
    <button class="btn primary block" id="batchSave" style="margin-top:14px"></button>`;
  drawReview();
  $('#batchMore').addEventListener('click', () => { camMode = 'many'; showCamera(onAdd); });
  $('#batchSave').addEventListener('click', async () => {
    const list = batch.shots.filter((s) => s.status === 'done' && s.keep);
    if (!list.length) return;
    const items = list.map((s) => itemFromScan(s.result, { type: s.type, subtype: s.subtype }));
    batch.shots = batch.shots.filter((s) => !list.includes(s));
    if (batch.onBatch) await batch.onBatch(items);
    else items.forEach((it) => onAdd(it));
    if (batch.shots.some((s) => ['queued', 'working'].includes(s.status))) { drawReview(); return; }
    batch.shots = []; camMode = 'one';
    closeSheet();
  });
}

// ---------- Motor de análisis (sin pantalla: lo usan el escaneo normal y el escaneo en serie) ----------
// onStep(clave, texto) informa del progreso. Devuelve todo lo necesario para crear la prenda.
export async function analyzeGarment(original, { cat = catOf('auto'), method, sensitivity = 1, soft = 0.5, onStep = () => {} } = {}) {
  // 1. Recorte
  const wantML = method === 'ia' || (method !== 'rapido' && state.profile.cutoutAI);
  if (wantML && !CU.mlReady()) {
    onStep('cut', 'Preparando el recorte con IA…');
    try { await CU.loadML((p) => onStep('cut', `Descargando el recorte con IA… ${Math.round(p * 100)}%`)); } catch { toast('No se pudo descargar el recorte con IA; uso el rápido'); }
  }
  onStep('cut', CU.mlReady() && wantML ? 'Recortando el fondo con IA' : 'Recortando el fondo');
  const res = await CU.cutout(original, { method: wantML ? 'ia' : method || 'auto', sensitivity, soft });
  onStep('cutDone', res.canvas);

  // 2. Tipo de prenda (solo entre los tipos de la categoría elegida)
  onStep('type', state.profile.vision ? 'Reconociendo la prenda con Vistelo AI' : 'Reconociendo la prenda (básico)');
  const quick = colorsOf(res.canvas);
  const g = A.guessItem({ fileName: '', canvas: res.canvas, color: quick.colorName, extraBrands: state.profile.brands });
  let rec = { type: cat.types && !cat.types.includes(g.type) ? cat.def : g.type, subtype: '', confidence: null, ranking: [], subtypes: [], material: '', style: '' };
  if (state.profile.vision) {
    try { rec = await V.analyze(res.canvas, { types: cat.types }); } catch { /* básico */ }
  }

  // 3. Acabado: quitar la percha, enderezar y limpiar el borde para que luzca en el maniquí
  onStep('fit');
  const fin = CU.refineGarment(res.canvas, { category: slotOf(rec.type) });

  // 4. Colores y estampado (sobre la prenda ya limpia)
  onStep('colors');
  const { colors, primary, colorName } = colorsOf(fin.canvas);
  let pattern = CU.patternHint(fin.canvas, colors);
  if (rec.pattern && rec.pattern !== 'Liso') pattern = rec.pattern;
  return { original, cut: { canvas: fin.canvas }, img: fin.canvas.toDataURL('image/png'), notes: fin.notes, colors, pattern, rec, primary, colorName, method: res.method, cat };
}

// Prenda lista para el armario a partir de un análisis
export function itemFromScan(r, { type = r.rec.type, subtype = r.rec.subtype || '' } = {}) {
  const pct = r.rec.confidence != null ? Math.round(r.rec.confidence * 100) : undefined;
  return {
    img: r.img, hex: r.primary.hex, color: r.colorName, colors: r.colors, type, subtype, pattern: r.pattern,
    material: r.rec.material || '', style: r.rec.style || '', season: SEASON_BY_TYPE[type] || 'Todo el año',
    name: `${subtype || type} ${r.colorName.toLowerCase()}`, brand: '', notes: '',
    visionAt: pct != null ? Date.now() : undefined, visionConfidence: pct,
    scanned: true, scanCat: r.cat?.id,
  };
}

// ---------- 2. Procesado con animación de escaneo ----------
async function process(input, onAdd, opts = {}) {
  const body = $('#scanBody');
  if (!body) return;
  const cat = opts.cat || catOf(state.profile.scanCat);
  const original = input instanceof HTMLCanvasElement ? input : (await prepareImage(input, 1600)).canvas;
  body.innerHTML = `
    <div class="scan-stage"><img src="${original.toDataURL('image/jpeg', 0.85)}" alt=""><div class="scan-grid"></div><div class="scan-line"></div></div>
    <ul class="scan-steps">${STEPS.map(([k, l]) => `<li data-step="${k}"><i></i><span>${l}</span></li>`).join('')}</ul>`;
  const step = (k, extra = '') => {
    if (k === 'cutDone') {
      // Mostrar el recorte sobre la foto mientras se analiza
      $('.scan-stage', body)?.insertAdjacentHTML('beforeend', `<img class="scan-cut" src="${extra.toDataURL('image/png')}" alt="">`);
      return;
    }
    let reached = false;
    $$('[data-step]', body).forEach((li) => {
      if (li.dataset.step === k) { li.className = 'active'; reached = true; if (extra) li.querySelector('span').textContent = extra; }
      else if (!reached) li.className = 'done';
    });
  };
  const r = await analyzeGarment(original, { cat, method: opts.method, sensitivity: opts.sensitivity ?? 1, soft: opts.soft ?? 0.5, onStep: step });
  if (!$('#scanBody') || !body.isConnected) return;
  step('try', WEARABLE.includes(slotOf(r.rec.type)) ? 'Probándola en tu maniquí' : 'Prenda digitalizada');
  await new Promise((res) => setTimeout(res, 250));
  showResult({ ...r, onAdd });
}

function colorsOf(canvas) {
  const colors = CU.garmentColors(canvas);
  const primary = colors[0] || { hex: C.dominantColor(canvas), share: 1 };
  return { colors, primary, colorName: C.nearestNamed(primary.hex).name };
}

// Variantes que se pueden elegir para un tipo (las que conoce Vistelo)
const subtypesOf = (type) => V.GARMENTS.filter((g) => g[1] === type).map((g) => g[2]);

// ---------- 3. Resultado ----------
async function showResult(ctx) {
  const { original, cut, colors, pattern, rec, primary, colorName, onAdd, cat, notes } = ctx;
  const body = $('#scanBody');
  if (!body) return;
  let type = rec.type;
  let subtype = rec.subtype || '';
  const cutUrl = ctx.img || cut.canvas.toDataURL('image/png');
  const pct = rec.confidence != null ? Math.round(rec.confidence * 100) : null;
  const previewId = `scan-${Date.now()}`;
  const wearable = () => WEARABLE.includes(slotOf(type));
  const subChips = () => {
    const vis = (rec.subtypes || []).filter((x) => x.p > 0.04).map((x) => x.subtype);
    const all = [...new Set([...(type === rec.type ? vis : []), ...subtypesOf(type)])];
    return all.map((n) => `<button class="chip ${n === subtype ? 'on' : ''}" data-sub="${esc(n)}">${esc(n)}</button>`).join('');
  };
  body.innerHTML = `
    <div class="seg scan-views" id="scanViews">
      <button data-view="try" class="${wearable() ? 'on' : ''}" ${wearable() ? '' : 'hidden'}>En tu maniquí</button>
      <button data-view="cmp" class="${wearable() ? '' : 'on'}">Antes / después</button>
    </div>
    <div class="scan-try" id="scanTry" ${wearable() ? '' : 'hidden'}><div class="scan-try-fig" id="scanTryFig"><span class="spinner"></span></div>
      <p class="scan-try-note small" id="scanTryNote">Tu prenda, adaptada a tu maniquí</p></div>
    <div class="compare" id="compare" ${wearable() ? 'hidden' : ''}>
      <div class="compare-before"><img src="${original.toDataURL('image/jpeg', 0.85)}" alt="Foto original"></div>
      <div class="compare-after checker"><img src="${cutUrl}" alt="Prenda recortada"></div>
      <div class="compare-handle" id="cmpHandle"><span></span></div>
      <span class="compare-tag l">Antes</span><span class="compare-tag r">Después</span>
    </div>

    <div class="scan-result card">
      <div class="scan-title">
        <div><p class="eyebrow accent">${ICON.spark} Vistelo ha detectado</p><h4 id="resType">${esc(subtype || type)}</h4></div>
        ${pct != null ? `<div class="ring" style="--p:${pct}"><b>${pct}%</b></div>` : '<span class="pill">Básico</span>'}
      </div>
      ${rec.ranking?.length > 1 ? `<p class="section-label">¿No es eso? Elige</p>
        <div class="chips">${rec.ranking.map((r, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-alt="${r.type}">${r.type} · ${Math.round(r.p * 100)}%</button>`).join('')}</div>` : ''}
      <p class="section-label" style="margin-top:12px">Prenda concreta</p>
      <div class="chips" id="subChips">${subChips()}</div>
      <p class="section-label" style="margin-top:14px">Colores de la prenda</p>
      <div class="color-bars">${colors.map((c) => `<div><i style="background:${c.hex};flex:${Math.max(0.12, c.share)}"></i><span>${esc(c.name)} · ${Math.round(c.share * 100)}%</span></div>`).join('')}</div>
      <div class="scan-facts">
        <div><span>Estampado</span><b>${esc(pattern)}</b></div>
        <div><span>Material</span><b>${esc(rec.material || '—')}</b></div>
        <div><span>Estilo</span><b>${esc(rec.style || '—')}</b></div>
        <div><span>Tu paleta</span><b>${state.profile.season ? `${Math.round(C.paletteFit(primary.hex, state.profile.season) * 100)}%` : '—'}</b></div>
      </div>
      ${notes?.length ? `<p class="small muted" style="margin:10px 0 0">${ICON.wand} Retoques: ${notes.map((n) => (n === 'percha' ? 'percha quitada' : n)).join(' · ')} · bordes limpios</p>` : ''}
      ${!state.profile.vision ? `<div class="notice small" style="margin-top:12px">Activa la <b>visión avanzada</b> en Perfil para reconocer más de 60 prendas, el material y el estilo.</div>` : ''}
    </div>

    <details class="scan-adjust">
      <summary>Ajustar el recorte</summary>
      <div class="seg" style="margin:10px 0">
        <button data-method="ia" class="${ctx.method === 'ia' ? 'on' : ''}">${ICON.spark} Con IA</button>
        <button data-method="rapido" class="${ctx.method === 'rapido' ? 'on' : ''}">Rápido</button>
      </div>
      <label class="range"><span>Sensibilidad (rápido)</span><input type="range" id="sens" min="0.6" max="1.8" step="0.1" value="1"></label>
      <label class="range"><span>Suavidad del borde</span><input type="range" id="soft" min="0" max="1" step="0.1" value="0.5"></label>
      <button class="btn ghost block" id="reCut">Volver a recortar</button>
      ${ctx.method !== 'ia' && !state.profile.cutoutAI ? `<p class="small muted" style="margin:8px 0 0">El recorte con IA es mucho más preciso con fondos complicados (se descarga una vez, ~44 MB).</p>` : ''}
    </details>

    <div class="row" style="margin-top:12px">
      <button class="btn ghost" id="scanAgain">${ICON.camera} Repetir</button>
      <button class="btn primary" id="scanAdd">Añadir al armario</button>
    </div>`;

  // Vista previa en el maniquí del usuario, con la prenda real escaneada
  let tryToken = 0;
  const drawTry = async () => {
    const host = $('#scanTryFig');
    if (!host) return;
    const views = $('#scanViews');
    const can = wearable();
    $('[data-view="try"]', views).hidden = !can;
    if (!can) { setView('cmp'); return; }
    const token = ++tryToken;
    const slot = slotOf(type);
    const item = { id: previewId, img: cutUrl, type, subtype, hex: primary.hex, color: colorName, name: subtype || type };
    forgetReal(previewId); F.forgetTrim(previewId);
    const src = await F.trim(item);
    const custom = wearBody();
    const real = await renderReal(item, slot, F.bodyOf(state.profile).figure, src, custom);
    if (token !== tryToken || !$('#scanTryFig')) return;
    const worn = { [slot]: { item, src, real, fabric: real ? null : await F.fabric(item, slot) } };
    host.innerHTML = F.mannequinSVG({ skin: state.profile.skin?.hex || '#d4a37f', body: F.bodyOf(state.profile), worn, mode: 'real', photo: custom?.photo });
    $('#scanTryNote').textContent = real ? 'Tu prenda real, adaptada a tu maniquí' : 'No he podido adaptar la foto; te la enseño ilustrada';
  };
  const setView = (v) => {
    $$('[data-view]', body).forEach((x) => x.classList.toggle('on', x.dataset.view === v));
    $('#scanTry').hidden = v !== 'try';
    $('#compare').hidden = v !== 'cmp';
    if (v === 'cmp') requestAnimationFrame(() => $('#compare').classList.add('intro'));
  };
  $$('[data-view]', body).forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  if (wearable()) drawTry(); else requestAnimationFrame(() => $('#compare').classList.add('intro'));

  // Comparador antes/después
  const cmp = $('#compare'), handle = $('#cmpHandle');
  const setPos = (x) => {
    const r = cmp.getBoundingClientRect();
    const p = Math.max(0.04, Math.min(0.96, (x - r.left) / r.width));
    cmp.style.setProperty('--pos', `${p * 100}%`);
  };
  let drag = false;
  handle.addEventListener('pointerdown', (e) => { drag = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => drag && setPos(e.clientX));
  handle.addEventListener('pointerup', () => (drag = false));
  cmp.addEventListener('click', (e) => setPos(e.clientX));

  const bindSubs = () => $$('[data-sub]', body).forEach((b) => b.addEventListener('click', () => {
    subtype = subtype === b.dataset.sub ? '' : b.dataset.sub;
    $$('[data-sub]', body).forEach((x) => x.classList.toggle('on', x.dataset.sub === subtype));
    $('#resType').textContent = subtype || type;
    drawTry();
  }));
  bindSubs();
  $$('[data-alt]', body).forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.alt; subtype = type === rec.type ? rec.subtype : '';
    $$('[data-alt]', body).forEach((x) => x.classList.toggle('on', x === b));
    $('#resType').textContent = subtype || type;
    $('#subChips').innerHTML = subChips(); bindSubs();
    if (wearable() && !$('[data-view="try"]', body).classList.contains('on')) setView('try');
    drawTry();
  }));
  let method = ctx.method;
  $$('[data-method]', body).forEach((b) => b.addEventListener('click', () => {
    method = b.dataset.method;
    $$('[data-method]', body).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#reCut').addEventListener('click', () => {
    if (method === 'ia' && !state.profile.cutoutAI) { state.profile.cutoutAI = true; saveProfile(); $('#scanMode').innerHTML = `${ICON.spark} Recorte IA`; }
    process(original, onAdd, { method, sensitivity: +$('#sens').value, soft: +$('#soft').value, cat });
  });
  $('#scanAgain').addEventListener('click', () => showCamera(onAdd, cat));
  $('#scanAdd').addEventListener('click', () => {
    forgetReal(previewId); F.forgetTrim(previewId);
    const item = itemFromScan(ctx, { type, subtype });
    closeSheet();
    setTimeout(() => onAdd(item), 260);
  });
}
