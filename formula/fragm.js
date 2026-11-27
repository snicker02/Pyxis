// CPU port of the Fragmentarium formulas (13–19): the second mapLocal() in
// formula/glsl.js, line for line, in double precision. localDE (de.js) hands
// these formulas over to fragmDE.
//
// Sources (FragM examples, github.com/3Dickulus/FragM):
//   13 Kalibox            Kali's Creations/Kalibox.frag (Kali; Rrrola's DE)
//   14 MandalayBox        Knighty Collection/MandalayBox.frag, Pseudo-MandalayBox.frag
//   15 SurfBox            mclarekin/darkbeam_surfbox.frag (DarkBeam's fold)
//   16 SphereBox 4D       mclarekin/AexionnSphereBoxRot4D.frag (Aexion)
//   17 TetraBox           mclarekin/Aexions_TetraBox2.frag (Aexion)
//   18 PetraBox           3Dickulus/PetraBox.frag (iRyanBell)
//   19 ABox Inv. Cylinder mclarekin/abox inCyl-10.frag (CozyG)

import { effectiveIterations } from '../core/engine/params.js';
import { fragmRot } from './uniforms.js';

const sign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const v3 = (v, id) => [v[id + 'X'], v[id + 'Y'], v[id + 'Z']];
const DEG = Math.PI / 180;

export function fragmDE(v, scaleOverride) {
  const V = v.boxVariant | 0;
  const iters = effectiveIterations(v), bail = v.bailout;
  const S = scaleOverride ?? v.scale;
  const minR2 = Math.max(v.minR2, 1e-6), fixR2 = v.fixR2;
  const M = fragmRot(v);
  const rotv = q => [M[0] * q[0] + M[1] * q[1] + M[2] * q[2], M[3] * q[0] + M[4] * q[1] + M[5] * q[2], M[6] * q[0] + M[7] * q[1] + M[8] * q[2]];
  const F = v3(v, 'fold'), JC = v3(v, 'juliaC'), CM = v3(v, 'cMul');
  const T = v3(v, 'fmTrans'), FO = v3(v, 'mdFo'), G = v3(v, 'mdG'), W = v3(v, 'mdW'), CAP = v3(v, 'sbFoldMod');
  const SO = [...v3(v, 'sphOff'), v.sphOffW], LIM = [...F, v.foldW];
  const a1 = [v.r4aX, v.r4aY, v.r4aZ].map(x => x * DEG), a2 = [v.r4bX, v.r4bY, v.r4bZ].map(x => x * DEG);
  const c1 = a1.map(Math.cos), s1 = a1.map(Math.sin), c2 = a2.map(Math.cos), s2 = a2.map(Math.sin);
  const colIters = v.colorIters ?? 6, src = v.colorSource | 0, fcw = v.foldColW ?? 0.25;
  const pseudo = !!v.mdPseudo;

  const mdFold1 = (p, fo, g, w) => {
    let [x, y, z] = p;
    if (z > y) { const t = y; y = z; z = t; }
    const vx = x - 2 * fo, vy = y - 4 * fo;
    let vv = Math.max(Math.abs(vx + fo) - fo, vy);
    let v1;
    if (pseudo) { v1 = Math.max(vx - g, y - w); v1 = Math.max(v1, -Math.abs(x)); }
    else v1 = Math.max(vx - g, y);
    vv = Math.min(vv, v1);
    return Math.min(vv, x);
  };

  return p => {
    let boxCol = 0, sphCol = 0, trap = 1e10, dr = 1;
    let z = [p[0], p[1], p[2], 0];
    let r = Math.hypot(p[0], p[1], p[2]), rr = r * r;
    const dot4 = a => a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3];
    const dot3 = a => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    let compound = 0, ct = null, zPrev = null, racc = 0;
    const pc = [p[0], p[1], p[2], 1];
    const jc = v.juliaMode ? [...JC, 0] : [p[0], p[1], p[2], 1];
    const sdm = S / minR2, sdmW = Math.abs(S) / minR2;
    if (V === 16) { ct = [p[0], p[1], p[2], Math.hypot(p[0], p[1], p[2])]; z = ct.slice(); }
    if (V === 17) {
      ct = [p[0] + p[1] + p[2], -p[0] - p[1] + p[2], -p[0] + p[1] - p[2], p[0] - p[1] - p[2]]
        .map(x => Math.abs(Math.abs(x) - v.tbCTOff));
      z = ct.slice();
    }
    if (V === 18) { zPrev = v.juliaMode ? [...JC, 1] : [0, 0, 0, 1]; z = pc.slice(); }

    for (let i = 0; i < 250; i++) {
      if (i >= iters) break;
      const on = i < colIters ? 1 : 0;

      if (V === 13) {
        let q = rotv(z);
        q = q.map((x, k) => Math.abs(x) + T[k]);
        const r2 = dot3(q);
        if (r2 < minR2) sphCol += on; else if (r2 < 1) sphCol += 0.5 * on;
        const f = clamp(Math.max(minR2 / r2, minR2), 0, 1);
        q = q.map(x => x * f * sdm);
        dr *= f * sdmW;
        if (v.juliaMode) { q = q.map((x, k) => x + JC[k]); dr += 1; }
        z = [q[0], q[1], q[2], 0];
        rr = dot3(q);
      } else if (V === 14) {
        if (rr >= bail * bail) break;
        let q = z.slice(0, 3);
        if (v.mdBoxFold) {
          for (let k = 0; k < 3; k++) if (Math.abs(q[k]) > 1) boxCol += on;
          q = q.map(x => x - clamp(x, -1, 1) * 2);
        }
        const sg = q.map(sign);
        q = q.map(Math.abs);
        const yzx = a => [a[1], a[2], a[0]], zxy = a => [a[2], a[0], a[1]];
        if (v.mdSerial) {
          q[0] = mdFold1(q, FO[0], G[0], W[0]);
          q[1] = mdFold1(yzx(q), FO[1], G[1], W[1]);
          q[2] = mdFold1(zxy(q), FO[2], G[2], W[2]);
        } else {
          const q1 = q.slice();
          q = [mdFold1(q1, FO[0], G[0], W[0]), mdFold1(yzx(q1), FO[1], G[1], W[1]), mdFold1(zxy(q1), FO[2], G[2], W[2])];
        }
        q = q.map((x, k) => x * sg[k]);
        const r2 = dot3(q);
        if (r2 < minR2) sphCol += on; else if (r2 < 1) sphCol += 0.5 * on;
        const t = clamp(1 / r2, 1, 1 / minR2);
        q = q.map(x => x * t);
        dr *= t;
        q = q.map((x, k) => x * S + jc[k]);
        dr = dr * S + jc[3];
        q = rotv(q);
        z = [q[0], q[1], q[2], 0];
        rr = dot3(q);
      } else if (V === 15) {
        let q = z.slice(0, 3);
        const sg = q.map(sign);
        const tg = q.map((x, k) => Math.abs(x + F[k]) - Math.abs(x - F[k]) - x);
        const folder = q.map((x, k) => Math.min(Math.abs(sg[k] * (x - tg[k])), CAP[k]));
        for (let k = 0; k < 3; k++) if (folder[k] !== 0) boxCol += on;
        q = q.map((x, k) => x - sg[k] * folder[k]);
        const r2 = dot3(q);
        if (r2 < minR2) { const k = fixR2 / minR2; q = q.map(x => x * k); dr *= k; sphCol += on; }
        else if (r2 < fixR2) { const k = fixR2 / r2; q = q.map(x => x * k); dr *= k; sphCol += 0.5 * on; }
        const useScale = S + compound;
        q = q.map(x => x * useScale);
        dr = dr * Math.abs(useScale) + v.deOff;
        compound = -(v.scaleVary * (Math.abs(compound) - v.fmVaryOff));
        q = rotv(q);
        if (v.addC) q = q.map((x, k) => x + p[k] * CM[k]);
        if (v.juliaMode) q = q.map((x, k) => x + JC[k]);
        z = [q[0], q[1], q[2], 0];
        rr = r2;
      } else if (V === 16 || V === 17) {
        const o = z.slice();
        z = z.map((x, k) => Math.abs(x + LIM[k]) - Math.abs(x - LIM[k]) - x);
        for (let k = 0; k < 4; k++) if (z[k] !== o[k]) boxCol += on;
        const r2 = dot4(z);
        z = z.map((x, k) => x + SO[k]);
        if (r2 < minR2) { const k = fixR2 / minR2; z = z.map(x => x * k); dr *= k; sphCol += on; }
        else if (r2 < fixR2) { const k = fixR2 / r2; z = z.map(x => x * k); dr *= k; sphCol += 0.5 * on; }
        z = z.map((x, k) => (x - SO[k]) * S);
        dr = dr * S + 1;
        const q = rotv(z);
        z = [q[0], q[1], q[2], z[3]];
        if (V === 16 && v.rot4On) {
          const rot = (a, b, cs, sn) => { const ta = z[a], tb = z[b]; z[a] = ta * cs + tb * sn; z[b] = -ta * sn + tb * cs; };
          rot(0, 1, c1[0], s1[0]); rot(1, 2, c1[1], s1[1]); rot(0, 2, c1[2], s1[2]);
          rot(0, 3, c2[0], s2[0]); rot(1, 3, c2[1], s2[1]); rot(2, 3, c2[2], s2[2]);
        }
        z = z.map((x, k) => x + ct[k]);
        rr = dot4(z);
      } else if (V === 18) {
        const zt = z.slice();
        const q = z.slice(0, 3), b = v.pbFold;
        for (let k = 0; k < 3; k++) if (Math.abs(q[k]) > b) boxCol += on;
        const f3 = q.map(x => Math.min(Math.max(x, -b), b) * 2 - x);
        z = [f3[0], f3[1], f3[2], z[3]];
        const d2 = dot3(z);
        if (d2 < v.minR2) sphCol += on; else if (d2 < 1) sphCol += 0.5 * on;
        const m = S / Math.min(Math.max(d2, v.minR2), 1);
        z = z.map(x => x * m);
        z = z.map((x, k) => x + (v.juliaMode ? (zPrev[k] + pc[k]) * 0.5 : zPrev[k]));
        zPrev = zt;
        const q2 = rotv(z);
        z = [q2[0], q2[1], q2[2], z[3]];
        racc += Math.abs(Math.hypot(z[0], z[1], z[2]) - Math.hypot(zPrev[0], zPrev[1], zPrev[2])) / (i + 1);
        rr = dot3(z);
      } else if (V === 19) {
        let q = z.slice(0, 3);
        const o = q.slice();
        q = q.map((x, k) => Math.abs(x + F[k]) - Math.abs(x - F[k]) - x);
        for (let k = 0; k < 3; k++) if (q[k] !== o[k]) boxCol += on;
        const r2 = dot3(q);
        if (r2 < minR2) sphCol += on; else if (r2 < 1) sphCol += 0.5 * on;
        const f = clamp(Math.max(minR2 / r2, minR2), 0, 1);
        q = q.map(x => x * f);
        dr *= f;
        const sd = S / minR2;
        q = q.map(x => x * sd);
        dr = dr * Math.abs(sd) + 1;
        q = rotv(q);
        if (v.addC) q = q.map((x, k) => x + p[k] * CM[k]);
        if (v.juliaMode) q = q.map((x, k) => x + JC[k]);
        if (i === (v.icIterA | 0) || i === (v.icIterB | 0)) {
          q = [q[0] * Math.cos(q[1] * v.icScaleY), q[0] * Math.sin(q[1] * v.icScaleY), q[2] * v.icScaleZ].map(x => x * v.icScaleInv);
          dr *= Math.abs(v.icScaleInv);
        }
        z = [q[0], q[1], q[2], 0];
        rr = r2;
      }

      r = Math.sqrt(dot4(z));
      trap = Math.min(trap, dot4(z));
      if ((V === 15 || V === 19) && rr > bail) break;
      if ((V === 16 || V === 17) && r > bail) break;
      if ((V === 13 || V === 18) && rr > 1e20) break; // overflow guard only
    }
    const folds = boxCol + sphCol;
    if (src === 1) trap = folds * fcw * 2.5;
    else if (src === 2) trap += folds * fcw * 2.5;
    let d;
    if (V === 13) d = (r - Math.abs(S - 1)) / Math.abs(dr) - Math.pow(Math.abs(S), 1 - iters);
    else if (V === 14) d = (Math.sqrt(rr) - 30) / Math.abs(dr);
    else if (V === 18) d = Math.abs(racc / z[3]);
    else d = r / Math.abs(dr);
    return { d, trap, folds };
  };
}
