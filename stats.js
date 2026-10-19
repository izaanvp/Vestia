// Estadísticas del armario: valor, coste por uso, lo que más usas, lo olvidado, colores, tipos, marcas y actividad.
import * as C from './color.js';
import { state, $$, esc, openSheet, label, byId, ICON, colorHex, SLOT_LABEL, slotOf } from './core.js';
import { dayKey } from './diary.js';

const price = (it) => parseFloat(String(it.price || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
const euro = (n) => `${n.toLocaleString('es-ES', { maximumFractionDigits: n < 100 ? 2 : 0 })} €`;
const DAY = 86400e3;

// Donut SVG a partir de [{ value, color, label }]
function donut(parts, size = 132) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 50, cx = 60, cy = 60, C2 = 2 * Math.PI * r;
  let off = 0;
  const arcs = parts.map((p) => {
    const len = (p.value / total) * C2;
    const a = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="18" stroke-dasharray="${len} ${C2 - len}" stroke-dashoffset="${-off}"><title>${esc(p.label)}: ${p.value}</title></circle>`;
    off += len;
    return a;
  }).join('');
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" class="donut" style="transform:rotate(-90deg)">${arcs}</svg>`;
}

export function openStats() {
  const items = state.items;
  const now = Date.now();
  const total = items.reduce((a, it) => a + price(it), 0);
  const priced = items.filter((it) => price(it));
  const wears = items.reduce((a, it) => a + (it.wears || 0), 0);
  const cpw = priced.filter((it) => it.wears).map((it) => ({ it, v: price(it) / it.wears })).sort((a, b) => a.v - b.v);
  const most = [...items].filter((it) => it.wears).sort((a, b) => (b.wears || 0) - (a.wears || 0)).slice(0, 5);
  const forgotten = items.filter((it) => (!it.lastWorn && now - (it.createdAt || now) > 14 * DAY) || (it.lastWorn && now - it.lastWorn > 60 * DAY));
  const never = items.filter((it) => !it.wears).length;
  const month = dayKey().slice(0, 7);
  const usedMonth = new Set(state.diary.filter((e) => e.id.startsWith(month) && e.status !== 'planned').flatMap((e) => e.ids));

  // Colores
  const colorCount = {};
  items.forEach((it) => (colorCount[it.color] = (colorCount[it.color] || 0) + 1));
  const colors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]);
  // Tipos por zona
  const slots = {};
  items.forEach((it) => { const s = slotOf(it.type); slots[s] = (slots[s] || 0) + 1; });
  const maxSlot = Math.max(1, ...Object.values(slots));
  // Marcas
  const brands = {};
  items.forEach((it) => it.brand && (brands[it.brand] = (brands[it.brand] || 0) + 1));
  const topBrands = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // Materiales (de las etiquetas leídas o del material reconocido)
  const mats = {};
  items.forEach((it) => {
    if (it.composition?.length) it.composition.forEach((c) => (mats[c.fiber] = (mats[c.fiber] || 0) + (c.pct || 0) / 100));
    else if (it.material) mats[it.material] = (mats[it.material] || 0) + 1;
  });
  const topMats = Object.entries(mats).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // Actividad: 12 semanas (columnas) × 7 días
  const start = new Date(); start.setDate(start.getDate() - (start.getDay() + 6) % 7 - 7 * 11);
  const byDay = new Map(state.diary.filter((e) => e.status !== 'planned').map((e) => [e.id, e.ids.length]));
  const cells = [];
  for (let w = 0; w < 12; w++) for (let d = 0; d < 7; d++) {
    const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
    const k = dayKey(dt);
    cells.push({ k, n: byDay.get(k) || 0, future: k > dayKey(), w, d });
  }
  const season = state.profile.season;
  const fit = season && items.length ? Math.round((items.filter((i) => C.paletteFit(i.hex, season) > 0.55).length / items.length) * 100) : null;

  openSheet(`
    <p class="eyebrow accent">${ICON.chart} Tu armario en datos</p>
    <h3 class="detail-title">Estadísticas</h3>
    <div class="stat-tiles">
      <div><b>${items.length}</b><span>prendas</span></div>
      <div><b>${total ? euro(total) : '—'}</b><span>valor${priced.length < items.length ? ` (${priced.length} con precio)` : ''}</span></div>
      <div><b>${wears}</b><span>veces puestas</span></div>
      <div><b>${items.length ? Math.round((usedMonth.size / items.length) * 100) : 0}%</b><span>usado este mes</span></div>
    </div>

    <p class="section-label">Actividad · 12 semanas</p>
    <div class="heat">${cells.map((c) => `<i class="${c.future ? 'fut' : c.n ? `l${Math.min(3, c.n > 3 ? 3 : c.n >= 3 ? 2 : 1)}` : ''}" style="grid-column:${c.w + 1};grid-row:${c.d + 1}" title="${c.k}${c.n ? `: ${c.n} prendas` : ''}"></i>`).join('')}</div>
    <p class="small muted" style="margin:6px 0 16px">${state.diary.filter((e) => e.status !== 'planned').length ? `${byDay.size} días apuntados en tu diario.` : 'Apunta tus looks en Vestidor → Diario para ver aquí tu actividad.'}</p>

    ${most.length ? `<p class="section-label">Lo que más te pones</p>
      ${most.map((it) => `<div class="bar-row"><img src="${it.img}" alt=""><span>${esc(label(it))}</span><i style="--w:${(it.wears / most[0].wears) * 100}%"></i><b>${it.wears}</b></div>`).join('')}` : ''}

    ${cpw.length ? `<p class="section-label" style="margin-top:16px">Mejor coste por uso</p>
      <div class="cpw-row">${cpw.slice(0, 4).map(({ it, v }) => `<div><img src="${it.img}" alt=""><b>${euro(v)}</b><small>${esc(label(it))}</small></div>`).join('')}</div>` : priced.length ? '<p class="small muted">Apunta lo que te pones para calcular el coste por uso.</p>' : ''}

    <p class="section-label" style="margin-top:16px">Olvidadas ${forgotten.length ? `· ${forgotten.length}` : ''}</p>
    ${forgotten.length ? `<p class="small muted" style="margin:0 0 8px">Sin ponértelas en más de dos meses (o nunca). ¿Les das una oportunidad o las vendes?</p>
      <div class="forgot-row">${forgotten.slice(0, 8).map((it) => `<span><img src="${it.img}" alt="${esc(label(it))}"></span>`).join('')}</div>`
      : `<p class="small muted">${never ? `${never} prendas aún sin estrenar en el diario.` : '¡Usas todo tu armario!'}</p>`}

    <div class="stat-split">
      <div>
        <p class="section-label">Colores</p>
        <div class="donut-wrap">${donut(colors.map(([c, n]) => ({ value: n, color: colorHex(c), label: c })))}<b>${colors.length}<small>colores</small></b></div>
        <div class="legend">${colors.slice(0, 6).map(([c, n]) => `<span><i style="background:${colorHex(c)}"></i>${esc(c)} ${n}</span>`).join('')}</div>
      </div>
      <div>
        <p class="section-label">Por zona</p>
        ${Object.entries(slots).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<div class="tape-row"><span>${SLOT_LABEL[s]}</span><i style="--w:${(n / maxSlot) * 100}%"></i><b>${n}</b></div>`).join('')}
      </div>
    </div>

    ${topBrands.length ? `<p class="section-label" style="margin-top:16px">Tus marcas</p>
      <div class="chips">${topBrands.map(([b, n]) => `<span class="chip">${esc(b)} · ${n}</span>`).join('')}</div>` : ''}
    ${topMats.length ? `<p class="section-label" style="margin-top:16px">Materiales</p>
      <div class="chips">${topMats.map(([m]) => `<span class="chip">${esc(m)}</span>`).join('')}</div>` : ''}
    ${fit !== null ? `<p class="section-label" style="margin-top:16px">Tu paleta · ${esc(season)}</p>
      <div class="meter"><i style="width:${fit}%"></i></div><p class="small muted" style="margin:6px 0 0">${fit}% de tu armario es de tu paleta.</p>` : ''}
  `);
  $$('.forgot-row span').forEach((s, i) => s.addEventListener('click', async () => { const { showItem } = await import('./closet.js'); showItem(byId(forgotten[i].id)); }));
}
