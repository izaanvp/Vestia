// Tu foto como probador: se guarda solo en el móvil (IndexedDB) junto con las medidas detectadas.
import * as db from './db.js';
import { state, $, esc, toast, openSheet, closeSheet, saveProfile, ICON, pickFile, prepareImage } from './core.js';
import { posedFig } from './wear.js';
import { bodyOf } from './fitting.js';

export async function loadBodyPhoto() {
  try { state.bodyPhoto = (await db.getAll('media')).find((m) => m.id === 'body') || null; } catch { state.bodyPhoto = null; }
}

// Cuerpo personalizado para realwear y mannequinSVG (o null si se usa el maniquí)
export function customBody() {
  const b = state.bodyPhoto;
  if (state.profile.bodySource !== 'photo' || !b) return null;
  return { key: `photo:${b.at}`, P: b.P, photo: { src: b.src, ...b.place, P: b.P } };
}

// Cuerpo que se viste: tu foto, o el maniquí con su pose (null = maniquí en pose relajada)
export function wearBody() {
  const photo = customBody();
  if (photo) return photo;
  const b = bodyOf(state.profile);
  if (!b.pose || b.pose === 'relajada' || (b.pose === 'propia' && !b.customPose)) return null;
  const key = b.pose === 'propia' ? `${b.figure}:propia:${JSON.stringify(b.customPose)}` : `${b.figure}:${b.pose}`;
  return { key, P: posedFig(b.figure, b.pose, b.customPose) };
}

export function openBodyPhoto(onDone) {
  const b = state.bodyPhoto;
  const sheet = openSheet(`
    <p class="eyebrow accent">${ICON.person} Probador con tu foto</p>
    <h3 class="detail-title">Pruébate tu ropa en tu foto</h3>
    ${b ? `<div class="bp-current"><img src="${b.src}" alt="Tu foto"><div><b>Tu foto está lista</b><p class="small muted">Vestia ya conoce tu postura y tus medidas.</p></div></div>` : ''}
    <ul class="bp-tips">
      <li><b>De cuerpo entero</b>, de la cabeza a los pies.</li>
      <li><b>De frente</b>, de pie, con los brazos un poco separados del cuerpo.</li>
      <li>Con <b>ropa ajustada</b> (mallas, camiseta) y un <b>fondo liso</b>.</li>
      <li>Pide a alguien que te la haga, usa el temporizador o hazla en un espejo.</li>
    </ul>
    <p class="small muted">Tu foto no sale de tu iPhone. La primera vez se descarga el detector de postura (~15 MB).</p>
    <div class="row" style="margin-top:10px">
      <button class="btn ghost" id="bpGallery">${ICON.image} Elegir foto</button>
      <button class="btn primary" id="bpCamera">${ICON.camera} Hacer foto</button>
    </div>
    ${b ? `<div class="row" style="margin-top:8px"><button class="btn danger" id="bpDel">Borrar mi foto</button><button class="btn navy" id="bpUse">Usar mi foto</button></div>` : ''}
    <p class="small" id="bpStep" style="margin-top:10px"></p>`);
  sheet.classList.add('sheet-tall');
  const step = (t) => { const el = $('#bpStep'); if (el) el.innerHTML = t; };
  const go = async (capture) => {
    const f = await pickFile('image/*', capture);
    if (!f) return;
    step('<span class="spinner"></span> Preparando…');
    try {
      const { canvas } = await prepareImage(f, 1400);
      const { bodyFromPhoto } = await import('./pose.js');
      const { P, place } = await bodyFromPhoto(canvas, (t) => step(`<span class="spinner"></span> ${esc(t)}`));
      const rec = { id: 'body', src: canvas.toDataURL('image/jpeg', 0.86), P, place, at: Date.now() };
      await db.put('media', rec);
      state.bodyPhoto = rec;
      state.profile.bodySource = 'photo'; saveProfile();
      toast('¡Listo! Ya puedes probarte tu ropa en tu foto');
      closeSheet(); onDone?.();
    } catch (e) {
      step(`<span class="notice small" style="display:block">${esc(e.message)}</span>`);
    }
  };
  $('#bpGallery', sheet).addEventListener('click', () => go(false));
  $('#bpCamera', sheet).addEventListener('click', () => go('environment'));
  $('#bpUse', sheet)?.addEventListener('click', () => { state.profile.bodySource = 'photo'; saveProfile(); closeSheet(); onDone?.(); });
  $('#bpDel', sheet)?.addEventListener('click', async () => {
    await db.remove('media', 'body'); state.bodyPhoto = null;
    state.profile.bodySource = 'mannequin'; saveProfile();
    toast('Foto borrada'); closeSheet(); onDone?.();
  });
}
