// Pyxis's formula parameters (the LEFT dock: which box formula, and its
// folds, sphere fold, scale, rotation and c). The right dock (scene & output)
// is Organon's; see core/engine/params.js for the field reference.
// defineParams() runs once, when this module loads.
//
// Every formula is a port of Mandelbulber's own code (formula/definition/
// fractal_*.cpp). One parameter can mean the matching field of several
// formulas — e.g. "Fold Limit" is mandelbox_folding_limit for Mandelbox and
// transf_addition_constant_111 for the ABox mods — so formulas share controls.
// Each formula's own defaults are in presets.js (VARIANT_DEFAULTS).

import { defineParams, marchParams } from '../core/engine/params.js';
export * from '../core/engine/params.js';

export const BOX_VARIANTS = [
  'Mandelbox',               // 0  fractal_mandelbox.cpp (8)
  'ABox Mod 1',              // 1  fractal_abox_mod1.cpp (64)
  'ABox Mod 2',              // 2  fractal_abox_mod2.cpp (75)
  'ABox Mod 11',             // 3  fractal_abox_mod11.cpp (119)
  'ABox Mod 12',             // 4  fractal_abox_mod12.cpp (123)
  'ABox Mod 13',             // 5  fractal_abox_mod13.cpp (127)
  'ABox Mod 14',             // 6  fractal_abox_mod14.cpp (206)
  'ABox Mod 15',             // 7  fractal_abox_mod15.cpp (226)
  'Kali Box (ABox Mod Kali)', // 8 fractal_abox_mod_kali.cpp (60)
  'ABox Mod Kali V2',        // 9  fractal_abox_mod_kali_v2.cpp (135)
  'ABox Mod Kali V3',        // 10 fractal_abox_mod_kali_v3.cpp (136)
  'ABox Mod Kali-Eiffie',    // 11 fractal_abox_mod_kali_eiffie.cpp (87)
  'Mandelbox Vary Scale 4D', // 12 fractal_mandelbox_vary_scale4d.cpp (18)
  // Fragmentarium (FragM examples) — ported from the original .frag DE().
  'Kalibox (Kali · Fragmentarium)',     // 13 Kali's Creations/Kalibox.frag
  'MandalayBox (Knighty)',              // 14 Knighty Collection/MandalayBox.frag + Pseudo-MandalayBox.frag
  'SurfBox (DarkBeam)',                 // 15 mclarekin/darkbeam_surfbox.frag
  'SphereBox 4D (Aexion)',              // 16 mclarekin/AexionnSphereBoxRot4D.frag
  'TetraBox (Aexion)',                  // 17 mclarekin/Aexions_TetraBox2.frag
  'PetraBox (iRyanBell)',               // 18 3Dickulus/PetraBox.frag
  'ABox Inverse Cylinder (CozyG)',      // 19 CozyG/abox_inCyl-10.frag
];
export const MB_VARIANT_COUNT = 13; // 0–12 come from Mandelbulber, 13+ from Fragmentarium

// Which formulas use which control (gateEq lists on 'boxVariant').
export const USES = {
  boxFold:  [0, 2, 3, 4, 5, 6, 7, 11, 15, 16, 17, 19], // Tglad box fold with per-axis limits
  foldValue: [0, 1, 11],
  zFold:    [1, 2, 3, 4, 5, 6, 7, 9, 11],
  sphere:   [0, 1, 2, 3, 4, 5, 7, 9, 15, 16, 17], // min/fixed R² sphere fold
  minR2:    [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  sphOff:   [0, 3, 4, 5, 16, 17],
  rPower:   [1, 2],
  vary:     [1, 2, 3, 12, 15],             // mandelbox_vary_scale_vary / SurfBox varyScale
  varyA:    [4, 5, 6, 7],                  // transf_scale_vary_0 (actualScaleA)
  smooth:   [3, 4, 5, 6],                  // smooth (Tglad-S) box fold
  swap:     [3, 4, 5, 11],
  kaliAdd:  [8, 9, 10],
  add:      [3, 4, 5, 6, 7, 9, 10, 11],
  pre:      [6, 7],
  rot:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11],
  deOff:    [6, 7, 15],
  cIn:      [6, 7],
  addC:     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 19],
  julia:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19],
  bailout:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19],
  axisRot:  [13, 14, 15, 18, 19],          // Fragmentarium rotationMatrix3(RotVector, RotAngle)
  eulerRot: [16, 17],                      // Fragmentarium rotationMatrixXYZ(Rotation)
  rot4:     [12, 16],
};

export const GROUPS_LEFT = [
  { id: 'presets', side: 'left', title: 'Presets', accent: true, open: true },
  { id: 'variant', side: 'left', title: 'Box Formula', accent: true, open: true },
  { id: 'fold',    side: 'left', title: 'Box Fold', open: true },
  { id: 'sphere',  side: 'left', title: 'Sphere Fold & Scale', open: true },
  { id: 'extras',  side: 'left', title: 'Formula Options', accent: true },
  { id: 'cgroup',  side: 'left', title: 'c / Julia' },
  { id: 'iter',    side: 'left', title: 'Iteration' },
];

const g = (list, extra = {}) => ({ gate: 'boxVariant', gateEq: list, ...extra });
const xyz = (id, labels, base, gate, defs, row, section) => labels.map((l, i) => ({
  id: id + 'XYZ'[i], label: l, ...base, def: Array.isArray(defs) ? defs[i] : defs, row, ...(i === 0 && section ? { section } : {}), ...gate,
}));
const ANG = { type: 'range', min: -180, max: 180, step: 0.1, mutate: true };

export const FORMULA_PARAMS = [
  // ── Formula ──────────────────────────────────────────────────────────────
  { id: 'boxVariant', label: 'Formula', type: 'select', group: 'variant', options: BOX_VARIANTS, def: 0 },

  // ── Box fold ─────────────────────────────────────────────────────────────
  ...xyz('fold', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: 0, max: 3, step: 0.001, mutate: true }, g(USES.boxFold), 1, 'fold', 'Fold Limit'),
  { id: 'fold4', label: 'Fold Limit (xyzw)', type: 'range', group: 'fold', min: 0, max: 3, step: 0.001, def: 1, mutate: true, ...g([12]) },
  { id: 'foldValue', label: 'Fold Value', type: 'range', group: 'fold', min: 0, max: 4, step: 0.001, def: 2, mutate: true, ...g(USES.foldValue) },
  ...xyz('foldOff', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: -2, max: 2, step: 0.001, mutate: true }, g([1]), 0, 'foff', 'Fold Offset'),
  { id: 'zFold', label: 'Fold Z', type: 'bool', group: 'fold', def: true, ...g(USES.zFold) },
  { id: 'zFoldScale', label: 'Z Fold Scale', type: 'range', group: 'fold', min: 0, max: 3, step: 0.001, def: 1, mutate: true, ...g([1, 11]) },
  { id: 'eiffZBox', label: 'Extra Z Box Fold', type: 'bool', group: 'fold', def: false, ...g([11]) },
  ...xyz('kaliAdd', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: -1, max: 2, step: 0.001, mutate: true }, g(USES.kaliAdd), 0.5, 'kadd', 'Kali Fold  (k − |z|)'),
  // Fragmentarium formulas.
  { id: 'foldW', label: 'Fold Limit W', type: 'range', group: 'fold', min: 0, max: 3, step: 0.001, def: 1, mutate: true, ...g([16, 17]) },
  ...xyz('fmTrans', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: -3, max: 3, step: 0.001, mutate: true }, g([13]), 0.5, 'fmtr', 'Kali Fold  (|z| + T)'),
  { id: 'mdBoxFold', label: 'Mandelbox Box Fold First', type: 'bool', group: 'fold', def: false, ...g([14]) },
  ...xyz('mdFo', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: 0, max: 2, step: 0.001, mutate: true }, g([14]), 0.5, 'mdfo', 'DarkBeam Fold Offset (fo)'),
  ...xyz('mdG', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: 0, max: 2, step: 0.001, mutate: true }, g([14]), 0.1, 'mdg', 'DarkBeam Fold Height (g)'),
  { id: 'mdPseudo', label: 'Pseudo-MandalayBox', type: 'bool', group: 'fold', def: false, ...g([14]) },
  ...xyz('mdW', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: 0, max: 2, step: 0.001, mutate: true }, { gate: 'mdPseudo' }, 0, 'mdw', 'DarkBeam Fold Width (gw)'),
  { id: 'mdSerial', label: 'Serial Folds (not parallel)', type: 'bool', group: 'fold', def: false, ...g([14]) },
  ...xyz('sbFoldMod', ['X', 'Y', 'Z'], { type: 'range', group: 'fold', min: 0, max: 6, step: 0.001, mutate: true }, g([15]), 2, 'sbfm', 'SurfBox Fold Cap'),
  { id: 'tbCTOff', label: 'Tetra Offset', type: 'range', group: 'fold', min: -3, max: 5, step: 0.001, def: 3, mutate: true, ...g([17]) },
  { id: 'pbFold', label: 'Box Fold', type: 'range', group: 'fold', min: -2, max: 3, step: 0.001, def: 1, mutate: true, ...g([18]) },

  // ── Sphere fold & scale ─────────────────────────────────────────────────
  { id: 'minR2', label: 'Min R²', type: 'range', group: 'sphere', min: 0, max: 1.5, step: 0.0001, def: 0.25, hardMin: 0, mutate: true, fine: true, ...g(USES.minR2) },
  { id: 'fixR2', label: 'Fixed R²', type: 'range', group: 'sphere', min: 0.05, max: 3, step: 0.0001, def: 1, hardMin: 0.0001, mutate: true, ...g(USES.sphere) },
  ...xyz('sphOff', ['X', 'Y', 'Z'], { type: 'range', group: 'sphere', min: -2, max: 2, step: 0.001, mutate: true }, g(USES.sphOff), 0, 'soff', 'Sphere Centre'),
  { id: 'sphOffW', label: 'Sphere Centre W', type: 'range', group: 'sphere', min: -2, max: 2, step: 0.001, def: 0, mutate: true, ...g([16, 17]) },
  { id: 'rPowerOn', label: 'r Power', type: 'bool', group: 'sphere', def: false, ...g(USES.rPower) },
  { id: 'rPower', label: 'r Power ×', type: 'range', group: 'sphere', min: 0.2, max: 3, step: 0.001, def: 1, mutate: true, gate: 'rPowerOn' },
  { id: 'rPower4', label: 'r Power', type: 'range', group: 'sphere', min: 0.2, max: 3, step: 0.001, def: 1, mutate: true, ...g([12]) },
  { id: 'scale', label: 'Scale', type: 'range', group: 'sphere', min: -4, max: 4, step: 0.001, def: 2, mutate: true, fine: true, section: 'Scale' },
  { id: 'scaleVary', label: 'Scale Vary', type: 'range', group: 'sphere', min: -1, max: 1, step: 0.0001, def: 0, mutate: true, fine: true, ...g(USES.vary) },
  { id: 'varyAOn', label: 'Vary Scale (per iteration)', type: 'bool', group: 'sphere', def: false, ...g([4, 5, 6, 7]) },
  { id: 'varyA', label: 'Vary ×', type: 'range', group: 'sphere', min: -1, max: 1, step: 0.0001, def: 0, mutate: true, fine: true, gate: 'varyAOn' },
  { id: 'varyABase', label: 'Vary Base', type: 'range', group: 'sphere', min: 0, max: 3, step: 0.001, def: 1, gate: 'varyAOn' },
  { id: 'varyASet', label: 'Vary: Replace (not accumulate)', type: 'bool', group: 'sphere', def: false, gate: 'varyAOn' },
  { id: 'fmVaryOff', label: 'Scale Vary Offset', type: 'range', group: 'sphere', min: -1, max: 1, step: 0.0001, def: 1, mutate: true, ...g([15]) },
  { id: 'deOff', label: 'DE Offset', type: 'range', group: 'sphere', min: 0, max: 2, step: 0.001, def: 1, ...g(USES.deOff) },

  // ── Rotation ─────────────────────────────────────────────────────────────
  { id: 'fRotOn', label: 'Rotation', type: 'bool', group: 'sphere', def: false, section: 'Rotation (degrees)', ...g(USES.rot) },
  ...xyz('fRot', ['X', 'Y', 'Z'], { ...ANG, group: 'sphere' }, { gate: 'fRotOn' }, 0, 'rot'),
  ...xyz('fRot2', ['X', 'Y', 'Z'], { ...ANG, group: 'sphere' }, g([7]), 0, 'rot2', 'Rotation 2 (every iteration)'),
  ...xyz('fmAxis', ['X', 'Y', 'Z'], { type: 'range', group: 'sphere', min: -1, max: 1, step: 0.001 }, g(USES.axisRot), 1, 'fmax', 'Rotation Axis (every iteration)'),
  { id: 'fmAngle', label: 'Rotation Angle', type: 'range', group: 'sphere', min: -180, max: 360, step: 0.1, def: 0, mutate: true, ...g(USES.axisRot) },
  ...xyz('fmEuler', ['X', 'Y', 'Z'], { ...ANG, group: 'sphere' }, g(USES.eulerRot), 0, 'fmeu', 'Rotation (degrees, every iteration)'),

  // ── Formula options ─────────────────────────────────────────────────────
  // Mandelbox: rotated folds (mandelbox_rotations_enabled).
  { id: 'rotFolds', label: 'Rotated Folds', type: 'bool', group: 'extras', def: false, ...g([0]) },
  ...xyz('rfNX', ['a', 'b', 'c'], { ...ANG, group: 'extras' }, { gate: 'rotFolds' }, 0, 'rfnx', 'X fold past +limit (rotation_neg_1)'),
  ...xyz('rfPX', ['a', 'b', 'c'], { ...ANG, group: 'extras' }, { gate: 'rotFolds' }, 0, 'rfpx', 'X fold past −limit (rotation_pos_1)'),
  ...xyz('rfNY', ['a', 'b', 'c'], { ...ANG, group: 'extras' }, { gate: 'rotFolds' }, 0, 'rfny', 'Y fold past +limit (rotation_neg_2)'),
  ...xyz('rfPY', ['a', 'b', 'c'], { ...ANG, group: 'extras' }, { gate: 'rotFolds' }, 0, 'rfpy', 'Y fold past −limit (rotation_pos_2)'),
  ...xyz('rfNZ', ['a', 'b', 'c'], { ...ANG, group: 'extras' }, { gate: 'rotFolds' }, 0, 'rfnz', 'Z fold past +limit (rotation_neg_3)'),
  ...xyz('rfPZ', ['a', 'b', 'c'], { ...ANG, group: 'extras' }, { gate: 'rotFolds' }, 0, 'rfpz', 'Z fold past −limit (rotation_pos_3)'),
  // ABox Mod 2: cylinder.
  { id: 'cylHalf', label: 'Cylinder Half Length', type: 'range', group: 'extras', min: 0, max: 2, step: 0.001, def: 0.5, mutate: true, ...g([2]) },
  { id: 'cylScale', label: 'Cylinder Cap Scale', type: 'range', group: 'extras', min: 0, max: 3, step: 0.001, def: 1, mutate: true, ...g([2]) },
  // Mod 11 / 12 / 13 / 14: smooth box fold (Tglad-S), first iterations.
  { id: 'smoothOn', label: 'Smooth Box Fold', type: 'bool', group: 'extras', def: false, ...g(USES.smooth) },
  ...xyz('smooth', ['X', 'Y', 'Z'], { type: 'range', group: 'extras', min: -2, max: 2, step: 0.001, mutate: true }, { gate: 'smoothOn' }, 0, 'smooth'),
  { id: 'smoothStart', label: 'Smooth From Iter', type: 'range', group: 'extras', min: 0, max: 40, step: 1, def: 0, int: true, gate: 'smoothOn', row: 'smit' },
  { id: 'smoothStop', label: 'Before Iter', type: 'range', group: 'extras', min: 0, max: 40, step: 1, def: 1, int: true, gate: 'smoothOn', row: 'smit' },
  { id: 'swapXZ', label: 'Swap X ↔ Z', type: 'bool', group: 'extras', def: false, ...g(USES.swap) },
  // Mod 11: post scale for the first iterations.
  { id: 'postScale', label: 'Post Scale', type: 'range', group: 'extras', min: 0, max: 3, step: 0.001, def: 1, mutate: true, ...g([3]) },
  { id: 'postScaleStop', label: 'Post Scale Before Iter', type: 'range', group: 'extras', min: 0, max: 40, step: 1, def: 1, int: true, ...g([3]) },
  // Mod 12: sphere-fold min R² biased by |c| (or c²), and the cuboid fold.
  { id: 'sphOn', label: 'Biased Sphere Fold', type: 'bool', group: 'extras', def: true, ...g([4]) },
  ...xyz('bias', ['X', 'Y', 'Z'], { type: 'range', group: 'extras', min: -1, max: 1, step: 0.001, mutate: true }, { gate: 'sphOn' }, 0, 'bias', 'Min R² += bias · |c|'),
  { id: 'biasSq', label: 'Bias by c²', type: 'bool', group: 'extras', def: false, gate: 'sphOn' },
  { id: 'biasClamp', label: 'Clamp Min R² to Fixed R²', type: 'bool', group: 'extras', def: true, gate: 'sphOn' },
  { id: 'cuboidOn', label: 'Cuboid Fold', type: 'bool', group: 'extras', def: false, ...g([4]) },
  ...xyz('cub', ['X', 'Y', 'Z'], { type: 'range', group: 'extras', min: 0, max: 4, step: 0.001, mutate: true }, { gate: 'cuboidOn' }, 0.2, 'cub'),
  { id: 'cubSq', label: 'Cuboid on z²', type: 'bool', group: 'extras', def: false, gate: 'cuboidOn' },
  // Mod 13: add the inverse of c first.
  { id: 'invC', label: 'Add Inverse c', type: 'bool', group: 'extras', def: false, ...g([5]) },
  ...xyz('invCS', ['X', 'Y', 'Z'], { type: 'range', group: 'extras', min: -3, max: 3, step: 0.001, mutate: true }, { gate: 'invC' }, 1, 'invc'),
  { id: 'invCAcc', label: 'Accumulate (alternate)', type: 'bool', group: 'extras', def: false, gate: 'invC' },
  // Mod 14: inversion instead of the sphere fold.
  { id: 'invMin', label: 'Inversion Min R²', type: 'range', group: 'extras', min: 0, max: 1, step: 0.0001, def: 0, mutate: true, ...g([6]) },
  { id: 'invMax', label: 'Inversion Max R²', type: 'range', group: 'extras', min: 0.05, max: 3, step: 0.0001, def: 1, hardMin: 0.0001, mutate: true, ...g([6]) },
  // Pre-sphere offset (Mod 14 offset000 / Mod 15 offsetA000), post add (additionConstant).
  ...xyz('pre', ['X', 'Y', 'Z'], { type: 'range', group: 'extras', min: -2, max: 2, step: 0.001, mutate: true }, g(USES.pre), 0, 'pre', 'Offset Before Sphere Fold'),
  { id: 'addOn', label: 'Add Offset', type: 'bool', group: 'extras', def: false, ...g([6]) },
  { id: 'addMul', label: 'Offset × per Iteration', type: 'range', group: 'extras', min: -2, max: 2, step: 0.001, def: 1, gate: 'addOn' },
  { id: 'addAlt', label: 'Alternate Offset Sign', type: 'bool', group: 'extras', def: false, ...g([5, 6]) },
  { id: 'addAltScale', label: 'Alternate ×', type: 'range', group: 'extras', min: -2, max: 2, step: 0.001, def: 1, gate: 'addAlt' },
  ...xyz('add', ['X', 'Y', 'Z'], { type: 'range', group: 'extras', min: -2, max: 2, step: 0.001, mutate: true }, g(USES.add), 0, 'add', 'Offset After Scale'),
  // Kali V3: stop the Kali fold after N iterations (then only the offset is added).
  { id: 'kaliStop', label: 'Kali Fold Before Iter', type: 'range', group: 'extras', min: 1, max: 60, step: 1, def: 15, int: true, ...g([10]) },
  // Mandelbox Vary Scale 4D: initial w and the 4D rotation.
  { id: 'w0', label: 'Initial W', type: 'range', group: 'extras', min: -2, max: 2, step: 0.001, def: 0, mutate: true, fine: true, ...g([12]) },
  { id: 'rot4On', label: '4D Rotation', type: 'bool', group: 'extras', def: false, ...g(USES.rot4) },
  ...xyz('r4a', ['XY', 'YZ', 'XZ'], { ...ANG, group: 'extras' }, { gate: 'rot4On' }, 0, 'r4a'),
  ...xyz('r4b', ['XW', 'YW', 'ZW'], { ...ANG, group: 'extras' }, { gate: 'rot4On' }, 0, 'r4b'),

  // ABox Inverse Cylinder (CozyG): (x cos(y·sy), x sin(y·sy), z·sz)·k at two iterations.
  { id: 'icScaleY', label: 'Cylinder Y Scale', type: 'range', group: 'extras', min: -5, max: 5, step: 0.001, def: 1, mutate: true, ...g([19]) },
  { id: 'icScaleZ', label: 'Cylinder Z Scale', type: 'range', group: 'extras', min: -5, max: 5, step: 0.001, def: 1, mutate: true, ...g([19]) },
  { id: 'icScaleInv', label: 'Cylinder Scale', type: 'range', group: 'extras', min: -5, max: 5, step: 0.001, def: 1, mutate: true, ...g([19]) },
  { id: 'icIterA', label: 'At Iteration A', type: 'range', group: 'extras', min: 0, max: 60, step: 1, def: 6, int: true, hardMax: 300, ...g([19]), row: 'icit' },
  { id: 'icIterB', label: 'And B', type: 'range', group: 'extras', min: 0, max: 60, step: 1, def: 60, int: true, hardMax: 300, ...g([19]), row: 'icit' },

  // ── c / Julia ────────────────────────────────────────────────────────────
  { id: 'addC', label: 'Add c', type: 'bool', group: 'cgroup', def: true, ...g(USES.addC) },
  { id: 'juliaMode', label: 'Julia Mode', type: 'bool', group: 'cgroup', def: false, ...g(USES.julia) },
  ...xyz('juliaC', ['X', 'Y', 'Z'], { type: 'range', group: 'cgroup', min: -3, max: 3, step: 0.001, mutate: true }, { gate: 'juliaMode' }, 0, 'julia', 'Julia Seed (c)'),
  ...xyz('cMul', ['X', 'Y', 'Z'], { type: 'range', group: 'cgroup', min: -3, max: 3, step: 0.001 }, { gate: 'addC' }, 1, 'cmul', 'c Multiplier'),
  // Mod 14 / Mod 15 add c inside the formula as well.
  { id: 'cIn', label: 'Add c Inside Formula', type: 'bool', group: 'cgroup', def: false, ...g(USES.cIn) },
  ...xyz('cInMul', ['X', 'Y', 'Z'], { type: 'range', group: 'cgroup', min: -3, max: 3, step: 0.001 }, { gate: 'cIn' }, 1, 'cinm'),
  { id: 'cInSigned', label: 'Signed (sign(z)·|c|)', type: 'bool', group: 'cgroup', def: false, gate: 'cIn' },

  // ── Iteration ────────────────────────────────────────────────────────────
  { id: 'iterations', label: 'Iterations', type: 'range', group: 'iter', min: 1, max: 60, step: 1, def: 16, int: true, hardMin: 1, hardMax: 250 },
  { id: 'bailout', label: 'Bailout', type: 'range', group: 'iter', min: 2, max: 1000, step: 1, def: 100, hardMin: 1, ...g(USES.bailout) },
  ...marchParams({ stepFactor: { label: 'Step Factor (1 = exact DE)' } }),
];

defineParams({
  groups: GROUPS_LEFT,
  params: FORMULA_PARAMS,
  scene: {
    override: {
      // Mandelbox scale 2 at 16 iterations: a cube, seen from a corner.
      rotX: { def: 0.7 }, rotY: { def: -0.45 }, dist: { def: 11 },
      // The formulas run in Mandelbulber's frame (Z up); stand it upright.
      objRotX: { def: -90 },
    },
  },
});
