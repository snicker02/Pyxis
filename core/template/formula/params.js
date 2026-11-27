// Template formula parameters (the LEFT dock). The right dock (scene & output)
// is Organon's. defineParams() runs once, when this module loads.

import { defineParams, marchParams } from '../core/engine/params.js';
export * from '../core/engine/params.js';

export const GROUPS_LEFT = [
  { id: 'presets', side: 'left', title: 'Presets', accent: true, open: true },
  { id: 'box',     side: 'left', title: 'Mandelbox', accent: true, open: true },
  { id: 'iter',    side: 'left', title: 'Iteration' },
];

export const FORMULA_PARAMS = [
  { id: 'scale', label: 'Scale', type: 'range', group: 'box', min: -4, max: 4, step: 0.001, def: -1.8, mutate: true, fine: true },
  { id: 'minR', label: 'Min Radius', type: 'range', group: 'box', min: 0.01, max: 1.5, step: 0.001, def: 0.5, hardMin: 0.001, mutate: true },
  { id: 'fixedR', label: 'Fixed Radius', type: 'range', group: 'box', min: 0.1, max: 3, step: 0.001, def: 1, hardMin: 0.01, mutate: true },
  { id: 'foldX', label: 'FX', type: 'range', group: 'box', min: 0, max: 3, step: 0.001, def: 1, row: 'fold', section: 'Box Fold Limits', mutate: true },
  { id: 'foldY', label: 'FY', type: 'range', group: 'box', min: 0, max: 3, step: 0.001, def: 1, row: 'fold', mutate: true },
  { id: 'foldZ', label: 'FZ', type: 'range', group: 'box', min: 0, max: 3, step: 0.001, def: 1, row: 'fold', mutate: true },
  { id: 'juliaMode', label: 'Julia Mode', type: 'bool', group: 'box', def: false },
  { id: 'juliaCX', label: 'JX', type: 'range', group: 'box', min: -2, max: 2, step: 0.001, def: 0, row: 'julia', section: 'Julia Seed (C)', gate: 'juliaMode', mutate: true },
  { id: 'juliaCY', label: 'JY', type: 'range', group: 'box', min: -2, max: 2, step: 0.001, def: 0, row: 'julia', gate: 'juliaMode', mutate: true },
  { id: 'juliaCZ', label: 'JZ', type: 'range', group: 'box', min: -2, max: 2, step: 0.001, def: 0, row: 'julia', gate: 'juliaMode', mutate: true },
  { id: 'iterations', label: 'Iterations', type: 'range', group: 'iter', min: 1, max: 40, step: 1, def: 14, int: true, hardMin: 1, hardMax: 250 },
  ...marchParams(),
];

defineParams({
  groups: GROUPS_LEFT,
  params: FORMULA_PARAMS,
  scene: { override: { dist: { def: 7 }, rotX: { def: 0.6 }, rotY: { def: -0.35 } } },
});
