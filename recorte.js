// Recorte de prendas (sistema nuevo).
//  · Automático: quita el fondo con IA dos veces (la foto entera y luego de cerca, solo la zona de la
//    prenda, para tener más detalle en el borde), quita a la persona si sale una modelo y deja solo
//    la prenda.
//  · Con el dedo: pintas por encima de la prenda (y, si quieres, tachas lo que sobra) y SAM recorta
//    exactamente esa prenda.
//  · Pulido: el borde se ajusta a los píxeles reales de la foto (filtro guiado en color), se quita el
//    color del fondo que queda en el borde (sin halos) y se da un poco de nitidez a la prenda.
import { run, pixels } from './ia.js';
import { LABELS, C, upsample } from './parse.js';

const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export function scaled(src, maxSide = 1600) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high';
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const crop = (src, b) => {
  const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return c;
};
function bboxOf(a, W, H, thr = 0.5) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x] > thr) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n };
}
const grow = (b, k, W, H) => {
  const p = Math.round(Math.max(b.w, b.h) * k), x = Math.max(0, b.x - p), y = Math.max(0, b.y - p);
  return { x, y, w: Math.min(W, b.x + b.w + p) - x, h: Math.min(H, b.y + b.h + p) - y };
};

// ---------- Modelos ----------
export async function matte(canvas, onProgress) {
  const r = await run('matte', { image: pixels(canvas, 1024) }, { onProgress });
  const m = upsample(r.data, r.w, r.h, canvas.width, canvas.height);
  for (let i = 0; i < m.length; i++) m[i] = Math.max(0, Math.min(1, m[i]));
  return m;
}
export async function parsePhoto(canvas, onProgress) {
  const r = await run('parse', { image: pixels(canvas, 640) }, { onProgress });
  const { K, w, h, prob } = r;
  const label = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { let best = 0; for (let k = 1; k < K; k++) if (prob[k * h * w + i] > prob[best * h * w + i]) best = k; label[i] = best; }
  const sum = (classes) => { const lo = new Float32Array(w * h); for (const k of classes) for (let i = 0; i < w * h; i++) lo[i] += prob[k * h * w + i]; return lo; };
  return {
    K, w, h, prob, label,
    soft: (classes, W = canvas.width, H = canvas.height) => upsample(sum(classes), w, h, W, H),
    box(classes, minFrac = 0.002) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (classes.includes(label[y * w + x])) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (n < w * h * minFrac) return null;
      const sx = canvas.width / w, sy = canvas.height / h;
      return { x: Math.floor(x0 * sx), y: Math.floor(y0 * sy), w: Math.ceil((x1 - x0 + 1) * sx), h: Math.ceil((y1 - y0 + 1) * sy), frac: n / (w * h) };
    },
    // Puntos (en píxeles del lienzo) de las celdas más seguras de unas clases: para guiar a SAM
    points(classes, n = 8, minP = 0.6) {
      const lo = sum(classes), cells = [];
      for (let i = 0; i < w * h; i++) if (lo[i] > minP) cells.push(i);
      if (!cells.length) return [];
      const out = [], step = Math.max(1, Math.floor(cells.length / n));
      for (let j = Math.floor(step / 2); j < cells.length && out.length < n; j += step) {
        const i = cells[j], x = i % w, y = (i / w) | 0;
        out.push([((x + 0.5) / w) * canvas.width, ((y + 0.5) / h) * canvas.height]);
      }
      return out;
    },
  };
}
// Sesión de SAM para una foto: se analiza una vez y luego cada toque/trazo responde en un momento
export async function samSession(canvas, onProgress) {
  const px = pixels(canvas, 1024), key = `s${Date.now()}`;
  const encode = () => run('samEncode', { image: px, key }, { onProgress });
  await encode();
  const W = canvas.width, H = canvas.height;
  return {
    async decode(points, labels) {
      const payload = { key, points: points.map(([x, y]) => [x * px.k, y * px.k]), labels };
      let r;
      try { r = await run('samDecode', payload); } catch (e) { if (!/sin-embedding/.test(e.message)) throw e; await encode(); r = await run('samDecode', payload); }
      const f = px.k * r.scale * (r.w / 1024); // píxel del lienzo → celda de la máscara (256 × 256)
      return {
        n: r.n, scores: r.scores,
        mask(k) {
          const out = new Float32Array(W * H), o = k * r.w * r.h, m = r.masks, w = r.w, h = r.h;
          for (let y = 0; y < H; y++) {
            const fy = Math.max(0, Math.min(h - 1.001, (y + 0.5) * f - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
            for (let x = 0; x < W; x++) {
              const fx = Math.max(0, Math.min(w - 1.001, (x + 0.5) * f - 0.5)), x0 = Math.floor(fx), tx = fx - x0, i = o + y0 * w + x0;
              const v = (m[i] * (1 - tx) + m[i + 1] * tx) * (1 - ty) + (m[i + w] * (1 - tx) + m[i + w + 1] * tx) * ty;
              out[y * W + x] = 1 / (1 + Math.exp(-v));
            }
          }
          return out;
        },
      };
    },
  };
}

// ---------- Pulido del borde ----------
function boxMean(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = 0;
    for (let x = -r; x <= r; x++) s += src[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[o + x] = s; s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  const k = 1 / ((2 * r + 1) * (2 * r + 1));
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s * k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
// Filtro guiado en color (rápido: los coeficientes se calculan a menor resolución y se aplican a la foto entera)
export function guidedColor(img, p, W, H, r = 6, eps = 1e-4, sub = 2) {
  const w = Math.max(1, Math.round(W / sub)), h = Math.max(1, Math.round(H / sub)), N = w * h;
  const Ir = new Float32Array(N), Ig = new Float32Array(N), Ib = new Float32Array(N), P = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = Math.min(W - 1, Math.floor((x + 0.5) * W / w)), Y = Math.min(H - 1, Math.floor((y + 0.5) * H / h)), j = Y * W + X, i = y * w + x;
    Ir[i] = img[j * 4] / 255; Ig[i] = img[j * 4 + 1] / 255; Ib[i] = img[j * 4 + 2] / 255; P[i] = p[j];
  }
  const rr = Math.max(1, Math.round(r / sub));
  const mul = (a, b) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = a[i] * b[i]; return o; };
  const mR = boxMean(Ir, w, h, rr), mG = boxMean(Ig, w, h, rr), mB = boxMean(Ib, w, h, rr), mP = boxMean(P, w, h, rr);
  const mRP = boxMean(mul(Ir, P), w, h, rr), mGP = boxMean(mul(Ig, P), w, h, rr), mBP = boxMean(mul(Ib, P), w, h, rr);
  const vRR = boxMean(mul(Ir, Ir), w, h, rr), vRG = boxMean(mul(Ir, Ig), w, h, rr), vRB = boxMean(mul(Ir, Ib), w, h, rr);
  const vGG = boxMean(mul(Ig, Ig), w, h, rr), vGB = boxMean(mul(Ig, Ib), w, h, rr), vBB = boxMean(mul(Ib, Ib), w, h, rr);
  const aR = new Float32Array(N), aG = new Float32Array(N), aB = new Float32Array(N), bb = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const cr = mRP[i] - mR[i] * mP[i], cg = mGP[i] - mG[i] * mP[i], cb = mBP[i] - mB[i] * mP[i];
    const a11 = vRR[i] - mR[i] * mR[i] + eps, a12 = vRG[i] - mR[i] * mG[i], a13 = vRB[i] - mR[i] * mB[i];
    const a22 = vGG[i] - mG[i] * mG[i] + eps, a23 = vGB[i] - mG[i] * mB[i], a33 = vBB[i] - mB[i] * mB[i] + eps;
    // Inversa de la matriz de covarianza (simétrica 3 × 3)
    const i11 = a22 * a33 - a23 * a23, i12 = a13 * a23 - a12 * a33, i13 = a12 * a23 - a13 * a22;
    const i22 = a11 * a33 - a13 * a13, i23 = a13 * a12 - a11 * a23, i33 = a11 * a22 - a12 * a12;
    const det = a11 * i11 + a12 * i12 + a13 * i13 || 1e-12;
    aR[i] = (i11 * cr + i12 * cg + i13 * cb) / det;
    aG[i] = (i12 * cr + i22 * cg + i23 * cb) / det;
    aB[i] = (i13 * cr + i23 * cg + i33 * cb) / det;
    bb[i] = mP[i] - aR[i] * mR[i] - aG[i] * mG[i] - aB[i] * mB[i];
  }
  const qR = upsample(boxMean(aR, w, h, rr), w, h, W, H), qG = upsample(boxMean(aG, w, h, rr), w, h, W, H);
  const qB = upsample(boxMean(aB, w, h, rr), w, h, W, H), qb = upsample(boxMean(bb, w, h, rr), w, h, W, H);
  const q = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) q[i] = Math.max(0, Math.min(1, (qR[i] * img[i * 4] + qG[i] * img[i * 4 + 1] + qB[i] * img[i * 4 + 2]) / 255 + qb[i]));
  return q;
}
// Rellena colores desconocidos a partir de los conocidos (pirámide «empujar y tirar»)
function pushPull(img, wgt, W, H) {
  const levels = [];
  let w = W, h = H, c = new Float32Array(W * H * 3), a = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const k = wgt[i]; a[i] = k; c[i * 3] = img[i * 4] * k; c[i * 3 + 1] = img[i * 4 + 1] * k; c[i * 3 + 2] = img[i * 4 + 2] * k; }
  levels.push({ w, h, c, a });
  while (w > 1 || h > 1) {
    const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), c2 = new Float32Array(w2 * h2 * 3), a2 = new Float32Array(w2 * h2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = (y >> 1) * w2 + (x >> 1);
      a2[j] += a[i]; c2[j * 3] += c[i * 3]; c2[j * 3 + 1] += c[i * 3 + 1]; c2[j * 3 + 2] += c[i * 3 + 2];
    }
    w = w2; h = h2; c = c2; a = a2; levels.push({ w, h, c, a });
  }
  // De lo grueso a lo fino: cada nivel toma el color propio si lo tiene y el del nivel superior si no
  let up = null;
  for (let L = levels.length - 1; L >= 0; L--) {
    const { w: lw, h: lh, c: lc, a: la } = levels[L], col = new Float32Array(lw * lh * 3);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const i = y * lw + x, k = Math.min(1, la[i]);
      const own = la[i] > 1e-6 ? 1 / la[i] : 0;
      let pr = 0, pg = 0, pb = 0;
      if (up) { const j = (y >> 1) * up.w + (x >> 1); pr = up.col[j * 3]; pg = up.col[j * 3 + 1]; pb = up.col[j * 3 + 2]; }
      col[i * 3] = k * lc[i * 3] * own + (1 - k) * pr;
      col[i * 3 + 1] = k * lc[i * 3 + 1] * own + (1 - k) * pg;
      col[i * 3 + 2] = k * lc[i * 3 + 2] * own + (1 - k) * pb;
    }
    up = { w: lw, h: lh, col };
  }
  return up.col;
}
// Quita trocitos sueltos y rellena agujeritos (en una rejilla pequeña, rápido)
function cleanAlpha(a, W, H) {
  const k = Math.min(1, 260 / Math.max(W, H)), w = Math.max(4, Math.round(W * k)), h = Math.max(4, Math.round(H * k));
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) on[y * w + x] = a[Math.min(H - 1, Math.floor((y + 0.5) / k)) * W + Math.min(W - 1, Math.floor((x + 0.5) / k))] > 0.5 ? 1 : 0;
  const lab = new Int32Array(w * h).fill(-1), sizes = [], touches = [];
  const flood = (val) => {
    for (let s = 0; s < w * h; s++) {
      if (on[s] !== val || lab[s] !== -1) continue;
      const id = sizes.length; let n = 0, edge = false; const st = [s]; lab[s] = id;
      while (st.length) {
        const i = st.pop(), x = i % w, y = (i / w) | 0; n++;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && on[j] === val && lab[j] === -1) { lab[j] = id; st.push(j); }
      }
      sizes.push({ n, val }); touches.push(edge);
    }
  };
  flood(1); flood(0);
  const fg = sizes.filter((s) => s.val === 1), max = Math.max(0, ...fg.map((s) => s.n));
  const keep = sizes.map((s, i) => (s.val === 1 ? s.n >= max * 0.15 : !touches[i] && s.n < w * h * 0.004)); // agujeros diminutos: se rellenan
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = Math.min(h - 1, Math.floor(y * k)) * w + Math.min(w - 1, Math.floor(x * k)), id = lab[j];
    if (id < 0) continue;
    const s = sizes[id];
    if (s.val === 1 && !keep[id]) a[y * W + x] = 0;
    if (s.val === 0 && keep[id]) a[y * W + x] = 1;
  }
  return a;
}
// Pule un recorte: borde ajustado a la foto, sin halo del fondo, con nitidez. Devuelve un lienzo RGBA
export function polish(src, alpha, { sharpen = 0.4, radius } = {}) {
  const W = src.width, H = src.height;
  const img = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
  const d = img.data;
  const r = radius || Math.max(3, Math.round(Math.max(W, H) / 240));
  // 1) Borde ajustado a los colores reales, solo en una franja estrecha alrededor del contorno
  //    (dentro de la prenda no cambia nada: una raya blanca no puede volverse transparente)
  const q = guidedColor(d, alpha, W, H, r, 2e-4, 2);
  const bin = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) bin[i] = alpha[i] > 0.5 ? 1 : 0;
  const near = boxMean(bin, W, H, Math.max(2, Math.round(r * 0.8)));
  const a = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a0 = alpha[i], m = near[i];
    const band = sstep(0, 0.06, m) * sstep(0, 0.06, 1 - m);
    const v = a0 + Math.max(-0.6, Math.min(0.6, q[i] - a0)) * band;
    a[i] = sstep(0.06, 0.94, v); // borde nítido pero con antialias (1–2 px)
  }
  cleanAlpha(a, W, H);
  // 2) Colores del borde sin el fondo: F = (I − (1 − α)·B) / α, con el fondo B y el interior estimados alrededor
  const wB = new Float32Array(W * H), wF = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { wB[i] = a[i] < 0.03 ? 1 : 0; wF[i] = a[i] > 0.97 ? 1 : 0; }
  const B = pushPull(d, wB, W, H), Fp = pushPull(d, wF, W, H);
  const out = new ImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const al = a[i], o = i * 4;
    out.data[o + 3] = Math.round(al * 255);
    if (al <= 0) continue;
    if (al >= 0.97) { out.data[o] = d[o]; out.data[o + 1] = d[o + 1]; out.data[o + 2] = d[o + 2]; continue; }
    const t = sstep(0.12, 0.6, al);
    for (let ch = 0; ch < 3; ch++) {
      const un = Math.max(0, Math.min(255, (d[o + ch] - (1 - al) * B[i * 3 + ch]) / Math.max(al, 0.05)));
      out.data[o + ch] = Fp[i * 3 + ch] * (1 - t) + un * t;
    }
  }
  // 3) Nitidez suave dentro de la prenda (máscara de enfoque)
  if (sharpen > 0) {
    const s = new Uint8ClampedArray(out.data);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      if (s[i + 3] < 200) continue;
      for (let ch = 0; ch < 3; ch++) {
        const c = s[i + ch];
        const blur = (s[i + ch - 4] + s[i + ch + 4] + s[i + ch - W * 4] + s[i + ch + W * 4]) * 0.15 + c * 0.4;
        out.data[i + ch] = c + (c - blur) * sharpen;
      }
    }
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(out, 0, 0);
  return { canvas: c, alpha: a };
}
// Recorta el lienzo al contorno de la prenda con un margen y lo limita de tamaño
export function trimTo(canvas, alpha, maxSide = 1280, pad = 0.025) {
  const W = canvas.width, H = canvas.height, b = bboxOf(alpha, W, H, 0.12);
  if (!b) return canvas;
  const g = grow(b, pad, W, H), k = Math.min(1, maxSide / Math.max(g.w, g.h));
  const c = document.createElement('canvas'); c.width = Math.round(g.w * k); c.height = Math.round(g.h * k);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, g.x, g.y, g.w, g.h, 0, 0, c.width, c.height);
  return c;
}

// ---------- Solo la prenda (fotos con modelo, maniquí, otras prendas) ----------
const CAT_CLASSES = {
  tee: ['Upper-clothes'], shirt: ['Upper-clothes'], knit: ['Upper-clothes', 'Scarf'], jacket: ['Upper-clothes', 'Dress', 'Skirt', 'Scarf', 'Belt'],
  pants: ['Pants'], shorts: ['Pants', 'Skirt'], skirt: ['Skirt'], dress: ['Dress', 'Upper-clothes', 'Skirt', 'Belt'],
  shoes: ['Left-shoe', 'Right-shoe'], bag: ['Bag'],
};
const PERSON = ['Hair', 'Face', 'Left-arm', 'Right-arm', 'Left-leg', 'Right-leg', 'Sunglasses'];
const CLOTHES = ['Upper-clothes', 'Skirt', 'Pants', 'Dress', 'Left-shoe', 'Right-shoe', 'Bag', 'Scarf', 'Hat', 'Belt'];
async function isolate(img, a, cat) {
  const W = img.width, H = img.height;
  const P = await parsePhoto(img);
  const cnt = new Array(LABELS.length).fill(0);
  let total = 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const X = Math.min(W - 1, Math.floor(((x + 0.5) / P.w) * W)), Y = Math.min(H - 1, Math.floor(((y + 0.5) / P.h) * H));
    if (a[Y * W + X] < 0.5) continue;
    total++; cnt[P.label[y * P.w + x]]++;
  }
  if (!total) return false;
  let keep = CAT_CLASSES[cat];
  const main = () => { const best = CLOTHES.reduce((x, l) => (cnt[C[l]] > cnt[C[x]] ? l : x), 'Upper-clothes'); return best === 'Dress' ? CAT_CLASSES.dress : best.endsWith('shoe') ? CAT_CLASSES.shoes : [best]; };
  // Sin categoría, o si el analizador no ve la prenda esperada (una falda larga puede salir como «vestido»), la principal
  if (!keep || keep.reduce((x, l) => x + cnt[C[l]], 0) < total * 0.15) keep = main();
  const drop = [...PERSON, ...CLOTHES.filter((l) => !keep.includes(l))];
  // Solo si de verdad sale una persona (piel, cara, pelo): en una prenda doblada o extendida el analizador
  // puede confundir partes de la propia prenda con otras prendas
  const person = PERSON.reduce((x, l) => x + cnt[C[l]], 0) / total, garment = keep.reduce((x, l) => x + cnt[C[l]], 0) / total;
  if (person < 0.01 || garment < 0.15) return false;
  const d = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const q = guidedColor(d, P.soft(drop.map((l) => C[l]), W, H), W, H, Math.max(3, Math.round(Math.max(W, H) / 200)), 1e-3, 2);
  for (let i = 0; i < W * H; i++) a[i] *= 1 - sstep(0.4, 0.54, q[i]);
  return true;
}

// La máscara es casi un rectángulo lleno (filas y columnas completas)
function isRect(a, W, H, b) {
  if (b.n < b.w * b.h * 0.8) return false;
  let rows = 0, cols = 0;
  for (let y = b.y; y < b.y + b.h; y += 2) { let c = 0; for (let x = b.x; x < b.x + b.w; x += 2) if (a[y * W + x] > 0.5) c++; if (c >= (b.w / 2) * 0.9) rows++; }
  for (let x = b.x; x < b.x + b.w; x += 2) { let c = 0; for (let y = b.y; y < b.y + b.h; y += 2) if (a[y * W + x] > 0.5) c++; if (c >= (b.h / 2) * 0.9) cols++; }
  return rows >= (b.h / 2) * 0.55 && cols >= (b.w / 2) * 0.55;
}
// La prenda según el analizador de ropa, afinada con SAM (para fotos sin un fondo claro)
const GARMENT_ALL = ['Upper-clothes', 'Skirt', 'Pants', 'Dress', 'Left-shoe', 'Right-shoe', 'Bag', 'Scarf', 'Hat'];
async function garmentByParser(base, cat) {
  const W = base.width, H = base.height;
  const P = await parsePhoto(base);
  let cls = (CAT_CLASSES[cat] || []).map((l) => C[l]);
  const n = (k) => P.label.reduce((s, v) => s + (v === k), 0);
  // Sin categoría, o si el analizador ve la prenda como otra (una camiseta arrugada como «vestido»): la principal
  if (!cls.length || cls.reduce((s, k) => s + n(k), 0) < P.label.length * 0.05) {
    cls = [GARMENT_ALL.map((l) => C[l]).reduce((x, k) => (n(k) > n(x) ? k : x))];
  }
  const box = P.box(cls, 0.01);
  if (!box) return null;
  const soft = P.soft(cls, W, H);
  try {
    const S = await samSession(base);
    const pos = P.points(cls, 3, 0.8);
    const neg = P.points([C.Background], 2, 0.95);
    const r = await S.decode([...pos, ...neg], [...pos.map(() => 1), ...neg.map(() => 0)]);
    let best = null;
    for (let k = 0; k < r.n; k++) {
      const mk = r.mask(k); let inter = 0, uni = 0;
      for (let i = 0; i < W * H; i += 5) { const a = mk[i] > 0.5, p = soft[i] > 0.5; if (a && p) inter++; if (a || p) uni++; }
      const iou = uni ? inter / uni : 0;
      if (!best || iou > best.iou) best = { iou, mk };
    }
    if (best && best.iou > 0.5) return best.mk;
  } catch { /* sin SAM */ }
  for (let i = 0; i < W * H; i++) soft[i] = sstep(0.35, 0.65, soft[i]);
  return soft;
}

// ---------- Recorte automático ----------
// photo: imagen o lienzo. cat: id de la categoría del escáner (tee, pants, shoes…) o 'auto'
export async function autoCut(photo, { cat = 'auto', onStep = () => {}, isolatePerson = true } = {}) {
  const base = scaled(photo, 1600);
  const W = base.width, H = base.height;
  onStep('Quitando el fondo con IA…');
  let a = await matte(base, (p) => onStep(`Descargando el recorte con IA… ${Math.round(p * 100)}%`));
  let b = bboxOf(a, W, H, 0.5);
  if (!b) throw new Error('No encuentro ninguna prenda en la foto. Prueba con más luz o con la prenda más centrada.');
  // ¿Ha recortado un rectángulo (foto de una foto, una pantalla, una cartulina)? Se recorta dentro
  if (isRect(a, W, H, b) && b.w * b.h < W * H * 0.96) {
    onStep('Hay una foto dentro de la foto: recorto la prenda de dentro…');
    const inner = { x: b.x + Math.round(b.w * 0.03), y: b.y + Math.round(b.h * 0.03), w: Math.round(b.w * 0.94), h: Math.round(b.h * 0.94) };
    const a2 = await matte(crop(base, inner));
    const b2 = bboxOf(a2, inner.w, inner.h, 0.5);
    if (b2 && b2.n < inner.w * inner.h * 0.85) {
      a = new Float32Array(W * H);
      for (let y = 0; y < inner.h; y++) for (let x = 0; x < inner.w; x++) a[(inner.y + y) * W + inner.x + x] = a2[y * inner.w + x];
      b = bboxOf(a, W, H, 0.5);
    }
  }
  // La IA no distingue fondo (la prenda llena la foto, sobre una cama o un sofá): se busca la prenda
  // con el analizador de ropa y SAM
  if (b.n > W * H * 0.8) {
    onStep('El fondo se confunde con la prenda: la busco con el analizador…');
    const g = await garmentByParser(base, cat).catch(() => null);
    if (g) { a = g; b = bboxOf(a, W, H, 0.5) || b; }
  }
  // Segunda pasada de cerca: la IA ve la prenda más grande y el borde sale con más detalle
  let region = { x: 0, y: 0, w: W, h: H };
  if (b.w * b.h < W * H * 0.62) {
    region = grow(b, 0.07, W, H);
    onStep('Afinando el borde de cerca…');
    const a2 = await matte(crop(base, region));
    // De cerca manda en el borde; dentro de la prenda se queda lo de la primera pasada (de cerca, una
    // raya blanca junto a un fondo blanco puede confundirse con fondo)
    const bin = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) bin[i] = a[i] > 0.5 ? 1 : 0;
    const inner = boxMean(bin, W, H, Math.max(4, Math.round(Math.max(b.w, b.h) * 0.02)));
    const full = new Float32Array(W * H);
    for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) {
      const i = (region.y + y) * W + region.x + x, v = a2[y * region.w + x];
      full[i] = inner[i] > 0.985 ? Math.max(v, a[i]) : v;
    }
    a = full;
  }
  const img = crop(base, region);
  let al = new Float32Array(region.w * region.h);
  for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) al[y * region.w + x] = a[(region.y + y) * W + region.x + x];
  cleanAlpha(al, region.w, region.h);
  // Si sale una persona (foto de tienda con modelo) u otras prendas, se quedan fuera
  if (isolatePerson && cat !== 'acc') {
    onStep('Separando la prenda de la modelo y de lo que haya alrededor…');
    try { await isolate(img, al, cat); } catch { /* sin analizador: se queda el recorte */ }
  }
  onStep('Puliendo los bordes…');
  const pol = polish(img, al);
  return { canvas: trimTo(pol.canvas, pol.alpha), alpha: pol.alpha, source: img };
}

// ---------- Recorte con el dedo ----------
// strokes: { pos: [[x,y]...][], neg: [[x,y]...][], size } en píxeles de `base` (la foto escalada con scaled())
function sample(strokes, n) {
  const pts = strokes.flat();
  if (pts.length <= n) return pts;
  const out = [], step = pts.length / n;
  for (let i = 0; i < n; i++) out.push(pts[Math.floor(i * step + step / 2)]);
  return out;
}
function rasterize(strokes, size, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = size;
  for (const s of strokes) {
    if (s.length === 1) { x.beginPath(); x.arc(s[0][0], s[0][1], size / 2, 0, 7); x.fill(); continue; }
    x.beginPath(); s.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
  }
  const d = x.getImageData(0, 0, W, H).data, m = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}
// Punto «más dentro» de una zona (el más alejado de su borde), en una rejilla pequeña
function deepest(mask, W, H, avoid = null) {
  const k = Math.min(1, 160 / Math.max(W, H)), w = Math.max(2, Math.round(W * k)), h = Math.max(2, Math.round(H * k));
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = Math.min(H - 1, Math.floor((y + 0.5) / k)) * W + Math.min(W - 1, Math.floor((x + 0.5) / k));
    d[y * w + x] = mask[i] > 0.5 && !(avoid && avoid[i] > 0.5) ? 1e6 : 0;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[y * w + x]) d[y * w + x] = Math.min(d[y * w + x], at(x - 1, y) + 1, at(x, y - 1) + 1);
  let best = -1, bi = -1;
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1);
    if (d[i] > best) { best = d[i]; bi = i; }
  }
  return bi < 0 ? null : { p: [((bi % w) + 0.5) / k, (((bi / w) | 0) + 0.5) / k], depth: best / k };
}
export async function manualCut(base, strokes, { session = null, onStep = () => {} } = {}) {
  const W = base.width, H = base.height;
  if (!session) { onStep('Preparando la foto para recortar con el dedo…'); session = await samSession(base, (p) => onStep(`Descargando el recorte con el dedo… ${Math.round(p * 100)}%`)); }
  const pos = strokes.pos.filter((s) => s.length), neg = (strokes.neg || []).filter((s) => s.length);
  if (!pos.length) throw new Error('Pinta por encima de la prenda');
  const paint = rasterize(pos, strokes.size, W, H), erase = neg.length ? rasterize(neg, strokes.size, W, H) : null;
  // Zona de trabajo: lo pintado con un margen (la máscara no se puede escapar a la cama o al suelo)
  const xs = pos.flat().map((p) => p[0]), ys = pos.flat().map((p) => p[1]), m = strokes.size;
  const bw = Math.max(...xs) - Math.min(...xs) + 2 * m, bh = Math.max(...ys) - Math.min(...ys) + 2 * m;
  const zone = { x0: Math.min(...xs) - m - bw * 0.12, y0: Math.min(...ys) - m - bh * 0.12, x1: Math.max(...xs) + m + bw * 0.12, y1: Math.max(...ys) + m + bh * 0.12 };
  onStep('Recortando lo que has pintado…');
  // SAM funciona mejor con pocos puntos: se empieza por el centro de lo pintado y se añaden puntos
  // donde falta (o donde sobra) hasta que la máscara cubre lo que has pintado
  const P = [], N = [];
  const c0 = deepest(paint, W, H); if (c0) P.push(c0.p);
  const c1 = deepest(paint, W, H, (() => { const t = new Float32Array(W * H); if (c0) { const r = c0.depth * 1.6; for (let y = Math.max(0, Math.floor(c0.p[1] - r)); y < Math.min(H, c0.p[1] + r); y++) for (let x = Math.max(0, Math.floor(c0.p[0] - r)); x < Math.min(W, c0.p[0] + r); x++) if (Math.hypot(x - c0.p[0], y - c0.p[1]) < r) t[y * W + x] = 1; } return t; })());
  if (c1 && c1.depth > m * 0.3) P.push(c1.p);
  if (erase) { const e0 = deepest(erase, W, H); if (e0) N.push(e0.p); }
  let best = null;
  for (let it = 0; it < 4; it++) {
    const r = await session.decode([...P, ...N], [...P.map(() => 1), ...N.map(() => 0)]);
    let bestIt = null;
    for (let k = 0; k < r.n; k++) {
      const mk = r.mask(k);
      let inP = 0, nP = 0, inN = 0, nN = 0, out = 0, on = 0;
      for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
        const i = y * W + x, v = mk[i] > 0.5;
        if (v) { on++; if (x < zone.x0 || x > zone.x1 || y < zone.y0 || y > zone.y1) out++; }
        if (paint[i] > 0.5) { nP++; if (v) inP++; }
        if (erase && erase[i] > 0.5) { nN++; if (v) inN++; }
      }
      const cover = nP ? inP / nP : 0, leak = on ? out / on : 0, hitN = nN ? inN / nN : 0;
      const score = cover - 2 * hitN - 1.5 * leak + 0.05 * (r.scores[k] || 0);
      if (!bestIt || score > bestIt.score) bestIt = { score, mk, cover, hitN };
    }
    if (!best || bestIt.score > best.score) best = bestIt;
    if (best.cover > 0.9 && best.hitN < 0.05) break;
    // Punto nuevo donde falta prenda pintada, o donde se ha colado lo tachado
    const miss = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) miss[i] = paint[i] > 0.5 && best.mk[i] < 0.5 ? 1 : 0;
    const mp = deepest(miss, W, H);
    if (mp && mp.depth > m * 0.25 && best.cover < 0.9) P.push(mp.p);
    if (erase && best.hitN >= 0.05) { const hit = new Float32Array(W * H); for (let i = 0; i < W * H; i++) hit[i] = erase[i] > 0.5 && best.mk[i] > 0.5 ? 1 : 0; const np = deepest(hit, W, H); if (np) N.push(np.p); }
  }
  const a = best.mk;
  // Fuera de la zona de trabajo no hay prenda; lo tachado, tampoco
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < zone.x0 || x > zone.x1 || y < zone.y0 || y > zone.y1) a[y * W + x] = 0;
  if (erase) for (let i = 0; i < W * H; i++) a[i] *= 1 - erase[i];
  onStep('Puliendo los bordes…');
  const pol = polish(base, a);
  return { canvas: trimTo(pol.canvas, pol.alpha), alpha: pol.alpha, session, cover: best.cover };
}

// ---------- Prendas de una foto de cuerpo entero ----------
// Cada prenda: el analizador dice dónde está y SAM la recorta con precisión (borde nítido)
export async function lookParts(photo, parts, { onStep = () => {} } = {}) {
  const base = scaled(photo, 1600);
  const W = base.width, H = base.height;
  onStep('Buscando las prendas…');
  const P = await parsePhoto(base);
  onStep('Preparando el recorte preciso…');
  let session = null;
  try { session = await samSession(base); } catch { session = null; }
  const out = [];
  for (const part of parts) {
    const box = P.box(part.cls, part.min);
    if (!box) continue;
    onStep(`Recortando: ${part.label.toLowerCase()}…`);
    const soft = P.soft(part.cls, W, H);
    let a = soft;
    if (session) {
      // Puntos seguros de la prenda y, como «fuera», puntos de la piel y de las otras prendas cercanas
      const pos = P.points(part.cls, 3, 0.8);
      const others = [...PERSON, ...CLOTHES].map((l) => C[l]).filter((k) => !part.cls.includes(k));
      const negAll = P.points(others, 40, 0.75).filter(([x, y]) => x > box.x - box.w * 0.15 && x < box.x + box.w * 1.15 && y > box.y - box.h * 0.15 && y < box.y + box.h * 1.15);
      const neg = negAll.filter((_, i) => i % Math.max(1, Math.ceil(negAll.length / 2)) === 0).slice(0, 2);
      const g = grow(box, 0.04, W, H);
      try {
        const r = await session.decode([...pos, ...neg], [...pos.map(() => 1), ...neg.map(() => 0)]);
        // La máscara de SAM que más se parece a lo que dice el analizador
        let best = null;
        for (let k = 0; k < r.n; k++) {
          const mk = r.mask(k);
          let inter = 0, uni = 0;
          for (let i = 0; i < W * H; i += 5) { const s = mk[i] > 0.5, p = soft[i] > 0.5; if (s && p) inter++; if (s || p) uni++; }
          const iou = uni ? inter / uni : 0;
          if (!best || iou > best.iou) best = { iou, mk };
        }
        // SAM manda en el borde, pero sin salirse de la zona de la prenda (ni comerse la de otra)
        if (best && best.iou > 0.45) {
          a = new Float32Array(W * H);
          for (let i = 0; i < W * H; i++) a[i] = Math.min(best.mk[i], sstep(0.08, 0.3, soft[i]));
        }
      } catch { /* sin SAM: el analizador */ }
    }
    const g = grow(box, 0.05, W, H), img = crop(base, g);
    const al = new Float32Array(g.w * g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) al[y * g.w + x] = a[(g.y + y) * W + g.x + x];
    if (!part.cls.includes(C['Left-shoe'])) cleanAlpha(al, g.w, g.h);
    const pol = polish(img, al, { sharpen: 0.3 });
    out.push({ part, canvas: trimTo(pol.canvas, pol.alpha), crop: img, frac: box.frac });
  }
  return out;
}
