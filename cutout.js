// Recorte de prendas: elimina el fondo de una foto y deja solo la prenda, con bordes limpios.
// Dos métodos:
//  · IA (RMBG-1.4, se ejecuta en el dispositivo; ~44 MB que se descargan una vez).
//  · Rápido (sin descargas): detecta el fondo desde los bordes de la foto. Funciona bien con fondos lisos.
import * as C from './color.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'briaai/RMBG-1.4';
let T = null, model = null, processor = null, loading = null;

export const mlReady = () => !!model;

export function loadML(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    T = await import(LIB);
    T.env.allowLocalModels = false;
    const files = {};
    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = p.loaded / p.total;
        const v = Object.values(files);
        onProgress(v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1));
      }
    };
    // En iPhone con iOS 26 se usa la gráfica (WebGPU), mucho más rápida; si no, el procesador.
    const opts = { config: { model_type: 'custom' }, dtype: 'q8', progress_callback };
    if (navigator.gpu) {
      try { model = await T.AutoModel.from_pretrained(MODEL, { ...opts, device: 'webgpu', dtype: 'fp16' }); } catch { model = null; }
    }
    model ||= await T.AutoModel.from_pretrained(MODEL, opts);
    processor = await T.AutoProcessor.from_pretrained(MODEL, {
      config: {
        do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2,
        rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 },
      },
    });
    onProgress(1);
    return true;
  })().catch((e) => { loading = null; model = null; throw e; });
  return loading;
}

// ---------- Utilidades de imagen ----------
const lab = (r, g, b) => C.rgbToLab(r, g, b);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function hasTransparency(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const s = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 40));
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let t = 0, n = 0;
  for (let y = 0; y < canvas.height; y += s) for (let x = 0; x < canvas.width; x += s) { n++; if (d[(y * canvas.width + x) * 4 + 3] < 200) t++; }
  return t / n > 0.03;
}

// Máscara por IA: devuelve Uint8 (0–255) del tamaño de la imagen.
async function maskML(canvas) {
  if (!model) await loadML();
  const image = T.RawImage.fromCanvas ? T.RawImage.fromCanvas(canvas) : await T.RawImage.read(canvas.toDataURL('image/jpeg', 0.92));
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const m = await T.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(canvas.width, canvas.height);
  return m.data;
}

// Máscara rápida: inunda desde los bordes todo lo que se parece al fondo.
function maskQuick(canvas, sensitivity = 1) {
  const W = canvas.width, H = canvas.height;
  const k = Math.min(1, 240 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const L = new Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);

  // Modelos de color del fondo a partir del borde (hasta 4 grupos).
  const border = [];
  for (let x = 0; x < w; x++) border.push(L[x], L[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) border.push(L[y * w], L[y * w + w - 1]);
  const centers = [];
  for (const p of border) {
    const c0 = centers.find((cc) => dist(cc.v, p) < 14);
    if (c0) { c0.n++; c0.v = c0.v.map((v, i) => v + (p[i] - v) / c0.n); } else centers.push({ v: [...p], n: 1 });
  }
  const bg = centers.sort((a, b) => b.n - a.n).filter((cc) => cc.n > border.length * 0.04).slice(0, 4).map((cc) => cc.v);
  const tol = 15 * sensitivity, step = 9 * sensitivity;

  const isBg = new Uint8Array(w * h);
  const queue = [];
  const near = (i) => bg.some((b) => dist(L[i], b) < tol);
  const push = (i) => { if (!isBg[i] && near(i)) { isBg[i] = 1; queue.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (queue.length) {
    const i = queue.pop(), x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      // No cruzar bordes fuertes (el contorno de la prenda).
      if (!isBg[j] && dist(L[i], L[j]) < step && near(j)) { isBg[j] = 1; queue.push(j); }
    }
  }
  // Huecos cerrados (el interior de un asa, entre las piernas…): zonas grandes del color del fondo.
  const seen = new Uint8Array(w * h);
  const strict = (i) => bg.some((b) => dist(L[i], b) < tol * 0.7);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (isBg[s0] || seen[s0] || !strict(s0)) continue;
    const region = [s0], st = [s0]; seen[s0] = 1;
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && !isBg[j] && strict(j)) { seen[j] = 1; st.push(j); region.push(j); }
      }
    }
    if (region.length > w * h * 0.004) region.forEach((i) => (isBg[i] = 1));
  }
  // Limpieza: cierre morfológico para tapar agujeros pequeños dentro de la prenda.
  let fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fg[i] = isBg[i] ? 0 : 255;
  fg = morph(fg, w, h, 'dilate'); fg = morph(fg, w, h, 'erode');
  // Escalar la máscara al tamaño original
  const small = document.createElement('canvas'); small.width = w; small.height = h;
  const sctx = small.getContext('2d');
  const sd = sctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { sd.data[i * 4] = sd.data[i * 4 + 1] = sd.data[i * 4 + 2] = 255; sd.data[i * 4 + 3] = fg[i]; }
  sctx.putImageData(sd, 0, 0);
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, W, H);
  const bdata = bctx.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = bdata[i * 4 + 3];
  return out;
}

function morph(m, w, h, op) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = op === 'dilate' ? 0 : 255;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy));
      const p = m[ny * w + nx];
      v = op === 'dilate' ? Math.max(v, p) : Math.min(v, p);
    }
    out[y * w + x] = v;
  }
  return out;
}

// Se queda con la pieza principal (y piezas grandes, como el segundo zapato) y elimina motas sueltas.
function keepMainParts(mask, W, H) {
  const k = Math.min(1, 200 / Math.max(W, H));
  const w = Math.max(4, Math.round(W * k)), h = Math.max(4, Math.round(H * k));
  const lab_ = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const at = (x, y) => mask[Math.min(H - 1, Math.round(y / k)) * W + Math.min(W - 1, Math.round(x / k))] > 110;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (lab_[i] !== -1 || !at(x, y)) continue;
    const id = sizes.length; let n = 0; const st = [i]; lab_[i] = id;
    while (st.length) {
      const j = st.pop(); n++;
      const jx = j % w, jy = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (lab_[q] === -1 && at(nx, ny)) { lab_[q] = id; st.push(q); }
      }
    }
    sizes.push(n);
  }
  if (!sizes.length) return mask;
  const max = Math.max(...sizes);
  const keep = new Set(sizes.map((s, i) => (s >= max * 0.18 ? i : -1)).filter((i) => i >= 0));
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mask[i]) continue;
    const sx = Math.min(w - 1, Math.round(x * k)), sy = Math.min(h - 1, Math.round(y * k));
    const l = lab_[sy * w + sx];
    // Píxeles del borde suave (sin etiqueta) se conservan si tienen un vecino conservado
    if (l === -1 ? [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => keep.has(lab_[Math.min(h - 1, Math.max(0, sy + dy)) * w + Math.min(w - 1, Math.max(0, sx + dx))])) : keep.has(l)) out[i] = mask[i];
  }
  return out;
}

// Aplica la máscara, suaviza el borde (1 px) y recorta al contorno con un pequeño margen.
function applyMask(canvas, mask, { soft = 0.5 } = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const lo = 255 * (0.5 - soft * 0.35), hi = 255 * (0.5 + soft * 0.35);
  let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;
  for (let i = 0; i < W * H; i++) {
    const m = mask[i];
    const a = m <= lo ? 0 : m >= hi ? 255 : Math.round(((m - lo) / (hi - lo)) * 255);
    img.data[i * 4 + 3] = Math.min(img.data[i * 4 + 3], a);
    if (a > 40) { area++; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(img, 0, 0);
  if (x1 <= x0 || y1 <= y0) return { canvas: tmp, coverage: 0 };
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const k = Math.min(1, 900 / Math.max(x1 - x0, y1 - y0));
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0) * k); out.height = Math.round((y1 - y0) * k);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(tmp, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
  return { canvas: out, coverage: area / (W * H) };
}

// Recorte completo. method: 'auto' | 'ia' | 'rapido'
export async function cutout(source, { method = 'auto', sensitivity = 1, soft = 0.5, onStep = () => {}, depth = 0 } = {}) {
  const k = Math.min(1, 1400 / Math.max(source.width, source.height));
  const base = document.createElement('canvas');
  base.width = Math.round(source.width * k); base.height = Math.round(source.height * k);
  base.getContext('2d').drawImage(source, 0, 0, base.width, base.height);

  if (hasTransparency(base)) {
    onStep('ya-transparente');
    const ctx = base.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, base.width, base.height).data;
    const m = new Uint8Array(base.width * base.height);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
    return { ...applyMask(base, m, { soft: 0.1 }), method: 'png' };
  }
  let mask, used;
  if (method === 'ia' || (method === 'auto' && mlReady())) {
    onStep('ia');
    try { mask = await maskML(base); used = 'ia'; } catch { mask = null; }
  }
  if (!mask) { onStep('rapido'); mask = maskQuick(base, sensitivity); used = 'rapido'; }
  onStep('limpiando');
  mask = keepMainParts(mask, base.width, base.height);
  // ¿Ha recortado un rectángulo (una foto, una pantalla o una cartulina con la prenda encima)?
  // Entonces la prenda está dentro: se endereza ese rectángulo y se recorta otra vez solo su interior.
  const box = rectOf(mask, base.width, base.height);
  if (!depth && box && box.rect && box.area < 0.95 * base.width * base.height) {
    const ang = rectAngle(mask, base.width, box);
    let img = base, m = mask, bx = box;
    if (Math.abs(ang) > 0.4) {
      img = rotateBy(base, -ang);
      m = rotateMask(mask, base.width, base.height, -ang, img.width, img.height);
      bx = rectOf(m, img.width, img.height) || box;
    }
    const ix = Math.round(bx.w * 0.025), iy = Math.round(bx.h * 0.025);
    const crop = document.createElement('canvas');
    crop.width = bx.w - 2 * ix; crop.height = bx.h - 2 * iy;
    crop.getContext('2d').drawImage(img, bx.x + ix, bx.y + iy, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const W = crop.width, H = crop.height, mg = 0.015;
    // Vale si dentro hay algo claramente más pequeño que la foto y que no toca casi sus bordes
    const ok = (mk) => {
      const ib = rectOf(mk, W, H);
      if (!ib) return false;
      const touches = [ib.x <= W * mg, ib.y <= H * mg, ib.x + ib.w >= W * (1 - mg), ib.y + ib.h >= H * (1 - mg)].filter(Boolean).length;
      const cover = ib.n / (W * H);
      // …y que sea una forma sólida (no unas rayas o trozos sueltos de la propia prenda)
      return cover > 0.06 && cover < 0.8 && touches <= 2 && ib.fill > 0.42;
    };
    const tries = [];
    if (used === 'ia') tries.push(async () => maskML(crop));
    tries.push(async () => maskQuick(crop, sensitivity));
    for (const t of tries) {
      let inner = null;
      try { inner = keepMainParts(await t(), W, H); } catch { inner = null; }
      if (inner && ok(inner)) return { ...applyMask(crop, inner, { soft }), method: used, nested: true };
    }
  }
  const res = applyMask(base, mask, { soft });
  return { ...res, method: used };
}

// Caja del primer plano y si es un rectángulo de bordes rectos (filas y columnas casi llenas,
// admitiendo un pequeño giro), como una foto o una pantalla
function rectOf(mask, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x] > 128) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  let fullRows = 0, fullCols = 0;
  for (let y = y0; y <= y1; y++) { let c = 0; for (let x = x0; x <= x1; x++) if (mask[y * W + x] > 128) c++; if (c >= w * 0.9) fullRows++; }
  for (let x = x0; x <= x1; x++) { let c = 0; for (let y = y0; y <= y1; y++) if (mask[y * W + x] > 128) c++; if (c >= h * 0.9) fullCols++; }
  return { x: x0, y: y0, w, h, n, area: w * h, fill: n / (w * h), rect: n >= w * h * 0.8 && fullRows >= h * 0.55 && fullCols >= w * 0.55 };
}

// ---------- Análisis de color de la prenda recortada ----------
// Devuelve los colores principales [{hex, name, share}] ignorando sombras y brillos.
export function garmentColors(canvas, k = 4) {
  const S = 96;
  const c = document.createElement('canvas');
  const r = Math.min(1, S / Math.max(canvas.width, canvas.height));
  c.width = Math.max(1, Math.round(canvas.width * r)); c.height = Math.max(1, Math.round(canvas.height * r));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  // k-means en Lab
  const pts = px.map((p) => lab(...p));
  let cent = Array.from({ length: k }, (_, i) => pts[Math.floor(((i + 0.5) / k) * pts.length)]);
  const asg = new Int32Array(pts.length);
  for (let it = 0; it < 8; it++) {
    pts.forEach((p, i) => { let b = 0, bd = Infinity; cent.forEach((cc, j) => { const dd = dist(p, cc); if (dd < bd) { bd = dd; b = j; } }); asg[i] = b; });
    cent = cent.map((cc, j) => {
      const mine = pts.filter((_, i) => asg[i] === j);
      return mine.length ? [0, 1, 2].map((t) => mine.reduce((s, p) => s + p[t], 0) / mine.length) : cc;
    });
  }
  let groups = cent.map((cc, j) => {
    const idx = []; asg.forEach((a, i) => a === j && idx.push(i));
    const rgb = [0, 1, 2].map((t) => idx.reduce((s, i) => s + px[i][t], 0) / Math.max(1, idx.length));
    return { lab: cc, share: idx.length / pts.length, hex: C.rgbToHex(...rgb) };
  }).filter((g) => g.share > 0.04);
  // Une tonos casi iguales (la misma tela en luz y sombra)
  groups.sort((a, b) => b.share - a.share);
  const merged = [];
  for (const g of groups) {
    const m = merged.find((x) => Math.hypot(x.lab[1] - g.lab[1], x.lab[2] - g.lab[2]) < 9 && Math.abs(x.lab[0] - g.lab[0]) < 26);
    if (m) m.share += g.share; else merged.push({ ...g });
  }
  return merged.sort((a, b) => b.share - a.share).slice(0, 3).map((g) => ({ hex: g.hex, name: C.nearestNamed(g.hex).name, share: g.share }));
}

// Estampado por la imagen: alternancia de dos colores en filas/columnas → rayas o cuadros.
export function patternHint(canvas, colors) {
  if (colors.length < 2 || colors[1].share < 0.2 || C.deltaE(colors[0].hex, colors[1].hex) < 28) return 'Liso';
  const a = C.hexToRgb(colors[0].hex), b = C.hexToRgb(colors[1].hex);
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, canvas.width * 0.25, canvas.height * 0.3, canvas.width * 0.5, canvas.height * 0.4, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  const cls = (i) => (d[i + 3] < 200 ? -1 : Math.hypot(d[i] - a[0], d[i + 1] - a[1], d[i + 2] - a[2]) < Math.hypot(d[i] - b[0], d[i + 1] - b[1], d[i + 2] - b[2]) ? 0 : 1);
  let hx = 0, vx = 0;
  for (let y = 0; y < 64; y++) for (let x = 1; x < 64; x++) {
    const p = cls((y * 64 + x) * 4), q = cls((y * 64 + x - 1) * 4); if (p >= 0 && q >= 0 && p !== q) hx++;
    const r = cls((x * 64 + y) * 4), s = cls(((x - 1) * 64 + y) * 4); if (r >= 0 && s >= 0 && r !== s) vx++;
  }
  const H = hx / (64 * 63), V = vx / (64 * 63);
  if (H > 0.08 && V > 0.08) return 'Cuadros';
  if ((H > 0.08 && V < 0.04) || (V > 0.08 && H < 0.04)) return 'Rayas';
  return 'Liso';
}

// ---------- Acabado para el maniquí ----------
// Deja la prenda lista para "ponérsela" al maniquí: quita perchas, la endereza y limpia los bordes.
// category: 'top' | 'outer' | 'one' | 'bottom' | 'shoes' | 'bag' | 'acc'
const alphaOf = (canvas) => canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);

// Quita perchas y ganchos: filas muy estrechas por encima del cuerpo de la prenda.
function removeHanger(canvas) {
  const W = canvas.width, H = canvas.height;
  const img = alphaOf(canvas);
  const d = img.data;
  const widths = new Array(H).fill(0);
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 100) n++; widths[y] = n; }
  const max = Math.max(...widths);
  let first = -1, cut = 0;
  // Desde arriba, mientras la prenda sea un "hilo" (gancho) se descarta.
  // Solo cuenta como percha si ese hilo es largo (≥ 4 % del alto); el pico de un cuello no lo es.
  for (let y = 0; y < H * 0.3; y++) {
    if (widths[y] === 0) continue;
    if (first < 0) first = y;
    if (widths[y] < max * 0.09) cut = y + 1; else if (widths[y] > max * 0.2) break;
  }
  if (cut - first < H * 0.04) cut = 0;
  if (cut > 0) {
    for (let y = 0; y < cut; y++) for (let x = 0; x < W; x++) d[(y * W + x) * 4 + 3] = 0;
    canvas.getContext('2d').putImageData(img, 0, 0);
  }
  return cut;
}

// Ángulo que hace la prenda más simétrica (las prendas de vestir son simétricas de frente).
function symmetryAngle(canvas) {
  const S = 96;
  const k = S / Math.max(canvas.width, canvas.height);
  const w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
  const N = 128;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const score = (deg) => {
    ctx.clearRect(0, 0, N, N);
    ctx.save(); ctx.translate(N / 2, N / 2); ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(canvas, -w / 2, -h / 2, w, h); ctx.restore();
    const d = ctx.getImageData(0, 0, N, N).data;
    let sx = 0, n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 100) { sx += x; n++; }
    if (!n) return 0;
    const cx = Math.round(sx / n);
    let inter = 0, uni = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = d[(y * N + x) * 4 + 3] > 100;
      const mx = 2 * cx - x;
      const b = mx >= 0 && mx < N && d[(y * N + mx) * 4 + 3] > 100;
      if (a && b) inter++; if (a || b) uni++;
    }
    return inter / Math.max(1, uni);
  };
  const base = score(0);
  let best = 0, bestScore = base;
  for (let a = -10; a <= 10; a += 2) { if (!a) continue; const s = score(a); if (s > bestScore) { bestScore = s; best = a; } }
  for (const a of [best - 1, best + 1]) { const s = score(a); if (s > bestScore) { bestScore = s; best = a; } }
  return bestScore > base + 0.035 ? best : 0;
}

function rotateCanvas(canvas, deg) {
  const r = (deg * Math.PI) / 180;
  const W = canvas.width, H = canvas.height;
  const nw = Math.ceil(Math.abs(W * Math.cos(r)) + Math.abs(H * Math.sin(r)));
  const nh = Math.ceil(Math.abs(W * Math.sin(r)) + Math.abs(H * Math.cos(r)));
  const c = document.createElement('canvas'); c.width = nw; c.height = nh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(nw / 2, nh / 2); ctx.rotate(r); ctx.drawImage(canvas, -W / 2, -H / 2);
  return c;
}

// Limpia el borde: quita el halo del fondo (colores mezclados) y estrecha 1 px el contorno.
function cleanEdges(canvas) {
  const W = canvas.width, H = canvas.height;
  const img = alphaOf(canvas);
  const d = img.data;
  const a0 = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) a0[i] = d[i * 4 + 3];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const a = a0[i];
    if (a === 0) continue;
    // Contracción: el alfa no puede superar al vecino más transparente (+ margen)
    let mn = 255;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      mn = Math.min(mn, nx < 0 || ny < 0 || nx >= W || ny >= H ? 0 : a0[ny * W + nx]);
    }
    const na = Math.min(a, Math.round(mn * 0.6 + a * 0.4));
    d[i * 4 + 3] = na;
    // Descontaminación: los píxeles del borde toman el color del interior de la prenda
    if (na < 245) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (a0[j] > 245) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++; }
      }
      if (n) { d[i * 4] = r / n; d[i * 4 + 1] = g / n; d[i * 4 + 2] = b / n; }
    }
  }
  canvas.getContext('2d').putImageData(img, 0, 0);
}

function retrim(canvas) {
  const W = canvas.width, H = canvas.height;
  const d = alphaOf(canvas).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 30) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return canvas;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const k = Math.min(1, 900 / Math.max(x1 - x0, y1 - y0));
  const c = document.createElement('canvas');
  c.width = Math.round((x1 - x0 + 1) * k); c.height = Math.round((y1 - y0 + 1) * k);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, c.width, c.height);
  return c;
}

export function refineGarment(canvas, { category = 'top' } = {}) {
  let c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  const wearable = ['top', 'outer', 'one', 'bottom'].includes(category);
  const notes = [];
  if (wearable) {
    if (removeHanger(c) > 0) notes.push('percha');
    const ang = symmetryAngle(c);
    if (ang) { c = rotateCanvas(c, ang); notes.push(`enderezada ${ang > 0 ? '+' : ''}${ang}°`); }
  }
  cleanEdges(c);
  return { canvas: retrim(c), notes };
}

// Inclinación del borde superior del rectángulo (en grados)
function rectAngle(mask, W, box) {
  const topAt = (x) => { for (let y = box.y; y < box.y + box.h; y++) if (mask[y * W + x] > 128) return y; return box.y; };
  const xa = Math.round(box.x + box.w * 0.15), xb = Math.round(box.x + box.w * 0.85);
  return (Math.atan2(topAt(xb) - topAt(xa), xb - xa) * 180) / Math.PI;
}
function rotateBy(canvas, deg) {
  const r = (deg * Math.PI) / 180, W = canvas.width, H = canvas.height;
  const c = document.createElement('canvas');
  c.width = Math.ceil(Math.abs(W * Math.cos(r)) + Math.abs(H * Math.sin(r)));
  c.height = Math.ceil(Math.abs(W * Math.sin(r)) + Math.abs(H * Math.cos(r)));
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(r); ctx.drawImage(canvas, -W / 2, -H / 2);
  return c;
}
function rotateMask(mask, W, H, deg, NW, NH) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) id.data[i * 4 + 3] = mask[i];
  ctx.putImageData(id, 0, 0);
  const r = rotateBy(c, deg);
  const d = r.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, NW, NH).data;
  const out = new Uint8Array(NW * NH);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
  return out;
}

