// Drops: radar de novedades de tus marcas, lector de enlaces, deseos y huecos del armario.
import * as C from './color.js';
import * as A from './advisor.js';
import * as W from './web.js';
import { bestMatches } from './closet.js';
import { state, $, $$, esc, toast, saveProfile, shopLink, label, ICON, STYLE_KEYS, slotOf } from './core.js';

export function wardrobeGaps() {
  const gaps = [];
  const slots = new Set(state.items.map((i) => slotOf(i.type)));
  const labels = { top: 'partes de arriba', bottom: 'partes de abajo', shoes: 'calzado', outer: 'abrigo o chaqueta', bag: 'bolso' };
  for (const k of Object.keys(labels)) if (!slots.has(k) && !(k === 'bottom' && slots.has('one'))) gaps.push({ kind: 'slot', text: `No tienes ${labels[k]}`, q: labels[k] });
  const season = state.profile.season;
  if (season) {
    const missing = C.SEASONS[season].palette.filter((h) => !state.items.some((i) => C.deltaE(i.hex, h) < 22));
    const named = [...new Map(missing.map((h) => [C.nearestNamed(h).name, h])).entries()].slice(0, 4);
    const types = ['Camisa', 'Jersey', 'Falda', 'Pantalón', 'Vestido', 'Top'];
    named.forEach(([name, hex], i) => gaps.push({ kind: 'color', hex, text: `${types[i % types.length]} en ${name.toLowerCase()} (de tu paleta)`, q: `${types[i % types.length]} ${name}` }));
  }
  if (state.items.length >= 6) {
    const neutralShare = state.items.filter((i) => C.isNeutral(i.color)).length / state.items.length;
    if (neutralShare < 0.35) gaps.push({ kind: 'tip', text: 'Básicos neutros para combinar tus prendas de color', q: 'básicos neutros' });
  }
  const have = state.items.map((i) => `${i.name} ${i.subtype || ''} ${i.type}`.toLowerCase()).join(' ');
  state.profile.styles.forEach((s) => (STYLE_KEYS[s] || []).forEach((k) => {
    if (!have.includes(k.split(' ')[0].toLowerCase())) gaps.push({ kind: 'style', text: `${k} · clave del estilo ${s}`, q: k });
  }));
  return gaps.slice(0, 10);
}

export function addWish(prod) {
  const p = state.profile;
  p.wishlist ||= [];
  if (!p.wishlist.some((w) => w.url === prod.url)) p.wishlist.unshift({ ...prod, savedAt: Date.now() });
  saveProfile();
  toast('Guardado en tu lista de deseos');
}

const allBrands = () => [...new Set([...state.profile.brands, ...state.items.map((i) => i.brand).filter(Boolean)])];
const ago = (t) => {
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86400e3);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

function suggestedBrands(have) {
  const score = {};
  const styles = state.profile.styles.length ? state.profile.styles : ['Minimalista', 'Clásico'];
  styles.forEach((st) => (A.STYLE_BRANDS[st] || []).forEach((b, i) => (score[b] = (score[b] || 0) + 3 - i * 0.5)));
  Object.values(A.STYLE_BRANDS).forEach((list) => { if (list.some((b) => have.includes(b))) list.forEach((b) => (score[b] = (score[b] || 0) + 1)); });
  return Object.entries(score).filter(([b]) => !have.includes(b)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b]) => b);
}

// Descarga las noticias de cada marca (una a una para no saturar el lector).
async function loadNews(force = false) {
  if (state.newsLoading) return;
  const brands = allBrands().slice(0, 8);
  if (!brands.length) return;
  state.newsLoading = true;
  if (state.tab === 'shop') renderShop();
  for (const b of brands) {
    try { state.news[b] = await W.brandNews(b, { force }); }
    catch (e) { state.news[b] = { error: e.message }; }
    state.profile.brandChecks ||= {};
    state.profile.brandChecks[b] = Date.now();
    if (state.tab === 'shop') renderFeed();
  }
  saveProfile();
  state.newsLoading = false;
  if (state.tab === 'shop') renderShop();
}

function renderFeed() {
  const box = $('#feed'); if (!box) return;
  const brands = allBrands().slice(0, 8);
  const all = brands.flatMap((b) => (Array.isArray(state.news[b]) ? state.news[b] : []));
  all.sort((a, b) => (b.date || 0) - (a.date || 0));
  const pending = brands.filter((b) => !state.news[b]);
  const failed = brands.filter((b) => state.news[b]?.error);
  box.innerHTML = `
    ${all.slice(0, 14).map((n) => `<a class="news" href="${esc(n.url)}" target="_blank" rel="noopener">
      <span class="news-brand">${esc(n.brand)}</span>
      <b>${esc(n.title)}</b>
      ${n.desc ? `<p>${esc(n.desc)}</p>` : ''}
      <small>${esc(n.source)}${n.date ? ` · ${ago(n.date)}` : ''}</small></a>`).join('')}
    ${pending.length && state.newsLoading ? pending.map(() => '<div class="news skeleton"><i></i><i></i><i></i></div>').slice(0, 3).join('') : ''}
    ${!all.length && !state.newsLoading ? `<p class="small muted">${brands.length ? 'Pulsa «Actualizar» para que Vistelo busque las últimas novedades.' : 'Sigue marcas abajo para ver sus lanzamientos aquí.'}</p>` : ''}
    ${failed.length ? `<p class="small muted">Sin noticias recientes de: ${failed.map(esc).join(', ')}.</p>` : ''}`;
}

function linkResultHTML(r) {
  if (!r) return '';
  if (r.loading) return '<div class="news skeleton"><i></i><i></i><i></i></div>';
  if (r.error) return `<div class="notice">${esc(r.error)}</div>`;
  const prod = r.prod;
  const season = state.profile.season;
  const fit = prod.hex && season ? Math.round(C.paletteFit(prod.hex, season) * 100) : null;
  const matches = prod.hex ? bestMatches({ id: '_', hex: prod.hex, color: prod.color, type: prod.type || 'Camiseta' }) : [];
  return `<div class="prod-result">
    <a class="prod-card big" href="${esc(prod.url)}" target="_blank" rel="noopener">
      ${prod.image ? `<img src="${esc(prod.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <span><small>${esc(prod.site)}</small><b>${esc(prod.title)}</b>${prod.price ? `<em>${esc(prod.price)}</em>` : ''}</span></a>
    <div class="spec-grid" style="margin-top:12px">
      <div class="spec"><span>Tipo</span><b>${esc(prod.type || '—')}</b></div>
      <div class="spec"><span>Color</span><b>${prod.color ? `<i class="dot" style="background:${prod.hex}"></i>${esc(prod.color)}` : '—'}</b></div>
      <div class="spec"><span>Tu paleta</span><b>${fit !== null ? `${fit}%` : '—'}</b></div>
      <div class="spec"><span>Combina con</span><b>${matches.length} prendas</b></div>
    </div>
    ${matches.length ? `<div class="match-row">${matches.map(({ o, h }) => `<div class="match"><span><img src="${o.img}" alt=""></span><small>${esc(label(o))}</small><em>${Math.round(h * 100)}%</em></div>`).join('')}</div>` : ''}
    <button class="btn ghost block" id="wishBtn">♡ Guardar en deseos</button>
  </div>`;
}

export function renderShop() {
  const v = $('#view');
  const p = state.profile;
  p.brandChecks ||= {};
  const brands = allBrands();
  const gaps = wardrobeGaps();
  const suggested = suggestedBrands(brands);
  const wish = p.wishlist || [];

  v.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Radar de drops · Vistelo AI</p>
      <div class="hero-stats" style="grid-template-columns:repeat(3,1fr)">
        <div><b>${brands.length}</b><span>marcas</span></div>
        <div><b>${wish.length}</b><span>deseos</span></div>
        <div><b>${gaps.length}</b><span>ideas</span></div>
      </div>
      <p class="hero-foot">Vistelo lee en la web los lanzamientos recientes de tus marcas y analiza cualquier enlace de producto.</p>
    </section>

    <div class="card">
      <div class="card-head"><h3>Lo último de tus marcas</h3>
        <button class="icon-btn" id="refreshNews" ${state.newsLoading ? 'disabled' : ''} aria-label="Actualizar">${state.newsLoading ? '<span class="spinner"></span>' : ICON.refresh}</button></div>
      <div id="feed"></div>
    </div>

    <div class="card tint">
      <h3>${ICON.link} Analizar un enlace</h3>
      <p class="small muted">Pega el enlace de una prenda de cualquier tienda. Vistelo la lee y te dice si te favorece y con qué la combinas.</p>
      <div class="composer flat"><input id="linkInput" type="url" inputmode="url" placeholder="https://www.zara.com/es/…"><button id="linkGo" aria-label="Analizar">${ICON.send}</button></div>
      <div id="linkResult">${linkResultHTML(state.linkResult)}</div>
    </div>

    ${wish.length ? `<div class="card">
      <h3>Tu lista de deseos</h3>
      ${wish.map((w, i) => `<div class="wish">
        ${w.image ? `<img src="${esc(w.image)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="wish-ph" style="background:${w.hex || 'var(--card)'}"></span>`}
        <a href="${esc(w.url)}" target="_blank" rel="noopener"><small>${esc(w.site)}</small><b>${esc(w.title)}</b>${w.price ? `<em>${esc(w.price)}</em>` : ''}</a>
        <button class="icon-btn" data-unwish="${i}" aria-label="Quitar">${ICON.x}</button></div>`).join('')}
    </div>` : ''}

    <div class="card">
      <h3>Tus marcas</h3>
      ${brands.length ? brands.map((b) => `<div class="drop">
          <div><span class="brand-tag">${esc(b)}</span><div class="small muted">${p.brandChecks[b] ? `Revisada ${ago(p.brandChecks[b])}` : 'Aún no revisada'}</div></div>
          <div class="drop-actions">
            <button class="chip" data-readbrand="${esc(b)}">${ICON.spark} Leer web</button>
            ${A.KNOWN_BRANDS[b] ? `<a href="${A.KNOWN_BRANDS[b]}" target="_blank" rel="noopener">Tienda ↗</a>` : ''}
            ${p.brands.includes(b) ? `<button class="x" data-rmbrand="${esc(b)}" aria-label="Dejar de seguir">✕</button>` : ''}
          </div>
        </div><div class="brand-read" id="read-${esc(b).replace(/\W/g, '')}"></div>`).join('') : '<p class="muted small">Sigue marcas para tener su radar de novedades.</p>'}
      <div class="composer flat" style="margin-top:12px"><input id="brandAdd" list="knownBrands" placeholder="Seguir marca (ej. Arket)"><button id="brandAddBtn" aria-label="Seguir">+</button></div>
      <datalist id="knownBrands">${Object.keys(A.KNOWN_BRANDS).map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
    </div>

    ${suggested.length ? `<div class="card">
      <h3>Marcas que te pueden gustar</h3>
      <p class="small muted">Según tu estilo${p.styles.length ? ` (${p.styles.map(esc).join(', ')})` : ''} y las marcas que ya sigues.</p>
      ${suggested.map((b) => `<div class="drop"><div><span class="brand-tag">${esc(b)}</span></div>
        <div class="drop-actions"><a href="${A.KNOWN_BRANDS[b] || shopLink(b)}" target="_blank" rel="noopener">Ver ↗</a><button class="chip on" data-follow="${esc(b)}">+ Seguir</button></div></div>`).join('')}
    </div>` : ''}

    <div class="card">
      <h3>Lo que le falta a tu armario</h3>
      ${gaps.length ? gaps.map((g) => `<div class="drop"><div style="display:flex;gap:10px;align-items:center">${g.hex ? `<span class="dot" style="width:22px;height:22px;background:${g.hex}"></span>` : ''}<span>${esc(g.text)}</span></div>
        <a target="_blank" rel="noopener" href="${shopLink(`${g.q} ${p.shopFor !== 'Todo' ? p.shopFor : ''}`)}">Buscar ↗</a></div>`).join('')
        : '<p class="muted">¡Tu armario está muy completo! Haz el test de color y elige estilos en Perfil para afinar las ideas.</p>'}
    </div>`;

  renderFeed();
  $('#refreshNews').addEventListener('click', () => { state.news = {}; loadNews(true); });

  const analyzeLink = async () => {
    const url = W.findUrl($('#linkInput').value.trim());
    if (!url) return toast('Pega un enlace que empiece por https://');
    state.linkResult = { loading: true }; $('#linkResult').innerHTML = linkResultHTML(state.linkResult);
    try { state.linkResult = { prod: A.productFromPage(await W.readPage(url)) }; }
    catch (e) { state.linkResult = { error: e.message }; }
    if (state.tab === 'shop') renderShop();
  };
  $('#linkGo').addEventListener('click', analyzeLink);
  $('#linkInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeLink(); });
  $('#wishBtn', v)?.addEventListener('click', () => { addWish(state.linkResult.prod); renderShop(); });
  $$('[data-unwish]', v).forEach((b) => b.addEventListener('click', () => { p.wishlist.splice(+b.dataset.unwish, 1); saveProfile(); renderShop(); }));

  const follow = (val) => { if (val && !p.brands.includes(val)) { p.brands.push(val); saveProfile(); delete state.news[val]; } renderShop(); loadNews(); };
  $('#brandAddBtn').addEventListener('click', () => follow($('#brandAdd').value.trim()));
  $('#brandAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') follow(e.target.value.trim()); });
  $$('[data-follow]', v).forEach((b) => b.addEventListener('click', () => { follow(b.dataset.follow); toast(`Sigues a ${b.dataset.follow}`); }));
  $$('[data-rmbrand]', v).forEach((b) => b.addEventListener('click', () => { p.brands = p.brands.filter((x) => x !== b.dataset.rmbrand); saveProfile(); renderShop(); }));
  $$('[data-readbrand]', v).forEach((b) => b.addEventListener('click', async () => {
    const brand = b.dataset.readbrand;
    const box = $(`#read-${brand.replace(/\W/g, '')}`);
    const url = A.KNOWN_BRANDS[brand];
    if (!url) { box.innerHTML = `<p class="small muted">No conozco la web de ${esc(brand)}. Pega un enlace suyo en «Analizar un enlace».</p>`; return; }
    box.innerHTML = '<p class="small muted"><span class="spinner"></span> Vistelo está leyendo la web…</p>';
    try {
      const page = await W.readPage(url);
      box.innerHTML = `<div class="read-box"><b>${esc(page.title)}</b>
        ${page.links.length ? `<p class="small muted" style="margin:6px 0">Secciones de novedades encontradas:</p>${page.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text)} ↗</a>`).join('')}`
          : `<p class="small" style="margin:6px 0 0">${esc(page.text.slice(0, 260))}…</p>`}</div>`;
    } catch (e) { box.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; }
  }));

  // Actualización automática: si alguna marca no tiene noticias cargadas
  if (brands.length && !state.newsLoading && brands.slice(0, 8).some((b) => !state.news[b])) loadNews();
}
