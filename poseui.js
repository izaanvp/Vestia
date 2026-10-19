// Tu propia pose: arrastra las manos y los pies del maniquí (los codos y las rodillas se doblan solos)
// o cópiala de una foto tuya de cuerpo entero.
import * as F from './fitting.js';
import { FIG, POSES, posedFig, mirror } from './wear.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON, pickFile, prepareImage } from './core.js';

const deg = (dx, dy, out) => (Math.atan2(dx * out, dy) * 180) / Math.PI;
// Ángulos de una cadena (hombro→codo→muñeca o cadera→rodilla→tobillo) en el formato de las poses
const anglesOf = (chain, out, legs = false) => {
  const [a, b, c] = chain;
  const up = deg(b.x - a.x, b.y - a.y, out), fore = deg(c.x - b.x, c.y - b.y, out);
  return legs ? { thigh: up, shin: fore } : { up, fore };
};
export function specOf(P) {
  return { armL: anglesOf(P.arm, -1), armR: anglesOf(P.armR || mirror(P.arm), 1), legL: anglesOf(P.leg, -1, true), legR: anglesOf(P.legR || mirror(P.leg), 1, true) };
}
const round = (s) => JSON.parse(JSON.stringify(s, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)));

// Dos huesos hacia un punto: devuelve los ángulos; el codo/rodilla elige el lado más parecido al actual
function reach(base, L1, L2, target, out, prevMid, legs) {
  let dx = target.x - base.x, dy = target.y - base.y;
  const d = Math.max(Math.abs(L1 - L2) + 1, Math.min(L1 + L2 - 0.5, Math.hypot(dx, dy)));
  const ang = Math.atan2(dy, dx), cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const cands = [ang + alpha, ang - alpha].map((t) => ({ x: base.x + Math.cos(t) * L1, y: base.y + Math.sin(t) * L1 }));
  const mid = prevMid ? cands.sort((p, q) => Math.hypot(p.x - prevMid.x, p.y - prevMid.y) - Math.hypot(q.x - prevMid.x, q.y - prevMid.y))[0] : cands[0];
  const end = { x: base.x + Math.cos(ang) * d, y: base.y + Math.sin(ang) * d };
  return anglesOf([base, mid, end], out, legs);
}

export function openPoseEditor(onDone = () => {}) {
  const p = state.profile;
  const body = F.bodyOf(p);
  const figure = body.figure;
  const base = FIG[figure] || FIG.neutro;
  const len = (c) => [Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y), Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)];
  const [aL1, aL2] = len(base.arm), [lL1, lL2] = len(base.leg);
  // Pose de partida: la tuya si ya tienes, si no la que esté puesta
  let spec = p.customPose ? { ...p.customPose } : specOf(posedFig(figure, body.pose === 'propia' ? 'relajada' : body.pose));
  const skin = p.skin?.hex || '#d4a37f';
  const sheet = openSheet(`
    <p class="eyebrow accent">${ICON.person} Tu pose</p>
    <h3 class="detail-title">Mueve a tu maniquí</h3>
    <p class="small muted" style="margin-top:-4px">Arrastra las manos y los pies (los puntos). Los codos y las rodillas se doblan solos.</p>
    <div class="pose-editor"><div id="peFig"></div><svg id="peHandles" viewBox="0 0 300 640" aria-hidden="true"></svg></div>
    <p class="section-label">Empezar desde</p>
    <div class="chips">${Object.entries(POSES).map(([k, v]) => `<button class="chip" data-from="${k}">${esc(v.label)}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost" id="peFromPhoto">${ICON.image} Copiar de una foto</button><button class="btn primary" id="peSave">${ICON.check} Usar esta pose</button></div>
    <p class="small muted" id="peStep"></p>`);
  sheet.classList.add('sheet-tall');
  const fig = $('#peFig', sheet), hs = $('#peHandles', sheet);
  const P = () => posedFig(figure, 'propia', spec);
  const draw = () => {
    const Q = P();
    fig.innerHTML = F.mannequinSVG({ skin, body: { ...body, pose: 'propia', customPose: spec }, worn: {} });
    const ends = [['armL', Q.arm[2]], ['armR', Q.armR[2]], ['legL', Q.leg[2]], ['legR', Q.legR[2]]];
    hs.innerHTML = ends.map(([k, q]) => `<circle data-h="${k}" cx="${q.x.toFixed(1)}" cy="${(k.startsWith('leg') ? q.y + 10 : q.y + 6).toFixed(1)}" r="13"/>`).join('');
  };
  draw();
  let drag = null;
  const pt = (e) => { const r = hs.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 640 }; };
  hs.addEventListener('pointerdown', (e) => {
    const k = e.target.dataset?.h; if (!k) return;
    drag = k; try { hs.setPointerCapture(e.pointerId); } catch { /* sin captura */ } e.preventDefault();
  });
  hs.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const t = pt(e), Q = P();
    if (drag === 'armL') spec.armL = reach(Q.arm[0], aL1, aL2, { x: t.x, y: t.y - 6 }, -1, Q.arm[1]);
    if (drag === 'armR') spec.armR = reach(Q.armR[0], aL1, aL2, { x: t.x, y: t.y - 6 }, 1, Q.armR[1]);
    if (drag === 'legL') spec.legL = reach(Q.leg[0], lL1, lL2, { x: t.x, y: Math.min(600, t.y - 10) }, -1, Q.leg[1], true);
    if (drag === 'legR') spec.legR = reach(Q.legR[0], lL1, lL2, { x: t.x, y: Math.min(600, t.y - 10) }, 1, Q.legR[1], true);
    draw(); e.preventDefault();
  });
  const end = () => { drag = null; };
  hs.addEventListener('pointerup', end); hs.addEventListener('pointercancel', end);
  $$('[data-from]', sheet).forEach((b) => b.addEventListener('click', () => { spec = specOf(posedFig(figure, b.dataset.from)); draw(); }));
  $('#peFromPhoto', sheet).addEventListener('click', async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const step = $('#peStep', sheet);
    step.innerHTML = '<span class="spinner"></span> Buscando tu postura…';
    try {
      const { canvas } = await prepareImage(f, 1400);
      const { bodyFromPhoto } = await import('./pose.js');
      const { P: ph } = await bodyFromPhoto(canvas, (t) => { step.innerHTML = `<span class="spinner"></span> ${esc(t)}`; });
      spec = specOf(ph);
      step.textContent = 'Pose copiada. Puedes retocarla arrastrando los puntos.';
      draw();
    } catch (e) { step.innerHTML = `<span class="notice small" style="display:block">${esc(e.message)}</span>`; }
  });
  $('#peSave', sheet).addEventListener('click', () => {
    p.customPose = round(spec); p.pose = 'propia'; saveProfile();
    toast('Pose guardada'); closeSheet(); onDone();
  });
}
