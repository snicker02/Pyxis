// Dev tool: compare Pyxis (importer mapping + CPU DE) against Mandelbulber's
// own C++ FormulaCode, compiled outside Mandelbulber (see tools/README.md).
//   node tools/mbref-compare.mjs <path/to/mbref> [cases-per-formula] [--write tests/fixtures/mbref.json]
// Random Mandelbulber parameter sets per formula → both sides → distances.
// With --write, saves the cases and Mandelbulber's distances as a fixture for
// tests/run.mjs (so the test suite needs no C++).

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import '../formula/index.js';
import { defaults } from '../formula/params.js';
import { importFract, MB_FORMULAS } from '../formula/mbimport.js';
import { localDE } from '../formula/de.js';

const [BIN, N = '40'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const WRITE = process.argv.includes('--write') ? process.argv[process.argv.indexOf('--write') + 1] : null;
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const R = (a, b) => a + rnd() * (b - a);
const B = (p = 0.5) => rnd() < p;
const V3 = (a, b) => [R(a, b), R(a, b), R(a, b)];
const f6 = x => +x.toFixed(6);

// Parameters to randomise per formula: [name, kind, lo, hi] (kind n | v | b | i).
const P = {
  8: [['mandelbox_scale', 'n', -2.6, 3], ['mandelbox_folding_limit', 'n', 0.6, 1.4], ['mandelbox_folding_value', 'n', 1.4, 2.6],
    ['mandelbox_folding_min_radius', 'n', 0.1, 0.8], ['mandelbox_folding_fixed_radius', 'n', 0.8, 1.3], ['mandelbox_offset', 'v', -0.3, 0.3],
    ['mandelbox_main_rotation_enabled', 'b'], ['mandelbox_rotation_main', 'v', -20, 20], ['mandelbox_rotations_enabled', 'b'],
    ['mandelbox_rotation_neg_1', 'v', -15, 15], ['mandelbox_rotation_neg_2', 'v', -15, 15], ['mandelbox_rotation_neg_3', 'v', -15, 15],
    ['mandelbox_rotation_pos_1', 'v', -15, 15], ['mandelbox_rotation_pos_2', 'v', -15, 15], ['mandelbox_rotation_pos_3', 'v', -15, 15]],
  64: [['mandelbox_scale', 'n', -2.6, 3], ['mandelbox_vary_scale_vary', 'n', -0.2, 0.2], ['mandelbox_folding_value', 'n', 1.4, 2.6],
    ['transf_addition_constant', 'v', -0.4, 0.4], ['transf_function_enabledz', 'b'], ['transf_scale_1', 'n', 0.6, 1.4],
    ['transf_function_enabled_false', 'b'], ['mandelbox_vary_rpower', 'n', 0.7, 1.3], ['transf_minimum_radius_0', 'n', 0, 0.5],
    ['transf_maxR2_1', 'n', 0.7, 1.3], ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  75: [['mandelbox_scale', 'n', -2.6, 3], ['mandelbox_vary_scale_vary', 'n', -0.2, 0.2], ['transf_addition_constant_111', 'v', 0.6, 1.4],
    ['transf_function_enabledM', 'b'], ['transf_offset_05', 'n', 0, 1], ['transf_scale_1', 'n', 0.5, 1.5], ['transf_function_enabled_false', 'b'],
    ['mandelbox_vary_rpower', 'n', 0.7, 1.3], ['transf_minR2_p25', 'n', 0.05, 0.5], ['transf_maxR2_1', 'n', 0.7, 1.3],
    ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  119: [['mandelbox_scale', 'n', -2.6, 3], ['mandelbox_vary_scale_vary', 'n', -0.2, 0.2], ['transf_addition_constant_111', 'v', 0.6, 1.4],
    ['transf_function_enabled', 'b'], ['transf_function_enabled_false', 'b'], ['transf_scale3D_000', 'v', -0.5, 0.5],
    ['transf_start_iterations_D', 'i', 0, 2], ['transf_stop_iterations_D1', 'i', 1, 4], ['transf_function_enabledSw_false', 'b'],
    ['transf_minR2_p25', 'n', 0.05, 0.5], ['transf_maxR2_1', 'n', 0.7, 1.3], ['mandelbox_offset', 'v', -0.3, 0.3],
    ['transf_addition_constant', 'v', -0.3, 0.3], ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20],
    ['transf_scaleG_1', 'n', 0.7, 1.3], ['transf_stop_iterations_C1', 'i', 0, 3]],
  123: [['transf_addition_constant_111', 'v', 0.6, 1.4], ['transf_function_enabled', 'b'], ['transf_function_enabled_false', 'b'],
    ['transf_scale3D_000', 'v', -0.5, 0.5], ['transf_function_enabledSw_false', 'b'], ['transf_function_enabledAx', 'b', 0.8],
    ['transf_constant_multiplier_000', 'v', -0.2, 0.2], ['transf_function_enabledAz_false', 'b'], ['transf_function_enabledAz', 'b'],
    ['transf_function_enabledAy_false', 'b'], ['transf_scaleP_222', 'v', 0.05, 0.6], ['transf_function_enabledAx_false', 'b'],
    ['transf_offset_000', 'v', -0.2, 0.2], ['transf_minR2_p25', 'n', 0.05, 0.5], ['transf_maxR2_1', 'n', 0.7, 1.3],
    ['mandelbox_scale', 'n', -2.6, 3], ['transf_function_enabledX_false', 'b'], ['transf_scale_vary_0', 'n', -0.2, 0.2],
    ['transf_scaleB_1', 'n', 0.6, 1.4], ['transf_function_enabledM_false', 'b'], ['transf_addition_constant', 'v', -0.3, 0.3],
    ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  127: [['transf_function_enabledAz_false', 'b'], ['transf_function_enabledAy_false', 'b'], ['transf_scale3D_111', 'v', 0.5, 1.5],
    ['transf_addition_constant_111', 'v', 0.6, 1.4], ['transf_function_enabled', 'b'], ['transf_function_enabled_false', 'b'],
    ['transf_scale3D_000', 'v', -0.5, 0.5], ['transf_function_enabledSw_false', 'b'], ['transf_minR2_p25', 'n', 0.05, 0.5],
    ['transf_maxR2_1', 'n', 0.7, 1.3], ['mandelbox_offset', 'v', -0.3, 0.3], ['mandelbox_scale', 'n', -2.6, 3],
    ['transf_function_enabledX_false', 'b'], ['transf_scale_vary_0', 'n', -0.2, 0.2], ['transf_scaleB_1', 'n', 0.6, 1.4],
    ['transf_function_enabledM_false', 'b'], ['transf_function_enabledAx_false', 'b'], ['transf_scale_1', 'n', 0.6, 1.4],
    ['transf_addition_constant', 'v', -0.3, 0.3], ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  206: [['transf_addition_constant_111', 'v', 0.6, 1.4], ['transf_function_enabled', 'b'], ['transf_function_enabled_false', 'b'],
    ['transf_scale3D_000', 'v', -0.5, 0.5], ['transf_offset_000', 'v', -0.3, 0.3], ['transf_invert_0', 'n', 0.01, 0.3],
    ['transf_invert_1', 'n', 0.6, 1.4], ['transf_scale_2', 'n', -2.6, 3], ['transf_function_enabledX_false', 'b'],
    ['transf_scale_vary_0', 'n', -0.2, 0.2], ['transf_scaleB_1', 'n', 0.6, 1.4], ['analyticDE_offset_0', 'n', 0, 1],
    ['transf_function_enabledAx_false', 'b'], ['transf_addition_constant', 'v', -0.3, 0.3], ['transf_scale_1', 'n', 0.6, 1.2],
    ['transf_addCpixel_enabled', 'b', 0.7], ['transf_constant_multiplier_111', 'v', 0.6, 1.4], ['transf_alternate_enabled_false', 'b'],
    ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  226: [['transf_addition_constant_111', 'v', 0.6, 1.4], ['transf_function_enabled', 'b'], ['transf_offsetA_000', 'v', -0.3, 0.3],
    ['transf_minR2_p25', 'n', 0.05, 0.5], ['transf_maxR2_1', 'n', 0.7, 1.3], ['transf_scale_2', 'n', -2.6, 3],
    ['analyticDE_offset_1', 'n', 0.5, 1.5], ['transf_function_enabledK_false', 'b'], ['transf_scale_vary_0', 'n', -0.2, 0.2],
    ['transf_scaleC_1', 'n', 0.6, 1.4], ['transf_rotation2_enabled_false', 'b'], ['transf_rotation', 'v', -20, 20],
    ['transf_addCpixel_enabled_false', 'b'], ['transf_constant_multiplier_111', 'v', 0.6, 1.4],
    ['transf_addition_constantA_000', 'v', -0.3, 0.3], ['transf_rotation2', 'v', -20, 20]],
  60: [['mandelbox_main_rotation_enabled', 'b'], ['mandelbox_rotation_main', 'v', -20, 20], ['transf_addition_constant_0555', 'v', 0.2, 1.2],
    ['transf_minimum_radius_06', 'n', 0.05, 0.8], ['transf_scale_015', 'n', 1.1, 2.4]],
  135: [['transf_addition_constant_0555', 'v', 0.2, 1.2], ['transf_function_enabledM', 'b'], ['transf_minR2_p25', 'n', 0.05, 0.5],
    ['transf_maxR2_1', 'n', 0.7, 1.3], ['transf_scale_015', 'n', 1.1, 2.4], ['transf_addition_constant', 'v', -0.3, 0.3],
    ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  136: [['transf_offset_111', 'v', 0.4, 1.4], ['transf_minimum_radius_0', 'n', 0.01, 0.5], ['transf_scale_015', 'n', 1.1, 2.4],
    ['transf_stop_iterations_15', 'i', 3, 20], ['transf_offsetA_111', 'v', -1, 1]],
  87: [['transf_addition_constant_111', 'v', 0.6, 1.4], ['transf_function_enabledM', 'b'], ['transf_function_enabledx_false', 'b'],
    ['transf_scale_1', 'n', 0.6, 1.4], ['mandelbox_folding_value', 'n', 1.4, 2.6], ['transf_function_enabled', 'b'],
    ['transf_minimum_radius_05', 'n', 0.05, 0.8], ['transf_scale_015', 'n', 1.1, 2.4], ['transf_addition_constant', 'v', -0.4, 0.4],
    ['transf_rotation_enabled', 'b'], ['transf_rotation', 'v', -20, 20]],
  18: [['mandelbox_scale', 'n', -2.6, 3], ['mandelbox_vary_scale_vary', 'n', -0.2, 0.2], ['mandelbox_vary_fold', 'n', 0.6, 1.4],
    ['mandelbox_vary_rpower', 'n', 0.7, 1.3], ['mandelbox_vary_minr', 'n', 0.2, 0.8], ['transf_function_enabledR_false', 'b'],
    ['transf_rotation44a', 'v', -30, 30], ['transf_rotation44b', 'v', -30, 30]],
};

const cases = [];
for (const id of Object.keys(MB_FORMULAS).map(Number)) {
  for (let k = 0; k < +N; k++) {
    const frac = {};
    for (const [name, kind, a, b] of P[id]) {
      if (rnd() < 0.35 && kind !== 'b') continue; // keep some at Mandelbulber's default
      if (kind === 'n') frac[name] = String(f6(R(a, b)));
      else if (kind === 'i') frac[name] = String(Math.floor(R(a, b + 1)));
      else if (kind === 'v') frac[name] = V3(a, b).map(f6).join(' ');
      else frac[name] = B(a ?? 0.5) ? 'true' : 'false';
    }
    const julia = B(0.25), dont = B(0.15);
    const main = {
      formula_1: String(id), N: String(8 + Math.floor(R(0, 12))), bailout: String(B(0.2) ? f6(R(10, 1000)) : 100),
      julia_mode: julia ? 'true' : 'false', julia_c: V3(-1, 1).map(f6).join(' '), dont_add_c_constant_1: dont ? 'true' : 'false',
      fractal_constant_factor: (B(0.2) ? V3(0.6, 1.4) : [1, 1, 1]).map(f6).join(' '), initial_waxis: String(id === 18 && B() ? f6(R(-0.5, 0.5)) : 0),
    };
    const pts = [];
    for (let j = 0; j < 12; j++) pts.push(V3(-2.5, 2.5).map(f6));
    cases.push({ id, frac, main, pts });
  }
}

// Mandelbulber side.
let input = '';
for (const c of cases) {
  const m = c.main;
  const addcEff = (({ 206: 1, 136: 1, 87: 1 })[c.id] ? m.dont_add_c_constant_1 === 'true' : m.dont_add_c_constant_1 !== 'true') ? 1 : 0;
  input += `CASE ${c.id} ${m.N} ${m.bailout} ${addcEff} ${m.julia_mode === 'true' ? 1 : 0} ${m.julia_c} ${m.fractal_constant_factor} ${m.initial_waxis}\n`;
  for (const [k, v] of Object.entries(c.frac)) input += `SET ${k} ${v === 'true' ? 1 : v === 'false' ? 0 : v}\n`;
  for (const p of c.pts) input += `P ${p.join(' ')}\n`;
}
const out = spawnSync(BIN, [], { input, maxBuffer: 1 << 28 });
if (out.status !== 0) { console.error(String(out.stderr)); process.exit(1); }
const ref = String(out.stdout).trim().split('\n').map(l => +l.split(' ')[0]);

// Pyxis side: importer mapping + localDE.
let idx = 0, total = 0, exact = 0, close = 0;
const byF = {};
const D0 = defaults();
for (const c of cases) {
  const S = { main_parameters: c.main, fractal_1: c.frac };
  const r = importFract({ S, m: c.main, notes: [] });
  if (!r.ok) { console.error('import failed', r.error); process.exit(1); }
  const v = { ...D0, ...r.params, iterations: +c.main.N, deepZoom: false };
  const de = localDE(v);
  const name = MB_FORMULAS[c.id][1];
  byF[name] ??= { n: 0, exact: 0, close: 0, worst: 0 };
  c.expect = [];
  for (const p of c.pts) {
    const a = ref[idx++], b = de(p).d;
    c.expect.push(a);
    const rel = Math.abs(a - b) / Math.max(1e-12, Math.abs(a));
    const e = Object.is(a, b) || (!Number.isFinite(a) && !Number.isFinite(b)) || rel < 1e-12, cl = e || rel < 1e-6;
    total++; exact += e; close += cl;
    const s = byF[name]; s.n++; s.exact += e; s.close += cl; if (!cl && Number.isFinite(rel)) s.worst = Math.max(s.worst, rel);
  }
}
for (const [k, s] of Object.entries(byF)) console.log(`  ${k.padEnd(26)} ${s.n} pts  exact ${(100 * s.exact / s.n).toFixed(1)}%  ≤1e-6 ${(100 * s.close / s.n).toFixed(1)}%${s.close < s.n ? `  (worst rel ${s.worst.toExponential(2)})` : ''}`);
console.log(`total ${total}: exact ${(100 * exact / total).toFixed(2)}%, within 1e-6 ${(100 * close / total).toFixed(2)}%`);
if (WRITE) { writeFileSync(WRITE, JSON.stringify(cases)); console.log('wrote', WRITE); }
process.exit(close / total > 0.98 ? 0 : 1);
