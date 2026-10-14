// Entrada de Vestia: telón, navegación y arranque.
import * as db from './db.js';
import * as V from './vision.js';
import * as W from './web.js';
import { state, $, $$, toast, saveProfile, views, closeSheet } from './core.js';
import { renderCloset, handleUpload } from './closet.js';
import { renderDress } from './dress.js';
import { renderVistelo } from './vistelo.js';
import { renderShop } from './shop.js';
import { renderProfile, applyAccent, renderAvatar } from './profile.js';
import { isDemo, leaveDemo } from './demo.js';
import { initSwipe, renderPager } from './swipe.js';
import { buildStage, playIntro, openCurtain, skipCurtain } from './intro.js';
import * as CU from './cutout.js';

const TITLES = { closet: 'Armario', dress: 'Vestidor', vistelo: 'Vistelo AI', shop: 'Drops', profile: 'Perfil' };
const RENDER = { closet: renderCloset, dress: renderDress, vistelo: renderVistelo, shop: renderShop, profile: renderProfile };

// Coloca el indicador deslizante bajo la pestaña activa.
function moveIndicator() {
  const active = $('.tabbar button.active');
  const ind = $('.tab-indicator');
  if (!active || !ind) return;
  const bar = $('.tabbar').getBoundingClientRect(), r = active.getBoundingClientRect();
  ind.style.transform = `translateX(${r.left - bar.left + r.width / 2 - 14}px)`;
  ind.classList.toggle('hide', active.classList.contains('tab-ai'));
}
window.addEventListener('resize', moveIndicator);
// Profundidad del fondo: las figuras se desplazan a distinta velocidad al hacer scroll
let scrollTick = false;
window.addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => { document.documentElement.style.setProperty('--scroll', Math.round(window.scrollY)); scrollTick = false; });
}, { passive: true });

// Entrada escalonada de tarjetas y prendas.
function stagger() {
  const els = $$('#view .card, #view .item, #view .outfit-card, #view .quick-btn, #view .action, #view .hero, #view .ai-hero, #view .profile-hero, #view .news, #view .fitting-stage');
  els.slice(0, 24).forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('rise'); });
}

const TAB_ORDER = ['closet', 'dress', 'vistelo', 'shop', 'profile'];
views.go = (tab, { keepScroll = false, swipe = 0 } = {}) => {
  const changed = tab !== state.tab;
  const tabs = ['closet', 'dress', 'vistelo', 'shop', 'profile'];
  const dir = tabs.indexOf(tab) >= tabs.indexOf(state.tab) ? 'fwd' : 'back';
  const render = () => {
    state.tab = tab;
    $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    moveIndicator();
    renderPager($('#pager'), TAB_ORDER, TITLES, tab, views.go);
    $('#viewTitle').textContent = TITLES[tab];
    $('#greeting').textContent = state.profile.name ? `Hola, ${state.profile.name}` : 'Vestia';
    renderAvatar($('#avatarBtn'));
    $('#demoRibbon').hidden = !isDemo();
    $$('.fab').forEach((f) => f.remove());
    const y = window.scrollY;
    RENDER[tab]();
    if (changed) stagger();
    window.scrollTo({ top: keepScroll && !changed ? y : 0 });
  };
  // Transición nativa entre pestañas cuando el navegador la admite (Safari 18+).
  if (changed && !swipe && !document.hidden && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.dataset.dir = dir;
    const vt = document.startViewTransition(render);
    // Si el navegador cancela la transición (pestaña en segundo plano), el contenido ya se ha actualizado igualmente
    vt.ready.catch(() => {}); vt.finished.catch(() => {}); vt.updateCallbackDone?.catch(() => {});
  } else render();
};

$$('.tabbar button').forEach((b) => b.addEventListener('click', () => views.go(b.dataset.tab)));
$('#avatarBtn').addEventListener('click', () => views.go('profile'));
$('#demoExit').addEventListener('click', () => leaveDemo());
$('#sheetBackdrop').addEventListener('click', closeSheet);
$('#fileInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) handleUpload(files);
});

function setupStage() {
  const stage = $('#stage');
  const p = state.profile;
  if (!p.name) $('#onboard').hidden = false;
  if (p.name && !p.curtain) { stage.classList.add('gone'); showApp(); return; }
  if (p.name) $('.tagline').textContent = `Bienvenid@ de nuevo, ${p.name}.`;
  buildStage();
  playIntro();
  let opened = false;
  $('#openStage').addEventListener('click', () => {
    if (opened) return;
    const input = $('#onboardName');
    if (!p.name) {
      const name = input.value.trim();
      if (!name) { input.focus(); input.placeholder = 'Escribe tu nombre'; return; }
      p.name = name; saveProfile();
    }
    opened = true;
    showApp();
    openCurtain();
  });
  $('#stageSkip').addEventListener('click', () => skipCurtain());
  $('#onboardName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#openStage').click(); });
}

function showApp() {
  $('#app').hidden = false;
  views.go(state.tab);
}

(async function init() {
  applyAccent();
  W.setCustomReader(state.profile.reader);
  try {
    state.items = await db.getAll('items');
    state.outfits = await db.getAll('outfits');
    const ids = new Set(state.items.map((i) => i.id));
    state.worn = Object.fromEntries(Object.entries(state.profile.lastWorn || {}).filter(([, id]) => ids.has(id)));
  } catch { toast('No se pudo abrir el almacenamiento local'); }
  setupStage();
  initSwipe({ tabs: TAB_ORDER, titles: TITLES, current: () => state.tab, go: views.go });
  if (state.profile.cutoutAI) setTimeout(() => CU.loadML().catch(() => {}), 3000);
  // Precarga silenciosa del modelo de visión si está activado (ya está en caché tras la primera vez).
  if (state.profile.vision) setTimeout(() => V.load().catch(() => {}), 1500);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
