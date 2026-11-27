// Pyxis logic tests: `node tests/run.mjs` (no dependencies).
//   • schema, gates and formula defaults
//   • CPU distance estimator vs Mandelbulber's own C++ (tests/fixtures/mbref.json,
//     made by tools/mbref-compare.mjs from Mandelbulber's FormulaCode)
//   • CPU distance estimator vs the original Fragmentarium code for formulas
//     13–19 (tests/fixtures/fragmref.json, made by tools/fragm-compare.mjs)
//   • shader assembly for every formula, render mode and option
//     (glslangValidator, if installed)
//   • Mandelbulber .fract import of every bundled scene, discovery strings,
//     projects, Evolve and Rebirth

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as L from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 60) console.log('  FAIL', m); } };
const section = s => console.log('•', s);
const D = L.defaults();

// ── Schema ──────────────────────────────────────────────────────────────────
section('schema');
const gids = new Set(L.GROUPS.map(g => g.id));
for (const p of L.PARAMS) {
  ok(gids.has(p.group), `${p.id}: unknown group ${p.group}`);
  ok(L.coerce(p, p.def) === p.def || p.type === 'text', `${p.id}: default survives coerce`);
  if (p.type === 'range') ok(p.min < p.max && p.def >= (p.hardMin ?? -Infinity), `${p.id}: range`);
  if (p.gate) {
    const g = L.PARAM_BY_ID.get(p.gate);
    const eqs = Array.isArray(p.gateEq) ? p.gateEq : [p.gateEq];
    ok(g && (g.type === 'bool' || (g.type === 'select' && eqs.every(e => Number.isInteger(e) && e >= 0 && e < g.options.length))), `${p.id}: gate ${p.gate}`);
  }
}
ok(L.BOX_VARIANTS.length === 20 && L.VARIANT_DEFAULTS.length === 20 && L.VARIANT_DESC.length === 20, 'one default set and description per formula');
for (const [V, vd] of L.VARIANT_DEFAULTS.entries()) {
  ok(vd.boxVariant === V, `variant ${V} defaults name their formula`);
  for (const [k, x] of Object.entries(vd)) {
    const p = L.PARAM_BY_ID.get(k);
    ok(!!p, `variant ${V}: unknown param ${k}`);
    if (p && p.type === 'range') ok(L.coerce(p, x) === x, `variant ${V}: ${k}=${x} outside its hard range`);
  }
}
// Every formula control is reachable for the formulas that read it.
const visible = (id, v) => L.isActive(L.PARAM_BY_ID.get(id), v);
ok(visible('fixR2', { ...D, boxVariant: 0 }) && !visible('fixR2', { ...D, boxVariant: 8 }), 'Fixed R² hidden for Kali (fixed at 1)');
ok(visible('kaliAddX', { ...D, boxVariant: 8 }) && !visible('kaliAddX', { ...D, boxVariant: 0 }), 'Kali fold shown only for the Kali boxes');
ok(visible('fRotX', { ...D, boxVariant: 3, fRotOn: true }) && !visible('fRotX', { ...D, boxVariant: 3, fRotOn: false }), 'rotation angles follow Rotation');
ok(!visible('fRotOn', { ...D, boxVariant: 10 }) && !visible('fRotOn', { ...D, boxVariant: 12 }), 'no 3D rotation for Kali V3 / Vary Scale 4D');

// ── CPU DE vs Mandelbulber ──────────────────────────────────────────────────
section('distance estimator vs Mandelbulber (C++ reference)');
const ref = JSON.parse(readFileSync(join(HERE, 'fixtures/mbref.json'), 'utf8'));
const per = {};
for (const c of ref) {
  const r = L.importFract({ S: { main_parameters: c.main, fractal_1: c.frac }, m: c.main, notes: [] });
  ok(r.ok, `fixture import ${c.id}`);
  const de = L.localDE({ ...D, ...r.params, iterations: +c.main.N, deepZoom: false });
  const name = L.MB_FORMULAS[c.id][1];
  per[name] ??= [0, 0];
  c.pts.forEach((p, j) => {
    const a = c.expect[j], b = de(p).d;
    const good = Object.is(a, b) || Math.abs(a - b) <= 1e-6 * Math.max(1e-12, Math.abs(a));
    per[name][0]++; per[name][1] += good;
    ok(good, `${name} at ${p}: Mandelbulber ${a}, Pyxis ${b}`);
  });
}
console.log('   ' + Object.entries(per).map(([k, [n, g]]) => `${k.replace('Abox - ', '')} ${g}/${n}`).join(' · '));

// ── CPU DE vs the original Fragmentarium code ───────────────────────────────
// tests/fixtures/fragmref.json: distances from the original FragM .frag DE(),
// compiled on a GPU (float32) by tools/fragm-compare.mjs. Pyxis's CPU port runs
// in double precision, so the check is relative 1e-3, and a few percent of
// points may drift further where float32 rounding is amplified through the
// folds (MandalayBox). "inside": the original returns nothing (no bailout).
section('fragmentarium reference');
const fref = JSON.parse(readFileSync(join(HERE, 'fixtures/fragmref.json'), 'utf8'));
const fper = {};
for (const c of fref) {
  const de = L.localDE({ ...D, ...L.VARIANT_DEFAULTS[c.V], ...c.p, boxVariant: c.V, colorSource: 0, deepZoom: false });
  const k = c.file.split('/').pop();
  fper[k] ??= [0, 0];
  for (const { p, d, inside } of c.pts) {
    const b = de(p).d;
    if (inside) { ok(Number.isFinite(b) && b >= 0 && b < 0.05, `${k} at ${p}: inside, Pyxis ${b}`); continue; }
    fper[k][0]++;
    fper[k][1] += Math.abs(b - d) <= 1e-3 * Math.max(1, Math.abs(d)) ? 1 : 0;
  }
}
for (const [k, [n, g]] of Object.entries(fper)) ok(g >= 0.93 * n, `${k}: ${g}/${n} within 1e-3 of the original`);
console.log('   ' + Object.entries(fper).map(([k, [n, g]]) => `${k.replace('.frag', '')} ${g}/${n}`).join(' · '));

// ── Shaders ─────────────────────────────────────────────────────────────────
section('shaders');
const hasGlslang = spawnSync('glslangValidator', ['--version']).status === 0;
const tmp = mkdtempSync(join(tmpdir(), 'pyxis-'));
let compiled = 0;
const keys = new Set();
for (let V = 0; V < L.BOX_VARIANTS.length; V++) for (const rf of V === 0 ? [false, true] : [false]) {
  const v = { ...D, ...L.VARIANT_DEFAULTS[V], rotFolds: rf };
  const su = L.sceneUniforms(v);
  const sp = L.specOf(su);
  keys.add(L.specKey(sp));
  const decl = {};
  const full = L.fractalFrag(sp.f, { mode: 1, mat: true, xl: true, rep: true, dz: true });
  for (const m of full.matchAll(/^\s*uniform\s+(\w+)\s+([^;\n]+);/gm)) for (const n of m[2].split(',')) decl[n.trim()] = m[1];
  for (const k of Object.keys(L.sceneUniforms({ ...v, matOn: true, light2On: true, repMode: 1, deepZoom: true }))) if (!k.startsWith('__')) ok(k in decl, `V${V}${rf ? 'r' : ''}: uniform ${k} declared`);
  ok(full.includes(`#define BOX_VARIANT ${V}`) && full.includes('float mapLocal('), `V${V}: formula spliced`);
  if (!hasGlslang) continue;
  for (const mode of [0, 1, 2]) for (const [mat, xl, rep, dz] of (mode === 0 ? [[0, 0, 0, 0], [1, 1, 1, 1], [1, 0, 0, 0], [0, 0, 1, 0]] : [[0, 0, 0, 0], [1, 1, 1, 1]])) {
    const src = L.fractalFrag(sp.f, { mode, mat: !!mat, xl: !!xl, rep: !!rep, dz: !!dz });
    const f = join(tmp, 's.frag');
    writeFileSync(f, '#version 100\n' + src);
    const r = spawnSync('glslangValidator', [f]);
    ok(r.status === 0, `V${V}${rf ? ' rotated folds' : ''} mode ${mode} mat ${mat} xl ${xl} rep ${rep} dz ${dz}:\n${String(r.stdout).slice(0, 600)}`);
    compiled++;
  }
}
rmSync(tmp, { recursive: true, force: true });
ok(keys.size === L.BOX_VARIANTS.length + 1, `${L.BOX_VARIANTS.length + 1} distinct programs (${keys.size})`);
console.log(hasGlslang ? `   ${compiled} programs compiled (glslangValidator, GLSL ES 1.00)` : '   glslangValidator not installed: compile checks skipped');

// ── DE sanity per formula (defaults) ────────────────────────────────────────
section('distance estimator sanity');
for (let V = 0; V < 13; V++) {
  const v = { ...D, ...L.VARIANT_DEFAULTS[V] };
  const de = L.makeDE(v);
  ok(de([0, 0, 60]).d > 1, `V${V}: far away → large distance (${de([0, 0, 60]).d.toFixed(2)})`);
  let finite = 0;
  for (let i = 0; i < 200; i++) { const d = de([Math.sin(i) * 3, Math.cos(i * 1.7) * 3, Math.sin(i * 2.3) * 3]).d; if (Number.isFinite(d) && d >= 0) finite++; }
  ok(finite >= 196, `V${V}: distances finite and ≥ 0 (${finite}/200)`);
}

// ── Presets and scenes ──────────────────────────────────────────────────────
section('presets');
for (const [k, b] of Object.entries(L.BIOMES)) {
  for (const id of Object.keys(b.v)) ok(L.PARAM_BY_ID.has(id), `preset ${k}: unknown param ${id}`);
  const v = { ...D, ...b.v };
  // (the origin itself is a removable singularity for inversions and r powers)
  const de = L.makeDE(v);
  ok([[0.13, -0.21, 0.37], [1.1, 0.4, -0.7], [3, 2, 1]].every(p => Number.isFinite(de(p).d)), `preset ${k}: DE finite`);
  ok(typeof b.label === 'string' && b.group, `preset ${k}: label and group`);
}
const PRESET_DIR = join(HERE, '../presets/mandelbulber');
const fracts = readdirSync(PRESET_DIR).filter(f => f.endsWith('.fract'));
ok(fracts.length > 0, 'bundled .fract scenes');
for (const f of fracts) {
  const r = L.importMandelbulber(readFileSync(join(PRESET_DIR, f), 'utf8'));
  ok(r.ok, `import ${f}: ${r.error || ''}`);
}

// ── Import errors ───────────────────────────────────────────────────────────
section('import');
const bad = L.importMandelbulber('# Mandelbulber settings file\n[main_parameters]\nformula_1 2;\n');
ok(!bad.ok && /not one Pyxis can import/.test(bad.error), 'Mandelbulb file refused with a clear reason');
const hyb = L.importMandelbulber('# Mandelbulber settings file\n[main_parameters]\nformula_1 8;\nformula_2 7;\nhybrid_fractal_enable true;\n');
ok(!hyb.ok && /Hybrid/.test(hyb.error), 'hybrid refused');
const one = L.importMandelbulber('# Mandelbulber settings file\n[main_parameters]\nformula_1 206;\n');
ok(one.ok && one.params.boxVariant === 6 && one.params.addC === false && one.params.cIn === true, 'Mod 14 defaults: no outer c, c added inside');
const kali = L.importMandelbulber('# Mandelbulber settings file\n[main_parameters]\nformula_1 60;\n[fractal_1]\ntransf_scale_015 1,8;\n');
ok(kali.ok && kali.params.boxVariant === 8 && kali.params.scale === 1.8, 'decimal-comma value read');

// ── Discovery / project / Evolve / Rebirth ──────────────────────────────────
section('round trips');
const v1 = { ...D, ...L.VARIANT_DEFAULTS[4], cuboidOn: true, cubX: 0.31, scale: -1.77, juliaMode: true, juliaCX: 0.2 };
const back = L.decodeDiscovery(L.encodeDiscovery(v1));
ok(Object.keys(D).every(k => (typeof v1[k] === 'number' ? Math.abs(back[k] - v1[k]) <= 1e-6 * Math.max(1, Math.abs(v1[k])) : back[k] === v1[k])), 'discovery string round trip');
ok(L.encodeDiscovery(v1).startsWith('PYXIS1:'), 'PYXIS1: prefix');
const pj = L.parseProject(JSON.stringify(L.makeProject(v1, [v1])));
ok(pj.params.cuboidOn === true && pj.keyframes.length === 1, 'project round trip');
for (let i = 0; i < 30; i++) { const e = L.evolve({ ...D, boxVariant: i % 13 }); ok(Object.keys(e).every(k => L.PARAM_BY_ID.get(k)?.mutate), 'evolve touches mutable params only'); }
for (const V of [0, 4, 8]) { const rb = L.rebirth({ ...D, ...L.VARIANT_DEFAULTS[V] }, 6); ok(rb && rb.values.boxVariant === V, `rebirth keeps formula ${V}`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
