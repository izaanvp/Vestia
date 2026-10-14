// Telón de entrada: coreografía de teatro con la API de animaciones web.
// Entrada: focos que barren el escenario, el logo se dibuja y "Vestia" aparece letra a letra.
// Apertura: caen las borlas, los pliegues se recogen hacia los lados en ola (telón "tableau"),
// sube la bambalina, un destello de luz y la app aparece enfocándose.
import { $, $$ } from './core.js';

const PLEATS = 12;
const EASE = 'cubic-bezier(.65,0,.25,1)';
const OUT = 'cubic-bezier(.2,.8,.2,1)';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let running = [];
const anim = (el, frames, opts) => { if (!el) return null; const a = el.animate(frames, { fill: 'forwards', ...opts }); running.push(a); return a; };

export function buildStage() {
  for (const side of ['left', 'right']) {
    const cur = $(`.curtain.${side}`);
    for (let i = 0; i < PLEATS; i++) {
      const p = document.createElement('i');
      p.className = 'pleat';
      // i = 0 es el pliegue exterior; el último, el central
      const pos = (i * 100) / PLEATS;
      p.style[side === 'left' ? 'left' : 'right'] = `${pos - 0.5}%`;
      p.style.setProperty('--i', i);
      cur.insertBefore(p, cur.firstChild);
    }
    cur.insertAdjacentHTML('beforeend', '<span class="hem"></span>');
    cur.classList.add('idle');
  }
  const brand = $('.brand');
  brand.innerHTML = [...brand.textContent].map((ch) => `<span>${ch}</span>`).join('');
}

// Animación de entrada (al cargar)
export function playIntro() {
  if (reduce()) { $$('.brand span, .tagline, .powered, .stage .onboard, .stage .btn-stage').forEach((e) => (e.style.opacity = 1)); $('.logo-mark path').style.strokeDashoffset = 0; return; }
  anim($('.beam-l'), [{ opacity: 0, transform: 'rotate(28deg)' }, { opacity: 1, transform: 'rotate(10deg)' }], { duration: 1300, easing: OUT, delay: 100 });
  anim($('.beam-r'), [{ opacity: 0, transform: 'rotate(-28deg)' }, { opacity: 1, transform: 'rotate(-10deg)' }], { duration: 1300, easing: OUT, delay: 250 });
  anim($('.logo-mark path'), [{ strokeDashoffset: 220 }, { strokeDashoffset: 0 }], { duration: 1200, easing: 'ease-in-out', delay: 300 });
  anim($('.logo-mark'), [{ transform: 'translateY(8px) scale(.9)' }, { transform: 'none' }], { duration: 1000, easing: OUT, delay: 300 });
  $$('.brand span').forEach((s, i) => anim(s, [
    { opacity: 0, transform: 'translateY(18px) rotateX(70deg)', filter: 'blur(8px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
  ], { duration: 800, easing: OUT, delay: 650 + i * 85 }));
  anim($('.tagline'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0.82, transform: 'none' }], { duration: 700, easing: OUT, delay: 1250 });
  anim($('.powered'), [{ opacity: 0, letterSpacing: '.4em' }, { opacity: 1, letterSpacing: '.16em' }], { duration: 900, easing: OUT, delay: 1400 });
  for (const sel of ['.stage .onboard', '.stage .btn-stage']) anim($(sel), [{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: OUT, delay: 1600 });
}

// Apertura del telón. Devuelve una promesa que se resuelve al terminar.
export function openCurtain() {
  const stage = $('#stage'), app = $('#app');
  running.forEach((a) => a.finish());
  running = [];
  stage.classList.add('opening');
  $$('.curtain').forEach((c) => c.classList.remove('idle'));

  if (reduce()) {
    return anim(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 350 }).finished.then(() => stage.classList.add('gone'));
  }
  const W = $('.curtain.left').getBoundingClientRect().width;
  // 1. El contenido se despide
  anim($('.stage-content'), [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-14px) scale(.97)', filter: 'blur(6px)' }], { duration: 520, easing: 'ease-in' });
  $$('.brand span').forEach((s, i) => anim(s, [{ transform: 'none' }, { transform: `translateY(-${10 + i * 3}px)` }], { duration: 520, easing: 'ease-in', delay: i * 25 }));
  // 2. Los focos se juntan en el centro
  anim($('.beam-l'), [{ transform: 'rotate(10deg)', opacity: 1 }, { transform: 'rotate(2deg)', opacity: 1 }, { transform: 'rotate(-6deg)', opacity: 0 }], { duration: 1600, easing: EASE });
  anim($('.beam-r'), [{ transform: 'rotate(-10deg)', opacity: 1 }, { transform: 'rotate(-2deg)', opacity: 1 }, { transform: 'rotate(6deg)', opacity: 0 }], { duration: 1600, easing: EASE });
  // 3. Caen las borlas
  $$('.tassel').forEach((t, i) => anim(t, [{ transform: 'none', opacity: 1 }, { transform: `translateY(40px) rotate(${i ? -18 : 18}deg)`, opacity: 0 }], { duration: 600, easing: 'ease-in', delay: 180 }));
  // 4. Los pliegues se recogen hacia los lados en ola (primero los centrales)
  for (const side of ['left', 'right']) {
    const dir = side === 'left' ? -1 : 1;
    $$(`.curtain.${side} .pleat`).forEach((p) => {
      const i = +p.style.getPropertyValue('--i');
      const inner = i / (PLEATS - 1); // 0 exterior → 1 centro
      const travel = ((i * W) / PLEATS) * 0.9 + W * 0.06;
      anim(p, [
        { transform: 'translateX(0) scaleX(1) scaleY(1) skewX(0deg)' },
        { transform: `translateX(${dir * travel * 0.35}px) scaleX(.95) scaleY(${1 - inner * 0.06}) skewX(${-dir * inner * 3}deg)`, offset: 0.3 },
        { transform: `translateX(${dir * travel}px) scaleX(.62) scaleY(${1 - inner * 0.42}) skewX(${-dir * inner * 9}deg)` },
      ], { duration: 1450, easing: EASE, delay: 280 + (PLEATS - 1 - i) * 38 });
    });
    anim($(`.curtain.${side}`), [{ transform: 'none' }, { transform: `translateX(${dir * 26}%)` }], { duration: 900, easing: 'ease-in', delay: 1450 });
  }
  // 5. Sube la bambalina
  anim($('.valance'), [{ transform: 'none' }, { transform: 'translateY(8px)', offset: 0.25 }, { transform: 'translateY(-120%)' }], { duration: 1100, easing: EASE, delay: 1050 });
  // 6. Destello y la app aparece enfocándose
  anim($('.stage-flash'), [{ opacity: 0 }, { opacity: 0.55, offset: 0.45 }, { opacity: 0 }], { duration: 1300, easing: 'ease-in-out', delay: 1150 });
  // El fondo oscuro del escenario se disuelve y deja ver la app entre las cortinas
  for (const sel of ['.stage-bg', '.stage-floor', '.stage-stars']) anim($(sel), [{ opacity: 1 }, { opacity: 0 }], { duration: 1000, easing: 'ease-in-out', delay: 800 });
  app.hidden = false;
  anim(app, [{ opacity: 0, transform: 'scale(1.06)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 1500, easing: OUT, delay: 750, fill: 'both' });
  const fade = anim(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', delay: 2250 });
  return fade.finished.then(() => {
    stage.classList.add('gone');
    // Quita los estilos fijados por la animación de la app
    running.forEach((a) => { try { a.commitStyles?.(); } catch { /* elemento oculto */ } });
    app.getAnimations().forEach((a) => a.cancel());
    app.style.opacity = ''; app.style.transform = ''; app.style.filter = '';
  });
}

// Saltar la animación
export function skipCurtain() { running.forEach((a) => a.finish()); }
