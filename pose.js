// Probador con tu propia foto: detecta tu postura (MediaPipe, en el móvil) y construye un «cuerpo»
// con tus medidas para que el motor de ajuste (realwear.js) te ponga tus prendas encima.
// La foto nunca sale del móvil. El modelo se descarga una vez (Google, ~6 MB) y el motor desde jsDelivr (~9 MB).

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let landmarker = null;

export async function loadPose(onProgress = () => {}) {
  if (landmarker) return landmarker;
  onProgress('Descargando el detector de postura…');
  const { FilesetResolver, PoseLandmarker } = await import(`${MP}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: true,
  });
  try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
  return landmarker;
}

const FRAME_W = 300, FRAME_H = 640;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Analiza la foto. Devuelve { P, place } o lanza un error con un consejo.
export async function bodyFromPhoto(canvas, onProgress = () => {}) {
  const lm = await loadPose(onProgress);
  onProgress('Buscando tu postura…');
  const res = lm.detect(canvas);
  const L = res.landmarks?.[0];
  if (!L) throw new Error('No encuentro a nadie en la foto. Haz una foto de cuerpo entero, de frente y con buena luz.');
  const W = canvas.width, H = canvas.height;
  const px = (i) => ({ x: L[i].x * W, y: L[i].y * H, v: L[i].visibility ?? 1 });
  const need = [11, 12, 23, 24, 25, 26, 27, 28];
  if (need.some((i) => px(i).v < 0.35 || L[i].y > 1.02 || L[i].y < -0.02)) throw new Error('Necesito verte entera/o: de la cabeza a los pies, de frente.');
  const sh = [px(11), px(12)], hp = [px(23), px(24)];
  const shW = dist(sh[0], sh[1]), hpW = dist(hp[0], hp[1]);
  // De frente, los hombros se ven anchos; de perfil casi se juntan
  if (shW < (dist(mid(sh[0], sh[1]), mid(hp[0], hp[1]))) * 0.42) throw new Error('Ponte de frente a la cámara, con los hombros rectos.');

  // Máscara de la persona (para medir anchos de verdad)
  let mask = null;
  try { const m = res.segmentationMasks?.[0]; if (m) { mask = { d: m.getAsFloat32Array(), w: m.width, h: m.height }; } } catch { mask = null; }
  res.segmentationMasks?.forEach((m) => m.close?.());
  const on = (x, y) => {
    if (!mask) return false;
    const mx = Math.round((x / W) * mask.w), my = Math.round((y / H) * mask.h);
    return mx >= 0 && my >= 0 && mx < mask.w && my < mask.h && mask.d[my * mask.w + mx] > 0.5;
  };
  // Altura: de la coronilla (máscara) a los talones
  const nose = px(0);
  let top = nose.y - (mid(sh[0], sh[1]).y - nose.y) * 0.95;
  if (mask) { for (let y = Math.max(0, Math.round(top - H * 0.08)); y < nose.y; y++) if (on(nose.x, y)) { top = y; break; } }
  const feet = Math.max(px(29).y, px(30).y, px(31).y, px(32).y, px(27).y + shW * 0.12);
  const cx0 = (mid(sh[0], sh[1]).x + mid(hp[0], hp[1]).x) / 2;
  const s = (FRAME_H - 20 - 26) / Math.max(1, feet - top);
  const f = (p) => ({ x: FRAME_W / 2 + (p.x - cx0) * s, y: 20 + (p.y - top) * s });
  const place = { x: FRAME_W / 2 - cx0 * s, y: 20 - top * s, w: W * s, h: H * s };

  // Ancho real de una parte del cuerpo midiendo la máscara en perpendicular a un segmento
  const across = (a, b, t, fallback) => {
    if (!mask) return fallback;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const len = dist(a, b) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    let l = 0, r = 0;
    const maxR = fallback * 3 / s;
    while (l < maxR && on(p.x + nx * l, p.y + ny * l)) l += 1;
    while (r < maxR && on(p.x - nx * r, p.y - ny * r)) r += 1;
    const w = ((l + r) / 2) * s;
    return w > fallback * 0.5 && w < fallback * 1.8 ? w : fallback;
  };
  const rowAt = (y, est) => {
    if (!mask) return est;
    const yy = top + (y - 20) / s;
    let l = 0, r = 0;
    const maxR = (est * 1.6) / s;
    while (l < maxR && on(cx0 - l, yy)) l++;
    while (r < maxR && on(cx0 + r, yy)) r++;
    const w = ((l + r) / 2) * s;
    // Los brazos pegados al cuerpo ensanchan la medida: solo se acepta si es razonable
    return w > est * 0.75 && w < est * 1.25 ? w : est;
  };

  const S = sh.map(f), Hh = hp.map(f);
  // Lado izquierdo de la pantalla primero (en una foto de frente es tu lado derecho)
  const leftFirst = S[0].x < S[1].x;
  const side = (i0, i1) => (leftFirst ? [i0, i1] : [i1, i0]);
  const [aL, aR] = side(11, 12), [eL, eR] = side(13, 14), [wL, wR] = side(15, 16);
  const [hL, hR] = side(23, 24), [kL, kR] = side(25, 26), [nL, nR] = side(27, 28), [heL, heR] = side(29, 30), [toeL, toeR] = side(31, 32);
  const shHalf = (shW * s) / 2, hipHalf = (hpW * s) / 2;
  const shoulderY = (S[0].y + S[1].y) / 2 - shHalf * 0.12;
  const hipY = (Hh[0].y + Hh[1].y) / 2;
  const kneeY = (f(px(25)).y + f(px(26)).y) / 2;
  const crotchY = hipY + (kneeY - hipY) * 0.2;
  const waistY = shoulderY + (hipY - shoulderY) * 0.66;
  const chestY = shoulderY + (hipY - shoulderY) * 0.28;
  // En una foto el hombro visible llega más allá de la articulación (el deltoides)
  const armR0 = [shHalf * 0.22, shHalf * 0.17, shHalf * 0.13];
  const rows = [
    [shoulderY, shHalf + armR0[0] * 0.55],
    [chestY, rowAt(chestY, shHalf * 0.9)],
    [waistY, rowAt(waistY, Math.max(hipHalf * 1.25, shHalf * 0.72))],
    [hipY, rowAt(hipY, hipHalf * 1.6)],
    [crotchY, rowAt(crotchY, hipHalf * 1.55)],
  ];
  const chain = (ids, radii) => ids.map((i, k) => { const p = f(px(i)); return { x: p.x, y: p.y, r: radii[k] }; });
  const arm = (a, e, w) => {
    const pa = px(a), pe = px(e), pw = px(w);
    return chain([a, e, w], [across(pa, pe, 0.35, armR0[0]), across(pe, pw, 0.15, armR0[1]), across(pe, pw, 0.85, armR0[2])]);
  };
  const legR0 = [hipHalf * 0.75, hipHalf * 0.46, hipHalf * 0.3];
  const leg = (h, k, n) => {
    const ph = px(h), pk = px(k), pn = px(n);
    return chain([h, k, n], [across(ph, pk, 0.3, legR0[0]), across(pk, pn, 0.05, legR0[1]), across(pk, pn, 0.92, legR0[2])]);
  };
  const earL = f(px(7)), earR = f(px(8)), eyes = mid(f(px(2)), f(px(5))), nf = f(nose);
  const headRx = Math.max(14, Math.abs(earL.x - earR.x) / 2 * 1.05);
  const P = {
    head: [nf.x, eyes.y + headRx * 0.1, headRx, headRx * 1.28],
    neck: { hw: shHalf * 0.24, y0: eyes.y + headRx, y1: shoulderY },
    shoulderY, shoulder: shHalf + armR0[0] * 0.7, rows, waistY, hipY, crotchY,
    arm: arm(aL, eL, wL), armR: arm(aR, eR, wR),
    leg: leg(hL, kL, nL), legR: leg(hR, kR, nR),
    // Planta del pie y largo del pie (talón → punta) para el calzado
    sole: [[heL, toeL], [heR, toeR]].map(([h, t]) => Math.max(f(px(h)).y, f(px(t)).y) + 2),
    footLen: [[heL, toeL], [heR, toeR]].map(([h, t]) => Math.max(18, dist(f(px(h)), f(px(t))) * 1.25)),
    photo: { top: [0, 0, 0, 0], outer: [0, 0, 0, 0], one: [0, 0, 0, 0] },
  };
  return { P, place };
}
