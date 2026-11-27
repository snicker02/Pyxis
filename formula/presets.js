// Pyxis's presets: formula defaults and descriptions, the scenes, Rebirth's
// random geometry.

import { defaults, BOX_VARIANTS, FORMULA_PARAMS, MB_VARIANT_COUNT } from './params.js';
import { r, ri, pick } from '../core/engine/presets.js';
import { mapFormula, C_OFF, MB_FORMULAS } from './mbimport.js';
import { SCENES } from './scenes.js';

// Each formula at Mandelbulber's own defaults (what an empty .fract section maps to).
const MB_ID = Object.fromEntries(Object.entries(MB_FORMULAS).map(([id, [v]]) => [v, +id]));
// Fragmentarium formulas: the slider defaults of their .frag files.
const FORMULA_DEFS = Object.fromEntries(FORMULA_PARAMS.filter(p => p.group !== 'iter' && p.group !== 'variant' && 'def' in p).map(p => [p.id, p.def]));
const FRAGM_DEFAULTS = {
  13: { iterations: 17, scale: 1.3, minR2: 0.25, fmTransX: 0.5, fmTransY: 0.5, fmTransZ: 0.5, juliaMode: true, juliaCX: -1, juliaCY: -1, juliaCZ: -1 },
  14: { iterations: 10, bailout: 100, scale: 2, minR2: 0.25, fmAxisX: 1, fmAxisY: 0, fmAxisZ: 0, juliaCX: 1, juliaCY: 1, juliaCZ: 1 },
  15: { iterations: 60, bailout: 100 },
  16: { iterations: 17, bailout: 1000 },
  17: { iterations: 17, bailout: 100 },
  18: { iterations: 9 },
  19: { iterations: 60, bailout: 100 },
};
export const VARIANT_DEFAULTS = BOX_VARIANTS.map((_, V) => V < MB_VARIANT_COUNT
  ? { ...mapFormula(V, {}, null), addC: !C_OFF.has(MB_ID[V]) }
  : { ...FORMULA_DEFS, boxVariant: V, ...FRAGM_DEFAULTS[V] });

export const VARIANT_DESC = [
  'Tom Lowe\'s Mandelbox: box fold (reflect past the limit), sphere fold (invert between min and fixed radius), scale, add c. Scale −1.5 to −2 gives the classic box; +2 to +3 the "inside-out" sponge. Rotated Folds tilt each fold plane.',
  'ABox Mod 1: a folded-value box fold with an offset, z fold scaled separately, sphere fold on min R² / fixed R², optional r power. Adds c as (y, x, z).',
  'ABox Mod 2: the sphere fold measures a capsule (cylinder with caps) instead of a sphere, so the inversion carves tubes.',
  'ABox Mod 11: Mandelbox with a sphere-fold centre offset, post-scale offset, X↔Z swap and a smooth box fold for the first iterations.',
  'ABox Mod 12: the min radius grows with |c| (or c²) so the inner sphere fold changes across space; optional cuboid fold.',
  'ABox Mod 13: Mod 11 plus "add inverse c" before the fold and an offset that can alternate sign every iteration.',
  'ABox Mod 14: a plain inversion (1/r²) between two radii instead of the sphere fold, c added inside the formula.',
  'ABox Mod 15: fold, offset, sphere fold, scale, then offset and Rotation 2 every iteration — rotation inside the loop twists the box.',
  'Kali\'s box (ABox Mod Kali): z = k − |z|, then divide by r² clamped to [min R², 1]. Kali\'s original "abs fold" Mandelbox: organic, cave-like.',
  'ABox Mod Kali V2: Kali fold with a separate fixed radius and an offset added before and after the rotation.',
  'ABox Mod Kali V3: Kali fold with a negative scale for the first iterations, then only the offset — a Julia-like set of nested shells.',
  'Kali-Eiffie box: Tglad fold, X↔Z swap and a conditional X/Y swap (a mirror on x = y) before Kali\'s divide. No c by default.',
  'Mandelbox Vary Scale 4D: the box in four dimensions (w starts at Initial W), with the scale varying each iteration and optional 4D plane rotations.',
  'Kalibox, Kali\'s original Fragmentarium version: rotate, |z| + T, Rrrola\'s sphere fold and scale, then the Julia seed (no c without Julia). Uses Rrrola\'s DE and runs every iteration (no bailout).',
  'MandalayBox (Knighty): DarkBeam\'s fold pulls each coordinate in or out around fo / g (parallel or serial), then a sphere fold, scale and c. Pseudo-MandalayBox adds the fold width gw. Mandelbox fold first is optional.',
  'SurfBox (DarkBeam): a box fold whose push is capped per axis (Fold Cap), then the standard sphere fold, scale with optional per-iteration vary, rotation and c. Bails out on the sphere-fold r².',
  'SphereBox 4D (Aexion): the box in 4D starting from (p, |p|), sphere fold with an offset centre, scale, rotation and optional 4D plane rotations; adds the 4D start point each iteration.',
  'TetraBox (Aexion): the 4D box started from p in tetrahedral coordinates (|x+y+z|, |−x−y+z|, …) shifted by the Tetra Offset, which is also added back each iteration.',
  'PetraBox (iRyanBell): a Mandelbox that adds the previous iteration\'s point (or, in Julia mode, its average with the start), with an accumulated-difference DE. No bailout.',
  'ABox Inverse Cylinder (CozyG): Rrrola\'s Mandelbox with c, plus a cylindrical twist (x cos(y·sy), x sin(y·sy), z·sz)·k applied at iterations A and B.',
];

export const BIOMES = SCENES;

// Rebirth: one random candidate (Organon scores it for visibility).
export function rebirthCandidate(current) {
  const V = current.boxVariant | 0;
  const g = { ...VARIANT_DEFAULTS[V] };
  if (V === 0 || V === 3 || V === 5) {
    g.scale = Math.random() < 0.6 ? r(-2.4, -1.3) : r(1.6, 3);
    g.minR2 = r(0.02, 0.5); g.fixR2 = r(0.7, 1.4);
    if (Math.random() < 0.3) { g.fRotOn = true; g.fRotX = r(-15, 15); g.fRotY = r(-15, 15); g.fRotZ = r(-15, 15); }
  } else if (V >= 8 && V <= 10) {
    g.scale = V === 10 ? r(1.2, 2.2) : r(1.2, 2.4);
    g.kaliAddX = r(0.2, 1.2); g.kaliAddY = r(0.2, 1.2); g.kaliAddZ = r(0.2, 1.2);
    g.minR2 = r(0.05, 0.7);
  } else if (V === 13) {
    g.scale = r(1.4, 2.4); g.minR2 = r(0.1, 0.6);
    g.fmTransX = r(-0.4, 0.4); g.fmTransY = r(-2, 0.5); g.fmTransZ = r(-0.4, 0.4);
    g.juliaCX = r(-1.2, 0.2); g.juliaCY = r(-1.5, 0.2); g.juliaCZ = r(-1.2, 0.2);
  } else if (V === 14) {
    g.scale = pick([-1, 1]) * r(1.6, 2.6); g.minR2 = r(0.05, 0.4);
    g.mdFoX = g.mdFoY = g.mdFoZ = r(0.2, 0.9); g.mdGX = g.mdGY = g.mdGZ = r(0, 0.4);
    g.mdSerial = Math.random() < 0.3; g.mdBoxFold = Math.random() < 0.3;
  } else if (V >= 16 && V <= 17) {
    g.scale = r(1.6, 2.6); g.minR2 = r(0.05, 0.5);
    if (Math.random() < 0.4) { g.fmEulerX = r(-20, 20); g.fmEulerY = r(-20, 20); g.fmEulerZ = r(-20, 20); }
  } else if (V === 18) {
    g.scale = pick([-1, 1]) * r(1.6, 2.6); g.minR2 = r(0.05, 0.5); g.pbFold = r(0.7, 1.3);
  } else {
    g.scale = (V === 6 || V === 7 ? 1 : pick([-1, 1])) * r(1.4, 2.6);
    g.minR2 = r(0.05, 0.5);
  }
  g.foldX = r(0.6, 1.4); g.foldY = r(0.6, 1.4); g.foldZ = r(0.6, 1.4);
  if (V !== 13 && V !== 16 && V !== 17) {
    g.juliaMode = Math.random() < 0.25;
    if (g.juliaMode) { g.juliaCX = r(-1, 1); g.juliaCY = r(-1, 1); g.juliaCZ = r(-1, 1); }
  }
  if ([13, 15, 18, 19].includes(V) && Math.random() < 0.4) { g.fmAxisX = r(-1, 1); g.fmAxisY = r(-1, 1); g.fmAxisZ = r(-1, 1); g.fmAngle = r(-30, 30); }
  Object.assign(g, { rotX: r(-Math.PI, Math.PI), rotY: r(-0.7, 0.7), dist: r(4, 14), targetX: 0, targetY: 0, targetZ: 0, iterations: V === 18 ? 6 + ri(6) : 12 + ri(10) });
  return g;
}
export const REBIRTH_TARGET = { hit: 0.6, lo: 0.3, hi: 0.92 };

export { defaults };
