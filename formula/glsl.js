// Pyxis's GLSL: the Mandelbox-family formula uniforms and mapLocal(). Organon
// (core/engine/glsl.js) wraps them with the shared renderer.
//
// Each formula is a line-for-line port of Mandelbulber's FormulaCode
// (formula/definition/fractal_*.cpp) plus the iteration loop around it
// (src/compute_fractal.cpp: c addition, bailout, linear DE r / DE). The
// program is SPECIALISED per formula (#define BOX_VARIANT), so a formula's
// code costs nothing to the others; the Mandelbox's rotated folds are their
// own program too (BOX_ROTFOLDS). Everything continuous is a uniform.
//
// formula/de.js is the CPU port of the same code, kept in lock-step.

import { fractalFrag as coreFrag, fractalMapSource as coreMapSource } from '../core/engine/glsl.js';

// Formula uniforms (inserted after Organon's render-mode uniforms).
export const UNIFORMS = `uniform int   u_iterations;
uniform float u_bailout;
uniform float u_scale;        // mandelbox_scale / transf_scale_015 / transf_scale_2
uniform float u_scaleVary;    // mandelbox_vary_scale_vary
uniform vec3  u_fold;         // box fold limits
uniform float u_fold4;        // Vary Scale 4D fold limit
uniform float u_foldValue;
uniform vec3  u_foldOff;      // ABox Mod 1 fold offset
uniform bool  u_zFold;
uniform float u_zFoldScale;
uniform bool  u_eiffZBox;
uniform vec3  u_kaliAdd;      // Kali fold: k − |z|
uniform float u_minR2;
uniform float u_fixR2;
uniform vec3  u_sphOff;
uniform bool  u_rPowerOn;
uniform float u_rPower;
uniform float u_rPower4;
uniform bool  u_varyAOn;
uniform float u_varyA;
uniform float u_varyABase;
uniform bool  u_varyASet;
uniform float u_deOff;
uniform bool  u_rotOn;
uniform mat3  u_rot;
uniform mat3  u_rot2;
uniform float u_cylHalf;
uniform float u_cylScale;
uniform bool  u_smoothOn;
uniform vec3  u_smooth;
uniform int   u_smoothStart;
uniform int   u_smoothStop;
uniform bool  u_swapXZ;
uniform float u_postScale;
uniform int   u_postScaleStop;
uniform bool  u_sphOn;
uniform vec3  u_bias;
uniform bool  u_biasSq;
uniform bool  u_biasClamp;
uniform bool  u_cuboidOn;
uniform vec3  u_cub;
uniform bool  u_cubSq;
uniform bool  u_invC;
uniform vec3  u_invCS;
uniform bool  u_invCAcc;
uniform float u_invMin;
uniform float u_invMax;
uniform vec3  u_pre;
uniform bool  u_addOn;
uniform bool  u_addAlt;
uniform float u_addAltScale;
uniform float u_addMul;
uniform vec3  u_add;
uniform int   u_kaliStop;
uniform float u_w0;
uniform bool  u_rot4On;
uniform vec3  u_r4c1;         // cos / sin of the 4D plane angles (XY, YZ, XZ)
uniform vec3  u_r4s1;
uniform vec3  u_r4c2;         // (XW, YW, ZW)
uniform vec3  u_r4s2;
uniform bool  u_addC;
uniform bool  u_juliaMode;
uniform vec3  u_juliaC;
uniform vec3  u_cMul;
uniform bool  u_cIn;
uniform vec3  u_cInMul;
uniform bool  u_cInSigned;
#ifdef BOX_ROTFOLDS
uniform mat3  u_rfN0, u_rfN1, u_rfN2, u_rfP0, u_rfP1, u_rfP2;      // mandelbox rot[0][d], rot[1][d]
uniform mat3  u_rfN0i, u_rfN1i, u_rfN2i, u_rfP0i, u_rfP1i, u_rfP2i; // and their inverses
#endif
`;

const SOURCE = `
// Mandelbulber's smooth box fold (Tglad-S, used by ABox Mod 11-14).
vec3 smoothBoxFold(vec3 z) {
  vec3 len = 2.0 * u_fold;
  vec3 s = 1.0 / len;
  vec3 a = vec3(0.0);
  vec3 az = abs(z);
  if (az.x < u_fold.x) a.x = z.x * z.x * s.x;
  if (az.y < u_fold.y) a.y = z.y * z.y * s.y;
  if (az.z < u_fold.z) a.z = z.z * z.z * s.z;
  if (az.x > u_fold.x && az.x < len.x) a.x = (len.x - az.x) * (len.x - az.x) * s.x;
  if (az.y > u_fold.y && az.y < len.y) a.y = (len.y - az.y) * (len.y - az.y) * s.y;
  if (az.z > u_fold.z && az.z < len.z) a.z = (len.z - az.z) * (len.z - az.z) * s.z;
  a *= u_smooth;
  return z - sign(z) * a;
}

// Tglad box fold |z + f| − |z − f| − z, counting the axes it changed.
vec3 tgladFold(vec3 z, bool foldZ) {
  vec3 o = z;
  z.x = abs(z.x + u_fold.x) - abs(z.x - u_fold.x) - z.x;
  z.y = abs(z.y + u_fold.y) - abs(z.y - u_fold.y) - z.y;
  if (foldZ) z.z = abs(z.z + u_fold.z) - abs(z.z - u_fold.z) - z.z;
  if (z.x != o.x) g_boxCol += g_colOn;
  if (z.y != o.y) g_boxCol += g_colOn;
  if (z.z != o.z) g_boxCol += g_colOn;
  return z;
}

#ifdef BOX_ROTFOLDS
// Mandelbox rotated fold for one axis (mandelboxIteration, rotationsEnabled).
vec3 rotFold(vec3 z, mat3 rn, mat3 rni, mat3 rp, mat3 rpi, int d, float lim) {
  vec3 zr = rn * z;
  float v = d == 0 ? zr.x : (d == 1 ? zr.y : zr.z);
  if (v > lim) {
    v = u_foldValue - v;
    if (d == 0) zr.x = v; else if (d == 1) zr.y = v; else zr.z = v;
    g_boxCol += g_colOn;
    return rni * zr;
  }
  zr = rp * z;
  v = d == 0 ? zr.x : (d == 1 ? zr.y : zr.z);
  if (v < -lim) {
    v = -u_foldValue - v;
    if (d == 0) zr.x = v; else if (d == 1) zr.y = v; else zr.z = v;
    g_boxCol += g_colOn;
    return rpi * zr;
  }
  return z;
}
#endif

// ═══ Distance estimator ═══════════════════════════════════════════════════
// p is in the formula's own frame (Mandelbulber's, Z up); Organon's object
// transform maps the scene into it.
float mapLocal(vec3 p, out float trap) {
#ifdef HAS_MAT
  g_texDone = false;
#endif
  g_boxCol = 0.0;
  g_sphCol = 0.0;
  vec3 z = p;
  vec3 c = p;
  float w = 0.0;             // 4D (Vary Scale 4D only)
#if BOX_VARIANT == 12
  w = u_w0;
#endif
  vec3 cAux = c;             // aux.c (Mod 13 accumulating inverse c)
  float dr = 1.0;
  float aScale = u_scale;    // aux.actualScale
  float aScaleA = 0.0;       // aux.actualScaleA
  float posNeg = 1.0;        // aux.pos_neg
  float r = length(z);
  trap = 1e10;
  for (int i = 0; i < 250; i++) {
    if (i >= u_iterations) break;
    g_colOn = i < u_colorIters ? 1.0 : 0.0;

#if BOX_VARIANT == 0
    // ── Mandelbox ──────────────────────────────────────────────────────────
  #ifdef BOX_ROTFOLDS
    z = rotFold(z, u_rfN0, u_rfN0i, u_rfP0, u_rfP0i, 0, u_fold.x);
    z = rotFold(z, u_rfN1, u_rfN1i, u_rfP1, u_rfP1i, 1, u_fold.y);
    z = rotFold(z, u_rfN2, u_rfN2i, u_rfP2, u_rfP2i, 2, u_fold.z);
  #else
    if (abs(z.x) > u_fold.x) { z.x = sign(z.x) * u_foldValue - z.x; g_boxCol += g_colOn; }
    if (abs(z.y) > u_fold.y) { z.y = sign(z.y) * u_foldValue - z.y; g_boxCol += g_colOn; }
    if (abs(z.z) > u_fold.z) { z.z = sign(z.z) * u_foldValue - z.z; g_boxCol += g_colOn; }
  #endif
    float r2 = dot(z, z);
    z += u_sphOff;
    if (r2 < u_minR2) { float k = u_fixR2 / u_minR2; z *= k; dr *= k; g_sphCol += g_colOn; }
    else if (r2 < u_fixR2) { float k = u_fixR2 / r2; z *= k; dr *= k; g_sphCol += 0.5 * g_colOn; }
    z -= u_sphOff;
    if (u_rotOn) z = u_rot * z;
    z *= u_scale;
    dr = dr * abs(u_scale) + 1.0;

#elif BOX_VARIANT == 1
    // ── ABox Mod 1 ─────────────────────────────────────────────────────────
    aScale = u_scale + u_scaleVary * (abs(aScale) - 1.0);
    vec3 o = z;
    z.x = u_foldValue - abs(abs(z.x + u_foldOff.x) - u_foldValue) - abs(u_foldOff.x);
    z.y = u_foldValue - abs(abs(z.y + u_foldOff.y) - u_foldValue) - abs(u_foldOff.y);
    if (u_zFold) {
      float fv = u_foldValue * u_zFoldScale;
      z.z = fv - abs(abs(z.z + u_foldOff.z) - fv) - abs(u_foldOff.z);
      if (z.z != o.z) g_boxCol += g_colOn;
    }
    if (z.x != o.x) g_boxCol += g_colOn;
    if (z.y != o.y) g_boxCol += g_colOn;
    float rr = dot(z, z);
    if (u_rPowerOn) rr = pow(rr, u_rPower);
    if (rr < u_minR2) { float k = u_fixR2 / u_minR2; z *= k; dr *= k; g_sphCol += g_colOn; }
    else if (rr < u_fixR2) { float k = u_fixR2 / rr; z *= k; dr *= k; g_sphCol += 0.5 * g_colOn; }
    z *= aScale;
    dr = dr * abs(aScale) + 1.0;
    if (u_rotOn) z = u_rot * z;

#elif BOX_VARIANT == 2
    // ── ABox Mod 2 (cylinder) ───────────────────────────────────────────────
    aScale = u_scale + u_scaleVary * (abs(aScale) - 1.0);
    z = tgladFold(z, u_zFold);
    float tz = abs(z.z) - u_cylHalf;
    float rr = z.x * z.x + z.y * z.y;
    if (tz > 0.0) rr = rr + tz * tz * u_cylScale;
    if (u_rPowerOn) rr = pow(rr, u_rPower);
    if (rr < u_minR2) { float k = u_fixR2 / u_minR2; z *= k; dr *= k; g_sphCol += g_colOn; }
    else if (rr < u_fixR2) { float k = u_fixR2 / rr; z *= k; dr *= k; g_sphCol += 0.5 * g_colOn; }
    z *= aScale;
    dr = dr * abs(aScale) + 1.0;
    if (u_rotOn) z = u_rot * z;

#elif BOX_VARIANT == 3
    // ── ABox Mod 11 ────────────────────────────────────────────────────────
    aScale = u_scale + u_scaleVary * (abs(aScale) - 1.0);
    z = tgladFold(z, u_zFold);
    if (u_smoothOn && i >= u_smoothStart && i < u_smoothStop) z = smoothBoxFold(z);
    if (u_swapXZ) z = z.zyx;
    float rr = dot(z, z);
    z += u_sphOff;
    if (rr < u_minR2) { float k = u_fixR2 / u_minR2; z *= k; dr *= k; g_sphCol += g_colOn; }
    else if (rr < u_fixR2) { float k = u_fixR2 / rr; z *= k; dr *= k; g_sphCol += 0.5 * g_colOn; }
    z -= u_sphOff;
    z *= aScale;
    dr = dr * abs(aScale) + 1.0;
    z += u_add;
    if (u_rotOn) z = u_rot * z;
    if (i < u_postScaleStop) { z *= u_postScale; dr = dr * abs(u_postScale); }

#elif BOX_VARIANT == 4
    // ── ABox Mod 12 ────────────────────────────────────────────────────────
    z = tgladFold(z, u_zFold);
    if (u_smoothOn && i >= u_smoothStart && i < u_smoothStop) z = smoothBoxFold(z);
    if (u_swapXZ) z = z.zyx;
    float m = 1.0;
    vec3 oz = z;
    if (u_sphOn) {
      vec3 b = u_bias * (u_biasSq ? c * c : abs(c));
      float mr2 = u_minR2 + b.x + b.y + b.z;
      if (u_biasClamp && mr2 > u_fixR2) mr2 = u_fixR2;
      float rr = dot(z, z);
      z += u_sphOff;
      if (rr < mr2) { m *= u_fixR2 / mr2; g_sphCol += g_colOn; }
      else if (rr < u_fixR2) { m *= u_fixR2 / rr; g_sphCol += 0.5 * g_colOn; }
      z -= u_sphOff;
      z *= m;
      dr *= abs(m);
    }
    if (u_cuboidOn) {
      float rr = dot(z, z);
      z += u_sphOff;
      vec3 t3 = u_cubSq ? z * z : abs(z);
      if (t3.x < u_cub.x && t3.y < u_cub.y && t3.z < u_cub.z) {
        vec3 R2 = u_cub / t3;
        float mr2 = rr * min(R2.x, min(R2.y, R2.z));
        if (mr2 > u_fixR2) mr2 = u_fixR2;
        m *= u_fixR2 / mr2;
        g_sphCol += g_colOn;
      } else if (rr < u_fixR2) { m *= u_fixR2 / rr; g_sphCol += 0.5 * g_colOn; }
      z -= u_sphOff;
      z *= m;
      dr *= abs(m);
    }
    if (z == oz) {
      float rr = dot(z, z);
      z += u_sphOff;
      if (rr < u_minR2) { m *= u_fixR2 / u_minR2; g_sphCol += g_colOn; }
      else if (rr < u_fixR2) { m *= u_fixR2 / rr; g_sphCol += 0.5 * g_colOn; }
      z -= u_sphOff;
      z *= m;
      dr *= abs(m);
    }
    float useScale = u_scale;
    if (u_varyAOn) {
      useScale += aScaleA;
      z *= useScale;
      dr = dr * abs(useScale) + 1.0;
      float vary = u_varyA * (abs(aScaleA) - u_varyABase);
      if (u_varyASet) aScaleA = -vary; else aScaleA -= vary;
    } else {
      z *= useScale;
      dr = dr * abs(useScale) + 1.0;
    }
    z += u_add;
    if (u_rotOn) z = u_rot * z;

#elif BOX_VARIANT == 5
    // ── ABox Mod 13 ────────────────────────────────────────────────────────
    if (u_invC) {
      if (u_invCAcc) { cAux *= u_invCS; cAux *= 1.0 / dot(cAux, cAux); z += cAux; }
      else { vec3 cs = c * u_invCS; z += cs * (1.0 / dot(cs, cs)); }
    }
    z = tgladFold(z, u_zFold);
    if (u_smoothOn && i >= u_smoothStart && i < u_smoothStop) z = smoothBoxFold(z);
    if (u_swapXZ) z = z.zyx;
    float rr = dot(z, z);
    z += u_sphOff;
    if (rr < u_minR2) { float k = u_fixR2 / u_minR2; z *= k; dr *= k; g_sphCol += g_colOn; }
    else if (rr < u_fixR2) { float k = u_fixR2 / rr; z *= k; dr *= k; g_sphCol += 0.5 * g_colOn; }
    z -= u_sphOff;
    float useScale = u_scale;
    if (u_varyAOn) {
      useScale += aScaleA;
      z *= useScale;
      dr = dr * abs(useScale) + 1.0;
      float vary = u_varyA * (abs(aScaleA) - u_varyABase);
      if (u_varyASet) aScaleA = -vary; else aScaleA -= vary;
    } else {
      z *= useScale;
      dr = dr * abs(useScale) + 1.0;
    }
    if (u_addAlt) { z += posNeg * u_add; posNeg *= -1.0 * u_addAltScale; }
    else z += u_add;
    if (u_rotOn) z = u_rot * z;

#elif BOX_VARIANT == 6
    // ── ABox Mod 14 ────────────────────────────────────────────────────────
    z = tgladFold(z, u_zFold);
    if (u_smoothOn && i >= u_smoothStart && i < u_smoothStop) z = smoothBoxFold(z);
    z += u_pre;
    float rr = dot(z, z);
    float m;
    if (rr < u_invMin) { m = 1.0 / u_invMin; g_sphCol += g_colOn; }
    else if (rr < u_invMax) { m = 1.0 / rr; g_sphCol += 0.5 * g_colOn; }
    else m = 1.0 / u_invMax;
    z *= m;
    dr *= m;
    float useScale = u_scale;
    if (u_varyAOn) {
      useScale += aScaleA;
      z *= useScale;
      dr = dr * abs(useScale) + u_deOff;
      aScaleA = -(u_varyA * (abs(aScaleA) - u_varyABase));
    } else {
      z *= useScale;
      dr = dr * abs(useScale) + u_deOff;
    }
    if (u_addOn) { z += posNeg * u_add; posNeg *= u_addMul; }
    if (u_cIn) {
      vec3 tc = u_cInSigned ? sign(z) * abs(c) : c;
      z += tc * u_cInMul;
    }
    if (u_rotOn) z = u_rot * z;

#elif BOX_VARIANT == 7
    // ── ABox Mod 15 ────────────────────────────────────────────────────────
    z = tgladFold(z, u_zFold);
    z += u_pre;
    float rr = dot(z, z);
    float m = 1.0;
    if (rr < u_minR2) { m = u_fixR2 / u_minR2; g_sphCol += g_colOn; }
    else if (rr < u_fixR2) { m = u_fixR2 / rr; g_sphCol += 0.5 * g_colOn; }
    z *= m;
    dr *= m;
    float useScale = aScaleA + u_scale;
    z *= useScale;
    dr = dr * abs(useScale) + u_deOff;
    if (u_varyAOn) aScaleA = -(u_varyA * (abs(aScaleA) - u_varyABase));
    if (u_rotOn) z = u_rot * z;
    if (u_cIn) z += c * u_cInMul;
    z += u_add;
    z = u_rot2 * z;

#elif BOX_VARIANT == 8
    // ── Kali Box (ABox Mod Kali) ───────────────────────────────────────────
    if (u_rotOn) z = u_rot * z;
    z = u_kaliAdd - abs(z);
    float rr = dot(z, z);
    float dv = rr < u_minR2 ? u_minR2 : min(rr, 1.0);
    if (rr < 1.0) g_sphCol += rr < u_minR2 ? g_colOn : 0.5 * g_colOn;
    float m = u_scale / dv;
    z *= m;
    dr = dr * abs(m) + 1.0;

#elif BOX_VARIANT == 9
    // ── ABox Mod Kali V2 ───────────────────────────────────────────────────
    z.x = u_kaliAdd.x - abs(z.x);
    z.y = u_kaliAdd.y - abs(z.y);
    if (u_zFold) z.z = u_kaliAdd.z - abs(z.z);
    float rr = dot(z, z);
    float m = u_scale;
    if (rr < u_minR2) { m *= u_fixR2 / u_minR2; g_sphCol += g_colOn; }
    else if (rr < u_fixR2) { m *= u_fixR2 / rr; g_sphCol += 0.5 * g_colOn; }
    z *= m;
    dr = dr * abs(m) + 1.0;
    z += u_add;
    if (u_rotOn) z = u_rot * z;
    z += u_add;

#elif BOX_VARIANT == 10
    // ── ABox Mod Kali V3 ───────────────────────────────────────────────────
    if (i < u_kaliStop) {
      z = u_kaliAdd - abs(z);
      float rr = dot(z, z);
      float dv = rr < u_minR2 ? u_minR2 : min(rr, 1.0);
      if (rr < 1.0) g_sphCol += rr < u_minR2 ? g_colOn : 0.5 * g_colOn;
      float m = -u_scale / dv;
      z *= m;
      dr = dr * abs(m) + 1.0;
    }
    z += u_add;

#elif BOX_VARIANT == 11
    // ── ABox Mod Kali-Eiffie ───────────────────────────────────────────────
    z = tgladFold(z, u_zFold);
    if (u_eiffZBox) {
      float zl = u_fold.z * u_zFoldScale;
      float zv = u_foldValue * u_zFoldScale;
      if (abs(z.z) > zl) { z.z = sign(z.z) * zv - z.z; g_boxCol += g_colOn; }
    }
    if (u_swapXZ) z = z.zyx;
    if (z.y > z.x) z = z.yxz;
    float rr = dot(z, z);
    float m = u_scale;
    if (rr < u_minR2) { m = m / u_minR2; g_sphCol += g_colOn; }
    else if (rr < 1.0) { m = m / rr; g_sphCol += 0.5 * g_colOn; }
    z *= m;
    dr = dr * abs(m) + 1.0;
    z += u_add;
    if (u_rotOn) z = u_rot * z;

#elif BOX_VARIANT == 12
    // ── Mandelbox Vary Scale 4D ────────────────────────────────────────────
    aScale = u_scale + u_scaleVary * (abs(aScale) - 1.0);
    vec4 z4 = vec4(z, w);
    vec4 o4 = z4;
    z4 = abs(z4 + u_fold4) - abs(z4 - u_fold4) - z4;
    if (z4.x != o4.x) g_boxCol += g_colOn;
    if (z4.y != o4.y) g_boxCol += g_colOn;
    if (z4.z != o4.z) g_boxCol += g_colOn;
    if (z4.w != o4.w) g_boxCol += g_colOn;
    float rr = pow(dot(z4, z4), u_rPower4);
    float m = aScale;
    if (rr < u_minR2) { m = aScale / u_minR2; g_sphCol += g_colOn; }
    else if (rr < 1.0) { m = aScale / rr; g_sphCol += 0.5 * g_colOn; }
    z4 *= m;
    dr = dr * abs(m) + 1.0;
    if (u_rot4On) {
      vec4 t = z4;
      z4.x = t.x * u_r4c1.x + t.y * u_r4s1.x; z4.y = -t.x * u_r4s1.x + t.y * u_r4c1.x;
      t = z4;
      z4.y = t.y * u_r4c1.y + t.z * u_r4s1.y; z4.z = -t.y * u_r4s1.y + t.z * u_r4c1.y;
      t = z4;
      z4.x = t.x * u_r4c1.z + t.z * u_r4s1.z; z4.z = -t.x * u_r4s1.z + t.z * u_r4c1.z;
      t = z4;
      z4.x = t.x * u_r4c2.x + t.w * u_r4s2.x; z4.w = -t.x * u_r4s2.x + t.w * u_r4c2.x;
      t = z4;
      z4.y = t.y * u_r4c2.y + t.w * u_r4s2.y; z4.w = -t.y * u_r4s2.y + t.w * u_r4c2.y;
      t = z4;
      z4.z = t.z * u_r4c2.z + t.w * u_r4s2.z; z4.w = -t.z * u_r4s2.z + t.w * u_r4c2.z;
    }
    z = z4.xyz;
    w = z4.w;
#endif

    // c addition (compute_fractal.cpp). ABox Mod 1 adds c as (y, x, z).
    if (u_addC) {
#if BOX_VARIANT == 1
      z += u_juliaMode ? (u_juliaC * u_cMul).yxz : c.yxz * u_cMul;
#else
      z += u_juliaMode ? u_juliaC * u_cMul : c * u_cMul;
#endif
#if BOX_VARIANT == 12
      if (!u_juliaMode) w += u_w0; // CVector4 · CVector3 keeps w
#endif
    }

    float zz = dot(z, z) + w * w;
    r = sqrt(zz);
    trap = min(trap, zz);
#ifdef HAS_MAT
    if (g_texProbe && !g_texDone && i >= u_texFracStart) {
      vec3 dz = abs(z - p);
      if (max(dz.x, max(dz.y, dz.z)) < u_texFracCube) { g_texZ = z; g_texDone = true; }
      else if (r > u_texFracCube * 100.0) { g_texZ = z / r; g_texDone = true; }
    }
#endif
    if (r > u_bailout) break;
  }
#ifdef HAS_MAT
  g_orbit = trap;
  if (g_texProbe && !g_texDone) g_texZ = z;
#endif
  float folds = g_boxCol + g_sphCol;
  if (u_colorSource == 1) trap = folds * u_foldColW * 2.5;
  else if (u_colorSource == 2) trap += folds * u_foldColW * 2.5;
  return r / abs(dr);
}
`;

export const defines = f => `#define BOX_VARIANT ${f.variant | 0}\n` + (f.rf ? '#define BOX_ROTFOLDS\n' : '');
export const source = () => SOURCE;

// Canonical spec from sceneUniforms().__f: the formula, plus the Mandelbox's
// rotated folds (their own program, so the plain Mandelbox stays fast).
export function spec(raw) {
  raw = raw || {};
  const variant = Math.max(0, Math.min(12, raw.variant | 0));
  return { variant, rf: variant === 0 && !!raw.rf };
}
export const specKey = f => `b${f.variant}${f.rf ? 'r' : ''}`;
export const DEFAULT_SPEC = spec({ variant: 0 });

// Test helpers.
export const fractalFrag = (s = DEFAULT_SPEC, opts = {}) => coreFrag({ f: spec(s && s.f ? s.f : s) }, opts);
export const fractalMapSource = (s = DEFAULT_SPEC, opts = {}) => coreMapSource({ f: spec(s && s.f ? s.f : s) }, opts);
