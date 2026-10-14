// Vistelo AI: test de color, tono de piel y chat de estilo.
import * as C from './color.js';
import * as A from './advisor.js';
import * as W from './web.js';
import { describe } from './skin.js';
import { openSkinSheet } from './skinui.js';
import { itemCard, bindItemCards, showItem, bestMatches } from './closet.js';
import { generateOutfits, tryOn } from './dress.js';
import { wardrobeGaps, addWish } from './shop.js';
import { state, $, $$, esc, toast, saveProfile, byId, ICON, colorHex } from './core.js';

const QUESTIONS = [
  { q: 'Mira las venas de tu muñeca con luz natural', hint: 'Es una de las pistas más fiables del subtono.', opts: [
    ['Se ven verdosas', { temp: 1 }, '#6f8f4e'], ['Se ven azules o moradas', { temp: -1 }, '#5a5fa8'], ['No lo tengo claro / mezcla', {}, '#7d8a8a']] },
  { q: '¿Qué joyas te favorecen más?', opts: [
    ['Oro', { temp: 1 }, '#d4af37'], ['Plata', { temp: -1 }, '#c0c0c0'], ['Las dos por igual', {}, 'linear-gradient(90deg,#d4af37 50%,#c0c0c0 50%)']] },
  { q: '¿Qué pasa cuando tomas el sol?', opts: [
    ['Me bronceo fácilmente, tono dorado', { temp: 0.6, value: -0.2 }], ['Me quemo y me pongo roja/o', { temp: -0.6, value: 0.4 }], ['Primero me quemo y luego me bronceo', {}]] },
  { q: '¿Cómo describirías tu tono de piel?', opts: [
    ['Muy clara / porcelana', { value: 1 }, '#f6e1d3'], ['Clara', { value: 0.5 }, '#efcfb6'], ['Media / oliva', { value: -0.2 }, '#c99d74'],
    ['Morena', { value: -0.7 }, '#9a6a45'], ['Oscura', { value: -1, chroma: 0.3 }, '#5c3b26']] },
  { q: 'Tu color de pelo natural', opts: [
    ['Rubio dorado o pelirrojo', { temp: 0.8, value: 0.4 }, '#d8a65a'], ['Rubio ceniza', { temp: -0.6, value: 0.6 }, '#c8bba0'],
    ['Castaño claro', { value: 0.1, chroma: -0.3 }, '#8a6545'], ['Castaño oscuro', { value: -0.6 }, '#4a2f1f'],
    ['Negro', { value: -1, chroma: 0.4 }, '#151515'], ['Canoso / plateado', { temp: -0.6, chroma: -0.2 }, '#c9c9c9']] },
  { q: '¿De qué color son tus ojos?', opts: [
    ['Azules o grises claros', { temp: -0.3, value: 0.3 }, '#8fb3cf'], ['Verdes o avellana', { temp: 0.4, chroma: -0.3 }, '#7b8a4c'],
    ['Marrón claro / ámbar', { temp: 0.5 }, '#a8742f'], ['Marrón oscuro / negro', { value: -0.6, chroma: 0.3 }, '#3a2416'],
    ['Azul o verde muy intensos', { chroma: 0.8 }, '#1f7fb0']] },
  { q: 'Contraste entre tu piel, pelo y ojos', hint: 'Haz una foto en blanco y negro: ¿se diferencian mucho?', opts: [
    ['Alto (ej. piel clara y pelo oscuro)', { chroma: 1 }], ['Medio', {}], ['Bajo, todo se funde', { chroma: -1 }]] },
  { q: 'Ponte junto a la cara una prenda blanca pura y otra crema', opts: [
    ['El blanco puro me ilumina', { temp: -0.5, chroma: 0.5 }, '#ffffff'], ['El crema/blanco roto me queda mejor', { temp: 0.5, chroma: -0.3 }, '#efe5d2'], ['No noto diferencia', {}]] },
];

// ---------- Test ----------
function startTest() { state.test = { step: 0, answers: [] }; renderTest(); }

function renderTest() {
  const v = $('#view');
  const t = state.test;
  const total = QUESTIONS.length + 1;
  const bar = `<div class="progress"><i style="width:${(t.step / total) * 100}%"></i></div>`;
  if (t.step < QUESTIONS.length) {
    const Q = QUESTIONS[t.step];
    v.innerHTML = `${bar}<div class="q card">
      <p class="eyebrow">Pregunta ${t.step + 1} de ${total}</p>
      <h3>${Q.q}</h3>${Q.hint ? `<p class="muted small">${Q.hint}</p>` : ''}
      <div class="opts">${Q.opts.map(([l, , sw], i) => `<button class="opt ${t.answers[t.step] === i ? 'on' : ''}" data-opt="${i}">${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}<span>${l}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:16px">${t.step ? '<button class="btn ghost" id="back">Atrás</button>' : '<button class="btn ghost" id="cancel">Cancelar</button>'}</div>
    </div>`;
    $$('[data-opt]', v).forEach((b) => b.addEventListener('click', () => { t.answers[t.step] = +b.dataset.opt; t.step++; renderTest(); }));
  } else {
    const skin = state.profile.skin?.hex;
    v.innerHTML = `${bar}<div class="q card">
      <p class="eyebrow">Último paso · recomendado</p>
      <h3>Tu tono de piel real</h3>
      <p class="muted small">Mide tu piel con la cámara o con una foto. Afina mucho el resultado.</p>
      ${skin ? `<div class="skin-result"><span class="skin-swatch" style="background:${skin}"></span><div><b>${esc(describe(skin).text)}</b><p class="small muted" style="margin:2px 0 0">Tono guardado</p></div></div>` : ''}
      <button class="btn navy block" id="measure" style="margin:12px 0 8px">${ICON.camera} ${skin ? 'Volver a medir' : 'Medir con cámara o foto'}</button>
      <div class="row"><button class="btn ghost" id="back">Atrás</button><button class="btn primary" id="finish">${skin ? 'Ver mi resultado' : 'Saltar y ver resultado'}</button></div>
    </div>`;
    $('#measure').addEventListener('click', () => openSkinSheet(() => renderTest()));
    $('#finish').addEventListener('click', finishTest);
  }
  $('#back', v)?.addEventListener('click', () => { t.step--; renderTest(); });
  $('#cancel', v)?.addEventListener('click', () => { state.test = null; renderVistelo(); });
}

function finishTest() {
  const t = state.test;
  const sum = { temp: 0, value: 0, chroma: 0 };
  t.answers.forEach((a, i) => { const eff = QUESTIONS[i].opts[a][1]; for (const k in eff) sum[k] += eff[k]; });
  const skin = state.profile.skin?.hex;
  if (skin) { const u = C.skinUndertone(skin); sum.temp += u.temp * 1.5; sum.value += u.value; }
  const scores = {
    temp: Math.max(-1, Math.min(1, sum.temp / 4)),
    value: Math.max(-1, Math.min(1, sum.value / 3)),
    chroma: Math.max(-1, Math.min(1, sum.chroma / 2.5)),
  };
  const season = C.decideSeason(scores);
  state.profile.season = season;
  state.profile.colorTest = { season, scores, answers: t.answers.map((a, i) => `${QUESTIONS[i].q}: ${QUESTIONS[i].opts[a][0]}`), skin, date: Date.now() };
  saveProfile();
  state.test = null;
  renderVistelo();
  toast(`Tu estación: ${season}`);
}

// ---------- Contexto para el motor ----------
function wardrobeStats() {
  const items = state.items;
  const top = [...items].sort((a, b) => (b.wears || 0) - (a.wears || 0))[0];
  const never = items.filter((i) => !i.wears);
  const spent = items.reduce((s, i) => s + (parseFloat(String(i.price || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0), 0);
  const count = {}; items.forEach((i) => (count[i.color] = (count[i.color] || 0) + 1));
  return { count: items.length, top: top?.wears ? top : null, never, spent: spent ? `${spent.toFixed(0)} €` : null, mainColor: Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] };
}
export function visteloContext() {
  const p = state.profile;
  return {
    name: p.name, items: state.items, season: p.season, seasonInfo: C.SEASONS[p.season],
    skin: p.skin ? { hex: p.skin.hex, desc: describe(p.skin.hex).text } : null,
    brands: [...new Set([...p.brands, ...state.items.map((i) => i.brand).filter(Boolean)])],
    gaps: wardrobeGaps, matches: (it) => bestMatches(it), wardrobeStats, web: W,
    outfit: ({ occasion, anchorId, weather, exclude }) => generateOutfits({ n: 1, occasion, anchorId, weather, exclude })[0],
  };
}

// ---------- Vista ----------
export function renderVistelo() {
  if (state.test) return renderTest();
  const v = $('#view');
  const p = state.profile;
  const ct = p.colorTest;
  const S = ct && C.SEASONS[ct.season];
  const skin = p.skin?.hex;
  const fits = S ? state.items.map((i) => ({ i, f: C.paletteFit(i.hex, ct.season) })).filter((x) => x.f > 0.55).sort((a, b) => b.f - a.f) : [];

  v.innerHTML = `
    <section class="ai-hero">
      <div class="ai-orb">${ICON.spark}</div>
      <div><p class="eyebrow">Tu estilista personal</p><h2>Vistelo AI</h2>
        <p class="small">${[p.vision ? 'Visión avanzada activa' : 'Visión básica', skin ? describe(skin).text : 'Tono de piel sin medir', p.season || 'Sin test de color'].map(esc).join(' · ')}</p></div>
    </section>

    <div class="quick">
      <button class="quick-btn" data-q="¿Qué me pongo hoy?">${ICON.sun}<b>Look de hoy</b><span>Según el tiempo</span></button>
      <button class="quick-btn" id="qSkin">${ICON.camera}<b>Tono de piel</b><span>${skin ? 'Volver a medir' : 'Cámara o foto'}</span></button>
      <button class="quick-btn" id="qTest">${ICON.palette}<b>Test de color</b><span>${ct ? 'Repetir' : '2 minutos'}</span></button>
      <button class="quick-btn" id="qLink">${ICON.link}<b>Leer un enlace</b><span>¿Me favorece?</span></button>
    </div>

    <div class="card chat-card">
      <div class="chat" id="chat"></div>
      <div class="chips hints">${['¿Qué me pongo para una cena?', 'Novedades de mis marcas', '¿Con qué combino mis vaqueros?', '¿Qué me falta?', 'Estadísticas de mi armario', 'Hazme una maleta'].map((h) => `<button class="chip" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}</div>
      <div class="composer">
        <input id="chatInput" placeholder="Pregunta o pega el enlace de una prenda…" autocomplete="off">
        <button id="chatSend" aria-label="Enviar">${ICON.send}</button>
      </div>
    </div>

    ${skin ? `<div class="card skin-card">
      <div class="skin-result"><span class="skin-swatch" style="background:${skin}"></span>
        <div><p class="section-label" style="margin:0">Tu tono de piel</p><b>${esc(describe(skin).text)}</b></div></div>
    </div>` : ''}

    ${ct ? `<div class="card navy season-card">
      <p class="eyebrow accent">Tu estación</p>
      <h3 class="season-name">${ct.season}</h3>
      <p class="muted">${esc(S.desc)}</p>
      <div class="palette">${S.palette.map((h) => `<span class="swatch" style="background:${h}"></span>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 2px">Evita cerca de la cara</p>
      <div class="palette avoid">${S.avoid.map((h) => `<span class="swatch" style="background:${h}"></span>`).join('')}</div>
      <p class="small" style="margin:10px 0 0"><b>Metales:</b> ${S.metals}<br><b>Neutros:</b> ${S.neutrals}</p>
    </div>
    <div class="card">
      <h3>Te favorecen de tu armario</h3>
      ${fits.length ? `<div class="grid">${fits.slice(0, 8).map((x) => itemCard(x.i)).join('')}</div>` : '<p class="muted">Aún no hay prendas de tu paleta. Mira la pestaña Drops para ideas.</p>'}
    </div>` : `<div class="card navy">
      <p class="eyebrow accent">Test de color personalizado</p>
      <h3>Descubre los colores que te hacen brillar</h3>
      <p class="muted">8 preguntas + la medición real de tu piel. Te diremos tu estación (de 12), tu paleta y qué prendas te favorecen.</p>
      <button class="btn primary block" id="startTest">Empezar el test</button>
    </div>`}`;

  $('#startTest', v)?.addEventListener('click', startTest);
  $('#qTest').addEventListener('click', startTest);
  $('#qSkin').addEventListener('click', () => openSkinSheet(() => renderVistelo()));
  $('#qLink').addEventListener('click', () => { const i = $('#chatInput'); i.value = 'https://'; i.focus(); toast('Pega el enlace de la prenda y envía'); });
  bindItemCards(v);
  bindChat();
}

// ---------- Chat ----------
function bubble(m, idx) {
  if (m.typing) return '<div class="bubble ai typing"><i></i><i></i><i></i></div>';
  const thumbs = (m.ids || []).map(byId).filter(Boolean);
  const card = m.card;
  return `<div class="bubble ${m.role}"><div class="bubble-text">${esc(m.text)}</div>
    ${card ? `<a class="prod-card" href="${esc(card.url)}" target="_blank" rel="noopener">
      ${card.image ? `<img src="${esc(card.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <span><small>${esc(card.site)}</small><b>${esc(card.title)}</b>${card.price ? `<em>${esc(card.price)}</em>` : ''}${card.color ? `<i class="dot" style="background:${colorHex(card.color)}"></i>` : ''}</span></a>` : ''}
    ${m.links?.length ? `<div class="news-list">${m.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><small>${esc(l.brand || '')} · ${esc(l.source)}${l.date ? ` · ${new Date(l.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}</small>${esc(l.title)}</a>`).join('')}</div>` : ''}
    ${thumbs.length ? `<div class="bubble-items">${thumbs.map((t) => `<button data-chatitem="${t.id}"><img src="${t.img}" alt="${esc(t.name || t.type)}"></button>`).join('')}</div>` : ''}
    ${m.actions?.length ? `<div class="bubble-actions">${m.actions.map((a, j) => `<button class="chip on" data-act="${idx}:${j}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
}

function drawChat() {
  const box = $('#chat'); if (!box) return;
  if (!state.chat.length) {
    box.innerHTML = `<div class="bubble ai">Hola${state.profile.name ? `, ${esc(state.profile.name)}` : ''}. Soy Vistelo. Pregúntame qué ponerte, pega el enlace de una prenda de cualquier tienda o pídeme las novedades de tus marcas.</div>`;
    return;
  }
  box.innerHTML = state.chat.map(bubble).join('');
  $$('[data-chatitem]', box).forEach((b) => b.addEventListener('click', () => showItem(byId(b.dataset.chatitem))));
  $$('[data-act]', box).forEach((b) => b.addEventListener('click', () => {
    const [i, j] = b.dataset.act.split(':').map(Number);
    const a = state.chat[i].actions[j];
    if (a.act === 'try') tryOn(a.data);
    if (a.act === 'skin') openSkinSheet(() => renderVistelo());
    if (a.act === 'wish') { addWish(a.data); b.textContent = '♥ Guardado en deseos'; b.disabled = true; }
  }));
  box.scrollTop = box.scrollHeight;
}

async function send(text) {
  const input = $('#chatInput');
  const q = (text ?? input.value).trim();
  if (!q || q === 'https://') return;
  input.value = '';
  state.chat.push({ role: 'me', text: q }, { role: 'ai', typing: true });
  drawChat();
  let r;
  try { r = await A.answer(q, visteloContext()); } catch (e) { r = { text: e.message || 'Algo ha fallado. Inténtalo de nuevo.' }; }
  state.chat[state.chat.length - 1] = { role: 'ai', ...r };
  state.chat = state.chat.slice(-16);
  drawChat();
}

function bindChat() {
  drawChat();
  $('#chatSend').addEventListener('click', () => send());
  $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  $$('[data-hint], [data-q]').forEach((b) => b.addEventListener('click', () => send(b.dataset.hint || b.dataset.q)));
}
