// Vestidor: maniquí con tu tono de piel y tus prendas confeccionadas a su medida (o la foto original).
import { shades } from './skin.js';
import { FIG, mirror, limbPath, torsoPath, chainPoint, garmentSVG, garmentKind, shadeHex, posedFig, hwAt } from './wear.js';

export const HAIR = { Negro: '#1b1512', Castaño: '#4a2f1f', 'Castaño claro': '#7a5236', Caoba: '#6b2f1f', Rubio: '#c9a265', 'Rubio platino': '#e6d6a8', Pelirrojo: '#a4471f', Gris: '#a7a7a7', Turquesa: '#19b5ad' };
export const FIGURES = { mujer: 'Mujer', hombre: 'Hombre', neutro: 'Neutro' };
export const BUILDS = { Delgada: 0.9, Media: 1, Robusta: 1.14 };
export const HAIR_STYLES = ['Sin pelo', 'Rapado', 'Corto', 'Media melena', 'Largo', 'Moño', 'Rizado'];

// Opciones del maniquí guardadas en el perfil (con valores por defecto y compatibilidad con versiones anteriores).
export function bodyOf(profile) {
  const b = profile.body || {};
  return {
    figure: b.figure || 'neutro',
    build: b.build || 'Media',
    hairStyle: b.hairStyle || 'Sin pelo',
    hairColor: HAIR[profile.hair] ? profile.hair : 'Castaño',
    beard: !!b.beard,
    face: b.face ?? (b.figure && b.figure !== 'neutro'),
    pose: profile.pose || 'relajada',
    customPose: profile.customPose || null,
    headOn: !!profile.headOn,
    chosen: !!profile.body,
  };
}

// Tu cabeza recortada (face.js): { src, eye:[x,y], chin:[x,y], w, h, adj:{scale,dy} }
let HEAD = null;
export const setHead = (rec) => { HEAD = rec; };
// Coloca tu cabeza en la del maniquí: los ojos a la altura de sus ojos y la barbilla en su barbilla
function headImage(h, [cx, cy, , ry], uid) {
  // Un poco más grande y más baja que la cabeza dibujada: con una cara real, el cuello estilizado del maniquí parece demasiado largo
  const eyeY = cy + 4, chinY = cy + ry * 0.95 + 5;
  const s = ((chinY - eyeY) / Math.max(1, h.chin[1] - h.eye[1])) * 1.06 * (h.adj?.scale || 1);
  const x = cx - h.eye[0] * s, y = eyeY + (h.adj?.dy || 0) - h.eye[1] * s;
  const f = (n) => n.toFixed(1);
  return `<ellipse cx="${cx}" cy="${f(chinY + 3)}" rx="${f(ry * 0.42)}" ry="4" fill="#000" opacity=".16" filter="url(#blur-${uid})"/>
    <image class="own-head" href="${h.src}" x="${f(x)}" y="${f(y)}" width="${f(h.w * s)}" height="${f(h.h * s)}"/>`;
}

// Recorta los márgenes vacíos de la imagen para que encaje bien en el cuerpo.
const trimCache = new Map();
export function trim(item) {
  if (trimCache.has(item.id)) return trimCache.get(item.id);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const S = Math.min(1, 900 / Math.max(img.width, img.height)); // detalle suficiente para pantallas Retina
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * S); c.height = Math.round(img.height * S);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      const hasAlpha = data.some((v, i) => i % 4 === 3 && v < 200);
      const bg = [data[0], data[1], data[2]];
      const on = (k) => (hasAlpha ? data[k + 3] > 60 : Math.hypot(data[k] - bg[0], data[k + 1] - bg[1], data[k + 2] - bg[2]) > 32);
      let x0 = width, y0 = height, x1 = 0, y1 = 0;
      for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
        if (on((y * width + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 <= x0) return resolve(item.img);
      // Sin transparencia: quitamos el fondo liso para que no tape el maniquí.
      if (!hasAlpha) {
        const id = ctx.getImageData(0, 0, width, height);
        for (let k = 0; k < id.data.length; k += 4) if (!on(k)) id.data[k + 3] = 0;
        ctx.putImageData(id, 0, 0);
      }
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 2; out.height = y1 - y0 + 2;
      out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = () => resolve(item.img);
    img.src = item.img;
  });
  trimCache.set(item.id, p);
  return p;
}
export const forgetTrim = (id) => trimCache.delete(id);

// ---------- Tela de cada prenda ----------
// Se toma un trozo representativo de la foto recortada (lejos de costuras y botones)
// y se convierte en una baldosa sin cortes (espejada) para vestir al maniquí.
const fabricCache = new Map();
const REGION = {
  top: [0.2, 0.38, 0.22, 0.24], outer: [0.18, 0.4, 0.2, 0.24], one: [0.3, 0.55, 0.18, 0.2],
  bottom: [0.22, 0.3, 0.16, 0.24], shoes: [0.35, 0.3, 0.3, 0.3],
};
const PRINTS = ['Rayas', 'Cuadros', 'Floral', 'Lunares', 'Animal print', 'Camuflaje', 'Lentejuelas'];

// Tela generada para prendas lisas, según el material (sin manchas ni detalles sueltos de la foto).
function wovenTile(item) {
  const T = 64;
  const c = document.createElement('canvas'); c.width = T; c.height = T;
  const ctx = c.getContext('2d');
  const base = item.hex || '#888888';
  ctx.fillStyle = base; ctx.fillRect(0, 0, T, T);
  let seed = [...(item.id || 'x')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const kind = garmentKind(item);
  const mat = `${item.material || ''} ${item.type} ${kind}`.toLowerCase();
  const light = shadeHex(base, 0.22), dark = shadeHex(base, -0.25);
  ctx.globalAlpha = 0.35;
  if (/denim|vaquer|jeans/.test(mat)) {
    // Sarga: diagonales finas
    ctx.lineWidth = 1.2;
    for (let i = -T; i < T * 2; i += 3) { ctx.strokeStyle = i % 6 ? light : dark; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + T, T); ctx.stroke(); }
  } else if (/punto|lana|knit|jersey|cárdigan|cardigan|sudadera|hoodie|sweatshirt/.test(mat)) {
    // Puntos de punto: pequeñas uves
    ctx.lineWidth = 1;
    for (let y = 2; y < T; y += 5) for (let x = 2; x < T; x += 6) { ctx.strokeStyle = (x + y) % 4 ? light : dark; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2.5, y + 3.5); ctx.lineTo(x + 5, y); ctx.stroke(); }
  } else if (/piel|cuero|leather|ante|suede/.test(mat)) {
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 220; i++) { ctx.fillStyle = rnd() > 0.5 ? light : dark; ctx.fillRect(rnd() * T, rnd() * T, 1.5, 1.5); }
  } else {
    // Tejido plano: trama y urdimbre muy finas
    ctx.globalAlpha = 0.14; ctx.lineWidth = 0.8;
    for (let i = 0; i < T; i += 2) { ctx.strokeStyle = i % 4 ? light : dark; ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(T, i); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, T); ctx.stroke(); }
  }
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 260; i++) { ctx.fillStyle = rnd() > 0.5 ? '#fff' : '#000'; ctx.fillRect(rnd() * T, rnd() * T, 1, 1); }
  return { src: c.toDataURL('image/png'), hex: base, tile: 28 };
}

export function fabric(item, slot) {
  const key = `${item.id}:${slot}`;
  if (fabricCache.has(key)) return fabricCache.get(key);
  const p = (async () => {
    if (!PRINTS.includes(item.pattern)) return wovenTile(item);
    const src = await trim(item);
    const img = new Image();
    img.src = src;
    try { await img.decode(); } catch { return wovenTile(item); }
    const [rx, ry, rw, rh] = REGION[slot] || REGION.top;
    let sx = img.width * rx, sy = img.height * ry;
    const sw = Math.max(8, img.width * rw), sh = Math.max(8, img.height * rh);
    // Busca dentro de la zona el trozo con menos transparencia (por si la prenda es estrecha)
    const probe = document.createElement('canvas'); probe.width = 32; probe.height = 32;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    let best = null;
    for (const dx of [0, 0.15, 0.3, 0.45]) for (const dy of [0, 0.1, 0.2]) {
      const x = img.width * (rx + dx), y = img.height * (ry + dy);
      if (x + sw > img.width || y + sh > img.height) continue;
      pctx.clearRect(0, 0, 32, 32); pctx.drawImage(img, x, y, sw, sh, 0, 0, 32, 32);
      const d = pctx.getImageData(0, 0, 32, 32).data;
      let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i];
      if (!best || a > best.a) best = { a, x, y };
    }
    if (best) { sx = best.x; sy = best.y; }
    const T = 64;
    const c = document.createElement('canvas'); c.width = T * 2; c.height = T * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = item.hex || '#888'; ctx.fillRect(0, 0, T * 2, T * 2);
    // Baldosa espejada: los bordes encajan entre sí y no se ven cortes
    for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.save();
      ctx.translate(fx < 0 ? T * 2 : 0, fy < 0 ? T * 2 : 0);
      ctx.scale(fx, fy);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, T, T);
      ctx.restore();
    }
    return { src: c.toDataURL('image/jpeg', 0.85), hex: item.hex, tile: 44 };
  })();
  fabricCache.set(key, p);
  return p;
}
export const forgetFabric = (id) => [...fabricCache.keys()].filter((k) => k.startsWith(`${id}:`)).forEach((k) => fabricCache.delete(k));

const HATS = /gorra|gorro|sombrero|cap|hat/i;

// ---------- Modo foto (la imagen original encima del maniquí) ----------
function photoBox(slot, item, P) {
  if (slot === 'bottom') return /Falda|Shorts/.test(item.type) ? [84, 300, 132, 170, 'xMidYMin'] : [92, 300, 116, 296, 'none'];
  if (slot === 'acc') return HATS.test(`${item.subtype} ${item.name}`) ? [104, 6, 92, 64, 'xMidYMax'] : [114, 108, 72, 72, 'xMidYMid'];
  if (slot === 'shoes') return item.type === 'Botas' ? [96, 506, 108, 116, 'xMidYMax'] : [92, 566, 116, 56, 'xMidYMax'];
  if (slot === 'outer' && item.type === 'Abrigo') { const [x, y, w, h] = P.photo.outer; return [x, y, w, h * 1.42, 'none']; }
  return [...P.photo[slot], 'xMidYMin'];
}
function photoLayer(slot, w, P) {
  const [x, y, wd, h, align] = photoBox(slot, w.item, P);
  return `<image class="cloth" data-slot="${slot}" href="${w.src}" x="${x}" y="${y}" width="${wd}" height="${h}" preserveAspectRatio="${align === 'none' ? 'none' : `${align} meet`}"/>`;
}

// Peinados con reflejo de luz en la parte de arriba
function hairLayers(style, color, head) {
  const h = hairBase(style, color, head);
  if (!h.front) return h;
  const [cx, cy, rx, ry] = head;
  const shine = `<path d="M${cx - rx * 0.62} ${cy - ry * 0.78} Q${cx - rx * 0.25} ${cy - ry * 1.14} ${cx + rx * 0.2} ${cy - ry * 1.1}" stroke="#fff" stroke-opacity=".12" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return { back: h.back, front: h.front + shine };
}
// Peinados: capa de detrás (se dibuja antes que la cabeza) y capa de delante.
function hairBase(style, color, head) {
  const [cx, cy, rx, ry] = head;
  const top = cy - ry, L = cx - rx, R = cx + rx;
  const cap = `M${L - 2} ${cy - 2} Q${L} ${top - 6} ${cx} ${top - 7} Q${R} ${top - 6} ${R + 2} ${cy - 2} Q${cx + rx * 0.55} ${top + 12} ${cx} ${top + 14} Q${cx - rx * 0.55} ${top + 12} ${L - 2} ${cy - 2} Z`;
  const p = (d, extra = '') => `<path d="${d}" fill="${color}" ${extra}/>`;
  switch (style) {
    case 'Rapado': return { back: '', front: p(`M${L + 1} ${cy - 6} Q${L + 2} ${top - 2} ${cx} ${top - 3} Q${R - 2} ${top - 2} ${R - 1} ${cy - 6} Q${cx} ${top + 6} ${L + 1} ${cy - 6} Z`, 'opacity=".75"') };
    case 'Corto': return { back: p(`M${L - 3} ${cy + 6} Q${L - 5} ${top - 8} ${cx} ${top - 9} Q${R + 5} ${top - 8} ${R + 3} ${cy + 6} Z`), front: p(cap) };
    case 'Media melena': return { back: p(`M${L - 4} ${cy} Q${L - 6} ${top - 10} ${cx} ${top - 11} Q${R + 6} ${top - 10} ${R + 4} ${cy} Q${R + 8} ${cy + 36} ${R + 2} ${cy + 52} L${L - 2} ${cy + 52} Q${L - 8} ${cy + 36} ${L - 4} ${cy} Z`), front: p(cap) };
    case 'Largo': return { back: p(`M${L - 5} ${cy} Q${L - 7} ${top - 10} ${cx} ${top - 11} Q${R + 7} ${top - 10} ${R + 5} ${cy} Q${R + 14} ${cy + 70} ${R + 10} ${cy + 116} Q${cx} ${cy + 124} ${L - 10} ${cy + 116} Q${L - 14} ${cy + 70} ${L - 5} ${cy} Z`), front: p(cap) };
    case 'Moño': return { back: `<circle cx="${cx}" cy="${top - 12}" r="15" fill="${color}"/>` + p(`M${L - 2} ${cy + 4} Q${L - 3} ${top - 6} ${cx} ${top - 7} Q${R + 3} ${top - 6} ${R + 2} ${cy + 4} Z`), front: p(cap) };
    case 'Rizado': {
      let back = '';
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.95 + (i / 13) * 1.1) ;
        back += `<circle cx="${(cx + Math.cos(a) * (rx + 8)).toFixed(1)}" cy="${(cy - 6 + Math.sin(a) * (ry + 6)).toFixed(1)}" r="12" fill="${color}"/>`;
      }
      back += `<circle cx="${cx}" cy="${cy - 10}" r="${rx + 6}" fill="${color}"/>`;
      return { back, front: p(cap) };
    }
    default: return { back: '', front: '' };
  }
}

function beardLayer([cx, cy, rx], color) {
  return `<path d="M${cx - rx + 2} ${cy + 4} Q${cx - rx + 4} ${cy + 34} ${cx} ${cy + 38} Q${cx + rx - 4} ${cy + 34} ${cx + rx - 2} ${cy + 4} Q${cx + rx - 8} ${cy + 22} ${cx + 9} ${cy + 18} Q${cx} ${cy + 14} ${cx - 9} ${cy + 18} Q${cx - rx + 8} ${cy + 22} ${cx - rx + 2} ${cy + 4} Z" fill="${color}" opacity=".88"/>`;
}

function faceLayer(head, s, figure, hairColor) {
  const [cx, cy, rx] = head;
  const ink = s.deep;
  const eye = (x, dir) => {
    const ex = cx + dir * rx * 0.37, ey = cy + 2;
    return `<ellipse cx="${ex}" cy="${ey}" rx="4.1" ry="2.7" fill="#fbf7f2"/>
      <circle cx="${ex + dir * 0.2}" cy="${ey + 0.1}" r="2.25" fill="#5a3b2a"/><circle cx="${ex + dir * 0.2}" cy="${ey + 0.1}" r="1.15" fill="#170f0b"/>
      <circle cx="${ex + dir * 0.2 + 0.8}" cy="${ey - 0.8}" r=".65" fill="#fff"/>
      <path d="M${ex - 4.4} ${ey - 0.4} Q${ex} ${ey - 4.2} ${ex + 4.4} ${ey - 0.4}" stroke="#2a1d18" stroke-width="${figure === 'mujer' ? 1.5 : 1.1}" fill="none" stroke-linecap="round"/>
      ${figure === 'mujer' ? `<path d="M${ex + dir * 4} ${ey - 0.8} l${dir * 1.8} -1.4 M${ex + dir * 2.8} ${ey - 2} l${dir * 1.2} -1.6" stroke="#2a1d18" stroke-width=".8" stroke-linecap="round"/>` : ''}`;
  };
  const lip = figure === 'mujer' ? '#b5525a' : shadeHex(s.base, -0.28);
  let f = `<g>
    ${eye(cx, -1)}${eye(cx, 1)}
    <path d="M${cx - rx * 0.56} ${cy - 7} q${rx * 0.17} -4.5 ${rx * 0.36} -1 M${cx + rx * 0.2} ${cy - 8} q${rx * 0.17} -3.5 ${rx * 0.36} 1" stroke="${hairColor || ink}" stroke-width="${figure === 'hombre' ? 2.6 : 1.7}" fill="none" stroke-linecap="round"/>
    <path d="M${cx + 0.6} ${cy + 4} q-2.4 7.4 0.6 9.2 q1.6 0.6 3 -0.6" stroke="${ink}" stroke-opacity=".42" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M${cx - 6.6} ${cy + 20.5} q3.3 -2.2 6.6 -0.6 q3.3 -1.6 6.6 0.6 q-6.6 ${figure === 'mujer' ? 5.6 : 4} -13.2 0 z" fill="${lip}" opacity="${figure === 'mujer' ? 0.92 : 0.55}"/>
    <path d="M${cx - 6.2} ${cy + 20.6} q6.2 1.6 12.4 0" stroke="${shadeHex(lip, -0.35)}" stroke-width=".7" fill="none" opacity=".7"/>
  </g>`;
  f += `<ellipse cx="${cx - rx * 0.52}" cy="${cy + 12}" rx="5.2" ry="3" fill="#e2747c" opacity="${figure === 'mujer' ? 0.2 : 0.08}"/><ellipse cx="${cx + rx * 0.52}" cy="${cy + 12}" rx="5.2" ry="3" fill="#e2747c" opacity="${figure === 'mujer' ? 0.2 : 0.08}"/>`;
  return f;
}

// ---------- Cuerpo ----------
function headPath([cx, cy, rx, ry]) {
  return `M${cx} ${cy - ry} C${cx + rx * 1.08} ${cy - ry} ${cx + rx * 1.06} ${cy + ry * 0.32} ${cx + rx * 0.66} ${cy + ry * 0.76} Q${cx} ${cy + ry * 1.14} ${cx - rx * 0.66} ${cy + ry * 0.76} C${cx - rx * 1.06} ${cy + ry * 0.32} ${cx - rx * 1.08} ${cy - ry} ${cx} ${cy - ry} Z`;
}
// Mano con pulgar, siguiendo la dirección del antebrazo. out: -1 izquierda de la pantalla, +1 derecha
function handPath(chain, out = -1) {
  const p = chainPoint(chain, 1);
  const len = p.r * 2.7, w = p.r * 1.22;
  const ang = (Math.atan2(p.dy, p.dx) * 180) / Math.PI - 90;
  const t = (n) => n.toFixed(1);
  // Palma y dedos (en coordenadas locales: la muñeca en 0,0 y los dedos hacia +y)
  const palm = `M${t(-w * 0.8)} 0 C${t(-w * 1.08)} ${t(len * 0.35)} ${t(-w * 0.95)} ${t(len * 0.88)} ${t(-w * 0.3)} ${t(len)} Q0 ${t(len * 1.06)} ${t(w * 0.32)} ${t(len)} C${t(w * 0.95)} ${t(len * 0.86)} ${t(w * 1.06)} ${t(len * 0.35)} ${t(w * 0.8)} 0 Z`;
  // El pulgar va hacia el cuerpo (lado interior)
  const tx = -out * w * 0.95;
  const thumb = `M${t(tx * 0.7)} ${t(len * 0.18)} Q${t(tx * 1.25)} ${t(len * 0.42)} ${t(tx * 0.95)} ${t(len * 0.62)} Q${t(tx * 0.72)} ${t(len * 0.66)} ${t(tx * 0.55)} ${t(len * 0.46)} Z`;
  return `<g transform="translate(${t(p.x)} ${t(p.y)}) rotate(${ang.toFixed(1)})"><path d="${palm}"/><path d="${thumb}"/></g>`;
}
// Pie en tres cuartos, con la puntera hacia fuera (como en un figurín de moda)
function footPath(chain, out = -1) {
  const a = chain[chain.length - 1];
  const r = a.r, L = r * 4.1, H = r * 1.55;
  const hx = a.x - out * r * 0.55, y0 = a.y + r * 0.6, sole = a.y + 20;
  const tx = hx + out * L;
  return `<path d="M${(hx - out * r * 0.9).toFixed(1)} ${y0.toFixed(1)} C${(hx - out * r * 1.2).toFixed(1)} ${(sole - H * 0.2).toFixed(1)} ${(hx - out * r * 0.9).toFixed(1)} ${sole.toFixed(1)} ${hx.toFixed(1)} ${sole.toFixed(1)}
    L${(tx - out * r * 0.6).toFixed(1)} ${sole.toFixed(1)} Q${(tx + out * r * 0.35).toFixed(1)} ${(sole - 0.5).toFixed(1)} ${tx.toFixed(1)} ${(sole - H * 0.45).toFixed(1)}
    Q${(tx - out * r * 0.4).toFixed(1)} ${(sole - H * 0.95).toFixed(1)} ${(hx + out * L * 0.35).toFixed(1)} ${(sole - H).toFixed(1)} Q${(hx + out * r * 0.9).toFixed(1)} ${(y0 + 2).toFixed(1)} ${(hx + out * r * 0.8).toFixed(1)} ${y0.toFixed(1)} Z"/>`;
}

// worn: { top, bottom, one, outer, shoes, bag, acc } -> { item, src (foto recortada), fabric }
// body: resultado de bodyOf(profile). mode: 'digital' (prendas confeccionadas) | 'foto'
// mode: 'real' (tu prenda deformada al cuerpo) | 'digital' (prenda ilustrada) | 'foto' (imagen original encima)
// photo: { src, x, y, w, h, P } para vestir tu propia foto en lugar del maniquí
export function mannequinSVG({ skin = '#d4a37f', body = {}, worn = {}, bare = false, mode = 'real', photo = null }) {
  const figure = FIG[body.figure] ? body.figure : 'neutro';
  const P = photo?.P || posedFig(figure, body.pose, body.customPose);
  const ownHead = !bare && !photo && body.headOn && HEAD?.src ? HEAD : null;
  const k = BUILDS[body.build] || 1;
  const hairColor = HAIR[body.hairColor] || HAIR.Castaño;
  const s = shades(skin);
  const uid = Math.random().toString(36).slice(2, 7);
  const hair = hairLayers(body.hairStyle || 'Sin pelo', hairColor, P.head);
  const armR = P.armR || mirror(P.arm), legR = P.legR || mirror(P.leg);

  // Capa de cada prenda: confeccionada a medida o foto original
  const layer = (slot) => {
    const w = worn[slot];
    if (!w || bare) return '';
    // Modo real: la foto de tu prenda ya adaptada a este cuerpo (calculada en realwear.js)
    if (mode === 'real' && w.real?.src) return `<image class="cloth real" data-slot="${slot}" href="${w.real.src}" x="0" y="0" width="300" height="640"/>`;
    if (slot === 'bag' || slot === 'acc' || mode === 'foto') {
      if (slot === 'bag') {
        const h = chainPoint(armR, 1);
        return `<image class="cloth" data-slot="bag" href="${w.src}" x="${(h.x - 30).toFixed(1)}" y="${(h.y - 6).toFixed(1)}" width="72" height="84" preserveAspectRatio="xMidYMin meet"/>`;
      }
      return photoLayer(slot, w, P);
    }
    if (mode === 'real' && slot === 'shoes') return photoLayer(slot, w, P);
    return garmentSVG(slot, { P, uid, item: w.item, fabric: w.fabric, photo: w.src, slot });
  };
  // Parte de la manga del codo hacia abajo: va por encima del antebrazo (que a su vez va por encima del cuerpo de la prenda)
  const front = (slot) => (mode === 'real' && !bare && worn[slot]?.real?.front ? `<image class="cloth real" data-slot="${slot}" href="${worn[slot].real.front}" x="0" y="0" width="300" height="640"/>` : '');
  const bootsOver = worn.shoes && /boots/.test(garmentKind(worn.shoes.item));
  if (photo) {
    // Tu foto de fondo y tus prendas encima (solo las que se adaptan al cuerpo)
    const real = (slot) => (worn[slot]?.real?.src ? layer(slot) : '');
    return `<svg viewBox="0 0 300 640" xmlns="http://www.w3.org/2000/svg" class="mannequin photo-body" role="img" aria-label="Tu foto con tu outfit">
  <defs><filter id="soft-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".22"/></filter></defs>
  <image href="${photo.src}" x="${photo.x.toFixed(1)}" y="${photo.y.toFixed(1)}" width="${photo.w.toFixed(1)}" height="${photo.h.toFixed(1)}" preserveAspectRatio="none"/>
  <g filter="url(#soft-${uid})">${bootsOver ? '' : real('shoes')}${real('bottom')}${bootsOver ? real('shoes') : ''}${real('one')}${real('top')}${real('outer')}${front('one')}${front('top')}${front('outer')}${real('bag')}</g>
</svg>`;
  }

  const cyl = `<linearGradient id="cyl-${uid}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".3" stop-color="#000" stop-opacity=".02"/><stop offset=".55" stop-color="#fff" stop-opacity=".13"/><stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    <linearGradient id="vert-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>`;
  const skinFill = `url(#skin-${uid})`;
  const limbShade = (d) => `<path d="${d}" fill="url(#cyl-${uid})"/>`;
  const armPaths = [limbPath(P.arm, { capStart: 'round' }), limbPath(armR, { capStart: 'round' })];
  const legPaths = [limbPath(P.leg, { capStart: 'round' }), limbPath(legR, { capStart: 'round' })];
  const torso = torsoPath(P, { neckDepth: -6, hemCurve: 10 });
  const [ncx, , , nry] = [P.head[0], 0, 0, P.head[3]];
  const neck = `M${150 - P.neck.hw} ${P.neck.y0} L${150 + P.neck.hw} ${P.neck.y0} L${150 + P.neck.hw + 3} ${P.neck.y1} Q150 ${P.neck.y1 + 4} ${150 - P.neck.hw - 3} ${P.neck.y1} Z`;

  // Detalles del cuerpo: clavículas, esternón, pecho, abdomen, codos, rodillas, muñecas y tobillos
  const ink = s.deep, sy = P.shoulderY, cY = sy + 40, wY = P.waistY;
  const line = (d, o = 0.2, w = 1.2) => `<path d="${d}" stroke="${ink}" stroke-opacity="${o}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const crease = (chain, t, len, o = 0.18) => { const q = chainPoint(chain, t); const nx = -q.dy, ny = q.dx; return line(`M${(q.x - nx * len).toFixed(1)} ${(q.y - ny * len).toFixed(1)} Q${(q.x + q.dx * 3).toFixed(1)} ${(q.y + q.dy * 3).toFixed(1)} ${(q.x + nx * len).toFixed(1)} ${(q.y + ny * len).toFixed(1)}`, o, 1.1); };
  const ring = (chain, t, o = 0.14) => { const q = chainPoint(chain, t); const nx = -q.dy, ny = q.dx; return line(`M${(q.x - nx * q.r * 0.95).toFixed(1)} ${(q.y - ny * q.r * 0.95).toFixed(1)} L${(q.x + nx * q.r * 0.95).toFixed(1)} ${(q.y + ny * q.r * 0.95).toFixed(1)}`, o, 1); };
  const details = [
    line(`M${150 - 7} ${sy + 5} q-14 -5 -30 1 M${150 + 7} ${sy + 5} q14 -5 30 1`, 0.24, 1.4),
    line(`M${150 - 4} ${sy + 3} l4 4 l4 -4`, 0.16, 1),
    figure === 'mujer' ? line(`M${150 - 30} ${cY + 8} q14 10 26 1 M${150 + 30} ${cY + 8} q-14 10 -26 1`, 0.2, 1.3) : '',
    figure === 'hombre' ? line(`M${150 - 26} ${cY - 6} q12 6 24 3 M${150 + 26} ${cY - 6} q-12 6 -24 3 M150 ${cY} L150 ${wY + 4}`, 0.14, 1.2) : '',
    `<ellipse cx="150" cy="${wY + 12}" rx="1.6" ry="2.4" fill="${ink}" opacity=".22"/>`,
    line(`M${150 - hwAt(P.rows, P.hipY) + 6} ${P.hipY - 10} q14 18 24 34 M${150 + hwAt(P.rows, P.hipY) - 6} ${P.hipY - 10} q-14 18 -24 34`, 0.1, 1.2),
    ...[P.arm, armR].flatMap((a) => [crease(a, 0.53, a[1].r * 0.55), ring(a, 0.985)]),
    ...[P.leg, legR].flatMap((l) => { const kp = chainPoint(l, 0.5); return [`<ellipse cx="${kp.x.toFixed(1)}" cy="${(kp.y + 1).toFixed(1)}" rx="${(kp.r * 0.55).toFixed(1)}" ry="${(kp.r * 0.75).toFixed(1)}" fill="#fff" opacity=".07"/>`, crease(l, 0.53, kp.r * 0.5, 0.16), ring(l, 0.985, 0.12)]; }),
  ].join('');
  // Brillo de maniquí de tienda: una línea de luz a lo largo de cada extremidad y del torso
  const sheen = (chain) => limbPath(chain.map((q) => ({ ...q, x: q.x + q.r * 0.3, r: q.r * 0.16 })), { capStart: 'round' });
  const gloss = [P.arm, armR, P.leg, legR].map((c) => `<path d="${sheen(c)}" fill="#fff" opacity=".13"/>`).join('')
    + `<path d="M${150 - 14} ${sy + 18} C${150 - 18} ${cY + 30} ${150 - 16} ${wY} ${150 - 10} ${P.hipY + 10}" stroke="#fff" stroke-opacity=".12" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  // Antebrazos y manos por delante de la prenda (manos en la cintura, brazos que cruzan por delante…)
  const elbowAt = (c) => { const a = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y), b = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y); return a / (a + b); };
  const dressed = mode === 'real' && !bare && ['top', 'outer', 'one'].some((sl) => worn[sl]?.real?.src);
  const foreArms = dressed ? (() => {
    const fa = [P.arm, armR].map((c) => limbPath(c, { from: elbowAt(c) - 0.03, capStart: 'round' }));
    return `<g fill="${skinFill}" stroke="${s.deep}" stroke-opacity=".2" stroke-width="1">${fa.map((d) => `<path d="${d}"/>`).join('')}${handPath(P.arm, -1)}${handPath(armR, 1)}</g>${fa.map(limbShade).join('')}`;
  })() : '';
  // Sombras de contacto bajo los pies
  const contact = [P.leg, legR].map((l, i) => { const a = l[l.length - 1]; return `<ellipse cx="${(a.x + (i ? 1 : -1) * a.r * 1.2).toFixed(1)}" cy="${(a.y + 21).toFixed(1)}" rx="${(a.r * 2.6).toFixed(1)}" ry="2.6" fill="#000" opacity=".22"/>`; }).join('');

  return `<svg viewBox="0 0 300 640" xmlns="http://www.w3.org/2000/svg" class="mannequin" role="img" aria-label="Maniquí ${FIGURES[figure]} con tu outfit">
  <defs>
    <linearGradient id="skin-${uid}" x1="0" x2="1">
      <stop offset="0" stop-color="${s.shadow}"/><stop offset=".38" stop-color="${s.base}"/>
      <stop offset=".58" stop-color="${s.light}"/><stop offset="1" stop-color="${s.shadow}"/>
    </linearGradient>
    ${cyl}
    <radialGradient id="floor-${uid}"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <filter id="soft-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-opacity=".2"/></filter>
    <filter id="blur-${uid}"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <ellipse cx="150" cy="618" rx="${92 * k}" ry="11" fill="url(#floor-${uid})"/>
  ${ownHead ? '' : hair.back}
  <g transform="translate(150 0) scale(${k} 1) translate(-150 0)">
    ${contact}
    <g fill="${skinFill}" stroke="${s.deep}" stroke-opacity=".2" stroke-width="1">
      ${legPaths.map((d) => `<path d="${d}"/>`).join('')}
      ${worn.shoes?.real?.src && mode === 'real' ? '' : `${footPath(P.leg, -1)}${footPath(legR, 1)}`}
      ${armPaths.map((d) => `<path d="${d}"/>`).join('')}
      ${handPath(P.arm, -1)}${handPath(armR, 1)}
      <path d="${torso}"/>
    </g>
    ${[...legPaths, ...armPaths].map(limbShade).join('')}
    <path d="${torso}" fill="url(#cyl-${uid})"/>
    ${gloss}
    ${details}
  </g>
  <g fill="${skinFill}" stroke="${s.deep}" stroke-opacity=".2" stroke-width="1">
    <path d="${neck}"/>
    ${ownHead ? '' : `<ellipse cx="${P.head[0] - P.head[2] * 1.0}" cy="${P.head[1] + 4}" rx="4.2" ry="7.5"/><ellipse cx="${P.head[0] + P.head[2] * 1.0}" cy="${P.head[1] + 4}" rx="4.2" ry="7.5"/>
    <path d="${headPath(P.head)}"/>`}
  </g>
  <path d="${neck}" fill="url(#cyl-${uid})"/>${ownHead ? '' : `<path d="${headPath(P.head)}" fill="url(#cyl-${uid})" opacity=".7"/>
  ${body.face ? faceLayer(P.head, s, figure, hairColor) : ''}${body.beard ? beardLayer(P.head, hairColor) : ''}
  ${hair.front}`}
  <g filter="url(#soft-${uid})">
    <g transform="translate(150 0) scale(${k} 1) translate(-150 0)">
      ${bootsOver ? '' : layer('shoes')}${layer('bottom')}${bootsOver ? layer('shoes') : ''}${layer('one')}${layer('top')}${layer('outer')}
      ${foreArms}${front('one')}${front('top')}${front('outer')}${layer('bag')}
    </g>
    ${ownHead ? headImage(ownHead, P.head, uid) : ''}
    ${layer('acc')}
  </g>
</svg>`;
}
