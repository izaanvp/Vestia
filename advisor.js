// Vistelo AI: motor de estilo propio que funciona en el dispositivo.
import * as C from './color.js';

const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------- Reconocimiento de prendas ----------------
const TYPE_WORDS = [
  ['Vaqueros', ['vaquero', 'jeans', 'jean', 'denim pant', 'tejano']],
  ['Zapatillas', ['zapatilla', 'sneaker', 'trainer', 'deportiva', 'air force', 'jordan', 'dunk', 'samba', 'converse', 'vans']],
  ['Sudadera', ['sudadera', 'hoodie', 'sweatshirt', 'crewneck']],
  ['Americana', ['americana', 'blazer']],
  ['Abrigo', ['abrigo', 'coat', 'trench', 'parka', 'plumifero', 'puffer']],
  ['Chaqueta', ['chaqueta', 'jacket', 'cazadora', 'bomber', 'cardigan', 'chaleco', 'vest']],
  ['Jersey', ['jersey', 'sweater', 'punto', 'knit', 'pullover', 'jumper']],
  ['Camisa', ['camisa', 'shirt', 'blusa', 'blouse', 'polo']],
  ['Camiseta', ['camiseta', 'tshirt', 't-shirt', 'tee', 'tank']],
  ['Top', ['top', 'crop', 'body', 'corse', 'bralette']],
  ['Vestido', ['vestido', 'dress']],
  ['Mono', ['mono', 'jumpsuit', 'peto']],
  ['Falda', ['falda', 'skirt', 'skort']],
  ['Shorts', ['short', 'bermuda']],
  ['Pantalón', ['pantalon', 'pants', 'trouser', 'chino', 'cargo', 'legging', 'jogger', 'palazzo']],
  ['Botas', ['bota', 'boot', 'botin']],
  ['Sandalias', ['sandalia', 'sandal', 'chancla', 'slide']],
  ['Zapatos', ['zapato', 'shoe', 'mocasin', 'loafer', 'tacon', 'heel', 'bailarina', 'salon']],
  ['Bolso', ['bolso', 'bag', 'mochila', 'cartera', 'tote', 'clutch']],
  ['Accesorio', ['gorra', 'cap', 'gorro', 'cinturon', 'belt', 'bufanda', 'scarf', 'gafas', 'collar', 'pendiente', 'reloj', 'panuelo']],
];

export const KNOWN_BRANDS = {
  'Zara': 'https://www.zara.com/es/',
  'Mango': 'https://shop.mango.com/es',
  'H&M': 'https://www2.hm.com/es_es/index.html',
  'Pull&Bear': 'https://www.pullandbear.com/es/',
  'Bershka': 'https://www.bershka.com/es/',
  'Stradivarius': 'https://www.stradivarius.com/es/',
  'Massimo Dutti': 'https://www.massimodutti.com/es/',
  'Lefties': 'https://www.lefties.com/es/',
  'COS': 'https://www.cos.com/',
  'Arket': 'https://www.arket.com/',
  '& Other Stories': 'https://www.stories.com/',
  'Uniqlo': 'https://www.uniqlo.com/es/es/',
  'Nike': 'https://www.nike.com/es/launch',
  'Adidas': 'https://www.adidas.es/',
  'New Balance': 'https://www.newbalance.es/',
  "Levi's": 'https://www.levi.com/',
  'Ralph Lauren': 'https://www.ralphlauren.es/',
  'Scalpers': 'https://scalperscompany.com/',
  'Sézane': 'https://www.sezane.com/es',
  'Reformation': 'https://www.thereformation.com/',
  'Carhartt WIP': 'https://www.carhartt-wip.com/',
  'Stüssy': 'https://www.stussy.com/',
  'Urban Outfitters': 'https://www.urbanoutfitters.com/',
  'Free People': 'https://www.freepeople.com/',
  'Lululemon': 'https://shop.lululemon.com/',
  'Converse': 'https://www.converse.com/',
  'Vans': 'https://www.vans.es/',
  'Ganni': 'https://www.ganni.com/',
  'Sandro': 'https://es.sandro-paris.com/',
  'Bimba y Lola': 'https://www.bimbaylola.com/',
};

export const STYLE_BRANDS = {
  Minimalista: ['COS', 'Arket', 'Uniqlo', 'Massimo Dutti'],
  Streetwear: ['Nike', 'Carhartt WIP', 'Stüssy', 'Adidas', 'Pull&Bear'],
  Clásico: ['Massimo Dutti', 'Ralph Lauren', 'Mango', 'Scalpers'],
  Boho: ['Free People', 'Sézane', 'Mango'],
  Deportivo: ['Nike', 'Adidas', 'New Balance', 'Lululemon'],
  Elegante: ['Massimo Dutti', '& Other Stories', 'Reformation', 'Sandro'],
  Vintage: ["Levi's", 'Urban Outfitters', 'Lefties'],
  Romántico: ['Sézane', '& Other Stories', 'Stradivarius'],
  Y2K: ['Bershka', 'Urban Outfitters', 'Converse'],
  'Old money': ['Ralph Lauren', 'Massimo Dutti', 'Scalpers'],
};

// Silueta: máscara de la prenda (transparencia o diferencia con el fondo).
function silhouette(canvas) {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const px = (x, y) => (y * S + x) * 4;
  const hasAlpha = d.some((v, i) => i % 4 === 3 && v < 200);
  const bg = [d[0], d[1], d[2]];
  const on = (x, y) => {
    const k = px(x, y);
    return hasAlpha ? d[k + 3] > 120 : Math.hypot(d[k] - bg[0], d[k + 1] - bg[1], d[k + 2] - bg[2]) > 40;
  };
  let x0 = S, x1 = 0, y0 = S, y1 = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (on(x, y)) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const row = (t) => {
    const y = Math.round(y0 + (y1 - y0) * t);
    let w = 0, runs = 0, prev = false;
    for (let x = x0; x <= x1; x++) { const o = on(x, y); if (o) w++; if (o && !prev) runs++; prev = o; }
    return { w, runs };
  };
  return { ratio: (x1 - x0) / (y1 - y0), top: row(0.22), mid: row(0.5), low: row(0.88) };
}

function typeFromShape(canvas) {
  const s = silhouette(canvas);
  if (!s) return null;
  if (s.ratio > 1.45) return 'Zapatillas';
  if (s.low.runs >= 2 && s.mid.runs <= 2) return s.ratio > 0.8 ? 'Shorts' : 'Pantalón';
  if (s.top.w > s.low.w * 1.2) return 'Camiseta';
  if (s.low.w > s.top.w * 1.3) return s.ratio < 0.62 ? 'Vestido' : 'Falda';
  if (s.ratio < 0.5) return 'Vestido';
  return 'Camiseta';
}

const SEASON_BY_TYPE = {
  Abrigo: 'Invierno', Jersey: 'Invierno', Sudadera: 'Entretiempo', Botas: 'Invierno', Chaqueta: 'Entretiempo',
  Shorts: 'Verano', Sandalias: 'Verano', Top: 'Verano',
};

// Propone tipo, marca, nombre y temporada para una prenda recién subida.
export function guessItem({ fileName = '', canvas, color, extraBrands = [] }) {
  const n = norm(fileName.replace(/[_.-]+/g, ' '));
  let type = TYPE_WORDS.find(([, words]) => words.some((w) => n.includes(w)))?.[0];
  const byShape = !type;
  if (!type && canvas) type = typeFromShape(canvas);
  type ||= 'Camiseta';
  const brands = [...new Set([...extraBrands, ...Object.keys(KNOWN_BRANDS)])];
  const brand = brands.find((b) => new RegExp(`(^|\\s)${norm(b).replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}(\\s|$)`).test(n)) || '';
  const looksRandom = !n.trim() || /^(img|image|photo|foto|dsc|screenshot|captura|pxl|whatsapp|\d)/.test(n.trim());
  const name = looksRandom ? `${type} ${color.toLowerCase()}` : fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40);
  return { type, brand, name, season: SEASON_BY_TYPE[type] || 'Todo el año', byShape };
}

// ---------------- Explicación de outfits ----------------
function relation(a, b) {
  if (C.isNeutral(a.color) && C.isNeutral(b.color)) return `${a.color} y ${b.color} son neutros: una base sobria que nunca falla`;
  if (C.isNeutral(a.color) || C.isNeutral(b.color)) {
    const [n, c] = C.isNeutral(a.color) ? [a, b] : [b, a];
    return `el ${n.color.toLowerCase()} es neutro y deja que el ${c.color.toLowerCase()} sea el protagonista`;
  }
  const h = (x) => C.rgbToHsl(...C.hexToRgb(x.hex))[0];
  let d = Math.abs(h(a) - h(b)); if (d > 180) d = 360 - d;
  if (d < 12) return `${a.color.toLowerCase()} y ${b.color.toLowerCase()} forman un tono sobre tono muy pulido`;
  if (d < 45) return `${a.color.toLowerCase()} y ${b.color.toLowerCase()} son análogos (vecinos en la rueda de color): combinación armoniosa`;
  if (d > 150) return `${a.color.toLowerCase()} y ${b.color.toLowerCase()} son complementarios: contraste con mucha energía`;
  return `${a.color.toLowerCase()} con ${b.color.toLowerCase()} es una mezcla atrevida; equilíbrala con accesorios neutros`;
}

export function explainOutfit(pieces, season, occasion) {
  const lines = [];
  const main = pieces.filter((p) => !['Zapatos', 'Zapatillas', 'Botas', 'Sandalias', 'Bolso', 'Accesorio'].includes(p.type));
  if (main.length >= 2) lines.push(`• ${cap(relation(main[0], main[1]))}.`);
  const accents = pieces.filter((p) => !C.isNeutral(p.color));
  if (accents.length === 0) lines.push('• Look 100 % neutro: añade un accesorio de tu paleta para darle vida.');
  else if (accents.length === 1) lines.push(`• Un único color de acento (${accents[0].color.toLowerCase()}): la regla de oro para ir elegante sin esfuerzo.`);
  else if (new Set(accents.map((p) => p.color)).size > 2) lines.push('• Tiene más de dos colores intensos; si quieres algo más sobrio, cambia una pieza por un neutro.');
  if (season) {
    const top = pieces.find((p) => ['Camiseta', 'Camisa', 'Top', 'Jersey', 'Sudadera', 'Vestido', 'Mono'].includes(p.type));
    if (top) {
      const f = C.paletteFit(top.hex, season);
      lines.push(f > 0.55
        ? `• La parte de arriba (${top.color.toLowerCase()}) está en tu paleta ${season}: ilumina tu cara.`
        : `• La parte de arriba (${top.color.toLowerCase()}) no es de tu paleta ${season}; un pañuelo o collar de tus colores cerca de la cara lo compensa.`);
    }
  }
  lines.push(`• Ideal para: ${occasion.toLowerCase()}.`);
  return lines.join('\n');
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------- Lectura de productos de otras webs ----------------
const COLOR_WORDS = {
  Negro: ['negro', 'black', 'noir'], Blanco: ['blanco', 'white', 'off white', 'ecru', 'crudo'], Crema: ['crema', 'cream', 'vainilla'],
  Gris: ['gris', 'grey', 'gray', 'jaspeado'], Beige: ['beige', 'arena', 'sand', 'piedra', 'stone'], Camel: ['camel', 'tostado', 'tan'],
  Marrón: ['marron', 'brown', 'chocolate', 'cafe', 'moka'], 'Azul marino': ['marino', 'navy'], Denim: ['denim', 'vaquero', 'indigo'],
  Azul: ['azul', 'blue', 'cobalto'], Celeste: ['celeste', 'azul claro', 'light blue', 'cielo'], Turquesa: ['turquesa', 'turquoise', 'aguamarina', 'teal'],
  Verde: ['verde', 'green', 'esmeralda', 'botella'], 'Verde oliva': ['oliva', 'olive', 'kaki', 'khaki', 'caqui'], 'Verde menta': ['menta', 'mint'],
  Amarillo: ['amarillo', 'yellow'], Mostaza: ['mostaza', 'mustard', 'ocre'], Naranja: ['naranja', 'orange', 'teja'], Coral: ['coral', 'salmon', 'melocoton'],
  Rojo: ['rojo', 'red'], Burdeos: ['burdeos', 'granate', 'burgundy', 'vino'], Rosa: ['rosa', 'pink', 'blush'], Fucsia: ['fucsia', 'fuchsia', 'magenta'],
  Lila: ['lila', 'lavanda', 'lilac', 'malva'], Morado: ['morado', 'purple', 'violeta'],
};
export function productFromPage(page) {
  const text = norm(`${page.title} ${page.text.slice(0, 600)}`);
  const titleN = norm(page.title);
  const type = TYPE_WORDS.find(([, w]) => w.some((x) => titleN.includes(x)))?.[0] || TYPE_WORDS.find(([, w]) => w.some((x) => text.includes(x)))?.[0] || null;
  const hintN = ` ${norm(page.colorHint || '')} `;
  const findColor = (hay) => Object.entries(COLOR_WORDS).find(([, w]) => w.some((x) => hay.includes(` ${x}`)))?.[0];
  const color = findColor(` ${titleN} `) || findColor(hintN) || findColor(` ${text} `) || null;
  const brand = Object.keys(KNOWN_BRANDS).find((b) => text.includes(norm(b)) || page.site.includes(norm(b).replace(/[^a-z]/g, ''))) || '';
  return { type, color, hex: color ? C.NAMED_COLORS.find((c) => c.name === color)?.hex : null, brand, title: page.title.replace(/\s*[|–-]\s*[^|–-]+$/, '').slice(0, 90), price: page.price, image: page.image, url: page.url, site: page.site };
}

// ---------------- Chat de Vistelo AI ----------------
const OCCASION_WORDS = [
  ['Trabajo', ['trabajo', 'oficina', 'entrevista', 'reunion', 'clase', 'universidad', 'presentacion']],
  ['Noche', ['boda', 'bautizo', 'comunion', 'evento', 'cena', 'fiesta', 'cita', 'noche', 'discoteca', 'concierto', 'cumple', 'gala']],
  ['Deporte', ['gym', 'gimnasio', 'deporte', 'correr', 'entrenar', 'yoga', 'pilates', 'padel', 'running']],
  ['Casual', ['playa', 'paseo', 'finde', 'fin de semana', 'brunch', 'casual', 'diario', 'compras', 'cine', 'viaje']],
];

function findMentioned(q, items) {
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  let best = null, bestScore = 0;
  for (const it of items) {
    const hay = norm(`${it.name} ${it.subtype || ''} ${it.type} ${it.color} ${it.brand}`);
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return bestScore >= 1 ? best : null;
}
const label = (it) => it.name || it.subtype || it.type;
const memory = { lastOccasion: null, lastIds: [], lastItem: null, lastWeather: null };

// ctx: { items, season, seasonInfo, skin, brands, gaps(), matches(item), outfit(opts), web, wardrobeStats() }
// Devuelve { text, ids?, links?, card?, actions? }
export async function answer(question, ctx) {
  const q = norm(question);
  const { items, season } = ctx;
  const url = ctx.web.findUrl(question);

  // 1. Leer un enlace de una tienda
  if (url) {
    const page = await ctx.web.readPage(url);
    const prod = productFromPage(page);
    const lines = [`He leído ${page.site}: «${prod.title}».`];
    if (prod.price) lines.push(`Precio: ${prod.price}.`);
    let ids = [];
    if (prod.hex) {
      if (season) {
        const f = Math.round(C.paletteFit(prod.hex, season) * 100);
        lines.push(`Color ${prod.color.toLowerCase()}: encaje con tu paleta ${season} del ${f}% ${f > 60 ? '— te favorece' : f > 35 ? '— te queda bien' : '— no es de tus colores, mejor lejos de la cara'}.`);
      }
      const fake = { id: '_', hex: prod.hex, color: prod.color, type: prod.type || 'Camiseta' };
      const m = ctx.matches(fake);
      if (m.length) { lines.push(`Combinaría con ${m.length} prendas de tu armario:`); ids = m.map(({ o }) => o.id); }
      const dupes = items.filter((i) => i.type === prod.type && C.deltaE(i.hex, prod.hex) < 18);
      if (dupes.length) lines.push(`Ojo: ya tienes ${dupes.length} ${prod.type?.toLowerCase() || 'prenda'} muy parecida${dupes.length > 1 ? 's' : ''}.`);
    } else lines.push('No he podido saber el color con seguridad; ábrela para verlo.');
    return { text: lines.join('\n'), ids, card: prod, actions: [{ label: '♡ Guardar en deseos', act: 'wish', data: prod }] };
  }

  if (!items.length && !/color|paleta|sienta|favorece|piel|tono|novedad|drop|lanzamiento|nuevo/.test(q)) {
    return { text: 'Tu armario aún está vacío. Sube unas cuantas prendas desde la pestaña Armario y podré proponerte looks con ellas.' };
  }

  if (/^(hola|buenas|hey|ey)\b/.test(q) && q.length < 18) {
    return { text: `Hola${ctx.name ? `, ${ctx.name}` : ''}. Soy Vistelo AI. Puedo:\n• Proponerte el look de hoy según el tiempo\n• Crear looks para una ocasión o combinar una prenda\n• Leer el enlace de una tienda y decirte si te favorece\n• Contarte las novedades de tus marcas\n• Decirte qué te falta, hacerte una maleta o darte estadísticas de tu armario` };
  }

  // 2. Novedades de marcas
  if (/novedad|drop|lanzamiento|nuevo en|nueva coleccion|que hay nuevo|colaboracion/.test(q)) {
    const all = [...new Set([...ctx.brands, ...Object.keys(KNOWN_BRANDS)])];
    const asked = all.filter((b) => q.includes(norm(b)));
    const list = (asked.length ? asked : ctx.brands).slice(0, 3);
    if (!list.length) return { text: 'Dime de qué marca quieres las novedades (por ejemplo «novedades de Zara») o sigue marcas en la pestaña Drops.' };
    const links = [];
    for (const b of list) {
      try { (await ctx.web.brandNews(b)).slice(0, 3).forEach((n) => links.push(n)); } catch { /* sigue con la siguiente */ }
    }
    return links.length
      ? { text: `Lo último de ${list.join(', ')}:`, links }
      : { text: 'No he podido leer las noticias ahora mismo. Prueba en un rato o abre la pestaña Drops.' };
  }

  // 3. Look de hoy según el tiempo
  if (/\bhoy\b|tiempo|clima|frio|calor|llueve|lluvia|manana/.test(q) && !/falta|comprar/.test(q)) {
    let w = null;
    try { w = await ctx.web.weather(); memory.lastWeather = w; } catch (e) { return { text: `${e.message} Mientras tanto, dime la ocasión y te propongo un look.` }; }
    const occ = OCCASION_WORDS.find(([, ws]) => ws.some((x) => q.includes(x)))?.[0] || 'Casual';
    const o = ctx.outfit({ occasion: occ, weather: w });
    if (!o) return { text: `Hoy: ${w.temp} °C, ${w.label}. Necesito más prendas para proponerte un look.` };
    memory.lastOccasion = occ; memory.lastIds = o.pieces.map((p) => p.id);
    const tip = w.temp <= 10 ? 'Hace frío: capas y abrigo.' : w.temp <= 17 ? 'Fresco: lleva una capa ligera.' : w.temp >= 27 ? 'Calor: tejidos ligeros y colores claros.' : 'Temperatura agradable.';
    return { text: `Hoy en tu zona: ${w.temp} °C (máx. ${w.max}°, mín. ${w.min}°), ${w.label}. ${tip}${w.rain ? ' Llueve: evita sandalias y ante.' : ''}\n${explainOutfit(o.pieces, season, occ)}`, ids: memory.lastIds, actions: [{ label: 'Probar en el vestidor', act: 'try', data: memory.lastIds }] };
  }

  // 4. Otra propuesta
  if (/^(otra|otro|otra opcion|dame otra|cambia|diferente|no me gusta)/.test(q) && memory.lastOccasion) {
    const o = ctx.outfit({ occasion: memory.lastOccasion, weather: memory.lastWeather, exclude: memory.lastIds });
    if (!o) return { text: 'No tengo más combinaciones distintas con tu armario actual.' };
    memory.lastIds = o.pieces.map((p) => p.id);
    return { text: `Otra idea para ${memory.lastOccasion.toLowerCase()}:\n${explainOutfit(o.pieces, season, memory.lastOccasion)}`, ids: memory.lastIds, actions: [{ label: 'Probar en el vestidor', act: 'try', data: memory.lastIds }] };
  }

  // 5. Piel y colores
  if (/piel|tono/.test(q) && !/combin/.test(q)) {
    if (!ctx.skin) return { text: 'Aún no conozco tu tono de piel. Pulsa «Tu tono de piel» y hazte una foto con la cámara o sube una.', actions: [{ label: 'Medir mi tono de piel', act: 'skin' }] };
    return { text: `Tu piel: ${ctx.skin.desc}. ${season ? `Encaja con la estación ${season}. ${ctx.seasonInfo.desc}` : 'Haz el test de color para saber tu estación.'}` };
  }
  if (/color|paleta|sienta|favorece/.test(q) && !/combin/.test(q)) {
    if (!season) return { text: 'Aún no sé qué colores te favorecen. Haz el test de color (2 minutos) y te lo diré con detalle.' };
    const fav = items.filter((i) => C.paletteFit(i.hex, season) > 0.55);
    return { text: `Eres ${season}. ${ctx.seasonInfo.desc}\nMetales: ${ctx.seasonInfo.metals}. Neutros: ${ctx.seasonInfo.neutrals}.${fav.length ? '\nEstas prendas tuyas te favorecen:' : ''}`, ids: fav.slice(0, 6).map((i) => i.id) };
  }

  // 6. Estadísticas
  if (/estadistic|mas uso|mas me pongo|menos uso|nunca|olvidad|cuanto he gastado|gasto/.test(q)) {
    const st = ctx.wardrobeStats();
    return {
      text: `Tu armario: ${st.count} prendas${st.spent ? `, ${st.spent} invertidos` : ''}.\n• Más usada: ${st.top ? `${label(st.top)} (${st.top.wears || 0} veces)` : '—'}\n• ${st.never.length} prendas sin estrenar en Vestia${st.never.length ? ': dales una oportunidad esta semana' : ''}\n• Color dominante: ${st.mainColor || '—'}`,
      ids: st.never.slice(0, 6).map((i) => i.id),
    };
  }

  if (/falta|comprar|compro|necesito|lista|wishlist/.test(q)) {
    const g = ctx.gaps();
    return { text: g.length ? `Esto es lo que añadiría a tu armario:\n${g.slice(0, 6).map((x) => `• ${x.text}`).join('\n')}\nTienes los enlaces en la pestaña Drops.` : 'Tu armario está muy completo. Te sugiero renovar básicos en colores de tu paleta.' };
  }

  if (/maleta|equipaje|capsula|viaje de/.test(q)) {
    const pick = (types, n) => items.filter((i) => types.includes(i.type)).sort((a, b) => (C.isNeutral(b.color) - C.isNeutral(a.color))).slice(0, n);
    const cap = [...pick(['Camiseta', 'Camisa', 'Top', 'Jersey'], 3), ...pick(['Pantalón', 'Vaqueros', 'Falda', 'Shorts'], 2), ...pick(['Vestido'], 1), ...pick(['Chaqueta', 'Americana', 'Abrigo'], 1), ...pick(['Zapatillas', 'Zapatos', 'Sandalias', 'Botas'], 2)];
    return { text: `Maleta cápsula: ${cap.length} prendas que combinan entre sí (priorizo neutros para multiplicar los looks).`, ids: cap.map((i) => i.id) };
  }

  const mentioned = findMentioned(q, items) || (/\b(esa|esta|ella|eso)\b/.test(q) ? memory.lastItem : null);
  const occasion = OCCASION_WORDS.find(([, w]) => w.some((x) => q.includes(x)))?.[0];

  if (mentioned && (/combin|pega|juego|con que|conjunt/.test(q) || !occasion)) {
    memory.lastItem = mentioned;
    const m = ctx.matches(mentioned);
    return {
      text: m.length ? `Con tu ${label(mentioned)} (${mentioned.color.toLowerCase()}) te recomiendo:\n${m.map(({ o, h }) => `• ${label(o)} — ${Math.round(h * 100)}% armonía`).join('\n')}` : 'Aún no tengo prendas de otras categorías para combinar con esa. ¡Sube más ropa!',
      ids: m.map(({ o }) => o.id),
      actions: m.length ? [{ label: 'Probar en el vestidor', act: 'try', data: [mentioned.id, ...m.map(({ o }) => o.id)] }] : [],
    };
  }

  const occ = occasion || memory.lastOccasion || 'Casual';
  const outfit = ctx.outfit({ occasion: occ, anchorId: mentioned?.id });
  if (!outfit) return { text: 'Necesito al menos una parte de arriba y una de abajo (o un vestido) para proponerte un look.' };
  memory.lastOccasion = occ; memory.lastIds = outfit.pieces.map((p) => p.id);
  const extra = /boda|gala|evento/.test(q) ? '\nPara una boda evita el blanco y apuesta por tejidos con caída.' : /entrevista/.test(q) ? '\nPara una entrevista: colores sobrios y prendas bien planchadas transmiten confianza.' : '';
  return {
    text: `Look para ${occ.toLowerCase()}:\n${explainOutfit(outfit.pieces, season, occ)}${extra}\n¿Quieres otra opción? Escribe «otra».`,
    ids: memory.lastIds,
    actions: [{ label: 'Probar en el vestidor', act: 'try', data: memory.lastIds }],
  };
}
