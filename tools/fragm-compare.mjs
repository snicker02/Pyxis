// Dev tool: check Pyxis's Fragmentarium formulas (13–19) against the ORIGINAL
// FragM example code. For each formula, random parameter sets are run through
//   A  the original .frag DE() — read from your FragM examples checkout, its
//      uniforms turned into constants, compiled as-is on the GPU (WebGL2);
//   B  Pyxis's own mapLocal() — the same GLSL the app renders with;
//   C  Pyxis's CPU port (formula/fragm.js, double precision).
// A vs B is the port check (same GPU, both float32). C vs A is what
// tests/run.mjs re-checks from the saved fixture, without a GPU.
//
//   npm i --no-save playwright        (dev only; Pyxis itself has no dependencies)
//   node tools/fragm-compare.mjs <FragM Examples dir> [cases] [--write tests/fixtures/fragmref.json]
// <FragM Examples dir>: a clone of github.com/3Dickulus/Fragmentarium_Examples_Folder
// with its submodules (mclarekin, 3DickUlus) checked out.
// The .frag files are GPL / LGPL / their authors'; they are read at run time and
// never copied into Pyxis.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import '../formula/index.js';
import { defaults } from '../formula/params.js';
import { VARIANT_DEFAULTS } from '../formula/presets.js';
import { uniforms } from '../formula/uniforms.js';
import { localDE } from '../formula/de.js';
import { fractalMapSource } from '../formula/glsl.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [DIR, N = '15'] = args;
const WRITE = process.argv.includes('--write') ? process.argv[process.argv.indexOf('--write') + 1] : null;
if (!DIR) { console.error('usage: node tools/fragm-compare.mjs <FragM Examples dir> [cases] [--write file]'); process.exit(1); }

let seed = 4242;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const R = (a, b) => +(a + rnd() * (b - a)).toFixed(4);
const B = (p = 0.5) => rnd() < p;
const V3 = (a, b) => [R(a, b), R(a, b), R(a, b)];
const xyz = (id, v) => ({ [id + 'X']: v[0], [id + 'Y']: v[1], [id + 'Z']: v[2] });

// Per formula: the .frag file, and a random case → { u: FragM uniform values, p: Pyxis params }.
const FORMULAS = {
  13: { file: "Kali's Creations/Kalibox.frag", gen() {
    const S = R(1.3, 2.6), m = R(0.1, 0.8), T = V3(-1.5, 1), J = V3(-1.5, 0.5), ax = V3(0.1, 1), an = R(0, 60), jul = B(0.8), it = 8 + (rnd() * 10 | 0);
    return { u: { Iterations: it, ColorIterations: 3, MinRad2: m, Scale: S, Trans: T, Julia: J, DoJulia: jul, RotVector: ax, RotAngle: an },
      p: { scale: S, minR2: m, ...xyz('fmTrans', T), ...xyz('juliaC', J), juliaMode: jul, ...xyz('fmAxis', ax), fmAngle: an, iterations: it } };
  } },
  14: { file: 'Knighty Collection/MandalayBox.frag', gen() {
    const S = (B() ? -1 : 1) * R(1.5, 2.8), m = R(0.05, 0.5), fo = V3(0.2, 1), g = V3(0, 0.5), ser = B(0.4), bf = B(0.3), jul = B(0.3), J = V3(-1, 1), ax = V3(0.1, 1), an = R(0, 60), it = 6 + (rnd() * 8 | 0);
    return { u: { Iterations: it, Scale: S, DoBoxFold: bf, RotVector: ax, RotAngle: an, fo, g, Serial: ser, MinRad2: m, Julia: jul, JuliaC: J, time: 0 },
      p: { scale: S, minR2: m, ...xyz('mdFo', fo), ...xyz('mdG', g), mdSerial: ser, mdBoxFold: bf, juliaMode: jul, ...xyz('juliaC', J), ...xyz('fmAxis', ax), fmAngle: an, iterations: it, bailout: 100 } };
  } },
  '14p': { V: 14, file: 'Knighty Collection/Pseudo-MandalayBox.frag', gen() {
    const S = (B() ? -1 : 1) * R(1.5, 2.8), m = R(0.05, 0.5), fo = V3(0.2, 1), g = V3(0, 0.5), w = V3(0, 0.6), ser = B(0.4), bf = B(0.3), jul = B(0.3), J = V3(-1, 1), ax = V3(0.1, 1), an = R(0, 60), it = 6 + (rnd() * 8 | 0);
    return { u: { Iterations: it, Scale: S, DoBoxFold: bf, RotVector: ax, RotAngle: an, fo, gh: g, gw: w, Serial: ser, MinRad2: m, Julia: jul, JuliaC: J, time: 0 },
      p: { scale: S, minR2: m, ...xyz('mdFo', fo), ...xyz('mdG', g), mdPseudo: true, ...xyz('mdW', w), mdSerial: ser, mdBoxFold: bf, juliaMode: jul, ...xyz('juliaC', J), ...xyz('fmAxis', ax), fmAngle: an, iterations: it, bailout: 100 } };
  } },
  15: { file: 'mclarekin/darkbeam_surfbox.frag', gen() {
    const S = (B(0.7) ? -1 : 1) * R(1.4, 2.6), f = V3(0.6, 1.4), cap = V3(0.1, 2.5), m = R(0.05, 0.5), M = R(0.7, 1.3), vs = B() ? R(-0.2, 0.2) : 0, vo = R(0.5, 1), ax = V3(0.1, 1), an = R(0, 40), cm = V3(0.6, 1.2), J = B(0.3) ? V3(-0.5, 0.5) : [0, 0, 0], de = R(0.8, 1.2), it = 10 + (rnd() * 20 | 0);
    return { u: { Iterations: it, ColorIterations: 3, Bailout: 100, fold: f, foldMod: cap, MinR2: m, MaxR2: M, Scale: S, varyScale: vs, varyOffset: vo, RotVector: ax, RotAngle: an, c3Mul: cm, cJulia: J, DEtweak: de },
      p: { scale: S, ...xyz('fold', f), ...xyz('sbFoldMod', cap), minR2: m, fixR2: M, scaleVary: vs, fmVaryOff: vo, ...xyz('fmAxis', ax), fmAngle: an, addC: true, ...xyz('cMul', cm), juliaMode: true, ...xyz('juliaC', J), deOff: de, iterations: it, bailout: 100 } };
  } },
  16: { file: 'mclarekin/AexionnSphereBoxRot4D.frag', gen() {
    const S = R(1.4, 2.6), o = [...V3(0.6, 1.4), R(0.6, 1.4)], m = R(0.05, 0.5), M = R(0.7, 1.3), so = [...V3(-0.2, 0.2), R(-0.2, 0.2)], rot = V3(-30, 30), r4 = B(), a = V3(-40, 40), b = V3(-40, 40), it = 8 + (rnd() * 10 | 0);
    return { u: { Iterations: it, ColorIterations: 3, Offset: o, minRR: m, maxRR: M, offsetSph: so, Scale: S, Rotation: rot, rotate: r4, anglXY: a[0], anglYZ: a[1], anglXZ: a[2], anglXW: b[0], anglYW: b[1], anglZW: b[2] },
      p: { scale: S, ...xyz('fold', o), foldW: o[3], minR2: m, fixR2: M, ...xyz('sphOff', so), sphOffW: so[3], ...xyz('fmEuler', rot), rot4On: r4, ...xyz('r4a', a), ...xyz('r4b', b), iterations: it, bailout: 1000 } };
  } },
  17: { file: 'mclarekin/Aexions_TetraBox2.frag', gen() {
    const S = R(1.4, 2.6), o = [...V3(0.6, 1.4), R(0.6, 1.4)], m = R(0.05, 0.5), M = R(0.7, 1.3), so = [...V3(-0.2, 0.2), R(-0.2, 0.2)], rot = V3(-30, 30), ct = R(0, 4), it = 8 + (rnd() * 10 | 0);
    return { u: { Iterations: it, ColorIterations: 3, CToffset: ct, Offset: o, minRR: m, maxRR: M, offsetSph: so, Scale: S, Rotation: rot },
      p: { scale: S, ...xyz('fold', o), foldW: o[3], minR2: m, fixR2: M, ...xyz('sphOff', so), sphOffW: so[3], ...xyz('fmEuler', rot), tbCTOff: ct, iterations: it, bailout: 100 } };
  } },
  18: { file: '3DickUlus/PetraBox.frag', gen() {
    const S = (B() ? -1 : 1) * R(1.5, 2.6), bf = R(0.6, 1.4), sf = R(0.05, 0.6), jul = B(0.4), J = V3(-1, 1), ax = V3(0.1, 1), an = R(0, 60), it = 4 + (rnd() * 8 | 0);
    return { u: { Iterations: it, ColorIterations: 3, Power: 8, DerivativeBias: 1, AlternateVersion: false, RotVector: ax, RotAngle: an, Julia: jul, JuliaC: J, Petra: false, scale: S, boxFold: bf, sphereFold: sf },
      p: { scale: S, pbFold: bf, minR2: sf, juliaMode: jul, ...xyz('juliaC', J), ...xyz('fmAxis', ax), fmAngle: an, iterations: it } };
  } },
  19: { file: 'mclarekin/abox inCyl-10.frag', gen() {
    const S = (B(0.7) ? -1 : 1) * R(1.4, 2.6), f = V3(0.6, 1.4), m = R(0.05, 0.5), sy = R(-2, 2), sz = R(0.5, 1.5), si = R(0.6, 1.4), ia = rnd() * 8 | 0, ib = B() ? 300 : ia + 1 + (rnd() * 6 | 0), ax = V3(0.1, 1), an = R(0, 40), cm = V3(0.6, 1.2), J = B(0.3) ? V3(-0.5, 0.5) : [0, 0, 0], it = 10 + (rnd() * 15 | 0);
    return { u: { Iterations: it, Bailout: 100, ColorIterations: 3, limit: f, MinRad2: m, ScaleY: sy, ScaleZ: sz, ScaleInv: si, Scale: S, c3Mul: cm, cJulia: J, iterA: ia, iterB: ib, RotVector: ax, RotAngle: an },
      p: { scale: S, ...xyz('fold', f), minR2: m, icScaleY: sy, icScaleZ: sz, icScaleInv: si, icIterA: ia, icIterB: ib, ...xyz('fmAxis', ax), fmAngle: an, addC: true, ...xyz('cMul', cm), juliaMode: true, ...xyz('juliaC', J), iterations: it, bailout: 100 } };
  } },
};

// FragM helpers the .frag files rely on (MathUtils.frag, DE-Raytracer.frag).
const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
#define PI 3.14159265358979
mat3 rotationMatrix3(vec3 v, float angle) {
  float c = cos(radians(angle)); float s = sin(radians(angle));
  return mat3(c + (1.0 - c) * v.x * v.x, (1.0 - c) * v.x * v.y - s * v.z, (1.0 - c) * v.x * v.z + s * v.y,
    (1.0 - c) * v.x * v.y + s * v.z, c + (1.0 - c) * v.y * v.y, (1.0 - c) * v.y * v.z - s * v.x,
    (1.0 - c) * v.x * v.z - s * v.y, (1.0 - c) * v.y * v.z + s * v.x, c + (1.0 - c) * v.z * v.z);
}
mat3 rotationMatrixXYZ(vec3 v) {
  return rotationMatrix3(vec3(1.0, 0.0, 0.0), v.x) * rotationMatrix3(vec3(0.0, 1.0, 0.0), v.y) * rotationMatrix3(vec3(0.0, 0.0, 1.0), v.z);
}
vec4 orbitTrap = vec4(10000.0);
`;
const glslVal = (type, x) => {
  const f = n => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  if (type === 'bool') return x ? 'true' : 'false';
  if (type === 'int') return String(x | 0);
  if (type === 'float') return f(x);
  return `${type}(${x.map(f).join(', ')})`;
};
// The original file, up to its presets, as compilable GLSL ES 3.00 with the
// case's uniform values as constants.
function fragmSource(text, u) {
  const body = text.split(/^#preset/m)[0].split('\n').filter(l => !/^\s*#/.test(l)).map(l => {
    const m = l.match(/^\s*uniform\s+(\w+)\s+(\w+)\s*;/);
    if (!m) return l;
    const [, type, name] = m;
    if (!(name in u)) throw new Error(`no value for uniform ${name}`);
    return `const ${type} ${name} = ${glslVal(type, u[name])};`;
  }).join('\n');
  // Fragmentarium allows non-constant global initializers; GLSL ES does not.
  // Declare those globals plainly and assign them at the start of main().
  let depth = 0;
  const inits = [];
  const src = body.split('\n').map(l => {
    const m = depth === 0 && l.match(/^\s*(float|int|bool|vec[234]|mat[234])\s+(\w+)\s*=\s*(.+);\s*(\/\/.*)?$/);
    for (const ch of l.replace(/\/\/.*$/, '')) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (!m) return l;
    inits.push(`  ${m[2]} = ${m[3]};`);
    return `${m[1]} ${m[2]};`;
  }).join('\n');
  return `${PRELUDE}${src}
uniform vec3 u_pts[16];
out vec4 outColor;
void main() {
${inits.join('\n')}
  init();
  vec3 p = u_pts[int(gl_FragCoord.x)];
  outColor = vec4(DE(p), 0.0, 0.0, 1.0);
}`;
}
const pyxisSource = spec => `${fractalMapSource(spec)}
uniform vec3 u_pts[16];
void main() {
  vec3 p = vec3(0.0);
  for (int k = 0; k < 16; k++) if (k == int(gl_FragCoord.x)) p = u_pts[k];
  float t;
  gl_FragColor = vec4(mapLocal(p, t), 0.0, 0.0, 1.0);
}`;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setContent('<canvas width=16 height=1></canvas>');
await page.evaluate(() => {
  const gl = document.querySelector('canvas').getContext('webgl2');
  gl.getExtension('EXT_color_buffer_float');
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 16, 1, 0, gl.RGBA, gl.FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  window.run = (fs, uniforms, pts, es3) => {
    const vs = es3 ? '#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }' : 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'a');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(pr, i), name = info.name.replace(/\[0\]$/, ''), loc = gl.getUniformLocation(pr, info.name);
      if (name === 'u_pts') { gl.uniform3fv(loc, new Float32Array(pts.flat())); continue; }
      let x = uniforms[name];
      if (x === undefined) x = 0;
      const T = info.type;
      if (T === gl.FLOAT) gl.uniform1f(loc, +x);
      else if (T === gl.INT || T === gl.BOOL || T === gl.SAMPLER_2D) gl.uniform1i(loc, +x);
      else if (T === gl.FLOAT_VEC2) gl.uniform2fv(loc, x.length ? x : [0, 0]);
      else if (T === gl.FLOAT_VEC3) gl.uniform3fv(loc, x.length ? x : [0, 0, 0]);
      else if (T === gl.FLOAT_VEC4) gl.uniform4fv(loc, x.length ? x : [0, 0, 0, 0]);
      else if (T === gl.FLOAT_MAT3) gl.uniformMatrix3fv(loc, false, x.length ? x : [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      else if (T === gl.FLOAT_MAT4) gl.uniformMatrix4fv(loc, false, x.length ? x : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    gl.viewport(0, 0, 16, 1);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = new Float32Array(64);
    gl.readPixels(0, 0, 16, 1, gl.RGBA, gl.FLOAT, out);
    gl.deleteProgram(pr);
    return Array.from({ length: 16 }, (_, k) => out[k * 4]);
  };
});

const D = defaults();
// SurfBox and Inverse Cylinder end their original DE() without a return when a
// point never bails out (undefined in GLSL; this GPU gives exactly 0). Pyxis
// returns r / |dr| there, Mandelbulber's rule. Such points are counted apart
// ("no return") and kept in the fixture flagged inside.
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-3, Math.abs(b));
const fixture = [];
// Tolerances are relative (absolute below 1e-3): A and B are float32, C double.
const totals = { n: 0, ab: 0, ca: 0 };
for (const [key, F] of Object.entries(FORMULAS)) {
  const V = F.V ?? +key;
  const text = readFileSync(join(DIR, F.file), 'utf8');
  let n = 0, ab = 0, ca = 0, worstAB = 0, noRet = 0;
  for (let c = 0; c < +N; c++) {
    const cs = F.gen();
    const v = { ...D, ...VARIANT_DEFAULTS[V], ...cs.p, boxVariant: V, colorSource: 0 };
    const pts = Array.from({ length: 16 }, () => V3(-2.5, 2.5));
    const A = await page.evaluate(([fs, pts]) => window.run(fs, {}, pts, true), [fragmSource(text, cs.u), pts]);
    const U = { ...uniforms(v), u_colorIters: 6, u_colorSource: 0, u_foldColW: 0.25 };
    const Bv = await page.evaluate(([fs, u, pts]) => window.run(fs, u, pts, false), [pyxisSource(U.__f), U, pts]);
    const de = localDE(v);
    const C = pts.map(p => de(p).d);
    const keep = [];
    for (let k = 0; k < 16; k++) {
      if (!Number.isFinite(A[k])) continue;
      if (A[k] === 0 && (V === 15 || V === 19)) { noRet++; keep.push({ p: pts[k], d: 0, inside: true }); continue; }
      n++;
      const eAB = rel(Bv[k], A[k]);
      worstAB = Math.max(worstAB, eAB);
      if (eAB <= 1e-3) ab++;
      else if (process.env.DEBUG) console.log('   ', key, c, k, 'A', A[k], 'B', Bv[k], 'C', C[k], JSON.stringify(cs.u).slice(0, 300));
      if (rel(C[k], A[k]) <= 1e-3) ca++;
      keep.push({ p: pts[k], d: A[k] });
    }
    fixture.push({ V, file: F.file, p: cs.p, pts: keep });
  }
  totals.n += n; totals.ab += ab; totals.ca += ca;
  console.log(`  ${String(key).padEnd(4)} ${F.file.padEnd(44)} ${n} pts${noRet ? ` (+${noRet} no return)` : ''}  GPU port ≤1e-3 ${(100 * ab / n).toFixed(1)}% (worst ${worstAB.toExponential(1)})  CPU ≤1e-3 ${(100 * ca / n).toFixed(1)}%`);
}
console.log(`total ${totals.n}: GPU port ≤1e-3 ${(100 * totals.ab / totals.n).toFixed(2)}%, CPU ≤1e-3 ${(100 * totals.ca / totals.n).toFixed(2)}%`);
await browser.close();
if (WRITE) { writeFileSync(WRITE, JSON.stringify(fixture)); console.log(`wrote ${WRITE}`); }
