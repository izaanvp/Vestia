// Visión de Vistelo AI: modelo MobileCLIP que se ejecuta dentro del navegador (sin servidores de IA).
// Se descarga una sola vez (~23 MB) y queda guardado en la caché del dispositivo.
// Las descripciones de texto vienen precalculadas en vision-text.json, así no hace falta el modelo de texto.

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/mobileclip_s0';
const EMB_KEY = 'vestia.vision.text.v1';
// La versión q8 del modelo de visión da resultados erróneos; fp16 es igual de precisa que fp32 y pesa la mitad.
const VISION_DTYPE = 'fp16';
export const LABELS = () => [...GARMENTS.map((g) => g[0]), ...PATTERNS.map((p) => p[0]), ...STYLES.map((s) => s[0]), ...MATERIALS.map((m) => m[0])];

// [descripción en inglés para el modelo, tipo de Vestia, nombre en español]
export const GARMENTS = [
  ['a plain t-shirt', 'Camiseta', 'Camiseta'],
  ['a graphic t-shirt with a print', 'Camiseta', 'Camiseta estampada'],
  ['a polo shirt', 'Camiseta', 'Polo'],
  ['a tank top', 'Top', 'Camiseta de tirantes'],
  ['a crop top', 'Top', 'Crop top'],
  ['a corset top', 'Top', 'Top corsé'],
  ['a bodysuit', 'Top', 'Body'],
  ['a blouse', 'Camisa', 'Blusa'],
  ['a button-up shirt', 'Camisa', 'Camisa'],
  ['a flannel shirt', 'Camisa', 'Camisa de franela'],
  ['a knit sweater', 'Jersey', 'Jersey de punto'],
  ['a turtleneck sweater', 'Jersey', 'Jersey de cuello alto'],
  ['a cardigan', 'Chaqueta', 'Cárdigan'],
  ['a hoodie', 'Sudadera', 'Sudadera con capucha'],
  ['a crewneck sweatshirt', 'Sudadera', 'Sudadera'],
  ['a blazer', 'Americana', 'Americana'],
  ['a denim jacket', 'Chaqueta', 'Cazadora vaquera'],
  ['a leather jacket', 'Chaqueta', 'Chaqueta de cuero'],
  ['a bomber jacket', 'Chaqueta', 'Bomber'],
  ['a vest gilet', 'Chaqueta', 'Chaleco'],
  ['a puffer jacket', 'Abrigo', 'Plumífero'],
  ['a trench coat', 'Abrigo', 'Gabardina'],
  ['a long wool coat', 'Abrigo', 'Abrigo de paño'],
  ['a pair of jeans', 'Vaqueros', 'Vaqueros'],
  ['wide leg trousers', 'Pantalón', 'Pantalón ancho'],
  ['tailored dress pants', 'Pantalón', 'Pantalón de vestir'],
  ['cargo pants', 'Pantalón', 'Pantalón cargo'],
  ['sweatpants joggers', 'Pantalón', 'Jogger'],
  ['leggings', 'Pantalón', 'Leggings'],
  ['shorts', 'Shorts', 'Shorts'],
  ['denim shorts', 'Shorts', 'Shorts vaqueros'],
  ['a mini skirt', 'Falda', 'Minifalda'],
  ['a pleated midi skirt', 'Falda', 'Falda plisada'],
  ['a long maxi skirt', 'Falda', 'Falda larga'],
  ['a denim skirt', 'Falda', 'Falda vaquera'],
  ['a short mini dress', 'Vestido', 'Vestido corto'],
  ['a long maxi dress', 'Vestido', 'Vestido largo'],
  ['a satin slip dress', 'Vestido', 'Vestido lencero'],
  ['an elegant evening gown', 'Vestido', 'Vestido de fiesta'],
  ['a shirt dress', 'Vestido', 'Vestido camisero'],
  ['a jumpsuit', 'Mono', 'Mono'],
  ['overalls dungarees', 'Mono', 'Peto'],
  ['a swimsuit', 'Top', 'Bañador'],
  ['a bikini', 'Top', 'Bikini'],
  ['sneakers', 'Zapatillas', 'Zapatillas'],
  ['running shoes', 'Zapatillas', 'Zapatillas de running'],
  ['high heels', 'Zapatos', 'Zapatos de tacón'],
  ['loafers', 'Zapatos', 'Mocasines'],
  ['ballet flats', 'Zapatos', 'Bailarinas'],
  ['oxford dress shoes', 'Zapatos', 'Zapatos de vestir'],
  ['ankle boots', 'Botas', 'Botines'],
  ['knee high boots', 'Botas', 'Botas altas'],
  ['cowboy boots', 'Botas', 'Botas camperas'],
  ['sandals', 'Sandalias', 'Sandalias'],
  ['flip flops', 'Sandalias', 'Chanclas'],
  ['a handbag', 'Bolso', 'Bolso'],
  ['a tote bag', 'Bolso', 'Bolso tote'],
  ['a backpack', 'Bolso', 'Mochila'],
  ['a small clutch bag', 'Bolso', 'Clutch'],
  ['a baseball cap', 'Accesorio', 'Gorra'],
  ['a beanie hat', 'Accesorio', 'Gorro'],
  ['a wide brim hat', 'Accesorio', 'Sombrero'],
  ['a scarf', 'Accesorio', 'Bufanda'],
  ['a leather belt', 'Accesorio', 'Cinturón'],
  ['sunglasses', 'Accesorio', 'Gafas de sol'],
  ['a necklace jewelry', 'Accesorio', 'Collar'],
  ['a wristwatch', 'Accesorio', 'Reloj'],
];
export const PATTERNS = [
  ['a solid plain color garment', 'Liso'],
  ['a striped garment', 'Rayas'],
  ['a plaid checked garment', 'Cuadros'],
  ['a floral print garment', 'Floral'],
  ['a polka dot garment', 'Lunares'],
  ['an animal print leopard garment', 'Animal print'],
  ['a garment with a graphic logo print', 'Estampado gráfico'],
  ['a camouflage garment', 'Camuflaje'],
  ['a cable knit textured garment', 'Punto texturizado'],
  ['a sequin sparkly garment', 'Lentejuelas'],
];
export const MATERIALS = [
  ['denim fabric', 'Denim'],
  ['chunky knitted wool', 'Punto de lana'],
  ['smooth leather', 'Piel'],
  ['suede', 'Ante'],
  ['cotton jersey fabric', 'Algodón'],
  ['linen fabric', 'Lino'],
  ['shiny silk satin', 'Satén'],
  ['technical sports fabric', 'Tejido técnico'],
  ['corduroy fabric', 'Pana'],
  ['tweed wool fabric', 'Tweed'],
  ['lace fabric', 'Encaje'],
  ['puffy quilted nylon', 'Nailon acolchado'],
];
export const STYLES = [
  ['casual everyday clothing', 'Casual'],
  ['formal elegant clothing', 'Formal'],
  ['sporty athletic clothing', 'Deportivo'],
  ['party evening clothing', 'Fiesta'],
  ['streetwear clothing', 'Streetwear'],
];

let loading = null;
let T = null; // librería
let vision = null, processor = null, textEmb = null;

export const isReady = () => !!(vision && textEmb);

const normalize = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function softmax(arr) { const m = Math.max(...arr); const e = arr.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); }

// Carga el modelo. onProgress(0..1, texto)
export function load(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    onProgress(0.02, 'Preparando Vistelo AI…');
    T = await import(LIB);
    T.env.allowLocalModels = false;
    const files = {};
    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = p.loaded / p.total;
        const vals = Object.values(files);
        onProgress(0.05 + 0.9 * (vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 2)), 'Descargando el modelo de visión…');
      }
    };
    processor = await T.AutoProcessor.from_pretrained(MODEL);
    vision = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: VISION_DTYPE, progress_callback });

    const labels = LABELS();
    try {
      const pre = await (await fetch(new URL('./vision-text.json', import.meta.url))).json();
      if (pre.labels?.join('|') === labels.join('|')) textEmb = pre.embeddings;
    } catch { /* se calcula abajo */ }
    if (!textEmb) {
      try { textEmb = JSON.parse(localStorage.getItem(EMB_KEY) || 'null'); } catch { textEmb = null; }
      if (!textEmb || textEmb.length !== labels.length) {
        onProgress(0.9, 'Aprendiendo los tipos de prenda…');
        textEmb = await embedTexts(labels, progress_callback);
        try { localStorage.setItem(EMB_KEY, JSON.stringify(textEmb)); } catch { /* sin espacio */ }
      }
    }
    onProgress(1, 'Vistelo AI lista');
    return true;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// Calcula las descripciones de texto con el modelo de texto (solo si falta vision-text.json).
export async function embedTexts(labels, progress_callback) {
  T ||= await import(LIB);
  const tokenizer = await T.AutoTokenizer.from_pretrained(MODEL);
  const textModel = await T.CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8', progress_callback });
  const inputs = tokenizer(labels.map((l) => `a product photo of ${l}`), { padding: 'max_length', truncation: true });
  const { text_embeds } = await textModel(inputs);
  await textModel.dispose?.();
  return text_embeds.tolist().map((v) => normalize(v).map((x) => +x.toFixed(4)));
}

// Analiza una prenda. canvas: imagen ya cargada (puede tener transparencia).
// types (opcional): limita el reconocimiento a esos tipos (cuando eliges qué vas a escanear).
export async function analyze(canvas, { types = null } = {}) {
  if (!isReady()) await load();
  // Fondo blanco y formato cuadrado para que el modelo vea la prenda entera.
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
  const k = Math.min(S / canvas.width, S / canvas.height) * 0.92;
  const w = canvas.width * k, h = canvas.height * k;
  ctx.drawImage(canvas, (S - w) / 2, (S - h) / 2, w, h);
  const image = await T.RawImage.read(c.toDataURL('image/jpeg', 0.92));
  const { image_embeds } = await vision(await processor(image));
  const img = normalize(image_embeds.tolist()[0]);

  const sims = textEmb.map((t) => 100 * dot(img, t));
  const nG = GARMENTS.length, nP = PATTERNS.length;
  const pick = (from, to, list) => {
    const probs = softmax(sims.slice(from, to));
    const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    return order.slice(0, 3).map(([p, i]) => ({ p, item: list[i] }));
  };
  // El tipo se decide sumando las probabilidades de todas sus variantes (más robusto).
  const allowed = GARMENTS.map((g) => !types?.length || types.includes(g[1]));
  const gs = sims.slice(0, nG).map((v, i) => (allowed[i] ? v : -1e9));
  const gp = softmax(gs);
  const byType = {};
  gp.forEach((p, i) => { if (allowed[i]) byType[GARMENTS[i][1]] = (byType[GARMENTS[i][1]] || 0) + p; });
  const typeRank = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const type = typeRank[0][0];
  const subIdx = gp.map((p, i) => [p, i]).filter(([, i]) => GARMENTS[i][1] === type).sort((a, b) => b[0] - a[0])[0][1];
  const nS = STYLES.length;
  const p = pick(nG, nG + nP, PATTERNS);
  const s = pick(nG + nP, nG + nP + nS, STYLES);
  const m = pick(nG + nP + nS, sims.length, MATERIALS);
  return {
    type,
    subtype: GARMENTS[subIdx][2],
    confidence: typeRank[0][1],
    alternatives: typeRank.slice(1, 3).map(([t, pr]) => ({ type: t, p: pr })),
    // El estampado solo se indica si el modelo está claramente seguro; si no, se considera liso.
    pattern: p[0].p > 0.4 ? p[0].item[1] : 'Liso',
    style: s[0].item[1],
    material: m[0].p > 0.3 ? m[0].item[1] : '',
    ranking: typeRank.slice(0, 4).map(([t, pr]) => ({ type: t, p: pr })),
    // Variantes concretas dentro del tipo elegido (p. ej. «Gabardina», «Plumífero»…)
    subtypes: gp.map((p, i) => [p, i]).filter(([, i]) => GARMENTS[i][1] === type).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([p, i]) => ({ subtype: GARMENTS[i][2], p })),
  };
}
