// Pyxis — the Mandelbox family as an Organon formula module. Importing this
// file defines Pyxis's parameters, builds its presets and installs the
// formula into the engine (core/engine/formula.js).

import { installFormula } from '../core/engine/formula.js';
import { FORMULA_PARAMS } from './params.js'; // defineParams() — must run before anything reads PARAMS
import { UNIFORMS, source, defines, spec, specKey, DEFAULT_SPEC } from './glsl.js';
import { uniforms } from './uniforms.js';
import { localDE } from './de.js';
import { BIOMES, rebirthCandidate, REBIRTH_TARGET } from './presets.js';
import { PRESET_GROUPS } from './scenes.js';
import { importFract } from './mbimport.js';
import { setupUI } from './ui.js';

export const VERSION = '1.0.0';

const formula = {
  id: 'pyxis',
  name: 'Pyxis',
  version: VERSION,

  // Shader + uniforms (glsl.js, uniforms.js).
  glsl: { uniforms: UNIFORMS, source, defines },
  uniforms,
  spec,
  specKey,
  defaultSpec: DEFAULT_SPEC,

  // CPU distance estimator (de.js), in lock-step with mapLocal().
  localDE,

  // Presets (scenes.js), grouped in the menu.
  presets: BIOMES,
  presetGroups: PRESET_GROUPS.map(([label, g]) => [label, k => BIOMES[k].group === g]),
  firstPreset: 'classic',
  // Every formula control goes back to its default when a preset is picked, so
  // a scene only has to store what differs (see tools/build-scenes.mjs).
  presetReset: new RegExp(`^(${FORMULA_PARAMS.map(p => p.id).join('|')})$`),
  rebirth: { candidate: rebirthCandidate, target: REBIRTH_TARGET },

  // Mandelbulber import (mbimport.js).
  importFract,
  importTitle: 'Load a Mandelbulber .fract settings file (Mandelbox, ABox Mod 1/2/11–15, Kali box V1–V3 / Eiffie, Mandelbox Vary Scale 4D; single formula)',

  // Formula panel extras (ui.js).
  setupUI,
  shaderFallback: {
    message: 'Shader build failed for this formula — reverting to the plain Mandelbox',
    values: () => ({ boxVariant: 0, rotFolds: false }),
  },
};

export default installFormula(formula);
