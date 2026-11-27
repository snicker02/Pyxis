// Pyxis's uniforms and program-spec data (Organon merges these into
// sceneUniforms; "__f" selects the program, the rest are uniforms).

import { effectiveIterations } from '../core/engine/params.js';
import { mat3Mul, mat3ToColumnMajor, transpose3 } from '../core/engine/vec.js';

const DEG = Math.PI / 180;
const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
// Mandelbulber CRotationMatrix::SetRotation2(degrees): Rz·Ry·Rx (row-major).
export const mbRot = d => mat3Mul(mat3Mul(Rz(d[2] * DEG), Ry(d[1] * DEG)), Rx(d[0] * DEG));
const v3 = (v, id) => [v[id + 'X'], v[id + 'Y'], v[id + 'Z']];
const glm = m => mat3ToColumnMajor(m);

// Rotation by angle (degrees) about unit axis n (Rodrigues), row-major.
export function axisAngle(n, deg) {
  const l = Math.hypot(n[0], n[1], n[2]);
  if (!(l > 0)) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = n.map(t => t / l), c = Math.cos(deg * DEG), s = Math.sin(deg * DEG), t = 1 - c;
  return [c + t * x * x, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, c + t * y * y, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, c + t * z * z];
}
// The Fragmentarium formulas' rotation as z' = M·z. Fragmentarium's
// rotationMatrix3(v, a) is built column-wise, i.e. it is Rᵀ(v, a), so
// "p *= rot" (row vector) rotates by R(v, a) and "p = rot * p" (MandalayBox)
// by R(v, −a); "p *= rotationMatrixXYZ(r)" is Rz·Ry·Rx, Mandelbulber's order.
export function fragmRot(v) {
  const V = v.boxVariant | 0;
  if (V === 16 || V === 17) return mbRot(v3(v, 'fmEuler'));
  const n = v3(v, 'fmAxis');
  return axisAngle(n, V === 14 ? -v.fmAngle : v.fmAngle);
}

// Row-major rotation matrices the formula uses (shared with de.js).
export function rotations(v) {
  const out = { rot: mbRot(v3(v, 'fRot')), rot2: mbRot(v3(v, 'fRot2')), fm: fragmRot(v) };
  if ((v.boxVariant | 0) === 0 && v.rotFolds) {
    for (const [k, id] of [['N', 'rfN'], ['P', 'rfP']]) for (let d = 0; d < 3; d++) {
      const m = mbRot(v3(v, `${id}${'XYZ'[d]}`));
      out[`rf${k}${d}`] = m;
      out[`rf${k}${d}i`] = transpose3(m);
    }
  }
  return out;
}

export function uniforms(v, scaleOverride) {
  const R = rotations(v);
  const a1 = [v.r4aX, v.r4aY, v.r4aZ].map(x => x * DEG), a2 = [v.r4bX, v.r4bY, v.r4bZ].map(x => x * DEG);
  const out = {
    __f: { variant: v.boxVariant | 0, rf: !!v.rotFolds },
    u_iterations: effectiveIterations(v),
    u_bailout: v.bailout,
    u_scale: scaleOverride ?? v.scale,
    u_scaleVary: v.scaleVary,
    u_fold: v3(v, 'fold'),
    u_fold4: v.fold4,
    u_foldValue: v.foldValue,
    u_foldOff: v3(v, 'foldOff'),
    u_zFold: !!v.zFold,
    u_zFoldScale: v.zFoldScale,
    u_eiffZBox: !!v.eiffZBox,
    u_kaliAdd: v3(v, 'kaliAdd'),
    u_minR2: v.minR2,
    u_fixR2: v.fixR2,
    u_sphOff: v3(v, 'sphOff'),
    u_rPowerOn: !!v.rPowerOn,
    u_rPower: v.rPower,
    u_rPower4: v.rPower4,
    u_varyAOn: !!v.varyAOn,
    u_varyA: v.varyA,
    u_varyABase: v.varyABase,
    u_varyASet: !!v.varyASet,
    u_deOff: v.deOff,
    u_rotOn: !!v.fRotOn,
    u_rot: glm(R.rot),
    u_rot2: glm(R.rot2),
    u_cylHalf: v.cylHalf,
    u_cylScale: v.cylScale,
    u_smoothOn: !!v.smoothOn,
    u_smooth: v3(v, 'smooth'),
    u_smoothStart: v.smoothStart | 0,
    u_smoothStop: v.smoothStop | 0,
    u_swapXZ: !!v.swapXZ,
    u_postScale: v.postScale,
    u_postScaleStop: v.postScaleStop | 0,
    u_sphOn: !!v.sphOn,
    u_bias: v3(v, 'bias'),
    u_biasSq: !!v.biasSq,
    u_biasClamp: !!v.biasClamp,
    u_cuboidOn: !!v.cuboidOn,
    u_cub: v3(v, 'cub'),
    u_cubSq: !!v.cubSq,
    u_invC: !!v.invC,
    u_invCS: v3(v, 'invCS'),
    u_invCAcc: !!v.invCAcc,
    u_invMin: v.invMin,
    u_invMax: v.invMax,
    u_pre: v3(v, 'pre'),
    u_addOn: !!v.addOn,
    u_addAlt: !!v.addAlt,
    u_addAltScale: v.addAltScale,
    u_addMul: v.addMul,
    u_add: v3(v, 'add'),
    u_kaliStop: v.kaliStop | 0,
    u_w0: v.w0,
    u_rot4On: !!v.rot4On,
    u_r4c1: a1.map(Math.cos), u_r4s1: a1.map(Math.sin),
    u_r4c2: a2.map(Math.cos), u_r4s2: a2.map(Math.sin),
    u_addC: !!v.addC,
    u_juliaMode: !!v.juliaMode,
    u_juliaC: v3(v, 'juliaC'),
    u_cMul: v3(v, 'cMul'),
    u_cIn: !!v.cIn,
    u_cInMul: v3(v, 'cInMul'),
    u_cInSigned: !!v.cInSigned,
    // Fragmentarium formulas (13–19).
    u_fmRot: glm(R.fm),
    u_fmTrans: v3(v, 'fmTrans'),
    u_foldW: v.foldW,
    u_sphOffW: v.sphOffW,
    u_mdFo: v3(v, 'mdFo'),
    u_mdG: v3(v, 'mdG'),
    u_mdW: v3(v, 'mdW'),
    u_mdPseudo: !!v.mdPseudo,
    u_mdSerial: !!v.mdSerial,
    u_mdBoxFold: !!v.mdBoxFold,
    u_sbFoldMod: v3(v, 'sbFoldMod'),
    u_fmVaryOff: v.fmVaryOff,
    u_tbCTOff: v.tbCTOff,
    u_pbFold: v.pbFold,
    u_icScale: [v.icScaleY, v.icScaleZ, v.icScaleInv],
    u_icIterA: v.icIterA | 0,
    u_icIterB: v.icIterB | 0,
  };
  for (const k of Object.keys(R)) if (k.startsWith('rf')) out['u_' + k] = glm(R[k]);
  return out;
}
