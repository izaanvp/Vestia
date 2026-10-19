// Personalización del maniquí: figura, complexión, piel, peinado, color de pelo, barba y rasgos.
import * as F from './fitting.js';
import { SKIN_PRESETS, describe } from './skin.js';
import { openSkinSheet } from './skinui.js';
import { state, $, $$, esc, toast, openSheet, closeSheet, saveProfile, ICON } from './core.js';

export function openBodySheet(onDone = () => {}, worn = {}) {
  const p = state.profile;
  const draft = { ...F.bodyOf(p) };
  let skin = p.skin?.hex || '#d4a37f';

  // La prenda real está calculada para la figura actual; si cambias de figura se muestra la versión ilustrada
  const startFigure = draft.figure;
  const preview = () => F.mannequinSVG({ skin, body: draft, worn, mode: draft.figure === startFigure ? 'real' : 'digital' });
  const typical = { mujer: 'Largo', hombre: 'Corto', neutro: 'Sin pelo' };
  const mini = (figure) => F.mannequinSVG({ skin, body: { ...draft, figure, hairStyle: figure === draft.figure ? draft.hairStyle : typical[figure], face: false, beard: figure === draft.figure && draft.beard }, bare: true });

  const sheet = openSheet(`
    <h3>Tu maniquí</h3>
    <div class="body-editor">
      <div class="body-preview" id="bodyPreview">${preview()}</div>
      <div class="body-options">
        <p class="section-label">Figura</p>
        <div class="figure-pick">${Object.entries(F.FIGURES).map(([k, l]) => `
          <button data-figure="${k}" class="${draft.figure === k ? 'on' : ''}"><span class="fig-mini">${mini(k)}</span><b>${l}</b></button>`).join('')}</div>

        <p class="section-label">Complexión</p>
        <div class="seg">${Object.keys(F.BUILDS).map((b) => `<button data-build="${b}" class="${draft.build === b ? 'on' : ''}">${b}</button>`).join('')}</div>

        <p class="section-label">Tono de piel</p>
        <div class="skin-line">
          ${SKIN_PRESETS.map((h) => `<button data-skin="${h}" style="background:${h}" class="${skin === h ? 'on' : ''}" aria-label="Tono ${h}"></button>`).join('')}
          <button class="chip" id="measureSkin">${ICON.camera} Medir</button>
        </div>
        <p class="small muted" id="skinDesc" style="margin:6px 0 0">${esc(describe(skin).text)}</p>

        <p class="section-label">Peinado</p>
        <div class="chips">${F.HAIR_STYLES.map((h) => `<button class="chip ${draft.hairStyle === h ? 'on' : ''}" data-style="${h}">${h}</button>`).join('')}</div>

        <p class="section-label">Color de pelo</p>
        <div class="hair-row">${Object.entries(F.HAIR).map(([n, c]) => `<button data-color="${n}" class="${draft.hairColor === n ? 'on' : ''}" title="${n}" style="background:${c}"></button>`).join('')}</div>

        <label class="switch"><span>Rasgos de la cara</span><input type="checkbox" id="optFace" ${draft.face ? 'checked' : ''}></label>
        <label class="switch"><span>Barba</span><input type="checkbox" id="optBeard" ${draft.beard ? 'checked' : ''}></label>
      </div>
    </div>
    <button class="btn primary block" id="bodySave" style="margin-top:10px">Guardar maniquí</button>
  `);

  const redraw = () => {
    $('#bodyPreview').innerHTML = preview();
    $$('[data-figure] .fig-mini', sheet).forEach((el) => { el.innerHTML = mini(el.parentElement.dataset.figure); });
    $('#skinDesc').textContent = describe(skin).text;
  };
  const pick = (attr, key, val, el) => {
    draft[key] = val;
    $$(`[${attr}]`, sheet).forEach((x) => x.classList.toggle('on', x === el));
    redraw();
  };

  $$('[data-figure]', sheet).forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.figure;
    // Valores de partida razonables para cada figura (se pueden cambiar después).
    if (f !== draft.figure) {
      if (f === 'neutro') { draft.face = false; draft.beard = false; draft.hairStyle = 'Sin pelo'; }
      if (f === 'mujer') { draft.face = true; draft.beard = false; if (['Sin pelo', 'Rapado'].includes(draft.hairStyle)) draft.hairStyle = 'Largo'; }
      if (f === 'hombre') { draft.face = true; if (['Largo', 'Moño', 'Media melena', 'Sin pelo'].includes(draft.hairStyle)) draft.hairStyle = 'Corto'; }
      $('#optFace').checked = draft.face; $('#optBeard').checked = draft.beard;
      $$('[data-style]', sheet).forEach((x) => x.classList.toggle('on', x.dataset.style === draft.hairStyle));
    }
    pick('data-figure', 'figure', f, b);
  }));
  $$('[data-build]', sheet).forEach((b) => b.addEventListener('click', () => pick('data-build', 'build', b.dataset.build, b)));
  $$('[data-style]', sheet).forEach((b) => b.addEventListener('click', () => pick('data-style', 'hairStyle', b.dataset.style, b)));
  $$('[data-color]', sheet).forEach((b) => b.addEventListener('click', () => pick('data-color', 'hairColor', b.dataset.color, b)));
  $$('[data-skin]', sheet).forEach((b) => b.addEventListener('click', () => {
    skin = b.dataset.skin;
    $$('[data-skin]', sheet).forEach((x) => x.classList.toggle('on', x === b));
    redraw();
  }));
  $('#optFace').addEventListener('change', (e) => { draft.face = e.target.checked; redraw(); });
  $('#optBeard').addEventListener('change', (e) => { draft.beard = e.target.checked; redraw(); });
  $('#measureSkin').addEventListener('click', () => {
    save(false);
    openSkinSheet(() => openBodySheet(onDone, worn));
  });

  function save(close = true) {
    const { chosen, hairColor, ...body } = draft;
    p.body = body;
    p.hair = hairColor;
    if (skin !== p.skin?.hex) p.skin = { hex: skin, source: 'selección manual', date: Date.now() };
    saveProfile();
    if (close) { closeSheet(); toast('Maniquí guardado'); onDone(); }
  }
  $('#bodySave').addEventListener('click', () => save());
}
