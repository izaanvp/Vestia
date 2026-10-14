// Sastrería digital: geometría del maniquí y prendas "cosidas" a su cuerpo.
// Cada prenda se dibuja siguiendo la postura y las medidas de la figura (brazos, torso, piernas)
// y se rellena con la tela real de la foto (color, textura y estampado), con sombras y detalles.

// ---------- Figuras (coordenadas 300 × 640, eje central x = 150) ----------
export const FIG = {
  neutro: {
    head: [150, 63, 27, 34], neck: { hw: 12.5, y0: 88, y1: 134 },
    shoulderY: 138, shoulder: 47,
    rows: [[138, 46], [150, 48], [175, 47], [205, 43], [235, 38], [258, 37], [285, 41], [312, 46], [340, 46]],
    waistY: 262, hipY: 312, crotchY: 342,
    arm: [{ x: 104, y: 147, r: 12 }, { x: 94, y: 248, r: 9.5 }, { x: 89, y: 338, r: 7 }],
    leg: [{ x: 128, y: 330, r: 22.5 }, { x: 128, y: 470, r: 14.5 }, { x: 129, y: 590, r: 9 }],
    photo: { top: [64, 122, 172, 220], outer: [54, 116, 192, 262], one: [68, 122, 164, 430] },
  },
  mujer: {
    head: [150, 64, 25.5, 32.5], neck: { hw: 10.5, y0: 90, y1: 134 },
    shoulderY: 139, shoulder: 43,
    rows: [[139, 41], [152, 42], [172, 45], [192, 41], [220, 34], [250, 31], [278, 40], [308, 50], [341, 47]],
    waistY: 252, hipY: 308, crotchY: 343,
    arm: [{ x: 109, y: 148, r: 10 }, { x: 99, y: 246, r: 8 }, { x: 92, y: 334, r: 6 }],
    leg: [{ x: 126, y: 332, r: 23.5 }, { x: 129, y: 472, r: 13.5 }, { x: 131, y: 592, r: 8 }],
    photo: { top: [68, 124, 164, 214], outer: [58, 118, 184, 258], one: [70, 124, 160, 428] },
  },
  hombre: {
    head: [150, 63, 29, 35.5], neck: { hw: 15.5, y0: 88, y1: 134 },
    shoulderY: 136, shoulder: 56,
    rows: [[136, 54], [150, 57], [180, 54], [212, 48], [245, 43], [265, 42], [290, 43], [315, 44], [340, 43]],
    waistY: 268, hipY: 315, crotchY: 342,
    arm: [{ x: 96, y: 146, r: 14 }, { x: 85, y: 250, r: 11 }, { x: 80, y: 342, r: 8.5 }],
    leg: [{ x: 129, y: 330, r: 22 }, { x: 129, y: 470, r: 15.5 }, { x: 130, y: 590, r: 10 }],
    photo: { top: [56, 118, 188, 228], outer: [46, 112, 208, 268], one: [64, 120, 172, 430] },
  },
};
export const mirror = (chain) => chain.map((p) => ({ ...p, x: 300 - p.x }));
const f1 = (n) => Math.round(n * 10) / 10;

// ---------- Colores ----------
export function shadeHex(hex, k) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

// ---------- Geometría ----------
// Ancho (mitad) del torso a una altura y, con interpolación suave entre las filas de medidas.
export function hwAt(rows, y) {
  if (y <= rows[0][0]) return rows[0][1];
  if (y >= rows[rows.length - 1][0]) return rows[rows.length - 1][1];
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] < y) i++;
  const p0 = rows[Math.max(0, i - 1)][1], p1 = rows[i][1], p2 = rows[i + 1][1], p3 = rows[Math.min(rows.length - 1, i + 2)][1];
  const t = (y - rows[i][0]) / (rows[i + 1][0] - rows[i][0]);
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

// Lateral izquierdo del torso entre y0 e y1 (con holgura y vuelo opcional hacia abajo).
function side(P, y0, y1, ease, flare = 0, step = 6) {
  const pts = [];
  const n = Math.max(2, Math.ceil((y1 - y0) / step));
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const t = i / n;
    pts.push([150 - (hwAt(P.rows, Math.min(y, P.crotchY)) + ease + flare * t ** 1.3), y]);
  }
  return pts;
}
const poly = (pts) => pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L');
const mirrorPts = (pts) => pts.map(([x, y]) => [300 - x, y]);

// Torso (cuerpo o prenda): del cuello al bajo, con escote.
export function torsoPath(P, { ease = 0, hemY = P.crotchY, neckDepth = 8, hemCurve = 4, neckEase = 0, startY } = {}) {
  const ny = P.neck.y1 - 4;
  const nw = P.neck.hw + 2 + neckEase;
  const sh = P.shoulder + ease;
  const left = side(P, (startY ?? P.shoulderY) + 8, hemY, ease);
  const right = mirrorPts(left).reverse();
  const hemR = right[0];
  return `M${f1(150 - nw)} ${ny} Q${f1(150 - nw - 10)} ${ny + 3} ${f1(150 - sh)} ${P.shoulderY + 1} L${poly(left)}`
    + ` Q150 ${f1(hemY + hemCurve)} ${f1(hemR[0])} ${f1(hemR[1])} L${poly(right)}`
    + ` L${f1(150 + sh)} ${P.shoulderY + 1} Q${f1(150 + nw + 10)} ${ny + 3} ${f1(150 + nw)} ${ny}`
    + ` Q150 ${f1(ny + neckDepth)} ${f1(150 - nw)} ${ny} Z`;
}

// Banda horizontal del torso (cinturillas, caderas del pantalón, faldas).
export function bandPath(P, y0, y1, { ease = 0, flare = 0, hemCurve = 3 } = {}) {
  const left = side(P, y0, y1, ease, flare);
  const right = mirrorPts(left).reverse();
  return `M${poly(left)} Q150 ${f1(y1 + hemCurve)} ${f1(right[0][0])} ${f1(right[0][1])} L${poly(right)} Q150 ${f1(y0 - 2)} ${f1(left[0][0])} ${f1(left[0][1])} Z`;
}

// Extremidad con grosor variable (brazo, pierna, manga, pernera) a lo largo de una cadena de articulaciones.
// from/to: tramo de la extremidad (0 = hombro/cadera, 1 = muñeca/tobillo). flare: ensanchamiento al final.
export function limbPath(chain, { ease = 0, from = 0, to = 1, flare = 0, capStart = 'flat', capEnd = 'round', taper = 0 } = {}) {
  const segs = []; let total = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len });
    total += len;
  }
  const n = Math.max(6, Math.round((total * (to - from)) / 5));
  const L = [], R = [];
  let rEnd = 0;
  for (let k = 0; k <= n; k++) {
    const d = (from + ((to - from) * k) / n) * total;
    let si = segs.findIndex((s) => d <= s.start + s.len);
    if (si < 0) si = segs.length - 1;
    const s = segs[si];
    const u = Math.min(1.2, (d - s.start) / s.len);
    const x = s.a.x + (s.b.x - s.a.x) * u, y = s.a.y + (s.b.y - s.a.y) * u;
    // Dirección suavizada cerca de las articulaciones
    let dx = s.dx, dy = s.dy;
    const blend = 14;
    if (d - s.start < blend && si > 0) { const p = segs[si - 1]; const w = 0.5 - (d - s.start) / blend / 2; dx = dx * (1 - w) + p.dx * w; dy = dy * (1 - w) + p.dy * w; }
    if (s.start + s.len - d < blend && si < segs.length - 1) { const q = segs[si + 1]; const w = 0.5 - (s.start + s.len - d) / blend / 2; dx = dx * (1 - w) + q.dx * w; dy = dy * (1 - w) + q.dy * w; }
    const m = Math.hypot(dx, dy); dx /= m; dy /= m;
    const t = d / total;
    const r = s.a.r + (s.b.r - s.a.r) * Math.min(1, u) + ease + flare * Math.max(0, (t - from) / Math.max(0.01, to - from)) ** 1.4 - taper * t;
    rEnd = r;
    // Lados izquierdo y derecho según la normal a la dirección de la extremidad
    L.push([x - dy * r, y + dx * r]);
    R.push([x + dy * r, y - dx * r]);
  }
  const end = (a, b, cap, r) => (cap === 'round' ? ` A${f1(r)} ${f1(r)} 0 0 0 ${f1(b[0])} ${f1(b[1])}` : ` L${f1(b[0])} ${f1(b[1])}`);
  const rStart = Math.hypot(L[0][0] - R[0][0], L[0][1] - R[0][1]) / 2;
  return `M${f1(L[0][0])} ${f1(L[0][1])} L${poly(L)}${end(L[L.length - 1], R[R.length - 1], capEnd, rEnd)} L${poly([...R].reverse())}${end(R[0], L[0], capStart, rStart)} Z`;
}

// Punto a lo largo de una cadena (para colocar puños, rodillas, manos…).
export function chainPoint(chain, t) {
  const segs = []; let total = 0;
  for (let i = 0; i < chain.length - 1; i++) { const len = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y); segs.push({ a: chain[i], b: chain[i + 1], len, start: total }); total += len; }
  const d = t * total;
  const s = segs.find((x) => d <= x.start + x.len) || segs[segs.length - 1];
  const u = (d - s.start) / s.len;
  const dx = (s.b.x - s.a.x) / s.len, dy = (s.b.y - s.a.y) / s.len;
  return { x: s.a.x + (s.b.x - s.a.x) * u, y: s.a.y + (s.b.y - s.a.y) * u, r: s.a.r + (s.b.r - s.a.r) * u, dx, dy };
}
// Línea transversal (puño, bajo de la pernera) en el punto t de la cadena.
function across(chain, t, ease, off = 0) {
  const p = chainPoint(chain, t), r = p.r + ease;
  const x = p.x + p.dx * off, y = p.y + p.dy * off;
  return `M${f1(x + p.dy * r)} ${f1(y - p.dx * r)} L${f1(x - p.dy * r)} ${f1(y + p.dx * r)}`;
}

// ---------- Tipos de prenda ----------
const SUB = {
  'Camiseta': 'tee', 'Camiseta estampada': 'tee', 'Polo': 'polo', 'Camiseta de tirantes': 'tank', 'Bañador': 'tank', 'Bikini': 'tank', 'Body': 'tank',
  'Crop top': 'crop', 'Top corsé': 'corset', 'Blusa': 'shirt', 'Camisa': 'shirt', 'Camisa de franela': 'shirt',
  'Jersey de punto': 'knit', 'Jersey de cuello alto': 'turtleneck', 'Cárdigan': 'cardigan', 'Sudadera con capucha': 'hoodie', 'Sudadera': 'sweatshirt',
  'Americana': 'blazer', 'Cazadora vaquera': 'denimjacket', 'Chaqueta de cuero': 'leatherjacket', 'Bomber': 'bomber', 'Chaleco': 'vest',
  'Plumífero': 'puffer', 'Gabardina': 'trench', 'Abrigo de paño': 'coat',
  'Vaqueros': 'jeans', 'Pantalón ancho': 'wide', 'Pantalón de vestir': 'trousers', 'Pantalón cargo': 'cargo', 'Jogger': 'jogger', 'Leggings': 'leggings',
  'Shorts': 'shorts', 'Shorts vaqueros': 'shorts', 'Minifalda': 'skirt-mini', 'Falda plisada': 'skirt-pleated', 'Falda larga': 'skirt-long', 'Falda vaquera': 'skirt-denim',
  'Vestido corto': 'dress-short', 'Vestido largo': 'dress-long', 'Vestido lencero': 'dress-slip', 'Vestido de fiesta': 'gown', 'Vestido camisero': 'dress-shirt',
  'Mono': 'jumpsuit', 'Peto': 'overalls',
  'Zapatillas': 'sneakers', 'Zapatillas de running': 'sneakers', 'Zapatos de tacón': 'heels', 'Mocasines': 'loafers', 'Bailarinas': 'flats', 'Zapatos de vestir': 'oxford',
  'Botines': 'ankleboots', 'Botas altas': 'kneeboots', 'Botas camperas': 'ankleboots', 'Sandalias': 'sandals', 'Chanclas': 'sandals',
};
const BY_TYPE = {
  Camiseta: 'tee', Camisa: 'shirt', Top: 'tank', Jersey: 'knit', Sudadera: 'sweatshirt', Chaqueta: 'jacket', Abrigo: 'coat', Americana: 'blazer',
  Pantalón: 'trousers', Vaqueros: 'jeans', Falda: 'skirt-midi', Shorts: 'shorts', Vestido: 'dress-midi', Mono: 'jumpsuit',
  Zapatos: 'oxford', Zapatillas: 'sneakers', Botas: 'ankleboots', Sandalias: 'sandals',
};
export function garmentKind(item) {
  const name = `${item.name || ''} ${item.subtype || ''}`.toLowerCase();
  if (SUB[item.subtype]) return SUB[item.subtype];
  if (/pinzas|vestir|chino/.test(name)) return 'trousers';
  if (/ancho|palazzo|wide/.test(name)) return 'wide';
  if (/plisad/.test(name)) return 'skirt-pleated';
  if (/mini/.test(name) && item.type === 'Falda') return 'skirt-mini';
  if (/larg|maxi/.test(name) && item.type === 'Falda') return 'skirt-long';
  if (/midi/.test(name) && item.type === 'Vestido') return 'dress-midi';
  if (/capucha|hood/.test(name)) return 'hoodie';
  if (/cuello alto|turtle/.test(name)) return 'turtleneck';
  if (/ochos|punto|knit/.test(name)) return 'knit';
  if (/gabardina|trench/.test(name)) return 'trench';
  if (/plum[ií]fero|puffer/.test(name)) return 'puffer';
  if (/cuero|leather|biker/.test(name)) return 'leatherjacket';
  if (/vaquer|denim/.test(name) && item.type === 'Chaqueta') return 'denimjacket';
  if (/c[aá]rdigan/.test(name)) return 'cardigan';
  if (/tirantes|lencero|sat[eé]n/.test(name) && item.type === 'Top') return 'tank';
  if (/bot[ií]n/.test(name)) return 'ankleboots';
  if (/tac[oó]n|heel/.test(name)) return 'heels';
  if (/mocas/.test(name)) return 'loafers';
  return BY_TYPE[item.type] || 'tee';
}

// ---------- Prendas ----------
// ctx: { P, uid, item, fabric:{src, hex}, slot }
function fabricDefs(ctx) {
  const { uid, slot, fabric, item } = ctx;
  const id = `fab-${slot}-${uid}`;
  const base = item.hex || fabric?.hex || '#888888';
  if (!fabric?.src) return { fill: base, defs: '' };
  const T = fabric.tile || 46;
  return {
    fill: `url(#${id})`,
    defs: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${T}" height="${T}"><rect width="${T}" height="${T}" fill="${base}"/><image href="${fabric.src}" width="${T}" height="${T}" preserveAspectRatio="none"/></pattern>`,
  };
}

// Dibuja un conjunto de piezas como una sola prenda: contorno, tela, volumen y detalles.
function sew(ctx, pieces, details = '', { open = null } = {}) {
  const { uid, slot, item } = ctx;
  const base = item.hex || ctx.fabric?.hex || '#888888';
  const L = lum(base);
  const outline = L < 0.18 ? shadeHex(base, 0.22) : shadeHex(base, -0.42);
  const { fill, defs } = fabricDefs(ctx);
  const cid = `clip-${slot}-${uid}`;
  const mid = `open-${slot}-${uid}`;
  const shapes = pieces.map((p) => `<path d="${p.d}"/>`).join('');
  // Volumen: cada pieza con un degradado cilíndrico (bordes oscuros, centro con brillo)
  const shading = pieces.map((p) => `<path d="${p.d}" fill="url(#cyl-${uid})"/>`).join('');
  const maskAttr = open ? ` mask="url(#${mid})"` : '';
  return `
  <g class="cloth garment" data-slot="${slot}">
    <defs>${defs}<clipPath id="${cid}">${shapes}</clipPath>
      ${open ? `<mask id="${mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="640"><rect width="300" height="640" fill="#fff"/><path d="${open}" fill="#000"/></mask>` : ''}</defs>
    <g${maskAttr}>
      <g fill="${outline}" stroke="${outline}" stroke-width="2.6" stroke-linejoin="round">${shapes}</g>
      <g fill="${fill}">${shapes}</g>
      <g clip-path="url(#${cid})">
        ${shading}
        <rect x="0" y="0" width="300" height="640" fill="url(#vert-${uid})"/>
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">${details.replaceAll('{D}', outline).replaceAll('{L}', shadeHex(base, 0.32)).replaceAll('{B}', base)}</g>
      </g>
    </g>
  </g>`;
}

// Bandas de punto (canalé): líneas verticales finas dentro de una franja.
function ribs(x0, x1, y0, y1, gap = 3.5) {
  let s = '';
  for (let x = x0; x <= x1; x += gap) s += `M${f1(x)} ${f1(y0)} L${f1(x)} ${f1(y1)}`;
  return `<path d="${s}" stroke="{D}" stroke-width=".9" opacity=".35"/>`;
}
function buttons(x, ys, r = 2.4) {
  return ys.map((y) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="{D}" opacity=".85"/><circle cx="${f1(x - 0.6)}" cy="${f1(y - 0.6)}" r="${r * 0.35}" fill="{L}" opacity=".7"/>`).join('');
}

function topGarment(ctx, kind) {
  const { P } = ctx;
  const armL = P.arm, armR = mirror(P.arm);
  const hw = (y) => hwAt(P.rows, y);
  const waist = P.waistY, hip = P.hipY;
  const ny = P.neck.y1 - 4, nw = P.neck.hw + 2;
  const cfg = {
    tee: { ease: 4, hem: hip + 12, sleeve: 0.3, neck: 9 },
    polo: { ease: 4, hem: hip + 12, sleeve: 0.3, neck: 4 },
    tank: { ease: 2.5, hem: hip + 6, sleeve: 0, neck: 30 },
    crop: { ease: 2.5, hem: waist - 6, sleeve: 0.22, neck: 12 },
    corset: { ease: 1.5, hem: waist + 10, sleeve: 0, neck: 28 },
    shirt: { ease: 5, hem: hip + 18, sleeve: 0.97, neck: 6 },
    knit: { ease: 6, hem: hip + 12, sleeve: 0.95, neck: 8 },
    turtleneck: { ease: 5, hem: hip + 12, sleeve: 0.95, neck: -2 },
    sweatshirt: { ease: 7, hem: hip + 12, sleeve: 0.95, neck: 8 },
    hoodie: { ease: 8, hem: hip + 14, sleeve: 0.95, neck: 8 },
  }[kind] || { ease: 4, hem: hip + 12, sleeve: 0.3, neck: 9 };
  const pieces = [];
  const strapTop = ['tank', 'corset'].includes(kind);
  pieces.push({ d: torsoPath(P, { ease: cfg.ease, hemY: cfg.hem, neckDepth: cfg.neck, neckEase: strapTop ? -1 : 0, startY: strapTop ? P.shoulderY + 6 : undefined }) });
  if (cfg.sleeve > 0) {
    // Manga montada: empieza un poco por encima del hombro con la copa redondeada
    const sl = { ease: cfg.ease + 1.5, from: 0.07, to: cfg.sleeve, capEnd: 'flat', capStart: 'round', flare: cfg.sleeve < 0.5 ? 2 : 0 };
    pieces.push({ d: limbPath(armL, sl) }, { d: limbPath(armR, sl) });
  }

  let det = '';
  // Pliegues y volumen de la tela
  det += `<path d="M${150 - hw(waist) - cfg.ease + 6} ${waist - 4} q14 6 26 2 M${150 + hw(waist) + cfg.ease - 6} ${waist - 4} q-14 6 -26 2" stroke="{D}" stroke-width="1.4" opacity=".28"/>`;
  if (cfg.sleeve > 0.6) {
    // Codos y puños
    for (const arm of [armL, armR]) {
      const e = chainPoint(arm, 0.5);
      det += `<path d="M${f1(e.x - e.r - 4)} ${f1(e.y - 2)} q${f1(e.r)} 5 ${f1(e.r * 2 + 8)} -1" stroke="{D}" stroke-width="1.3" opacity=".3"/>`;
      det += `<path d="${across(arm, cfg.sleeve - 0.04, cfg.ease + 1.5)}" stroke="{D}" stroke-width="1.6" opacity=".55"/>`;
    }
  } else if (cfg.sleeve > 0) {
    for (const arm of [armL, armR]) det += `<path d="${across(arm, cfg.sleeve - 0.02, cfg.ease + 4)}" stroke="{D}" stroke-width="1.5" opacity=".45"/>`;
  }
  // Bajo
  det += `<path d="M${150 - hw(cfg.hem) - cfg.ease} ${cfg.hem - 3} Q150 ${cfg.hem + 2} ${150 + hw(cfg.hem) + cfg.ease} ${cfg.hem - 3}" stroke="{D}" stroke-width="1.2" opacity=".4" ${['tee', 'polo', 'shirt'].includes(kind) ? 'stroke-dasharray="3 2.5"' : ''}/>`;

  if (['tee', 'polo', 'crop', 'knit', 'sweatshirt', 'hoodie'].includes(kind)) {
    det += `<path d="M${150 - nw} ${ny} Q150 ${ny + cfg.neck + 1} ${150 + nw} ${ny}" stroke="{D}" stroke-width="${kind === 'knit' || kind === 'sweatshirt' ? 5 : 3}" opacity=".5"/>`;
  }
  if (kind === 'polo') {
    det += `<path d="M150 ${ny + 4} L${150 - nw - 7} ${ny - 4} L${150 - nw + 1} ${ny + 12} Z M150 ${ny + 4} L${150 + nw + 7} ${ny - 4} L${150 + nw - 1} ${ny + 12} Z" fill="{B}" stroke="{D}" stroke-width="1.3"/>`;
    det += `<path d="M150 ${ny + 4} L150 ${ny + 36}" stroke="{D}" stroke-width="1.2" opacity=".6"/>${buttons(153, [ny + 14, ny + 26], 1.9)}`;
  }
  if (kind === 'shirt') {
    det += `<path d="M150 ${ny + 8} L${150 - nw - 8} ${ny - 5} L${150 - nw + 1} ${ny + 14} Z M150 ${ny + 8} L${150 + nw + 8} ${ny - 5} L${150 + nw - 1} ${ny + 14} Z" fill="{B}" stroke="{D}" stroke-width="1.4"/>`;
    det += `<path d="M150 ${ny + 8} L150 ${cfg.hem + 2}" stroke="{D}" stroke-width="1.3" opacity=".6"/>`;
    det += buttons(153.5, Array.from({ length: 5 }, (_, i) => ny + 26 + ((cfg.hem - ny - 40) * i) / 4));
    det += `<path d="M${150 - hw(185) + 6} 182 l18 0 l0 18 l-18 0 Z" stroke="{D}" stroke-width="1" opacity=".35"/>`;
  }
  if (['knit', 'sweatshirt', 'hoodie', 'turtleneck'].includes(kind)) {
    det += ribs(150 - hw(cfg.hem) - cfg.ease, 150 + hw(cfg.hem) + cfg.ease, cfg.hem - 11, cfg.hem + 3);
    for (const arm of [armL, armR]) {
      const p = chainPoint(arm, cfg.sleeve - 0.04);
      det += ribs(p.x - p.r - cfg.ease, p.x + p.r + cfg.ease, p.y - 2, p.y + 12, 3);
    }
  }
  if (kind === 'knit' && /ochos|texturizado/i.test(`${ctx.item.name} ${ctx.item.pattern}`)) {
    for (let x = 150 - 26; x <= 150 + 26; x += 13) det += `<path d="M${x} ${ny + 14} q5 10 0 20 q-5 10 0 20 q5 10 0 20 q-5 10 0 20 q5 10 0 20 q-5 10 0 20" stroke="{D}" stroke-width="1.6" opacity=".3"/>`;
  }
  if (kind === 'turtleneck') det += ribs(150 - P.neck.hw - 3, 150 + P.neck.hw + 3, P.neck.y0 + 8, P.neck.y1, 3);
  if (kind === 'hoodie') {
    // Capucha caída sobre los hombros
    pieces.push({ d: `M${150 - nw - 13} ${ny + 8} Q${150 - nw - 16} ${ny - 16} 150 ${ny - 18} Q${150 + nw + 16} ${ny - 16} ${150 + nw + 13} ${ny + 8} Q${150 + nw + 4} ${ny - 2} 150 ${ny + 14} Q${150 - nw - 4} ${ny - 2} ${150 - nw - 13} ${ny + 8} Z` });
    det += `<path d="M${150 - 34} ${hip - 32} L${150 + 34} ${hip - 32} L${150 + 42} ${hip + 2} L${150 - 42} ${hip + 2} Z" stroke="{D}" stroke-width="1.5" opacity=".55"/>`;
    det += `<path d="M${150 - 6} ${ny + 4} l-1 34 M${150 + 6} ${ny + 4} l1 34" stroke="{L}" stroke-width="2.2"/>`;
  }
  if (kind === 'tank' || kind === 'corset') {
    det += `<path d="M${150 - nw - 1} ${ny} Q150 ${ny + cfg.neck + 2} ${150 + nw + 1} ${ny}" stroke="{D}" stroke-width="1.6" opacity=".5"/>`;
    if (kind === 'corset') for (const dx of [-22, -8, 8, 22]) det += `<path d="M${150 + dx} ${ny + 26} Q${150 + dx * 1.15} ${waist - 20} ${150 + dx} ${cfg.hem}" stroke="{D}" stroke-width="1.2" opacity=".45"/>`;
  }
  if (ctx.item.pattern === 'Estampado gráfico' && ctx.photo) {
    const cx = 150, cy = ny + 52, w = 40;
    det += `<clipPath id="print-${ctx.uid}"><rect x="${cx - w / 2}" y="${cy - w / 2}" width="${w}" height="${w}" rx="3"/></clipPath><image href="${ctx.photo}" x="${cx - 55}" y="${cy - 66}" width="110" height="132" preserveAspectRatio="xMidYMid slice" clip-path="url(#print-${ctx.uid})" opacity=".95"/>`;
  }
  // Las prendas sin mangas usan tirantes
  if (strapTop) {
    for (const s of [-1, 1]) pieces.push({ d: `M${150 + s * (nw + 4)} ${ny + 2} L${150 + s * (nw + 10)} ${P.shoulderY - 2} L${150 + s * (nw + 13)} ${P.shoulderY + 1} L${150 + s * (nw + 8)} ${ny + 14} Z` });
  }
  return sew(ctx, pieces, det);
}

function outerGarment(ctx, kind) {
  const { P } = ctx;
  const armL = P.arm, armR = mirror(P.arm);
  const hw = (y) => hwAt(P.rows, Math.min(y, P.crotchY));
  const ny = P.neck.y1 - 4, nw = P.neck.hw + 2;
  const knee = P.leg[1].y;
  const cfg = {
    blazer: { ease: 8, hem: P.hipY + 26, sleeve: 0.97, v: P.waistY - 12, gap: 3, lapel: true, buttons: 2 },
    jacket: { ease: 8, hem: P.hipY + 14, sleeve: 0.97, v: P.waistY - 40, gap: 5 },
    denimjacket: { ease: 8, hem: P.waistY + 30, sleeve: 0.97, v: ny + 30, gap: 3, collar: true },
    leatherjacket: { ease: 7, hem: P.waistY + 26, sleeve: 0.97, v: ny + 60, gap: 3, collar: true, zip: true },
    bomber: { ease: 10, hem: P.waistY + 22, sleeve: 0.95, v: ny + 6, gap: 2.5, rib: true, zip: true },
    cardigan: { ease: 7, hem: P.hipY + 20, sleeve: 0.95, v: P.waistY - 30, gap: 3, buttons: 5, knit: true },
    vest: { ease: 6, hem: P.waistY + 30, sleeve: 0, v: P.waistY - 50, gap: 3, buttons: 3 },
    puffer: { ease: 14, hem: P.hipY + 26, sleeve: 0.97, v: ny + 4, gap: 1.5, quilt: true, zip: true },
    trench: { ease: 11, hem: knee + 10, sleeve: 0.97, v: P.waistY - 50, gap: 0, lapel: true, belt: true, double: true },
    coat: { ease: 11, hem: knee + 16, sleeve: 0.97, v: P.waistY - 46, gap: 0, lapel: true, buttons: 3 },
  }[kind] || { ease: 8, hem: P.hipY + 14, sleeve: 0.97, v: P.waistY - 40, gap: 5 };
  const pieces = [];
  // Por debajo de la cadera el abrigo cae recto y un poco abierto (no sigue las piernas)
  const flare = cfg.hem > P.crotchY ? 10 : 0;
  const tp = torsoPath(P, { ease: cfg.ease, hemY: Math.min(cfg.hem, P.crotchY), neckDepth: -2, neckEase: 3 });
  pieces.push({ d: tp });
  if (cfg.hem > P.crotchY) pieces.push({ d: bandPath(P, P.crotchY - 30, cfg.hem, { ease: cfg.ease, flare }) });
  if (cfg.sleeve) {
    const sl = { ease: cfg.ease * 0.65 + 2, from: 0.07, to: cfg.sleeve, capEnd: 'flat', capStart: 'round' };
    pieces.push({ d: limbPath(armL, sl) }, { d: limbPath(armR, sl) });
  }

  // Abertura delantera: escote en V y, si es abierta, una rendija hasta el bajo
  const vx = nw + 3;
  const open = `M${150 - vx} ${ny - 1} L${150 - cfg.gap} ${cfg.v} L${150 - cfg.gap} ${cfg.hem + 30} L${150 + cfg.gap} ${cfg.hem + 30} L${150 + cfg.gap} ${cfg.v} L${150 + vx} ${ny - 1} Z`;

  let det = '';
  const hemW = hw(cfg.hem) + cfg.ease + (cfg.hem > P.crotchY ? flare : 0);
  det += `<path d="M${150 - hemW} ${cfg.hem - 4} Q150 ${cfg.hem + 1} ${150 + hemW} ${cfg.hem - 4}" stroke="{D}" stroke-width="1.3" opacity=".45"/>`;
  if (cfg.lapel) {
    for (const s of [-1, 1]) det += `<path d="M${150 + s * vx} ${ny - 1} L${150 + s * (vx + 18)} ${ny + 26} L${150 + s * (vx + 12)} ${ny + 34} L${150 + s * (cfg.gap + 1)} ${cfg.v} L${150 + s * (vx - 1)} ${ny + 6} Z" fill="{B}" stroke="{D}" stroke-width="1.4"/>`;
  }
  if (cfg.collar) for (const s of [-1, 1]) det += `<path d="M${150 + s * (vx - 2)} ${ny - 3} L${150 + s * (vx + 16)} ${ny + 12} L${150 + s * (vx + 4)} ${ny + 18} Z" fill="{B}" stroke="{D}" stroke-width="1.3"/>`;
  if (cfg.buttons) det += buttons(150 + (cfg.gap ? -cfg.gap - 4 : 0) + 6, Array.from({ length: cfg.buttons }, (_, i) => cfg.v + 10 + i * Math.min(34, (cfg.hem - cfg.v - 30) / Math.max(1, cfg.buttons - 1))), 2.6);
  if (cfg.double) for (const s of [-1, 1]) det += buttons(150 + s * 14, [cfg.v + 8, cfg.v + 40, P.waistY + 52].filter((y) => y < cfg.hem - 10), 2.8);
  if (cfg.zip) det += `<path d="M150 ${ny + 4} L150 ${cfg.hem}" stroke="{L}" stroke-width="1.6" stroke-dasharray="1.5 1.5"/>`;
  if (cfg.belt) {
    const y = P.waistY + 4, w = hw(y) + cfg.ease + 1;
    det += `<path d="M${150 - w} ${y - 6} L${150 + w} ${y - 6} L${150 + w} ${y + 6} L${150 - w} ${y + 6} Z" fill="{B}" stroke="{D}" stroke-width="1.3"/><rect x="${150 + 8}" y="${y - 8}" width="12" height="16" rx="2" fill="none" stroke="#b08a3c" stroke-width="2.2"/>`;
  }
  if (cfg.quilt) for (let y = ny + 22; y < cfg.hem; y += 22) det += `<path d="M0 ${y} L300 ${y + 3}" stroke="{D}" stroke-width="1.3" opacity=".4"/><path d="M0 ${y + 6} L300 ${y + 9}" stroke="{L}" stroke-width="3" opacity=".2"/>`;
  if (cfg.rib) {
    det += ribs(150 - hemW, 150 + hemW, cfg.hem - 12, cfg.hem + 2);
    for (const arm of [armL, armR]) { const p = chainPoint(arm, cfg.sleeve - 0.04); det += ribs(p.x - p.r - 9, p.x + p.r + 9, p.y - 2, p.y + 12, 3); }
  }
  if (kind === 'denimjacket') {
    for (const s of [-1, 1]) det += `<path d="M${150 + s * 14} ${ny + 34} l${s * 22} 0 l0 18 l${-s * 11} 5 l${-s * 11} -5 Z" stroke="#d9a441" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
    det += `<path d="M0 ${P.waistY + 6} L300 ${P.waistY + 6}" stroke="#d9a441" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
  }
  if (cfg.sleeve) for (const arm of [armL, armR]) {
    const e = chainPoint(arm, 0.5);
    det += `<path d="M${f1(e.x - e.r - 6)} ${f1(e.y - 3)} q${f1(e.r + 2)} 6 ${f1(e.r * 2 + 12)} -1" stroke="{D}" stroke-width="1.4" opacity=".32"/>`;
    det += `<path d="${across(arm, cfg.sleeve - 0.05, cfg.ease * 0.65 + 2)}" stroke="{D}" stroke-width="1.5" opacity=".5"/>`;
  }
  if (!cfg.quilt && !cfg.belt) for (const s of [-1, 1]) det += `<path d="M${150 + s * 18} ${Math.min(cfg.hem - 24, P.hipY - 6)} l${s * 22} -2" stroke="{D}" stroke-width="1.6" opacity=".45"/>`;
  return sew(ctx, pieces, det, { open });
}

function bottomGarment(ctx, kind) {
  const { P } = ctx;
  const legL = P.leg, legR = mirror(P.leg);
  const hw = (y) => hwAt(P.rows, Math.min(y, P.crotchY));
  const top = P.waistY + (kind === 'leggings' ? 6 : 14);
  const pieces = [];
  let det = '';
  if (kind.startsWith('skirt')) {
    const len = { 'skirt-mini': P.hipY + 85, 'skirt-pleated': P.leg[1].y + 46, 'skirt-long': P.leg[2].y - 6, 'skirt-denim': P.hipY + 105, 'skirt-midi': P.leg[1].y + 40 }[kind];
    const fl = { 'skirt-mini': 10, 'skirt-pleated': 34, 'skirt-long': 30, 'skirt-denim': 6, 'skirt-midi': 22 }[kind];
    pieces.push({ d: bandPath(P, top, len, { ease: 3, flare: fl, hemCurve: 5 }) });
    det += `<path d="M${150 - hw(top) - 3} ${top + 9} Q150 ${top + 12} ${150 + hw(top) + 3} ${top + 9}" stroke="{D}" stroke-width="1.6" opacity=".5"/>`;
    const hemHW = hw(P.crotchY) + 3 + fl;
    if (kind === 'skirt-pleated') {
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, xt = 150 - hw(top) - 3 + (hw(top) * 2 + 6) * t, xb = 150 - hemHW + hemHW * 2 * t;
        det += `<path d="M${f1(xt)} ${top + 10} L${f1(xb)} ${len + 3}" stroke="${i % 2 ? '{L}' : '{D}'}" stroke-width="${i % 2 ? 3 : 1.2}" opacity="${i % 2 ? 0.25 : 0.45}"/>`;
      }
    } else {
      det += `<path d="M${150 - 22} ${top + 30} Q${150 - 30} ${len - 40} ${150 - hemHW * 0.6} ${len}" stroke="{D}" stroke-width="1.3" opacity=".25"/><path d="M${150 + 20} ${top + 34} Q${150 + 28} ${len - 40} ${150 + hemHW * 0.55} ${len}" stroke="{D}" stroke-width="1.3" opacity=".25"/>`;
    }
    if (kind === 'skirt-denim') det += `<path d="M150 ${top + 10} L150 ${len}" stroke="#d9a441" stroke-width="1.2" stroke-dasharray="2.5 2"/><path d="M${150 - hemHW + 4} ${len - 6} Q150 ${len - 2} ${150 + hemHW - 4} ${len - 6}" stroke="#d9a441" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
    return sew(ctx, pieces, det);
  }
  const fit = {
    jeans: { ease: 3.5, flare: 1, to: 1.03 }, trousers: { ease: 4.5, flare: 3, to: 1.03 }, wide: { ease: 6, flare: 16, to: 1.04 },
    cargo: { ease: 7, flare: 2, to: 1.02 }, jogger: { ease: 6, flare: -4, to: 0.98 }, leggings: { ease: 1.2, flare: 0, to: 0.97 },
    shorts: { ease: 5, flare: 5, to: 0.3 },
  }[kind] || { ease: 4, flare: 2, to: 1.03 };
  for (const leg of [legL, legR]) pieces.push({ d: limbPath(leg, { ease: fit.ease, to: fit.to, flare: fit.flare, capEnd: 'flat' }) });
  pieces.push({ d: bandPath(P, top, P.crotchY + 4, { ease: fit.ease, hemCurve: 8 }) });
  // Cinturilla, bragueta y bolsillos
  det += `<path d="M${150 - hw(top) - fit.ease} ${top + 9} Q150 ${top + 12} ${150 + hw(top) + fit.ease} ${top + 9}" stroke="{D}" stroke-width="1.7" opacity=".55"/>`;
  if (kind !== 'leggings' && kind !== 'jogger') {
    det += `<path d="M152 ${top + 12} Q160 ${top + 40} 151 ${P.crotchY - 6}" stroke="{D}" stroke-width="1.3" opacity=".5"/>`;
    for (const s of [-1, 1]) det += `<path d="M${150 + s * (hw(top) - 2)} ${top + 12} Q${150 + s * (hw(top) - 10)} ${top + 30} ${150 + s * (hw(top) - 26)} ${top + 13}" stroke="{D}" stroke-width="1.3" opacity=".5"/>`;
    for (const x of [150 - hw(top) + 10, 150 - 14, 150 + 14, 150 + hw(top) - 10]) det += `<path d="M${f1(x)} ${top + 1} l0 9" stroke="{D}" stroke-width="2" opacity=".5"/>`;
  }
  if (kind === 'jeans' || ctx.item.material === 'Denim') {
    det += `<path d="M${150 - hw(top) - 3} ${top + 6} Q150 ${top + 9} ${150 + hw(top) + 3} ${top + 6}" stroke="#d9a441" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
    for (const leg of [legL, legR]) det += `<path d="${across(leg, fit.to - 0.035, fit.ease + fit.flare)}" stroke="#d9a441" stroke-width="1.2" stroke-dasharray="2.5 2"/>`;
    det += `<circle cx="150" cy="${top + 5}" r="2.4" fill="#c9a34a"/>`;
  }
  // Raya del pantalón de vestir y pliegues en las rodillas
  for (const leg of [legL, legR]) {
    if (kind === 'trousers' || kind === 'wide') { const a = chainPoint(leg, 0.12), b = chainPoint(leg, fit.to - 0.02); det += `<path d="M${f1(a.x)} ${f1(a.y)} L${f1(b.x)} ${f1(b.y)}" stroke="{L}" stroke-width="1.6" opacity=".45"/>`; }
    if (fit.to > 0.6) { const k = chainPoint(leg, 0.5); det += `<path d="M${f1(k.x - k.r)} ${f1(k.y - 4)} q${f1(k.r)} 5 ${f1(k.r * 2)} 0 M${f1(k.x - k.r + 3)} ${f1(k.y + 6)} q${f1(k.r - 3)} 4 ${f1(k.r * 2 - 6)} 0" stroke="{D}" stroke-width="1.2" opacity=".28"/>`; }
    if (kind === 'cargo') { const c = chainPoint(leg, 0.32); const s = c.x < 150 ? -1 : 1; det += `<path d="M${f1(c.x + s * (c.r + 2))} ${f1(c.y - 14)} l${-s * 18} 0 l0 28 l${s * 18} 0" stroke="{D}" stroke-width="1.4" opacity=".55"/>`; }
    if (kind === 'jogger') det += `<path d="${across(leg, 0.93, fit.ease - 3)}" stroke="{D}" stroke-width="5" opacity=".35"/>`;
    if (kind === 'shorts') det += `<path d="${across(leg, fit.to - 0.03, fit.ease + fit.flare)}" stroke="{D}" stroke-width="1.4" opacity=".5"/>`;
  }
  return sew(ctx, pieces, det);
}

function onePiece(ctx, kind) {
  const { P } = ctx;
  const armL = P.arm, armR = mirror(P.arm);
  const hw = (y) => hwAt(P.rows, Math.min(y, P.crotchY));
  const waist = P.waistY, ny = P.neck.y1 - 4, nw = P.neck.hw + 2;
  const pieces = [];
  let det = '';
  if (kind === 'jumpsuit' || kind === 'overalls') {
    for (const leg of [P.leg, mirror(P.leg)]) pieces.push({ d: limbPath(leg, { ease: 6, to: 1.02, flare: 4, capEnd: 'flat' }) });
    if (kind === 'jumpsuit') {
      pieces.push({ d: torsoPath(P, { ease: 5, hemY: P.crotchY + 4, neckDepth: 18 }) });
      det += `<path d="M${150 - hw(waist) - 6} ${waist} Q150 ${waist + 4} ${150 + hw(waist) + 6} ${waist}" stroke="{D}" stroke-width="2" opacity=".5"/>`;
    } else {
      pieces.push({ d: bandPath(P, waist - 64, P.crotchY + 4, { ease: 4 }) });
      for (const s of [-1, 1]) pieces.push({ d: `M${150 + s * 20} ${waist - 62} L${150 + s * 34} ${P.shoulderY + 2} L${150 + s * 42} ${P.shoulderY + 4} L${150 + s * 28} ${waist - 58} Z` });
      det += buttons(150 - 20, [waist - 56]) + buttons(150 + 20, [waist - 56]);
    }
    return sew(ctx, pieces, det);
  }
  const len = { 'dress-short': P.hipY + 92, 'dress-long': P.leg[2].y + 2, 'dress-slip': P.leg[1].y + 50, gown: P.leg[2].y + 16, 'dress-shirt': P.leg[1].y + 36, 'dress-midi': P.leg[1].y + 44 }[kind] || P.leg[1].y + 40;
  const flare = { 'dress-short': 16, 'dress-long': 34, 'dress-slip': 14, gown: 46, 'dress-shirt': 18, 'dress-midi': 26 }[kind] ?? 24;
  const sleeve = { 'dress-short': 0.26, 'dress-shirt': 0.96 }[kind] || 0;
  const strap = !sleeve;
  pieces.push({ d: torsoPath(P, { ease: 3, hemY: waist + 6, neckDepth: kind === 'dress-shirt' ? 6 : strap ? 30 : 14, startY: strap ? P.shoulderY + 6 : undefined }) });
  pieces.push({ d: bandPath(P, waist, len, { ease: 3, flare, hemCurve: 6 }) });
  if (sleeve) { const sl = { ease: 5, from: 0.07, to: sleeve, capEnd: 'flat', capStart: 'round', flare: sleeve < 0.5 ? 2 : 0 }; pieces.push({ d: limbPath(armL, sl) }, { d: limbPath(armR, sl) }); }
  if (strap) for (const s of [-1, 1]) pieces.push({ d: `M${150 + s * (nw + 4)} ${ny + 2} L${150 + s * (nw + 9)} ${P.shoulderY - 2} L${150 + s * (nw + 12)} ${P.shoulderY + 1} L${150 + s * (nw + 8)} ${ny + 14} Z` });
  det += `<path d="M${150 - hw(waist) - 3} ${waist + 4} Q150 ${waist + 8} ${150 + hw(waist) + 3} ${waist + 4}" stroke="{D}" stroke-width="1.8" opacity=".45"/>`;
  const hemHW = hw(P.crotchY) + 3 + flare;
  for (const t of [0.22, 0.5, 0.78]) det += `<path d="M${f1(150 - hw(waist) + (hw(waist) * 2) * t)} ${waist + 12} Q${f1(150 - hemHW + hemHW * 2 * t)} ${f1(len - 50)} ${f1(150 - hemHW + hemHW * 2 * t)} ${len}" stroke="{D}" stroke-width="1.3" opacity=".22"/>`;
  if (kind === 'dress-shirt') { det += `<path d="M150 ${ny + 8} L150 ${len}" stroke="{D}" stroke-width="1.2" opacity=".5"/>` + buttons(153, Array.from({ length: 6 }, (_, i) => ny + 22 + i * 26)); }
  if (kind === 'dress-slip' || kind === 'gown') det += `<path d="M${150 - 10} ${ny + 40} Q${150 - 28} ${len - 120} ${150 - 34} ${len}" stroke="{L}" stroke-width="5" opacity=".18"/>`;
  return sew(ctx, pieces, det);
}

// Calzado visto de frente, sobre cada pie.
function shoes(ctx, kind) {
  const { P, item } = ctx;
  const base = item.hex || '#444';
  const D = lum(base) < 0.18 ? shadeHex(base, 0.25) : shadeHex(base, -0.45);
  const Lc = shadeHex(base, 0.3);
  const { fill, defs } = fabricDefs(ctx);
  let g = '';
  for (const leg of [P.leg, mirror(P.leg)]) {
    const a = leg[2], k = leg[1];
    const fx = a.x, fy = a.y + 12;
    if (kind === 'sneakers') {
      g += `<path d="M${fx - 14} ${fy - 4} Q${fx - 15} ${fy - 16} ${fx} ${fy - 17} Q${fx + 15} ${fy - 16} ${fx + 14} ${fy - 4} L${fx + 14} ${fy + 5} L${fx - 14} ${fy + 5} Z" fill="${fill}" stroke="${D}" stroke-width="1.5"/>`;
      g += `<path d="M${fx - 15} ${fy + 3} L${fx + 15} ${fy + 3} Q${fx + 16} ${fy + 11} ${fx} ${fy + 11} Q${fx - 16} ${fy + 11} ${fx - 15} ${fy + 3} Z" fill="#f4f4f0" stroke="#c8c8c0" stroke-width="1"/>`;
      g += `<path d="M${fx - 6} ${fy - 12} l12 0 M${fx - 6} ${fy - 8} l12 0 M${fx - 6} ${fy - 4} l12 0" stroke="${D}" stroke-width="1.3" opacity=".7"/>`;
    } else if (kind === 'ankleboots' || kind === 'kneeboots') {
      const topY = kind === 'kneeboots' ? k.y + 8 : a.y - 40;
      const rTop = kind === 'kneeboots' ? k.r + 4 : a.r + 6;
      g += `<path d="M${fx - rTop} ${topY} L${fx + rTop} ${topY} L${fx + a.r + 5} ${fy - 2} Q${fx + 16} ${fy + 2} ${fx + 14} ${fy + 8} L${fx - 14} ${fy + 8} Q${fx - 16} ${fy + 2} ${fx - a.r - 5} ${fy - 2} Z" fill="${fill}" stroke="${D}" stroke-width="1.5"/>`;
      g += `<path d="M${fx - 15} ${fy + 7} L${fx + 15} ${fy + 7} L${fx + 14} ${fy + 12} L${fx - 14} ${fy + 12} Z" fill="${shadeHex(base, -0.55)}"/>`;
      g += `<path d="M${fx - rTop + 2} ${topY + 4} L${fx + rTop - 2} ${topY + 4}" stroke="${Lc}" stroke-width="2" opacity=".5"/>`;
    } else if (kind === 'sandals') {
      g += `<path d="M${fx - 14} ${fy + 6} Q${fx} ${fy + 12} ${fx + 14} ${fy + 6}" stroke="${shadeHex(base, -0.3)}" stroke-width="3" fill="none"/>`;
      g += `<path d="M${fx - 12} ${fy - 4} Q${fx} ${fy - 8} ${fx + 12} ${fy - 4} M${fx - 13} ${fy + 2} Q${fx} ${fy - 1} ${fx + 13} ${fy + 2}" stroke="${fill}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    } else {
      // Zapatos bajos: tacón, mocasín, bailarina, zapato de vestir
      const pointy = kind === 'heels';
      g += `<path d="M${fx - 13} ${fy - 3} Q${fx} ${fy - 10} ${fx + 13} ${fy - 3} L${fx + (pointy ? 8 : 12)} ${fy + 7} Q${fx} ${fy + (pointy ? 16 : 12)} ${fx - (pointy ? 8 : 12)} ${fy + 7} Z" fill="${fill}" stroke="${D}" stroke-width="1.4"/>`;
      if (kind === 'loafers') g += `<path d="M${fx - 9} ${fy - 2} Q${fx} ${fy + 2} ${fx + 9} ${fy - 2}" stroke="${D}" stroke-width="2" fill="none"/>`;
      if (kind === 'oxford') g += `<path d="M${fx - 4} ${fy - 6} l8 0 M${fx - 4} ${fy - 2} l8 0" stroke="${D}" stroke-width="1.2"/>`;
      g += `<ellipse cx="${fx - 3}" cy="${fy}" rx="4" ry="2" fill="#fff" opacity=".25"/>`;
    }
  }
  return `<g class="cloth garment" data-slot="shoes"><defs>${defs}</defs>${g}</g>`;
}

// Prenda digital para un hueco del maniquí.
export function garmentSVG(slot, ctx) {
  const kind = garmentKind(ctx.item);
  if (slot === 'top') return topGarment(ctx, kind);
  if (slot === 'outer') return outerGarment(ctx, kind);
  if (slot === 'bottom') return bottomGarment(ctx, kind);
  if (slot === 'one') return onePiece(ctx, kind);
  if (slot === 'shoes') return shoes(ctx, kind);
  return '';
}
