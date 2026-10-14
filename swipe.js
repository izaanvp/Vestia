// Navegación por gestos: desliza a izquierda o derecha para cambiar de sección.
// La página sigue al dedo, muestra un adelanto de la siguiente sección y encaja con un muelle suave.
import { $ } from './core.js';

const IGNORE = '.rail, .slot-tabs, .hints, .compare, .chips, .stats, input, textarea, select, .scan-cam, .figure-pick, .bubble-items, .match-row, [data-noswipe]';

export function initSwipe({ tabs, titles, current, go }) {
  const view = $('#view');
  const peek = document.createElement('div');
  peek.className = 'swipe-peek';
  document.body.appendChild(peek);

  let sx = 0, sy = 0, st = 0, dx = 0, mode = null; // mode: null | 'h' | 'v'
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  view.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest(IGNORE) || !$('#sheet').hidden) { mode = 'v'; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = performance.now(); dx = 0; mode = null;
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    if (mode === 'v') return;
    const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
    if (!mode) {
      if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
      mode = Math.abs(x) > Math.abs(y) * 1.3 ? 'h' : 'v';
      if (mode === 'v') return;
      view.style.transition = 'none';
    }
    const i = tabs.indexOf(current());
    const target = tabs[i + (x < 0 ? 1 : -1)];
    // Resistencia en los extremos (no hay sección más allá)
    dx = target ? x : x * 0.25;
    view.style.transform = `translateX(${dx}px)`;
    view.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / 900));
    if (target) {
      peek.textContent = x < 0 ? `${titles[target]} →` : `← ${titles[target]}`;
      peek.className = `swipe-peek show ${x < 0 ? 'right' : 'left'}`;
      peek.style.setProperty('--p', Math.min(1, Math.abs(dx) / 90));
    }
  }, { passive: true });

  const end = () => {
    if (mode !== 'h') { mode = null; return; }
    mode = null;
    const v = Math.abs(dx) / Math.max(1, performance.now() - st);
    const i = tabs.indexOf(current());
    const target = tabs[i + (dx < 0 ? 1 : -1)];
    peek.className = 'swipe-peek';
    view.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1), opacity .32s';
    if (target && (Math.abs(dx) > 80 || v > 0.45)) {
      const dir = dx < 0 ? 1 : -1;
      view.style.transform = `translateX(${-dir * 40}%)`;
      view.style.opacity = '0';
      setTimeout(() => {
        view.style.transition = 'none';
        go(target, { swipe: dir });
        view.style.transform = `translateX(${dir * 30}%)`;
        view.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          view.style.transition = reduce ? 'none' : 'transform .42s cubic-bezier(.2,.8,.2,1), opacity .3s';
          view.style.transform = '';
          view.style.opacity = '';
        }));
      }, reduce ? 0 : 170);
    } else {
      view.style.transform = '';
      view.style.opacity = '';
    }
  };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);
}

// Indicador de página (puntos tipo iOS) bajo el título; se puede tocar para saltar.
export function renderPager(el, tabs, titles, current, go) {
  el.innerHTML = tabs.map((t) => `<button data-page="${t}" class="${t === current ? 'on' : ''}" aria-label="${titles[t]}"></button>`).join('');
  el.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => go(b.dataset.page)));
}
