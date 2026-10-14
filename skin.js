// Medición del tono de piel con la cámara o una foto. Todo se procesa en el dispositivo.
import * as C from './color.js';

export const SKIN_PRESETS = ['#f6e0d2', '#efd0b8', '#e5bb9b', '#d4a37f', '#c18e66', '#a8744f', '#8d5b3c', '#70452c', '#55331f', '#3d2416'];

const isSkin = (r, g, b) => {
  // Rango de piel en YCbCr (funciona para todos los tonos de piel).
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  // Además: la piel siempre tiene más rojo que azul (descarta paredes y fondos grisáceos).
  return y > 35 && cb >= 77 && cb <= 130 && cr >= 136 && cr <= 180 && r > g && r - b > 18;
};

// Mide la piel dentro de una elipse (cx, cy, rx, ry en píxeles del canvas).
export function sampleSkin(canvas, cx, cy, rx, ry) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const x0 = Math.max(0, Math.round(cx - rx)), y0 = Math.max(0, Math.round(cy - ry));
  const w = Math.min(canvas.width - x0, Math.round(rx * 2)), h = Math.min(canvas.height - y0, Math.round(ry * 2));
  const d = ctx.getImageData(x0, y0, w, h).data;
  const px = [];
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 6000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const nx = (x0 + x - cx) / rx, ny = (y0 + y - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const k = (y * w + x) * 4;
    const r = d[k], g = d[k + 1], b = d[k + 2];
    if (isSkin(r, g, b)) px.push([r, g, b, 0.299 * r + 0.587 * g + 0.114 * b]);
  }
  if (px.length < 40) return null;
  // Quitamos brillos y sombras: nos quedamos con el tramo central de luminosidad.
  px.sort((a, b) => a[3] - b[3]);
  const mid = px.slice(Math.floor(px.length * 0.25), Math.ceil(px.length * 0.8));
  const avg = [0, 1, 2].map((i) => mid.reduce((s, p) => s + p[i], 0) / mid.length);
  const hex = C.rgbToHex(...avg);
  return { hex, coverage: px.length, brightness: avg[0] * 0.299 + avg[1] * 0.587 + avg[2] * 0.114 };
}

export function describe(hex) {
  const u = C.skinUndertone(hex);
  const under = u.temp > 0.25 ? 'cálido' : u.temp < -0.25 ? 'frío' : 'neutro';
  const depth = u.L > 75 ? 'muy clara' : u.L > 64 ? 'clara' : u.L > 52 ? 'media' : u.L > 40 ? 'morena' : 'oscura';
  return { undertone: under, depth, text: `Piel ${depth} · subtono ${under}`, ...u };
}

// Variantes de sombra y luz para pintar el maniquí con volumen.
export function shades(hex) {
  const [r, g, b] = C.hexToRgb(hex);
  const mix = (t, k) => C.rgbToHex(...[r, g, b].map((v, i) => v + (t[i] - v) * k));
  return { base: hex, shadow: mix([40, 20, 15], 0.28), deep: mix([30, 15, 10], 0.45), light: mix([255, 245, 235], 0.25) };
}

let stream = null;
export async function startCamera(video) {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara. Sube una foto en su lugar.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
  } catch {
    throw new Error('No tengo permiso para usar la cámara. Actívalo en Ajustes › Safari › Cámara, o sube una foto.');
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
}
export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
export function captureFrame(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  const ctx = c.getContext('2d');
  // Espejo, igual que lo que ves en pantalla
  ctx.translate(c.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  return c;
}
