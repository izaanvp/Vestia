// Vistelo AI en la web: lee páginas de marcas, noticias de lanzamientos y el tiempo.
// Los navegadores no dejan leer otras webs directamente (CORS), así que se usa un lector intermedio.
// Solo se envía la dirección pública que se quiere leer; nunca fotos ni datos del armario.

const READERS = [
  (url) => `https://r.jina.ai/${url}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];
const CACHE_KEY = 'vestia.web.cache';
const TTL = 6 * 3600e3;

function cacheGet(key) {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[key]; return c && Date.now() - c.t < TTL ? c.v : null; } catch { return null; }
}
function cacheSet(key, v) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { t: Date.now(), v };
    // Mantener la caché pequeña
    const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    keys.slice(60).forEach((k) => delete all[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* sin espacio */ }
}

// Lector propio opcional (por ejemplo, un Cloudflare Worker gratuito; ver README).
let customReader = '';
export const setCustomReader = (u) => { customReader = (u || '').trim().replace(/\/$/, ''); };

async function fetchText(url, timeout = 20000) {
  const list = customReader ? [(u) => `${customReader}/?url=${encodeURIComponent(u)}`, ...READERS] : READERS;
  let lastErr;
  for (const make of list) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(make(url), { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let text = await res.text();
      if (/Access Denied|Security Checkpoint|AbuseAlleviation/i.test(text.slice(0, 600))) throw new Error('blocked');
      // Copia en caché vacía o sin cargar: se pide de nuevo, esta vez sin caché.
      if (make === READERS[0] && /Markdown Content:\s*$|^Title:\s*(&nbsp;)?\s*$/m.test(text) && text.length < 1500) {
        const again = await fetch(make(url), { headers: { 'X-No-Cache': 'true', 'X-Timeout': '20' } });
        if (again.ok) text = await again.text();
      }
      return text;
    } catch (e) { clearTimeout(timer); lastErr = e; }
  }
  throw new Error(lastErr?.message === 'blocked'
    ? 'Esa web no deja que la lean programas automáticos. Ábrela con el enlace.'
    : 'No he podido leer la web ahora mismo. Inténtalo en un rato.');
}

const decodeBing = (u) => { try { const m = u.match(/[?&]url=([^&]+)/); return m ? decodeURIComponent(m[1]) : u; } catch { return u; } };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Noticias recientes sobre lanzamientos de una marca (Bing News).
export async function brandNews(brand, { force = false } = {}) {
  const key = `news:${brand}`;
  if (!force) { const c = cacheGet(key); if (c) return c; }
  // Dos búsquedas sencillas (Bing no admite bien OR en el RSS) y se combinan.
  const queries = [`${brand} nueva colección`, `${brand} lanzamiento colaboración`];
  const pages = await Promise.allSettled(queries.map((q) => fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=es`)));
  const md = pages.filter((p) => p.status === 'fulfilled').map((p) => p.value).join('\n');
  if (!md) throw new Error('No he podido leer las noticias ahora mismo.');
  const items = [];
  const re = /### \[([^\]]+)\]\(([^)]+)\)\s*\n+([\s\S]*?)(?=\n### |\s*$)/g;
  let m;
  while ((m = re.exec(md))) {
    const body = m[3];
    const date = body.match(/\n\s*([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} [\d:]+ GMT)/)?.[1];
    const desc = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('[') && !/GMT$/.test(l)) || '';
    const url = decodeBing(m[2]);
    items.push({ title: m[1].trim(), url, source: host(url), desc: desc.slice(0, 180), date: date ? Date.parse(date) : null, brand });
  }
  const seen = new Set();
  const recent = items
    .filter((i) => !seen.has(i.title) && seen.add(i.title))
    .filter((i) => i.title.toLowerCase().includes(brand.toLowerCase().split(' ')[0]) || i.desc.toLowerCase().includes(brand.toLowerCase().split(' ')[0]))
    .filter((i) => !i.date || Date.now() - i.date < 75 * 86400e3)
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 6);
  cacheSet(key, recent);
  return recent;
}

// Lee una página de producto o de marca y extrae lo esencial.
export async function readPage(url, { force = false } = {}) {
  const key = `page:${url}`;
  if (!force) { const c = cacheGet(key); if (c) return c; }
  const md = await fetchText(url);
  const title = md.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || host(url);
  const body = md.split(/Markdown Content:/)[1] || md;
  const images = [...body.matchAll(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g)]
    .map((x) => ({ alt: x[1], src: x[2] }))
    .filter((x) => !/logo|icon|sprite|svg|pixel|tracking|1x1/i.test(x.src));
  // Precio actual: el primero que no esté tachado (en rebajas el precio antiguo suele ir ~~tachado~~)
  const PRICE = /(~~)?\s*(?:(\d{1,4}(?:[.,]\d{2})?)\s?(?:€|EUR)|€\s?(\d{1,4}(?:[.,]\d{2})?))\s*(~~)?/g;
  const prices = [...body.slice(0, 4000).matchAll(PRICE)].map((x) => ({ v: x[2] || x[3], struck: !!(x[1] || x[4]) }));
  const priceM = prices.find((x) => !x.struck) || prices[0];
  const wasM = prices.find((x) => x.struck);
  const text = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>|]/g, ' ').replace(/\s+/g, ' ').trim();
  // Enlaces a productos o colecciones dentro de la página (para webs de marca)
  const links = [...body.matchAll(/\[([^\]!]{4,80})\]\((https?:[^)\s]+)\)/g)]
    .map((x) => ({ text: x[1].trim(), url: x[2] }))
    .filter((x) => /nuev|new|colecci|collection|drop|lanzamiento|launch|edici|capsul|novedad/i.test(x.text))
    .slice(0, 8);
  // Pistas de color: línea tipo «Negro 3046/323/800» (tiendas Inditex), «Color: …» o la descripción de la foto principal.
  const colorHint = [
    body.match(/^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,25})\s+\d{4}\/\d{3}/m)?.[1],
    body.match(/colou?r\s*[:|]\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,25})/i)?.[1],
    images[0]?.alt,
  ].filter(Boolean).join(' · ');
  const page = {
    url, title, site: host(url), colorHint,
    image: images[0]?.src || null,
    price: priceM ? `${priceM.v.replace('.', ',')} €` : null,
    wasPrice: wasM && wasM !== priceM ? `${wasM.v.replace('.', ',')} €` : null,
    text: text.slice(0, 1500),
    links,
  };
  cacheSet(key, page);
  return page;
}

// Tiempo actual (Open-Meteo, sin clave). Devuelve { temp, code, rain, label }.
export async function weather() {
  const c = cacheGet('weather'); if (c) return c;
  const pos = await new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Tu navegador no permite la ubicación.'));
    navigator.geolocation.getCurrentPosition(res, () => rej(new Error('Necesito permiso de ubicación para ver el tiempo.')), { timeout: 10000, maximumAge: 3600e3 });
  });
  const { latitude, longitude } = pos.coords;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current=temperature_2m,apparent_temperature,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
  const d = await r.json();
  const code = d.current.weather_code;
  const label = code === 0 ? 'despejado' : code < 4 ? 'nubes y claros' : code < 50 ? 'niebla' : code < 70 ? 'lluvia' : code < 80 ? 'nieve' : code < 90 ? 'chubascos' : 'tormenta';
  const w = {
    temp: Math.round(d.current.apparent_temperature ?? d.current.temperature_2m),
    max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]),
    code, label, rain: (code >= 50 && code < 70) || (code >= 80),
  };
  cacheSet('weather', w);
  return w;
}

export const findUrl = (text) => text.match(/https?:\/\/[^\s]+/)?.[0] || null;
