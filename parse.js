// Análisis de personas en una foto: qué píxeles son pelo, cara, parte de arriba, pantalón, falda,
// vestido, zapatos, bolso… (modelo SegFormer B2 entrenado con fotos de moda, ~29 MB, se descarga
// una vez y funciona dentro del iPhone). Se usa para recortar tu cabeza y para sacar las prendas
// de una foto de cuerpo entero con cualquier fondo.

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/segformer_b2_clothes';
export const LABELS = ['Background', 'Hat', 'Hair', 'Sunglasses', 'Upper-clothes', 'Skirt', 'Pants', 'Dress', 'Belt', 'Left-shoe', 'Right-shoe', 'Face', 'Left-leg', 'Right-leg', 'Left-arm', 'Right-arm', 'Bag', 'Scarf'];
export const C = Object.fromEntries(LABELS.map((l, i) => [l, i]));
let T = null, model = null, processor = null, loading = null;

export const parserReady = () => !!model;
export function loadParser(onProgress = () => {}) {
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
    // En el procesador (la versión para la gráfica falla al analizar y deja el motor inutilizable)
    model = await T.AutoModelForSemanticSegmentation.from_pretrained(MODEL, { dtype: 'q8', progress_callback });
    processor = await T.AutoProcessor.from_pretrained(MODEL);
    onProgress(1);
    return true;
  })().catch((e) => { loading = null; model = null; throw e; });
  return loading;
}

// Analiza la foto. Devuelve probabilidades por clase en una rejilla pequeña (la del modelo) y
// funciones para obtener máscaras suaves al tamaño que se quiera.
export async function parse(canvas) {
  await loadParser();
  const image = T.RawImage.fromCanvas ? T.RawImage.fromCanvas(canvas) : await T.RawImage.read(canvas.toDataURL('image/jpeg', 0.92));
  const inputs = await processor(image);
  const { logits } = await model(inputs);
  const [, K, h, w] = logits.dims;
  const L = logits.data instanceof Float32Array ? logits.data : Float32Array.from(logits.data);
  // Probabilidades (softmax) en cada celda
  const prob = new Float32Array(K * h * w);
  for (let i = 0; i < h * w; i++) {
    let m = -Infinity;
    for (let k = 0; k < K; k++) m = Math.max(m, L[k * h * w + i]);
    let s = 0;
    for (let k = 0; k < K; k++) { const e = Math.exp(L[k * h * w + i] - m); prob[k * h * w + i] = e; s += e; }
    for (let k = 0; k < K; k++) prob[k * h * w + i] /= s;
  }
  // Etiqueta ganadora por celda (para contar qué hay en la foto)
  const label = new Uint8Array(h * w);
  for (let i = 0; i < h * w; i++) { let best = 0; for (let k = 1; k < K; k++) if (prob[k * h * w + i] > prob[best * h * w + i]) best = k; label[i] = best; }
  return {
    K, w, h, prob, label, W: canvas.width, H: canvas.height,
    // Suma de probabilidades de varias clases, ampliada (bilineal) a W × H
    soft(classes, W = canvas.width, H = canvas.height) {
      const lo = new Float32Array(w * h);
      for (const k of classes) for (let i = 0; i < w * h; i++) lo[i] += prob[k * h * w + i];
      return upsample(lo, w, h, W, H);
    },
    // Lo mismo, pero solo para un recuadro de la foto (x0, y0, bw, bh) muestreado a W × H
    softBox(classes, x0, y0, bw, bh, W, H) {
      const lo = new Float32Array(w * h);
      for (const k of classes) for (let i = 0; i < w * h; i++) lo[i] += prob[k * h * w + i];
      const out = new Float32Array(W * H), fx = w / canvas.width, fy = h / canvas.height;
      for (let y = 0; y < H; y++) {
        const sy = Math.max(0, Math.min(h - 1.001, (y0 + ((y + 0.5) * bh) / H) * fy - 0.5)), yy = Math.floor(sy), ty = sy - yy;
        for (let x = 0; x < W; x++) {
          const sx = Math.max(0, Math.min(w - 1.001, (x0 + ((x + 0.5) * bw) / W) * fx - 0.5)), xx = Math.floor(sx), tx = sx - xx, i = yy * w + xx;
          out[y * W + x] = (lo[i] * (1 - tx) + lo[i + 1] * tx) * (1 - ty) + (lo[i + w] * (1 - tx) + lo[i + w + 1] * tx) * ty;
        }
      }
      return out;
    },
    // Caja de una clase en coordenadas de la foto (o null si apenas aparece)
    box(classes, minFrac = 0.002) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (classes.includes(label[y * w + x])) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (n < w * h * minFrac) return null;
      const sx = canvas.width / w, sy = canvas.height / h;
      return { x: x0 * sx, y: y0 * sy, w: (x1 - x0 + 1) * sx, h: (y1 - y0 + 1) * sy, frac: n / (w * h) };
    },
  };
}

export function upsample(lo, w, h, W, H) {
  const out = new Float32Array(W * H);
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(h - 1.001, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(w - 1.001, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
      const i = y0 * w + x0;
      out[y * W + x] = (lo[i] * (1 - tx) + lo[i + 1] * tx) * (1 - ty) + (lo[i + w] * (1 - tx) + lo[i + w + 1] * tx) * ty;
    }
  }
  return out;
}

// Filtro guiado (He et al.): ajusta una máscara borrosa a los bordes reales de la foto
// (pelo, cuellos, mangas). guide: canvas del mismo tamaño que la máscara.
export function guided(guide, p, r = 6, eps = 2e-3) {
  const W = guide.width, H = guide.height, N = W * H;
  const d = guide.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const I = new Float32Array(N);
  for (let i = 0; i < N; i++) I[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  const box = (src) => {
    // Media en una ventana (2r+1)² con sumas acumuladas por filas y columnas
    const tmp = new Float32Array(N), out = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      let s = 0; const o = y * W;
      for (let x = -r; x <= r; x++) s += src[o + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) { tmp[o + x] = s; s += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
    }
    const k = 1 / ((2 * r + 1) * (2 * r + 1));
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) { out[y * W + x] = s * k; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
    }
    return out;
  };
  const mI = box(I), mp = box(p);
  const II = new Float32Array(N), Ip = new Float32Array(N);
  for (let i = 0; i < N; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mII = box(II), mIp = box(Ip);
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) { const v = mII[i] - mI[i] * mI[i], c = mIp[i] - mI[i] * mp[i]; a[i] = c / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
  const ma = box(a), mb = box(b);
  const q = new Float32Array(N);
  for (let i = 0; i < N; i++) q[i] = Math.max(0, Math.min(1, ma[i] * I[i] + mb[i]));
  return q;
}

// Lienzo con la foto recortada por una máscara (0..1); recorta al contorno con un margen
export function applyAlpha(canvas, alpha, { pad = 0.04, maxSide = 900 } = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) {
    const a = Math.round(alpha[i] * 255);
    img.data[i * 4 + 3] = Math.min(img.data[i * 4 + 3], a);
    if (a > 40) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return null;
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(img, 0, 0);
  const pd = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
  x0 = Math.max(0, x0 - pd); y0 = Math.max(0, y0 - pd); x1 = Math.min(W - 1, x1 + pd); y1 = Math.min(H - 1, y1 + pd);
  const k = Math.min(1, maxSide / Math.max(x1 - x0 + 1, y1 - y0 + 1));
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0 + 1) * k); out.height = Math.round((y1 - y0 + 1) * k);
  const o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
  o.drawImage(tmp, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  return { canvas: out, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, k } };
}

// ---------- Fotos de tienda con modelo ----------
// Si en la foto de una prenda sale una persona (cara, pelo, brazos, piernas), deja solo la prenda.
const CAT_CLASSES = {
  tee: ['Upper-clothes'], shirt: ['Upper-clothes'], knit: ['Upper-clothes', 'Scarf'], jacket: ['Upper-clothes', 'Dress', 'Skirt', 'Scarf', 'Belt'],
  pants: ['Pants'], shorts: ['Pants', 'Skirt'], skirt: ['Skirt'], dress: ['Dress', 'Upper-clothes', 'Skirt', 'Belt'],
  shoes: ['Left-shoe', 'Right-shoe'], bag: ['Bag'],
};
const PERSON = ['Hair', 'Face', 'Left-arm', 'Right-arm', 'Left-leg', 'Right-leg', 'Sunglasses'];
const CLOTHES = ['Upper-clothes', 'Skirt', 'Pants', 'Dress', 'Left-shoe', 'Right-shoe', 'Bag', 'Scarf', 'Hat', 'Belt'];
// Comprobación rápida: ¿hay bastante piel en el recorte? (para no analizar cada prenda extendida)
export function hasSkin(canvas) {
  const S = 96, k = S / Math.max(canvas.width, canvas.height);
  const c = document.createElement('canvas'); c.width = Math.max(4, Math.round(canvas.width * k)); c.height = Math.max(4, Math.round(canvas.height * k));
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0, s = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    n++;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb >= 77 && cb <= 127 && cr >= 137 && cr <= 175 && r > g && r - b > 18) s++;
  }
  return n ? s / n > 0.025 : false;
}
export async function isolateGarment(cut, catId = 'auto') {
  const W = cut.width, H = cut.height;
  const flat = document.createElement('canvas'); flat.width = W; flat.height = H;
  const fx = flat.getContext('2d', { willReadFrequently: true }); fx.fillStyle = '#fff'; fx.fillRect(0, 0, W, H); fx.drawImage(cut, 0, 0);
  const alpha = cut.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const P = await parse(flat);
  // Cuántas celdas de cada clase caen dentro de la prenda recortada
  const cnt = new Array(LABELS.length).fill(0);
  let total = 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const px = Math.min(W - 1, Math.floor(((x + 0.5) / P.w) * W)), py = Math.min(H - 1, Math.floor(((y + 0.5) / P.h) * H));
    if (alpha[(py * W + px) * 4 + 3] < 128) continue;
    total++; cnt[P.label[y * P.w + x]]++;
  }
  if (!total) return null;
  let keep = CAT_CLASSES[catId];
  if (!keep) { const best = CLOTHES.reduce((x, l) => (cnt[C[l]] > cnt[C[x]] ? l : x), 'Upper-clothes'); keep = best === 'Dress' ? CAT_CLASSES.dress : best.endsWith('shoe') ? CAT_CLASSES.shoes : [best]; }
  // Lo que sobra: la persona (piel, pelo) y las demás prendas que lleva (camiseta, zapatos, cinturón…)
  const drop = [...PERSON, ...CLOTHES.filter((l) => !keep.includes(l))];
  const person = drop.reduce((x, l) => x + cnt[C[l]], 0) / total;
  const garment = keep.reduce((x, l) => x + cnt[C[l]], 0) / total;
  if (person < 0.02 || garment < 0.15) return null; // no hay nadie, o no se ve la prenda: se queda como estaba
  // Solo se quita lo que el analizador ve con claridad (si duda, se queda: así no salen agujeros)
  const q = guided(flat, P.soft(drop.map((l) => C[l]), W, H), Math.max(2, Math.round(Math.max(W, H) / 170)), 1e-3);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ox = out.getContext('2d', { willReadFrequently: true });
  ox.drawImage(cut, 0, 0);
  const img = ox.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) {
    // Corte decidido (sin zonas a medias que parezcan fantasmas)
    const t = Math.max(0, Math.min(1, (q[i] - 0.4) / 0.14)), a = 1 - t * t * (3 - 2 * t);
    const v = img.data[i * 4 + 3] * a;
    img.data[i * 4 + 3] = v < 50 ? 0 : Math.round(v);
  }
  ox.putImageData(img, 0, 0);
  return { canvas: out, removed: person };
}
