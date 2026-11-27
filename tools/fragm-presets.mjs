// Dev tool: turn the #preset blocks of the FragM example files behind Pyxis's
// Fragmentarium formulas into Pyxis parameter sets (formula values and camera).
//   node tools/fragm-presets.mjs <FragM Examples dir>   → JSON on stdout
// The output's entries go into tools/scenes-list.json ("fragm") by hand, with a
// label and look; tools/build-scenes.mjs then writes formula/scenes.js.
// Only parameter values are taken (the numbers a preset sets), never code.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../formula/index.js';
import { defaults } from '../formula/params.js';
import { cameraBasis } from '../core/engine/camera.js';
import { mat3MulVec, normalize, sub, dot, mul } from '../core/engine/vec.js';

const DIR = process.argv[2];
const C = [1, 0, 0, 0, 0, 1, 0, -1, 0]; // formula frame (Z up) → Organon (Y up), as the Mandelbulber import
const xyz = (id, v) => ({ [id + 'X']: v[0], [id + 'Y']: v[1], [id + 'Z']: v[2] });
const num = s => s.split(',').map(Number);

// Uniform defaults (the slider's middle value / checkbox) and every #preset block.
function parse(text) {
  const def = {};
  for (const m of text.matchAll(/^\s*uniform\s+(\w+)\s+(\w+)\s*;\s*(slider|checkbox)\[(.*)\]/gm)) {
    const [, type, name, kind, body] = m;
    if (kind === 'checkbox') def[name] = body.trim() === 'true';
    else if (type === 'float' || type === 'int') def[name] = Number(body.split(',')[1]);
    else def[name] = body.match(/\(([^)]*)\)/g)[1].slice(1, -1).split(',').map(Number);
  }
  const presets = {};
  for (const block of text.split(/^#preset\s+/m).slice(1)) {
    const [head, ...lines] = block.split('\n');
    const o = {};
    for (const l of lines) {
      if (/^#endpreset/.test(l)) break;
      const m = l.match(/^\s*(\w+)\s*=\s*([^\s]+)/);
      if (!m) continue;
      const raw = m[2];
      o[m[1]] = raw === 'true' ? true : raw === 'false' ? false : raw.includes(',') ? num(raw) : Number(raw);
    }
    presets[head.trim()] = o;
  }
  return { def, presets };
}

const MAP = {
  13: u => ({ iterations: u.Iterations, minR2: u.MinRad2, scale: u.Scale, ...xyz('fmTrans', u.Trans), ...xyz('juliaC', u.Julia), juliaMode: u.DoJulia, ...xyz('fmAxis', u.RotVector), fmAngle: u.RotAngle }),
  14: u => ({ iterations: u.Iterations, scale: u.Scale, mdBoxFold: u.DoBoxFold, ...xyz('fmAxis', u.RotVector), fmAngle: u.RotAngle, ...xyz('mdFo', u.fo),
    ...xyz('mdG', u.g ?? u.gh), ...(u.gw ? { mdPseudo: true, ...xyz('mdW', u.gw) } : {}), mdSerial: u.Serial, minR2: u.MinRad2, juliaMode: u.Julia, ...xyz('juliaC', u.JuliaC), bailout: 100 }),
  16: u => ({ iterations: u.Iterations, ...xyz('fold', u.Offset), foldW: u.Offset[3], minR2: u.minRR, fixR2: u.maxRR, ...xyz('sphOff', u.offsetSph), sphOffW: u.offsetSph[3],
    scale: u.Scale, ...xyz('fmEuler', u.Rotation), rot4On: u.rotate, ...xyz('r4a', [u.anglXY, u.anglYZ, u.anglXZ]), ...xyz('r4b', [u.anglXW, u.anglYW, u.anglZW]), bailout: 1000 }),
  18: u => ({ iterations: u.Iterations, ...xyz('fmAxis', u.RotVector), fmAngle: u.RotAngle, juliaMode: u.Julia, ...xyz('juliaC', u.JuliaC), scale: u.scale, pbFold: u.boxFold, minR2: u.sphereFold }),
  19: u => ({ iterations: u.Iterations, bailout: u.Bailout, ...xyz('fold', u.limit), minR2: u.MinRad2, icScaleY: u.ScaleY, icScaleZ: u.ScaleZ, icScaleInv: u.ScaleInv, scale: u.Scale,
    addC: true, ...xyz('cMul', u.c3Mul), juliaMode: u.cJulia.some(x => x), ...xyz('juliaC', u.cJulia), icIterA: u.iterA, icIterB: Math.min(u.iterB, 300), ...xyz('fmAxis', u.RotVector), fmAngle: u.RotAngle }),
};
const FILES = [
  [13, "Kali's Creations/Kalibox.frag"],
  [14, 'Knighty Collection/MandalayBox.frag'],
  [14, 'Knighty Collection/Pseudo-MandalayBox.frag'],
  [16, 'mclarekin/AexionnSphereBoxRot4D.frag'],
  [18, '3DickUlus/PetraBox.frag'],
  [19, 'mclarekin/abox inCyl-10.frag'],
];

function camera(u) {
  const o = { ...defaults(), objRotX: -90, objRotY: 0, objRotZ: 0, objX: 0, objY: 0, objZ: 0 };
  const eye = mat3MulVec(C, u.Eye), tgt = mat3MulVec(C, u.Target);
  const orbit = sub(eye, tgt), d = Math.hypot(...orbit);
  Object.assign(o, { targetX: tgt[0], targetY: tgt[1], targetZ: tgt[2], dist: d, rollX: 0, rollY: 0, rollZ: 0 });
  o.rotY = Math.asin(Math.max(-1, Math.min(1, -orbit[1] / d)));
  o.rotX = Math.atan2(orbit[0], orbit[2]);
  const b0 = cameraBasis({ ...o });
  let U = mat3MulVec(C, u.Up);
  U = normalize(sub(U, mul(b0.forward, dot(U, b0.forward))));
  o.rollZ = Math.atan2(-dot(U, b0.right), dot(U, b0.up));
  o.lens = 0.5 / (u.FOV ?? 0.4);
  const r = x => +x.toPrecision(8);
  return { rotX: r(o.rotX), rotY: r(o.rotY), dist: r(d), targetX: r(tgt[0]), targetY: r(tgt[1]), targetZ: r(tgt[2]), rollZ: r(o.rollZ), lens: r(o.lens),
    stepFactor: Math.min(1, u.FudgeFactor ?? 1), focalDist: r(d) };
}

const out = [];
for (const [V, file] of FILES) {
  const { def, presets } = parse(readFileSync(join(DIR, file), 'utf8'));
  for (const [name, pre] of Object.entries(presets)) {
    const u = { ...def, ...pre };
    if (!u.Eye || !u.Target) continue;
    out.push({ file, preset: name, variant: V, v: { ...MAP[V](u), ...camera(u) } });
  }
}
console.log(JSON.stringify(out, null, 1));
