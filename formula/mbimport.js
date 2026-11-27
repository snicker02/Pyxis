// Pyxis's half of the Mandelbulber .fract importer: the Mandelbox family,
// single formula. Organon (core/engine/mbimport.js) parses the file and does
// the scene: iterations, camera, fractal transform, light, background,
// materials and ground.
//
// .fract files store only the values that differ from Mandelbulber's
// defaults, so every read below carries Mandelbulber's default
// (src/initparameters.cpp). Mapping an empty section gives the formula's own
// defaults: that is what VARIANT_DEFAULTS (presets.js) is.

import { num, vec, bool, nums } from '../core/engine/mbimport.js';

// Mandelbulber formula ids (formula/definition/all_fractal_list_enums.hpp) → variant.
export const MB_FORMULAS = {
  8: [0, 'Mandelbox'], 64: [1, 'Abox - Mod 1'], 75: [2, 'Abox - Mod 2'], 119: [3, 'Abox - Mod 11'],
  123: [4, 'Abox - Mod 12'], 127: [5, 'Abox - Mod 13'], 206: [6, 'Abox - Mod 14'], 226: [7, 'Abox - Mod 15'],
  60: [8, 'Abox - Mod Kali'], 135: [9, 'Abox - Mod Kali-V2'], 136: [10, 'Abox - Mod Kali-V3'],
  87: [11, 'Abox - Mod Kali-Eiffie'], 18: [12, 'Mandelbox - Vary Scale 4D'],
};
// Formulas whose c addition is off by default (cpixelDisabledByDefault).
export const C_OFF = new Set([206, 136, 87]);

// Neutral values for every formula control; each mapper then sets its own.
const BASE = {
  scale: 2, scaleVary: 0, foldX: 1, foldY: 1, foldZ: 1, fold4: 1, foldValue: 2, foldOffX: 0, foldOffY: 0, foldOffZ: 0,
  zFold: true, zFoldScale: 1, eiffZBox: false, kaliAddX: 0.5, kaliAddY: 0.5, kaliAddZ: 0.5,
  minR2: 0.25, fixR2: 1, sphOffX: 0, sphOffY: 0, sphOffZ: 0, rPowerOn: false, rPower: 1, rPower4: 1,
  varyAOn: false, varyA: 0, varyABase: 1, varyASet: false, deOff: 1,
  fRotOn: false, fRotX: 0, fRotY: 0, fRotZ: 0, fRot2X: 0, fRot2Y: 0, fRot2Z: 0, rotFolds: false,
  cylHalf: 0.5, cylScale: 1, smoothOn: false, smoothX: 0, smoothY: 0, smoothZ: 0, smoothStart: 0, smoothStop: 1,
  swapXZ: false, postScale: 1, postScaleStop: 1, sphOn: true, biasX: 0, biasY: 0, biasZ: 0, biasSq: false, biasClamp: true,
  cuboidOn: false, cubX: 0.2, cubY: 0.2, cubZ: 0.2, cubSq: false, invC: false, invCSX: 1, invCSY: 1, invCSZ: 1, invCAcc: false,
  invMin: 0, invMax: 1, preX: 0, preY: 0, preZ: 0, addOn: false, addMul: 1, addAlt: false, addAltScale: 1,
  addX: 0, addY: 0, addZ: 0, kaliStop: 15, w0: 0, rot4On: false, r4aX: 0, r4aY: 0, r4aZ: 0, r4bX: 0, r4bY: 0, r4bZ: 0,
  cIn: false, cInMulX: 1, cInMulY: 1, cInMulZ: 1, cInSigned: false,
};
for (const a of ['N', 'P']) for (const d of 'XYZ') for (const e of 'XYZ') BASE[`rf${a}${d}${e}`] = 0;

const set3 = (o, id, v) => { o[id + 'X'] = v[0]; o[id + 'Y'] = v[1]; o[id + 'Z'] = v[2]; };

// Options Pyxis doesn't have; noted when the file sets them away from the default.
const UNSUPPORTED = {
  common: [
    ['transf_addCpixel_enabled_false', false, 'the formula\'s own "add Cpixel" option'],
    ['analyticDE_enabled_false', false, 'analytic DE tweak'],
    ['transf_start_iterations_R', 0, 'rotation iteration range'], ['transf_stop_iterations_R', 250, 'rotation iteration range'],
    ['transf_start_iterations_S', 0, 'sphere-fold iteration range'], ['transf_stop_iterations_S', 250, 'sphere-fold iteration range'],
    ['transf_start_iterations_A', 0, 'iteration range A'], ['transf_stop_iterations_A', 250, 'iteration range A'],
    ['transf_start_iterations_B', 0, 'iteration range B'], ['transf_stop_iterations_B', 250, 'iteration range B'],
  ],
  1: [['transf_start_iterations_K', 0, 'r-power iteration range'], ['transf_stop_iterations_K', 250, 'r-power iteration range'],
    ['transf_start_iterations_E', 0, 'add-Cpixel iteration range'], ['transf_stop_iterations_E', 250, 'add-Cpixel iteration range']],
  3: [['transf_function_enabledy_false', false, 'parametric min R² (Cpara)'], ['transf_start_iterations_C', 0, 'post-scale start iteration']],
  4: [['transf_start_iterations_E', 0, 'bias iteration range'], ['transf_stop_iterations_E', 250, 'bias iteration range'],
    ['transf_start_iterations_X', 0, 'vary-scale iteration range'], ['transf_stop_iterations_X', 250, 'vary-scale iteration range']],
  5: [['transf_start_iterations_E', 0, 'inverse-c iteration range'], ['transf_stop_iterations_E', 250, 'inverse-c iteration range'],
    ['transf_start_iterations_X', 0, 'vary-scale iteration range'], ['transf_stop_iterations_X', 250, 'vary-scale iteration range']],
  6: [['transf_function_enabledA_false', false, 'offset sign by z'], ['transf_function_enabledB_false', false, 'offset sign by c'],
    ['transf_start_iterations_C', 0, 'c iteration range'], ['transf_stop_iterations_C', 250, 'c iteration range'],
    ['transf_start_iterations_X', 0, 'vary-scale iteration range'], ['transf_stop_iterations_X', 250, 'vary-scale iteration range']],
  7: [['transf_function_enabled_false', false, 'abs / axis-order prelude'], ['transf_sphere_inversion_enabled_false', false, 'sphere inversion prelude'],
    ['transf_function_enabledN_false', false, 'diagonal fold'], ['transf_start_iterations_E', 0, 'scale iteration range'],
    ['transf_stop_iterations_E', 250, 'scale iteration range'], ['transf_start_iterations_M', 0, 'offset iteration range'],
    ['transf_stop_iterations_M', 250, 'offset iteration range']],
  8: [['transf_function_enabledP_false', false, 'per-iteration rotation vary']],
  9: [['transf_function_enabledS_false', false, 'sign transform'], ['transf_start_iterations', 0, 'rotation iteration range'],
    ['transf_stop_iterations', 250, 'rotation iteration range']],
  10: [],
  11: [['transf_start_iterations', 0, 'rotation iteration range'], ['transf_stop_iterations', 250, 'rotation iteration range']],
  12: [['Cpara_enabledParab_false', false, 'parabolic w offset'], ['transf_start_iterations_R', 0, '4D rotation iteration range']],
};
// Range keys that do not apply to a formula (it has no such range).
const NOT_RANGE = { 0: ['A', 'B', 'S', 'R'], 1: ['A', 'B', 'S'], 2: ['A', 'B', 'S'], 7: ['A'], 8: ['A', 'B', 'S', 'R'], 9: ['A', 'B', 'S'], 10: ['S', 'R'], 11: ['B', 'S'], 12: ['A', 'B', 'S'] };

function checkUnsupported(f, V, notes) {
  const skip = NOT_RANGE[V] || [];
  const list = [...UNSUPPORTED.common.filter(([k]) => !skip.some(r => k === `transf_start_iterations_${r}` || k === `transf_stop_iterations_${r}`)), ...(UNSUPPORTED[V] || [])];
  if ([10].includes(V)) for (let i = list.length - 1; i >= 0; i--) if (/_A$|_B$/.test(list[i][0])) list.splice(i, 1);
  const seen = new Set();
  for (const [k, d, what] of list) {
    if (f[k] === undefined) continue;
    const val = typeof d === 'boolean' ? bool(f, k, d) : num(f, k, d);
    if (val !== d && !seen.has(what)) { seen.add(what); notes.push(`Not supported: ${what} (${k}).`); }
  }
}

// One mapper per variant. f = the [fractal_1] section (or {} for the defaults).
const MAPPERS = {
  0(f, o) { // Mandelbox
    o.scale = num(f, 'mandelbox_scale', 2);
    const L = num(f, 'mandelbox_folding_limit', 1);
    o.foldX = o.foldY = o.foldZ = L;
    o.foldValue = num(f, 'mandelbox_folding_value', 2);
    o.minR2 = num(f, 'mandelbox_folding_min_radius', 0.5) ** 2;
    o.fixR2 = num(f, 'mandelbox_folding_fixed_radius', 1) ** 2;
    set3(o, 'sphOff', vec(f, 'mandelbox_offset', [0, 0, 0]));
    o.fRotOn = bool(f, 'mandelbox_main_rotation_enabled', false);
    set3(o, 'fRot', vec(f, 'mandelbox_rotation_main', [0, 0, 0]));
    o.rotFolds = bool(f, 'mandelbox_rotations_enabled', false);
    for (let d = 0; d < 3; d++) {
      set3(o, `rfN${'XYZ'[d]}`, vec(f, `mandelbox_rotation_neg_${d + 1}`, [0, 0, 0]));
      set3(o, `rfP${'XYZ'[d]}`, vec(f, `mandelbox_rotation_pos_${d + 1}`, [0, 0, 0]));
    }
  },
  1(f, o) { // ABox Mod 1
    o.scale = num(f, 'mandelbox_scale', 2);
    o.scaleVary = num(f, 'mandelbox_vary_scale_vary', 0);
    o.foldValue = num(f, 'mandelbox_folding_value', 2);
    set3(o, 'foldOff', vec(f, 'transf_addition_constant', [0, 0, 0]));
    o.zFold = bool(f, 'transf_function_enabledz', true);
    o.zFoldScale = num(f, 'transf_scale_1', 1);
    o.rPowerOn = bool(f, 'transf_function_enabled_false', false);
    o.rPower = num(f, 'mandelbox_vary_rpower', 1);
    o.minR2 = num(f, 'transf_minimum_radius_0', 0);
    o.fixR2 = num(f, 'transf_maxR2_1', 1);
    rot(f, o);
  },
  2(f, o) { // ABox Mod 2
    o.scale = num(f, 'mandelbox_scale', 2);
    o.scaleVary = num(f, 'mandelbox_vary_scale_vary', 0);
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabledM', true);
    o.cylHalf = num(f, 'transf_offset_05', 0.5);
    o.cylScale = num(f, 'transf_scale_1', 1);
    o.rPowerOn = bool(f, 'transf_function_enabled_false', false);
    o.rPower = num(f, 'mandelbox_vary_rpower', 1);
    sphereP25(f, o);
    rot(f, o);
  },
  3(f, o) { // ABox Mod 11
    o.scale = num(f, 'mandelbox_scale', 2);
    o.scaleVary = num(f, 'mandelbox_vary_scale_vary', 0);
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabled', true);
    smooth(f, o);
    o.swapXZ = bool(f, 'transf_function_enabledSw_false', false);
    sphereP25(f, o);
    set3(o, 'sphOff', vec(f, 'mandelbox_offset', [0, 0, 0]));
    set3(o, 'add', vec(f, 'transf_addition_constant', [0, 0, 0]));
    rot(f, o);
    o.postScale = num(f, 'transf_scaleG_1', 1);
    o.postScaleStop = num(f, 'transf_stop_iterations_C1', 1);
  },
  4(f, o) { // ABox Mod 12
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabled', true);
    smooth(f, o);
    o.swapXZ = bool(f, 'transf_function_enabledSw_false', false);
    o.sphOn = bool(f, 'transf_function_enabledAx', true);
    set3(o, 'bias', vec(f, 'transf_constant_multiplier_000', [0, 0, 0]));
    o.biasSq = bool(f, 'transf_function_enabledAz_false', false);
    o.biasClamp = bool(f, 'transf_function_enabledAz', true);
    o.cuboidOn = bool(f, 'transf_function_enabledAy_false', false);
    set3(o, 'cub', vec(f, 'transf_scaleP_222', [0.2, 0.2, 0.2]));
    o.cubSq = bool(f, 'transf_function_enabledAx_false', false);
    set3(o, 'sphOff', vec(f, 'transf_offset_000', [0, 0, 0]));
    sphereP25(f, o);
    o.scale = num(f, 'mandelbox_scale', 2);
    varyA(f, o, 'transf_scaleB_1', true);
    set3(o, 'add', vec(f, 'transf_addition_constant', [0, 0, 0]));
    rot(f, o);
  },
  5(f, o) { // ABox Mod 13
    o.invC = bool(f, 'transf_function_enabledAz_false', false);
    o.invCAcc = bool(f, 'transf_function_enabledAy_false', false);
    set3(o, 'invCS', vec(f, 'transf_scale3D_111', [1, 1, 1]));
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabled', true);
    smooth(f, o);
    o.swapXZ = bool(f, 'transf_function_enabledSw_false', false);
    sphereP25(f, o);
    set3(o, 'sphOff', vec(f, 'mandelbox_offset', [0, 0, 0]));
    o.scale = num(f, 'mandelbox_scale', 2);
    varyA(f, o, 'transf_scaleB_1', true);
    o.addAlt = bool(f, 'transf_function_enabledAx_false', false);
    o.addAltScale = num(f, 'transf_scale_1', 1);
    set3(o, 'add', vec(f, 'transf_addition_constant', [0, 0, 0]));
    rot(f, o);
  },
  6(f, o) { // ABox Mod 14
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabled', true);
    smooth(f, o);
    set3(o, 'pre', vec(f, 'transf_offset_000', [0, 0, 0]));
    o.invMin = num(f, 'transf_invert_0', 0);
    o.invMax = num(f, 'transf_invert_1', 1);
    o.scale = num(f, 'transf_scale_2', 2);
    varyA(f, o, 'transf_scaleB_1', false);
    o.deOff = num(f, 'analyticDE_offset_0', 0);
    o.addOn = bool(f, 'transf_function_enabledAx_false', false);
    set3(o, 'add', vec(f, 'transf_addition_constant', [0, 0, 0]));
    o.addMul = num(f, 'transf_scale_1', 1);
    o.cIn = bool(f, 'transf_addCpixel_enabled', true);
    set3(o, 'cInMul', vec(f, 'transf_constant_multiplier_111', [1, 1, 1]));
    o.cInSigned = bool(f, 'transf_alternate_enabled_false', false);
    rot(f, o);
  },
  7(f, o) { // ABox Mod 15
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabled', true);
    set3(o, 'pre', vec(f, 'transf_offsetA_000', [0, 0, 0]));
    sphereP25(f, o);
    o.scale = num(f, 'transf_scale_2', 2);
    o.deOff = num(f, 'analyticDE_offset_1', 1);
    o.varyAOn = bool(f, 'transf_function_enabledK_false', false);
    o.varyA = num(f, 'transf_scale_vary_0', 0);
    o.varyABase = num(f, 'transf_scaleC_1', 1);
    o.fRotOn = bool(f, 'transf_rotation2_enabled_false', false);
    set3(o, 'fRot', vec(f, 'transf_rotation', [0, 0, 0]));
    o.cIn = bool(f, 'transf_addCpixel_enabled_false', false);
    set3(o, 'cInMul', vec(f, 'transf_constant_multiplier_111', [1, 1, 1]));
    set3(o, 'add', vec(f, 'transf_addition_constantA_000', [0, 0, 0]));
    set3(o, 'fRot2', vec(f, 'transf_rotation2', [0, 0, 0]));
  },
  8(f, o) { // ABox Mod Kali
    o.fRotOn = bool(f, 'mandelbox_main_rotation_enabled', false);
    set3(o, 'fRot', vec(f, 'mandelbox_rotation_main', [0, 0, 0]));
    set3(o, 'kaliAdd', vec(f, 'transf_addition_constant_0555', [0.5, 0.5, 0.5]));
    o.minR2 = num(f, 'transf_minimum_radius_06', 0.6);
    o.scale = num(f, 'transf_scale_015', 1.5);
  },
  9(f, o) { // ABox Mod Kali V2
    set3(o, 'kaliAdd', vec(f, 'transf_addition_constant_0555', [0.5, 0.5, 0.5]));
    o.zFold = bool(f, 'transf_function_enabledM', true);
    sphereP25(f, o);
    o.scale = num(f, 'transf_scale_015', 1.5);
    set3(o, 'add', vec(f, 'transf_addition_constant', [0, 0, 0]));
    rot(f, o);
  },
  10(f, o) { // ABox Mod Kali V3
    set3(o, 'kaliAdd', vec(f, 'transf_offset_111', [1, 1, 1]));
    o.minR2 = num(f, 'transf_minimum_radius_0', 0);
    o.scale = num(f, 'transf_scale_015', 1.5);
    o.kaliStop = num(f, 'transf_stop_iterations_15', 15);
    set3(o, 'add', vec(f, 'transf_offsetA_111', [1, 1, 1]));
  },
  11(f, o) { // ABox Mod Kali-Eiffie
    fold111(f, o);
    o.zFold = bool(f, 'transf_function_enabledM', true);
    o.eiffZBox = bool(f, 'transf_function_enabledx_false', false);
    o.zFoldScale = num(f, 'transf_scale_1', 1);
    o.foldValue = num(f, 'mandelbox_folding_value', 2);
    o.swapXZ = bool(f, 'transf_function_enabled', true);
    o.minR2 = num(f, 'transf_minimum_radius_05', 0.5);
    o.scale = num(f, 'transf_scale_015', 1.5);
    set3(o, 'add', vec(f, 'transf_addition_constant', [0, 0, 0]));
    rot(f, o);
  },
  12(f, o) { // Mandelbox Vary Scale 4D
    o.scale = num(f, 'mandelbox_scale', 2);
    o.scaleVary = num(f, 'mandelbox_vary_scale_vary', 0);
    o.fold4 = num(f, 'mandelbox_vary_fold', 1);
    o.rPower4 = num(f, 'mandelbox_vary_rpower', 1);
    o.minR2 = num(f, 'mandelbox_vary_minr', 0.5) ** 2;
    o.rot4On = bool(f, 'transf_function_enabledR_false', false);
    set3(o, 'r4a', vec(f, 'transf_rotation44a', [0, 0, 0]));
    set3(o, 'r4b', vec(f, 'transf_rotation44b', [0, 0, 0]));
  },
};
function fold111(f, o) { set3(o, 'fold', vec(f, 'transf_addition_constant_111', [1, 1, 1])); }
function sphereP25(f, o) { o.minR2 = num(f, 'transf_minR2_p25', 0.25); o.fixR2 = num(f, 'transf_maxR2_1', 1); }
function rot(f, o) { o.fRotOn = bool(f, 'transf_rotation_enabled', false); set3(o, 'fRot', vec(f, 'transf_rotation', [0, 0, 0])); }
function smooth(f, o) {
  o.smoothOn = bool(f, 'transf_function_enabled_false', false);
  set3(o, 'smooth', vec(f, 'transf_scale3D_000', [0, 0, 0]));
  o.smoothStart = num(f, 'transf_start_iterations_D', 0);
  o.smoothStop = num(f, 'transf_stop_iterations_D1', 1);
}
function varyA(f, o, base, hasSet) {
  o.varyAOn = bool(f, 'transf_function_enabledX_false', false);
  o.varyA = num(f, 'transf_scale_vary_0', 0);
  o.varyABase = num(f, base, 1);
  o.varyASet = hasSet ? bool(f, 'transf_function_enabledM_false', false) : true;
}

// The formula controls for a variant from a [fractal_N] section ({} = defaults).
export function mapFormula(V, f = {}, notes = []) {
  const o = { ...BASE, boxVariant: V };
  MAPPERS[V](f, o);
  if (notes) checkUnsupported(f, V, notes);
  return o;
}

// formula.importFract: the formula's parameters → { ok, formula, params } or { ok: false, error }.
export function importFract({ S, m, notes }) {
  const slots = Object.keys(m).filter(k => /^formula_\d+$/.test(k)).map(k => ({ n: +k.split('_')[1], id: +nums(m[k])[0] })).filter(x => x.id > 0);
  if (!slots.length) return { ok: false, error: 'No formula in the file (Mandelbulber defaults to Mandelbulb, which Pyxis does not have)' };
  if (slots.length > 1) return { ok: false, error: `Hybrid of ${slots.length} formulas (${slots.map(x => x.id).join(', ')}); Pyxis imports single Mandelbox-family formulas only` };
  const { n, id } = slots[0];
  if (!MB_FORMULAS[id]) return { ok: false, error: `Formula ${id} is not one Pyxis can import (supported: ${Object.entries(MB_FORMULAS).map(([k, v]) => `${v[1]} (${k})`).join(', ')})` };
  if (bool(m, 'hybrid_fractal_enable', false)) notes.push('Hybrid mode with a single formula: imported as that formula.');
  const [V, name] = MB_FORMULAS[id];
  const f = S[`fractal_${n}`] || {};
  const o = mapFormula(V, f, notes);

  // c addition (hybrid_fractal_sequences.cpp): addc = !dont_add_c_constant,
  // inverted for formulas that are cpixelDisabledByDefault.
  const dont = bool(m, `dont_add_c_constant_${n}`, false);
  o.addC = C_OFF.has(id) ? dont : !dont;
  o.juliaMode = bool(m, 'julia_mode', false);
  [o.juliaCX, o.juliaCY, o.juliaCZ] = vec(m, 'julia_c', [0, 0, 0]);
  [o.cMulX, o.cMulY, o.cMulZ] = vec(m, 'fractal_constant_factor', [1, 1, 1]);
  if (V === 12) o.w0 = num(m, 'initial_waxis', 0);
  o.bailout = num(m, 'bailout', 100);
  if (num(m, `formula_iterations_${n}`, 1) !== 1 || num(m, `formula_weight_${n}`, 1) !== 1) notes.push('Formula weight / repeat count is not supported.');
  if (num(m, `formula_start_iteration_${n}`, 0) !== 0 || num(m, `formula_stop_iteration_${n}`, 250) !== 250) notes.push('Formula start / stop iteration is not supported.');
  // Pyxis's DE is Mandelbulber's linear r / DE exactly, so Step Factor = DE_factor.
  o.stepFactor = Math.min(4, Math.max(0.01, num(m, 'DE_factor', 1)));
  return { ok: true, formula: name, params: o };
}
