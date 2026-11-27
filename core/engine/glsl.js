// GLSL ES 1.00 sources (WebGL1).
//
// The fractal shader is SPECIALISED per program spec: the formula emits
// straight-line code for exactly what its spec selects (fold types, stack
// steps, DE shape …), and Organon adds the optional code paths (render mode,
// materials, extra lights, repetition, deep zoom) as #defines. Everything
// continuous is a uniform, so dragging a slider never recompiles.
//
// Program layout (fractalFrag):
//   #extension / #define RENDER_MODE … + formula.glsl.defines(spec) + HAS_MAT …
//   PRELUDE            progressive plumbing, path tracer, volumetric uniforms
//   formula.glsl.uniforms
//   COMMON             camera, shading, environment, colour, light uniforms
//   CORE_GLOBALS       g_boxCol / g_sphCol / g_colOn and the texture probe
//   formula.glsl.source(spec)   must define  float mapLocal(vec3 p, out float trap)
//   TAIL               object transform, repetition, map(), normals, AO,
//                      shadows, ground, materials, surface / path / volume main()

import { F } from './formula.js';

export const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Tone/display pass: accumulated linear colour → screen.
export const DISPLAY_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_tonemap; // 0 = legacy v1 curve, 1 = filmic (ACES fit) + sRGB gamma
void main() {
  vec3 col = max(texture2D(u_tex, v_uv).rgb, vec3(0.0));
  if (u_tonemap == 1) {
    col = clamp(col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
    col = pow(col, vec3(1.0 / 2.2));
  } else {
    col = pow(col, vec3(0.8));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const PRELUDE = `
precision highp float;

// ── progressive / tiling plumbing ──
uniform vec2  u_resolution;   // full image size (uv space)
uniform vec2  u_pixelOffset;  // tile origin inside the full image
uniform vec2  u_bufferSize;   // size of the render target being written
uniform vec2  u_jitter;       // sub-pixel AA offset for this sample
uniform vec2  u_lensSample;   // low-discrepancy DOF lens sample for this pass
uniform sampler2D u_prev;     // previous running average
uniform float u_blend;        // 1/(n+1); 1.0 = first sample, ignore u_prev
uniform float u_sampleIndex;  // progressive sample number (path tracer / volume RNG)

// ── path tracer ──
uniform int   u_ptBounces;
uniform float u_ptRough;
uniform float u_ptMetal;
uniform float u_ptSky;
uniform vec3  u_ptSkyColor;
uniform float u_ptSun;
uniform float u_ptLightSize;
uniform float u_ptEmit;
uniform float u_ptClamp;

// ── volumetric ──
uniform float u_volDensity;
uniform float u_volThick;
uniform float u_volGlow;
uniform float u_volStepMin;
uniform int   u_volSteps;
uniform float u_volLight;

`;

const COMMON = `// ── camera ──
uniform vec3  u_camPos;
uniform vec3  u_camRight;
uniform vec3  u_camUp;
uniform vec3  u_camForward;
uniform float u_lens;
#ifdef DEEP_ZOOM
// Deep zoom: world size of one pixel per unit of ray distance.
#define DZ_PIX (1.0 / (u_lens * min(u_resolution.x, u_resolution.y)))
#endif
uniform float u_dof;
uniform float u_focalDist;

// ── shading ──
uniform int   u_maxSteps;
uniform float u_detail;
uniform float u_stepFactor;
uniform float u_maxStep;       // 0 = off; Mandelbulber caps every march step at 3
float marchStep(float d) { float s = d * u_stepFactor; return u_maxStep > 0.0 ? min(s, u_maxStep) : s; }
uniform float u_maxDist;
uniform bool  u_missAsHit;
uniform int   u_debugView;

// ── environment ──
uniform sampler2D u_env;
uniform int   u_envMode;      // 0 solid, 1 backdrop, 2 panorama
uniform float u_envAspect;    // source image aspect (for backdrop cover-fit)
uniform float u_envIntensity;
uniform float u_envBlur;
uniform mat3  u_envRot;
uniform float u_envReflect;
uniform float u_envLight;
uniform bool  u_envFog;
uniform float u_fog;
uniform float u_volumetric;
uniform float u_brightness;
uniform float u_vignette;
uniform float u_colorShift;
uniform int   u_colorSource;   // what each value means is up to the formula's mapLocal()
uniform float u_foldColW;      // weight on the fold count
uniform int   u_colorIters;    // folds count only in the first N iterations (broad bands)
uniform sampler2D u_grad;      // 256×1 colour gradient LUT (engine/gradients.js)
uniform float u_gradScale;
uniform vec3  u_lightPos;
uniform vec3  u_lightColor;
uniform vec3  u_bgColor;
uniform float u_ambient;
uniform float u_stepAO;
uniform float u_aoStrength;
uniform bool  u_shadows;
uniform float u_shadowSoft;
`;

const CORE_GLOBALS = `
// ── fold-count colour + texture probe (written by the formula's mapLocal) ──
// Every fold that actually changes z adds to g_boxCol (sphere folds to
// g_sphCol) while g_colOn is 1; the material "Fold Count" key reads both.
float g_boxCol;
float g_sphCol;
float g_colOn;  // 1 while the current iteration counts toward the colour
// Texture "fractalize" probe (Mandelbulber calcModeCubeOrbitTrap): when set,
// mapLocal records the first orbit point, from u_texFracStart on, that lies in
// a cube of half-size u_texFracCube around the start point.
#ifdef HAS_MAT
uniform int   u_texFracStart;
uniform float u_texFracCube;
bool  g_texProbe = false;
bool  g_texDone = false;
vec3  g_texZ = vec3(0.0);
float g_orbit = 0.0; // raw orbit trap min |z|² (before any colour-source override)
#endif
`;

const TAIL = `
// Object transform: the fractal is evaluated in its own frame, so it can be
// moved, turned and scaled without touching the camera, light or ground.
// Rigid motion keeps the DE exact; uniform scale multiplies it back out.
uniform mat3  u_objInv;   // local-from-world rotation (transpose of the object's)
uniform vec3  u_objPos;
uniform float u_objScale;
#ifdef HAS_REP
// ═══ Repetition / arrays ════════════════════════════════════════════════════
// Copies of the fractal in a finite grid or a ring. Each copy gets the object
// transform plus optional per-copy rotation, scale and colour shift. The
// distance is capped at the distance to the cell wall (+ a small pad), so a
// ray that crosses into a neighbouring cell is re-evaluated against that
// cell's copy: correct as long as each copy stays inside its own cell.
uniform int   u_repMode;      // 1 grid, 2 ring
uniform vec3  u_repCount;     // grid: copies on each side of the centre (n → 2n + 1)
uniform vec3  u_repSpace;     // grid spacing
uniform float u_repRingN;     // ring: number of copies
uniform float u_repRingR;     // ring: radius
uniform int   u_repRingAxis;  // 0 X, 1 Y, 2 Z
uniform bool  u_repRingRotate;
uniform vec4  u_repVar;       // max rotation (rad), scale ± fraction, colour shift, seed
uniform float u_repPad;

vec3 repHash(vec3 c) {
  vec3 q = fract(c * vec3(0.1031, 0.1030, 0.0973) + u_repVar.w * 0.6180339);
  q += dot(q, q.yxz + 3.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}
vec3 repToAxis(vec3 z) { return u_repRingAxis == 0 ? z.yzx : (u_repRingAxis == 1 ? z.zxy : z); }
vec3 repFromAxis(vec3 w) { return u_repRingAxis == 0 ? w.zxy : (u_repRingAxis == 1 ? w.yzx : w); }

float map(vec3 p, out float trap) {
  vec3 q = p, cid = vec3(0.0);
  float bound = 1e10;
  if (u_repMode == 1) {
    vec3 sp = max(u_repSpace, vec3(1e-4));
    vec3 idx = clamp(floor(p / sp + 0.5), -u_repCount, u_repCount);
    q = p - idx * sp;
    cid = idx;
    vec3 up = (idx + 0.5) * sp - p, lo = p - (idx - 0.5) * sp;
    if (idx.x < u_repCount.x) bound = min(bound, up.x);
    if (idx.x > -u_repCount.x) bound = min(bound, lo.x);
    if (idx.y < u_repCount.y) bound = min(bound, up.y);
    if (idx.y > -u_repCount.y) bound = min(bound, lo.y);
    if (idx.z < u_repCount.z) bound = min(bound, up.z);
    if (idx.z > -u_repCount.z) bound = min(bound, lo.z);
  } else if (u_repMode == 2) {
    vec3 w = repToAxis(p);
    float sec = 6.2831853 / u_repRingN;
    float a = atan(w.y, w.x);
    float k = floor(a / sec + 0.5);
    float da = a - k * sec;
    float rho = length(w.xy);
    vec3 lw;
    if (u_repRingRotate) lw = vec3(rho * cos(da) - u_repRingR, rho * sin(da), w.z);
    else lw = vec3(w.xy - u_repRingR * vec2(cos(k * sec), sin(k * sec)), w.z);
    q = repFromAxis(lw);
    cid = vec3(mod(k, u_repRingN), 0.0, 0.0);
    bound = rho * sin(max(0.5 * sec - abs(da), 0.0));
  }
  float sc = 1.0;
  vec3 h = repHash(cid);
  if (u_repVar.x > 0.0) {
    vec3 ax = normalize(repHash(cid + 17.0) * 2.0 - 1.0 + 1e-4);
    float an = (h.x * 2.0 - 1.0) * u_repVar.x, c = cos(an), sn = sin(an);
    q = q * c + cross(ax, q) * sn + ax * dot(ax, q) * (1.0 - c);
  }
  if (u_repVar.y > 0.0) sc = 1.0 + (h.y * 2.0 - 1.0) * u_repVar.y;
  float d = mapLocal(u_objInv * (q / sc - u_objPos) / u_objScale, trap) * u_objScale * sc;
  trap += h.z * u_repVar.z;
  return min(d, bound + u_repPad);
}
#else
float map(vec3 p, out float trap) {
  return mapLocal(u_objInv * (p - u_objPos) / u_objScale, trap) * u_objScale;
}
#endif

// Tetrahedral normal: 4 DE evaluations instead of 6.
vec3 getNormal(vec3 p, float e) {
  float tr;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * map(p + k.xyy * e, tr) +
    k.yyx * map(p + k.yyx * e, tr) +
    k.yxy * map(p + k.yxy * e, tr) +
    k.xxx * map(p + k.xxx * e, tr));
}

float surfaceAO(vec3 p, vec3 n, float scale) {
  float occ = 0.0, w = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = scale * (0.02 + 0.12 * float(i) / 4.0);
    float tr;
    float d = map(p + n * h, tr);
    occ += (h - d) / h * w;
    w *= 0.6;
  }
  return clamp(1.0 - 0.45 * occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd, float maxT, float k, float eps) {
  float res = 1.0;
  float t = eps * 8.0;
  for (int i = 0; i < 80; i++) {
    if (t > maxT) break;
    float tr;
    float h = map(ro + rd * t, tr);
    if (h < eps) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, eps * 2.0, 0.3);
  }
  return clamp(res, 0.0, 1.0);
}


// ═══ Ground plane ══════════════════════════════════════════════════════════
// A horizontal plane at y = u_groundY, optionally displaced into hills, dunes or
// rock. It is a second surface in the ray march (not part of map()), so the
// fractal's DE, colouring, normals and the CPU mirror are untouched; the ground
// receives the fractal's shadows and contact AO through map().
// Types: 0 off, 1 matte, 2 grass, 3 sand, 4 rock, 5 water, 6 mirror, 7 checker.
uniform int   u_groundType;
uniform float u_groundY;
uniform vec3  u_groundCol;
uniform vec3  u_groundCol2;
uniform float u_groundScale;   // feature size of the texture and terrain
uniform float u_groundBump;    // terrain height (water: wave strength)
uniform float u_groundReflect; // water / mirror reflectivity
uniform float u_groundRough;   // mirror / water blur (path tracer)
uniform float u_groundFade;    // distance haze that melts the ground into the sky
uniform bool  u_groundShadows;
uniform mat3  u_groundRot;     // ground-local from world (tilt + texture yaw)
uniform mat3  u_groundRotInv;  // world from ground-local
uniform vec2  u_groundOff;     // slides terrain and texture across the plane
vec3 groundLocal(vec3 p) {
  vec3 q = u_groundRot * (p - vec3(0.0, u_groundY, 0.0));
  q.xz += u_groundOff;
  return q;
}

float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),
             mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float gFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * gNoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s; // ≈ 0 … 0.94, mean ≈ 0.47
}

// Terrain height above u_groundY.
float groundHeight(vec2 xz) {
  if (u_groundBump <= 0.0) return 0.0;
  vec2 q = xz / u_groundScale;
  if (u_groundType == 2) return u_groundBump * (gFbm(q * 0.25) - 0.47) * 1.5;                 // rolling hills
  if (u_groundType == 3) return u_groundBump * ((gFbm(q * 0.2) - 0.47) * 1.2
                                 + 0.06 * sin(dot(q, vec2(0.8, 0.6)) * 6.0 + gFbm(q * 0.5) * 4.0)); // dunes + ripples
  if (u_groundType == 4) { float r = gFbm(q * 0.4); return u_groundBump * (r * r * 2.2 - 0.45); } // rock lumps
  return 0.0; // matte, water (waves are in the normal), mirror, checker: flat
}

// Distance to the ground. Displaced terrain is Lipschitz-scaled so the march
// never overshoots a slope.
float groundDist(vec3 p) {
  if (u_groundType == 0) return 1e9;
  float k = u_groundBump > 0.0 && u_groundType >= 2 && u_groundType <= 4 ? 1.0 / (1.0 + 1.6 * u_groundBump / u_groundScale) : 1.0;
  vec3 q = groundLocal(p);
  return (q.y - groundHeight(q.xz)) * k;
}

vec3 groundNormal(vec3 pw, float t) {
  vec3 p = groundLocal(pw);
  float e = 0.01 * u_groundScale;
  vec3 n = normalize(vec3(groundHeight(p.xz - vec2(e, 0.0)) - groundHeight(p.xz + vec2(e, 0.0)), 2.0 * e,
                          groundHeight(p.xz - vec2(0.0, e)) - groundHeight(p.xz + vec2(0.0, e))));
  vec2 q = p.xz / u_groundScale;
  float far = clamp(t * 0.03 / u_groundScale, 0.0, 1.0); // fade micro-detail out with distance (no shimmer)
  if (u_groundType == 5) {
    // Water: two octaves of wave slopes from noise gradients.
    vec2 w = vec2(gNoise(q * 1.7) - gNoise(q * 1.7 + vec2(0.37, 0.0)), gNoise(q * 1.7) - gNoise(q * 1.7 + vec2(0.0, 0.37)))
           + 0.5 * vec2(gNoise(q * 5.3) - gNoise(q * 5.3 + vec2(0.21, 0.0)), gNoise(q * 5.3) - gNoise(q * 5.3 + vec2(0.0, 0.21)));
    n = normalize(n + vec3(w.x, 0.0, w.y) * u_groundBump * 3.0 * (1.0 - 0.7 * far));
  } else if (u_groundType == 2) {
    // Grass: blade-scale tilt jitter.
    vec2 j = vec2(gNoise(q * 40.0), gNoise(q * 40.0 + 7.3)) - 0.5;
    n = normalize(n + vec3(j.x, 0.0, j.y) * 0.8 * (1.0 - far));
  }
  return normalize(u_groundRotInv * n);
}

vec3 groundAlbedo(vec3 pw, float t) {
  vec2 q = groundLocal(pw).xz / u_groundScale;
  float far = clamp(t * 0.03 / u_groundScale, 0.0, 1.0);
  if (u_groundType == 2) {
    vec3 base = mix(u_groundCol, u_groundCol2, smoothstep(0.3, 0.75, gFbm(q * 0.6)));
    // Blade streaks: anisotropic noise in two directions, averaged away with distance.
    float blades = 0.5 * gNoise(q * vec2(80.0, 8.0)) + 0.5 * gNoise(q.yx * vec2(70.0, 9.0) + 3.1);
    blades = mix(blades, 0.5, far);
    return base * (0.45 + 1.1 * blades);
  }
  if (u_groundType == 3) {
    float rip = 0.5 + 0.5 * sin(dot(q, vec2(0.8, 0.6)) * 18.0 + gFbm(q * 0.8) * 6.0);
    float grain = mix(gNoise(q * 120.0), 0.5, far);
    return mix(u_groundCol, u_groundCol2, 0.35 * rip + 0.3 * gFbm(q * 0.3)) * (0.85 + 0.3 * grain);
  }
  if (u_groundType == 4) {
    float m = gFbm(q * 2.0);
    float crack = smoothstep(0.02, 0.0, abs(gNoise(q * 6.0) - 0.5)) * (1.0 - far);
    return mix(u_groundCol, u_groundCol2, smoothstep(0.35, 0.7, m)) * (1.0 - 0.6 * crack);
  }
  if (u_groundType == 7) {
    vec2 c = floor(q);
    float k = mod(c.x + c.y, 2.0);
    return mix(mix(u_groundCol, u_groundCol2, k), 0.5 * (u_groundCol + u_groundCol2), far);
  }
  return u_groundCol; // matte, water body colour, mirror tint
}

// Ground reflectivity at this view angle: water follows Fresnel, mirror is flat.
float groundReflectance(vec3 n, vec3 rd) {
  if (u_groundType == 5) return u_groundReflect * (0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0));
  if (u_groundType == 6) return u_groundReflect;
  return 0.0;
}

// Fractal-only march used by ground reflections.
bool marchFractal(vec3 ro, vec3 rd, out float t, out float trap) {
  float eps0 = 0.0003 / u_detail;
  t = 0.0; trap = 0.0;
  for (int i = 0; i < 1024; i++) {
    if (i >= u_maxSteps) return false;
    float d = map(ro + rd * t, trap);
#ifdef DEEP_ZOOM
    if (d < min(eps0 * (1.0 + t * 0.1), t * DZ_PIX * 0.5 / u_detail)) return true;
#else
    if (d < eps0 * (1.0 + t * 0.1)) return true;
#endif
    t += marchStep(d);
    if (t > u_maxDist) return false;
  }
  return false;
}

// One gradient period spans the LUT; u_gradScale folds in the gradient's
// natural band width, Repeat and Mirror. Sampled at the texel centre row.
vec3 palette(float idx) {
  return texture2D(u_grad, vec2(fract(idx * u_gradScale), 0.5)).rgb;
}

// ── Environment lookups ──
vec4 envTex(vec2 uv, float lod) {
#ifdef HAS_TEX_LOD
  return texture2DLodEXT(u_env, uv, lod);
#else
  return texture2D(u_env, uv, lod);
#endif
}

// Equirectangular lookup for a world direction.
vec3 envDir(vec3 d, float lod) {
  d = u_envRot * d;
  vec2 uv = vec2(atan(d.x, -d.z) * 0.15915494 + 0.5, acos(clamp(d.y, -1.0, 1.0)) * 0.31830989);
  return envTex(uv, lod).rgb;
}

vec3 envBackground(vec3 rd, vec2 screenUv) {
  if (u_envMode == 1) {
    // Cover-fit the image to the full frame (not the tile).
    float sa = u_resolution.x / u_resolution.y;
    vec2 uv = screenUv - 0.5;
    if (sa > u_envAspect) uv.y *= u_envAspect / sa; else uv.x *= sa / u_envAspect;
    uv += 0.5;
    uv.y = 1.0 - uv.y;
    return envTex(uv, u_envBlur).rgb * u_envIntensity;
  }
  return envDir(rd, u_envBlur) * u_envIntensity;
}


// Sky seen in a direction (for reflections and the horizon haze).
vec3 skyColor(vec3 d) {
  return u_envMode == 2 ? envDir(d, u_envBlur) * u_envIntensity : u_bgColor;
}

// ═══ Extra lights (Light 2, Light 3) ══════════════════════════════════════
// Compiled in only when one of them is on (HAS_XLIGHTS), so the classic
// program is unchanged. Both are handled in one loop: one softShadow call site.
#ifdef HAS_XLIGHTS
uniform vec3 u_l2Pos;
uniform vec3 u_l3Pos;
uniform vec3 u_l2Col;    // colour × intensity
uniform vec3 u_l3Col;
uniform vec2 u_lOn;      // Light 2 / 3 on
uniform vec2 u_lShadow;  // Light 2 / 3 cast shadows

vec3 xLightPos(int i) { return i == 0 ? u_l2Pos : u_l3Pos; }
vec3 xLightCol(int i) { return i == 0 ? u_l2Col : u_l3Col; }

// Diffuse + specular from the extra lights at a surface point.
vec3 extraLights(vec3 p, vec3 n, vec3 rd, float eN, vec3 diffAlb, vec3 specCol, float shin, bool allowShadow) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    if ((i == 0 ? u_lOn.x : u_lOn.y) < 0.5) continue;
    vec3 toL = xLightPos(i) - p;
    float ld = length(toL);
    vec3 L = toL / ld;
    float diff = max(dot(n, L), 0.0);
    if (diff <= 0.0) continue;
    float sh = 1.0;
    if (allowShadow && (i == 0 ? u_lShadow.x : u_lShadow.y) > 0.5) sh = softShadow(p + n * eN * 2.0, L, min(ld, 20.0), u_shadowSoft, eN);
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), shin);
    sum += xLightCol(i) * (diffAlb * diff + specCol * spec) * sh;
  }
  return sum;
}
#endif

// Surface-mode ground shading: textured albedo, light with the fractal's shadow
// and contact AO, environment light, reflections of the fractal and sky for
// water / mirror, then a distance haze into the sky so there is no hard horizon.
vec3 shadeGround(vec3 p, vec3 rd, float t, vec3 bg) {
  vec3 n = groundNormal(p, t);
  vec3 alb = groundAlbedo(p, t);
#ifdef DEEP_ZOOM
  float eN = min(0.0004 * (1.0 + t * 0.1), t * DZ_PIX * 0.7) / u_detail;
#else
  float eN = 0.0004 * (1.0 + t * 0.1) / u_detail;
#endif
  vec3 toL = u_lightPos - p;
  float lightDist = length(toL);
  vec3 L = toL / lightDist;
  float diff = max(dot(n, L), 0.0);
  float sh = 1.0;
  if (u_groundShadows && diff > 0.0) sh = softShadow(p + n * eN * 4.0, L, min(lightDist, 30.0), u_shadowSoft, eN);
#ifdef DEEP_ZOOM
  float ao = u_aoStrength > 0.0 ? mix(1.0, surfaceAO(p, n, min(1.0 + t * 0.05, t * 0.3)), u_aoStrength) : 1.0;
#else
  float ao = u_aoStrength > 0.0 ? mix(1.0, surfaceAO(p, n, 1.0 + t * 0.05), u_aoStrength) : 1.0;
#endif
  vec3 col = alb * (diff * sh + u_ambient) * ao;
  if (u_envMode > 0) col += alb * envDir(n, 6.0) * u_envLight * ao;
#ifdef HAS_XLIGHTS
  col += extraLights(p, n, rd, eN, alb * ao, vec3(groundReflectance(n, rd)), 120.0, u_groundShadows);
#endif

  float refl = groundReflectance(n, rd);
  if (refl > 0.0) {
    vec3 R = reflect(rd, n);
    vec3 gUp = u_groundRotInv * vec3(0.0, 1.0, 0.0);
    float below = dot(R, gUp);
    if (below < 0.02) R += gUp * (0.02 - below); // waves can tilt the reflection under the plane
    R = normalize(R);
    vec3 rc = skyColor(R);
    float tr, trap;
    if (marchFractal(p + n * eN * 6.0, R, tr, trap)) {
      vec3 q = p + n * eN * 6.0 + R * tr;
#ifdef DEEP_ZOOM
      vec3 fn = getNormal(q, min(0.0004 * (1.0 + tr * 0.1), tr * DZ_PIX * 0.7) / u_detail);
#else
      vec3 fn = getNormal(q, 0.0004 * (1.0 + tr * 0.1) / u_detail);
#endif
      vec3 fl = normalize(u_lightPos - q);
      rc = palette(trap * 0.4 + u_colorShift * 10.0) * (max(dot(fn, fl), 0.0) + u_ambient)
         + pow(max(dot(reflect(R, fn), fl), 0.0), 32.0) * 0.4 * u_lightColor;
    }
    col = mix(col, rc * mix(vec3(1.0), alb, u_groundType == 6 ? 0.5 : 0.0), refl);
    col += pow(max(dot(reflect(rd, n), L), 0.0), 120.0) * sh * u_lightColor * refl * 2.0; // sun glint
  }
  return mix(col, bg, 1.0 - exp(-u_groundFade * t * 0.05));
}

vec3 heat(float x) {
  x = clamp(x, 0.0, 1.0);
  return clamp(vec3(1.5 * x, 1.5 * x - 0.5, 0.5 - 1.5 * x + 3.0 * x * x * x), 0.0, 1.0) + vec3(0.0, 0.0, 0.25 * (1.0 - x));
}

// Hash without sine (stable across GPUs).
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Primary camera ray (AA jitter + thin-lens DOF), shared by every render mode.
// ═══ Materials & textures ══════════════════════════════════════════════════
// Compiled only into programs with HAS_MAT (materials on, a texture, or crease
// tint): scenes without them use exactly the classic shader. Each mode calls
// evalSurface() from one place, and every extra fractal evaluation sits in a
// single loop, because D3D-backed WebGL (Windows) inlines every call to map()
// and a long shader can fail to compile there.
#ifdef HAS_MAT
uniform sampler2D u_matTex;   // unit 3: loaded image or procedural texture (POT, mipmapped, REPEAT)
uniform float u_texSize;      // texture width in texels (for the triplanar LOD)
uniform float u_texAspect;    // width / height of the source image
uniform int   u_texMode;      // 0 off, 1 colour, 2 bump, 3 colour + bump
uniform int   u_texMap;       // 0 triplanar on the surface (object frame), 1 fractalized orbit
uniform float u_texScale;     // tiles per unit
uniform vec2  u_texOff;
uniform float u_texMix;
uniform int   u_texBlend;     // 0 multiply, 1 overlay, 2 replace, 3 screen
uniform float u_texBump;
uniform float u_texSharp;
uniform float u_texBlur;
uniform int   u_texSlot;      // 0 all, 1..3 = slot A..C
uniform bool  u_matOn;
uniform int   u_matAssign;    // 0 single, 1 folds, 2 orbit, 3 colour index, 4 crease, 5 height, 6 facing up
uniform float u_matScale;
uniform float u_matOffset;
uniform vec2  u_matSplit;     // A|B and B|C thresholds on the key
uniform float u_matSoft;
uniform bool  u_matRepeat;
uniform vec4  u_matA;         // type, roughness, amount, tint mix
uniform vec4  u_matB;
uniform vec4  u_matC;
uniform vec3  u_matTintA;
uniform vec3  u_matTintB;
uniform vec3  u_matTintC;
uniform float u_matIor;
uniform float u_crease;
uniform vec3  u_creaseCol;
uniform float u_creaseRad;

// Material types: 0 standard (amount = shine), 1 metal (amount = metalness),
// 2 glass (amount = transparency), 3 iridescent (amount = film thickness),
// 4 glow (amount = intensity).
struct Mat {
  vec3 albedo;
  float rough, metal, gloss, glass, iridW, iridT, glow;
  vec3 glowCol, glassTint;
};

vec3 matTexLod(vec2 uv, float lod) {
#ifdef HAS_TEX_LOD
  return texture2DLodEXT(u_matTex, uv, lod).rgb;
#else
  return texture2D(u_matTex, uv).rgb;
#endif
}
float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Texture colour at p. Surface mapping: seamless triplanar in the fractal's
// own frame (moves with Object Transform). Fractalized: Mandelbulber's orbit
// point (recorded by mapLocal while g_texProbe is set), planar
// uv = (−x, y)·scale − offset.
vec3 texSample(vec3 p, vec3 n, float t) {
  if (u_texMap == 1) {
    g_texProbe = true;
    float tr;
    map(p, tr);
    g_texProbe = false;
    return matTexLod(vec2(-g_texZ.x, g_texZ.y) * u_texScale - u_texOff, u_texBlur);
  }
  // Mip level from the pixel footprint: ~t/(lens·minRes) world units per pixel.
  float fp = t / (u_lens * min(u_resolution.x, u_resolution.y));
  float lod = log2(max(fp * u_texSize * u_texScale / u_objScale, 1.0)) + u_texBlur;
  vec3 q = u_objInv * (p - u_objPos) / u_objScale * u_texScale;
  vec3 w = pow(abs(u_objInv * n), vec3(u_texSharp));
  w /= max(w.x + w.y + w.z, 1e-5);
  vec2 asp = vec2(1.0, u_texAspect); // one tile = one image width; keep the image's shape
  return matTexLod((q.zy - u_texOff) * asp, lod) * w.x + matTexLod((q.xz - u_texOff) * asp, lod) * w.y + matTexLod((q.xy - u_texOff) * asp, lod) * w.z;
}

// Crease depth 0..1: how much less room there is a little way out from the
// surface than the local DE slope predicts. Using the slope as the reference
// cancels the DE's under-estimate (often ~½), which plain AO reads as
// occlusion. One map() call site (loop).
float creaseDepth(vec3 p, vec3 n, float r) {
  float s1 = 1.0, s2 = 0.0;
  for (int k = 0; k < 3; k++) {
    float h = r * (k == 0 ? 0.15 : (k == 1 ? 0.5 : 1.0));
    float tr;
    float sl = map(p + n * h, tr) / h;
    if (k == 0) s1 = max(sl, 1e-7); else s2 += 0.5 * sl;
  }
  return clamp(1.0 - s2 / s1, 0.0, 1.0);
}

// Thin-film interference (soap bubble / oil slick): reflectance per RGB
// wavelength (650/530/440 nm) for a film of index 1.33 and thickness d µm.
vec3 thinFilm(float cosI, float d) {
  float cosT = sqrt(max(1.0 - (1.0 - cosI * cosI) / 1.769, 0.0));
  vec3 ph = 12.566371 * 1.33 * d * cosT / vec3(0.65, 0.53, 0.44);
  return 0.5 + 0.5 * cos(ph);
}

// Walk through the solid along dir until the DE says we are outside again.
// The DE is unsigned, so "inside" reads as ≈0: step until it grows.
vec3 exitSolid(vec3 p, vec3 dir, float eps, out bool ok) {
  float t = eps * 6.0;
  ok = false;
  for (int i = 0; i < 64; i++) {
    float tr;
    float d = map(p + dir * t, tr);
    if (d > eps * 3.0) { ok = true; break; }
    t += max(d, eps * 4.0) + 0.001 * float(i);
  }
  return p + dir * t;
}

vec3 bgDir(vec3 d) { return u_envMode > 0 ? envDir(d, u_envBlur) * u_envIntensity : u_bgColor; }

// Everything about the surface at a fractal hit: crease tint, texture colour
// and bump (n is bumped in place), slot weights and the blended material.
// Without materials it is slot A = Standard with the textured colour.
Mat evalSurface(vec3 p, inout vec3 n, float t, float eN, float trap, vec3 base) {
  float tr0;
  map(p, tr0); // leaves the fold counts / orbit trap of p in the globals
  float cav = (u_crease > 0.0 || (u_matOn && u_matAssign == 4)) ? creaseDepth(p, n, u_creaseRad * (0.05 + t * 0.02)) : 0.0;
  vec3 w = vec3(1.0, 0.0, 0.0);
  if (u_matOn && u_matAssign > 0) {
    float key = n.y * 0.5 + 0.5;
    if (u_matAssign == 1) key = g_boxCol + g_sphCol;
    else if (u_matAssign == 2) key = sqrt(g_orbit);
    else if (u_matAssign == 3) key = fract((trap * 0.4 + u_colorShift * 10.0) * u_gradScale);
    else if (u_matAssign == 4) key = cav;
    else if (u_matAssign == 5) key = p.y;
    float s = key * u_matScale + u_matOffset;
    if (u_matRepeat) s = fract(s);
    float sB = smoothstep(u_matSplit.x - u_matSoft, u_matSplit.x + u_matSoft + 1e-4, s);
    float sC = smoothstep(u_matSplit.y - u_matSoft, u_matSplit.y + u_matSoft + 1e-4, s);
    w = vec3(1.0 - sB, max(sB - sC, 0.0), sC);
    w /= max(w.x + w.y + w.z, 1e-4);
  }
  if (u_crease > 0.0) base = mix(base, u_creaseCol, clamp(smoothstep(0.05, 0.5, cav) * u_crease * 1.5, 0.0, 1.0));

  float tw = u_texSlot == 0 ? 1.0 : (u_texSlot == 1 ? w.x : (u_texSlot == 2 ? w.y : w.z));
  if (u_texMode > 0 && tw > 0.001) {
    // Bump: brightness difference across ~1.5 pixels along a tangent frame.
    float fp = t / (u_lens * min(u_resolution.x, u_resolution.y));
    float e = max(fp * 1.5, eN);
    vec3 ta = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 tb = cross(n, ta);
    int ns = u_texMode >= 2 ? 3 : 1;
    vec3 tc = vec3(1.0);
    float ha = 0.0, hb = 0.0;
    for (int k = 0; k < 3; k++) {
      if (k >= ns) break;
      vec3 c = texSample(p + (k == 1 ? ta * e : (k == 2 ? tb * e : vec3(0.0))), n, t);
      if (k == 0) tc = c; else if (k == 1) ha = lumOf(c); else hb = lumOf(c);
    }
    if (u_texMode != 2) {
      vec3 bl = base * tc;
      if (u_texBlend == 1) bl = mix(2.0 * base * tc, 1.0 - 2.0 * (1.0 - base) * (1.0 - tc), step(0.5, base));
      else if (u_texBlend == 2) bl = tc;
      else if (u_texBlend == 3) bl = 1.0 - (1.0 - base) * (1.0 - tc);
      base = mix(base, bl, u_texMix * tw);
    }
    if (u_texMode >= 2) {
      float h0 = lumOf(tc);
      n = normalize(n - (ta * (ha - h0) + tb * (hb - h0)) * u_texBump * 3.0 * tw);
    }
  }

  Mat m;
  if (!u_matOn) {
    m.albedo = base; m.rough = 0.5; m.metal = 0.0; m.gloss = 0.0; m.glass = 0.0;
    m.iridW = 0.0; m.iridT = 0.5; m.glow = 0.0; m.glowCol = base; m.glassTint = vec3(1.0);
    return m;
  }
  vec3 ty = vec3(u_matA.x, u_matB.x, u_matC.x);
  vec3 amt = vec3(u_matA.z, u_matB.z, u_matC.z);
  vec3 cA = mix(base, u_matTintA, u_matA.w);
  vec3 cB = mix(base, u_matTintB, u_matB.w);
  vec3 cC = mix(base, u_matTintC, u_matC.w);
  vec3 isS = vec3(equal(ty, vec3(0.0)));
  vec3 isM = vec3(equal(ty, vec3(1.0)));
  vec3 isG = vec3(equal(ty, vec3(2.0)));
  vec3 isI = vec3(equal(ty, vec3(3.0)));
  vec3 isE = vec3(equal(ty, vec3(4.0)));
  m.albedo = cA * w.x + cB * w.y + cC * w.z;
  m.rough = dot(w, vec3(u_matA.y, u_matB.y, u_matC.y));
  m.gloss = dot(w * isS, amt);
  m.metal = clamp(dot(w * isM, amt), 0.0, 1.0);
  m.glass = clamp(dot(w * isG, amt), 0.0, 1.0);
  m.iridW = dot(w, isI);
  m.iridT = 0.2 + 1.2 * dot(w * isI, amt) / max(m.iridW, 1e-4);
  m.glow = dot(w * isE, amt);
  vec3 wE = w * isE, wG = w * isG;
  m.glowCol = (cA * wE.x + cB * wE.y + cC * wE.z) / max(wE.x + wE.y + wE.z, 1e-4);
  m.glassTint = wG.x + wG.y + wG.z > 1e-4 ? (cA * wG.x + cB * wG.y + cC * wG.z) / (wG.x + wG.y + wG.z) : vec3(1.0);
  return m;
}

// Surface-mode shading of a material hit. Glass here shows what's straight
// through the solid along the refracted ray (sky / environment); Path Traced
// mode follows the refracted ray into the scene.
vec3 shadeMat(Mat m, vec3 p, vec3 n, vec3 rd, vec3 L, float diff, float sh, float ao, float eN) {
  float ndv = max(dot(n, -rd), 0.0);
  float shin = 2.0 / max(m.rough * m.rough, 0.002);
  vec3 F0 = mix(vec3(0.04), m.albedo, m.metal);
  F0 = mix(F0, thinFilm(ndv, m.iridT), m.iridW);
  vec3 fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  vec3 diffC = m.albedo * (1.0 - m.metal) * (1.0 - m.glass) * (1.0 - 0.75 * m.iridW);
  vec3 col = diffC * (diff * sh + u_ambient) * ao;
  float spec = pow(max(dot(reflect(rd, n), L), 0.0), shin) * (shin + 2.0) * 0.125;
  col += (fres + m.gloss * 0.5 * (1.0 - m.metal)) * spec * sh * u_lightColor;
  vec3 R = reflect(rd, n);
  // Without an environment image, reflect a soft studio gradient (background
  // below, light colour above) so metal, glass and film still have something to show.
  vec3 env = u_envMode > 0 ? envDir(R, m.rough * 7.0) * u_envIntensity
                           : mix(u_bgColor + 0.08, u_lightColor * 0.8, smoothstep(-0.4, 0.8, R.y));
  float reflW = clamp(m.metal + m.glass + m.iridW + m.gloss * 0.6 + (u_envMode > 0 ? u_envReflect : 0.0), 0.0, 1.0);
  col += env * fres * reflW * ao;
  // Rough-metal fill: the light's broad reflection, tinted by the metal.
  col += m.metal * F0 * (diff * sh * (1.0 - 0.5 * m.rough) * 0.7 + u_ambient * 0.5) * ao;
  if (u_envMode > 0) col += diffC * envDir(n, 6.0) * u_envLight * ao;
  col += m.glowCol * m.glow * (0.35 + 0.65 * pow(1.0 - ndv, 2.0));
  if (m.glass > 0.001) {
    vec3 dir = refract(rd, n, 1.0 / u_matIor);
    if (dot(dir, dir) < 1e-6) dir = reflect(rd, n);
    vec2 h = hash22(gl_FragCoord.xy + u_sampleIndex * 1.618);
    vec2 h2 = hash22(gl_FragCoord.yx + u_sampleIndex * 2.718);
    dir = normalize(dir + (vec3(h, h2.x) * 2.0 - 1.0) * m.rough * 0.4);
    bool ok;
    exitSolid(p - n * eN * 2.0, dir, eN, ok);
    vec3 behind = bgDir(dir) * (ok ? 1.0 : 0.6); // too thick to cross: dimmed
    col = mix(col, behind * m.glassTint, m.glass * (1.0 - dot(fres, vec3(0.3333))));
  }
  return col;
}
#endif

void primaryRay(out vec3 ro, out vec3 rd, out vec2 pix, out vec2 screenUv) {
  pix = gl_FragCoord.xy + u_pixelOffset;
  vec2 fragCoord = pix + u_jitter;
  screenUv = fragCoord / u_resolution;
  vec2 uv = (fragCoord - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  ro = u_camPos;
  rd = normalize(u_camForward * u_lens + uv.x * u_camRight + uv.y * u_camUp);
  if (u_dof > 0.0) {
    vec3 focusPoint = ro + rd * u_focalDist;
    vec2 h = fract(u_lensSample + hash22(pix));
    float r = sqrt(h.x);
    float ang = h.y * 6.2831853;
    ro += (u_camRight * cos(ang) + u_camUp * sin(ang)) * r * u_dof * 0.2;
    rd = normalize(focusPoint - ro);
  }
}

vec3 accumulate(vec3 col) {
  vec3 prev = u_blend < 1.0 ? texture2D(u_prev, gl_FragCoord.xy / u_bufferSize).rgb : vec3(0.0);
  return mix(prev, col, u_blend);
}

float vignetteAt(vec2 screenUv) { return 1.0 - smoothstep(0.4, 0.8, length(screenUv - 0.5)) * u_vignette; }

#if RENDER_MODE == 0
void main() {
  vec2 pix = gl_FragCoord.xy + u_pixelOffset;
  vec2 fragCoord = pix + u_jitter;
  vec2 screenUv = fragCoord / u_resolution;
  vec2 uv = (fragCoord - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  vec3 ro = u_camPos;
  vec3 rd = normalize(u_camForward * u_lens + uv.x * u_camRight + uv.y * u_camUp);

  if (u_dof > 0.0) {
    vec3 focusPoint = ro + rd * u_focalDist;
    // Cranley-Patterson rotated low-discrepancy lens sample (v1 used one random
    // number for both radius and angle, which put every sample on a spiral).
    vec2 h = fract(u_lensSample + hash22(pix));
    float r = sqrt(h.x);
    float ang = h.y * 6.2831853;
    ro += (u_camRight * cos(ang) + u_camUp * sin(ang)) * r * u_dof * 0.2;
    rd = normalize(focusPoint - ro);
  }

  float eps0 = 0.0003 / u_detail;
  float t = 0.0, trap = 0.0, steps = 0.0, vol = 0.0;
#ifdef HAS_XLIGHTS
  vec3 xvol = vec3(0.0);
#endif
  bool hit = false, exhausted = true, onGround = false;

  for (int i = 0; i < 1024; i++) {
    if (i >= u_maxSteps) break;
    vec3 p = ro + rd * t;
    float d = map(p, trap);
    float dg = groundDist(p);
    onGround = dg < d;
    d = min(d, dg);
    if (u_volumetric > 0.0) {
      vec3 dl = u_lightPos - p;
      float scatter = 1.0 / (1.0 + dot(dl, dl) * 2.0);
      vol += scatter * min(d, 0.08) * u_volumetric;
    }
#ifdef HAS_XLIGHTS
    if (u_volumetric > 0.0) {
      vec3 d2 = u_l2Pos - p, d3 = u_l3Pos - p;
      xvol += (u_lOn.x * u_l2Col / (1.0 + dot(d2, d2) * 2.0) + u_lOn.y * u_l3Col / (1.0 + dot(d3, d3) * 2.0)) * min(d, 0.08) * u_volumetric;
    }
#endif
#ifdef DEEP_ZOOM
    if (d < min(eps0 * (1.0 + t * 0.1), t * DZ_PIX * 0.5 / u_detail)) { hit = true; exhausted = false; break; }
#else
    if (d < eps0 * (1.0 + t * 0.1)) { hit = true; exhausted = false; break; }
#endif
    t += marchStep(d);
    steps = float(i);
    if (t > u_maxDist) { exhausted = false; break; }
  }
  // A ray that used every step without converging stalled in a region where
  // the DE plateaus above the hit threshold: optionally shade it as surface.
  bool stranded = !hit && exhausted;
  if (stranded && u_missAsHit) hit = true;
  if (!hit) onGround = false;

  if (u_debugView == 1) {
    vec3 hc = heat(steps / float(u_maxSteps));
    vec3 prevD = u_blend < 1.0 ? texture2D(u_prev, gl_FragCoord.xy / u_bufferSize).rgb : vec3(0.0);
    gl_FragColor = vec4(mix(prevD, pow(hc, vec3(1.25)), u_blend), 1.0);
    return;
  }

  vec3 bg = u_envMode > 0 ? envBackground(rd, screenUv) : u_bgColor;
  vec3 col = bg;
  if (hit && onGround) {
    col = shadeGround(ro + rd * t, rd, t, bg);
    vec3 fogColG = (u_envMode > 0 && u_envFog) ? bg : u_bgColor;
    col = mix(col, fogColG, 1.0 - exp(-u_fog * t * 0.1));
  } else if (hit) {
    vec3 p = ro + rd * t;
#ifdef DEEP_ZOOM
    float eN = min(0.0004 * (1.0 + t * 0.1), t * DZ_PIX * 0.7) / u_detail;
#else
    float eN = 0.0004 * (1.0 + t * 0.1) / u_detail;
#endif
    vec3 n = getNormal(p, eN);
#ifdef HAS_MAT
    Mat mt = evalSurface(p, n, t, eN, trap, palette(trap * 0.4 + u_colorShift * 10.0)); // bumps n
#endif
    vec3 toL = u_lightPos - p;
    float lightDist = length(toL);
    vec3 lightDir = toL / lightDist;
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(rd, n), lightDir), 0.0), 32.0);

    float ao = mix(1.0, 1.0 - steps / float(u_maxSteps), u_stepAO);
#ifdef DEEP_ZOOM
    if (u_aoStrength > 0.0) ao *= mix(1.0, surfaceAO(p, n, min(1.0 + t * 0.05, t * 0.3)), u_aoStrength);
#else
    if (u_aoStrength > 0.0) ao *= mix(1.0, surfaceAO(p, n, 1.0 + t * 0.05), u_aoStrength);
#endif
    ao = max(ao, 0.0);

    float sh = 1.0;
    if (u_shadows && diff > 0.0) sh = softShadow(p + n * eN * 2.0, lightDir, min(lightDist, 20.0), u_shadowSoft, eN);

    vec3 baseCol = palette(trap * 0.4 + u_colorShift * 10.0);
#ifdef HAS_MAT
    baseCol = mt.albedo;
#endif
    col = baseCol * (diff * sh + u_ambient) * ao + spec * sh * 0.4 * u_lightColor;
    if (u_envMode > 0) {
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
      col += baseCol * envDir(n, 6.0) * u_envLight * ao;
      col += envDir(reflect(rd, n), 1.5) * u_envReflect * fres * ao;
    }
#ifdef HAS_MAT
    if (u_matOn) col = shadeMat(mt, p, n, rd, lightDir, diff, sh, ao, eN);
#endif
#ifdef HAS_XLIGHTS
    {
      vec3 dA = baseCol;
      vec3 sC = vec3(0.4);
      float shn = 32.0;
  #ifdef HAS_MAT
      if (u_matOn) {
        dA = mt.albedo * (1.0 - mt.metal) * (1.0 - mt.glass) * (1.0 - 0.75 * mt.iridW);
        sC = mix(vec3(0.04), mt.albedo, mt.metal) + mt.gloss * 0.5;
        shn = min(2.0 / max(mt.rough * mt.rough, 0.002), 512.0);
      }
  #endif
      col += extraLights(p, n, rd, eN, dA * ao, sC, shn, u_shadows);
    }
#endif
    vec3 fogCol = (u_envMode > 0 && u_envFog) ? bg : u_bgColor;
    col = mix(col, fogCol, 1.0 - exp(-u_fog * t * 0.1));
  }
  if (u_debugView == 2) {
    // Miss reason: green = hit, red = ran out of steps, blue = passed Max Distance.
    float shade = hit ? 0.35 + 0.65 * clamp(dot(col, vec3(0.333)), 0.0, 1.0) : 1.0;
    vec3 dc = stranded ? vec3(0.9, 0.1, 0.1) : hit ? vec3(0.2, 0.85, 0.3) * shade : vec3(0.1, 0.2, 0.7);
    vec3 prevD = u_blend < 1.0 ? texture2D(u_prev, gl_FragCoord.xy / u_bufferSize).rgb : vec3(0.0);
    gl_FragColor = vec4(mix(prevD, pow(dc, vec3(1.25)), u_blend), 1.0);
    return;
  }
  col += u_lightColor * vol;
#ifdef HAS_XLIGHTS
  col += xvol;
#endif
  col *= u_brightness;
  col *= 1.0 - smoothstep(0.4, 0.8, length(screenUv - 0.5)) * u_vignette;
  col = max(col, vec3(0.0));

  vec3 prev = u_blend < 1.0 ? texture2D(u_prev, gl_FragCoord.xy / u_bufferSize).rgb : vec3(0.0);
  gl_FragColor = vec4(mix(prev, col, u_blend), 1.0);
}
#endif

#if RENDER_MODE == 1
// ═══ Path tracer ═══════════════════════════════════════════════════════════
// Unidirectional path tracing with next-event estimation toward the (sphere)
// light, cosine-weighted diffuse + rough-mirror specular lobes chosen by
// Fresnel, Russian roulette after the 2nd bounce, and the environment image
// (or a sky colour) as the light source for escaped rays. Radiance is linear;
// the display pass applies the filmic tone curve.

vec2 g_pix;
float g_cnt;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float rnd() {
  g_cnt += 1.0;
  return hash13(vec3(g_pix * 1.37 + g_cnt * 7.123, u_sampleIndex * 3.917 + g_cnt * 1.618));
}
vec3 randomSphere() {
  float z = 2.0 * rnd() - 1.0, a = 6.2831853 * rnd();
  float r = sqrt(max(0.0, 1.0 - z * z));
  return vec3(r * cos(a), r * sin(a), z) * pow(rnd(), 0.3333);
}
vec3 cosineDir(vec3 n) {
  float a = 6.2831853 * rnd(), u = 2.0 * rnd() - 1.0;
  return normalize(n + vec3(sqrt(max(0.0, 1.0 - u * u)) * vec2(cos(a), sin(a)), u));
}
vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }

bool g_onGround;
bool traceHit(vec3 ro, vec3 rd, out float t, out float trap) {
  float eps0 = 0.0003 / u_detail;
  t = 0.0; trap = 0.0; g_onGround = false;
  for (int i = 0; i < 1024; i++) {
    if (i >= u_maxSteps) return u_missAsHit;
    vec3 p = ro + rd * t;
    float d = map(p, trap);
    float dg = groundDist(p);
    g_onGround = dg < d;
    d = min(d, dg);
#ifdef DEEP_ZOOM
    if (d < min(eps0 * (1.0 + t * 0.1), t * DZ_PIX * 0.5 / u_detail)) return true;
#else
    if (d < eps0 * (1.0 + t * 0.1)) return true;
#endif
    t += marchStep(d);
    if (t > u_maxDist) return false;
  }
  return u_missAsHit;
}

float shadowVis(vec3 ro, vec3 rd, float maxT, float eps) {
  float t = eps * 8.0;
  for (int i = 0; i < 1024; i++) {
    if (i >= u_maxSteps || t > maxT) break;
    float tr;
    float h = map(ro + rd * t, tr);
    if (h < eps) return 0.0;
    t += marchStep(h);
  }
  return 1.0;
}

vec3 skyLight(vec3 d) {
  if (u_envMode > 0) return toLin(envDir(d, 2.0)) * u_ptSky;
  return toLin(u_ptSkyColor) * mix(0.12, 1.0, d.y * 0.5 + 0.5) * u_ptSky;
}

void main() {
  vec3 ro, rd; vec2 pix, screenUv;
  primaryRay(ro, rd, pix, screenUv);
  g_pix = pix; g_cnt = 0.0;

  vec3 bgPrimary = toLin(u_envMode > 0 ? envBackground(rd, screenUv) : u_bgColor);
  vec3 acc = vec3(0.0), thr = vec3(1.0);
  float tPrimary = -1.0;
  bool primaryGround = false;
  vec3 lightCol = toLin(u_lightColor) * u_ptSun;

  for (int b = 0; b < 7; b++) {
    if (b > u_ptBounces) break;
    float t, trap;
    if (!traceHit(ro, rd, t, trap)) {
      acc += thr * (b == 0 ? bgPrimary : skyLight(rd));
      break;
    }
    if (b == 0) { tPrimary = t; primaryGround = g_onGround; }
    vec3 p = ro + rd * t;
#ifdef DEEP_ZOOM
    float eN = min(0.0004 * (1.0 + t * 0.1), t * DZ_PIX * 0.7) / u_detail;
#else
    float eN = 0.0004 * (1.0 + t * 0.1) / u_detail;
#endif
    // Material: the fractal uses the Path Tracing sliders; the ground its own.
    vec3 n, albedo;
    float metal = u_ptMetal, rough = u_ptRough;
#ifdef HAS_MAT
    Mat mt;
    bool matHit = false;
#endif
    if (g_onGround) {
      n = groundNormal(p, t);
      albedo = toLin(groundAlbedo(p, t));
      if (u_groundType == 6) { metal = u_groundReflect; rough = u_groundRough; }
      else if (u_groundType == 5) { metal = 0.0; rough = u_groundRough; albedo *= 1.0 - u_groundReflect * 0.7; }
      else { metal = 0.0; rough = 1.0; }
    } else {
      n = getNormal(p, eN);
      albedo = toLin(palette(trap * 0.4 + u_colorShift * 10.0));
#ifdef HAS_MAT
      mt = evalSurface(p, n, t, eN, trap, palette(trap * 0.4 + u_colorShift * 10.0));
      albedo = toLin(mt.albedo);
      if (u_matOn) { matHit = true; metal = mt.metal; rough = mt.rough; }
#endif
      acc += thr * albedo * u_ptEmit * exp(-trap * 4.0);
#ifdef HAS_MAT
      if (matHit) acc += thr * toLin(mt.glowCol) * mt.glow * 1.5 * (0.35 + 0.65 * pow(1.0 - max(dot(n, -rd), 0.0), 2.0));
#endif
    }
    if (dot(n, rd) > 0.0) n = -n;

    vec3 F0 = mix(vec3(u_groundType == 5 && g_onGround ? 0.02 : 0.04), albedo, metal);
#ifdef HAS_MAT
    if (matHit) F0 = mix(F0, thinFilm(max(dot(n, -rd), 0.0), mt.iridT), mt.iridW);
#endif
    vec3 fres = F0 + (1.0 - F0) * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
#ifdef HAS_MAT
    if (matHit) {
      fres += (1.0 - fres) * mt.gloss * 0.15;
      albedo *= 1.0 - 0.75 * mt.iridW;
      // Glass: transmission lobe (refract, cross the solid, carry on).
      float qG = mt.glass * (1.0 - dot(fres, vec3(0.3333)));
      if (qG > 0.0 && rnd() < qG) {
        vec3 dir = refract(rd, n, 1.0 / u_matIor);
        if (dot(dir, dir) < 1e-6) dir = reflect(rd, n);
        dir = normalize(dir + randomSphere() * rough * 0.5);
        bool ok;
        vec3 ex = exitSolid(p - n * eN * 2.0, dir, eN, ok);
        if (!ok) break;
        thr *= toLin(mt.glassTint);
        ro = ex;
        rd = dir;
        continue;
      }
      if (qG > 0.0) { thr /= 1.0 - qG; albedo *= 1.0 - mt.glass; }
    }
#endif

    // Next-event estimation: one shadow ray to a random point on the light sphere.
    vec3 lp = u_lightPos + randomSphere() * u_ptLightSize;
    vec3 toL = lp - p;
    float ld = length(toL);
    vec3 l = toL / ld;
    float ndl = dot(n, l);
    if (ndl > 0.0) {
      float vis = shadowVis(p + n * eN * 2.0, l, ld, eN);
      if (vis > 0.0) {
        float shin = 2.0 / max(rough * rough, 0.002);
        vec3 diffW = albedo * (1.0 - metal) * (1.0 - fres);
        vec3 specW = fres * pow(max(dot(reflect(rd, n), l), 0.0), shin) * (shin + 2.0) * 0.125;
        acc += thr * (diffW + specW) * ndl * lightCol;
      }
    }

#ifdef HAS_XLIGHTS
    // Next-event estimation for Light 2 / 3 (same light size as the main light).
    for (int li = 0; li < 2; li++) {
      if ((li == 0 ? u_lOn.x : u_lOn.y) < 0.5) continue;
      vec3 xp = xLightPos(li) + randomSphere() * u_ptLightSize;
      vec3 xt = xp - p;
      float xd = length(xt);
      vec3 xl = xt / xd;
      float xndl = dot(n, xl);
      if (xndl <= 0.0) continue;
      float xv = (li == 0 ? u_lShadow.x : u_lShadow.y) > 0.5 ? shadowVis(p + n * eN * 2.0, xl, xd, eN) : 1.0;
      if (xv <= 0.0) continue;
      float xs = 2.0 / max(rough * rough, 0.002);
      vec3 xdW = albedo * (1.0 - metal) * (1.0 - fres);
      vec3 xsW = fres * pow(max(dot(reflect(rd, n), xl), 0.0), xs) * (xs + 2.0) * 0.125;
      acc += thr * (xdW + xsW) * xndl * toLin(xLightCol(li)) * u_ptSun * xv;
    }
#endif
    // Choose the next bounce lobe.
    float pSpec = clamp(dot(fres, vec3(0.3333)) * (1.0 - 0.5 * rough) + 0.5 * metal, 0.05, 0.95);
    vec3 nd;
    if (rnd() < pSpec) {
      nd = normalize(reflect(rd, n) + randomSphere() * rough);
      if (dot(nd, n) <= 0.0) break;
      thr *= fres / pSpec;
    } else {
      nd = cosineDir(n);
      thr *= albedo * (1.0 - metal) * (1.0 - fres) / (1.0 - pSpec);
    }
    if (b >= 2) {
      float q = clamp(max(thr.x, max(thr.y, thr.z)), 0.05, 1.0);
      if (rnd() > q) break;
      thr /= q;
    }
    ro = p + n * eN * 3.0;
    rd = nd;
  }

  vec3 col = acc;
  if (tPrimary > 0.0) {
    if (primaryGround) col = mix(col, bgPrimary, 1.0 - exp(-u_groundFade * tPrimary * 0.05)); // horizon haze
    vec3 fogCol = (u_envMode > 0 && u_envFog) ? bgPrimary : toLin(u_bgColor);
    col = mix(col, fogCol, 1.0 - exp(-u_fog * tPrimary * 0.1));
  }
  col *= u_brightness * vignetteAt(screenUv);
  float m = max(col.r, max(col.g, col.b));
  if (m > u_ptClamp) col *= u_ptClamp / m; // firefly clamp
  gl_FragColor = vec4(accumulate(col), 1.0);
}
#endif

#if RENDER_MODE == 2
// ═══ Volumetric glow ═══════════════════════════════════════════════════════
// Treats the distance estimate as a density field, density = D·exp(−DE/thickness),
// and integrates emission–absorption along the ray. Empty space is skipped by
// stepping proportionally to the DE, so solid shapes become glowing shells and
// "dust" settings (DE plateaus above the hit threshold) become luminous fog.

void main() {
  vec3 ro, rd; vec2 pix, screenUv;
  primaryRay(ro, rd, pix, screenUv);
  vec3 bg = u_envMode > 0 ? envBackground(rd, screenUv) : u_bgColor;

  // Ground: find it first (its own cheap march), then integrate the glow only
  // up to it and show the lit ground behind the glow.
  float tG = 1e9;
  if (u_groundType > 0) {
    float tg = 0.0;
    for (int i = 0; i < 160; i++) {
      float dg = groundDist(ro + rd * tg);
      if (dg < 0.001 * (1.0 + tg * 0.1)) { tG = tg; break; }
      tg += dg;
      if (tg > u_maxDist) break;
    }
    if (tG < 1e8) {
      vec3 gp = ro + rd * tG;
      vec3 gn = groundNormal(gp, tG);
      float gd = max(dot(gn, normalize(u_lightPos - gp)), 0.0);
      bg = mix(groundAlbedo(gp, tG) * (gd + u_ambient), bg, 1.0 - exp(-u_groundFade * tG * 0.05));
    }
  }
  float T = 1.0, t = u_volStepMin * fract(hash22(pix + u_sampleIndex * 0.6180339).x + u_sampleIndex * 0.7548777);
  vec3 L = vec3(0.0);
  for (int i = 0; i < 1024; i++) {
    if (i >= u_volSteps || t > min(u_maxDist, tG) || T < 0.005) break;
    vec3 p = ro + rd * t;
    float trap;
    float d = map(p, trap);
    float dens = u_volDensity * exp(-max(d, 0.0) / u_volThick);
    float dt = clamp(d * 0.5, u_volStepMin, 1.0);
    if (dens > 1e-4) {
      vec3 c = palette(trap * 0.4 + u_colorShift * 10.0);
      float lit = 1.0;
      if (u_volLight > 0.0) {
        // Cheap self-shadowing: does the density fall off toward the light?
        vec3 l = normalize(u_lightPos - p);
        float tr2;
        float d2 = map(p + l * u_volThick * 4.0, tr2);
        lit = mix(1.0, clamp(0.25 + (d2 - d) / (u_volThick * 4.0), 0.05, 1.5), u_volLight);
      }
      float a = 1.0 - exp(-dens * dt);
#ifdef HAS_XLIGHTS
      L += T * a * c * u_volGlow * (lit * mix(vec3(1.0), u_lightColor, u_volLight) + (u_lOn.x * u_l2Col + u_lOn.y * u_l3Col) * 0.6);
#else
      L += T * a * c * u_volGlow * lit * mix(vec3(1.0), u_lightColor, u_volLight);
#endif
      T *= 1.0 - a;
    }
    t += dt;
  }
  vec3 col = L + T * bg;
  col *= u_brightness * vignetteAt(screenUv);
  gl_FragColor = vec4(accumulate(col), 1.0);
}
#endif
`;

// Specialised fragment shader.
// spec: { f: <formula spec>, mode, mat, xl, rep, dz }   (renderer.js specOf)
// opts: { texLod }  (plus mode / mat / xl / rep / dz, which override spec's)
// Note: '#ifdef' must be at column 0-ish; GLSL ES allows leading whitespace before '#'.
export function fractalFrag(spec = {}, opts = {}) {
  const o = { ...spec, ...opts };
  const f = spec.f ?? F.defaultSpec;
  // Preprocessor header: #extension first (strict drivers require it before
  // anything else), then the specialisation defines.
  const head = (o.texLod ? '#extension GL_EXT_shader_texture_lod : enable\n#define HAS_TEX_LOD\n' : '')
    + `#define RENDER_MODE ${o.mode | 0}\n` + (F.glsl.defines(f) || '')
    + (o.mat ? '#define HAS_MAT\n' : '')
    + (o.xl ? '#define HAS_XLIGHTS\n' : '')
    + (o.rep ? '#define HAS_REP\n' : '')
    + (o.dz ? '#define DEEP_ZOOM\n' : '');
  return head + PRELUDE + '// ── formula ──\n' + F.glsl.uniforms + '\n' + COMMON + CORE_GLOBALS + F.glsl.source(f) + TAIL;
}

// Head-of-shader slice used by the parity harness (everything up to the normal).
export function fractalMapSource(spec = {}, opts = {}) {
  const s = fractalFrag(spec, opts);
  return s.slice(0, s.indexOf('// Tetrahedral normal'));
}
