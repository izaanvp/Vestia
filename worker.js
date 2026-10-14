// Lector web propio para Vistelo AI (opcional).
// Despliégalo gratis en Cloudflare Workers y pega su dirección en Perfil › Vistelo AI › Lector web propio.
// Devuelve el texto de la página pedida con permiso CORS para que Vestia pueda leerla.

const ALLOWED_ORIGIN = '*'; // pon aquí tu dirección de GitHub Pages, p. ej. 'https://tu-usuario.github.io'

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    if (!target || !/^https?:\/\//.test(target)) return new Response('Falta ?url=', { status: 400, headers: cors });

    // Se pasa por el lector de r.jina.ai para recibir la página en texto limpio (Markdown).
    const res = await fetch(`https://r.jina.ai/${target}`, { headers: { 'X-No-Cache': 'true' } });
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=1800' } });
  },
};
