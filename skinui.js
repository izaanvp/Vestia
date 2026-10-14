// Hoja para medir el tono de piel: cámara en directo, foto subida o selección manual.
import * as S from './skin.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON, prepareImage, pickFile } from './core.js';

export function openSkinSheet(onDone = () => {}) {
  let result = state.profile.skin?.hex || null;
  let source = state.profile.skin?.source || null;
  let photo = null; // canvas

  const sheet = openSheet(`
    <h3>Tu tono de piel</h3>
    <p class="muted small" style="margin:-6px 0 14px">Con luz natural, de frente a una ventana, sin maquillaje ni filtros. La imagen se analiza en tu iPhone y no se guarda ni se envía.</p>
    <div class="seg" style="margin-bottom:12px">
      <button data-mode="camera" class="on">${ICON.camera} Cámara</button>
      <button data-mode="photo">${ICON.image} Subir foto</button>
      <button data-mode="manual">${ICON.palette} Elegir</button>
    </div>
    <div id="skinBody"></div>
    <div class="skin-result" id="skinResult" ${result ? '' : 'hidden'}>
      <span class="skin-swatch" id="skinSwatch" style="background:${result || '#fff'}"></span>
      <div><b id="skinTitle">${result ? esc(S.describe(result).text) : ''}</b><p class="small muted" id="skinNote" style="margin:2px 0 0">${source ? `Medido con ${source}` : ''}</p></div>
    </div>
    <button class="btn primary block" id="skinSave" ${result ? '' : 'disabled'}>Usar este tono</button>
  `, () => S.stopCamera());

  const setResult = (hex, src, note = '') => {
    result = hex; source = src;
    $('#skinResult').hidden = false;
    $('#skinSwatch').style.background = hex;
    $('#skinTitle').textContent = S.describe(hex).text;
    $('#skinNote').textContent = note || `Medido con ${src}`;
    $('#skinSave').disabled = false;
  };

  const measure = (canvas, cx, cy, rx, ry, src) => {
    const r = S.sampleSkin(canvas, cx, cy, rx, ry);
    if (!r) { toast('No encuentro piel en esa zona. Prueba con más luz o toca tu mejilla.'); return false; }
    const note = r.brightness < 70 ? 'Poca luz: el tono puede salir más oscuro de lo real.' : r.brightness > 225 ? 'Demasiada luz: el tono puede salir más claro.' : `Medido con ${src} (${r.coverage} puntos de piel)`;
    setResult(r.hex, src, note);
    return true;
  };

  const drawPhoto = (canvas, mark) => {
    const cv = $('#photoCanvas');
    if (!cv) return;
    cv.width = canvas.width; cv.height = canvas.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    if (mark) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, canvas.width / 150);
      ctx.beginPath(); ctx.ellipse(mark[0], mark[1], mark[2], mark[3], 0, 0, Math.PI * 2); ctx.stroke();
    }
  };

  const photoUI = (canvas, src) => {
    photo = canvas;
    $('#skinBody').innerHTML = `<div class="photo-wrap"><canvas id="photoCanvas"></canvas></div><p class="small muted center" style="margin:8px 0 12px">Toca tu mejilla o tu frente para medir en ese punto.</p>`;
    // Medición automática en la zona central de la cara
    const cx = canvas.width / 2, cy = canvas.height * 0.48, rx = canvas.width * 0.2, ry = canvas.height * 0.22;
    measure(canvas, cx, cy, rx, ry, src);
    drawPhoto(canvas, [cx, cy, rx, ry]);
    $('#photoCanvas').addEventListener('click', (e) => {
      const cv = e.currentTarget, r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
      const R = cv.width / 18;
      if (measure(photo, x, y, R, R, src)) drawPhoto(photo, [x, y, R, R]);
    });
  };

  const modes = {
    camera: async () => {
      $('#skinBody').innerHTML = `
        <div class="cam-wrap"><video id="camVideo" autoplay playsinline muted></video><div class="cam-guide"><span></span></div>
        <p class="cam-hint">Coloca tu cara dentro del óvalo</p></div>
        <button class="btn navy block" id="camShot" style="margin-top:10px">${ICON.camera} Hacer foto y medir</button>`;
      try {
        await S.startCamera($('#camVideo'));
      } catch (e) {
        $('#skinBody').innerHTML = `<div class="notice">${esc(e.message)}</div>
          <button class="btn ghost block" id="camFallback" style="margin-top:10px">${ICON.camera} Abrir la cámara del sistema</button>`;
        $('#camFallback').addEventListener('click', async () => {
          const f = await pickFile('image/*', true);
          if (f) photoUI((await prepareImage(f, 900)).canvas, 'la cámara');
        });
        return;
      }
      $('#camShot').addEventListener('click', () => {
        const video = $('#camVideo');
        const frame = S.captureFrame(video);
        S.stopCamera();
        photoUI(frame, 'la cámara');
      });
    },
    photo: async () => {
      S.stopCamera();
      $('#skinBody').innerHTML = `<button class="dropzone" id="pickPhoto">${ICON.image}<b>Elegir una foto</b><span class="small muted">Un selfie reciente con luz natural</span></button>`;
      $('#pickPhoto').addEventListener('click', async () => {
        const f = await pickFile('image/*');
        if (f) photoUI((await prepareImage(f, 900)).canvas, 'una foto');
      });
    },
    manual: () => {
      S.stopCamera();
      $('#skinBody').innerHTML = `<p class="small muted" style="margin:0 0 10px">Elige el tono más parecido al de tu mejilla:</p>
        <div class="skin-presets">${S.SKIN_PRESETS.map((h) => `<button data-preset="${h}" style="background:${h}" class="${result === h ? 'on' : ''}"></button>`).join('')}</div>`;
      $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
        $$('[data-preset]').forEach((x) => x.classList.toggle('on', x === b));
        setResult(b.dataset.preset, 'selección manual', 'Elegido a mano');
      }));
    },
  };
  $$('[data-mode]', sheet).forEach((b) => b.addEventListener('click', () => {
    $$('[data-mode]', sheet).forEach((x) => x.classList.toggle('on', x === b));
    modes[b.dataset.mode]();
  }));
  modes.camera();

  $('#skinSave').addEventListener('click', () => {
    state.profile.skin = { hex: result, source, date: Date.now() };
    saveProfile();
    closeSheet();
    toast(`Tono guardado: ${S.describe(result).text}`);
    onDone(result);
  });
}
