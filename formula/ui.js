// Pyxis's formula-panel extras: the formula description and "Load Formula
// Defaults". Organon calls setupUI() once, after the panel is built.

import { BOX_VARIANTS } from './params.js';
import { VARIANT_DEFAULTS, VARIANT_DESC } from './presets.js';

export function setupUI({ state, panel, el, toast, pushHistory, pushSnapshot }) {
  const desc = el('div', 'fold-desc');
  panel.controls.get('boxVariant').wrap.after(desc);
  const btn = el('button', 'action-btn sm', 'Load Formula Defaults');
  btn.title = "Reset this formula's controls to Mandelbulber's defaults for it";
  desc.after(btn);
  const sync = () => { desc.textContent = VARIANT_DESC[state.get('boxVariant')] || ''; };
  function loadDefaults(announce) {
    const V = state.get('boxVariant');
    state.setMany(VARIANT_DEFAULTS[V] || {});
    if (announce) toast(`${BOX_VARIANTS[V]} defaults loaded (Ctrl+Z undoes)`, 3000);
  }
  btn.addEventListener('click', () => { pushHistory(); loadDefaults(true); });
  // Picking a formula from the dropdown loads its defaults: the formulas read
  // the shared controls differently, and Mandelbulber's defaults are where
  // each one starts out right. One undo step goes back to the previous formula.
  let prev = state.get('boxVariant');
  state.onChange((id, v, src) => {
    if (id !== 'boxVariant') return;
    sync();
    if (src === 'ui') {
      pushSnapshot({ ...state.values, boxVariant: prev });
      loadDefaults(true);
    }
    prev = v;
  });
  sync();
}
