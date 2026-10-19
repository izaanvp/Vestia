// Tu cara en el maniquí: encuentra tu cara (MediaPipe, en el móvil), recorta tu cabeza entera con el
// pelo (analizador de personas + recorte por IA si lo tienes activado) y la coloca sobre el maniquí.
// Trae una herramienta para retocar el recorte con el dedo. La foto no sale de tu iPhone.
import * as db from './db.js';
import * as CU from './cutout.js';
import { parse, parserReady, loadParser, guided, applyAlpha, C } from './parse.js';
import { setHead, mannequinSVG, bodyOf } from './fitting.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON, pickFile, prepareImage } from './core.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// Contorno de la cara (malla de MediaPipe), de la frente hacia la derecha y vuelta
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
let landmarker = null;

export async function loadHead() {
  try { state.headPhoto = (await db.getAll('media')).find((m) => m.id === 'head') || null; } catch { state.headPhoto = null; }
  setHead(state.headPhoto);
}

async function loadFace() {
  if (landmarker) return landmarker;
  const { FilesetResolver, FaceLandmarker } = await import(`${MP}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const make = (delegate) => FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'IMAGE', numFaces: 1 });
  try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
  return landmarker;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Puntos de la cara en la foto. En una foto de cuerpo entero la cara es pequeña y el detector no la ve:
// entonces se busca primero la cabeza (cara + pelo) con el analizador y se amplía esa zona.
async function findFace(src, onStep) {
  const lm = await loadFace();
  const toPts = (L, sx, sy, ox = 0, oy = 0) => L.map((p) => ({ x: ox + p.x * sx, y: oy + p.y * sy }));
  const direct = lm.detect(src).faceLandmarks?.[0];
  if (direct) return toPts(direct, src.width, src.height);
  onStep(parserReady() ? 'Buscando tu cabeza en la foto entera…' : 'Descargando el analizador (solo la primera vez, ~29 MB)…');
  const P = await parse(src);
  const b = P.box([C.Face]) || P.box([C.Face, C.Hair]);
  if (!b) throw new Error('No encuentro tu cara. Usa una foto de frente, con buena luz y la cara despejada.');
  const side = Math.max(b.w, b.h) * 2.6, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const x0 = cx - side / 2, y0 = cy - side / 2, k = 640 / side;
  const z = document.createElement('canvas'); z.width = 640; z.height = 640;
  const zx = z.getContext('2d'); zx.imageSmoothingQuality = 'high';
  zx.drawImage(src, x0, y0, side, side, 0, 0, 640, 640);
  const L = lm.detect(z).faceLandmarks?.[0];
  if (!L) throw new Error('No encuentro tu cara. Usa una foto de frente, con buena luz y la cara despejada.');
  return toPts(L, side, side, x0, y0);
}
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Recorta la cabeza de una foto. Devuelve lo necesario para el editor y para colocarla en el maniquí.
export async function cutHead(src, onStep = () => {}) {
  onStep('Buscando tu cara…');
  const pts = await findFace(src, onStep);
  const eL = pts[33], eR = pts[263], chin = pts[152], brow = pts[10];
  const roll = Math.atan2(eR.y - eL.y, eR.x - eL.x);
  const mid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 };
  const faceH = dist(brow, chin), faceW = dist(pts[234], pts[454]);
  if (faceW < 24) throw new Error('Tu cara sale muy pequeña en la foto. Acércate un poco más (o usa un selfie).');
  // Zona de la cabeza con margen para el pelo (arriba y a los lados) y para el pelo largo (abajo).
  // Se usa la foto entera: si el pelo se sale del recuadro de la cara, sigue entrando.
  const up = faceH * 1.25, down = faceH * 1.7, half = faceW * 1.7;
  const k = Math.min(1.6, 820 / Math.max(half * 2, up + down));
  const crop = document.createElement('canvas');
  crop.width = Math.round(half * 2 * k); crop.height = Math.round((up + down) * k);
  const cx = crop.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.translate(half * k, up * k); cx.scale(k, k); cx.rotate(-roll); cx.translate(-mid.x, -mid.y);
  cx.drawImage(src, 0, 0);
  cx.setTransform(1, 0, 0, 1, 0, 0);
  // Coordenadas de un punto de la foto dentro del recorte (enderezado)
  const cs = Math.cos(-roll), sn = Math.sin(-roll);
  const f = (p) => { const x = p.x - mid.x, y = p.y - mid.y; return { x: (x * cs - y * sn) * k + half * k, y: (x * sn + y * cs) * k + up * k }; };
  // ¿El pelo se sale de la foto por arriba? (aviso, no error)
  const topInSrc = mid.y - faceH * 0.95;
  const cutOff = topInSrc < 0;

  onStep(parserReady() ? 'Recortando tu cabeza…' : 'Descargando el analizador (solo la primera vez, ~29 MB)…');
  await loadParser();
  onStep('Recortando tu cabeza…');
  const P = await parse(crop);
  const W = crop.width, H = crop.height;
  const r = Math.max(3, Math.round(Math.max(W, H) / 150));
  const head = guided(crop, P.soft([C.Hair, C.Face, C.Hat, C.Sunglasses], W, H), r, 1e-3);
  const hair = guided(crop, P.soft([C.Hair, C.Hat], W, H), r, 1e-3);
  const cloth = P.soft([C['Upper-clothes'], C.Dress, C.Scarf], W, H);
  // Recorte fino del contorno (mechones de pelo) con el recorte por IA, si está disponible
  let m = null;
  if (CU.mlReady() || state.profile.cutoutAI) {
    try { onStep('Afinando el contorno del pelo…'); m = await CU.matte(crop); } catch { m = null; }
  }
  // Mandíbula: por debajo de ella solo queda el pelo (el cuello lo pone el maniquí)
  const oval = OVAL.map((i) => f(pts[i]));
  const jaw = new Float32Array(W).fill(-1);
  for (let i = 0; i < oval.length; i++) {
    const a = oval[i], b = oval[(i + 1) % oval.length];
    const x0 = Math.ceil(Math.min(a.x, b.x)), x1 = Math.floor(Math.max(a.x, b.x));
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const t = (x - a.x) / ((b.x - a.x) || 1e-6), y = a.y + (b.y - a.y) * t;
      if (y > jaw[x]) jaw[x] = y;
    }
  }
  const ch = f(chin), margin = faceH * k * 0.035;
  const alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let a = m ? (m[i] / 255) * sstep(0.12, 0.45, head[i]) : sstep(0.3, 0.7, head[i]);
    const jy = (jaw[x] >= 0 ? jaw[x] : ch.y) + margin;
    if (y > jy - 2) {
      const t = sstep(jy - 2, jy + 3, y);
      // Por debajo de la mandíbula solo el pelo (nunca la ropa de la foto)
      const hA = (m ? (m[i] / 255) * sstep(0.25, 0.6, hair[i]) : sstep(0.35, 0.65, hair[i])) * (1 - sstep(0.35, 0.65, cloth[i]));
      a = a * (1 - t) + Math.min(a, hA) * t;
    }
    alpha[i] = a;
  }
  return finish({ base: crop, alpha, eye: f(mid), chin: f(chin), faceW: faceW * k, cutOff });
}

// Aplica la máscara y calcula los puntos de anclaje en la imagen final
function finish(h) {
  const res = applyAlpha(h.base, h.alpha, { pad: 0.02, maxSide: 640 });
  if (!res) throw new Error('No he podido separar tu cabeza del fondo. Prueba con otra foto.');
  const { box } = res;
  const at = (p) => [(p.x - box.x) * box.k, (p.y - box.y) * box.k];
  // Bordes: el color de los píxeles semitransparentes se toma del interior (sin halo del fondo)
  decontaminate(res.canvas);
  return { ...h, canvas: res.canvas, rec: { eye: at(h.eye), chin: at(h.chin), faceW: h.faceW * box.k, w: res.canvas.width, h: res.canvas.height } };
}
function decontaminate(c) {
  const W = c.width, H = c.height, x = c.getContext('2d', { willReadFrequently: true });
  const img = x.getImageData(0, 0, W, H), d = img.data, a0 = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) a0[i] = d[i * 4 + 3];
  for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
    const i = y * W + xx;
    if (a0[i] === 0 || a0[i] > 235) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (y + dy) * W + xx + dx;
      if (j >= 0 && j < W * H && a0[j] > 235) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++; }
    }
    if (n) { d[i * 4] = r / n; d[i * 4 + 1] = g / n; d[i * 4 + 2] = b / n; }
  }
  x.putImageData(img, 0, 0);
}

// ---------- Hoja: poner tu cara ----------
export function openHeadTool(source = null, onDone = () => {}) {
  const has = state.headPhoto;
  const sheet = openSheet(`
    <p class="eyebrow accent">${ICON.person} Tu cara en el maniquí</p>
    <h3 class="detail-title">Un mini tú que se prueba tu ropa</h3>
    <div id="htBody">
      ${has ? `<div class="bp-current"><img src="${has.src}" alt="Tu cabeza recortada" class="ht-thumb"><div><b>Tu cara ya está en el maniquí</b><p class="small muted">Puedes retocar el recorte o cambiar la foto.</p></div></div>` : ''}
      <ul class="bp-tips">
        <li>Una foto <b>de frente</b>, con <b>buena luz</b> y la cara despejada.</li>
        <li>Que se vea <b>toda tu cabeza</b>, con el pelo. Si en un selfie se corta, usa una foto de más lejos (incluso de cuerpo entero): Vestia busca tu cabeza en la foto entera.</li>
      </ul>
      <p class="small muted">Tu foto no sale de tu iPhone. La primera vez se descargan el detector de caras (~4 MB) y el analizador (~29 MB).</p>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost" id="htGallery">${ICON.image} Elegir foto</button>
        <button class="btn primary" id="htCamera">${ICON.camera} Hacer selfie</button>
      </div>
      ${has ? `<div class="row" style="margin-top:8px"><button class="btn danger" id="htDel">Quitar mi cara</button><button class="btn navy" id="htEdit">Retocar recorte</button></div>
        <label class="switch" style="margin-top:8px"><span>Usar mi cara en el maniquí</span><input type="checkbox" id="htOn" ${state.profile.headOn ? 'checked' : ''}></label>` : ''}
    </div>`);
  sheet.classList.add('sheet-tall');
  const host = $('#htBody', sheet);
  const run = async (canvas) => {
    host.innerHTML = `<div class="ht-progress"><span class="spinner"></span><p id="htStep">Preparando…</p></div>`;
    try {
      const res = await cutHead(canvas, (t) => { const el = $('#htStep', host); if (el) el.textContent = t; });
      if (res.cutOff) toast('Tu pelo se sale de la foto por arriba: si quieres la cabeza entera, haz la foto un poco más lejos');
      editor(host, res, onDone);
    } catch (e) {
      host.innerHTML = `<p class="notice">${esc(e.message)}</p><button class="btn primary block" id="htRetry">Probar con otra foto</button>`;
      $('#htRetry', host).addEventListener('click', () => openHeadTool(null, onDone));
    }
  };
  if (source) { run(source); return; }
  const pick = async (capture) => {
    const f = await pickFile('image/*', capture);
    if (f) run((await prepareImage(f, 1600)).canvas);
  };
  $('#htGallery', sheet).addEventListener('click', () => pick(false));
  $('#htCamera', sheet).addEventListener('click', () => pick('user'));
  $('#htOn', sheet)?.addEventListener('change', (e) => { state.profile.headOn = e.target.checked; saveProfile(); onDone(); });
  $('#htDel', sheet)?.addEventListener('click', async () => {
    await db.remove('media', 'head'); state.headPhoto = null; setHead(null);
    state.profile.headOn = false; saveProfile();
    toast('Tu cara se ha quitado del maniquí'); closeSheet(); onDone();
  });
  $('#htEdit', sheet)?.addEventListener('click', async () => {
    const h = state.headPhoto;
    const base = await loadCanvas(h.base), am = await loadCanvas(h.alpha);
    const ad = am.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, am.width, am.height).data;
    const alpha = new Float32Array(am.width * am.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = ad[i * 4] / 255;
    editor(host, finish({ base, alpha, eye: { x: h.anchors.eye[0], y: h.anchors.eye[1] }, chin: { x: h.anchors.chin[0], y: h.anchors.chin[1] }, faceW: h.anchors.faceW }), onDone, h.adj);
  });
}
const loadCanvas = (src) => new Promise((ok, ko) => {
  const i = new Image();
  i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); ok(c); };
  i.onerror = ko; i.src = src;
});

// Herramienta de retoque: borrar o recuperar con el dedo, tamaño y altura en el maniquí, vista previa
function editor(host, res, onDone, adj0 = null) {
  const { base } = res;
  const W = base.width, H = base.height;
  const alpha = Float32Array.from(res.alpha), orig = Float32Array.from(res.alpha);
  const undo = [];
  let tool = 'erase', size = 22, cur = res, adj = { scale: adj0?.scale || 1, dy: adj0?.dy || 0 };
  host.innerHTML = `
    <div class="ht-wrap">
      <div class="ht-edit"><canvas id="htCanvas" width="${W}" height="${H}"></canvas></div>
      <div class="ht-prev" id="htPrev"></div>
    </div>
    <div class="seg" style="margin:10px 0 6px"><button data-tool="erase" class="on">Borrar</button><button data-tool="restore">Recuperar</button></div>
    <label class="ht-range"><span>Pincel</span><input type="range" id="htSize" min="6" max="70" value="${size}"></label>
    <div class="row" style="margin:4px 0 8px"><button class="btn ghost" id="htUndo">Deshacer</button><button class="btn ghost" id="htReset">Recorte original</button></div>
    <label class="ht-range"><span>Tamaño</span><input type="range" id="htScale" min="80" max="125" value="${Math.round(adj.scale * 100)}"></label>
    <label class="ht-range"><span>Altura</span><input type="range" id="htDy" min="-10" max="10" value="${adj.dy}"></label>
    <p class="small muted">Pasa el dedo por la foto para borrar lo que sobra (fondo, cuello, ropa) o recuperar pelo que falte.</p>
    <button class="btn primary block" id="htSave">${ICON.check} Poner en mi maniquí</button>`;
  const cv = $('#htCanvas', host), ctx = cv.getContext('2d', { willReadFrequently: true });
  const bd = base.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
  const out = ctx.createImageData(W, H);
  const draw = () => {
    for (let i = 0; i < W * H; i++) {
      const a = alpha[i], x = i % W, y = (i / W) | 0;
      const chk = ((x >> 4) + (y >> 4)) & 1 ? 236 : 252; // cuadros de fondo transparente
      out.data[i * 4] = bd.data[i * 4] * a + chk * (1 - a);
      out.data[i * 4 + 1] = bd.data[i * 4 + 1] * a + chk * (1 - a);
      out.data[i * 4 + 2] = bd.data[i * 4 + 2] * a + chk * (1 - a);
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  };
  const preview = () => {
    cur = finish({ ...res, alpha });
    const tmp = { ...cur.rec, src: cur.canvas.toDataURL('image/png'), adj };
    setHead(tmp);
    $('#htPrev', host).innerHTML = mannequinSVG({ skin: state.profile.skin?.hex || '#d4a37f', body: { ...bodyOf(state.profile), headOn: true, pose: 'relajada' }, worn: {} });
    setHead(state.headPhoto);
    return tmp;
  };
  draw(); preview();
  // Pincel
  let painting = false;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height), W / r.width]; };
  const brush = (e) => {
    const [px, py, sc] = at(e), R = size * sc;
    const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(W - 1, Math.ceil(px + R)), y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(H - 1, Math.ceil(py + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - px, y - py); if (d > R) continue;
      const w = 1 - sstep(R * 0.55, R, d), i = y * W + x;
      alpha[i] = tool === 'erase' ? alpha[i] * (1 - w) : alpha[i] + (1 - alpha[i]) * w;
    }
    draw();
  };
  cv.addEventListener('pointerdown', (e) => { painting = true; try { cv.setPointerCapture(e.pointerId); } catch { /* sin captura */ } undo.push(Float32Array.from(alpha)); if (undo.length > 15) undo.shift(); brush(e); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (painting) { brush(e); e.preventDefault(); } });
  const end = () => { if (painting) { painting = false; preview(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.style.touchAction = 'none';
  $$('[data-tool]', host).forEach((b) => b.addEventListener('click', () => { tool = b.dataset.tool; $$('[data-tool]', host).forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#htSize', host).addEventListener('input', (e) => { size = +e.target.value; });
  $('#htUndo', host).addEventListener('click', () => { const u = undo.pop(); if (u) { alpha.set(u); draw(); preview(); } });
  $('#htReset', host).addEventListener('click', () => { undo.push(Float32Array.from(alpha)); alpha.set(orig); draw(); preview(); });
  $('#htScale', host).addEventListener('input', (e) => { adj.scale = +e.target.value / 100; preview(); });
  $('#htDy', host).addEventListener('input', (e) => { adj.dy = +e.target.value; preview(); });
  $('#htSave', host).addEventListener('click', async () => {
    const tmp = preview();
    // Se guardan también la foto base y la máscara para poder retocar más tarde
    const am = document.createElement('canvas'); am.width = W; am.height = H;
    const ax = am.getContext('2d'), aid = ax.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const v = Math.round(alpha[i] * 255); aid.data[i * 4] = aid.data[i * 4 + 1] = aid.data[i * 4 + 2] = v; aid.data[i * 4 + 3] = 255; }
    ax.putImageData(aid, 0, 0);
    const rec = {
      id: 'head', ...tmp, at: Date.now(),
      base: base.toDataURL('image/jpeg', 0.9), alpha: am.toDataURL('image/png'),
      anchors: { eye: [res.eye.x, res.eye.y], chin: [res.chin.x, res.chin.y], faceW: res.faceW },
    };
    await db.put('media', rec);
    state.headPhoto = rec; setHead(rec);
    state.profile.headOn = true; saveProfile();
    toast('¡Listo! Tu maniquí ya tiene tu cara');
    closeSheet(); onDone();
  });
}
