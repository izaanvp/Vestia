// Modo demo: armario de ejemplo con prendas ilustradas y un perfil ficticio para probar la app.
import * as db from './db.js';
import { state, saveProfile, toast, go } from './core.js';

const PROFILE_BACKUP = 'vestia.profile.backup';

// Oscurece o aclara un color hex.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Cada prenda: silueta principal + detalles (costuras, botones, pliegues…).
const SHAPES = {
  tshirt: (c, d) => ({
    body: 'M100 30 Q150 52 200 30 L282 72 L252 132 L222 114 L222 340 L78 340 L78 114 L48 132 L18 72 Z',
    details: `<path d="M116 33 Q150 66 184 33" fill="none" stroke="${d}" stroke-width="4"/>
      <path d="M52 124 L80 110 M248 124 L220 110" stroke="${d}" stroke-width="2" opacity=".5"/>
      <path d="M80 330 L220 330" stroke="${d}" stroke-width="2" stroke-dasharray="4 4" opacity=".5"/>`,
  }),
  shirt: (c, d) => ({
    body: 'M104 24 L196 24 L268 62 L292 300 L262 308 L226 122 L226 342 L74 342 L74 122 L38 308 L8 300 L32 62 Z',
    details: `<path d="M124 22 L150 62 L134 76 L108 34 Z M176 22 L150 62 L166 76 L192 34 Z" fill="${shade(c, 0.12)}" stroke="${d}" stroke-width="2"/>
      <path d="M150 62 L150 342" stroke="${d}" stroke-width="2"/>
      ${[100, 150, 200, 250, 300].map((y) => `<circle cx="156" cy="${y}" r="4" fill="#fff" stroke="${d}" stroke-width="1.5"/>`).join('')}
      <path d="M40 286 L64 280 M260 286 L236 280" stroke="${d}" stroke-width="3"/>
      <path d="M92 150 L132 150 L132 186 L92 186 Z" fill="none" stroke="${d}" stroke-width="1.5" opacity=".6"/>`,
  }),
  sweater: (c, d) => ({
    body: 'M104 28 Q150 46 196 28 L262 60 Q282 180 290 300 L258 308 L226 128 L228 342 L72 342 L74 128 L42 308 L10 300 Q18 180 38 60 Z',
    details: `<path d="M112 30 Q150 60 188 30" fill="none" stroke="${d}" stroke-width="7" opacity=".7"/>
      <g stroke="${d}" stroke-width="2" opacity=".45">${Array.from({ length: 19 }, (_, i) => `<path d="M${80 + i * 8} 318 L${80 + i * 8} 342"/>`).join('')}
      ${Array.from({ length: 4 }, (_, i) => `<path d="M${14 + i * 7} 284 L${12 + i * 7} 304"/><path d="M${264 + i * 7} 284 L${266 + i * 7} 304"/>`).join('')}</g>
      <g stroke="${d}" stroke-width="1.2" opacity=".22" fill="none">${Array.from({ length: 7 }, (_, i) => `<path d="M${96 + i * 18} 70 q6 20 0 40 q-6 20 0 40 q6 20 0 40 q-6 20 0 40 q6 20 0 40"/>`).join('')}</g>`,
  }),
  hoodie: (c, d) => ({
    body: 'M96 40 Q100 4 150 2 Q200 4 204 40 L264 66 Q282 180 290 300 L258 308 L226 130 L228 342 L72 342 L74 130 L42 308 L10 300 Q18 180 36 66 Z',
    details: `<path d="M110 42 Q150 82 190 42 Q186 14 150 12 Q114 14 110 42 Z" fill="${shade(c, -0.2)}"/>
      <path d="M140 70 L138 110 M160 70 L162 110" stroke="${shade(c, 0.5)}" stroke-width="3"/>
      <path d="M100 236 L200 236 L216 300 L84 300 Z" fill="none" stroke="${d}" stroke-width="2.5"/>
      <g stroke="${d}" stroke-width="2" opacity=".4">${Array.from({ length: 19 }, (_, i) => `<path d="M${80 + i * 8} 322 L${80 + i * 8} 342"/>`).join('')}</g>`,
  }),
  tank: (c, d) => ({
    body: 'M106 18 L124 18 Q150 78 176 18 L194 18 Q198 84 216 112 L216 340 L84 340 L84 112 Q102 84 106 18 Z',
    details: `<path d="M124 20 Q150 82 176 20" fill="none" stroke="${d}" stroke-width="3"/>
      <path d="M100 160 Q150 176 200 160" fill="none" stroke="${shade(c, 0.35)}" stroke-width="10" opacity=".35"/>`,
  }),
  jeans: (c, d) => ({
    body: 'M78 14 L222 14 L238 350 L166 350 L152 122 L148 122 L134 350 L62 350 Z',
    details: `<path d="M78 38 L222 38" stroke="${d}" stroke-width="3"/>
      <g fill="none" stroke="#d9a441" stroke-width="2" stroke-dasharray="5 4"><path d="M80 34 L220 34"/><path d="M150 40 Q148 96 132 108"/><path d="M90 44 Q100 78 132 80"/><path d="M210 44 Q200 78 168 80"/>
      <path d="M70 344 L132 344"/><path d="M168 344 L234 344"/></g>
      <path d="M150 40 L150 112" stroke="${d}" stroke-width="2"/><circle cx="150" cy="26" r="5" fill="#c9a34a"/>
      <path d="M98 130 L118 340 M202 130 L182 340" stroke="${shade(c, 0.25)}" stroke-width="10" opacity=".25"/>`,
  }),
  trousers: (c, d) => ({
    body: 'M74 14 L226 14 L248 350 L162 350 L150 132 L138 350 L52 350 Z',
    details: `<path d="M74 36 L226 36" stroke="${d}" stroke-width="3"/>
      <path d="M108 38 L106 120 M192 38 L194 120 M124 38 L122 80 M176 38 L178 80" stroke="${d}" stroke-width="2" opacity=".6"/>
      <path d="M104 120 L96 348 M196 120 L204 348" stroke="${shade(c, 0.3)}" stroke-width="2"/>`,
  }),
  skirt: (c, d) => ({
    body: 'M104 20 L196 20 L274 330 L26 330 Z',
    details: `<path d="M104 42 L196 42" stroke="${d}" stroke-width="4"/>
      <g stroke="${d}" stroke-width="2" opacity=".55">${Array.from({ length: 11 }, (_, i) => `<path d="M${110 + i * 8} 44 L${36 + i * 23} 328"/>`).join('')}</g>
      <g stroke="${shade(c, 0.35)}" stroke-width="5" opacity=".35">${Array.from({ length: 5 }, (_, i) => `<path d="M${118 + i * 16} 44 L${60 + i * 46} 328"/>`).join('')}</g>`,
  }),
  dress: (c, d) => ({
    body: 'M118 14 L134 14 Q150 40 166 14 L182 14 Q186 72 198 108 Q184 132 186 152 L264 348 L36 348 L114 152 Q116 132 102 108 Q114 72 118 14 Z',
    details: `<path d="M114 152 Q150 162 186 152" fill="none" stroke="${d}" stroke-width="3"/>
      <g stroke="${d}" stroke-width="2" opacity=".35" fill="none"><path d="M130 160 Q110 260 80 346"/><path d="M150 162 L150 346"/><path d="M170 160 Q190 260 220 346"/></g>
      <path d="M134 16 Q150 44 166 16" fill="none" stroke="${d}" stroke-width="2.5"/>`,
  }),
  trench: (c, d) => ({
    body: 'M100 14 L200 14 L282 70 L294 330 L262 338 L234 142 L240 354 L60 354 L66 142 L38 338 L6 330 L18 70 Z',
    details: `<path d="M118 14 L150 120 L182 14 L168 14 L150 80 L132 14 Z" fill="${shade(c, -0.12)}"/>
      <path d="M150 120 L150 354" stroke="${d}" stroke-width="2.5"/>
      <rect x="62" y="186" width="176" height="18" rx="4" fill="${shade(c, -0.15)}"/><rect x="138" y="182" width="24" height="26" rx="3" fill="none" stroke="#b08a3c" stroke-width="4"/>
      ${[140, 230, 280].map((y) => `<circle cx="126" cy="${y}" r="5" fill="${d}"/><circle cx="174" cy="${y}" r="5" fill="${d}"/>`).join('')}
      <path d="M24 78 L96 52 M276 78 L204 52" stroke="${d}" stroke-width="2" opacity=".5"/>
      <path d="M36 318 L64 312 M264 318 L236 312" stroke="${d}" stroke-width="5" opacity=".6"/>`,
  }),
  denimjacket: (c, d) => ({
    body: 'M100 18 L200 18 L280 64 L292 282 L262 288 L230 122 L232 272 L68 272 L70 122 L38 288 L8 282 L20 64 Z',
    details: `<path d="M114 16 L150 70 L186 16" fill="${shade(c, -0.15)}" stroke="${d}" stroke-width="2"/>
      <path d="M150 70 L150 272" stroke="${d}" stroke-width="2.5"/>
      <g fill="none" stroke="#d9a441" stroke-width="2" stroke-dasharray="5 4"><path d="M88 110 L136 110 L136 150 L112 160 L88 150 Z"/><path d="M164 110 L212 110 L212 150 L188 160 L164 150 Z"/><path d="M70 236 L230 236"/></g>
      ${[100, 150, 200, 250].map((y) => `<circle cx="158" cy="${y}" r="5" fill="#b9b9b9" stroke="${d}"/>`).join('')}`,
  }),
  sneakers: (c, d) => ({
    body: 'M28 236 Q34 178 104 166 L168 152 Q198 118 238 126 Q270 138 272 196 L274 238 Z',
    details: `<rect x="22" y="232" width="258" height="30" rx="14" fill="#f2f2ee" stroke="#c9c9c2" stroke-width="2"/>
      <path d="M26 252 L278 252" stroke="#cfcfc8" stroke-width="2"/>
      <path d="M70 214 Q150 178 236 206" fill="none" stroke="${shade(c, -0.35)}" stroke-width="10" stroke-linecap="round" opacity=".55"/>
      <g stroke="${d}" stroke-width="3"><path d="M170 160 L198 176"/><path d="M182 148 L208 166"/><path d="M194 138 L220 156"/></g>
      <path d="M236 128 Q262 150 264 196" fill="none" stroke="${d}" stroke-width="2" opacity=".5"/>`,
  }),
  boots: (c, d) => ({
    body: 'M108 48 L186 48 L194 196 Q248 210 270 248 L272 300 L60 300 L66 214 Q98 206 104 196 Z',
    details: `<rect x="56" y="296" width="220" height="18" rx="6" fill="${shade(c, -0.45)}"/><rect x="60" y="296" width="50" height="40" rx="5" fill="${shade(c, -0.45)}"/>
      <path d="M186 60 L190 190" stroke="${d}" stroke-width="2.5" stroke-dasharray="6 5"/>
      <path d="M108 48 L186 48" stroke="${d}" stroke-width="5"/>`,
  }),
  bag: (c, d) => ({
    body: 'M60 140 L240 140 L262 316 Q262 330 248 330 L52 330 Q38 330 38 316 Z',
    details: `<path d="M96 142 Q96 60 150 60 Q204 60 204 142" fill="none" stroke="${d}" stroke-width="12" stroke-linecap="round"/>
      <path d="M60 140 L240 140 L232 216 Q150 236 68 216 Z" fill="${shade(c, -0.1)}" stroke="${d}" stroke-width="2"/>
      <rect x="138" y="206" width="24" height="22" rx="4" fill="#c9a34a"/>
      <path d="M46 316 L254 316" stroke="${d}" stroke-width="2" stroke-dasharray="5 4" opacity=".6"/>`,
  }),
  cap: (c, d) => ({
    body: 'M58 206 Q56 92 150 86 Q244 92 242 206 Z',
    details: `<path d="M56 204 Q150 232 290 212 Q266 242 150 246 Q66 244 56 204 Z" fill="${shade(c, -0.18)}" stroke="${d}" stroke-width="2"/>
      <circle cx="150" cy="88" r="8" fill="${shade(c, -0.25)}"/>
      <g stroke="${d}" stroke-width="2" opacity=".5" fill="none"><path d="M150 92 L150 206"/><path d="M150 92 Q100 120 92 206"/><path d="M150 92 Q200 120 208 206"/></g>
      <circle cx="120" cy="140" r="4" fill="${d}" opacity=".5"/><circle cx="180" cy="140" r="4" fill="${d}" opacity=".5"/>`,
  }),
};

function garmentSVG(shape, color) {
  const d = shade(color, -0.35);
  const g = SHAPES[shape](color, d);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" width="600" height="720">
    <defs><linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".45" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <linearGradient id="sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient></defs>
    <path d="${g.body}" fill="${color}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${g.body}" fill="url(#sh)"/><path d="${g.body}" fill="url(#sv)"/>
    ${g.details}
  </svg>`;
}

function svgToPng(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 600; c.height = 720;
      c.getContext('2d').drawImage(img, 0, 0, 600, 720);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// [forma, nombre, tipo, prenda, color, hex, marca, temporada, estampado, estilo, talla, material, precio, usos]
const ITEMS = [
  ['tshirt', 'Camiseta básica', 'Camiseta', 'Camiseta', 'Blanco', '#f4f2ec', 'Uniqlo', 'Todo el año', 'Liso', 'Casual', 'M', 'Algodón', '12,90 €', 14],
  ['shirt', 'Camisa de lino', 'Camisa', 'Camisa', 'Celeste', '#9fc4e6', 'COS', 'Verano', 'Liso', 'Casual', 'M', 'Lino', '59 €', 6],
  ['sweater', 'Jersey de ochos', 'Jersey', 'Jersey de punto', 'Camel', '#b98a55', 'Massimo Dutti', 'Invierno', 'Punto texturizado', 'Casual', 'S', 'Lana merino', '79,95 €', 9],
  ['hoodie', 'Sudadera con capucha', 'Sudadera', 'Sudadera con capucha', 'Verde oliva', '#6b7438', 'Carhartt WIP', 'Entretiempo', 'Liso', 'Streetwear', 'M', 'Algodón', '99 €', 4],
  ['tank', 'Top satinado', 'Top', 'Camiseta de tirantes', 'Coral', '#ee8a72', 'Zara', 'Verano', 'Liso', 'Fiesta', 'S', 'Satén', '19,95 €', 2],
  ['jeans', 'Vaquero recto', 'Vaqueros', 'Vaqueros', 'Denim', '#4c6e93', "Levi's", 'Todo el año', 'Liso', 'Casual', '28', 'Denim', '110 €', 22],
  ['trousers', 'Pantalón de pinzas', 'Pantalón', 'Pantalón de vestir', 'Negro', '#1d1d20', 'Mango', 'Todo el año', 'Liso', 'Formal', '38', 'Lana fría', '49,99 €', 8],
  ['skirt', 'Falda plisada', 'Falda', 'Falda plisada', 'Turquesa', '#23b3ab', 'Zara', 'Entretiempo', 'Liso', 'Casual', 'S', 'Poliéster', '29,95 €', 3],
  ['dress', 'Vestido midi', 'Vestido', 'Vestido largo', 'Burdeos', '#6d1c2c', '& Other Stories', 'Entretiempo', 'Liso', 'Fiesta', '36', 'Viscosa', '89 €', 2],
  ['trench', 'Gabardina clásica', 'Abrigo', 'Gabardina', 'Beige', '#d3bc95', 'Massimo Dutti', 'Entretiempo', 'Liso', 'Formal', 'M', 'Algodón', '149 €', 11],
  ['denimjacket', 'Cazadora vaquera', 'Chaqueta', 'Cazadora vaquera', 'Azul', '#5a82b4', "Levi's", 'Entretiempo', 'Liso', 'Casual', 'M', 'Denim', '100 €', 7],
  ['sneakers', 'Zapatillas blancas', 'Zapatillas', 'Zapatillas', 'Blanco', '#f6f5f0', 'New Balance', 'Todo el año', 'Liso', 'Streetwear', '39', 'Piel', '120 €', 30],
  ['boots', 'Botines de piel', 'Botas', 'Botines', 'Marrón', '#6a4429', 'Mango', 'Invierno', 'Liso', 'Formal', '39', 'Piel', '79,99 €', 10],
  ['bag', 'Bolso mostaza', 'Bolso', 'Bolso', 'Mostaza', '#c69b24', 'Bimba y Lola', 'Todo el año', 'Liso', 'Casual', '', 'Piel', '135 €', 12],
  ['cap', 'Gorra béisbol', 'Accesorio', 'Gorra', 'Azul marino', '#1e2a47', 'New Era', 'Verano', 'Liso', 'Streetwear', '', 'Algodón', '29,95 €', 5],
];

export const isDemo = () => !!state.profile.demo;

export async function loadDemo(onProgress = () => {}) {
  if (!state.profile.demo) {
    try { localStorage.setItem(PROFILE_BACKUP, JSON.stringify(state.profile)); } catch { /* sin espacio */ }
  }
  const now = Date.now();
  const made = [];
  for (let i = 0; i < ITEMS.length; i++) {
    const [shape, name, type, subtype, color, hex, brand, season, pattern, style, size, material, price, wears] = ITEMS[i];
    onProgress(i / ITEMS.length);
    const item = {
      id: `demo-${shape}`, img: await svgToPng(garmentSVG(shape, hex)), hex, color, type, subtype, brand, name, season, pattern, style,
      size, material, price, wears, lastWorn: now - (i % 6) * 86400e3, fav: [5, 9, 11].includes(i), notes: 'Prenda de ejemplo del modo demo.',
      createdAt: now - i * 3600e3, demo: true,
    };
    await db.put('items', item);
    made.push(item);
  }
  const outfits = [
    { id: 'demo-look-1', ids: ['demo-sweater', 'demo-jeans', 'demo-boots', 'demo-bag'], occasion: 'Casual', score: 0.82, createdAt: now - 2 * 86400e3, demo: true },
    { id: 'demo-look-2', ids: ['demo-shirt', 'demo-trousers', 'demo-trench', 'demo-sneakers'], occasion: 'Trabajo', score: 0.78, createdAt: now - 86400e3, demo: true },
    { id: 'demo-look-3', ids: ['demo-dress', 'demo-boots', 'demo-bag'], occasion: 'Noche', score: 0.8, createdAt: now, demo: true },
  ];
  for (const o of outfits) await db.put('outfits', o);

  state.profile = {
    ...state.profile,
    demo: true,
    name: 'Carla',
    bio: 'Perfil de ejemplo · minimalista con toques cálidos.',
    styles: ['Minimalista', 'Clásico', 'Old money'],
    brands: ['Zara', 'COS', 'Massimo Dutti', "Levi's", 'Mango', 'New Balance'],
    sizes: 'S · 36 · 39',
    shopFor: 'Mujer',
    skin: { hex: '#c18e66', source: 'el perfil de ejemplo', date: now },
    body: { figure: 'mujer', build: 'Media', hairStyle: 'Media melena', face: true, beard: false },
    hair: 'Castaño',
    season: 'Otoño Cálido',
    colorTest: { season: 'Otoño Cálido', scores: { temp: 0.7, value: -0.1, chroma: -0.2 }, answers: [], skin: '#c18e66', date: now },
    wishlist: [{ title: 'ABRIGO CRUZADO CINTURÓN', site: 'zara.com', url: 'https://www.zara.com/es/es/abrigo-cruzado-cinturon-p03046323.html', price: '59,95 €', color: 'Negro', hex: '#151515', type: 'Abrigo', savedAt: now }],
  };
  saveProfile();
  state.items = await db.getAll('items');
  state.outfits = await db.getAll('outfits');
  state.worn = { top: 'demo-sweater', bottom: 'demo-jeans', shoes: 'demo-boots', bag: 'demo-bag' };
  state.profile.lastWorn = { ...state.worn }; saveProfile();
  onProgress(1);
  return made.length;
}

export async function exitDemo() {
  for (const it of state.items.filter((i) => i.demo)) await db.remove('items', it.id);
  for (const o of state.outfits.filter((x) => x.demo)) await db.remove('outfits', o.id);
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(PROFILE_BACKUP) || 'null'); } catch { prev = null; }
  localStorage.removeItem(PROFILE_BACKUP);
  state.profile = { ...db.DEFAULT_PROFILE, ...(prev || {}), demo: false };
  saveProfile();
  state.items = await db.getAll('items');
  state.outfits = await db.getAll('outfits');
  state.worn = {};
  state.profile.lastWorn = {}; saveProfile();
  state.chat = [];
}

// Carga el demo desde un botón, con progreso, y abre el vestidor.
export async function runDemo(btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Preparando armario de ejemplo…'; }
  await loadDemo((p) => { if (btn) btn.innerHTML = `<span class="spinner"></span> Dibujando prendas… ${Math.round(p * 100)}%`; });
  toast('Modo demo: armario de ejemplo de Carla cargado');
  state.dressView = 'probador';
  go('dress');
}
export async function leaveDemo() {
  await exitDemo();
  toast('Has salido del modo demo');
  go('closet');
}
