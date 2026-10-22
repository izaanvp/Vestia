// Cliente de los trabajadores de IA (ia-worker.js). Hay dos «carriles», cada uno con su trabajador:
//  · main: quitar el fondo y analizar la ropa;
//  · sam: el recorte con el dedo (separado: en la gráfica, compartir trabajador con otros modelos
//    estropea sus resultados).
// Si la gráfica del móvil falla con un modelo, ese trabajador se reinicia en el procesador y la
// operación se repite sola: nunca se pasa en silencio al recorte rápido.
// Se sube con cada cambio de ia-worker.js (si no, el navegador puede seguir usando el trabajador anterior)
const WORKER_VERSION = 6;
const lanes = {};
const laneOf = (op) => (op.startsWith('sam') ? 'sam' : 'main');

function start(name) {
  const L = lanes[name] ||= { cpu: false, seq: 0, pending: new Map() };
  L.worker = new Worker(new URL(`./ia-worker.js?v=${WORKER_VERSION}`, import.meta.url), { type: 'module' });
  L.worker.onmessage = ({ data }) => {
    const p = L.pending.get(data.id);
    if (!p) return;
    if (data.progress != null) { p.onProgress?.(data.progress, data.model); return; }
    L.pending.delete(data.id);
    if (data.error) p.reject(data.error); else p.resolve(data.result);
  };
  L.worker.onerror = () => { for (const [, p] of L.pending) p.reject({ message: 'El motor de IA se ha detenido', fatal: true }); L.pending.clear(); };
  L.ready = send(L, 'init', { cpu: L.cpu });
  return L;
}
function send(L, op, payload = {}, onProgress) {
  const id = ++L.seq;
  return new Promise((resolve, reject) => {
    L.pending.set(id, { resolve, reject, onProgress });
    L.worker.postMessage({ id, op, ...payload });
  });
}
const lane = (name) => (lanes[name]?.worker ? lanes[name] : start(name));
export const usingGPU = async (name = 'main') => (await lane(name).ready).gpu;

export async function run(op, payload = {}, { onProgress } = {}) {
  let L = lane(laneOf(op));
  await L.ready;
  try { return await send(L, op, payload, onProgress); }
  catch (e) {
    if (e?.fatal && !L.cpu) {
      // La gráfica ha fallado: el trabajador se reinicia en el procesador y se repite
      L.worker.terminate(); L.worker = null; L.cpu = true;
      L = start(laneOf(op)); await L.ready;
      return send(L, op, payload, onProgress).catch((e2) => { throw new Error(e2?.message || String(e2)); });
    }
    throw new Error(e?.message || String(e));
  }
}

// Píxeles de un lienzo (reducido a maxSide como mucho) para enviarlos al trabajador
export function pixels(canvas, maxSide = 1024) {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  let c = canvas;
  if (k < 1) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(canvas, 0, 0, c.width, c.height);
  }
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height, k };
}
