// Compartir un look como imagen: escaparate de Vestia con tu maniquí vestido, las prendas y la armonía.
import * as F from './fitting.js';
import { renderReal } from './realwear.js';
import { state, $, esc, toast, openSheet, label, slotOf, ICON } from './core.js';
import { wearBody } from './photobody.js';

const W = 1080, H = 1350;
const loadImg = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });

// El maniquí del usuario (o su foto, si la usa) con las prendas puestas, como SVG
export async function dressedSVG(items, { body = F.bodyOf(state.profile), custom = wearBody() } = {}) {
  const worn = {};
  await Promise.all(items.map(async (it) => {
    const slot = slotOf(it.type);
    const src = await F.trim(it);
    worn[slot] = { item: it, src, real: await renderReal(it, slot, body.figure, src, custom), fabric: await F.fabric(it, slot) };
  }));
  if (worn.one) { delete worn.top; delete worn.bottom; }
  return F.mannequinSVG({ skin: state.profile.skin?.hex || '#d4a37f', body, worn, mode: 'real', photo: custom?.photo });
}

async function svgToImage(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try { return await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#19b5ad';

// Dibuja la tarjeta del look. opts: { title, subtitle, score (0-1), svg }
export async function lookCard(items, { title = 'Mi look', subtitle = '', score = null, svg = null } = {}) {
  await Promise.all(['600 80px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"', '600 30px Inter', '500 26px Inter'].map((f) => document.fonts?.load(f).catch(() => {})));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const A = accent();
  // Fondo de escaparate
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#eef6f6');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // Toldo a rayas con festón (el sello de Vestia)
  const awn = 92;
  for (let x = 0, i = 0; x < W; x += 54, i++) { g.fillStyle = i % 2 ? '#ffffff' : A; g.fillRect(x, 0, 54, awn); }
  g.fillStyle = '#ffffff';
  for (let x = 0, i = 0; x < W; x += 54, i++) { g.fillStyle = i % 2 ? '#ffffff' : A; g.beginPath(); g.arc(x + 27, awn, 27, 0, Math.PI); g.fill(); }
  g.fillStyle = 'rgba(10,24,51,.08)'; g.fillRect(0, awn - 6, W, 6);
  // Pespunte alrededor del escaparate
  g.setLineDash([14, 10]); g.lineWidth = 3; g.strokeStyle = `${A}66`;
  rr(g, 28, 150, W - 56, H - 178, 46); g.stroke(); g.setLineDash([]);
  // Foco de luz detrás del maniquí
  const spot = g.createRadialGradient(330, 520, 40, 330, 620, 520);
  spot.addColorStop(0, `${A}38`); spot.addColorStop(1, `${A}00`);
  g.fillStyle = spot; g.fillRect(0, 100, W, H - 100);
  // Maniquí vestido
  const mannequin = await svgToImage(svg || await dressedSVG(items));
  const mh = 1060, mw = (mh * 300) / 640;
  g.drawImage(mannequin, 330 - mw / 2, 196, mw, mh);
  // Título
  g.fillStyle = '#0a1833'; g.textBaseline = 'alphabetic';
  g.font = '600 74px "Cormorant Garamond", Georgia, serif';
  g.fillText(title, 620, 266, 420);
  if (subtitle) { g.font = 'italic 500 38px "Cormorant Garamond", Georgia, serif'; g.fillStyle = '#5b6573'; g.fillText(subtitle, 622, 316, 420); }
  // Prendas
  let y = 360;
  const list = items.slice(0, 6);
  const ch = Math.min(122, (850 - 30 * list.length) / Math.max(1, list.length) + 8);
  for (const it of list) {
    g.fillStyle = '#ffffff'; g.shadowColor = 'rgba(10,24,51,.12)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
    rr(g, 610, y, 420, ch, 26); g.fill(); g.shadowColor = 'transparent';
    try {
      const im = await loadImg(await F.trim(it));
      const s = Math.min((ch - 20) / im.height, 110 / im.width);
      g.drawImage(im, 620 + (110 - im.width * s) / 2, y + (ch - im.height * s) / 2, im.width * s, im.height * s);
    } catch { /* sin foto */ }
    g.fillStyle = '#0a1833'; g.font = '600 27px Inter, sans-serif';
    g.fillText(label(it), 744, y + ch / 2 - 4, 272);
    g.fillStyle = it.hex || '#999'; g.beginPath(); g.arc(754, y + ch / 2 + 26, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b7380'; g.font = '500 23px Inter, sans-serif';
    g.fillText(`${it.color || ''}${it.brand ? ` · ${it.brand}` : ''}`, 772, y + ch / 2 + 34, 244);
    y += ch + 22;
  }
  // Paleta del look: un botón de color por prenda
  const sw = [...new Map(items.map((it) => [it.hex, it])).values()].slice(0, 7);
  g.fillStyle = '#6b7380'; g.font = '600 20px Inter, sans-serif'; g.fillText('PALETA DEL LOOK', 612, y + 26);
  sw.forEach((it, i) => {
    const cx = 640 + i * 58, cy = y + 74;
    g.fillStyle = it.hex || '#999'; g.beginPath(); g.arc(cx, cy, 24, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 17, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { g.beginPath(); g.arc(cx + dx, cy + dy, 2.6, 0, Math.PI * 2); g.fill(); }
  });
  // Armonía como cinta métrica
  if (score != null) {
    const pct = Math.round(Math.min(1, score) * 100);
    const ty = H - 240;
    g.fillStyle = '#0a1833'; g.font = '600 26px Inter, sans-serif'; g.fillText(`Armonía ${pct}%`, 612, ty - 18);
    g.fillStyle = '#f3d77a'; rr(g, 610, ty, 420, 40, 8); g.fill();
    g.fillStyle = A; rr(g, 610, ty, 420 * (pct / 100), 40, 8); g.fill();
    g.strokeStyle = 'rgba(10,24,51,.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 42; i++) { const x = 612 + i * 10; g.beginPath(); g.moveTo(x, ty); g.lineTo(x, ty + (i % 5 ? 10 : 18)); g.stroke(); }
  }
  // Firma
  g.fillStyle = '#0a1833'; rr(g, 610, H - 150, 420, 84, 42); g.fill();
  g.strokeStyle = A; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(660, H - 120); g.arc(664, H - 124, 6, Math.PI * 0.9, Math.PI * 2.4); g.moveTo(664, H - 117); g.lineTo(638, H - 96); g.lineTo(690, H - 96); g.closePath(); g.stroke();
  g.fillStyle = '#ffffff'; g.font = '600 44px "Cormorant Garamond", Georgia, serif'; g.fillText('Vestia', 708, H - 94);
  g.fillStyle = A; g.font = '600 20px Inter, sans-serif'; g.fillText('✦ VISTELO AI', 860, H - 100);
  return c;
}

// Hoja con la imagen lista para compartir o guardar
export async function shareLook(items, opts = {}) {
  if (!items.length) return toast('Ponle alguna prenda al maniquí');
  const sheet = openSheet(`<h3>${ICON.share} Compartir look</h3><div class="share-preview" id="sharePrev"><span class="spinner"></span><p class="small muted">Preparando tu escaparate…</p></div>`);
  sheet.classList.add('sheet-tall');
  let canvas;
  try { canvas = await lookCard(items, opts); } catch (e) { $('#sharePrev').innerHTML = `<p class="notice">No se pudo crear la imagen: ${esc(e.message)}</p>`; return; }
  if (!$('#sharePrev')) return;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `vestia-look-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  $('#sharePrev').innerHTML = `<img src="${url}" alt="Tu look" class="share-img">
    <div class="row" style="margin-top:12px">
      <a class="btn ghost" href="${url}" download="${file.name}">Guardar imagen</a>
      <button class="btn primary" id="shareGo">${ICON.share} Compartir</button>
    </div>
    <p class="small muted center" style="margin:8px 0 0">En el iPhone también puedes mantener pulsada la imagen para guardarla en Fotos.</p>`;
  $('#shareGo').addEventListener('click', async () => {
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: opts.title || 'Mi look', text: 'Mi look de Vestia ✦' });
      else { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); toast('Imagen guardada'); }
    } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir'); }
  });
}
