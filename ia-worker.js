// Trabajador de IA de Vestia: ejecuta los modelos fuera de la pantalla principal (la app no se congela
// mientras recorta) y, si la gráfica del móvil falla con un modelo, ia.js lo reinicia en el procesador.
// Modelos (se descargan una vez y quedan en la caché del navegador):
//  · matte: RMBG-1.4 (BRIA) — separa la prenda del fondo.
//  · parser: SegFormer B2 de ropa — qué píxeles son camiseta, pantalón, piel, pelo…
//  · sam: SlimSAM (SAM de Meta reducido) — recorta exactamente lo que señalas con el dedo.
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
let T = null, gpu = false;
const M = {};
const sam = new Map(); // embeddings por foto

const reply = (id, result, error = null, transfer = []) => self.postMessage({ id, result, error }, transfer);

const CONF = {
  matte: () => ({
    id: 'briaai/RMBG-1.4', cls: 'AutoModel',
    opts: { config: { model_type: 'custom' }, ...(gpu ? { device: 'webgpu', dtype: 'fp16' } : { dtype: 'q8' }) },
    proc: { config: { do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5], feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2, rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 } } },
  }),
  // En la gráfica falla al analizar: siempre en el procesador
  parser: () => ({ id: 'Xenova/segformer_b2_clothes', cls: 'AutoModelForSemanticSegmentation', opts: { dtype: 'q8' } }),
  // SlimSAM (SAM de Meta reducido): en la gráfica en fp32 (~40 MB); SAM 2 da resultados erróneos en la gráfica
  sam: () => ({
    id: 'Xenova/slimsam-77-uniform', cls: 'SamModel',
    opts: gpu ? { device: 'webgpu', dtype: 'fp32' } : { dtype: 'q8' },
  }),
};

async function get(name, id) {
  if (M[name]) return M[name];
  const c = CONF[name]();
  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = p.loaded / p.total;
      const v = Object.values(files);
      self.postMessage({ id, progress: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), model: name });
    }
  };
  const model = await T[c.cls].from_pretrained(c.id, { ...c.opts, progress_callback });
  const processor = await T.AutoProcessor.from_pretrained(c.id, c.proc || {});
  M[name] = { model, processor };
  return M[name];
}
const imageOf = ({ data, width, height }) => new T.RawImage(new Uint8ClampedArray(data), width, height, 4).rgb();

self.onmessage = async ({ data: msg }) => {
  const { id, op } = msg;
  try {
    if (op === 'init') {
      T = await import(LIB);
      T.env.allowLocalModels = false;
      gpu = !msg.cpu && !!self.navigator?.gpu;
      return reply(id, { gpu });
    }
    if (op === 'load') { await get(msg.model, id); return reply(id, true); }
    if (op === 'matte') {
      const { model, processor } = await get('matte', id);
      const { pixel_values } = await processor(imageOf(msg.image));
      const { output } = await model({ input: pixel_values });
      const t = output[0], [, h, w] = t.dims;
      const out = Float32Array.from(t.data);
      return reply(id, { w, h, data: out }, null, [out.buffer]);
    }
    if (op === 'parse') {
      const { model, processor } = await get('parser', id);
      const inputs = await processor(imageOf(msg.image));
      const { logits } = await model(inputs);
      const [, K, h, w] = logits.dims;
      const L = Float32Array.from(logits.data), prob = new Float32Array(K * h * w);
      for (let i = 0; i < h * w; i++) {
        let m = -Infinity; for (let k = 0; k < K; k++) m = Math.max(m, L[k * h * w + i]);
        let s = 0; for (let k = 0; k < K; k++) { const e = Math.exp(L[k * h * w + i] - m); prob[k * h * w + i] = e; s += e; }
        for (let k = 0; k < K; k++) prob[k * h * w + i] /= s;
      }
      return reply(id, { K, w, h, prob }, null, [prob.buffer]);
    }
    if (op === 'samEncode') {
      const { model, processor } = await get('sam', id);
      const image = imageOf(msg.image);
      const inputs = await processor(image, { input_points: [[[image.width / 2, image.height / 2]]], input_labels: [[1]] });
      const raw = await model.get_image_embeddings(inputs);
      // Copia en memoria normal (no en la gráfica): entre un trazo y otro no se puede estropear
      const emb = {};
      for (const [k, t] of Object.entries(raw)) emb[k] = new T.Tensor(t.type, t.data.slice ? t.data.slice() : Float32Array.from(t.data), t.dims);
      sam.clear();
      sam.set(msg.key, { emb, W: image.width, H: image.height, rs: Array.from(inputs.reshaped_input_sizes[0] || inputs.reshaped_input_sizes) });
      return reply(id, true);
    }
    if (op === 'samDecode') {
      const { model } = await get('sam', id);
      const e = sam.get(msg.key);
      if (!e) throw new Error('sin-embedding');
      // Puntos en coordenadas del modelo (lado largo = 1024). Etiquetas: 1 dentro, 0 fuera
      const k = 1024 / Math.max(e.W, e.H), n = msg.points.length;
      const pts = new Float32Array(n * 2), lab = new BigInt64Array(n);
      msg.points.forEach(([x, y], i) => { pts[i * 2] = x * k; pts[i * 2 + 1] = y * k; lab[i] = BigInt(msg.labels[i]); });
      const out = await model({
        ...e.emb,
        input_points: new T.Tensor('float32', pts, [1, 1, n, 2]),
        input_labels: new T.Tensor('int64', lab, [1, 1, n]),
      });
      const [, , nm, h, w] = out.pred_masks.dims;
      const masks = Float32Array.from(out.pred_masks.data);
      return reply(id, { n: nm, w, h, masks, scores: Array.from(out.iou_scores.data), scale: k }, null, [masks.buffer]);
    }
    throw new Error(`op desconocida: ${op}`);
  } catch (err) {
    // Los fallos internos del motor llegan como números: el trabajador queda inservible
    const fatal = typeof err === 'number' || /^\d+$/.test(String(err?.message ?? err));
    reply(id, null, { message: String(err?.message ?? err), fatal });
  }
};
