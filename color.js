// Utilidades de color: detección del color dominante, nombres, armonías y estaciones.

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
export const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function rgbToLab(r, g, b) {
  const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export const deltaE = (hexA, hexB) => {
  const a = rgbToLab(...hexToRgb(hexA)), b = rgbToLab(...hexToRgb(hexB));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

export const NAMED_COLORS = [
  { name: 'Negro', hex: '#151515', neutral: true },
  { name: 'Blanco', hex: '#f6f6f3', neutral: true },
  { name: 'Crema', hex: '#efe5d2', neutral: true },
  { name: 'Gris', hex: '#8d9096', neutral: true },
  { name: 'Gris oscuro', hex: '#4a4d52', neutral: true },
  { name: 'Beige', hex: '#d6c2a3', neutral: true },
  { name: 'Camel', hex: '#b98a55', neutral: true },
  { name: 'Marrón', hex: '#6a4429', neutral: true },
  { name: 'Azul marino', hex: '#1e2a47', neutral: true },
  { name: 'Denim', hex: '#4c6e93', neutral: true },
  { name: 'Azul', hex: '#2e64d0' },
  { name: 'Celeste', hex: '#9fc8ec' },
  { name: 'Turquesa', hex: '#26bdb5' },
  { name: 'Verde', hex: '#2f8a52' },
  { name: 'Verde oliva', hex: '#6b7438' },
  { name: 'Verde menta', hex: '#aee3c9' },
  { name: 'Amarillo', hex: '#f1cb45' },
  { name: 'Mostaza', hex: '#c69b24' },
  { name: 'Naranja', hex: '#e9762e' },
  { name: 'Coral', hex: '#f08672' },
  { name: 'Rojo', hex: '#c62a30' },
  { name: 'Burdeos', hex: '#6b1c2b' },
  { name: 'Rosa', hex: '#f1aac4' },
  { name: 'Fucsia', hex: '#d2347f' },
  { name: 'Lila', hex: '#b7a2d8' },
  { name: 'Morado', hex: '#653a92' },
];

export function nearestNamed(hex) {
  let best = NAMED_COLORS[0], bd = Infinity;
  for (const c of NAMED_COLORS) {
    const d = deltaE(hex, c.hex);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
export const isNeutral = (name) => !!NAMED_COLORS.find((c) => c.name === name)?.neutral;

// Color dominante de una imagen ignorando la transparencia y el fondo.
export function dominantColor(img) {
  const S = 72;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);

  // Estimar el fondo con los píxeles del borde (para fotos sin transparencia).
  const border = [];
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) {
    const k = (y * S + x) * 4;
    if (data[k + 3] > 200) border.push([data[k], data[k + 1], data[k + 2]]);
  }
  const bg = border.length > S * 2
    ? border.reduce((a, p) => a.map((v, i) => v + p[i] / border.length), [0, 0, 0])
    : null;

  const buckets = new Map();
  for (let k = 0; k < data.length; k += 4) {
    if (data[k + 3] < 140) continue;
    const r = data[k], g = data[k + 1], b = data[k + 2];
    if (bg && Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 38) continue;
    const key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  let top = null;
  for (const e of buckets.values()) if (!top || e.n > top.n) top = e;
  if (!top) return '#8d9096';
  return rgbToHex(top.r / top.n, top.g / top.n, top.b / top.n);
}

// Armonía entre dos colores (0..1).
export function harmony(hexA, nameA, hexB, nameB) {
  if (isNeutral(nameA) || isNeutral(nameB)) {
    return isNeutral(nameA) && isNeutral(nameB) ? 0.82 : 0.9;
  }
  const [h1, s1, l1] = rgbToHsl(...hexToRgb(hexA));
  const [h2, s2, l2] = rgbToHsl(...hexToRgb(hexB));
  let d = Math.abs(h1 - h2); if (d > 180) d = 360 - d;
  let score;
  if (d < 12) score = Math.abs(l1 - l2) > 0.18 ? 0.85 : 0.62; // tono sobre tono
  else if (d < 45) score = 0.8;   // análogos
  else if (d > 150) score = 0.74; // complementarios
  else if (d > 105) score = 0.6;  // triada
  else score = 0.42;
  if (s1 > 0.6 && s2 > 0.6 && d > 45) score -= 0.12; // dos colores muy saturados compiten
  return Math.max(0, Math.min(1, score));
}

// ---------------- Estaciones (análisis de color de 12 tipos) ----------------
export const SEASONS = {
  'Primavera Clara': {
    desc: 'Rasgos luminosos y cálidos con poco contraste. Te favorecen colores ligeros, frescos y con un punto dorado.',
    palette: ['#f7e7a1', '#ffd3a8', '#f9a98b', '#f7b6c2', '#a9e4d7', '#7fd6c9', '#9cc9ef', '#c6b6e6', '#f2ecd8', '#d9bf8f', '#8ecae6', '#b6d98d'],
    avoid: ['#151515', '#6b1c2b', '#3d2a4f', '#4a4d52'],
    metals: 'Oro claro y oro rosa', neutrals: 'Marfil, camel claro, gris piedra cálido',
  },
  'Primavera Cálida': {
    desc: 'Subtono claramente dorado. Brillas con colores cálidos, soleados y alegres.',
    palette: ['#ffcf3f', '#ff9f43', '#ff7f50', '#f26b5b', '#2ec4b6', '#6cc070', '#a3c45a', '#40b7c9', '#f5deb3', '#c68e4f', '#e85d75', '#f4a259'],
    avoid: ['#151515', '#7a8ca8', '#b9a7c9', '#ff3fa4'],
    metals: 'Oro amarillo, bronce', neutrals: 'Camel, crema, marrón dorado',
  },
  'Primavera Brillante': {
    desc: 'Alto contraste con calidez. Te sientan los colores vivos, limpios y luminosos.',
    palette: ['#ff4b4b', '#ff7a00', '#ffd400', '#00b894', '#00a6c8', '#2f6bff', '#ff4f9a', '#8c52ff', '#14c4b8', '#ffffff', '#1e2a47', '#f7d6b5'],
    avoid: ['#b8a99a', '#9a8f7b', '#a2928a', '#c9b8a6'],
    metals: 'Oro brillante', neutrals: 'Blanco puro, azul marino, camel claro',
  },
  'Verano Claro': {
    desc: 'Rasgos suaves, claros y fríos. Te favorecen los pasteles empolvados y los tonos aireados.',
    palette: ['#cfe3f3', '#a7c7e7', '#b8e0d2', '#f4c2d7', '#e3b5c9', '#cdb4db', '#a3b8d9', '#9fd3c7', '#f2eef0', '#c7ced8', '#86a8cf', '#e8a0b4'],
    avoid: ['#ff7a00', '#151515', '#6a4429', '#c69b24'],
    metals: 'Plata, oro blanco', neutrals: 'Gris perla, azul grisáceo, rosa empolvado',
  },
  'Verano Frío': {
    desc: 'Subtono rosado/azulado y contraste medio. Te favorecen tonos fríos de intensidad media.',
    palette: ['#4f6d9a', '#6f8fbf', '#8e7cc3', '#c06c9b', '#d48aa8', '#3f8f8f', '#5fb3b3', '#a3b8d9', '#2c3e66', '#9aa5b1', '#b04a6d', '#7aa6c2'],
    avoid: ['#ff7a00', '#ffcf3f', '#b98a55', '#6b7438'],
    metals: 'Plata, platino', neutrals: 'Gris azulado, marino suave, blanco roto',
  },
  'Verano Suave': {
    desc: 'Rasgos apagados y frescos. Te sientan los colores grisáceos, suaves y elegantes.',
    palette: ['#8a9fb0', '#9fb5a7', '#b6a1b4', '#c7a2a5', '#7d8fa3', '#a7a2c3', '#6f8f8a', '#d5c6c0', '#b0b7bf', '#8b7f99', '#c2b6a8', '#5b6f82'],
    avoid: ['#ff4b4b', '#ffd400', '#151515', '#ff7a00'],
    metals: 'Plata mate, oro rosa', neutrals: 'Topo, gris piedra, azul niebla',
  },
  'Otoño Suave': {
    desc: 'Calidez suave y poco contraste. Te sientan los tonos tierra apagados y naturales.',
    palette: ['#b9a284', '#a68a64', '#8f9779', '#7c8b6f', '#c49a7a', '#b5838d', '#6e8b8b', '#d1bfa7', '#9c7a5b', '#a3a380', '#7a6c5d', '#c8a27c'],
    avoid: ['#151515', '#ff3fa4', '#2f6bff', '#ffffff'],
    metals: 'Oro mate, bronce envejecido', neutrals: 'Topo cálido, avena, caqui',
  },
  'Otoño Cálido': {
    desc: 'Subtono dorado intenso. Brillas con tonos tierra ricos, especiados y profundos.',
    palette: ['#c46a2b', '#d4a017', '#8b5a2b', '#a0522d', '#6b7438', '#556b2f', '#0f7c7c', '#b5651d', '#e0b354', '#7c3a2d', '#d9a066', '#3f6e5b'],
    avoid: ['#ff3fa4', '#cfe3f3', '#b7a2d8', '#c0c0c0'],
    metals: 'Oro amarillo, cobre', neutrals: 'Camel, chocolate, oliva',
  },
  'Otoño Profundo': {
    desc: 'Rasgos oscuros con calidez. Te favorecen colores profundos, intensos y ricos.',
    palette: ['#5a1e1e', '#7b2d26', '#8b4513', '#3e5641', '#1f4e4a', '#b7410e', '#c8932f', '#4b3621', '#6b4423', '#2f3e46', '#8a3324', '#0b6e6e'],
    avoid: ['#f4c2d7', '#cfe3f3', '#a7c7e7', '#e3b5c9'],
    metals: 'Oro viejo, cobre', neutrals: 'Chocolate, marino profundo, oliva oscuro',
  },
  'Invierno Profundo': {
    desc: 'Rasgos oscuros con frialdad y contraste. Te favorecen colores intensos y oscuros.',
    palette: ['#151515', '#ffffff', '#5b0f2b', '#1d2b64', '#0b5d4f', '#3c1361', '#c21e56', '#00627a', '#2b2d42', '#8b0000', '#14746f', '#4b0082'],
    avoid: ['#f5deb3', '#d6c2a3', '#ffcf3f', '#c49a7a'],
    metals: 'Plata, platino', neutrals: 'Negro, carbón, blanco puro',
  },
  'Invierno Frío': {
    desc: 'Subtono frío y alto contraste. Te favorecen los colores puros, helados y nítidos.',
    palette: ['#ffffff', '#151515', '#0047ab', '#d0006f', '#00a693', '#5a2a82', '#e60026', '#9ad9ea', '#e8c8f0', '#1e2a47', '#c0c0c0', '#008b8b'],
    avoid: ['#ff7a00', '#c69b24', '#b98a55', '#6b7438'],
    metals: 'Plata brillante', neutrals: 'Negro, blanco óptico, gris marengo',
  },
  'Invierno Brillante': {
    desc: 'Contraste máximo y colores nítidos. Te sientan los tonos joya y los contrastes fuertes.',
    palette: ['#ff0054', '#00b4d8', '#7209b7', '#00c49a', '#f72585', '#3a0ca3', '#ffffff', '#151515', '#ffd60a', '#0077b6', '#e63946', '#14c4b8'],
    avoid: ['#b9a284', '#a68a64', '#c2b6a8', '#8f9779'],
    metals: 'Plata, oro blanco', neutrals: 'Negro, blanco puro, marino',
  },
};

// Decide la estación según las puntuaciones del test.
// scores: { temp: -1 frío … +1 cálido, value: -1 profundo … +1 claro, chroma: -1 suave … +1 brillante }
export function decideSeason({ temp, value, chroma }) {
  const dims = [['temp', Math.abs(temp)], ['value', Math.abs(value)], ['chroma', Math.abs(chroma)]];
  dims.sort((a, b) => b[1] - a[1]);
  const dom = dims[0][0];
  const warm = temp >= 0;
  if (dom === 'value') {
    if (value > 0) return warm ? 'Primavera Clara' : 'Verano Claro';
    return warm ? 'Otoño Profundo' : 'Invierno Profundo';
  }
  if (dom === 'temp') {
    if (warm) return chroma >= 0 ? 'Primavera Cálida' : 'Otoño Cálido';
    return chroma >= 0 ? 'Invierno Frío' : 'Verano Frío';
  }
  if (chroma > 0) return warm ? 'Primavera Brillante' : 'Invierno Brillante';
  return warm ? 'Otoño Suave' : 'Verano Suave';
}

// Subtono de piel a partir de un color muestreado.
export function skinUndertone(hex) {
  const [L, a, b] = rgbToLab(...hexToRgb(hex));
  const hue = Math.atan2(b, a) * 180 / Math.PI; // ~ 40–70 en piel
  // Más amarillo (ángulo alto) = cálido; más rosado (ángulo bajo) = frío.
  const temp = Math.max(-1, Math.min(1, (hue - 52) / 12));
  const value = Math.max(-1, Math.min(1, (L - 58) / 18));
  return { temp, value, L, hue };
}

// ¿Cuánto encaja una prenda con la paleta personal? 0..1
export function paletteFit(hex, season) {
  const s = SEASONS[season];
  if (!s) return 0;
  const near = Math.min(...s.palette.map((p) => deltaE(hex, p)));
  const bad = Math.min(...s.avoid.map((p) => deltaE(hex, p)));
  let fit = Math.max(0, 1 - near / 45);
  if (bad < 14) fit *= 0.4;
  return fit;
}
