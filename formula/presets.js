// Pyxis's presets: formula defaults and descriptions, the scenes, Rebirth's
// random geometry.

import { defaults, BOX_VARIANTS } from './params.js';
import { r, ri, pick } from '../core/engine/presets.js';
import { mapFormula, C_OFF, MB_FORMULAS } from './mbimport.js';
import { SCENES } from './scenes.js';

// Each formula at Mandelbulber's own defaults (what an empty .fract section maps to).
const MB_ID = Object.fromEntries(Object.entries(MB_FORMULAS).map(([id, [v]]) => [v, +id]));
export const VARIANT_DEFAULTS = BOX_VARIANTS.map((_, V) => ({ ...mapFormula(V, {}, null), addC: !C_OFF.has(MB_ID[V]) }));

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
  } else {
    g.scale = (V === 6 || V === 7 ? 1 : pick([-1, 1])) * r(1.4, 2.6);
    g.minR2 = r(0.05, 0.5);
  }
  g.foldX = r(0.6, 1.4); g.foldY = r(0.6, 1.4); g.foldZ = r(0.6, 1.4);
  g.juliaMode = Math.random() < 0.25;
  if (g.juliaMode) { g.juliaCX = r(-1, 1); g.juliaCY = r(-1, 1); g.juliaCZ = r(-1, 1); }
  Object.assign(g, { rotX: r(-Math.PI, Math.PI), rotY: r(-0.7, 0.7), dist: r(4, 14), targetX: 0, targetY: 0, targetZ: 0, iterations: 12 + ri(10) });
  return g;
}
export const REBIRTH_TARGET = { hit: 0.6, lo: 0.3, hi: 0.92 };

export { defaults };
