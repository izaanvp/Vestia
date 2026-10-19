// Prenda real sobre el maniquí: deforma la foto recortada de TU prenda para que se adapte
// a la postura y las medidas del maniquí (no es una prenda genérica).
//
// 1. Analiza la silueta de la foto: cuello, hombros, axilas, mangas, cintura, entrepierna y perneras.
// 2. Calcula dónde cae cada parte en el cuerpo del maniquí respetando las proporciones de la prenda
//    (una camiseta corta sigue siendo corta, un abrigo largo sigue siendo largo, un pantalón ancho sigue ancho).
// 3. Deforma la foto con una malla de triángulos (transformación afín por trozos).
// 4. Añade luz y sombra para darle volumen.
import { FIG, mirror, hwAt, chainPoint, garmentKind } from './wear.js';

const SCALE = 3; // el lienzo tiene el triple de resolución que el maniquí (300 × 640): nítido en pantallas Retina
const cache = new Map();
export const forgetReal = (id) => [...cache.keys()].filter((k) => k.startsWith(`${id}:`)).forEach((k) => cache.delete(k));

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const lerp = (a, b, t) => a + (b - a) * t;
// Brazo y pierna del lado derecho de la pantalla (en una foto real no son simétricos)
const armR = (P) => P.armR || mirror(P.arm);
const legR = (P) => P.legR || mirror(P.leg);
const lerpP = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const smooth = (t) => t * t * (3 - 2 * t);

// ---------- Análisis de la silueta ----------
function maskOf(img, maxSide = 180) {
  const k = maxSide / Math.max(img.width, img.height);
  const w = Math.max(8, Math.round(img.width * k)), h = Math.max(8, Math.round(img.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  let sx = 0, n = 0, top = h, bot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 110) { m[y * w + x] = 1; sx += x; n++; if (y < top) top = y; if (y > bot) bot = y; }
  return { m, w, h, k, cx: n ? sx / n : w / 2, top, bot, area: n, img };
}
// Prendas sin mangas (no se buscan mangas en la foto)
const SLEEVELESS = ['tank', 'corset', 'vest', 'dress-slip', 'gown'];
// Tramos opacos de una fila (se unen huecos de 1 px)
function runs(M, y) {
  const out = [];
  let s = -1;
  for (let x = 0; x <= M.w; x++) {
    const on = x < M.w && M.m[y * M.w + x];
    if (on && s < 0) s = x;
    if (!on && s >= 0) {
      if (out.length && s - out[out.length - 1][1] <= 2) out[out.length - 1][1] = x - 1; else out.push([s, x - 1]);
      s = -1;
    }
  }
  return out;
}
// Tramo que contiene el centro (o el más cercano)
function centerRun(M, y, cx) {
  const r = runs(M, y);
  if (!r.length) return null;
  return r.find(([a, b]) => a <= cx && cx <= b) || r.reduce((best, q) => (Math.abs((q[0] + q[1]) / 2 - cx) < Math.abs((best[0] + best[1]) / 2 - cx) ? q : best));
}
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Parte de arriba (camiseta, camisa, jersey, chaqueta, abrigo, vestido)
// Funciona con las dos formas típicas de fotografiar una prenda:
// · extendida en "T" (mangas abiertas): la axila es el salto de anchura entre tronco y mangas;
// · colgada o en maniquí invisible (mangas caídas junto al cuerpo): el hombro es donde el contorno
//   deja de abrirse en horizontal y empieza a bajar.
function analyzeTop(M, kind = '') {
  const { top, bot, cx } = M;
  const H = bot - top + 1;
  const hw = new Array(M.h).fill(0), mid = new Array(M.h).fill(cx), L = new Array(M.h).fill(cx), R = new Array(M.h).fill(cx), nRuns = new Array(M.h).fill(0);
  for (let y = top; y <= bot; y++) {
    const rs = runs(M, y);
    if (!rs.length) continue;
    nRuns[y] = rs.length; L[y] = rs[0][0]; R[y] = rs[rs.length - 1][1];
    const r = centerRun(M, y, cx);
    // Solo es tronco si el tramo pasa por el centro (un puño suelto bajo el bajo no lo es)
    if (r[0] <= cx + M.w * 0.06 && r[1] >= cx - M.w * 0.06) { hw[y] = (r[1] - r[0]) / 2; mid[y] = (r[0] + r[1]) / 2; }
  }
  // 1) Prenda en "T": salto brusco de anchura subiendo desde el bajo
  let armpit = null;
  const gap = Math.max(2, Math.round(H * 0.05));
  for (let y = Math.round(top + H * 0.75); y > top + H * 0.12; y--) {
    const below = hw[Math.min(bot, y + gap)];
    if (below > 0 && hw[y] > below * 1.22 && hw[y] - below > H * 0.04) { armpit = y + 1; break; }
  }
  let chest = 0, cxT = cx, shoulder = top, hanging = false;
  if (armpit != null) {
    const y0 = armpit + Math.ceil(gap / 2), y1 = Math.max(y0 + 3, Math.round(armpit + (bot - armpit) * 0.35));
    const ws = []; for (let y = y0; y <= Math.min(bot, y1); y++) if (hw[y]) ws.push(hw[y]);
    ws.sort((a, b) => a - b);
    chest = ws[Math.floor(ws.length * 0.3)] || hw[Math.min(bot, y0)];
    const ms = []; for (let y = armpit; y <= bot; y++) if (hw[y] && hw[y] <= chest * 1.12) ms.push(mid[y]);
    cxT = median(ms) || cx;
    // Donde la manga se separa del cuerpo con un hueco, ese lado del tramo central es el costado real
    const lefts = [], rights = [];
    for (let y = armpit; y <= armpit + (bot - armpit) * 0.8; y++) {
      const rs = runs(M, y);
      const ci = rs.findIndex(([a, b]) => a <= cxT && b >= cxT);
      if (ci < 0 || rs.length < 2) continue;
      if (ci > 0) lefts.push(rs[ci][0]);
      if (ci < rs.length - 1) rights.push(rs[ci][1]);
    }
    if (lefts.length >= 3 && rights.length >= 3) {
      const l = median(lefts), r = median(rights);
      if (r - l > chest * 0.6) { chest = Math.min(chest, (r - l) / 2); cxT = (l + r) / 2; }
    } else if (lefts.length >= 3) chest = Math.min(chest, Math.max(chest * 0.7, cxT - median(lefts)));
    else if (rights.length >= 3) chest = Math.min(chest, Math.max(chest * 0.7, median(rights) - cxT));
    // Las mangas tienen que salir claramente del tronco; si no, no era una "T"
    let spread = 0;
    for (let y = top; y < armpit; y++) spread = Math.max(spread, R[y] - cxT, cxT - L[y]);
    if (!chest || spread < chest * 1.3) armpit = null;
  }
  let capUntil;
  if (armpit != null) {
    const sideX = Math.round(cxT - chest * 0.9);
    for (let y = top; y < armpit; y++) if (sideX >= 0 && M.m[y * M.w + sideX]) { shoulder = y; break; }
    // Si las mangas bajan pegadas al cuerpo el salto aparece en los puños: la sisa real es más alta
    capUntil = armpit;
    armpit = Math.min(armpit, Math.round(shoulder + (bot - shoulder) * 0.42));
  } else {
    // 2) Mangas caídas: punto del hombro en el contorno de cada lado (ignorando capucha y cuello)
    hanging = true;
    const pts = [-1, 1].map((side) => {
      const e = (y) => (side < 0 ? cx - L[y] : R[y] - cx);
      let eMax = 0;
      for (let y = top; y < top + H * 0.5; y++) eMax = Math.max(eMax, e(y));
      for (let y = Math.round(top + H * 0.03); y < top + H * 0.45; y++) {
        const slope = (e(Math.min(bot, y + 3)) - e(y)) / 3;
        if (slope < 0.55 && e(y) > eMax * 0.72) return { y, e: e(y) };
      }
      const y = Math.round(top + H * 0.12);
      return { y, e: Math.max(e(y), eMax * 0.8) };
    });
    shoulder = Math.round((pts[0].y + pts[1].y) / 2);
    cxT = cx + (pts[1].e - pts[0].e) / 2;
    chest = ((pts[0].e + pts[1].e) / 2) * 0.93;
    // Con las mangas pegadas al cuerpo, ese contorno incluye las mangas. El ancho del cuerpo se mide
    // abajo, donde los puños se separan del bajo (con una máscara más fina); si nunca se separan,
    // se estima por proporción (una manga plana mide ~0,6 del medio cuerpo).
    if (!SLEEVELESS.includes(kind) && M.img) {
      const F2 = maskOf(M.img, 460), kf = F2.w / M.w, halves = [];
      for (let y = Math.round(F2.top + (F2.bot - F2.top) * 0.5); y <= F2.bot; y++) {
        const rs = runs(F2, y);
        if (rs.length < 3) continue;
        const c = cxT * kf, i = rs.findIndex(([a, b]) => a <= c && b >= c);
        if (i <= 0 || i >= rs.length - 1) continue;
        halves.push([(rs[i][1] - rs[i][0]) / 2 / kf, (rs[i][0] + rs[i][1]) / 2 / kf]);
      }
      if (halves.length >= 3 && median(halves.map((h) => h[0])) < chest * 0.85) {
        chest = median(halves.map((h) => h[0])) * 1.03;
        cxT = median(halves.map((h) => h[1]));
      } else {
        const yMid = Math.round(top + H * 0.55);
        const half = (R[yMid] - L[yMid]) / 2;
        if (half > chest * 0.9) chest = Math.min(chest, half / 1.62);
      }
    }
    // Axila: donde aparece el hueco entre manga y cuerpo, o a una profundidad típica
    armpit = Math.round(shoulder + (bot - shoulder) * 0.28);
    for (let y = shoulder + 2; y < shoulder + (bot - shoulder) * 0.45; y++) if (nRuns[y] >= 3) { armpit = Math.max(shoulder + 2, y - 1); break; }
    capUntil = armpit;
  }
  // Ancho del tronco por fila: por encima de la axila no puede superar el pecho, y por debajo
  // solo un poco más hasta donde acaban las mangas (si van pegadas al cuerpo no cuentan como tronco)
  const cap = (y) => (y < capUntil ? chest : chest * 1.12);
  const capped = (y) => (hw[y] || chest) > cap(y);
  // Bajo del tronco: última fila con cuerpo de verdad (lo que cuelga por debajo son puños)
  let hem = bot;
  while (hem > armpit + 2 && !(hw[hem] > chest * 0.45)) hem--;
  let sleeveLow = hem;
  const torso = (y) => (y > sleeveLow + 1 ? hw[y] || chest : Math.min(hw[y] || chest, cap(y)));
  const midT = (y) => (y <= sleeveLow + 1 && (y < capUntil || capped(y)) ? cxT : mid[y]);
  // Mangas: zona fuera del tronco conectada con la sisa (relleno por inundación desde la sisa)
  const out = new Uint8Array(M.w * M.h);
  for (let y = shoulder; y <= bot; y++) {
    const half = Math.min(hw[y] || chest, cap(y)) + 1;
    const c0 = y < capUntil || capped(y) ? cxT : mid[y];
    for (let x = 0; x < M.w; x++) if (M.m[y * M.w + x] && Math.abs(x - c0) > half) out[y * M.w + x] = 1;
  }
  const sleeves = [-1, 1].map((side) => {
    const seen = new Uint8Array(M.w * M.h), stack = [];
    for (let y = shoulder; y <= Math.max(armpit, Math.min(capUntil, bot)); y++) {
      const x0 = Math.round(cxT + side * (chest + 1));
      for (let d = 0; d < 4; d++) { const x = x0 + side * d, i = y * M.w + x; if (x >= 0 && x < M.w && out[i] && !seen[i]) { seen[i] = 1; stack.push(i); } }
    }
    const pts = [];
    while (stack.length) {
      const i = stack.pop(), x = i % M.w, y = (i - x) / M.w;
      pts.push([x, y]);
      for (const j of [x > 0 ? i - 1 : -1, x < M.w - 1 ? i + 1 : -1, y > 0 ? i - M.w : -1, y < M.h - 1 ? i + M.w : -1]) if (j >= 0 && out[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (pts.length < M.area * 0.025) return null;
    // Zona de la manga en la máscara (para recortarla aparte del cuerpo)
    const region = new Uint8Array(M.w * M.h);
    for (const [x, y] of pts) region[y * M.w + x] = 1;
    const rootTop = [cxT + side * chest, shoulder];
    const rootBot = [cxT + side * chest, armpit];
    const rm = lerpP(rootTop, rootBot, 0.5);
    const dist = pts.map((p) => Math.hypot(p[0] - rm[0], p[1] - rm[1]));
    const cut = [...dist].sort((a, b) => b - a)[Math.floor(dist.length * 0.12)];
    const far = pts.filter((_, i) => dist[i] >= cut);
    const tc = [far.reduce((s, p) => s + p[0], 0) / far.length, far.reduce((s, p) => s + p[1], 0) / far.length];
    let dx = tc[0] - rm[0], dy = tc[1] - rm[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    // Normal hacia el lado "exterior" del brazo (arriba si la manga está abierta, hacia fuera si cae)
    const nx = side < 0 ? -dy : dy, ny = side < 0 ? dx : -dx;
    const proj = far.map((p) => (p[0] - tc[0]) * nx + (p[1] - tc[1]) * ny);
    const half = Math.max(2, (Math.max(...proj) - Math.min(...proj)) / 2);
    const off = (Math.max(...proj) + Math.min(...proj)) / 2;
    const c0 = [tc[0] + nx * off, tc[1] + ny * off];
    const tipTop = [c0[0] + nx * half, c0[1] + ny * half], tipBot = [c0[0] - nx * half, c0[1] - ny * half];
    const low = pts.map((p) => p[1]).sort((a, b) => a - b)[Math.floor(pts.length * 0.97)];
    return { rootTop, rootBot, tipTop, tipBot, len: Math.hypot(tipTop[0] - rootTop[0], tipTop[1] - rootTop[1]), low, region };
  });
  // Con las mangas caídas, una sola "manga" suele ser un pliegue (prenda doblada): se descarta
  if (hanging && sleeves.filter(Boolean).length === 1) sleeves.fill(null);
  if (SLEEVELESS.includes(kind)) sleeves.fill(null);
  sleeveLow = Math.max(armpit, ...sleeves.filter(Boolean).map((s) => s.low));
  return { kind: 'top', top, bot: hem, cx: cxT, armpit, shoulder, chest, torso, midT, sleeves, hanging, sleeveLow };
}

// Parte de abajo: pantalón (con perneras) o falda
function analyzeBottom(M) {
  const { top, bot, cx } = M;
  const H = bot - top + 1;
  let crotch = null, streak = 0;
  for (let y = Math.round(top + H * 0.12); y <= bot - H * 0.08; y++) {
    const r = runs(M, y);
    const split = r.length >= 2 && r.some(([, b]) => b < cx) && r.some(([a]) => a > cx);
    streak = split ? streak + 1 : 0;
    if (streak >= 3) { crotch = y - 2; break; }
  }
  const waistRow = Math.min(bot, top + Math.max(1, Math.round(H * 0.03)));
  const wr = centerRun(M, waistRow, cx) || [cx - H * 0.2, cx + H * 0.2];
  const waist = (wr[1] - wr[0]) / 2;
  const full = (y) => { const r = runs(M, y); return r.length ? [r[0][0], r[r.length - 1][1]] : [cx - waist, cx + waist]; };
  if (crotch == null) return { kind: 'skirt', top, bot, cx: (wr[0] + wr[1]) / 2, waist, full };
  const leg = (side) => (y) => {
    const r = runs(M, y);
    if (!r.length) return null;
    const pick = side < 0 ? r.filter(([, b]) => b < cx + 2) : r.filter(([a]) => a > cx - 2);
    if (!pick.length) return null;
    return [pick[0][0], pick[pick.length - 1][1]];
  };
  return { kind: 'pants', top, bot, cx: (wr[0] + wr[1]) / 2, waist, crotch, full, legL: leg(-1), legR: leg(1) };
}

// ---------- Caída (ajustada → oversize) y tiro (bajo → alto) ----------
// Se deducen de las palabras de la prenda y de las proporciones de la foto; el usuario puede fijarlos en la ficha.
export const FITS = ['ajustada', 'normal', 'holgada', 'oversize'];
export const RISES = ['bajo', 'medio', 'alto'];
const words = (item) => `${item.name || ''} ${item.subtype || ''} ${item.notes || ''}`.toLowerCase();
export function fitOf(item, A) {
  if (FITS.includes(item.fit)) return { fit: item.fit, auto: false };
  const t = words(item);
  if (/oversize|oversized|boyfriend|baggy|xxl/.test(t)) return { fit: 'oversize', auto: true };
  if (/holgad|ancho|amplio|relaxed|loose|boxy|wide|palazzo|culotte|barrel|globo/.test(t)) return { fit: 'holgada', auto: true };
  if (/slim|ajustad|ce[ñn]id|entallad|fitted|skinny|pitillo|muscle|leggings|stretch|tubo|bodycon/.test(t)) return { fit: 'ajustada', auto: true };
  if (A?.kind === 'top') {
    const L = Math.max(1, A.bot - A.shoulder);
    const r = A.chest / L, arm = (A.armpit - A.shoulder) / L;
    if (r > 0.52 || (r > 0.46 && arm > 0.36)) return { fit: 'oversize', auto: true };
    if (r > 0.43) return { fit: 'holgada', auto: true };
    if (r < 0.26) return { fit: 'ajustada', auto: true };
  } else if (A?.kind === 'pants') {
    // Ancho del bajo de la pernera respecto a la cintura
    const y = Math.round(A.crotch + (A.bot - A.crotch) * 0.9);
    const run = A.legL(y) || A.legR(y);
    const open = run ? (run[1] - run[0]) / 2 / A.waist : 0.4;
    if (open > 0.7) return { fit: 'oversize', auto: true };
    if (open > 0.52) return { fit: 'holgada', auto: true };
    if (open < 0.3) return { fit: 'ajustada', auto: true };
  }
  return { fit: 'normal', auto: true };
}
export function riseOf(item, A) {
  if (RISES.includes(item.rise)) return { rise: item.rise, auto: false };
  const t = words(item);
  if (/tiro bajo|low.?rise|de cadera|hipster/.test(t)) return { rise: 'bajo', auto: true };
  if (/tiro alto|high.?(rise|waist)|cintura alta|talle alto|\bmom\b|paperbag|culotte|palazzo|leggings/.test(t)) return { rise: 'alto', auto: true };
  if (/tiro medio|mid.?rise/.test(t)) return { rise: 'medio', auto: true };
  if (A?.kind === 'pants') {
    // Largo del tiro (cinturilla → entrepierna) respecto al ancho de la cintura
    const r = (A.crotch - A.top) / Math.max(1, A.waist);
    return { rise: r < 1.1 ? 'bajo' : r > 1.42 ? 'alto' : 'medio', auto: true };
  }
  return { rise: A?.kind === 'skirt' ? 'alto' : 'medio', auto: true };
}
// Holgura (en el medio ancho del maniquí) según la caída
const EASE_TOP = { ajustada: 1.5, normal: 4.5, holgada: 9, oversize: 15 };
const EASE_BOTTOM = { ajustada: 0.5, normal: 3, holgada: 6, oversize: 9 };
const LEG_WIDTH = { ajustada: 0.9, normal: 1, holgada: 1.12, oversize: 1.25 };
// Dónde queda la cinturilla según el tiro
const waistFor = (rise, P) => (rise === 'alto' ? P.waistY - 2 : rise === 'bajo' ? Math.min(P.waistY + 36, P.crotchY - 30) : P.waistY + 16);

// Lo que el motor deduce de una prenda (para enseñarlo en la ficha)
const infoCache = new Map();
export function garmentFit(item, slot) {
  const key = `${item.id}:${item.fit || ''}:${item.rise || ''}:${item.name}:${item.subtype}`;
  if (infoCache.has(key)) return infoCache.get(key);
  const p = (async () => {
    const img = await loadImg(item.img);
    const M = maskOf(img);
    if (slot === 'bottom') { const A = analyzeBottom(M); return { ...fitOf(item, A), ...riseOf(item, A), kind: A.kind }; }
    if (['top', 'outer', 'one'].includes(slot)) return { ...fitOf(item, analyzeTop(M, garmentKind(item))), kind: 'top' };
    return null;
  })().catch(() => null);
  infoCache.set(key, p);
  return p;
}

// ---------- Malla y deformación ----------
// sc: escala del destino (1 = lienzo final; 1/SCALE = lienzo pequeño para calcular sombras)
function drawTri(ctx, img, s, d, sc = 1) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(den) < 1e-6) return;
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
  const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
  // El triángulo de destino se agranda ~0,7 px para que no se vean costuras entre triángulos
  const gx = (u0 + u1 + u2) / 3, gy = (v0 + v1 + v2) / 3;
  const grow = (u, v) => { const L = Math.hypot(u - gx, v - gy) || 1; return [u + ((u - gx) / L) * 0.7, v + ((v - gy) / L) * 0.7]; };
  ctx.save();
  ctx.beginPath();
  const p0 = grow(u0, v0), p1 = grow(u1, v1), p2 = grow(u2, v2);
  ctx.moveTo(p0[0] * sc, p0[1] * sc); ctx.lineTo(p1[0] * sc, p1[1] * sc); ctx.lineTo(p2[0] * sc, p2[1] * sc); ctx.closePath();
  ctx.clip();
  ctx.setTransform(a * sc, b * sc, c * sc, dd * sc, e * sc, f * sc);
  // Solo el trozo de foto que cubre el triángulo (mucho más rápido en el iPhone)
  const bx = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 2), by = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 2);
  const bw = Math.min(img.width, Math.ceil(Math.max(x0, x1, x2)) + 2) - bx, bh = Math.min(img.height, Math.ceil(Math.max(y0, y1, y2)) + 2) - by;
  if (bw > 0 && bh > 0) ctx.drawImage(img, bx, by, bw, bh, bx, by, bw, bh);
  ctx.restore();
}
// Dibuja una rejilla src → dst (matrices de puntos [fila][columna])
function drawGrid(ctx, img, S, D, sc = 1) {
  for (let r = 0; r < S.length - 1; r++) for (let c = 0; c < S[r].length - 1; c++) {
    drawTri(ctx, img, [S[r][c], S[r][c + 1], S[r + 1][c]], [D[r][c], D[r][c + 1], D[r + 1][c]], sc);
    drawTri(ctx, img, [S[r][c + 1], S[r + 1][c + 1], S[r + 1][c]], [D[r][c + 1], D[r + 1][c + 1], D[r + 1][c]], sc);
  }
}
const toCanvas = ([x, y]) => [x * SCALE, y * SCALE];
const W_VB = 300, H_VB = 640; // medidas del maniquí (viewBox)
function layer(w = W_VB * SCALE, h = H_VB * SCALE) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').imageSmoothingQuality = 'high';
  return c;
}
const free = (...cs) => cs.forEach((c) => { if (c) { c.width = 0; c.height = 0; } });

// ---------- Brazos y piernas con articulaciones suaves ----------
// Geometría de una cadena (hombro → codo → muñeca, o cadera → rodilla → tobillo)
function limbGeom(chain) {
  const segs = []; let total = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    segs.push({ a, b, len, start: total, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len });
    total += len;
  }
  // Bisectriz de cada articulación: separa lo que va antes (brazo) de lo que va después (antebrazo)
  const joints = [];
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1], s = segs[i];
    const bx = p.dx + s.dx, by = p.dy + s.dy, m = Math.hypot(bx, by);
    if (m > 0.05) joints.push({ x: s.a.x, y: s.a.y, d: s.start, bx: bx / m, by: by / m, p, s, bend: Math.acos(Math.max(-1, Math.min(1, p.dx * s.dx + p.dy * s.dy))) });
  }
  return { segs, total, joints };
}
// Punto, dirección (girando poco a poco cerca de cada articulación) y grosor en t (0 = arriba, 1 = final)
function frameAt(G, t, blend) {
  const d = t * G.total;
  let si = G.segs.findIndex((s) => d <= s.start + s.len);
  if (si < 0) si = G.segs.length - 1;
  const s = G.segs[si], u = d - s.start;
  let dx = s.dx, dy = s.dy;
  if (si > 0 && u < blend) { const p = G.segs[si - 1], w = 0.5 * (1 - Math.max(0, u) / blend); dx = dx * (1 - w) + p.dx * w; dy = dy * (1 - w) + p.dy * w; }
  if (si < G.segs.length - 1 && s.len - u < blend) { const q = G.segs[si + 1], w = 0.5 * (1 - (s.len - u) / blend); dx = dx * (1 - w) + q.dx * w; dy = dy * (1 - w) + q.dy * w; }
  const m = Math.hypot(dx, dy) || 1;
  return { x: s.a.x + s.dx * u, y: s.a.y + s.dy * u, dx: dx / m, dy: dy / m, r: s.a.r + (s.b.r - s.a.r) * Math.max(0, Math.min(1, u / s.len)), d };
}
// En la parte de dentro del codo o de la rodilla la tela se pliega: ningún punto cruza la bisectriz
function foldClamp(G, pt, c, d, win) {
  for (const J of G.joints) {
    if (Math.abs(d - J.d) > win) continue;
    const before = d < J.d;
    const v = (pt[0] - J.x) * J.bx + (pt[1] - J.y) * J.by;
    const vc = (c[0] - J.x) * J.bx + (c[1] - J.y) * J.by;
    if (before ? v <= 0 || vc > 0 : v >= 0 || vc < 0) continue;
    const tau = Math.max(0, Math.min(1, -vc / (v - vc)));
    pt = [c[0] + (pt[0] - c[0]) * tau, c[1] + (pt[1] - c[1]) * tau];
  }
  return pt;
}
// Hasta dónde llegan las piernas (con su pose) a una altura y: para que faldas y abrigos las cubran
function legExtent(P, y) {
  let ext = 0;
  for (const leg of [P.leg, legR(P)]) for (let i = 0; i < leg.length - 1; i++) {
    const a = leg[i], b = leg[i + 1];
    if ((y - a.y) * (y - b.y) > 0 || a.y === b.y) continue;
    const u = (y - a.y) / (b.y - a.y);
    ext = Math.max(ext, Math.abs(a.x + (b.x - a.x) * u - 150) + a.r + (b.r - a.r) * u);
  }
  return ext;
}

// ---------- Volumen ----------
// Sombra "almohadillada": la tela se oscurece hacia sus bordes (más a la derecha, la luz viene de la
// izquierda) y se aclara un poco en el centro. Se calcula con la forma real de cada pieza.
function shadeMap(shape, { R = 8, dark = 0.28, lift = 0.07 } = {}) {
  const w = W_VB, h = H_VB;
  const c = layer(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(shape, 0, 0, w, h);
  const a = x.getImageData(0, 0, w, h).data;
  const INF = 1e6, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = a[i * 4 + 3] > 100 ? INF : 0;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : d[yy * w + xx]);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(xx - 1, yy) + 1, at(xx, yy - 1) + 1, at(xx - 1, yy - 1) + 1.414, at(xx + 1, yy - 1) + 1.414);
  }
  for (let yy = h - 1; yy >= 0; yy--) for (let xx = w - 1; xx >= 0; xx--) {
    const i = yy * w + xx; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(xx + 1, yy) + 1, at(xx, yy + 1) + 1, at(xx + 1, yy + 1) + 1.414, at(xx - 1, yy + 1) + 1.414);
  }
  const out = x.createImageData(w, h);
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx, di = d[i]; if (!di) continue;
    const gx = d[i + 1] - d[i - 1], gy = d[i + w] - d[i - w], g = Math.hypot(gx, gy);
    const nx = g ? -gx / g : 0; // normal hacia fuera (x)
    const edge = Math.pow(1 - Math.min(di, R) / R, 1.6);
    const sh = dark * edge * (1 + 0.45 * nx);
    const li = lift * smooth(Math.min(1, Math.max(0, (di - R * 0.6) / (R * 1.6))));
    const v = li - sh;
    const k = i * 4;
    if (v < 0) { out.data[k + 3] = Math.min(255, -v * 255); } else { out.data[k] = out.data[k + 1] = out.data[k + 2] = 255; out.data[k + 3] = v * 255; }
  }
  x.putImageData(out, 0, 0);
  return c;
}
function applyShade(target, map) {
  const x = target.getContext('2d');
  x.save(); x.globalCompositeOperation = 'source-atop'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(map, 0, 0, target.width, target.height); x.restore();
}
// Pliegues en la parte cóncava de codos y rodillas cuando se doblan (dentro de la «V»)
function foldLines(ctx, G, half, upTo) {
  for (const J of G.joints) {
    if (J.bend < 0.3 || J.d > upTo * G.total) continue;
    let vx = J.s.dx - J.p.dx, vy = J.s.dy - J.p.dy;
    const m = Math.hypot(vx, vy) || 1; vx /= m; vy /= m;
    const px = -vy, py = vx;
    const k = Math.min(1, J.bend / 1.3);
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const c0 = [J.x + vx * half * 0.2 + px * i * half * 0.32, J.y + vy * half * 0.2 + py * i * half * 0.32];
      const c1 = [c0[0] + vx * half * (0.75 - Math.abs(i) * 0.2), c0[1] + vy * half * (0.75 - Math.abs(i) * 0.2)];
      ctx.strokeStyle = `rgba(0,0,0,${(0.17 * k).toFixed(3)})`; ctx.lineWidth = 1.5 * SCALE;
      ctx.beginPath(); ctx.moveTo(c0[0] * SCALE, c0[1] * SCALE);
      ctx.quadraticCurveTo(((c0[0] + c1[0]) / 2 + px * 1.5 * i) * SCALE, ((c0[1] + c1[1]) / 2 + py * 1.5 * i) * SCALE, c1[0] * SCALE, c1[1] * SCALE);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Forro: un tubo del color de la prenda por debajo de la manga o la pernera. Si la foto tiene un
// hueco o un borde transparente, se ve tela y no la piel del maniquí.
function tube(ctx, G, ta, tb, pad, color, blend) {
  if (tb <= ta) return;
  const n = Math.max(6, Math.round(((tb - ta) * G.total) / 4));
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const F = frameAt(G, lerp(ta, tb, i / n), blend), h = F.r + pad, c = [F.x, F.y];
    L.push(foldClamp(G, [F.x - F.dy * h, F.y + F.dx * h], c, F.d, h * 2.5));
    R.push(foldClamp(G, [F.x + F.dy * h, F.y - F.dx * h], c, F.d, h * 2.5));
  }
  ctx.fillStyle = color; ctx.beginPath();
  [...L, ...R.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x * SCALE, y * SCALE) : ctx.moveTo(x * SCALE, y * SCALE)));
  ctx.closePath(); ctx.fill();
}
function bandFill(ctx, rowsLR, color) {
  ctx.fillStyle = color; ctx.beginPath();
  rowsLR.forEach(([l, , y], i) => (i ? ctx.lineTo(l * SCALE, y * SCALE) : ctx.moveTo(l * SCALE, y * SCALE)));
  [...rowsLR].reverse().forEach(([, r, y]) => ctx.lineTo(r * SCALE, y * SCALE));
  ctx.closePath(); ctx.fill();
}
// Color medio (algo más oscuro, como el interior de la tela) de una pieza
function liningColor(c) {
  const s = layer(12, 12), x = s.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0, 12, 12);
  const d = x.getImageData(0, 0, 12, 12).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; n += a; }
  free(s);
  if (!n) return 'rgba(0,0,0,0)';
  return `rgb(${Math.round((r / n) * 0.9)},${Math.round((g / n) * 0.9)},${Math.round((b / n) * 0.9)})`;
}

// ---------- Piezas de la prenda ----------
// Separa las mangas de la foto (con un borde suave): así al deformar una manga no se cuela un trozo del cuerpo.
function splitTop(img, M, A) {
  const regs = A.sleeves.map((s) => s?.region || null);
  if (!regs.some(Boolean)) return { torso: img, sleeves: [null, null] };
  const small = layer(M.w, M.h), sx = small.getContext('2d');
  const copy = (mask, op) => {
    const c = layer(img.width, img.height), x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = op; x.drawImage(mask, 0, 0);
    return c;
  };
  const masks = regs.map((reg) => {
    if (!reg) return null;
    const id = sx.createImageData(M.w, M.h);
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      // Un píxel de margen para que el borde suave no corte la manga
      let on = reg[y * M.w + x];
      if (!on) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < M.w && ny < M.h && reg[ny * M.w + nx]) { on = 1; break; } }
      if (on) id.data[(y * M.w + x) * 4 + 3] = 255;
    }
    sx.clearRect(0, 0, M.w, M.h); sx.putImageData(id, 0, 0);
    const big = layer(img.width, img.height), bx = big.getContext('2d');
    bx.imageSmoothingEnabled = true; bx.drawImage(small, 0, 0, img.width, img.height);
    return big;
  });
  const sleeves = masks.map((m) => (m ? copy(m, 'destination-in') : null));
  free(small, ...masks);
  // El cuerpo usa la foto entera: su malla solo toma la columna del cuerpo (y así sus costados quedan
  // macizos, sin un borde semitransparente donde empezaban las mangas)
  return { torso: img, sleeves };
}

// ---------- Prendas de arriba ----------
// Una prenda plana mide de ancho la mitad de su contorno, pero de frente el cuerpo solo enseña
// su diámetro (contorno / π). Por eso, al pasar la foto al maniquí, el largo se escala ~π/2 más
// que el ancho: así una camiseta llega a la cadera y no se queda en la cintura.
const KV_TOP = 1.3, KV_BOTTOM = 1.5, KV_SLEEVE = 1.5;

// Largo razonable según el tipo de prenda (en coordenadas del maniquí). La foto decide dentro
// de ese margen: así una camiseta fotografiada de lado no acaba siendo un vestido.
function hemRange(kind, P) {
  const W = P.waistY, C = P.crotchY, K = P.leg[1].y, A = P.leg[2].y;
  const R = {
    crop: [W - 30, W + 12], corset: [W - 10, W + 22],
    tee: [W + 22, C + 22], polo: [W + 22, C + 22], tank: [W + 15, C + 20], shirt: [W + 22, C + 30], knit: [W + 18, C + 22],
    turtleneck: [W + 18, C + 22], sweatshirt: [W + 15, C + 20], hoodie: [W + 15, C + 22], cardigan: [W + 18, K - 20],
    blazer: [W + 20, C + 25], denimjacket: [W + 5, C + 10], leatherjacket: [W + 5, C + 10], bomber: [W + 5, C + 10], jacket: [W + 5, C + 25],
    vest: [W + 5, C + 25], puffer: [W + 5, K], coat: [C + 30, A - 20], trench: [C + 40, A - 20],
    'dress-short': [C + 15, K - 15], 'dress-slip': [C + 15, A + 10], 'dress-midi': [K - 30, A - 50], 'dress-shirt': [C + 30, A - 50],
    'dress-long': [K + 40, A + 12], gown: [K + 50, A + 12], jumpsuit: [K, A + 12], overalls: [K, A + 12],
    jeans: [A - 22, A + 10], wide: [A - 14, A + 14], trousers: [A - 14, A + 10], cargo: [A - 28, A + 10], jogger: [A - 30, A + 5], leggings: [A - 40, A + 5],
    shorts: [C + 12, K - 35], 'skirt-mini': [C + 5, C + 70], 'skirt-midi': [C + 40, A - 30], 'skirt-pleated': [C + 20, A - 30],
    'skirt-denim': [C + 10, A - 40], 'skirt-long': [K + 30, A + 10],
  };
  return R[kind] || null;
}
// Hasta dónde llega la manga (0 = hombro, 1 = muñeca)
function sleeveRange(kind) {
  if (['tee', 'polo'].includes(kind)) return [0.12, 0.45];
  // Las prendas de manga larga llegan a la muñeca (aunque en la foto la manga esté recogida)
  if (['knit', 'turtleneck', 'cardigan', 'hoodie', 'sweatshirt', 'blazer', 'denimjacket', 'leatherjacket', 'bomber', 'jacket', 'puffer', 'coat', 'trench'].includes(kind)) return [0.95, 1.03];
  return [0.1, 1.02];
}
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
// Devuelve { back, front }: back = cuerpo + mangas; front = la parte de la manga del codo hacia abajo,
// que va por encima de todo (así un antebrazo que cruza por delante del cuerpo tapa la prenda).
function renderTop(img, M, A, P, { ease, slot, kind, fit = 'normal' }) {
  const f = img.width / M.w; // de coordenadas de la máscara a píxeles de la foto
  const src = ([x, y]) => [x * f, y * f];
  const chestY = P.shoulderY + 30;
  const k = (hwAt(P.rows, chestY) + ease) / A.chest; // escala foto → maniquí (ancho)
  // La línea de hombros de la prenda pasa por encima de los hombros (bolas) del maniquí
  const shoulderT = Math.min(P.shoulderY + 2, P.arm[0].y - P.arm[0].r + 1);
  const limitHem = P.leg[2].y + 14;
  const full = Math.max(1, (A.bot - A.shoulder) * k * KV_TOP);
  const range = hemRange(kind, P) || (slot === 'one' ? [P.crotchY + 10, limitHem] : [P.waistY - 20, limitHem]);
  const hemT = clamp(shoulderT + full, [range[0], Math.min(range[1], limitHem)]);
  const kv = (hemT - shoulderT) / (A.bot - A.shoulder || 1);
  // Por encima del hombro (cuello, solapas, capucha) se recoge alrededor del cuello
  const tyc = (y) => {
    if (y >= A.shoulder) return shoulderT + (y - A.shoulder) * kv;
    const up = (A.shoulder - y) * k;
    return shoulderT - Math.min(26, up <= 10 ? up : 10 + (up - 10) * 0.35);
  };
  const bodyHW = (y) => hwAt(P.rows, Math.min(y, P.crotchY));
  const parts = splitTop(img, M, A);

  // Cuerpo: filas más densas cerca del hombro, donde hay más detalle (cuello, hombros)
  const tRows = 26, tCols = 6, TS = [], TD = [];
  const ys = [];
  const nUp = A.shoulder > A.top + 1 ? 4 : 0;
  for (let r = 0; r < nUp; r++) ys.push(lerp(A.top - 1.5, A.shoulder, r / nUp));
  for (let r = 0; r <= tRows - nUp; r++) ys.push(lerp(A.shoulder, A.bot + 1.5, r / (tRows - nUp)));
  // Hasta la cadera (o la cintura en vestidos) se ciñe al maniquí con su holgura; por debajo puede
  // abrirse (vuelo de vestidos y abrigos) y siempre cubre las piernas, aunque estén abiertas
  const flareFrom = slot === 'one' ? P.waistY + 10 : slot === 'outer' ? P.hipY + 10 : Infinity;
  for (const y of ys) {
    const yi = Math.round(y);
    const sh = A.torso(yi), m = A.midT(yi);
    const tY = tyc(y);
    const above = tY < P.shoulderY + 8;
    let thw = above ? sh * k : Math.max(bodyHW(tY) + ease, sh * k);
    if (!above) thw = Math.min(thw, bodyHW(tY) + ease + (tY < flareFrom ? 4 : 4 + (tY - flareFrom) * 0.6));
    if (tY > P.hipY) thw = Math.max(thw, legExtent(P, tY) + ease * 0.5 + 1);
    // La malla sobresale un poco del borde de la prenda para que el contorno salga suave (no cortado).
    // Si las mangas cuelgan pegadas al cuerpo, ese "borde" es la sombra entre manga y cuerpo: no se toma.
    const seam = A.hanging && A.sleeves.some(Boolean) && yi <= A.sleeveLow;
    const e = seam ? -0.6 : 1.5, she = sh + e, thwe = seam ? thw : thw * (she / Math.max(1, sh));
    TS.push(Array.from({ length: tCols + 1 }, (_, c) => src([m - she + (2 * she * c) / tCols, y])));
    TD.push(Array.from({ length: tCols + 1 }, (_, c) => toCanvas([150 - thwe + (2 * thwe * c) / tCols, tY])));
  }
  const back = layer(), bx = back.getContext('2d');
  const torsoC = layer(), tx = torsoC.getContext('2d');
  // Forro del cuerpo de la axila al bajo (no en el escote, que puede dejar ver la piel a propósito)
  const lin = liningColor(parts.torso);
  const ly0 = Math.max(P.shoulderY + 34, tyc(A.armpit)), ly1 = hemT - 3, lr = [];
  for (let i = 0; i <= 12 && ly1 > ly0; i++) { const y = lerp(ly0, ly1, i / 12); const h = bodyHW(y) + 0.5; lr.push([150 - h, 150 + h, y]); }
  if (lr.length) bandFill(tx, lr, lin);
  // Canesú: con mangas, los hombros del maniquí siempre quedan cubiertos (en las prendas fotografiadas
  // puestas el hombro cae en diagonal). El centro queda libre para el escote.
  if (A.sleeves.some(Boolean)) {
    const ap = Math.max(P.shoulderY + 24, Math.min(P.shoulderY + 48, tyc(A.armpit)));
    for (const side of [-1, 1]) {
      const nx = 150 + side * (P.neck.hw + 7);
      const pts = [[nx, shoulderT + 0.5], [150 + side * (P.shoulder + ease * 0.4 - 3), shoulderT + 1.5], [150 + side * (bodyHW(ap) + 1), ap], [nx, ap]];
      tx.fillStyle = lin; tx.beginPath();
      pts.forEach(([x, y], i) => (i ? tx.lineTo(x * SCALE, y * SCALE) : tx.moveTo(x * SCALE, y * SCALE)));
      tx.closePath(); tx.fill();
    }
  }
  drawGrid(tx, parts.torso, TS, TD);
  applyShade(torsoC, shadeMap(torsoC, { R: 10, dark: 0.24, lift: 0.06 }));

  // Mangas: siguen el brazo del maniquí (con su pose), se doblan en el codo y lo cubren entero
  const sleeves = [], fronts = [];
  const ROWS = 16, COLS = 3, ROOT_S = 0.25, FADE_S = 0.4;
  A.sleeves.forEach((sl, idx) => {
    const simg = parts.sleeves[idx];
    if (!sl || !simg) return;
    const side = idx === 0 ? 1 : -1; // 1: brazo izquierdo de la pantalla
    const arm = idx === 0 ? P.arm : armR(P);
    const G = limbGeom(arm);
    const elbowT = G.segs[0].len / G.total;
    // Largo de la manga: el de la foto, dentro de lo normal para el tipo de prenda. Las mangas
    // casi tan largas como el cuerpo son largas aunque en la foto estén algo dobladas.
    let tNat = 0.04 + (sl.len * Math.min(k * KV_SLEEVE, (kv * KV_SLEEVE) / KV_TOP)) / G.total;
    const torsoLen = Math.min(A.bot - A.shoulder, (A.armpit - A.shoulder) * 3);
    if (sl.len / torsoLen > 0.58) tNat = Math.max(tNat, 0.92);
    const tEnd = clamp(tNat, sleeveRange(kind));
    const t0 = fit === 'oversize' ? 0.13 : fit === 'holgada' ? 0.08 : 0.04; // hombro caído
    const blend = Math.max(12, Math.min(26, arm[1].r * 2 + ease));
    const nOut = (F) => [-side * F.dy, side * F.dx]; // hacia fuera del brazo
    // Hombro: la costura pasa por encima del hombro del maniquí y rodea la parte de arriba del brazo
    const F0 = frameAt(G, 0.06, blend), n0 = nOut(F0);
    const shoulderPt = [150 - side * (P.shoulder + ease * 0.6), shoulderT];
    const capR = arm[0].r + 2 + ease * 0.5;
    const capPt = [arm[0].x + n0[0] * capR - F0.dx * arm[0].r * 0.7, arm[0].y + n0[1] * capR - F0.dy * arm[0].r * 0.7];
    const tRoot = t0 + 0.3 * (tEnd - t0);
    const Fr = frameAt(G, tRoot, blend), nr = nOut(Fr), halfR = Fr.r + ease * 0.7 + 2;
    const out03 = [Fr.x + nr[0] * halfR, Fr.y + nr[1] * halfR];
    // Axila en el costado del cuerpo; si el brazo se levanta, la sisa sube con él
    let apY = Math.min(P.shoulderY + 62, Math.max(P.shoulderY + 22, tyc(A.armpit)));
    apY = Math.max(P.shoulderY + 14, Math.min(apY, Fr.y - nr[1] * halfR + 6));
    const armpitPt = [150 - side * (bodyHW(apY) + ease), apY];
    const wTip = (Math.hypot(sl.tipTop[0] - sl.tipBot[0], sl.tipTop[1] - sl.tipBot[1]) / 2) * k;
    const S = [], D = [];
    let kSplit = -1;
    for (let r = 0; r <= ROWS; r++) {
      const s = r / ROWS;
      const sTop = lerpP(sl.rootTop, sl.tipTop, s), sBot = lerpP(sl.rootBot, sl.tipBot, s);
      const t = t0 + s * (tEnd - t0);
      if (t <= elbowT - 0.06) kSplit = r;
      const F = frameAt(G, t, blend), n = nOut(F);
      // Ancho: el del brazo con holgura; si el puño de la foto es más ancho (manga farol, oversize),
      // la manga se va abriendo hacia él
      const base = F.r + ease * 0.7 + 2;
      const half = s > 0.3 ? Math.max(base, lerp(base, Math.min(wTip, F.r * 2.6 + ease), (s - 0.3) / 0.7)) : base;
      const outer = [F.x + n[0] * half, F.y + n[1] * half];
      const inner = [F.x - n[0] * half, F.y - n[1] * half];
      // Cerca del hombro la manga sale de la sisa del cuerpo
      const w = smooth(Math.min(1, s / 0.3)), u = Math.min(1, s / 0.3);
      const bez = [0, 1].map((i) => (1 - u) * (1 - u) * shoulderPt[i] + 2 * (1 - u) * u * capPt[i] + u * u * out03[i]);
      const dOut = s < 0.3 ? bez : outer, dIn = lerpP(armpitPt, inner, w);
      const ext = (c) => -0.05 + (1.1 * c) / COLS; // un poco más allá de los bordes de la manga
      S.push(Array.from({ length: COLS + 1 }, (_, c) => src(lerpP(sTop, sBot, ext(c)))));
      D.push(Array.from({ length: COLS + 1 }, (_, c) => {
        const p = lerpP(dOut, dIn, ext(c));
        return toCanvas(s < 0.3 ? p : foldClamp(G, p, [F.x, F.y], F.d, half * 2.5));
      }));
    }
    // Sombra calculada con la manga entera (así no aparece una línea donde se separan las partes)
    const lo = layer(W_VB, H_VB);
    drawGrid(lo.getContext('2d'), simg, S, D, 1 / SCALE);
    const map = shadeMap(lo, { R: 6, dark: 0.3, lift: 0.07 });
    const halfElbow = arm[1].r + ease * 0.7 + 2;
    const sl_lin = liningColor(simg);
    const tAt = (row) => t0 + (row / ROWS) * (tEnd - t0);
    const piece = (from, to) => {
      const c = layer(), x = c.getContext('2d');
      // El forro acaba antes que la manga: así no asoma en puños cortados en diagonal
      tube(x, G, Math.max(0.02, tAt(from)), Math.min(tAt(Math.min(ROWS, to - 1)), tEnd - 0.07), 1, sl_lin, blend);
      drawGrid(x, simg, S.slice(from, to), D.slice(from, to));
      foldLines(x, G, halfElbow, tEnd);
      applyShade(c, map);
      return c;
    };
    const rootRow = Math.round(ROOT_S * ROWS);
    // La parte de la sisa va debajo del cuerpo (sin huecos); el resto encima, entrando fundida
    const under = piece(0, rootRow + 4);
    const whole = piece(0, ROWS + 1), wx = whole.getContext('2d');
    const mid = (row) => [(row[0][0] + row[COLS][0]) / 2, (row[0][1] + row[COLS][1]) / 2];
    const fa = mid(D[rootRow]), fb = mid(D[Math.round(FADE_S * ROWS)]);
    const fade = wx.createLinearGradient(fa[0], fa[1], fb[0], fb[1]);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    wx.save(); wx.globalCompositeOperation = 'destination-in'; wx.fillStyle = fade; wx.fillRect(0, 0, whole.width, whole.height); wx.restore();
    bx.drawImage(under, 0, 0);
    sleeves.push(whole);
    if (tEnd > elbowT + 0.05 && kSplit >= Math.round(FADE_S * ROWS) - 1) fronts.push(piece(kSplit, ROWS + 1));
    free(lo, map, under);
  });
  bx.drawImage(torsoC, 0, 0);
  sleeves.forEach((c) => bx.drawImage(c, 0, 0));
  let front = null;
  if (fronts.length) { front = layer(); const fx = front.getContext('2d'); fronts.forEach((c) => fx.drawImage(c, 0, 0)); }
  free(torsoC, ...sleeves, ...fronts);
  if (parts.torso !== img) free(parts.torso);
  parts.sleeves.forEach((c) => c && free(c));
  return { back, front };
}

// ---------- Prendas de abajo ----------
function renderBottom(img, M, A, P, { ease, kind, fit = 'normal', rise = 'medio' }) {
  const f = img.width / M.w;
  const src = ([x, y]) => [x * f, y * f];
  const waistT = waistFor(rise, P); // tiro bajo en la cadera, tiro alto en la cintura
  const bodyHW = (y) => hwAt(P.rows, Math.min(y, P.crotchY));
  // Escala por la cadera (no cambia con el tiro): así un tiro bajo no agranda todo el pantalón
  let k = (hwAt(P.rows, waistT) + ease) / A.waist;
  if (A.kind === 'pants') {
    const hipRow = Math.round(A.crotch - (A.crotch - A.top) * 0.12);
    const [ha, hb] = A.full(hipRow);
    const hipHalf = (hb - ha) / 2;
    if (hipHalf > A.waist * 0.8) k = (bodyHW(P.crotchY - 8) + ease) / hipHalf;
  }
  const out = layer(), ctx = out.getContext('2d');
  if (A.kind === 'skirt') {
    const limit = P.leg[2].y + 10;
    const range = hemRange(kind, P)?.slice() || [P.crotchY + 5, limit];
    if (range[0] < P.crotchY) range[0] = P.crotchY + 5; // un pantalón tratado como falda (sin perneras visibles)
    const hemT = clamp(waistT + (A.bot - A.top) * k * KV_BOTTOM, [range[0], Math.min(range[1], limit)]);
    const kv = (hemT - waistT) / ((A.bot - A.top) || 1);
    const rows = 20, cols = 6, S = [], D = [];
    for (let r = 0; r <= rows; r++) {
      const y = lerp(A.top, A.bot, r / rows);
      const [a, b] = A.full(Math.round(y));
      const sh = (b - a) / 2, mid = (a + b) / 2;
      const tY = waistT + (y - A.top) * kv;
      // La cinturilla se ciñe al cuerpo; el vuelo empieza a abrirse desde la cadera
      let thw = Math.max(bodyHW(tY) + ease, sh * k);
      thw = Math.min(thw, bodyHW(tY) + ease + Math.max(0, tY - waistT) * 0.35 + (tY > P.hipY ? (tY - P.hipY) * 0.5 : 0));
      thw = Math.max(thw, legExtent(P, tY) + ease * 0.5 + 1);
      const she = sh + 1.5, thwe = thw * (she / Math.max(1, sh));
      S.push(Array.from({ length: cols + 1 }, (_, c) => src([mid - she + (2 * she * c) / cols, y])));
      D.push(Array.from({ length: cols + 1 }, (_, c) => toCanvas([150 - thwe + (2 * thwe * c) / cols, tY])));
    }
    const lr = D.slice(1, -1).map((row) => [row[0][0] / SCALE + 2, row[cols][0] / SCALE - 2, row[0][1] / SCALE]);
    bandFill(ctx, lr, liningColor(img));
    drawGrid(ctx, img, S, D);
    applyShade(out, shadeMap(out, { R: 9, dark: 0.26, lift: 0.06 }));
    return { back: out, front: null };
  }
  // Pantalón: caderas (cinturilla → entrepierna) ceñidas al cuerpo + dos perneras que siguen las piernas
  const crotchT = P.crotchY + 2;
  const hipRows = 8, cols = 6, S = [], D = [];
  for (let r = 0; r <= hipRows; r++) {
    const y = lerp(A.top, A.crotch, r / hipRows);
    const [a, b] = A.full(Math.round(y));
    const sh = (b - a) / 2, mid = (a + b) / 2;
    const tY = lerp(waistT, crotchT, r / hipRows);
    // La cinturilla abraza la cintura (nada sobresale por los lados); hacia la entrepierna gana holgura
    const thw = Math.max(bodyHW(tY) + ease * (0.55 + 0.45 * (r / hipRows)), legExtent(P, tY) + ease * 0.4 + 1);
    const she = sh + 1.5, thwe = thw * (she / Math.max(1, sh));
    S.push(Array.from({ length: cols + 1 }, (_, c) => src([mid - she + (2 * she * c) / cols, y])));
    D.push(Array.from({ length: cols + 1 }, (_, c) => toCanvas([150 - thwe + (2 * thwe * c) / cols, tY])));
  }
  // Forro de la cadera y de las piernas (tapa huecos de la foto, como el interior de la cinturilla)
  const lin = liningColor(img);
  bandFill(ctx, D.slice(1).map((row) => [row[0][0] / SCALE + 1.5, row[cols][0] / SCALE - 1.5, row[0][1] / SCALE]), lin);
  drawGrid(ctx, img, S, D);
  const hipHW = (D[hipRows][cols][0] - D[hipRows][0][0]) / 2 / SCALE; // ancho final de la cadera
  const range = hemRange(kind, P) || [P.crotchY + 12, P.leg[2].y + 10];
  const hemY = clamp(crotchT + (A.bot - A.crotch) * k * KV_BOTTOM, [Math.max(range[0], crotchT + 10), range[1]]);
  const legGeo = [['L', P.leg, 1], ['R', legR(P), -1]].map(([which, leg, side]) => {
    const G = limbGeom(leg);
    const blend = Math.max(14, Math.min(28, leg[1].r * 1.8 + ease));
    const tStart = Math.max(0, (crotchT - leg[0].y) / G.total);
    // Largo hasta el bajo medido a lo largo de la pierna (con la pose, la pierna puede ir inclinada)
    const legH = Math.max(1, leg[leg.length - 1].y - leg[0].y);
    const tEnd = Math.min(1.04, (hemY - leg[0].y) / legH);
    return { which, leg, side, G, blend, tStart, tEnd };
  });
  // Primero los forros de las dos piernas (si una pernera tapa a la otra, el forro no pisa la tela)
  legGeo.forEach(({ G, blend, tStart, tEnd }) => tube(ctx, G, tStart, tEnd - 0.05, 1, lin, blend));
  const legs = [];
  legGeo.forEach(({ which, leg, side, G, blend, tStart, tEnd }) => {
    const fn = which === 'L' ? A.legL : A.legR;
    const rows = 18, lc = 3, LS = [], LD = [];
    let last = null;
    for (let r = 0; r <= rows; r++) {
      const s = r / rows;
      const y = Math.round(lerp(A.crotch + 1, A.bot, s));
      const run = fn(y) || last;
      if (!run) return;
      let [a, b] = run;
      // Un bajo deshilachado o irregular no puede estrechar de golpe la pernera
      if (last && s > 0.7) {
        const prevHalf = (last[1] - last[0]) / 2, c = (a + b) / 2;
        if ((b - a) / 2 < prevHalf * 0.88) { a = c - prevHalf * 0.88; b = c + prevHalf * 0.88; }
      }
      last = [a, b];
      const half0 = (b - a) / 2;
      const F = frameAt(G, lerp(tStart, tEnd, s), blend);
      // Siempre más ancha que la pierna: la pierna nunca asoma por los lados
      const half = Math.max(F.r + ease * 0.6 + 1.5, half0 * k * LEG_WIDTH[fit]);
      const n = [-side * F.dy, side * F.dx];
      let outer = [F.x + n[0] * half, F.y + n[1] * half];
      let inner = [F.x - n[0] * half, F.y - n[1] * half];
      // Arriba, la pernera sale de la cadera sin escalón
      const w = smooth(Math.min(1, s / 0.3));
      outer = lerpP([150 - side * hipHW, crotchT], outer, w);
      inner = lerpP([150, crotchT], inner, w);
      // En la foto, el lado exterior de la pernera izquierda es el borde izquierdo
      const sOut = side > 0 ? a : b, sIn = side > 0 ? b : a;
      const ext = (c) => -0.05 + (1.1 * c) / lc;
      LS.push(Array.from({ length: lc + 1 }, (_, c) => src([lerp(sOut, sIn, ext(c)), y])));
      LD.push(Array.from({ length: lc + 1 }, (_, c) => {
        const p = lerpP(outer, inner, ext(c));
        return toCanvas(s < 0.3 ? p : foldClamp(G, p, [F.x, F.y], F.d, half * 2.5));
      }));
    }
    drawGrid(ctx, img, LS, LD);
    legs.push({ G, LD, lc, half: leg[1].r + ease * 0.6 + 1.5, tEnd });
  });
  applyShade(out, shadeMap(out, { R: 9, dark: 0.26, lift: 0.06 }));
  // Línea interior de cada pernera (se ve aunque las perneras se toquen) y pliegues en las rodillas
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.lineCap = 'round';
  legs.forEach(({ LD, lc }) => {
    ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.lineWidth = 2.2 * SCALE;
    ctx.beginPath();
    LD.slice(4).forEach((row, i) => { const p = lerpP(row[lc - 1], row[lc], 0.55); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
  });
  ctx.restore();
  legs.forEach(({ G, half, tEnd }) => foldLines(ctx, G, half, tEnd));
  return { back: out, front: null };
}

// ---------- Calzado y bolsos ----------
// Pieza principal de la foto (si hay dos zapatos, el más grande)
function mainPart(M) {
  const lab = new Int32Array(M.w * M.h).fill(-1);
  let best = null;
  for (let i = 0; i < M.w * M.h; i++) {
    if (!M.m[i] || lab[i] >= 0) continue;
    const st = [i]; lab[i] = i;
    let n = 0, x0 = M.w, x1 = 0, y0 = M.h, y1 = 0;
    while (st.length) {
      const j = st.pop(), x = j % M.w, y = (j - x) / M.w;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [x > 0 ? j - 1 : -1, x < M.w - 1 ? j + 1 : -1, y > 0 ? j - M.w : -1, y < M.h - 1 ? j + M.w : -1]) if (k >= 0 && M.m[k] && lab[k] < 0) { lab[k] = i; st.push(k); }
    }
    if (!best || n > best.n) best = { n, x0, x1, y0, y1, id: i };
  }
  if (!best) return null;
  const top = (x) => { for (let y = best.y0; y <= best.y1; y++) if (lab[y * M.w + x] === best.id) return y; return best.y1; };
  return { ...best, w: best.x1 - best.x0 + 1, h: best.y1 - best.y0 + 1, top };
}

// Zapatos de perfil: cada pie lleva el suyo, con la puntera hacia fuera (como en un figurín de moda)
function renderShoes(ctx, img, M, P, kind) {
  const B = mainPart(M);
  if (!B) return;
  const f = img.width / M.w;
  // El talón es el lado más alto del perfil (el tobillo); la puntera, el más bajo
  const q = Math.max(1, Math.round(B.w * 0.22));
  let lt = 0, rt = 0;
  for (let i = 0; i < q; i++) { lt += B.top(B.x0 + i); rt += B.top(B.x1 - i); }
  const toeRight = lt < rt;
  const tall = /boots/.test(kind) || B.h / B.w > 0.75;
  [[P.leg, -1, 0], [legR(P), 1, 1]].forEach(([leg, out, i]) => {
    const a = leg[leg.length - 1];
    const L = P.footLen ? P.footLen[i] * (tall ? 1.05 : 1.12) : a.r * (tall ? 4.9 : 5.3);
    const H = (L * B.h) / B.w;
    const sole = P.sole ? P.sole[i] : a.y + 21; // en tu foto, a la altura de tus talones
    const heelX = a.x - out * a.r * 0.95; // el talón queda bajo el tobillo, un poco hacia dentro
    const x0 = out > 0 ? heelX : heelX - L;
    ctx.save();
    // Sombra de contacto en el suelo
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.beginPath(); ctx.ellipse((x0 + L / 2) * SCALE, sole * SCALE, (L / 2) * SCALE, 2.6 * SCALE, 0, 0, Math.PI * 2); ctx.fill();
    // Volteamos la foto si su puntera no apunta hacia fuera
    const flip = (out > 0) !== toeRight;
    ctx.translate((flip ? x0 + L : x0) * SCALE, (sole - H) * SCALE);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.drawImage(img, B.x0 * f, B.y0 * f, B.w * f, B.h * f, 0, 0, L * SCALE, H * SCALE);
    ctx.restore();
  });
}

// Bolso: colgado de la mano derecha de la pantalla (por el asa) o sujeto en la mano si es un clutch
function renderBag(ctx, img, M, P, item) {
  const B = mainPart(M);
  if (!B) return;
  const f = img.width / M.w;
  const name = `${item.subtype || ''} ${item.name || ''}`.toLowerCase();
  const factor = /tote|shopper/.test(name) ? 1.2 : /clutch|cartera|sobre/.test(name) ? 0.62 : /mochila|backpack/.test(name) ? 1 : 0.9;
  // Asa: filas de arriba mucho más estrechas que el cuerpo del bolso
  const rowW = (y) => { let n = 0; for (let x = B.x0; x <= B.x1; x++) if (M.m[y * M.w + x]) n++; return n; };
  let bodyTop = B.y0;
  while (bodyTop < B.y1 && rowW(bodyTop) < B.w * 0.6) bodyTop++;
  const hasHandle = bodyTop - B.y0 > B.h * 0.12;
  const torsoW = 2 * hwAt(P.rows, P.waistY);
  const W = torsoW * factor;
  const k = W / B.w;
  const H = B.h * k;
  const arm = armR(P);
  const w = chainPoint(arm, 1);
  // Con la mano en la cintura, el bolso se lleva en el pliegue del codo
  const hand = P.bagAt === 'elbow' ? [arm[1].x + 2, arm[1].y + arm[1].r * 0.6] : [w.x + w.dx * w.r * 1.3, w.y + w.dy * w.r * 1.3];
  const x0 = hand[0] - W / 2 + 4;
  const y0 = hasHandle ? hand[1] - 2 : hand[1] - H * 0.45;
  ctx.save();
  ctx.translate(x0 * SCALE, y0 * SCALE);
  ctx.rotate(-0.04);
  ctx.drawImage(img, B.x0 * f, B.y0 * f, B.w * f, B.h * f, 0, 0, W * SCALE, H * SCALE);
  ctx.restore();
}

// Devuelve { src, front } con la prenda colocada en el maniquí (lienzo de 900 × 1920) o null si no se puede.
// src va por debajo de los antebrazos y front (la manga del codo hacia abajo) por encima.
// custom: { key, P } para vestir un cuerpo que no es el maniquí (tu foto o el maniquí con una pose)
export async function renderReal(item, slot, figure, trimmedSrc, custom = null) {
  if (!['top', 'outer', 'one', 'bottom', 'shoes', 'bag'].includes(slot)) return null;
  const key = `${item.id}:${slot}:${custom ? custom.key : figure}:${item.fit || ''}:${item.rise || ''}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const img = await loadImg(trimmedSrc || item.img);
    const P = custom?.P || FIG[figure] || FIG.neutro;
    const M = maskOf(img);
    if (M.area < 50) return null;
    const kind = garmentKind(item);
    if (slot === 'shoes' || slot === 'bag') {
      const c = layer(), ctx = c.getContext('2d');
      if (slot === 'shoes') renderShoes(ctx, img, M, P, kind); else renderBag(ctx, img, M, P, item);
      const src = c.toDataURL('image/png'); free(c);
      return { src };
    }
    let fit, rise, res;
    if (slot === 'bottom') {
      const A = analyzeBottom(M);
      fit = fitOf(item, A).fit; rise = riseOf(item, A).rise;
      // Si el usuario dijo que era pantalón pero no se ven perneras (p. ej. doblado), se trata como falda
      res = renderBottom(img, M, A, P, { ease: kind === 'leggings' ? 0.5 : EASE_BOTTOM[fit], kind, fit, rise });
    } else {
      const A = analyzeTop(M, kind);
      fit = fitOf(item, A).fit;
      const base = EASE_TOP[fit] + (['knit', 'sweatshirt', 'hoodie'].includes(kind) ? 1.5 : 0);
      const ease = slot === 'outer' ? base + 5 : slot === 'one' ? Math.max(1, base - 1.5) : base;
      res = renderTop(img, M, A, P, { ease, slot, kind, fit });
    }
    const out = { src: res.back.toDataURL('image/png'), front: res.front ? res.front.toDataURL('image/png') : null, fit, rise };
    free(res.back, res.front);
    return out;
  })().catch((e) => { console.warn('renderReal', e); return null; });
  cache.set(key, p);
  return p;
}

// Solo para pruebas: análisis de la silueta de una imagen
export async function _analyze(src, slot) {
  const img = await loadImg(src);
  const M = maskOf(img);
  return { M, A: slot === 'bottom' ? analyzeBottom(M) : analyzeTop(M), f: img.width / M.w };
}
