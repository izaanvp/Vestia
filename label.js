// Lectura de la etiqueta de la prenda (OCR en el propio móvil con tesseract.js).
// Saca la composición (en varios idiomas), los cuidados y el país de fabricación.
// Los símbolos de lavado son dibujos y no se leen; si no hay texto de cuidados, Vistelo los recomienda por el material.

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
let worker = null;
let progressCb = () => {};

export async function loadOCR(onProgress = () => {}) {
  progressCb = onProgress;
  if (worker) return worker;
  const T = await import(TESS);
  const mod = T.default || T;
  worker = await mod.createWorker(['spa', 'eng'], 1, {
    logger: (m) => {
      const what = /core/.test(m.status) ? 'Preparando el lector' : /language|traineddata/.test(m.status) ? 'Descargando el idioma' : /recogn/.test(m.status) ? 'Leyendo la etiqueta' : 'Preparando';
      progressCb(what, m.progress || 0);
    },
  });
  return worker;
}

// Fibras: nombre en español → cómo puede aparecer en la etiqueta
const FIBERS = [
  ['Algodón', /algod[oóo0]n|cotton|coton|cotone|algod[aã]o|baumwolle|katoen/],
  ['Poliéster', /poli[eé]ster|polyester|polyest[eè]re|poliestere|poli[eé]st/],
  ['Elastano', /elastan[oe]?|elasthanne|spandex|lycra|elastomer/],
  ['Viscosa', /viscos[ae]|rayon/],
  ['Lino', /\blino\b|linen|leinen|linho/],
  ['Lana', /\blana\b|\bwool|laine|wolle|merino/],
  ['Seda', /\bseda\b|silk|soie|\bseta\b/],
  ['Poliamida', /poliam[ií]d[ae]|polyamid[e]?|nylon|nailon|poliammide/],
  ['Acrílico', /acr[ií]lic[oa]|acrylic|acrylique/],
  ['Cachemira', /cachemir[ae]|cashmere|kaschmir/],
  ['Lyocell', /lyocell|tencel/],
  ['Modal', /\bmodal\b/],
  ['Mohair', /mohair/],
  ['Alpaca', /alpaca/],
  ['Piel', /\bcuero\b|\bpiel\b|leather|\bcuir\b|leder/],
];

const CARE_RULES = [
  [/lavar a mano|hand ?wash|lavage [aà] la main/, 'Lavar a mano'],
  [/no (usar|utilizar) lej[ií]a|do not bleach|no blanquear|ne pas blanchir/, 'No usar lejía'],
  [/no (secar en )?secadora|do not tumble ?dry|no usar secadora|ne pas s[eé]cher en tambour/, 'No usar secadora'],
  [/secadora (a )?baja|tumble ?dry low/, 'Secadora a baja temperatura'],
  [/no planchar|do not iron|ne pas repasser/, 'No planchar'],
  [/planchar (a )?baja|iron low|cool iron|planchar (a )?temperatura baja/, 'Planchar a baja temperatura'],
  [/planchar (a )?media|iron medium/, 'Planchar a temperatura media'],
  [/no (limpiar|lavar) en seco|do not dry ?clean/, 'No limpiar en seco'],
  [/limpieza en seco|dry ?clean(?! *only)|nettoyage [aà] sec/, 'Se puede limpiar en seco'],
  [/(solo|s[oó]lo) limpieza en seco|dry ?clean only/, 'Solo limpieza en seco'],
  [/del rev[eé]s|inside out|[aà] l'envers/, 'Lavar y planchar del revés'],
  [/secar en plano|dry flat|s[eé]cher [aà] plat/, 'Secar en plano'],
  [/no retorcer|do not wring|ne pas essorer/, 'No retorcer'],
  [/lavar por separado|wash separately|colores oscuros|dark colou?rs/, 'Lavar por separado'],
];

// Cuidados recomendados según la fibra principal (cuando la etiqueta no los trae en texto)
const ADVICE = {
  Algodón: ['Lavar a 30–40 °C', 'Planchar a temperatura media', 'Secadora a baja temperatura o tender a la sombra'],
  Poliéster: ['Lavar a 30 °C', 'No usar secadora a temperatura alta', 'Planchar a baja temperatura'],
  Lana: ['Lavar a mano en frío o programa de lana', 'Secar en plano', 'No usar secadora'],
  Cachemira: ['Lavar a mano en frío', 'Secar en plano, sin retorcer', 'Guardar doblada, nunca colgada'],
  Seda: ['Lavar a mano en frío o limpieza en seco', 'No retorcer', 'Planchar del revés a baja temperatura'],
  Viscosa: ['Lavar a 30 °C en programa delicado', 'No retorcer', 'Planchar del revés a baja temperatura'],
  Lino: ['Lavar a 40 °C', 'Planchar con la prenda algo húmeda', 'Tender a la sombra'],
  Elastano: ['Lavar en frío', 'No usar secadora', 'No planchar sobre las zonas elásticas'],
  Poliamida: ['Lavar a 30 °C', 'No usar secadora a temperatura alta', 'Planchar a baja temperatura'],
  Acrílico: ['Lavar a 30 °C', 'Secar en plano', 'Planchar a baja temperatura'],
  Lyocell: ['Lavar a 30 °C en delicado', 'Planchar a temperatura media'],
  Modal: ['Lavar a 30 °C', 'Planchar a baja temperatura'],
  Piel: ['No lavar: limpieza especializada en piel', 'Hidratar con crema para piel', 'Guardar lejos del sol'],
};

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[|]/g, 'l');

// Interpreta el texto leído
export function parseLabel(raw) {
  const r = parseText(raw);
  if (r.composition.length) return r;
  // Letras separadas por el lector («Co TON», «ALGO DÓN»): se prueba sin espacios
  const tight = parseText(raw.replace(/([A-Za-zÁÉÍÓÚáéíóúñÑ])\s(?=[A-Za-zÁÉÍÓÚáéíóúñÑ])/g, '$1'));
  return tight.composition.length ? { ...tight, care: r.care.length ? r.care : tight.care, advice: tight.advice } : r;
}

function parseText(raw) {
  const text = raw.replace(/\s+/g, ' ');
  const low = fold(text);
  const comp = [];
  // «95% ALGODÓN» o «ALGODÓN 95%» (el % a veces sale como «°/o» u «o/o»)
  const PCT = '(\\d{1,3})\\s?(?:%|°\\/o|o\\/o|\\/o|9o)';
  for (const [name, re] of FIBERS) {
    const src = re.source.replace(/\\b/g, '');
    const m = low.match(new RegExp(`${PCT}\\s*(?:de\\s+)?[a-z ]{0,6}?(?:${src})`)) || low.match(new RegExp(`(?:${src})[a-z]*\\s*[:-]?\\s*${PCT}`));
    if (m) { const pct = +m[1]; if (pct > 0 && pct <= 100) comp.push({ fiber: name, pct }); }
    else if (re.test(low) && !comp.some((c) => c.fiber === name)) comp.push({ fiber: name, pct: null });
  }
  // Etiquetas en columnas: «74% 24% 2%» y debajo «Algodón Poliamida Elastano»
  const row = low.match(/(\d{1,3})\s?%[^a-z0-9]{0,14}(\d{1,3})\s?%(?:[^a-z0-9]{0,14}(\d{1,3})\s?%)?(?:[^a-z0-9]{0,14}(\d{1,3})\s?%)?/);
  if (row) {
    const pcts = row.slice(1).filter(Boolean).map(Number);
    const after = low.slice(row.index + row[0].length);
    const order = FIBERS.map(([name, re]) => ({ name, at: after.search(re) })).filter((f) => f.at >= 0 && f.at < 160).sort((a, b) => a.at - b.at);
    if (order.length >= pcts.length && pcts.reduce((a, b) => a + b, 0) <= 100) {
      pcts.forEach((pc, i) => {
        const f = comp.find((c) => c.fiber === order[i].name);
        if (f) { if (f.pct == null) f.pct = pc; } else comp.push({ fiber: order[i].name, pct: pc });
      });
    }
  }
  // «ELASTAN5%» a veces se lee «ELASTANS%»: si falta un porcentaje y el resto no llega a 100, se completa
  const known = comp.filter((c) => c.pct).reduce((a, c) => a + c.pct, 0);
  const missing = comp.filter((c) => c.pct == null);
  if (known && known < 100 && missing.length === 1) missing[0].pct = 100 - known;
  // Una sola fibra y un «100» en la etiqueta: 100 %
  if (comp.length === 1 && comp[0].pct == null && /\b1\s?[0o]\s?[0o]\b/.test(low)) comp[0].pct = 100;
  comp.sort((a, b) => (b.pct || 0) - (a.pct || 0));
  // Si la suma pasa mucho de 100, la etiqueta tiene varias partes (exterior, forro…): nos quedamos con las primeras
  let sum = 0;
  const main = comp.filter((c) => { if (c.pct == null) return comp.every((x) => x.pct == null); if (sum >= 100) return false; sum += c.pct; return true; });
  const care = [];
  const temp = low.match(/(?:lavar|wash|lavado|max\.?|maximo)[^0-9]{0,18}(\d{2})\s?(?:º|°|o)?\s?c\b/) || low.match(/\b(30|40|60|90)\s?(?:º|°)\s?c\b/);
  if (temp) care.push(`Lavar a máquina a ${temp[1]} °C como máximo`);
  CARE_RULES.forEach(([re, t]) => { if (re.test(low) && !care.includes(t)) care.push(t); });
  // Evita contradicciones («no planchar» y «planchar a baja»)
  const drop = (t) => { const i = care.indexOf(t); if (i >= 0) care.splice(i, 1); };
  if (care.includes('No planchar')) { drop('Planchar a baja temperatura'); drop('Planchar a temperatura media'); }
  if (care.includes('Solo limpieza en seco') || care.includes('No limpiar en seco')) drop('Se puede limpiar en seco');
  if (care.includes('No usar secadora')) drop('Secadora a baja temperatura');
  const origin = text.match(/(?:hecho en|fabricado en|made in|fabrique en|fabriqu[eé] en|prodotto in)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]{3,20})/i)?.[1] || '';
  const size = text.match(/\b(?:talla|size|taille)\s*[:.]?\s*(XXS|XS|S|M|L|XL|XXL|\d{2})\b/i)?.[1] || '';
  const top = main[0]?.fiber;
  return {
    composition: main,
    care,
    advice: care.length ? [] : ADVICE[top] || [],
    origin: origin ? origin.charAt(0).toUpperCase() + origin.slice(1).toLowerCase() : '',
    size,
    text: text.slice(0, 600),
  };
}

// Mayor zona clara y poco saturada (con los huecos de las letras cerrados). Devuelve también sus píxeles.
function brightest(d, lum, w, h, thr) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    m[i] = lum[i] >= thr && Math.max(r, g, b) - Math.min(r, g, b) < 40 ? 1 : 0;
  }
  // Cierre: dilatar 2 px y erosionar 1 px (rellena las letras sin unir la etiqueta con la tela)
  const grow = (src, r) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx]) { on = 1; break; } }
      out[y * w + x] = on;
    }
    return out;
  };
  const shrink = (src, r) => { const inv = src.map((v) => 1 - v); return grow(inv, r).map((v) => 1 - v); };
  const m2 = shrink(grow(m, 2), 1);
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let i = 0; i < w * h; i++) {
    if (!m2[i] || seen[i]) continue;
    const st = [i], px = []; seen[i] = 1; let x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j - x) / w; px.push(j);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (q >= 0 && m2[q] && !seen[q]) { seen[q] = 1; st.push(q); }
    }
    if (!best || px.length > best.n) best = { n: px.length, x0, x1, y0, y1, px };
  }
  return best;
}

// Busca la etiqueta: la zona clara con forma de rectángulo. La aísla (lo de fuera pasa a blanco) y la endereza.
function findLabel(source) {
  const S = 200, k = S / Math.max(source.width, source.height);
  const w = Math.max(8, Math.round(source.width * k)), h = Math.max(8, Math.round(source.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(source, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const sorted = Float32Array.from(lum).sort();
  const pct = (q) => sorted[Math.floor(lum.length * q)];
  let best = null;
  for (const thr of [pct(0.97) - 14, pct(0.93) - 16, pct(0.85) - 12, pct(0.7)]) {
    const comp = brightest(d, lum, w, h, Math.max(140, thr));
    if (!comp) continue;
    const frac = comp.n / (w * h), fill = comp.n / ((comp.x1 - comp.x0 + 1) * (comp.y1 - comp.y0 + 1));
    if (frac >= 0.02 && frac <= 0.7 && fill > 0.4) { best = comp; break; }
  }
  if (!best) return source; // no hay una etiqueta clara: se lee la foto entera
  // Inclinación: eje principal de la etiqueta, llevado al múltiplo de 90° más cercano
  let mx = 0, my = 0;
  best.px.forEach((j) => { mx += j % w; my += (j / w) | 0; });
  mx /= best.n; my /= best.n;
  let sxx = 0, syy = 0, sxy = 0;
  best.px.forEach((j) => { const x = (j % w) - mx, y = ((j / w) | 0) - my; sxx += x * x; syy += y * y; sxy += x * y; });
  const theta = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
  // Solo se endereza si la etiqueta es claramente alargada (en una casi cuadrada el eje no es fiable)
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const ratio = Math.sqrt((tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc));
  const skew = ratio > 1.5 ? theta - Math.round(theta / 90) * 90 : 0;
  // Máscara a tamaño real: fuera de la etiqueta, blanco
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  const mg = mc.getContext('2d'); const mid = mg.createImageData(w, h);
  // Se recorta 1 px del borde para no arrastrar la tela de alrededor
  const inC = new Uint8Array(w * h); best.px.forEach((j) => (inC[j] = 1));
  best.px.forEach((j) => { const x = j % w; if (inC[j - 1] && inC[j + 1] && inC[j - w] && inC[j + w] && x > 0 && x < w - 1) mid.data[j * 4 + 3] = 255; });
  mg.putImageData(mid, 0, 0);
  const pad = 2;
  const sx = Math.max(0, (best.x0 - pad) / k), sy = Math.max(0, (best.y0 - pad) / k);
  const sw = Math.min(source.width - sx, (best.x1 - best.x0 + 1 + pad * 2) / k), sh = Math.min(source.height - sy, (best.y1 - best.y0 + 1 + pad * 2) / k);
  const out = document.createElement('canvas'); out.width = Math.round(sw); out.height = Math.round(sh);
  out.box = { x: sx, y: sy, w: sw, h: sh };
  const og = out.getContext('2d');
  og.drawImage(mc, sx * k, sy * k, sw * k, sh * k, 0, 0, out.width, out.height);
  og.globalCompositeOperation = 'source-in';
  og.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  og.globalCompositeOperation = 'destination-over';
  og.fillStyle = '#fff'; og.fillRect(0, 0, out.width, out.height);
  if (Math.abs(skew) < 1.5) return out;
  // Enderezar
  const r = (-skew * Math.PI) / 180;
  const rw = Math.ceil(Math.abs(out.width * Math.cos(r)) + Math.abs(out.height * Math.sin(r)));
  const rh = Math.ceil(Math.abs(out.width * Math.sin(r)) + Math.abs(out.height * Math.cos(r)));
  const rc = document.createElement('canvas'); rc.width = rw; rc.height = rh;
  const rg = rc.getContext('2d'); rg.fillStyle = '#fff'; rg.fillRect(0, 0, rw, rh);
  rg.translate(rw / 2, rh / 2); rg.rotate(r); rg.drawImage(out, -out.width / 2, -out.height / 2);
  rc.unrotated = out; rc.box = out.box;
  return rc;
}

// Quita del texto binarizado las manchas que no pueden ser letras (trama de la tela, sombras grandes)
function despeckle(c) {
  const W = c.width, H = c.height, g = c.getContext('2d', { willReadFrequently: true });
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const seen = new Uint8Array(W * H);
  const maxH = H * 0.25, maxW = W * 0.6;
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || d[i * 4] > 128) continue;
    const st = [i], px = []; seen[i] = 1; let x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j - x) / W; px.push(j);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (q >= 0 && !seen[q] && d[q * 4] <= 128) { seen[q] = 1; st.push(q); }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (px.length < 6 || bh > maxH || bw > maxW) px.forEach((j) => { d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = 255; });
  }
  g.putImageData(id, 0, 0);
  return c;
}

// Prepara la foto para el lector: texto negro sobre blanco, con umbral adaptativo (Bradley) para ignorar sombras y trama
function prep(source) {
  const k = Math.min(1.6, 1400 / Math.max(source.width, source.height));
  const W = Math.round(source.width * k), H = Math.round(source.height * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.filter = 'blur(0.8px)'; // suaviza la trama del tejido
  g.drawImage(source, 0, 0, W, H);
  g.filter = 'none';
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const lum = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) { lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += lum[i]; }
  if (sum / lum.length < 110) for (let i = 0; i < lum.length; i++) lum[i] = 255 - lum[i]; // etiqueta oscura con letras claras
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += lum[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const s = Math.max(6, Math.round(Math.min(W, H) / 14));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - s), x1 = Math.min(W, x + s + 1), y0 = Math.max(0, y - s), y1 = Math.min(H, y + s + 1);
    const mean = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    const v = lum[y * W + x] < mean * 0.84 ? 0 : 255;
    const q = (y * W + x) * 4; d[q] = d[q + 1] = d[q + 2] = v; d[q + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return despeckle(c);
}

function rotate(c, deg) {
  const r = document.createElement('canvas');
  r.width = c.height; r.height = c.width;
  const g = r.getContext('2d');
  g.translate(r.width / 2, r.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(c, -c.width / 2, -c.height / 2);
  return r;
}
const score = (r) => r.composition.length * 3 + r.composition.filter((c) => c.pct).length * 2 + r.care.length;

// Recuadro sugerido para la etiqueta (en coordenadas de la foto)
export function suggestBox(source) {
  const c = findLabel(source);
  return c.box || null;
}

export async function readLabel(source, onProgress = () => {}, { cropped = false } = {}) {
  const w = await loadOCR(onProgress);
  progressCb = onProgress;
  const crop = cropped ? source : findLabel(source);
  const base = prep(crop);
  let best = parseLabel((await w.recognize(base)).data.text || '');
  // Si se enderezó, se compara con la versión sin girar
  if (crop.unrotated && !best.composition.some((c) => c.pct)) {
    const r = parseLabel((await w.recognize(prep(crop.unrotated))).data.text || '');
    if (score(r) > score(best)) best = r;
  }
  // Etiqueta alargada fotografiada de lado: se prueba girada
  if (!best.composition.some((c) => c.pct) && Math.max(crop.width, crop.height) > 1.5 * Math.min(crop.width, crop.height)) {
    for (const deg of [90, -90]) {
      const r = parseLabel((await w.recognize(rotate(base, deg))).data.text || '');
      if (score(r) > score(best)) best = r;
      if (best.composition.some((c) => c.pct)) break;
    }
  }
  return best;
}

