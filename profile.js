// Perfil: datos personales, cuerpo del maniquí, Vistelo AI, apariencia y copias de seguridad.
import * as db from './db.js';
import * as V from './vision.js';
import * as CU from './cutout.js';
import * as W from './web.js';
import { describe } from './skin.js';
import * as F from './fitting.js';
import { openBodySheet } from './bodyui.js';
import { runDemo, leaveDemo, isDemo } from './demo.js';
import { openSkinSheet } from './skinui.js';
import { recognize, saveItem } from './closet.js';
import { state, $, $$, esc, toast, saveProfile, ICON, STYLES, ACCENTS, pickFile, prepareImage, go } from './core.js';
import { isLinked, miniUrl, connect, sync, unlink } from './sync.js';

export function applyAccent() {
  document.documentElement.style.setProperty('--accent', state.profile.accent || '#19b5ad');
}
export function renderAvatar(el) {
  const p = state.profile;
  el.style.backgroundImage = p.avatar ? `url(${p.avatar})` : '';
  el.textContent = p.avatar ? '' : (p.name || 'V').trim().charAt(0).toUpperCase();
}

async function enableVision(btn) {
  const bar = $('#visionBar'), txt = $('#visionTxt');
  btn.disabled = true; bar.hidden = false;
  try {
    await V.load((p, m) => { bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; txt.textContent = m; });
    state.profile.vision = true; saveProfile();
    toast('Visión avanzada activada');
    renderProfile();
  } catch (e) {
    txt.textContent = `No se pudo descargar: ${e.message}. Revisa la conexión e inténtalo de nuevo.`;
    btn.disabled = false;
  }
}

async function analyzeAll(btn) {
  const todo = state.items.filter((i) => !i.visionAt);
  if (!todo.length) return toast('Todo tu armario ya está analizado');
  btn.disabled = true;
  let n = 0;
  for (const it of todo) {
    btn.innerHTML = `<span class="spinner"></span> Analizando ${++n} de ${todo.length}…`;
    const img = new Image(); img.src = it.img; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    await saveItem(await recognize(c, { ...it }));
  }
  toast(`Vistelo ha analizado ${todo.length} prendas`);
  renderProfile();
}

export function renderProfile() {
  const v = $('#view');
  const p = state.profile;
  const skin = p.skin?.hex;
  const pending = state.items.filter((i) => !i.visionAt).length;
  v.innerHTML = `
    <section class="profile-hero">
      <button class="avatar-btn big" id="avatarEdit" aria-label="Cambiar foto"></button>
      <div style="flex:1;min-width:0">
        <input class="name-input" id="pName" value="${esc(p.name)}" maxlength="30" aria-label="Nombre">
        <p class="small">${[p.season, skin ? describe(skin).text : null, `${state.items.length} prendas`].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </section>

    <div class="card">
      <h3>Sobre ti</h3>
      <div class="field"><label>Bio</label><textarea id="pBio" placeholder="Cómo vistes, qué buscas…">${esc(p.bio)}</textarea></div>
      <div class="field"><label>Tu estilo</label><div class="chips">${STYLES.map((s) => `<button class="chip ${p.styles.includes(s) ? 'on' : ''}" data-style="${s}">${s}</button>`).join('')}</div></div>
      <div class="two">
        <div class="field"><label>Tallas</label><input id="pSizes" value="${esc(p.sizes)}" placeholder="S · 38 · 39"></div>
        <div class="field"><label>Compro en</label><select id="pShop">${['Todo', 'Mujer', 'Hombre'].map((s) => `<option ${p.shopFor === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      </div>
    </div>

    <div class="card">
      <h3>Tu maniquí</h3>
      <div class="skin-result" style="margin-bottom:12px">
        <span class="skin-swatch" style="background:${skin || 'repeating-linear-gradient(45deg,#fff 0 5px,#e5e9ec 5px 10px)'}"></span>
        <div style="flex:1"><b>${skin ? esc(describe(skin).text) : 'Tono de piel sin medir'}</b><p class="small muted" style="margin:2px 0 0">${p.skin ? `Medido con ${esc(p.skin.source)}` : 'Usa la cámara o una foto'}</p></div>
        <button class="btn ghost small-btn" id="pSkin">${ICON.camera} ${skin ? 'Medir' : 'Medir'}</button>
      </div>
      <div class="body-summary">
        <span class="fig-mini">${F.mannequinSVG({ skin: skin || '#d4a37f', body: F.bodyOf(p), bare: true })}</span>
        <div><b>${F.FIGURES[F.bodyOf(p).figure]} · ${esc(F.bodyOf(p).build)}</b><p class="small muted" style="margin:2px 0 0">${esc(F.bodyOf(p).hairStyle)}${F.bodyOf(p).beard ? ' · barba' : ''}${F.bodyOf(p).face ? ' · con rasgos' : ''}</p></div>
        <button class="btn primary small-btn" id="pBody">Personalizar</button>
      </div>
    </div>

    <div class="card ai-card">
      <h3>${ICON.spark} Vistelo AI</h3>
      <div class="switch-row">
        <div><b>Visión avanzada</b><p class="small muted">Reconoce más de 60 prendas (gabardina, blusa, botines, falda plisada…), estampados y estilo. Funciona en tu iPhone; se descarga una vez (~25 MB).</p></div>
        ${p.vision ? '<span class="pill on">Activa</span>' : `<button class="btn primary small-btn" id="visionOn">Activar</button>`}
      </div>
      <div class="dl-bar" id="visionBar" hidden><i></i></div><p class="small muted" id="visionTxt"></p>
      ${p.vision ? `<button class="btn ghost block" id="analyzeAll" ${pending ? '' : 'disabled'}>${pending ? `${ICON.spark} Analizar ${pending} prendas sin revisar` : '✓ Todo el armario analizado'}</button>` : ''}
      <div class="switch-row" style="margin-top:14px">
        <div><b>Recorte del fondo con IA</b><p class="small muted">Separa la prenda del fondo con precisión, aunque la foto esté en la cama o en el suelo. Se descarga una vez (~44 MB).</p></div>
        ${p.cutoutAI ? '<span class="pill on">Activo</span>' : `<button class="btn primary small-btn" id="cutOn">Activar</button>`}
      </div>
      <div class="dl-bar" id="cutBar" hidden><i></i></div><p class="small muted" id="cutTxt"></p>
      <label class="switch"><span>Recortar el fondo automáticamente al subir fotos</span><input type="checkbox" id="autoCut" ${p.autoCutout !== false ? 'checked' : ''}></label>
      <details class="privacy">
        <summary>Qué sale de tu iPhone</summary>
        <p class="small muted">Tus fotos y tu armario no salen del dispositivo, salvo que conectes tu propio servidor. Vestia solo se conecta para:</p>
        <ul class="small muted privacy-list">
          <li>descargar una vez los modelos de visión y de recorte (Hugging Face), el lector de etiquetas y el de QR (jsDelivr) y el detector de postura para el probador con tu foto (jsDelivr y Google);</li>
          <li>leer las webs, enlaces, noticias y precios de tu lista de deseos (a través del lector público r.jina.ai, que solo recibe la dirección de la web);</li>
          <li>consultar el tiempo con tu ubicación aproximada (Open-Meteo) cuando pides el «look de hoy»;</li>
          <li>al pasar el armario a otro móvil, los dos se conectan directamente; un servidor público de Google (STUN) solo les ayuda a encontrarse;</li>
          <li>si conectas <b>tu servidor Vestia</b>, tu armario, tus looks y tu diario se guardan también en tu propia cuenta de Cloudflare, protegidos con tu clave. Tu mini Vestia pública (solo si la activas) enseña tu perfil, tus prendas y tus looks, nunca precios, notas ni tu diario.</li>
        </ul>
        <div class="field" style="margin-top:8px"><label>Lector web propio (opcional)</label><input id="pReader" value="${esc(p.reader || '')}" placeholder="https://mi-lector.workers.dev"></div>
      </details>
    </div>

    <div class="card">
      <h3>Apariencia</h3>
      <div class="field"><label>Color de acento</label>
        <div class="color-pick">${ACCENTS.map((c) => `<button data-accent="${c}" style="background:${c}" class="${p.accent === c ? 'on' : ''}" aria-label="${c}"></button>`).join('')}
          <input type="color" id="pAccent" value="${p.accent}" class="color-input" aria-label="Color personalizado"></div></div>
      <label class="switch"><span>Telón de bienvenida al abrir</span><input type="checkbox" id="pCurtain" ${p.curtain ? 'checked' : ''}></label>
    </div>

    <div class="card server-card">
      <h3>${ICON.qr} Tu servidor Vestia</h3>
      ${isLinked() ? `
        <div class="server-status"><span class="server-dot"></span><div><b>Conectado</b><p class="small muted">${esc(p.server.url.replace(/^https?:\/\//, ''))} · ${p.server.lastSync ? `sincronizado ${new Date(p.server.lastSync).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'sin sincronizar'}</p></div></div>
        <div class="row"><button class="btn primary" id="srvSync">${ICON.refresh} Sincronizar</button><button class="btn navy" id="srvCard">${ICON.qr} Mi tarjeta QR</button></div>
        <div class="row" style="margin-top:8px"><a class="btn ghost" href="${esc(miniUrl())}" target="_blank" rel="noopener">Mi mini Vestia ${p.server.public ? '' : '(privada)'}</a><button class="btn ghost" id="srvApi">Consultar</button></div>
        <button class="link-btn" id="srvOff">Desconectar este móvil del servidor</button>`
      : `<p class="small muted">Con tu propio servidor (gratis en Cloudflare) tu armario se guarda fuera del móvil, se sincroniza entre tus iPhone, lo puedes consultar desde cualquier sitio y tienes una mini Vestia que se abre con un QR. También vigila los precios de tu lista de deseos aunque la app esté cerrada.</p>
        <div class="field"><label>Dirección de tu servidor</label><input id="srvUrl" type="url" inputmode="url" placeholder="https://vestia-servidor.tu-nombre.workers.dev"></div>
        <button class="btn primary block" id="srvConnect">Conectar</button>
        <button class="link-btn" id="srvScan">${ICON.qr} ¿Ya lo tienes en otro móvil? Escanea su QR de vinculación</button>
        <details class="privacy"><summary>Cómo crear tu servidor gratis (5 minutos)</summary>
          <ol class="small muted server-steps">
            <li>Crea una cuenta gratis en <b>dash.cloudflare.com</b>.</li>
            <li><b>Storage &amp; Databases → KV → Create</b>: llámalo <code>VESTIA</code>.</li>
            <li><b>Workers &amp; Pages → Create → Worker</b>, ponle de nombre <code>vestia-servidor</code> y pulsa <b>Deploy</b>.</li>
            <li><b>Edit code</b>: borra lo que hay, pega el contenido de <code>servidor.js</code> (está en tu repositorio de Vestia) y pulsa <b>Deploy</b>.</li>
            <li>En el Worker: <b>Settings → Bindings → Add → KV namespace</b>, nombre de variable <code>VESTIA</code> y elige el KV del paso 2.</li>
            <li>(Opcional) <b>Settings → Triggers → Cron</b>: <code>0 */6 * * *</code> para vigilar precios cada 6 horas.</li>
            <li>Copia la dirección del Worker (termina en <code>.workers.dev</code>) y pégala aquí.</li>
          </ol></details>`}
    </div>

    <div class="card">
      <h3>Tus datos</h3>
      <p class="muted small">Todo se guarda en tu iPhone. Haz copias de seguridad para no perder tu armario.</p>
      ${isDemo() ? `<button class="btn navy block" id="demoOff" style="margin-bottom:8px">Salir del modo demo y borrar el ejemplo</button>` : `<button class="btn navy block" id="demoOn" style="margin-bottom:8px">${ICON.spark} Probar con un armario de ejemplo</button>`}
      <div class="xfer-cta">
        <button class="btn primary" id="xferSend">${ICON.qr} Pasar a otro móvil</button>
        <button class="btn ghost" id="xferRecv">Recibir armario</button>
      </div>
      <div class="row"><button class="btn ghost" id="exp">Exportar copia</button><button class="btn ghost" id="imp">Importar copia</button></div>
      <button class="btn danger block" id="wipe" style="margin-top:8px">Borrar todo</button>
    </div>
    <p class="small muted center">Vestia · Vistelo AI · v4.0</p>`;

  renderAvatar($('#avatarEdit'));
  $('#avatarEdit').addEventListener('click', async () => {
    const f = await pickFile('image/*'); if (!f) return;
    const { canvas } = await prepareImage(f, 300);
    p.avatar = canvas.toDataURL('image/jpeg', 0.85); saveProfile();
    renderAvatar($('#avatarEdit')); renderAvatar($('#avatarBtn'));
  });
  const bind = (id, key) => $(id).addEventListener('input', (e) => { p[key] = e.target.value; saveProfile(); renderAvatar($('#avatarBtn')); });
  bind('#pName', 'name'); bind('#pBio', 'bio'); bind('#pSizes', 'sizes');
  $('#pName').addEventListener('change', () => { $('#greeting').textContent = `Hola, ${p.name}`; });
  $('#pShop').addEventListener('change', (e) => { p.shopFor = e.target.value; saveProfile(); });
  $('#pReader').addEventListener('change', (e) => { p.reader = e.target.value.trim(); W.setCustomReader(p.reader); saveProfile(); toast('Lector guardado'); });
  $$('[data-style]', v).forEach((b) => b.addEventListener('click', () => {
    p.styles = p.styles.includes(b.dataset.style) ? p.styles.filter((s) => s !== b.dataset.style) : [...p.styles, b.dataset.style];
    b.classList.toggle('on'); saveProfile();
  }));
  $('#pSkin').addEventListener('click', () => openSkinSheet(() => renderProfile()));
  $('#pBody').addEventListener('click', () => openBodySheet(() => renderProfile()));
  $('#visionOn', v)?.addEventListener('click', (e) => enableVision(e.currentTarget));
  $('#analyzeAll', v)?.addEventListener('click', (e) => analyzeAll(e.currentTarget));
  $('#autoCut').addEventListener('change', (e) => { p.autoCutout = e.target.checked; saveProfile(); });
  $('#cutOn', v)?.addEventListener('click', async (e) => {
    const b = e.currentTarget, bar = $('#cutBar'), txt = $('#cutTxt');
    b.disabled = true; bar.hidden = false;
    try {
      await CU.loadML((x) => { bar.firstElementChild.style.width = `${Math.round(x * 100)}%`; txt.textContent = `Descargando el recorte con IA… ${Math.round(x * 100)}%`; });
      p.cutoutAI = true; saveProfile(); toast('Recorte con IA activado'); renderProfile();
    } catch (err) { txt.textContent = `No se pudo descargar: ${err.message}`; b.disabled = false; }
  });
  const setAccent = (c) => { p.accent = c; saveProfile(); applyAccent(); $$('[data-accent]', v).forEach((x) => x.classList.toggle('on', x.dataset.accent === c)); };
  $$('[data-accent]', v).forEach((b) => b.addEventListener('click', () => setAccent(b.dataset.accent)));
  $('#pAccent').addEventListener('input', (e) => setAccent(e.target.value));
  $('#pCurtain').addEventListener('change', (e) => { p.curtain = e.target.checked; saveProfile(); });
  $('#demoOn', v)?.addEventListener('click', (e) => runDemo(e.currentTarget));
  $('#demoOff', v)?.addEventListener('click', () => leaveDemo());
  $('#srvConnect', v)?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Conectando…';
    try { const r = await connect($('#srvUrl').value); toast(`Conectado: ${r?.up || 0} prendas subidas`); renderProfile(); }
    catch (err) { toast(err.message); b.disabled = false; b.textContent = 'Conectar'; }
  });
  $('#srvSync', v)?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await sync({ onProgress: (i, n) => { b.innerHTML = `<span class="spinner"></span> ${i}/${n}`; } });
      toast(`Sincronizado · ${r.up} subidas, ${r.down} bajadas`); renderProfile();
    } catch (err) { toast(err.message); b.disabled = false; b.innerHTML = `${ICON.refresh} Sincronizar`; }
  });
  $('#srvCard', v)?.addEventListener('click', async () => (await import('./card.js')).openCard('public'));
  $('#srvApi', v)?.addEventListener('click', () => openApiSheet());
  $('#srvOff', v)?.addEventListener('click', () => { if (confirm('Este móvil dejará de sincronizarse. Tu armario sigue en el móvil y en el servidor. ¿Desconectar?')) { unlink(); renderProfile(); } });
  $('#xferSend').addEventListener('click', async () => (await import('./transfer.js')).openTransfer('send'));
  $('#xferRecv').addEventListener('click', async () => (await import('./transfer.js')).openTransfer('receive'));
  $('#srvScan', v)?.addEventListener('click', async () => (await import('./transfer.js')).openTransfer('receive'));
  $('#exp').addEventListener('click', exportBackup);
  $('#imp').addEventListener('click', async () => { const f = await pickFile('application/json,.json'); if (f) importBackup(f); });
  $('#wipe').addEventListener('click', async () => {
    if (!confirm('Se borrarán todas tus prendas, looks y tu perfil. ¿Continuar?')) return;
    await db.clear('items'); await db.clear('outfits');
    localStorage.removeItem('vestia.profile');
    location.reload();
  });
}

function exportBackup() {
  const { apiKey, ...profile } = state.profile;
  const blob = new Blob([JSON.stringify({ app: 'vestia', version: 4, profile, items: state.items, outfits: state.outfits, diary: state.diary })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vestia-copia-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'vestia') throw new Error();
    for (const it of data.items || []) await db.put('items', it);
    for (const o of data.outfits || []) await db.put('outfits', o);
    for (const d of data.diary || []) await db.put('diary', d);
    state.diary = await db.getAll('diary');
    state.profile = { ...state.profile, ...data.profile };
    saveProfile();
    state.items = await db.getAll('items');
    state.outfits = await db.getAll('outfits');
    applyAccent(); toast(`Importadas ${data.items?.length || 0} prendas`); go('closet');
  } catch { toast('El archivo no es una copia válida de Vestia'); }
}

// Consultar el armario en el servidor (lo mismo que ofrece su API)
async function openApiSheet() {
  const { openSheet } = await import('./core.js');
  const sv = state.profile.server;
  const sheet = openSheet(`<p class="eyebrow accent">${ICON.chart} Consultar tu armario</p><h3 class="detail-title">En tu servidor</h3>
    <div class="two"><div class="field"><label>Tipo</label><input id="qTipo" placeholder="Camiseta"></div><div class="field"><label>Color</label><input id="qColor" placeholder="Negro"></div></div>
    <div class="two"><div class="field"><label>Marca</label><input id="qMarca" placeholder="Zara"></div><div class="field"><label>Texto</label><input id="qTexto" placeholder="lino"></div></div>
    <button class="btn primary block" id="qGo">Buscar en el servidor</button>
    <div id="qOut" style="margin-top:12px"></div>
    <details class="privacy"><summary>Usar la API desde otros sitios</summary><p class="small muted">Dirección: <code>${esc(sv.url)}/api/u/${esc(sv.id)}/prendas?tipo=&amp;color=&amp;marca=&amp;q=</code>. También <code>/looks</code>, <code>/estadisticas</code> y <code>/diario</code>. Lo privado necesita la cabecera <code>Authorization: Bearer</code> con tu clave (guárdala en secreto).</p></details>`);
  sheet.querySelector('#qGo').addEventListener('click', async () => {
    const q = new URLSearchParams();
    [['tipo', 'qTipo'], ['color', 'qColor'], ['marca', 'qMarca'], ['q', 'qTexto']].forEach(([k, id]) => { const v = sheet.querySelector(`#${id}`).value.trim(); if (v) q.set(k, v); });
    const out = sheet.querySelector('#qOut'); out.innerHTML = '<span class="spinner"></span>';
    try {
      const res = await fetch(`${sv.url}/api/u/${sv.id}/prendas?${q}`, { headers: { Authorization: `Bearer ${sv.secret}` } });
      const list = await res.json();
      if (!res.ok) throw new Error(list.error);
      out.innerHTML = list.length ? `<p class="small muted">${list.length} prendas</p><div class="api-grid">${list.map((it) => `<div><img src="${esc(it.imagen)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><small>${esc(it.name || it.type)}</small></div>`).join('')}</div>` : '<p class="muted">Nada coincide.</p>';
    } catch (e) { out.innerHTML = `<p class="notice small">${esc(e.message || 'No se pudo consultar')}</p>`; }
  });
}
