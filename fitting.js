// Vestidor: maniquí con tu tono de piel y tus prendas confeccionadas a su medida (o la foto original).
import { shades } from './skin.js';
import { FIG, mirror, limbPath, torsoPath, chainPoint, garmentSVG, garmentKind, shadeHex } from './wear.js';

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
    chosen: !!profile.body,
  };
}

// Recorta los márgenes vacíos de la imagen para que encaje bien en el cuerpo.
const trimCache = new Map();
export function trim(item) {
  if (trimCache.has(item.id)) return trimCache.get(item.id);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const S = Math.min(1, 500 / Math.max(img.width, img.height));
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

// Peinados: capa de detrás (se dibuja antes que la cabeza) y capa de delante.
function hairLayers(style, color, head) {
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
  let f = `<g opacity=".85">
    <ellipse cx="${cx - rx * 0.36}" cy="${cy + 2}" rx="2.6" ry="3.2" fill="#2a1d18"/><ellipse cx="${cx + rx * 0.36}" cy="${cy + 2}" rx="2.6" ry="3.2" fill="#2a1d18"/>
    <path d="M${cx - rx * 0.52} ${cy - 7} q${rx * 0.16} -4 ${rx * 0.32} -1 M${cx + rx * 0.2} ${cy - 8} q${rx * 0.16} -3 ${rx * 0.32} 1" stroke="${hairColor || ink}" stroke-width="${figure === 'hombre' ? 2.4 : 1.6}" fill="none" stroke-linecap="round"/>
    <path d="M${cx} ${cy + 5} q-2 7 1 9" stroke="${ink}" stroke-opacity=".5" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M${cx - 7} ${cy + 20} q7 ${figure === 'mujer' ? 5 : 3.5} 14 0" stroke="${figure === 'mujer' ? '#b5525a' : ink}" stroke-opacity="${figure === 'mujer' ? 0.9 : 0.6}" stroke-width="${figure === 'mujer' ? 2.4 : 1.6}" fill="none" stroke-linecap="round"/>
  </g>`;
  if (figure === 'mujer') f += `<ellipse cx="${cx - rx * 0.5}" cy="${cy + 13}" rx="5" ry="3" fill="#e2747c" opacity=".18"/><ellipse cx="${cx + rx * 0.5}" cy="${cy + 13}" rx="5" ry="3" fill="#e2747c" opacity=".18"/>`;
  return f;
}


// ---------- Cuerpo ----------
function headPath([cx, cy, rx, ry]) {
  return `M${cx} ${cy - ry} C${cx + rx * 1.08} ${cy - ry} ${cx + rx * 1.06} ${cy + ry * 0.32} ${cx + rx * 0.66} ${cy + ry * 0.76} Q${cx} ${cy + ry * 1.14} ${cx - rx * 0.66} ${cy + ry * 0.76} C${cx - rx * 1.06} ${cy + ry * 0.32} ${cx - rx * 1.08} ${cy - ry} ${cx} ${cy - ry} Z`;
}
function handPath(chain) {
  const p = chainPoint(chain, 1);
  const len = p.r * 2.6, w = p.r * 1.25;
  const cx = p.x + p.dx * len * 0.55, cy = p.y + p.dy * len * 0.55;
  const ang = (Math.atan2(p.dy, p.dx) * 180) / Math.PI - 90;
  return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${w.toFixed(1)}" ry="${(len * 0.62).toFixed(1)}" transform="rotate(${ang.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
}
function footPath(chain) {
  const a = chain[chain.length - 1];
  return `<path d="M${a.x - a.r - 4} ${a.y + 2} Q${a.x - a.r - 6} ${a.y + 18} ${a.x} ${a.y + 20} Q${a.x + a.r + 6} ${a.y + 18} ${a.x + a.r + 4} ${a.y + 2} Z"/>`;
}

// worn: { top, bottom, one, outer, shoes, bag, acc } -> { item, src (foto recortada), fabric }
// body: resultado de bodyOf(profile). mode: 'digital' (prendas confeccionadas) | 'foto'
export function mannequinSVG({ skin = '#d4a37f', body = {}, worn = {}, bare = false, mode = 'digital' }) {
  const figure = FIG[body.figure] ? body.figure : 'neutro';
  const P = FIG[figure];
  const k = BUILDS[body.build] || 1;
  const hairColor = HAIR[body.hairColor] || HAIR.Castaño;
  const s = shades(skin);
  const uid = Math.random().toString(36).slice(2, 7);
  const hair = hairLayers(body.hairStyle || 'Sin pelo', hairColor, P.head);
  const armR = mirror(P.arm), legR = mirror(P.leg);

  // Capa de cada prenda: confeccionada a medida o foto original
  const layer = (slot) => {
    const w = worn[slot];
    if (!w || bare) return '';
    if (slot === 'bag' || slot === 'acc' || mode === 'foto') {
      if (slot === 'bag') {
        const h = chainPoint(armR, 1);
        return `<image class="cloth" data-slot="bag" href="${w.src}" x="${(h.x - 30).toFixed(1)}" y="${(h.y - 6).toFixed(1)}" width="72" height="84" preserveAspectRatio="xMidYMin meet"/>`;
      }
      return photoLayer(slot, w, P);
    }
    return garmentSVG(slot, { P, uid, item: w.item, fabric: w.fabric, photo: w.src, slot });
  };
  const bootsOver = worn.shoes && /boots/.test(garmentKind(worn.shoes.item));

  const cyl = `<linearGradient id="cyl-${uid}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".3" stop-color="#000" stop-opacity=".02"/><stop offset=".55" stop-color="#fff" stop-opacity=".13"/><stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    <linearGradient id="vert-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>`;
  const skinFill = `url(#skin-${uid})`;
  const limbShade = (d) => `<path d="${d}" fill="url(#cyl-${uid})"/>`;
  const armPaths = [limbPath(P.arm, { capStart: 'round' }), limbPath(armR, { capStart: 'round' })];
  const legPaths = [limbPath(P.leg, { capStart: 'round' }), limbPath(legR, { capStart: 'round' })];
  const torso = torsoPath(P, { neckDepth: -6, hemCurve: 10 });
  const [ncx, , , nry] = [P.head[0], 0, 0, P.head[3]];
  const neck = `M${150 - P.neck.hw} ${P.neck.y0} L${150 + P.neck.hw} ${P.neck.y0} L${150 + P.neck.hw + 3} ${P.neck.y1} Q150 ${P.neck.y1 + 4} ${150 - P.neck.hw - 3} ${P.neck.y1} Z`;

  return `<svg viewBox="0 0 300 640" xmlns="http://www.w3.org/2000/svg" class="mannequin" role="img" aria-label="Maniquí ${FIGURES[figure]} con tu outfit">
  <defs>
    <linearGradient id="skin-${uid}" x1="0" x2="1">
      <stop offset="0" stop-color="${s.shadow}"/><stop offset=".38" stop-color="${s.base}"/>
      <stop offset=".58" stop-color="${s.light}"/><stop offset="1" stop-color="${s.shadow}"/>
    </linearGradient>
    ${cyl}
    <radialGradient id="floor-${uid}"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <filter id="soft-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-opacity=".2"/></filter>
  </defs>
  <ellipse cx="150" cy="618" rx="${92 * k}" ry="11" fill="url(#floor-${uid})"/>
  ${hair.back}
  <g transform="translate(150 0) scale(${k} 1) translate(-150 0)">
    <g fill="${skinFill}" stroke="${s.deep}" stroke-opacity=".2" stroke-width="1">
      ${legPaths.map((d) => `<path d="${d}"/>`).join('')}
      ${footPath(P.leg)}${footPath(legR)}
      ${armPaths.map((d) => `<path d="${d}"/>`).join('')}
      ${handPath(P.arm)}${handPath(armR)}
      <path d="${torso}"/>
    </g>
    ${[...legPaths, ...armPaths].map(limbShade).join('')}
    <path d="${torso}" fill="url(#cyl-${uid})"/>
    <path d="M${150 - 30} ${P.shoulderY + 10} q18 6 26 2 M${150 + 30} ${P.shoulderY + 10} q-18 6 -26 2" stroke="${s.deep}" stroke-opacity=".22" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    ${[P.leg, legR].map((l) => { const kp = chainPoint(l, 0.5); return `<path d="M${(kp.x - 5).toFixed(1)} ${(kp.y + 2).toFixed(1)} q5 4 10 0" stroke="${s.deep}" stroke-opacity=".2" stroke-width="1.2" fill="none"/>`; }).join('')}
  </g>
  <g fill="${skinFill}" stroke="${s.deep}" stroke-opacity=".2" stroke-width="1">
    <path d="${neck}"/>
    <ellipse cx="${P.head[0] - P.head[2] * 1.0}" cy="${P.head[1] + 4}" rx="4.2" ry="7.5"/><ellipse cx="${P.head[0] + P.head[2] * 1.0}" cy="${P.head[1] + 4}" rx="4.2" ry="7.5"/>
    <path d="${headPath(P.head)}"/>
  </g>
  <path d="${neck}" fill="url(#cyl-${uid})"/><path d="${headPath(P.head)}" fill="url(#cyl-${uid})" opacity=".7"/>
  ${body.face ? faceLayer(P.head, s, figure, hairColor) : ''}${body.beard ? beardLayer(P.head, hairColor) : ''}
  ${hair.front}
  <g filter="url(#soft-${uid})">
    <g transform="translate(150 0) scale(${k} 1) translate(-150 0)">
      ${bootsOver ? '' : layer('shoes')}${layer('bottom')}${bootsOver ? layer('shoes') : ''}${layer('one')}${layer('top')}${layer('outer')}${layer('bag')}
    </g>
    ${layer('acc')}
  </g>
</svg>`;
}
