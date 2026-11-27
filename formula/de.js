// CPU port of Pyxis's distance estimator (mapLocal in formula/glsl.js), line
// for line, in double precision. Organon (core/engine/de.js) adds the object
// transform, repetition and marching. Used for autofocus, Rebirth, Auto-fix
// Cut-offs and Auto Shell; tests/run.mjs checks it against Mandelbulber's own
// C++ (tests/mbref) and tests/browser.mjs against the GPU.

import { effectiveIterations } from '../core/engine/params.js';
import { rotations } from './uniforms.js';
export { makeDE, repHash, repeatMap, marchInfo, march, probePixel, pickPixel, viewScore, suggestVolumeShell } from '../core/engine/de.js';

const sign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const v3 = (v, id) => [v[id + 'X'], v[id + 'Y'], v[id + 'Z']];
const DEG = Math.PI / 180;

// The formula's own map p → { d, trap, folds } in its local frame.
// `scaleOverride` carries the Scale Pulse.
export function localDE(v, scaleOverride) {
  const V = v.boxVariant | 0;
  const iters = effectiveIterations(v), bail = v.bailout;
  const S = scaleOverride ?? v.scale;
  const F = v3(v, 'fold'), F4 = v.fold4, FV = v.foldValue, FO = v3(v, 'foldOff');
  const KA = v3(v, 'kaliAdd'), SO = v3(v, 'sphOff'), ADD = v3(v, 'add'), PRE = v3(v, 'pre');
  const SM = v3(v, 'smooth'), BIAS = v3(v, 'bias'), CUB = v3(v, 'cub'), ICS = v3(v, 'invCS');
  const JC = v3(v, 'juliaC'), CM = v3(v, 'cMul'), CIM = v3(v, 'cInMul');
  const minR2 = v.minR2, fixR2 = v.fixR2;
  const R = rotations(v);
  const rf = V === 0 && !!v.rotFolds;
  const a1 = [v.r4aX, v.r4aY, v.r4aZ].map(x => x * DEG), a2 = [v.r4bX, v.r4bY, v.r4bZ].map(x => x * DEG);
  const c1 = a1.map(Math.cos), s1 = a1.map(Math.sin), c2 = a2.map(Math.cos), s2 = a2.map(Math.sin);
  const colIters = v.colorIters ?? 6, src = v.colorSource | 0, fcw = v.foldColW ?? 0.25;

  const smoothFold = z => {
    const len = F.map(x => 2 * x), s = len.map(x => 1 / x), a = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const az = Math.abs(z[k]);
      if (az < F[k]) a[k] = z[k] * z[k] * s[k];
      if (az > F[k] && az < len[k]) a[k] = (len[k] - az) * (len[k] - az) * s[k];
    }
    return [0, 1, 2].map(k => z[k] - sign(z[k]) * a[k] * SM[k]);
  };

  return p => {
    let z = [p[0], p[1], p[2]], w = V === 12 ? v.w0 : 0;
    const c = [p[0], p[1], p[2]];
    let cAux = [c[0], c[1], c[2]];
    let dr = 1, aScale = S, aScaleA = 0, posNeg = 1;
    let r = Math.hypot(z[0], z[1], z[2]), trap = 1e10, boxCol = 0, sphCol = 0;
    const box = (on, n = 1) => { boxCol += on * n; };
    const tglad = (z, on, foldZ) => {
      const o = z.slice();
      z = [Math.abs(z[0] + F[0]) - Math.abs(z[0] - F[0]) - z[0], Math.abs(z[1] + F[1]) - Math.abs(z[1] - F[1]) - z[1], z[2]];
      if (foldZ) z[2] = Math.abs(z[2] + F[2]) - Math.abs(z[2] - F[2]) - z[2];
      for (let k = 0; k < 3; k++) if (z[k] !== o[k]) box(on);
      return z;
    };
    const sphere = (rr, mr2, on) => { // returns the factor (1 when outside)
      if (rr < mr2) { sphCol += on; return fixR2 / mr2; }
      if (rr < fixR2) { sphCol += 0.5 * on; return fixR2 / rr; }
      return 1;
    };
    const scl = (z, k) => [z[0] * k, z[1] * k, z[2] * k];
    const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const subv = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const varyScale = (on, setMode, z) => { // Mod 12 / 13
      let useScale = S;
      if (v.varyAOn) {
        useScale += aScaleA;
        z = scl(z, useScale);
        dr = dr * Math.abs(useScale) + 1;
        const vary = v.varyA * (Math.abs(aScaleA) - v.varyABase);
        if (setMode) aScaleA = -vary; else aScaleA -= vary;
      } else {
        z = scl(z, useScale);
        dr = dr * Math.abs(useScale) + 1;
      }
      return z;
    };

    for (let i = 0; i < iters; i++) {
      const on = i < colIters ? 1 : 0;
      if (V === 0) {
        if (rf) {
          for (let d = 0; d < 3; d++) {
            let zr = mv(R[`rfN${d}`], z);
            if (zr[d] > F[d]) { zr[d] = FV - zr[d]; z = mv(R[`rfN${d}i`], zr); box(on); continue; }
            zr = mv(R[`rfP${d}`], z);
            if (zr[d] < -F[d]) { zr[d] = -FV - zr[d]; z = mv(R[`rfP${d}i`], zr); box(on); }
          }
        } else {
          for (let k = 0; k < 3; k++) if (Math.abs(z[k]) > F[k]) { z[k] = sign(z[k]) * FV - z[k]; box(on); }
        }
        const r2 = dot(z, z);
        z = addv(z, SO);
        const k = sphere(r2, minR2, on);
        z = scl(z, k); dr *= k;
        z = subv(z, SO);
        if (v.fRotOn) z = mv(R.rot, z);
        z = scl(z, S);
        dr = dr * Math.abs(S) + 1;
      } else if (V === 1) {
        aScale = S + v.scaleVary * (Math.abs(aScale) - 1);
        const o = z.slice();
        z = [FV - Math.abs(Math.abs(z[0] + FO[0]) - FV) - Math.abs(FO[0]), FV - Math.abs(Math.abs(z[1] + FO[1]) - FV) - Math.abs(FO[1]), z[2]];
        if (v.zFold) {
          const fv = FV * v.zFoldScale;
          z[2] = fv - Math.abs(Math.abs(z[2] + FO[2]) - fv) - Math.abs(FO[2]);
          if (z[2] !== o[2]) box(on);
        }
        if (z[0] !== o[0]) box(on);
        if (z[1] !== o[1]) box(on);
        let rr = dot(z, z);
        if (v.rPowerOn) rr = Math.pow(rr, v.rPower);
        const k = sphere(rr, minR2, on);
        z = scl(z, k); dr *= k;
        z = scl(z, aScale);
        dr = dr * Math.abs(aScale) + 1;
        if (v.fRotOn) z = mv(R.rot, z);
      } else if (V === 2) {
        aScale = S + v.scaleVary * (Math.abs(aScale) - 1);
        z = tglad(z, on, v.zFold);
        const tz = Math.abs(z[2]) - v.cylHalf;
        let rr = z[0] * z[0] + z[1] * z[1];
        if (tz > 0) rr = rr + tz * tz * v.cylScale;
        if (v.rPowerOn) rr = Math.pow(rr, v.rPower);
        const k = sphere(rr, minR2, on);
        z = scl(z, k); dr *= k;
        z = scl(z, aScale);
        dr = dr * Math.abs(aScale) + 1;
        if (v.fRotOn) z = mv(R.rot, z);
      } else if (V === 3) {
        aScale = S + v.scaleVary * (Math.abs(aScale) - 1);
        z = tglad(z, on, v.zFold);
        if (v.smoothOn && i >= v.smoothStart && i < v.smoothStop) z = smoothFold(z);
        if (v.swapXZ) z = [z[2], z[1], z[0]];
        const rr = dot(z, z);
        z = addv(z, SO);
        const k = sphere(rr, minR2, on);
        z = scl(z, k); dr *= k;
        z = subv(z, SO);
        z = scl(z, aScale);
        dr = dr * Math.abs(aScale) + 1;
        z = addv(z, ADD);
        if (v.fRotOn) z = mv(R.rot, z);
        if (i < v.postScaleStop) { z = scl(z, v.postScale); dr = dr * Math.abs(v.postScale); }
      } else if (V === 4) {
        z = tglad(z, on, v.zFold);
        if (v.smoothOn && i >= v.smoothStart && i < v.smoothStop) z = smoothFold(z);
        if (v.swapXZ) z = [z[2], z[1], z[0]];
        let m = 1;
        const oz = z.slice();
        if (v.sphOn) {
          const cb = v.biasSq ? c.map(x => x * x) : c.map(Math.abs);
          let mr2 = minR2 + BIAS[0] * cb[0] + BIAS[1] * cb[1] + BIAS[2] * cb[2];
          if (v.biasClamp && mr2 > fixR2) mr2 = fixR2;
          const rr = dot(z, z);
          z = addv(z, SO);
          if (rr < mr2) { m *= fixR2 / mr2; sphCol += on; } else if (rr < fixR2) { m *= fixR2 / rr; sphCol += 0.5 * on; }
          z = subv(z, SO);
          z = scl(z, m);
          dr *= Math.abs(m);
        }
        if (v.cuboidOn) {
          const rr = dot(z, z);
          z = addv(z, SO);
          const t3 = v.cubSq ? z.map(x => x * x) : z.map(Math.abs);
          if (t3[0] < CUB[0] && t3[1] < CUB[1] && t3[2] < CUB[2]) {
            let mr2 = rr * Math.min(CUB[0] / t3[0], Math.min(CUB[1] / t3[1], CUB[2] / t3[2]));
            if (mr2 > fixR2) mr2 = fixR2;
            m *= fixR2 / mr2;
            sphCol += on;
          } else if (rr < fixR2) { m *= fixR2 / rr; sphCol += 0.5 * on; }
          z = subv(z, SO);
          z = scl(z, m);
          dr *= Math.abs(m);
        }
        if (z[0] === oz[0] && z[1] === oz[1] && z[2] === oz[2]) {
          const rr = dot(z, z);
          z = addv(z, SO);
          if (rr < minR2) { m *= fixR2 / minR2; sphCol += on; } else if (rr < fixR2) { m *= fixR2 / rr; sphCol += 0.5 * on; }
          z = subv(z, SO);
          z = scl(z, m);
          dr *= Math.abs(m);
        }
        z = varyScale(on, v.varyASet, z);
        z = addv(z, ADD);
        if (v.fRotOn) z = mv(R.rot, z);
      } else if (V === 5) {
        if (v.invC) {
          if (v.invCAcc) { cAux = [cAux[0] * ICS[0], cAux[1] * ICS[1], cAux[2] * ICS[2]]; cAux = scl(cAux, 1 / dot(cAux, cAux)); z = addv(z, cAux); }
          else { const cs = [c[0] * ICS[0], c[1] * ICS[1], c[2] * ICS[2]]; z = addv(z, scl(cs, 1 / dot(cs, cs))); }
        }
        z = tglad(z, on, v.zFold);
        if (v.smoothOn && i >= v.smoothStart && i < v.smoothStop) z = smoothFold(z);
        if (v.swapXZ) z = [z[2], z[1], z[0]];
        const rr = dot(z, z);
        z = addv(z, SO);
        const k = sphere(rr, minR2, on);
        z = scl(z, k); dr *= k;
        z = subv(z, SO);
        z = varyScale(on, v.varyASet, z);
        if (v.addAlt) { z = addv(z, scl(ADD, posNeg)); posNeg *= -1 * v.addAltScale; }
        else z = addv(z, ADD);
        if (v.fRotOn) z = mv(R.rot, z);
      } else if (V === 6) {
        z = tglad(z, on, v.zFold);
        if (v.smoothOn && i >= v.smoothStart && i < v.smoothStop) z = smoothFold(z);
        z = addv(z, PRE);
        const rr = dot(z, z);
        let m;
        if (rr < v.invMin) { m = 1 / v.invMin; sphCol += on; }
        else if (rr < v.invMax) { m = 1 / rr; sphCol += 0.5 * on; }
        else m = 1 / v.invMax;
        z = scl(z, m);
        dr *= m;
        let useScale = S;
        if (v.varyAOn) {
          useScale += aScaleA;
          z = scl(z, useScale);
          dr = dr * Math.abs(useScale) + v.deOff;
          aScaleA = -(v.varyA * (Math.abs(aScaleA) - v.varyABase));
        } else {
          z = scl(z, useScale);
          dr = dr * Math.abs(useScale) + v.deOff;
        }
        if (v.addOn) { z = addv(z, scl(ADD, posNeg)); posNeg *= v.addMul; }
        if (v.cIn) {
          const tc = v.cInSigned ? [sign(z[0]) * Math.abs(c[0]), sign(z[1]) * Math.abs(c[1]), sign(z[2]) * Math.abs(c[2])] : c;
          z = addv(z, [tc[0] * CIM[0], tc[1] * CIM[1], tc[2] * CIM[2]]);
        }
        if (v.fRotOn) z = mv(R.rot, z);
      } else if (V === 7) {
        z = tglad(z, on, v.zFold);
        z = addv(z, PRE);
        const rr = dot(z, z);
        let m = 1;
        if (rr < minR2) { m = fixR2 / minR2; sphCol += on; } else if (rr < fixR2) { m = fixR2 / rr; sphCol += 0.5 * on; }
        z = scl(z, m);
        dr *= m;
        const useScale = aScaleA + S;
        z = scl(z, useScale);
        dr = dr * Math.abs(useScale) + v.deOff;
        if (v.varyAOn) aScaleA = -(v.varyA * (Math.abs(aScaleA) - v.varyABase));
        if (v.fRotOn) z = mv(R.rot, z);
        if (v.cIn) z = addv(z, [c[0] * CIM[0], c[1] * CIM[1], c[2] * CIM[2]]);
        z = addv(z, ADD);
        z = mv(R.rot2, z);
      } else if (V === 8) {
        if (v.fRotOn) z = mv(R.rot, z);
        z = [KA[0] - Math.abs(z[0]), KA[1] - Math.abs(z[1]), KA[2] - Math.abs(z[2])];
        const rr = dot(z, z);
        const dv = rr < minR2 ? minR2 : Math.min(rr, 1);
        if (rr < 1) sphCol += rr < minR2 ? on : 0.5 * on;
        const m = S / dv;
        z = scl(z, m);
        dr = dr * Math.abs(m) + 1;
      } else if (V === 9) {
        z = [KA[0] - Math.abs(z[0]), KA[1] - Math.abs(z[1]), v.zFold ? KA[2] - Math.abs(z[2]) : z[2]];
        const rr = dot(z, z);
        let m = S;
        if (rr < minR2) { m *= fixR2 / minR2; sphCol += on; } else if (rr < fixR2) { m *= fixR2 / rr; sphCol += 0.5 * on; }
        z = scl(z, m);
        dr = dr * Math.abs(m) + 1;
        z = addv(z, ADD);
        if (v.fRotOn) z = mv(R.rot, z);
        z = addv(z, ADD);
      } else if (V === 10) {
        if (i < v.kaliStop) {
          z = [KA[0] - Math.abs(z[0]), KA[1] - Math.abs(z[1]), KA[2] - Math.abs(z[2])];
          const rr = dot(z, z);
          const dv = rr < minR2 ? minR2 : Math.min(rr, 1);
          if (rr < 1) sphCol += rr < minR2 ? on : 0.5 * on;
          const m = -S / dv;
          z = scl(z, m);
          dr = dr * Math.abs(m) + 1;
        }
        z = addv(z, ADD);
      } else if (V === 11) {
        z = tglad(z, on, v.zFold);
        if (v.eiffZBox) {
          const zl = F[2] * v.zFoldScale, zv = FV * v.zFoldScale;
          if (Math.abs(z[2]) > zl) { z[2] = sign(z[2]) * zv - z[2]; box(on); }
        }
        if (v.swapXZ) z = [z[2], z[1], z[0]];
        if (z[1] > z[0]) z = [z[1], z[0], z[2]];
        const rr = dot(z, z);
        let m = S;
        if (rr < minR2) { m = m / minR2; sphCol += on; } else if (rr < 1) { m = m / rr; sphCol += 0.5 * on; }
        z = scl(z, m);
        dr = dr * Math.abs(m) + 1;
        z = addv(z, ADD);
        if (v.fRotOn) z = mv(R.rot, z);
      } else if (V === 12) {
        aScale = S + v.scaleVary * (Math.abs(aScale) - 1);
        let z4 = [z[0], z[1], z[2], w];
        const o4 = z4.slice();
        z4 = z4.map(x => Math.abs(x + F4) - Math.abs(x - F4) - x);
        for (let k = 0; k < 4; k++) if (z4[k] !== o4[k]) box(on);
        const rr = Math.pow(z4[0] * z4[0] + z4[1] * z4[1] + z4[2] * z4[2] + z4[3] * z4[3], v.rPower4);
        let m = aScale;
        if (rr < minR2) { m = aScale / minR2; sphCol += on; } else if (rr < 1) { m = aScale / rr; sphCol += 0.5 * on; }
        z4 = z4.map(x => x * m);
        dr = dr * Math.abs(m) + 1;
        if (v.rot4On) {
          const rot = (a, b, cs, sn) => { const ta = z4[a], tb = z4[b]; z4[a] = ta * cs + tb * sn; z4[b] = -ta * sn + tb * cs; };
          rot(0, 1, c1[0], s1[0]); rot(1, 2, c1[1], s1[1]); rot(0, 2, c1[2], s1[2]);
          rot(0, 3, c2[0], s2[0]); rot(1, 3, c2[1], s2[1]); rot(2, 3, c2[2], s2[2]);
        }
        z = [z4[0], z4[1], z4[2]];
        w = z4[3];
      }

      if (v.addC) {
        if (V === 1) {
          if (v.juliaMode) { const j = [JC[0] * CM[0], JC[1] * CM[1], JC[2] * CM[2]]; z = addv(z, [j[1], j[0], j[2]]); }
          else z = addv(z, [c[1] * CM[0], c[0] * CM[1], c[2] * CM[2]]);
        } else {
          const cc = v.juliaMode ? JC : c;
          z = addv(z, [cc[0] * CM[0], cc[1] * CM[1], cc[2] * CM[2]]);
        }
        if (V === 12 && !v.juliaMode) w += v.w0;
      }

      const zz = dot(z, z) + w * w;
      r = Math.sqrt(zz);
      trap = Math.min(trap, zz);
      if (r > bail) break;
    }
    const folds = boxCol + sphCol;
    if (src === 1) trap = folds * fcw * 2.5;
    else if (src === 2) trap += folds * fcw * 2.5;
    return { d: r / Math.abs(dr), trap, folds };
  };
}
