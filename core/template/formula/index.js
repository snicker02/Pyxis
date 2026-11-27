// Template formula: a plain Mandelbox on the Organon engine. Copy template/
// into a new repo, add Organon as the core/ submodule, then change this
// directory. README.md ("The formula contract") lists every key.

import { installFormula } from '../core/engine/formula.js';
import { defaults } from './params.js'; // defineParams() — must run before anything reads PARAMS
import { UNIFORMS, source, defines, spec, specKey, DEFAULT_SPEC } from './glsl.js';
import { uniforms, localDE } from './de.js';
import { r } from '../core/engine/presets.js';

export const VERSION = '0.1.0';

const scene = o => ({ ...defaults(), ...o });
const PRESETS = {
  classic: { label: 'Classic Mandelbox (−1.8)', v: scene({}) },
  positive: { label: 'Positive Scale (2.0)', v: scene({ scale: 2, minR: 0.25, dist: 9, colorSource: 1, palette: 3 }) },
  julia: { label: 'Julia Box', v: scene({ scale: -1.5, juliaMode: true, juliaCX: 0.6, juliaCY: -0.3, juliaCZ: 0.4, dist: 5, palette: 5 }) },
};

const formula = {
  id: 'template',
  name: 'Template',
  version: VERSION,
  glsl: { uniforms: UNIFORMS, source, defines },
  uniforms,
  spec,
  specKey,
  defaultSpec: DEFAULT_SPEC,
  localDE,
  presets: PRESETS,
  presetGroups: [['Mandelbox', () => true]],
  rebirth: {
    candidate: () => ({
      scale: Math.random() < 0.5 ? r(-2.6, -1.4) : r(1.6, 2.8), minR: r(0.1, 0.8), fixedR: r(0.8, 1.3),
      foldX: r(0.7, 1.3), foldY: r(0.7, 1.3), foldZ: r(0.7, 1.3),
      rotX: r(-Math.PI, Math.PI), rotY: r(-0.6, 0.6), dist: r(4, 10), targetX: 0, targetY: 0, targetZ: 0,
    }),
    target: { hit: 0.6, lo: 0.3, hi: 0.92 },
  },
  shaderFallback: { message: 'Shader build failed — reverting to surface mode', values: () => ({}) },
};

export default installFormula(formula);
