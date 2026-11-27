// Template formula GLSL: a plain Mandelbox. Organon wraps it with the shared
// renderer (core/engine/glsl.js documents the program layout).

export const UNIFORMS = `uniform int   u_iterations;
uniform float u_scale;
uniform float u_minR;
uniform float u_fixedR2;
uniform vec3  u_fold;
uniform bool  u_juliaMode;
uniform vec3  u_juliaC;
`;

// Must define: float mapLocal(vec3 p, out float trap)
// Writes g_boxCol / g_sphCol / g_colOn and, under HAS_MAT, the texture probe.
const SOURCE = `
// ═══ Distance estimator: Mandelbox (Tom Lowe) ═════════════════════════════
float mapLocal(vec3 p, out float trap) {
#ifdef HAS_MAT
  g_texDone = false;
#endif
  g_boxCol = 0.0;
  g_sphCol = 0.0;
  vec3 z = p;
  vec3 c = u_juliaMode ? u_juliaC : p;
  float dr = 1.0;
  float minR2 = u_minR * u_minR;
  trap = 1e10;
  for (int i = 0; i < 250; i++) {
    if (i >= u_iterations) break;
    g_colOn = i < u_colorIters ? 1.0 : 0.0;
    // Box fold: reflect each component that is past its limit.
    g_boxCol += g_colOn * dot(step(u_fold, abs(z)), vec3(1.0));
    z = clamp(z, -u_fold, u_fold) * 2.0 - z;
    // Sphere fold: inside minR scale up linearly, between minR and fixedR invert.
    float r2 = dot(z, z);
    if (r2 < minR2) { float k = u_fixedR2 / minR2; z *= k; dr *= k; g_sphCol += g_colOn; }
    else if (r2 < u_fixedR2) { float k = u_fixedR2 / r2; z *= k; dr *= k; g_sphCol += 0.5 * g_colOn; }
    z = u_scale * z + c;
    dr = dr * abs(u_scale) + 1.0;
    trap = min(trap, dot(z, z));
#ifdef HAS_MAT
    if (g_texProbe && !g_texDone && i >= u_texFracStart) {
      vec3 zz = abs(z - p);
      if (max(zz.x, max(zz.y, zz.z)) < u_texFracCube) { g_texZ = z; g_texDone = true; }
      else if (length(z) > u_texFracCube * 100.0) { g_texZ = z / length(z); g_texDone = true; }
    }
#endif
    if (dot(z, z) > 1e4) break;
  }
#ifdef HAS_MAT
  g_orbit = trap;
  if (g_texProbe && !g_texDone) g_texZ = z;
#endif
  float folds = g_boxCol + g_sphCol;
  if (u_colorSource == 1) trap = folds * u_foldColW * 2.5;
  else if (u_colorSource == 2) trap += folds * u_foldColW * 2.5;
  return length(z) / abs(dr);
}
`;

// One program for every setting: nothing to specialise.
export const source = () => SOURCE;
export const defines = () => '';
export const spec = () => ({});
export const specKey = () => 'mbox';
export const DEFAULT_SPEC = {};
