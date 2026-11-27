// Template formula: uniforms and the CPU port of mapLocal(), line for line.

import { effectiveIterations } from '../core/engine/params.js';

export function uniforms(v, scaleOverride) {
  return {
    __f: null, // no program specialisation
    u_iterations: effectiveIterations(v),
    u_scale: scaleOverride ?? v.scale,
    u_minR: v.minR,
    u_fixedR2: v.fixedR * v.fixedR,
    u_fold: [v.foldX, v.foldY, v.foldZ],
    u_juliaMode: !!v.juliaMode,
    u_juliaC: [v.juliaCX, v.juliaCY, v.juliaCZ],
  };
}

// p → { d, trap } in the fractal's own frame (Organon adds the object
// transform, repetition and marching).
export function localDE(v, scaleOverride) {
  const scale = scaleOverride ?? v.scale, iters = effectiveIterations(v);
  const minR2 = v.minR * v.minR, fixedR2 = v.fixedR * v.fixedR;
  const f = [v.foldX, v.foldY, v.foldZ], jc = [v.juliaCX, v.juliaCY, v.juliaCZ];
  const colIters = v.colorIters ?? 40, src = v.colorSource | 0, fcw = v.foldColW ?? 1;
  return p => {
    let z = [p[0], p[1], p[2]], dr = 1, trap = 1e10, folds = 0;
    const c = v.juliaMode ? jc : p;
    for (let i = 0; i < iters; i++) {
      const on = i < colIters ? 1 : 0;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(z[k]) >= f[k]) folds += on;
        z[k] = Math.min(Math.max(z[k], -f[k]), f[k]) * 2 - z[k];
      }
      const r2 = z[0] * z[0] + z[1] * z[1] + z[2] * z[2];
      if (r2 < minR2) { const k = fixedR2 / minR2; z = z.map(x => x * k); dr *= k; folds += on; }
      else if (r2 < fixedR2) { const k = fixedR2 / r2; z = z.map(x => x * k); dr *= k; folds += 0.5 * on; }
      z = [scale * z[0] + c[0], scale * z[1] + c[1], scale * z[2] + c[2]];
      dr = dr * Math.abs(scale) + 1;
      const zz = z[0] * z[0] + z[1] * z[1] + z[2] * z[2];
      trap = Math.min(trap, zz);
      if (zz > 1e4) break;
    }
    if (src === 1) trap = folds * fcw * 2.5;
    else if (src === 2) trap += folds * fcw * 2.5;
    return { d: Math.hypot(z[0], z[1], z[2]) / Math.abs(dr), trap };
  };
}
