// Servidor de Vestia (Cloudflare Workers, gratis). Un solo archivo que:
//  · guarda y sincroniza tu armario entre tus móviles (prendas, looks, diario y perfil);
//  · deja consultarlo todo con una API (prendas con filtros, looks, estadísticas…);
//  · publica tu «mini Vestia»: una página con tu perfil y tu armario que se abre con un QR;
//  · hace de lector web para Vistelo (?url=…), como el antiguo worker.js;
//  · y, si le añades un disparador programado (cron), vigila los precios de tu lista de deseos.
//
// Necesita un espacio KV enlazado con el nombre VESTIA. Instrucciones en el README («Tu servidor Vestia»).
// Seguridad: cada armario tiene una clave secreta que solo conocen tus móviles (se guarda cifrada con SHA-256).
// La mini Vestia y la API pública solo funcionan si activas «Mini Vestia pública» en la app, y nunca muestran
// precios, notas ni tu diario.

const APP = 'https://izaanvp.github.io/Vestia/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rid = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Almacén ----------
const K = {
  meta: (u) => `u:${u}:meta`,
  item: (u, i) => `u:${u}:item:${i}`,
  looks: (u) => `u:${u}:looks`,
  diary: (u) => `u:${u}:diary`,
  prices: (u) => `u:${u}:prices`,
};
const getJ = (env, key) => env.VESTIA.get(key, { type: 'json' });
const putJ = (env, key, val) => env.VESTIA.put(key, JSON.stringify(val));

async function auth(request, env, meta) {
  const h = request.headers.get('Authorization') || '';
  const secret = h.startsWith('Bearer ') ? h.slice(7) : new URL(request.url).searchParams.get('k');
  return !!secret && !!meta && (await sha(secret)) === meta.secretHash;
}

// Lo que se puede ver de una prenda en público (sin precio, notas ni etiqueta)
const PUBLIC_ITEM = ['id', 'name', 'type', 'subtype', 'color', 'hex', 'colors', 'brand', 'season', 'pattern', 'style', 'material', 'fit', 'rise', 'wears', 'updatedAt'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const PUBLIC_PROFILE = ['name', 'bio', 'styles', 'season', 'accent', 'brands', 'avatar'];

async function allItems(env, u, meta) {
  const ids = Object.keys(meta.index?.items || {});
  const items = await Promise.all(ids.map((i) => getJ(env, K.item(u, i))));
  return items.filter(Boolean);
}
const SLOT = { Camiseta: 'Arriba', Camisa: 'Arriba', Top: 'Arriba', Jersey: 'Arriba', Sudadera: 'Arriba', Pantalón: 'Abajo', Vaqueros: 'Abajo', Falda: 'Abajo', Shorts: 'Abajo', Vestido: 'Vestidos', Mono: 'Vestidos', Chaqueta: 'Abrigos', Abrigo: 'Abrigos', Americana: 'Abrigos', Zapatos: 'Calzado', Zapatillas: 'Calzado', Botas: 'Calzado', Sandalias: 'Calzado', Bolso: 'Bolsos', Accesorio: 'Accesorios' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function filterItems(items, q) {
  const f = (key) => norm(q.get(key));
  return items.filter((it) =>
    (!q.get('tipo') || norm(it.type) === f('tipo'))
    && (!q.get('zona') || norm(SLOT[it.type]) === f('zona'))
    && (!q.get('color') || norm(it.color) === f('color'))
    && (!q.get('marca') || norm(it.brand) === f('marca'))
    && (!q.get('temporada') || norm(it.season) === f('temporada'))
    && (!q.get('estilo') || norm(it.style) === f('estilo'))
    && (!q.get('caida') || norm(it.fit) === f('caida'))
    && (!q.get('q') || norm([it.name, it.subtype, it.type, it.color, it.brand, it.material, it.pattern].join(' ')).includes(f('q'))));
}
function stats(items, looks) {
  const count = (key) => Object.entries(items.reduce((a, it) => { const v = it[key] || '—'; a[v] = (a[v] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const price = (it) => parseFloat(String(it.price || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  return {
    prendas: items.length,
    looks: looks.length,
    vecesPuestas: items.reduce((a, it) => a + (it.wears || 0), 0),
    valor: Math.round(items.reduce((a, it) => a + price(it), 0) * 100) / 100,
    porTipo: count('type'), porColor: count('color'), porMarca: count('brand'), porTemporada: count('season'),
    masUsadas: items.filter((it) => it.wears).sort((a, b) => b.wears - a.wears).slice(0, 5).map((it) => ({ id: it.id, nombre: it.name, veces: it.wears })),
  };
}

// ---------- Mini Vestia (página pública) ----------
function miniPage(origin, u, meta, items, looks) {
  const p = meta.profile || {};
  const A = /^#[0-9a-f]{6}$/i.test(p.accent || '') ? p.accent : '#19b5ad';
  const img = (it) => `${origin}/api/u/${u}/img/${it.id}?v=${it.updatedAt || 0}`;
  const groups = {};
  items.forEach((it) => (groups[SLOT[it.type] || 'Otros'] ||= []).push(it));
  const order = ['Arriba', 'Abajo', 'Vestidos', 'Abrigos', 'Calzado', 'Bolsos', 'Accesorios', 'Otros'];
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const colors = [...new Map(items.map((it) => [it.color, it.hex])).entries()].slice(0, 12);
  const st = stats(items, looks);
  const hanger = '<svg viewBox="0 0 80 34" class="h"><path class="k" d="M40 15v-4.5a4.6 4.6 0 1 0-4.6-4.6"/><path class="b" d="M40 15 7 29.5c-2.6 1.2-1.8 3.5 1 3.5h64c2.8 0 3.6-2.3 1-3.5L40 15z"/></svg>';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(p.name || 'Mi armario')} · Mini Vestia</title>
<meta name="description" content="El armario de ${esc(p.name || 'alguien')} en Vestia">
<meta property="og:title" content="${esc(p.name || 'Mi armario')} · Mini Vestia"><meta property="og:description" content="${st.prendas} prendas · ${st.looks} looks">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--a:${A};--navy:#0a1833;--ink:#101521;--muted:#6b7380;--card:#f4f7f8;--line:#e7ebef}
*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,sans-serif;color:var(--ink);background:repeating-linear-gradient(0deg,rgba(10,24,51,.016) 0 1px,transparent 1px 3px),#fbfcfc}
.wrap{max-width:720px;margin:0 auto;padding:0 16px 40px}
.top{position:relative;margin:0 -16px;padding:46px 20px 22px;color:#fff;background:radial-gradient(120% 120% at 100% 0%,color-mix(in srgb,var(--a) 45%,transparent),transparent 50%),linear-gradient(155deg,#0a1833,#13284f 75%);border-radius:0 0 28px 28px;overflow:hidden}
.top:before{content:"";position:absolute;left:0;right:0;top:0;height:24px;background:repeating-linear-gradient(90deg,var(--a) 0 24px,#f7fbfb 24px 48px);-webkit-mask:radial-gradient(12px 9px at 12px 100%,transparent 97%,#000) 0 0/24px 100% repeat-x;mask:radial-gradient(12px 9px at 12px 100%,transparent 97%,#000) 0 0/24px 100% repeat-x}
.me{display:flex;gap:14px;align-items:center}.av{width:72px;height:72px;border-radius:50%;background:color-mix(in srgb,var(--a) 30%,#fff) center/cover;box-shadow:0 0 0 3px #fff,0 0 0 5px var(--a);display:grid;place-items:center;font-size:28px;font-weight:700;color:var(--navy);flex:none}
h1{font-family:"Cormorant Garamond",Georgia,serif;font-size:38px;margin:0;line-height:1}.tag{display:inline-block;margin-top:4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:color-mix(in srgb,var(--a) 70%,#fff);font-weight:700}
.bio{margin:12px 0 0;opacity:.85;line-height:1.5;font-size:14px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.chip{padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;font-weight:600}
.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:16px}.stats b{display:block;font-family:"Cormorant Garamond",serif;font-size:30px;line-height:1}.stats span{font-size:11px;opacity:.7}
.pal{display:flex;gap:6px;margin-top:14px}.pal i{width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}
h2{font-family:"Cormorant Garamond",serif;font-size:28px;margin:28px 0 6px}
.label{display:inline-block;position:relative;padding:6px 12px 6px 22px;border-radius:4px 8px 8px 4px;background:#fff;color:var(--navy);font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;box-shadow:0 1px 2px rgba(10,24,51,.12),0 4px 10px -6px rgba(10,24,51,.3);transform:rotate(-1.2deg);margin:18px 0 4px}
.label:before{content:"";position:absolute;inset:3px;border:1px dashed color-mix(in srgb,var(--a) 60%,transparent);border-radius:3px 6px 6px 3px}.label:after{content:"";position:absolute;left:8px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:#eef2f4}
.rail{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:34px 12px;padding-top:24px}
.it{position:relative;background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 12px 28px -16px rgba(10,24,51,.28);transform-origin:50% -18px;animation:hang .8s cubic-bezier(.2,.8,.2,1) both}
.it:before{content:"";position:absolute;left:-8px;right:-8px;top:-21px;height:5px;border-radius:3px;background:linear-gradient(180deg,#f4f7f9,#b9c4cc 45%,#8b98a3 55%,#dfe6ea)}
.h{position:absolute;left:50%;top:-27px;width:64%;transform:translateX(-50%);overflow:visible}.k{fill:none;stroke:#9aa7b1;stroke-width:2.6;stroke-linecap:round}.b{fill:#c89a6b;stroke:#9b6f45;stroke-width:1.2}
.ph{aspect-ratio:4/5;margin:6px 6px 0;border-radius:15px;background:radial-gradient(circle at 50% 36%,#fff,#f1f5f6 65%,#e6edef);display:grid;place-items:center;overflow:hidden}.ph img{width:86%;height:86%;object-fit:contain;filter:drop-shadow(0 8px 12px rgba(10,24,51,.16))}
.inf{padding:9px 12px 12px}.br{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb,var(--a) 70%,#052a29);font-weight:700}.nm{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb{font-size:11.5px;color:var(--muted);display:flex;gap:6px;align-items:center}.dot{width:9px;height:9px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.looks{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.look{display:flex;gap:4px;padding:10px;border-radius:20px;background:#fff;border:1px solid var(--line)}.look img{flex:1;min-width:0;height:96px;object-fit:contain}
.foot{margin-top:36px;text-align:center;color:var(--muted);font-size:13px}.btn{display:inline-block;margin-top:10px;padding:12px 20px;border-radius:999px;background:var(--navy);color:#fff;text-decoration:none;font-weight:600}
@keyframes hang{0%{opacity:0;transform:translateY(-14px) rotate(-7deg)}45%{opacity:1;transform:rotate(4deg)}72%{transform:rotate(-1.6deg)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){.it{animation:none}}
</style></head><body><div class="wrap">
<header class="top">
  <div class="me"><div class="av" ${p.avatar && /^data:image\//.test(p.avatar) ? `style="background-image:url(${p.avatar})"` : ''}>${p.avatar ? '' : esc((p.name || 'V').charAt(0).toUpperCase())}</div>
    <div><span class="tag">Mini Vestia</span><h1>${esc(p.name || 'Mi armario')}</h1></div></div>
  ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
  ${(p.styles || []).length || p.season ? `<div class="chips">${p.season ? `<span class="chip">Paleta ${esc(p.season)}</span>` : ''}${(p.styles || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
  <div class="stats"><div><b>${st.prendas}</b><span>prendas</span></div><div><b>${st.looks}</b><span>looks</span></div><div><b>${new Set(items.map((i) => i.brand).filter(Boolean)).size}</b><span>marcas</span></div><div><b>${st.vecesPuestas}</b><span>usos</span></div></div>
  ${colors.length ? `<div class="pal">${colors.map(([c, h]) => `<i title="${esc(c)}" style="background:${esc(h)}"></i>`).join('')}</div>` : ''}
</header>
${order.filter((g) => groups[g]).map((g) => `<span class="label">${g} · ${groups[g].length}</span><div class="rail">${groups[g].map((it, n) => `<div class="it" style="animation-delay:${Math.min(n, 12) * 50}ms">${hanger}<div class="ph"><img loading="lazy" src="${img(it)}" alt="${esc(it.name)}"></div><div class="inf"><div class="br">${esc(it.brand || 'Sin marca')}</div><div class="nm">${esc(it.name || it.subtype || it.type)}</div><div class="sb"><i class="dot" style="background:${esc(it.hex)}"></i>${esc(it.color || '')} · ${esc(it.subtype || it.type)}</div></div></div>`).join('')}</div>`).join('') || '<p>Aún no hay prendas.</p>'}
${looks.length ? `<h2>Looks</h2><div class="looks">${looks.slice(0, 12).map((o) => `<div class="look">${(o.ids || []).map((i) => byId[i]).filter(Boolean).slice(0, 4).map((it) => `<img loading="lazy" src="${img(it)}" alt="">`).join('')}</div>`).join('')}</div>` : ''}
<div class="foot">Armario creado con Vestia · Vistelo AI<br><a class="btn" href="${APP}">Crea el tuyo en Vestia</a></div>
</div></body></html>`;
}

function landing(origin) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Servidor Vestia</title>
<style>body{font-family:-apple-system,Inter,sans-serif;max-width:680px;margin:40px auto;padding:0 18px;color:#101521;line-height:1.55}code{background:#eef6f6;padding:2px 6px;border-radius:6px}h1{font-family:Georgia,serif}</style></head>
<body><h1>✦ Servidor Vestia funcionando</h1><p>Pega esta dirección en Vestia → Perfil → <b>Tu servidor</b>:</p><p><code>${esc(origin)}</code></p>
<h3>Consultas (API)</h3><ul>
<li><code>GET /api/u/ID</code> resumen del armario</li>
<li><code>GET /api/u/ID/prendas?tipo=&amp;zona=&amp;color=&amp;marca=&amp;temporada=&amp;estilo=&amp;caida=&amp;q=</code> prendas con filtros</li>
<li><code>GET /api/u/ID/prendas/PRENDA</code> una prenda · <code>GET /api/u/ID/img/PRENDA</code> su foto</li>
<li><code>GET /api/u/ID/looks</code> · <code>GET /api/u/ID/estadisticas</code> · <code>GET /api/u/ID/diario</code> (privado) · <code>GET /api/u/ID/precios</code> (privado)</li>
<li><code>GET /u/ID</code> la mini Vestia (página pública)</li></ul>
<p>Lo privado necesita la cabecera <code>Authorization: Bearer CLAVE</code> (la clave está en tu app). Lo público solo funciona si activas «Mini Vestia pública».</p></body></html>`;
}

// ---------- Lector web (para Vistelo) ----------
async function reader(target) {
  const res = await fetch(`https://r.jina.ai/${target}`, { headers: { 'X-No-Cache': 'true' } });
  return new Response(await res.text(), { status: res.status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=1800' } });
}
// Precio actual de una página leída (el primero que no esté tachado)
function priceOf(md) {
  const re = /(~~)?\s*(?:(\d{1,4}(?:[.,]\d{2})?)\s?(?:€|EUR)|€\s?(\d{1,4}(?:[.,]\d{2})?))\s*(~~)?/g;
  const found = [...md.slice(0, 4000).matchAll(re)].map((x) => ({ v: x[2] || x[3], struck: !!(x[1] || x[4]) }));
  const p = found.find((x) => !x.struck) || found[0];
  return p ? parseFloat(p.v.replace(/\./g, '').replace(',', '.')) : null;
}

// ---------- Rutas ----------
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;
  if (m === 'OPTIONS') return new Response(null, { headers: CORS });
  if (path === '/' && url.searchParams.get('url')) {
    const t = url.searchParams.get('url');
    if (!/^https?:\/\//.test(t)) return fail('Falta ?url=');
    return reader(t);
  }
  if (path === '/') return new Response(landing(url.origin), { headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });
  if (!env.VESTIA) return fail('Falta enlazar el espacio KV con el nombre VESTIA (ver README)', 500);

  // Crear un armario nuevo: devuelve su identificador y su clave secreta (solo esta vez)
  if (path === '/api/cuenta' && m === 'POST') {
    const id = rid(10), secret = rid(28);
    await putJ(env, K.meta(id), { id, secretHash: await sha(secret), created: Date.now(), updated: Date.now(), public: false, profile: {}, index: { items: {} }, deleted: {} });
    return json({ id, secret }, 201);
  }

  const mini = path.match(/^\/u\/([a-z0-9]{6,20})$/);
  if (mini) {
    const meta = await getJ(env, K.meta(mini[1]));
    if (!meta || !meta.public) return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px"><h1>🔒 Armario privado</h1><p>Su dueño no ha activado la mini Vestia pública.</p></body>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const items = await allItems(env, mini[1], meta);
    const looks = (await getJ(env, K.looks(mini[1]))) || [];
    return new Response(miniPage(url.origin, mini[1], meta, items, looks), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'max-age=60' } });
  }

  const r = path.match(/^\/api\/u\/([a-z0-9]{6,20})(?:\/(indice|perfil|prendas|img|looks|diario|estadisticas|precios))?(?:\/([\w-]{1,40}))?$/);
  if (!r) return fail('Ruta desconocida', 404);
  const [, u, what = '', sub] = r;
  const meta = await getJ(env, K.meta(u));
  if (!meta) return fail('Ese armario no existe', 404);
  const owner = await auth(request, env, meta);
  const canRead = owner || meta.public;
  const save = (patch = {}) => putJ(env, K.meta(u), { ...meta, ...patch, updated: Date.now() });

  // Resumen
  if (!what && m === 'GET') {
    if (!canRead) return fail('Armario privado', 403);
    return json({ id: u, perfil: pick(meta.profile || {}, PUBLIC_PROFILE), publico: !!meta.public, prendas: Object.keys(meta.index?.items || {}).length, actualizado: meta.updated, miniVestia: `${url.origin}/u/${u}` });
  }
  // Índice para sincronizar (qué hay y cuándo cambió)
  if (what === 'indice' && m === 'GET') {
    if (!owner) return fail('Clave incorrecta', 401);
    return json({ items: meta.index?.items || {}, deleted: meta.deleted || {}, looksAt: meta.looksAt || 0, diaryAt: meta.diaryAt || 0, profileAt: meta.profileAt || 0, profile: meta.profile || {}, public: !!meta.public });
  }
  if (what === 'perfil' && m === 'PUT') {
    if (!owner) return fail('Clave incorrecta', 401);
    const body = await request.json();
    await save({ profile: body.profile || {}, public: !!body.public, profileAt: Date.now() });
    return json({ ok: true });
  }
  if (what === 'prendas' && sub) {
    if (m === 'PUT') {
      if (!owner) return fail('Clave incorrecta', 401);
      const it = await request.json();
      if (!it || it.id !== sub) return fail('Prenda no válida');
      const text = JSON.stringify(it);
      if (text.length > 20e6) return fail('Prenda demasiado grande', 413);
      await env.VESTIA.put(K.item(u, sub), text);
      const index = { ...(meta.index || {}), items: { ...(meta.index?.items || {}), [sub]: it.updatedAt || Date.now() } };
      const deleted = { ...(meta.deleted || {}) }; delete deleted[sub];
      await save({ index, deleted });
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      if (!owner) return fail('Clave incorrecta', 401);
      await env.VESTIA.delete(K.item(u, sub));
      const items = { ...(meta.index?.items || {}) }; delete items[sub];
      await save({ index: { ...meta.index, items }, deleted: { ...(meta.deleted || {}), [sub]: Date.now() } });
      return json({ ok: true });
    }
    if (m === 'GET') {
      if (!canRead) return fail('Armario privado', 403);
      const it = await getJ(env, K.item(u, sub));
      if (!it) return fail('No existe esa prenda', 404);
      return json(owner ? it : { ...pick(it, PUBLIC_ITEM), imagen: `${url.origin}/api/u/${u}/img/${it.id}` });
    }
  }
  if (what === 'prendas' && m === 'GET') {
    if (!canRead) return fail('Armario privado', 403);
    const items = filterItems(await allItems(env, u, meta), url.searchParams);
    return json(items.map((it) => ({ ...pick(it, owner ? [...PUBLIC_ITEM, 'price', 'notes', 'size', 'createdAt', 'lastWorn'] : PUBLIC_ITEM), imagen: `${url.origin}/api/u/${u}/img/${it.id}` })));
  }
  if (what === 'img' && sub && m === 'GET') {
    if (!canRead) return fail('Armario privado', 403);
    const it = await getJ(env, K.item(u, sub));
    const mm = it?.img?.match(/^data:(image\/[\w+.-]+);base64,(.*)$/);
    if (!mm) return fail('Sin foto', 404);
    const bin = Uint8Array.from(atob(mm[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { ...CORS, 'Content-Type': mm[1], 'Cache-Control': 'public, max-age=604800' } });
  }
  if (what === 'looks') {
    if (m === 'PUT') { if (!owner) return fail('Clave incorrecta', 401); await putJ(env, K.looks(u), await request.json()); await save({ looksAt: Date.now() }); return json({ ok: true }); }
    if (m === 'GET') { if (!canRead) return fail('Armario privado', 403); return json((await getJ(env, K.looks(u))) || []); }
  }
  if (what === 'diario') {
    if (!owner) return fail('El diario es privado', 401);
    if (m === 'PUT') { await putJ(env, K.diary(u), await request.json()); await save({ diaryAt: Date.now() }); return json({ ok: true }); }
    if (m === 'GET') return json((await getJ(env, K.diary(u))) || []);
  }
  if (what === 'precios' && m === 'GET') {
    if (!owner) return fail('Clave incorrecta', 401);
    return json((await getJ(env, K.prices(u))) || {});
  }
  if (what === 'estadisticas' && m === 'GET') {
    if (!canRead) return fail('Armario privado', 403);
    return json(stats(await allItems(env, u, meta), (await getJ(env, K.looks(u))) || []));
  }
  return fail('Ruta desconocida', 404);
}

// Vigilancia de precios (si añades un disparador «Cron» en Cloudflare, p. ej. cada 6 horas)
async function watchPrices(env) {
  let cursor;
  do {
    const page = await env.VESTIA.list({ prefix: 'u:', cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const key of page.keys.filter((k) => k.name.endsWith(':meta'))) {
      const meta = await getJ(env, key.name);
      const wish = meta?.profile?.wishlist || [];
      if (!wish.length) continue;
      const prices = (await getJ(env, K.prices(meta.id))) || {};
      for (const w of wish.slice(0, 25)) {
        try {
          const res = await fetch(`https://r.jina.ai/${w.url}`, { headers: { 'X-No-Cache': 'true' } });
          const now = priceOf(await res.text());
          if (!now) continue;
          const p = (prices[w.url] ||= { history: [] });
          if (p.history.at(-1)?.price !== now) p.history.push({ at: Date.now(), price: now });
          p.history = p.history.slice(-20);
          p.lastPrice = now; p.checkedAt = Date.now();
        } catch { /* esa tienda no se pudo leer */ }
      }
      await putJ(env, K.prices(meta.id), prices);
    }
  } while (cursor);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); } catch (e) { return fail(`Error del servidor: ${e.message}`, 500); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(watchPrices(env)); },
};
