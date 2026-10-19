// Pasar el armario a otro móvil con códigos QR, sin cuentas ni servidores propios.
// Los dos móviles se conectan directamente (WebRTC). El QR solo lleva la «dirección» de la conexión;
// las prendas viajan después por esa conexión, cifrada de extremo a extremo.
// Solo se usa un servidor público STUN (de Google) para que los móviles se encuentren si están en redes distintas.
import * as db from './db.js';
import { markDirty, scheduleSync, isLinked, link, linkFromText, linkQuestion } from './sync.js';
import { state, $, esc, toast, openSheet, closeSheet, saveProfile, ICON, go, pickFile } from './core.js';

const QRGEN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const QRREAD = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const CHUNK = 16000;
const PREFIX = 'VESTIA1:';

const scripts = {};
const loadScript = (src) => (scripts[src] ||= new Promise((ok, ko) => {
  // Las librerías UMD se registran como globales (qrcode, jsQR); se oculta «module» por si acaso
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => ko(new Error('No se pudo descargar el lector de QR'));
  document.head.appendChild(s);
}));

// ---------- Codificación compacta de la conexión ----------
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let out = bytes, z = '0';
  if ('CompressionStream' in window) {
    out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    z = '1';
  }
  let bin = ''; out.forEach((b) => (bin += String.fromCharCode(b)));
  return `${PREFIX}${z}${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
async function unpack(text) {
  if (!text?.startsWith(PREFIX)) throw new Error('Este QR no es de Vestia');
  const z = text[PREFIX.length];
  const b64 = text.slice(PREFIX.length + 1).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
  const raw = z === '1' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
// SDP más corto: quita líneas que no hacen falta para un canal de datos
const slim = (sdp) => sdp.split('\r\n').filter((l) => !/^a=(extmap|rtcp-fb|ssrc|msid|max-message-size)/.test(l) && !/typ relay/.test(l)).join('\r\n');

function waitIce(pc, ms = 4000) {
  return new Promise((ok) => {
    if (pc.iceGatheringState === 'complete') return ok();
    const t = setTimeout(ok, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); } });
  });
}

// ---------- QR ----------
// Matriz de módulos del QR (ec: 'L' poco, 'H' mucha corrección: admite un logotipo encima)
export async function qrMatrix(text, ec = 'L') {
  await loadScript(QRGEN);
  const qr = window.qrcode(0, ec);
  qr.addData(text, 'Byte'); qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (__, x) => qr.isDark(y, x)));
}
export async function qrSVG(text) {
  await loadScript(QRGEN);
  const qr = window.qrcode(0, 'L');
  qr.addData(text, 'Byte'); qr.make();
  const n = qr.getModuleCount(), q = 4, size = n + q * 2;
  let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${size} ${size}" class="qr" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#0a1833"/></svg>`;
}

// Escanea un QR con la cámara. Devuelve el texto (o null si se cancela).
let camStream = null;
const stopScan = () => { camStream?.getTracks().forEach((t) => t.stop()); camStream = null; };
function scanQR(host, hint) {
  return new Promise(async (resolve) => {
    host.innerHTML = `<div class="qr-cam"><video playsinline muted autoplay></video><span class="qr-frame"></span></div>
      <p class="small muted center">${esc(hint)}</p>
      <button class="link-btn" id="qrFromPhoto">${ICON.image} O elegir una captura del código</button>`;
    let done = false;
    const finish = (v) => { if (done) return; done = true; stopScan(); resolve(v); };
    host.querySelector('#qrFromPhoto').addEventListener('click', async () => {
      const f = await pickFile('image/*'); if (!f) return;
      await loadScript(QRREAD);
      const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const r = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (r?.data) finish(r.data); else toast('No encuentro un código QR en esa imagen');
    });
    try {
      await loadScript(QRREAD);
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const v = host.querySelector('video'); v.srcObject = camStream; await v.play();
      const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (done || !v.isConnected) return finish(null);
        if (v.videoWidth) {
          const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
          g.drawImage(v, 0, 0, c.width, c.height);
          const r = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          if (r?.data && (r.data.startsWith(PREFIX) || linkFromText(r.data))) return finish(r.data);
        }
        setTimeout(tick, 180);
      };
      tick();
    } catch { host.querySelector('.qr-cam').innerHTML = '<p class="notice" style="margin:12px">No puedo usar la cámara. Haz una captura del código en el otro móvil y elígela aquí.</p>'; }
  });
}

// ---------- Datos ----------
function backupData() {
  const { apiKey, ...profile } = state.profile;
  return JSON.stringify({ app: 'vestia', version: 4, profile, items: state.items, outfits: state.outfits, diary: state.diary });
}
export async function importData(data, { merge = true } = {}) {
  if (data.app !== 'vestia') throw new Error('No es un armario de Vestia');
  if (!merge) { await db.clear('items'); await db.clear('outfits'); await db.clear('diary'); }
  for (const it of data.items || []) await db.put('items', it);
  for (const o of data.outfits || []) await db.put('outfits', o);
  for (const d of data.diary || []) await db.put('diary', d);
  // Del perfil se conserva lo tuyo (nombre, foto) y se añade lo que no tenías
  const keep = state.profile;
  state.profile = { ...data.profile, ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))) };
  state.profile.wishlist = [...new Map([...(data.profile?.wishlist || []), ...(keep.wishlist || [])].map((w) => [w.url, w])).values()];
  saveProfile();
  state.items = await db.getAll('items'); state.outfits = await db.getAll('outfits'); state.diary = await db.getAll('diary');
  markDirty('looks'); markDirty('diary'); scheduleSync();
  return data.items?.length || 0;
}

// ---------- Enviar ----------
async function sendFlow(host) {
  host.innerHTML = '<p class="small muted center"><span class="spinner"></span> Preparando la conexión…</p>';
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = pc.createDataChannel('vestia', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  const code = await pack({ t: 'o', s: slim(pc.localDescription.sdp) });
  host.innerHTML = `<div class="qr-step"><b>1</b><span>En el otro móvil abre Vestia → Perfil → <b>Recibir armario</b> y escanea este código.</span></div>
    <div class="qr-box">${await qrSVG(code)}</div>
    <div class="qr-step"><b>2</b><span>Te mostrará otro código. Escanéalo tú con este móvil.</span></div>
    <button class="btn primary block" id="scanAnswer">${ICON.camera} Escanear su código</button>`;
  $('#scanAnswer', host).addEventListener('click', async () => {
    const text = await scanQR(host, 'Apunta al código que aparece en el otro móvil');
    if (!text) return;
    try {
      const ans = await unpack(text);
      if (ans.t !== 'a') throw new Error('Ese es tu propio código: escanea el del otro móvil');
      await pc.setRemoteDescription({ type: 'answer', sdp: ans.s });
    } catch (e) { host.innerHTML = `<p class="notice">${esc(e.message)}</p>`; return; }
    host.innerHTML = '<p class="center"><span class="spinner"></span> Conectando con el otro móvil…</p>';
  });
  // La confirmación del otro móvil puede llegar en cuanto termina de recibir: se escucha desde el principio
  let ack;
  const acked = new Promise((r) => (ack = r));
  dc.onmessage = ({ data }) => ack(data === 'ok');
  dc.onopen = async () => {
    const data = backupData();
    const n = Math.ceil(data.length / CHUNK);
    dc.bufferedAmountLowThreshold = 1 << 20;
    dc.send(JSON.stringify({ type: 'meta', n, size: data.length, items: state.items.length }));
    for (let i = 0; i < n; i++) {
      if (dc.bufferedAmount > 4 << 20) await new Promise((r) => (dc.onbufferedamountlow = r));
      dc.send(data.slice(i * CHUNK, (i + 1) * CHUNK));
      if (i % 20 === 0) host.innerHTML = `<p class="center">Enviando tu armario…</p><div class="meter big"><i style="width:${Math.round((i / n) * 100)}%"></i></div>`;
    }
    dc.send(JSON.stringify({ type: 'end' }));
    // Espera a que salga todo y a que el otro móvil confirme que lo ha guardado
    while (dc.bufferedAmount > 0 && dc.readyState === 'open') {
      host.innerHTML = '<p class="center"><span class="spinner"></span> Terminando de enviar…</p>';
      await new Promise((r) => setTimeout(r, 200));
    }
    host.innerHTML = '<p class="center"><span class="spinner"></span> El otro móvil está guardando tu armario…</p>';
    const ok = await Promise.race([acked, new Promise((r) => setTimeout(() => r(false), 60000))]);
    finished = true; // a partir de aquí, que el otro móvil cierre la conexión no es un error
    host.innerHTML = ok
      ? `<div class="qr-done">${ICON.check}<b>¡Enviado!</b><span>${state.items.length} prendas, ${state.outfits.length} looks y tu diario están en el otro móvil.</span></div>`
      : '<p class="notice">El otro móvil no confirmó la recepción. Comprueba allí si ha llegado tu armario.</p>';
    pc.close();
  };
  let finished = false;
  pc.onconnectionstatechange = () => { if (!finished && pc.connectionState === 'failed') host.innerHTML = '<p class="notice">No se pudieron conectar los móviles. Ponlos en la misma wifi e inténtalo otra vez, o envía el armario como archivo.</p>'; };
}

// ---------- Recibir ----------
async function receiveFlow(host) {
  const text = await scanQR(host, 'Apunta al código del otro móvil: el de «Enviar mi armario» o el de «Vincular otro móvil»');
  if (!text) return;
  // QR privado de la tarjeta Vestia: vincula este móvil al mismo servidor
  const ln = linkFromText(text);
  if (ln) {
    if (!confirm(linkQuestion(ln))) { host.innerHTML = '<p class="small muted center">Vinculación cancelada.</p>'; return; }
    host.innerHTML = '<p class="small muted center"><span class="spinner"></span> Vinculando con tu servidor…</p>';
    const r = await link(ln);
    host.innerHTML = `<div class="qr-done">${ICON.check}<b>¡Móvil vinculado!</b><span>${r?.down || 0} prendas recibidas. A partir de ahora los dos móviles se sincronizan solos.</span></div><button class="btn primary block" id="rxGo">Ver mi armario</button>`;
    $('#rxGo', host).addEventListener('click', () => { closeSheet(); go('closet'); });
    return;
  }
  let offer;
  try { offer = await unpack(text); if (offer.t !== 'o') throw new Error('Ese código es de respuesta: escanea el del móvil que envía'); }
  catch (e) { host.innerHTML = `<p class="notice">${esc(e.message)}</p>`; return; }
  host.innerHTML = '<p class="small muted center"><span class="spinner"></span> Preparando la respuesta…</p>';
  const pc = new RTCPeerConnection({ iceServers: ICE });
  await pc.setRemoteDescription({ type: 'offer', sdp: offer.s });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);
  const code = await pack({ t: 'a', s: slim(pc.localDescription.sdp) });
  host.innerHTML = `<div class="qr-step"><b>2</b><span>Escanea este código con el móvil que envía el armario.</span></div>
    <div class="qr-box">${await qrSVG(code)}</div>
    <p class="small muted center" id="rxState"><span class="spinner"></span> Esperando la conexión…</p>`;
  pc.ondatachannel = ({ channel }) => {
    let meta = null; const parts = [];
    channel.onmessage = async ({ data }) => {
      if (data[0] === '{' && /^\{"type":"(meta|end)"/.test(data)) {
        const m = JSON.parse(data);
        if (m.type === 'meta') { meta = m; host.innerHTML = `<p class="center">Recibiendo ${m.items} prendas…</p><div class="meter big"><i style="width:0%"></i></div>`; }
        if (m.type === 'end') {
          try {
            const n = await importData(JSON.parse(parts.join('')));
            done = true;
            channel.send('ok');
            host.innerHTML = `<div class="qr-done">${ICON.check}<b>¡Armario recibido!</b><span>${n} prendas añadidas a este móvil.</span></div><button class="btn primary block" id="rxGo">Ver mi armario</button>`;
            $('#rxGo', host).addEventListener('click', () => { closeSheet(); go('closet'); });
          } catch (e) { host.innerHTML = `<p class="notice">No se pudo importar: ${esc(e.message)}</p>`; channel.send('error'); }
          setTimeout(() => pc.close(), 1000);
        }
        return;
      }
      parts.push(data);
      if (meta && parts.length % 10 === 0) { const bar = host.querySelector('.meter i'); if (bar) bar.style.width = `${Math.round((parts.length / meta.n) * 100)}%`; }
    };
  };
  let done = false;
  pc.onconnectionstatechange = () => { if (!done && pc.connectionState === 'failed') host.innerHTML = '<p class="notice">No se pudieron conectar los móviles. Ponlos en la misma wifi e inténtalo otra vez.</p>'; };
}

// ---------- Como archivo (AirDrop, WhatsApp, Archivos…) ----------
async function sendFile() {
  const file = new File([backupData()], `armario-vestia-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Mi armario de Vestia' });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
  } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir el archivo'); }
}

export function openTransfer(mode = null) {
  const sheet = openSheet(`
    <p class="eyebrow accent">${ICON.qr} Sin cuentas</p>
    <h3 class="detail-title">Pasar tu armario a otro móvil</h3>
    <div id="xferBody">
      <div class="xfer-pick">
        <button class="xfer-opt" data-x="send">${ICON.share}<b>Enviar mi armario</b><span>Este móvil muestra un QR</span></button>
        <button class="xfer-opt" data-x="receive">${ICON.qr}<b>Recibir armario</b><span>Escanea el QR del otro móvil</span></button>
      </div>
      <p class="small muted">Los dos móviles se conectan directamente: tus fotos no pasan por ningún servidor. Funciona mejor con los dos en la misma wifi.</p>
      <button class="link-btn" id="xferFile">${ICON.share} O enviarlo como archivo (AirDrop, WhatsApp…)</button>
      ${isLinked() ? `<button class="link-btn" id="xferCard">${ICON.qr} Con tu servidor: vincula el otro móvil y quedarán sincronizados</button>` : ''}
    </div>`, () => stopScan());
  sheet.classList.add('sheet-tall');
  const host = $('#xferBody', sheet);
  const run = (x) => (x === 'send' ? sendFlow(host) : receiveFlow(host)).catch((e) => { host.innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
  sheet.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => run(b.dataset.x)));
  $('#xferFile', sheet).addEventListener('click', sendFile);
  $('#xferCard', sheet)?.addEventListener('click', () => import('./card.js').then((c) => c.openCard('link')));
  if (mode) run(mode);
}

