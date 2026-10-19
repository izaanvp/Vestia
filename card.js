// Tarjeta Vestia: una mini versión de ti (avatar, colores, tu maniquí con tu último look y cifras) con un QR.
//  · Pública: abre tu «mini Vestia» en cualquier móvil (solo si la activas).
//  · Privada: vincula otro móvil tuyo a este armario (sincronizado con tu servidor).
import { qrMatrix } from './transfer.js';
import { dressedSVG } from './share.js';
import { isLinked, miniUrl, linkCode, setPublic } from './sync.js';
import { state, $, $$, esc, toast, openSheet, byId, ICON } from './core.js';

const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#19b5ad';

// QR fácil de leer: módulos casi cuadrados, ojos estándar y la percha de Vestia en el centro
function qrMarkup(m, A) {
  const n = m.length, q = 4, size = n + q * 2;
  const eye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  // Hueco para el logotipo: más pequeño en los QR cortos (tienen menos módulos de sobra)
  const hr = Math.max(2.2, n * (n < 34 ? 0.08 : 0.11));
  const hole = (x, y) => Math.abs(x - n / 2 + 0.5) < hr && Math.abs(y - n / 2 + 0.5) < hr;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x] && !eye(x, y) && !hole(x, y)) d += `M${x + q} ${y + q}h1v1h-1z`;
  const eyeAt = (x, y) => `<path d="M${x + q} ${y + q}h7v7h-7zM${x + q + 1} ${y + q + 1}v5h5v-5z" fill-rule="evenodd" fill="#0a1833"/><rect x="${x + q + 2}" y="${y + q + 2}" width="3" height="3" rx=".6" fill="${A}"/>`;
  const c = size / 2, r = hr * 0.95;
  return `<svg viewBox="0 0 ${size} ${size}" class="qr-art" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0a1833"/>
    ${eyeAt(0, 0)}${eyeAt(n - 7, 0)}${eyeAt(0, n - 7)}
    <circle cx="${c}" cy="${c}" r="${r}" fill="${A}" shape-rendering="geometricPrecision"/>
    <g transform="translate(${c - r * 0.62} ${c - r * 0.62}) scale(${(r * 1.24) / 24})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"><path d="M12 5.5a1.8 1.8 0 1 1 1.8 1.8c-.8 0-1.8.5-1.8 1.4v1L3.4 15.5c-.8.5-.4 1.5.5 1.5h16.2c.9 0 1.3-1 .5-1.5L12 9.7"/></g></svg>`;
}

async function cardHTML(kind, text) {
  const p = state.profile, A = accent();
  const items = state.items;
  const worn = Object.values(state.worn).map(byId).filter(Boolean);
  const colors = [...new Map(items.map((i) => [i.color, i.hex])).entries()].slice(0, 7);
  const svg = worn.length ? await dressedSVG(worn) : '';
  const m = await qrMatrix(text, 'H');
  return `<div class="vcard ${kind}">
    <div class="vcard-awning"></div>
    <div class="vcard-top">
      <span class="vcard-av" ${p.avatar ? `style="background-image:url(${p.avatar})"` : ''}>${p.avatar ? '' : esc((p.name || 'V').charAt(0).toUpperCase())}</span>
      <div><span class="vcard-tag">${kind === 'public' ? 'Mini Vestia' : 'Vincular móvil'}</span><b class="vcard-name">${esc(p.name || 'Mi armario')}</b>
        ${p.season ? `<small>Paleta ${esc(p.season)}</small>` : p.styles?.length ? `<small>${p.styles.slice(0, 2).map(esc).join(' · ')}</small>` : ''}</div>
    </div>
    <div class="vcard-body">
      <div class="vcard-fig">${svg || `<div class="vcard-empty">${ICON.hanger}</div>`}</div>
      <div class="vcard-right">
        <div class="vcard-qr">${qrMarkup(m, A)}</div>
        <div class="vcard-stats"><span><b>${items.length}</b>prendas</span><span><b>${state.outfits.length}</b>looks</span><span><b>${new Set(items.map((i) => i.brand).filter(Boolean)).size}</b>marcas</span></div>
        <div class="vcard-pal">${colors.map(([c, h]) => `<i title="${esc(c)}" style="background:${h}"></i>`).join('')}</div>
      </div>
    </div>
    <p class="vcard-foot">${kind === 'public' ? 'Escanéalo con la cámara para ver mi armario' : 'Escanéalo con tu otro iPhone para tener aquí el mismo armario'}</p>
  </div>`;
}

export async function openCard(kind = 'public') {
  if (!isLinked()) {
    const { openTransfer } = await import('./transfer.js');
    toast('Conecta antes tu servidor en Perfil (o pasa el armario sin servidor)');
    return openTransfer();
  }
  const s = state.profile.server;
  const sheet = openSheet(`
    <p class="eyebrow accent">${ICON.qr} Tu tarjeta Vestia</p>
    <div class="seg" style="margin:6px 0 12px">
      <button data-card="public" class="${kind === 'public' ? 'on' : ''}">Mini Vestia pública</button>
      <button data-card="link" class="${kind === 'link' ? 'on' : ''}">Vincular otro móvil</button>
    </div>
    <div id="cardHost" class="card-host"><span class="spinner"></span></div>
    <div id="cardExtra"></div>`);
  sheet.classList.add('sheet-tall');
  const draw = async (k) => {
    $$('[data-card]', sheet).forEach((b) => b.classList.toggle('on', b.dataset.card === k));
    const host = $('#cardHost', sheet), extra = $('#cardExtra', sheet);
    host.innerHTML = '<span class="spinner"></span>';
    const text = k === 'public' ? miniUrl() : linkCode();
    host.innerHTML = await cardHTML(k, text);
    extra.innerHTML = k === 'public'
      ? `<label class="switch"><span><b>Mini Vestia pública</b><br><small class="muted">Cualquiera con el QR o el enlace verá tu perfil, tu armario y tus looks (nunca precios, notas ni tu diario).</small></span><input type="checkbox" id="pubToggle" ${s.public ? 'checked' : ''}></label>
         ${s.public ? '' : '<p class="notice small">Ahora mismo tu mini Vestia es privada: el QR mostrará «Armario privado» hasta que la actives.</p>'}
         <div class="row" style="margin-top:10px"><a class="btn ghost" href="${esc(miniUrl())}" target="_blank" rel="noopener">Ver mi mini Vestia</a><button class="btn primary" id="cardShare">${ICON.share} Compartir</button></div>`
      : `<p class="notice small">Este código da acceso completo a tu armario. Escanéalo solo con tus propios móviles y no lo compartas.</p>
         <p class="small muted">En el otro iPhone abre Vestia → <b>Perfil → Pasar tu armario → Recibir armario</b> y apunta a este código (si usas Vestia en Safari, basta con la cámara). Te preguntará si quieres usar este armario y, a partir de ahí, los dos móviles se mantienen sincronizados.</p>`;
    $('#pubToggle', extra)?.addEventListener('change', async (e) => {
      try { await setPublic(e.target.checked); toast(e.target.checked ? 'Tu mini Vestia ya es pública' : 'Tu mini Vestia vuelve a ser privada'); draw('public'); }
      catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
    });
    $('#cardShare', extra)?.addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({ title: `Mini Vestia de ${state.profile.name || 'mi armario'}`, url: miniUrl() });
        else { await navigator.clipboard.writeText(miniUrl()); toast('Enlace copiado'); }
      } catch { /* cancelado */ }
    });
  };
  $$('[data-card]', sheet).forEach((b) => b.addEventListener('click', () => draw(b.dataset.card)));
  draw(kind);
}
