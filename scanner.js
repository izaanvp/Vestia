// Escáner de prendas: foto con la cámara (o de la galería) → recorte del fondo → análisis → al armario.
import * as C from './color.js';
import * as A from './advisor.js';
import * as V from './vision.js';
import * as CU from './cutout.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON, prepareImage, pickFile } from './core.js';

let stream = null;
const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };

const STEPS = [
  ['cut', 'Recortando el fondo'],
  ['colors', 'Detectando colores y estampado'],
  ['type', 'Reconociendo la prenda'],
  ['done', 'Prenda digitalizada'],
];
const SEASON_BY_TYPE = { Abrigo: 'Invierno', Jersey: 'Invierno', Botas: 'Invierno', Sudadera: 'Entretiempo', Chaqueta: 'Entretiempo', Shorts: 'Verano', Sandalias: 'Verano', Top: 'Verano' };

// source (opcional): imagen o archivo para analizar directamente, sin abrir la cámara.
export function openScanner(onAdd, source = null) {
  const sheet = openSheet(`
    <div class="scanner">
      <div class="scan-head"><h3>Escanear prenda</h3><span class="pill on" id="scanMode">${CU.mlReady() || state.profile.cutoutAI ? `${ICON.spark} Recorte IA` : 'Recorte rápido'}</span></div>
      <div id="scanBody"></div>
    </div>`, () => stopCam());
  sheet.classList.add('sheet-tall');
  if (source) process(source, onAdd); else showCamera(onAdd);
}

// ---------- 1. Cámara ----------
async function showCamera(onAdd) {
  const body = $('#scanBody');
  body.innerHTML = `
    <div class="scan-cam">
      <video id="scanVideo" autoplay playsinline muted></video>
      <div class="scan-guide"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
        <svg viewBox="0 0 100 120" class="scan-shape"><path d="M32 8 Q50 16 68 8 L94 22 L84 44 L74 38 L74 112 L26 112 L26 38 L16 44 L6 22 Z"/></svg></div>
      <p class="scan-tip">Extiende la prenda sobre un fondo liso y con buena luz</p>
    </div>
    <div class="scan-controls">
      <button class="round-btn" id="scanGallery" aria-label="Elegir de la galería">${ICON.image}</button>
      <button class="shutter" id="scanShot" aria-label="Hacer foto"><span></span></button>
      <button class="round-btn" id="scanFlip" aria-label="Cambiar de cámara">${ICON.refresh}</button>
    </div>`;
  let facing = 'environment';
  const start = async () => {
    stopCam();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      const v = $('#scanVideo'); v.srcObject = stream; await v.play();
    } catch {
      $('.scan-cam').innerHTML = `<div class="notice" style="margin:12px">No puedo usar la cámara aquí. Puedes abrir la cámara del sistema o elegir una foto.</div>
        <button class="btn navy" id="scanSystem" style="margin:0 12px 12px">${ICON.camera} Abrir la cámara del sistema</button>`;
      $('#scanSystem').addEventListener('click', async () => { const f = await pickFile('image/*', 'environment'); if (f) process(f, onAdd); });
    }
  };
  start();
  $('#scanFlip').addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
  $('#scanGallery').addEventListener('click', async () => { const f = await pickFile('image/*'); if (f) process(f, onAdd); });
  $('#scanShot').addEventListener('click', () => {
    const v = $('#scanVideo');
    if (!v?.videoWidth) return toast('La cámara aún no está lista');
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    $('.scan-cam').classList.add('flash');
    stopCam();
    setTimeout(() => process(c, onAdd), 180);
  });
}

// ---------- 2. Procesado con animación de escaneo ----------
async function process(input, onAdd, opts = {}) {
  const body = $('#scanBody');
  if (!body) return;
  const original = input instanceof HTMLCanvasElement ? input : (await prepareImage(input, 1600)).canvas;
  body.innerHTML = `
    <div class="scan-stage"><img src="${original.toDataURL('image/jpeg', 0.85)}" alt=""><div class="scan-grid"></div><div class="scan-line"></div></div>
    <ul class="scan-steps">${STEPS.map(([k, l]) => `<li data-step="${k}"><i></i><span>${l}</span></li>`).join('')}</ul>`;
  const step = (k, extra = '') => {
    let reached = false;
    $$('[data-step]', body).forEach((li) => {
      if (li.dataset.step === k) { li.className = 'active'; reached = true; if (extra) li.querySelector('span').textContent = extra; }
      else if (!reached) li.className = 'done';
    });
  };

  // 1. Recorte
  const wantML = opts.method === 'ia' || (opts.method !== 'rapido' && state.profile.cutoutAI);
  if (wantML && !CU.mlReady()) {
    step('cut', 'Preparando el recorte con IA…');
    try { await CU.loadML((p) => step('cut', `Descargando el recorte con IA… ${Math.round(p * 100)}%`)); } catch { toast('No se pudo descargar el recorte con IA; uso el rápido'); }
  }
  step('cut', CU.mlReady() && wantML ? 'Recortando el fondo con IA' : 'Recortando el fondo');
  const res = await CU.cutout(original, { method: wantML ? 'ia' : opts.method || 'auto', sensitivity: opts.sensitivity ?? 1, soft: opts.soft ?? 0.5 });
  if (!$('#scanBody')) return;
  // Mostrar el recorte sobre la foto mientras se analiza
  const stage = $('.scan-stage', body);
  stage.insertAdjacentHTML('beforeend', `<img class="scan-cut" src="${res.canvas.toDataURL('image/png')}" alt="">`);

  // 2. Colores
  step('colors');
  const colors = CU.garmentColors(res.canvas);
  let pattern = CU.patternHint(res.canvas, colors);
  await new Promise((r) => setTimeout(r, 250));

  // 3. Tipo de prenda
  step('type', state.profile.vision ? 'Reconociendo la prenda con Vistelo AI' : 'Reconociendo la prenda (básico)');
  const primary = colors[0] || { hex: C.dominantColor(res.canvas), share: 1 };
  const colorName = C.nearestNamed(primary.hex).name;
  const g = A.guessItem({ fileName: '', canvas: res.canvas, color: colorName, extraBrands: state.profile.brands });
  let rec = { type: g.type, subtype: '', confidence: null, ranking: [], material: '', style: '' };
  if (state.profile.vision) {
    try {
      const r = await V.analyze(res.canvas);
      rec = r;
      if (r.pattern && r.pattern !== 'Liso') pattern = r.pattern;
    } catch { /* básico */ }
  }
  step('done');
  await new Promise((r) => setTimeout(r, 350));
  showResult({ original, cut: res, colors, pattern, rec, primary, colorName, onAdd, method: res.method });
}

// ---------- 3. Resultado ----------
function showResult(ctx) {
  const { original, cut, colors, pattern, rec, primary, colorName, onAdd } = ctx;
  const body = $('#scanBody');
  if (!body) return;
  let type = rec.type;
  let subtype = rec.subtype || '';
  const cutUrl = cut.canvas.toDataURL('image/png');
  const pct = rec.confidence != null ? Math.round(rec.confidence * 100) : null;
  body.innerHTML = `
    <div class="compare" id="compare">
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
      ${rec.ranking?.length ? `<p class="section-label">¿No es eso? Elige</p>
        <div class="chips">${rec.ranking.map((r, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-alt="${r.type}">${r.type} · ${Math.round(r.p * 100)}%</button>`).join('')}</div>` : ''}
      <p class="section-label" style="margin-top:14px">Colores de la prenda</p>
      <div class="color-bars">${colors.map((c) => `<div><i style="background:${c.hex};flex:${Math.max(0.12, c.share)}"></i><span>${esc(c.name)} · ${Math.round(c.share * 100)}%</span></div>`).join('')}</div>
      <div class="scan-facts">
        <div><span>Estampado</span><b>${esc(pattern)}</b></div>
        <div><span>Material</span><b>${esc(rec.material || '—')}</b></div>
        <div><span>Estilo</span><b>${esc(rec.style || '—')}</b></div>
        <div><span>Tu paleta</span><b>${state.profile.season ? `${Math.round(C.paletteFit(primary.hex, state.profile.season) * 100)}%` : '—'}</b></div>
      </div>
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
  requestAnimationFrame(() => cmp.classList.add('intro'));

  $$('[data-alt]', body).forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.alt; subtype = type === rec.type ? rec.subtype : '';
    $$('[data-alt]', body).forEach((x) => x.classList.toggle('on', x === b));
    $('#resType').textContent = subtype || type;
  }));
  let method = ctx.method;
  $$('[data-method]', body).forEach((b) => b.addEventListener('click', () => {
    method = b.dataset.method;
    $$('[data-method]', body).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#reCut').addEventListener('click', () => {
    if (method === 'ia' && !state.profile.cutoutAI) { state.profile.cutoutAI = true; saveProfile(); $('#scanMode').innerHTML = `${ICON.spark} Recorte IA`; }
    process(original, onAdd, { method, sensitivity: +$('#sens').value, soft: +$('#soft').value });
  });
  $('#scanAgain').addEventListener('click', () => showCamera(onAdd));
  $('#scanAdd').addEventListener('click', () => {
    const item = {
      img: cutUrl, hex: primary.hex, color: colorName, colors, type, subtype, pattern,
      material: rec.material || '', style: rec.style || '', season: SEASON_BY_TYPE[type] || 'Todo el año',
      name: `${subtype || type} ${colorName.toLowerCase()}`, brand: '', notes: '',
      visionAt: rec.confidence != null ? Date.now() : undefined, visionConfidence: pct ?? undefined,
      scanned: true,
    };
    closeSheet();
    setTimeout(() => onAdd(item), 260);
  });
}
