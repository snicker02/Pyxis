// CPU side of the distance estimator: object transform, repetition, ray
// marching and the view probes built on them — used for double-click
// autofocus, Rebirth's visibility check, Auto-fix Cut-offs, Auto Shell and the
// tests. The formula supplies the fractal itself (formula.localDE), kept in
// lock-step with its mapLocal() GLSL; tests/browser.mjs in each app compares
// the GPU and CPU values.

import { objectTransform, mat3MulVec } from './vec.js';
import { cameraBasis, pixelRay } from './camera.js';
import { F } from './formula.js';

// Returns map(p) → { d, trap, … } in world space (object transform and
// repetition included). `scaleOverride` carries the Scale Pulse.
// map.local is the formula's own map (no object transform / repetition).
export function makeDE(v, scaleOverride) {
  const map = F.localDE(v, scaleOverride);
  // Object transform (matches map() in glsl.js): evaluate in the object's frame.
  const T = objectTransform(v);
  const objMap = T.identity ? map : p => {
    const q = mat3MulVec(T.inv, [p[0] - T.pos[0], p[1] - T.pos[1], p[2] - T.pos[2]]);
    const r = map([q[0] / T.s, q[1] / T.s, q[2] / T.s]);
    return { ...r, d: r.d * T.s };
  };
  const out = (v.repMode | 0) > 0 ? repeatMap(objMap, v) : objMap;
  // Formula extras on the map (e.g. Kyma's map.applyFold for tests) stay reachable.
  if (out !== map) for (const k of Object.keys(map)) if (!(k in out)) out[k] = map[k];
  out.local = map;
  return out;
}

// Repetition / arrays (mirrors map() under HAS_REP in glsl.js).
const fract1 = x => x - Math.floor(x);
export function repHash(c, seed) {
  let q = [fract1(c[0] * 0.1031 + seed * 0.6180339), fract1(c[1] * 0.1030 + seed * 0.6180339), fract1(c[2] * 0.0973 + seed * 0.6180339)];
  const dd = q[0] * (q[1] + 3.33) + q[1] * (q[0] + 3.33) + q[2] * (q[2] + 3.33);
  q = q.map(x => x + dd);
  return [fract1((q[0] + q[1]) * q[2]), fract1((q[0] + q[0]) * q[1]), fract1((q[1] + q[0]) * q[0])]; // (q.xxy + q.yxx) * q.zyx
}
export function repeatMap(objMap, v) {
  const mode = v.repMode | 0;
  const cnt = [v.repCountX ?? 2, v.repCountY ?? 0, v.repCountZ ?? 2].map(n => Math.max(0, Math.round(n)));
  const sp = [v.repSpaceX ?? 5, v.repSpaceY ?? 5, v.repSpaceZ ?? 5].map(x => Math.max(x, 1e-4));
  const N = Math.max(2, Math.round(v.repRingN ?? 8)), R = v.repRingR ?? 6, ax = v.repRingAxis ?? 1, rot = v.repRingRotate ?? true;
  const rv = (v.repRotVar || 0) * Math.PI / 180, sv = v.repScaleVar || 0, cv = v.repColVar || 0, seed = v.repSeed || 0;
  const pad = 1e-3 * Math.max(mode === 2 ? R : Math.max(...sp), 0.01);
  const toA = z => ax === 0 ? [z[1], z[2], z[0]] : ax === 1 ? [z[2], z[0], z[1]] : z;
  const fromA = w => ax === 0 ? [w[2], w[0], w[1]] : ax === 1 ? [w[1], w[2], w[0]] : w;
  return p => {
    let q = p, cid = [0, 0, 0], bound = 1e10;
    if (mode === 1) {
      const idx = [0, 1, 2].map(k => Math.min(Math.max(Math.floor(p[k] / sp[k] + 0.5), -cnt[k]), cnt[k]));
      q = [0, 1, 2].map(k => p[k] - idx[k] * sp[k]);
      cid = idx;
      for (let k = 0; k < 3; k++) {
        if (idx[k] < cnt[k]) bound = Math.min(bound, (idx[k] + 0.5) * sp[k] - p[k]);
        if (idx[k] > -cnt[k]) bound = Math.min(bound, p[k] - (idx[k] - 0.5) * sp[k]);
      }
    } else if (mode === 2) {
      const w = toA(p), sec = 2 * Math.PI / N;
      const a = Math.atan2(w[1], w[0]), k = Math.floor(a / sec + 0.5), da = a - k * sec, rho = Math.hypot(w[0], w[1]);
      const lw = rot ? [rho * Math.cos(da) - R, rho * Math.sin(da), w[2]] : [w[0] - R * Math.cos(k * sec), w[1] - R * Math.sin(k * sec), w[2]];
      q = fromA(lw);
      cid = [((k % N) + N) % N, 0, 0];
      bound = rho * Math.sin(Math.max(0.5 * sec - Math.abs(da), 0));
    }
    const h = repHash(cid, seed);
    let sc = 1;
    if (rv > 0) {
      const h2 = repHash([cid[0] + 17, cid[1] + 17, cid[2] + 17], seed);
      let axv = h2.map(x => x * 2 - 1 + 1e-4); const n = Math.hypot(...axv); axv = axv.map(x => x / n);
      const an = (h[0] * 2 - 1) * rv, c = Math.cos(an), s = Math.sin(an);
      const cr = [axv[1] * q[2] - axv[2] * q[1], axv[2] * q[0] - axv[0] * q[2], axv[0] * q[1] - axv[1] * q[0]];
      const kd = axv[0] * q[0] + axv[1] * q[1] + axv[2] * q[2];
      q = [0, 1, 2].map(i => q[i] * c + cr[i] * s + axv[i] * kd * (1 - c));
    }
    if (sv > 0) sc = 1 + (h[1] * 2 - 1) * sv;
    const r = objMap([q[0] / sc, q[1] / sc, q[2] / sc]);
    return { ...r, d: Math.min(r.d * sc, bound + pad), trap: (r.trap ?? 0) + h[2] * cv };
  };
}

// Sphere-trace one ray; returns hit distance or -1. Mirrors the shader loop,
// including Step Factor, Max Distance and "stranded rays as surface".
export function marchInfo(map, ro, rd, v) {
  const eps0 = 0.0003 / v.detail;
  const fac = v.stepFactor ?? 1, maxD = v.maxDist ?? 100;
  let t = 0, i = 0;
  for (; i < v.maxSteps; i++) {
    const p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const d = map(p).d;
    if (!Number.isFinite(d)) return { t: -1, reason: 'nan', steps: i };
    const eh = v.deepZoom && v.__pix ? Math.min(eps0 * (1 + t * 0.1), t * v.__pix * 0.5 / v.detail) : eps0 * (1 + t * 0.1);
    if (d < eh) return { t, reason: 'hit', steps: i };
    t += v.maxStep > 0 ? Math.min(d * fac, v.maxStep) : d * fac;
    if (t > maxD) return { t: -1, reason: 'far', steps: i };
  }
  return { t: v.missAsHit ? t : -1, reason: 'stranded', steps: i };
}

export function march(map, ro, rd, v) { return marchInfo(map, ro, rd, v).t; }

// Distance to the surface under a screen pixel (CSS px, top-left origin).
export function probePixel(v, px, py, w, h) {
  return pickPixel(v, px, py, w, h).t;
}

// Surface under a screen pixel: { t, p, n } (t < 0: nothing there). The normal
// is the DE gradient at the hit, sampled at the hit's own scale.
export function pickPixel(v, px, py, w, h) {
  const cam = cameraBasis(v);
  const rd = pixelRay(cam, v.lens, px, h - py, w, h);
  const vv = { ...v, __pix: 1 / (v.lens * Math.min(w, h)) };
  const map = makeDE(vv);
  const t = march(map, cam.eye, rd, vv);
  if (t < 0) return { t };
  const p = [cam.eye[0] + rd[0] * t, cam.eye[1] + rd[1] * t, cam.eye[2] + rd[2] * t];
  const e = Math.max(t * vv.__pix * 0.7, 1e-9);
  const g = [0, 1, 2].map(k => { const a = [...p], b = [...p]; a[k] += e; b[k] -= e; return map(a).d - map(b).d; });
  let n = g, len = Math.hypot(...n);
  n = len > 0 ? n.map(x => x / len) : rd.map(x => -x);
  if (n[0] * rd[0] + n[1] * rd[1] + n[2] * rd[2] > 0) n = n.map(x => -x); // face the camera
  return { t, p, n, eye: cam.eye, cam };
}

// Coarse visibility score for a view: fraction of a grid of rays that hit, plus
// the camera's own clearance. Used to reject blank or camera-inside rebirths.
export function viewScore(v, grid = 5) {
  const cam = cameraBasis(v);
  const map = makeDE(v);
  const clearance = map(cam.eye).d;
  const cheap = { ...v, maxSteps: Math.min(v.maxSteps, 160), detail: Math.min(v.detail, 0.5) };
  let hits = 0, near = 0;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const rd = pixelRay(cam, v.lens, (i + 0.5) / grid * 16, (j + 0.5) / grid * 9, 16, 9);
      const t = march(map, cam.eye, rd, cheap);
      if (t >= 0) { hits++; if (t < 0.02) near++; }
    }
  }
  return { hitFrac: hits / (grid * grid), nearFrac: near / (grid * grid), clearance };
}

// Volumetric "Auto Shell": choose shell thickness / density / min step from the
// scene's distance scale. Each probe ray records the smallest DE it meets. On
// real surfaces that goes to ~0 (median ≲ 2e-4); on "dust" settings the DE
// plateaus (~1e-3), and the shell must be thinner than the plateau or the whole
// volume turns into uniform fog.
export function suggestVolumeShell(v, gx = 16, gy = 10) {
  const cam = cameraBasis(v), map = makeDE(v);
  const mins = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const rd = pixelRay(cam, v.lens, (i + 0.5) / gx * 16, (j + 0.5) / gy * 9, 16, 9);
    let t = 0, m = Infinity;
    for (let k = 0; k < 300 && t < Math.min(v.maxDist ?? 100, 50); k++) {
      const d = map([cam.eye[0] + rd[0] * t, cam.eye[1] + rd[1] * t, cam.eye[2] + rd[2] * t]).d;
      if (!Number.isFinite(d)) break;
      m = Math.min(m, d);
      if (d < 1e-5) break;
      t += Math.max(d * 0.5, 0.002);
    }
    mins.push(m);
  }
  mins.sort((a, b) => a - b);
  const median = mins[mins.length >> 1];
  if (median > 5e-4) {
    const thick = median * 0.35;
    return { kind: 'dust', median, volThick: thick, volDensity: Math.min(200, 0.03 / thick), volStepMin: Math.max(0.0005, thick * 4) };
  }
  return { kind: 'surface', median, volThick: 0.004, volDensity: 20, volStepMin: 0.008 };
}
