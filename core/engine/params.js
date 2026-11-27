// Parameter schema — the single source of truth for every tweakable value.
// The UI, the state store, the sequencer, the discovery-string codec and the
// uniform upload all derive from this list, so adding a parameter is one line.
//
// Fields:
//   id        state key
//   label     UI label
//   type      'range' | 'bool' | 'select' | 'color' | 'hidden' | 'text'
//   group     panel group id (see GROUPS)
//   min/max   default slider range (user can widen with the R toggle)
//   hardMin/hardMax  absolute clamp applied by the state store (shader safety)
//   step      slider step
//   def       default value
//   int       round to integer
//   options   select options [label, ...] (value = index)
//   row       params sharing a row key render as a compact 3-column grid
//   section   sub-heading rendered before this param
//   gate      id of a param that enables/disables this control (bool, or
//             a select when combined with gateEq: enabled iff value === gateEq,
//             or value is in gateEq when it is an array)
//   fine      offers the F (fine-tune) chip — rotation sliders
//   interp    'lerp' (default numeric) | 'angle' | 'color' | 'step' | 'none'
//   noReset   changing it does not restart progressive accumulation
//   mutate    included in Evolve mutations

// Organon owns the RIGHT dock (scene & output). The formula owns the LEFT dock
// (what the fractal is, including Presets and Iteration) and calls
// defineParams() once, at module load, before anything reads PARAMS.

import { GRADIENT_NAMES, WRAP_MODES, CUSTOM_GRADIENT } from './gradients.js';

const PI = 3.1416;
export { PI };
export const MAT_TYPES = ['Standard', 'Metal', 'Glass', 'Iridescent', 'Glow'];
export const MAT_ASSIGN = ['Single (Slot A)', 'Fold Count', 'Orbit Trap', 'Colour Index', 'Crease Depth', 'Height', 'Facing Up'];
export const TEX_SOURCES = ['Loaded Image', 'Marble', 'Cells', 'Rust', 'Brushed Metal', 'Bark', 'Lava Cracks', 'Stone'];
export const GROUND_TYPES = ['Off', 'Matte', 'Grass', 'Sand', 'Rock', 'Water', 'Mirror', 'Checker'];

// Filled by defineParams(). Mutated in place, so importers keep the same arrays.
export const GROUPS = [];
export const PARAMS = [];
export const PARAM_BY_ID = new Map();

// side: which dock the group lives in. Left = the formula (what the fractal
// IS); right = the scene and output (how it's seen, animated and exported).
export const SCENE_GROUPS = [
  { id: 'render',  side: 'right', title: 'Render Mode', accent: true, open: true },
  { id: 'view',    side: 'right', title: 'View & Navigation' },
  { id: 'object',  side: 'right', title: 'Object Transform' },
  { id: 'rep',     side: 'right', title: 'Repetition / Arrays', accent: true },
  { id: 'style',   side: 'right', title: 'Color & Lens', accent: true },
  { id: 'mat',     side: 'right', title: 'Materials & Textures', accent: true },
  { id: 'env',     side: 'right', title: 'Environment', accent: true },
  { id: 'ground',  side: 'right', title: 'Ground Plane', accent: true },
  { id: 'light',   side: 'right', title: 'Atmosphere & Light' },
  { id: 'seq',     side: 'right', title: 'Animation Sequencer', accent: true },
  { id: 'video',   side: 'right', title: 'Video & Frames Export' },
  { id: 'quality', side: 'right', title: 'Quality & Output' },
];

// Ray-marching controls for the formula's Iteration group (group 'iter').
// marchParams({ stepFactor: { label: '…' } }) overrides fields per id.
export const marchParams = (over = {}) => [
  { id: 'maxSteps', label: 'Max Ray Steps', type: 'range', group: 'iter', min: 64, max: 1024, step: 1, def: 256, int: true, hardMin: 16, hardMax: 1024, interp: 'none', section: 'Ray Marching (fixes cut-off surfaces)' },
  { id: 'detail', label: 'Surface Detail', type: 'range', group: 'iter', min: 0.05, max: 4, step: 0.01, def: 1, hardMin: 0.01, interp: 'none' },
  { id: 'stepFactor', label: 'Step Factor', type: 'range', group: 'iter', min: 0.1, max: 2, step: 0.01, def: 1, hardMin: 0.01, hardMax: 4, interp: 'none' },
  { id: 'maxStep', label: 'Max Step (0 = off)', type: 'range', group: 'iter', min: 0, max: 10, step: 0.01, def: 0, hardMin: 0, interp: 'none' },
  { id: 'maxDist', label: 'Max Distance', type: 'range', group: 'iter', min: 5, max: 500, step: 1, def: 100, hardMin: 0.1, interp: 'none' },
  { id: 'missAsHit', label: 'Shade Stranded Rays as Surface', type: 'bool', group: 'iter', def: false, interp: 'none' },
  { id: 'debugView', label: 'Debug View', type: 'select', group: 'iter', options: ['Off', 'Step Heatmap', 'Miss Reason (red = out of steps)'], def: 0, interp: 'none' },
].map(p => (over[p.id] ? { ...p, ...over[p.id] } : p));

export const SCENE_PARAMS = [
  // ════ RIGHT DOCK — SCENE & OUTPUT ═════════════════════════════════════════

  // ── Render mode ─────────────────────────────────────────────────────────
  { id: 'renderMode', label: 'Mode', type: 'select', group: 'render', options: ['Surface (fast)', 'Path Traced (global illumination)', 'Volumetric Glow (dust / fog)'], def: 0, interp: 'none' },
  { id: 'ptBounces', label: 'Bounces', type: 'range', group: 'render', min: 1, max: 6, step: 1, def: 3, int: true, hardMin: 1, hardMax: 6, gate: 'renderMode', gateEq: 1, section: 'Path Tracing', interp: 'none' },
  { id: 'ptRough', label: 'Roughness', type: 'range', group: 'render', min: 0, max: 1, step: 0.01, def: 0.5, hardMin: 0, hardMax: 1, gate: 'renderMode', gateEq: 1 },
  { id: 'ptMetal', label: 'Metallic', type: 'range', group: 'render', min: 0, max: 1, step: 0.01, def: 0, hardMin: 0, hardMax: 1, gate: 'renderMode', gateEq: 1 },
  { id: 'ptSun', label: 'Light Intensity', type: 'range', group: 'render', min: 0, max: 10, step: 0.01, def: 2.5, hardMin: 0, gate: 'renderMode', gateEq: 1 },
  { id: 'ptLightSize', label: 'Light Size (soft shadows)', type: 'range', group: 'render', min: 0, max: 2, step: 0.01, def: 0.3, hardMin: 0, gate: 'renderMode', gateEq: 1 },
  { id: 'ptSky', label: 'Sky / Image Light', type: 'range', group: 'render', min: 0, max: 4, step: 0.01, def: 1, hardMin: 0, gate: 'renderMode', gateEq: 1 },
  { id: 'ptSkyColor', label: 'Sky Color (no image)', type: 'color', group: 'render', def: '#9fb4d9', gate: 'renderMode', gateEq: 1 },
  { id: 'ptEmit', label: 'Trap Emission', type: 'range', group: 'render', min: 0, max: 5, step: 0.01, def: 0, hardMin: 0, gate: 'renderMode', gateEq: 1 },
  { id: 'ptClamp', label: 'Firefly Clamp', type: 'range', group: 'render', min: 1, max: 100, step: 0.5, def: 20, hardMin: 0.5, gate: 'renderMode', gateEq: 1, interp: 'none' },
  { id: 'volDensity', label: 'Density', type: 'range', group: 'render', min: 0, max: 200, step: 0.1, def: 20, hardMin: 0, gate: 'renderMode', gateEq: 2, section: 'Volumetric Glow' },
  { id: 'volThick', label: 'Shell Thickness', type: 'range', group: 'render', min: 0.0005, max: 0.05, step: 0.0001, def: 0.004, hardMin: 0.00001, gate: 'renderMode', gateEq: 2 },
  { id: 'volGlow', label: 'Glow', type: 'range', group: 'render', min: 0, max: 5, step: 0.01, def: 1.2, hardMin: 0, gate: 'renderMode', gateEq: 2 },
  { id: 'volLight', label: 'Light Shading', type: 'range', group: 'render', min: 0, max: 1, step: 0.01, def: 0.5, hardMin: 0, hardMax: 1, gate: 'renderMode', gateEq: 2 },
  { id: 'volStepMin', label: 'Min Step', type: 'range', group: 'render', min: 0.001, max: 0.05, step: 0.0005, def: 0.008, hardMin: 0.0001, gate: 'renderMode', gateEq: 2, interp: 'none' },
  { id: 'volSteps', label: 'Volume Steps', type: 'range', group: 'render', min: 64, max: 1024, step: 1, def: 384, int: true, hardMin: 16, hardMax: 1024, gate: 'renderMode', gateEq: 2, interp: 'none' },

  // ── View & navigation ───────────────────────────────────────────────────
  { id: 'rotX', label: 'Orbit Horiz', type: 'range', group: 'view', min: -PI, max: PI, step: 0.001, def: 0, interp: 'angle', fine: true },
  { id: 'rotY', label: 'Orbit Vert', type: 'range', group: 'view', min: -1.55, max: 1.55, step: 0.001, def: 0, hardMin: -1.5707, hardMax: 1.5707, fine: true },
  { id: 'dist', label: 'View Distance', type: 'range', group: 'view', min: 0.01, max: 20, step: 0.001, def: 5, hardMin: 1e-8 },
  { id: 'deepZoom', label: 'Deep Zoom (pixel-sharp close-ups)', type: 'bool', group: 'view', def: false, section: 'Deep Zoom' },
  { id: 'deepIters', label: 'Add Iterations as You Zoom', type: 'range', group: 'view', min: 0, max: 2, step: 0.05, def: 1, hardMin: 0, hardMax: 4, gate: 'deepZoom' },
  { id: 'clickMode', label: 'Click on View', type: 'select', group: 'view', options: ['Orbit only', 'Place Main Light', 'Place Light 2', 'Place Light 3', 'Zoom ×2 into Point'], def: 0, interp: 'step', section: 'Click Tools' },
  { id: 'lightPlace', label: 'Light Distance from Surface', type: 'range', group: 'view', min: 0.02, max: 2, step: 0.01, def: 0.3, hardMin: 0.001, hardMax: 20, gate: 'clickMode', gateEq: [1, 2, 3] },
  { id: 'lens', label: 'Lens (Focal Length)', type: 'range', group: 'view', min: 0.2, max: 4, step: 0.01, def: 1, hardMin: 0.05 },
  { id: 'rollX', label: 'Roll X (ξ)', type: 'range', group: 'view', min: -PI, max: PI, step: 0.001, def: 0, section: 'Orbit Roll System (ξ, η, ζ)', interp: 'angle', fine: true },
  { id: 'rollY', label: 'Roll Y (η)', type: 'range', group: 'view', min: -PI, max: PI, step: 0.001, def: 0, interp: 'angle', fine: true },
  { id: 'rollZ', label: 'Roll Z (ζ)', type: 'range', group: 'view', min: -PI, max: PI, step: 0.001, def: 0, interp: 'angle', fine: true },
  { id: 'autoRoll', label: 'Cinematic Auto-Roll', type: 'bool', group: 'view', def: false, section: 'Auto Motion', interp: 'none', noReset: true },
  { id: 'rotSpeed', label: 'Roll Speed', type: 'range', group: 'view', min: 0, max: 2, step: 0.01, def: 0.5, noReset: true },
  { id: 'rollAmount', label: 'Roll Amount', type: 'range', group: 'view', min: 0, max: 2, step: 0.01, def: 1, noReset: true },
  { id: 'targetX', type: 'hidden', group: 'view', def: 0 },
  { id: 'targetY', type: 'hidden', group: 'view', def: 0 },
  { id: 'targetZ', type: 'hidden', group: 'view', def: 0 },

  // ── Repetition / arrays ──
  { id: 'repMode', label: 'Repeat', type: 'select', group: 'rep', options: ['Off', 'Grid', 'Ring'], def: 0, interp: 'step' },
  { id: 'repCountX', label: 'NX', type: 'range', group: 'rep', min: 0, max: 8, step: 1, def: 2, int: true, hardMin: 0, hardMax: 50, row: 'rcnt', section: 'Grid: copies each side of centre', gate: 'repMode', gateEq: 1 },
  { id: 'repCountY', label: 'NY', type: 'range', group: 'rep', min: 0, max: 8, step: 1, def: 0, int: true, hardMin: 0, hardMax: 50, row: 'rcnt', gate: 'repMode', gateEq: 1 },
  { id: 'repCountZ', label: 'NZ', type: 'range', group: 'rep', min: 0, max: 8, step: 1, def: 2, int: true, hardMin: 0, hardMax: 50, row: 'rcnt', gate: 'repMode', gateEq: 1 },
  { id: 'repSpaceX', label: 'SX', type: 'range', group: 'rep', min: 0.5, max: 20, step: 0.01, def: 5, hardMin: 0.001, hardMax: 1000, row: 'rsp', section: 'Grid spacing', gate: 'repMode', gateEq: 1 },
  { id: 'repSpaceY', label: 'SY', type: 'range', group: 'rep', min: 0.5, max: 20, step: 0.01, def: 5, hardMin: 0.001, hardMax: 1000, row: 'rsp', gate: 'repMode', gateEq: 1 },
  { id: 'repSpaceZ', label: 'SZ', type: 'range', group: 'rep', min: 0.5, max: 20, step: 0.01, def: 5, hardMin: 0.001, hardMax: 1000, row: 'rsp', gate: 'repMode', gateEq: 1 },
  { id: 'repRingN', label: 'Copies', type: 'range', group: 'rep', min: 2, max: 32, step: 1, def: 8, int: true, hardMin: 2, hardMax: 256, section: 'Ring', gate: 'repMode', gateEq: 2 },
  { id: 'repRingR', label: 'Radius', type: 'range', group: 'rep', min: 0, max: 20, step: 0.01, def: 6, hardMin: 0, hardMax: 1000, gate: 'repMode', gateEq: 2 },
  { id: 'repRingAxis', label: 'Ring Axis', type: 'select', group: 'rep', options: ['X', 'Y', 'Z'], def: 1, interp: 'step', gate: 'repMode', gateEq: 2 },
  { id: 'repRingRotate', label: 'Copies Turn with the Ring', type: 'bool', group: 'rep', def: true, gate: 'repMode', gateEq: 2 },
  { id: 'repRotVar', label: 'Rotation Variation (°)', type: 'range', group: 'rep', min: 0, max: 180, step: 0.5, def: 0, hardMin: 0, hardMax: 180, section: 'Per-copy variation', gate: 'repMode', gateEq: [1, 2], mutate: true },
  { id: 'repScaleVar', label: 'Scale Variation', type: 'range', group: 'rep', min: 0, max: 0.5, step: 0.005, def: 0, hardMin: 0, hardMax: 0.9, gate: 'repMode', gateEq: [1, 2], mutate: true },
  { id: 'repColVar', label: 'Colour Variation', type: 'range', group: 'rep', min: 0, max: 3, step: 0.01, def: 0, hardMin: 0, hardMax: 20, gate: 'repMode', gateEq: [1, 2], mutate: true },
  { id: 'repSeed', label: 'Variation Seed', type: 'range', group: 'rep', min: 0, max: 100, step: 1, def: 0, int: true, hardMin: 0, hardMax: 100000, gate: 'repMode', gateEq: [1, 2] },

  // ── Color & lens ────────────────────────────────────────────────────────
  // Gradient: one 256-texel LUT in the shader (engine/gradients.js); the first
  // eight are the original cosine palettes, rebuilt exactly.
  { id: 'palette', label: 'Gradient', type: 'select', group: 'style', options: GRADIENT_NAMES, def: 0 },
  { id: 'colorShift', label: 'Gradient Offset', type: 'range', group: 'style', min: 0, max: 1, step: 0.01, def: 0, mutate: true },
  // Colour sources: the formula's mapLocal() decides what each one means, and
  // may add options / weights via defineParams({ scene }) (see README).
  { id: 'colorSource', label: 'Color Source', type: 'select', group: 'style', options: ['Orbit trap', 'Fold count (stripes)', 'Trap + folds'], def: 0 },
  { id: 'foldColW', label: 'Fold Colour ×', type: 'range', group: 'style', min: 0, max: 2, step: 0.01, def: 0.25, gate: 'colorSource', gateEq: [1, 2] },
  { id: 'colorIters', label: 'Color Iterations', type: 'range', group: 'style', min: 1, max: 40, step: 1, def: 6, int: true, hardMin: 1, hardMax: 250, gate: 'colorSource', gateEq: [1, 2] },
  // Stops for the 'Imported' gradient: "pos:#rrggbb pos:#rrggbb …", pos 0…1 (Mandelbulber import).
  { id: 'gradStops', type: 'text', group: 'style', def: '' },
  { id: 'gradRepeat', label: 'Gradient Repeat', type: 'range', group: 'style', min: 0.1, max: 32, step: 0.01, def: 1, hardMin: 0.01 },
  { id: 'gradWrap', label: 'Wrap', type: 'select', group: 'style', options: WRAP_MODES, def: 0, row: 'gradA' },
  { id: 'gradReverse', label: 'Reverse', type: 'bool', group: 'style', def: false, row: 'gradA' },
  { id: 'gradHue', label: 'Gradient Hue', type: 'range', group: 'style', min: -180, max: 180, step: 1, def: 0 },
  { id: 'gradSat', label: 'Gradient Saturation', type: 'range', group: 'style', min: 0, max: 2, step: 0.01, def: 1, hardMin: 0 },
  { id: 'gradC1', label: 'Stop 1', type: 'color', group: 'style', def: '#0b0b2b', interp: 'color', row: 'gradC', gate: 'palette', gateEq: CUSTOM_GRADIENT },
  { id: 'gradC2', label: 'Stop 2', type: 'color', group: 'style', def: '#5e2ca5', interp: 'color', row: 'gradC', gate: 'palette', gateEq: CUSTOM_GRADIENT },
  { id: 'gradC3', label: 'Stop 3', type: 'color', group: 'style', def: '#e0457b', interp: 'color', row: 'gradC', gate: 'palette', gateEq: CUSTOM_GRADIENT },
  { id: 'gradC4', label: 'Stop 4', type: 'color', group: 'style', def: '#ffb347', interp: 'color', row: 'gradC2', gate: 'palette', gateEq: CUSTOM_GRADIENT },
  { id: 'gradC5', label: 'Stop 5', type: 'color', group: 'style', def: '#fff6d5', interp: 'color', row: 'gradC2', gate: 'palette', gateEq: CUSTOM_GRADIENT },
  { id: 'lightColor', label: 'Lite Color', type: 'color', group: 'style', def: '#e6f2ff', interp: 'color', row: 'colors' },
  { id: 'bgColor', label: 'Background', type: 'color', group: 'style', def: '#010103', interp: 'color', row: 'colors' },
  { id: 'tonemap', label: 'Tone Curve', type: 'select', group: 'style', options: ['Legacy (v1 look)', 'Filmic (ACES)'], def: 0 },
  { id: 'brightness', label: 'Exposure', type: 'range', group: 'style', min: 0.1, max: 5, step: 0.01, def: 1.2 },
  { id: 'vignette', label: 'Vignette', type: 'range', group: 'style', min: 0, max: 2, step: 0.01, def: 0.5 },
  { id: 'dofStrength', label: 'Depth Focus', type: 'range', group: 'style', min: 0, max: 2, step: 0.01, def: 0, hardMin: 0, section: 'Depth of Field (dbl-click to focus)' },
  { id: 'focalDist', label: 'Focal Dist', type: 'range', group: 'style', min: 0.1, max: 20, step: 0.01, def: 5, hardMin: 0.0001 },

  // ── Materials & textures ────────────────────────────────────────────────
  { id: 'matOn', label: 'Enable Materials', type: 'bool', group: 'mat', def: false },
  { id: 'matAssign', label: 'Assign Slots By', type: 'select', group: 'mat', options: MAT_ASSIGN, def: 1, gate: 'matOn' },
  { id: 'matScale', label: 'Key ×', type: 'range', group: 'mat', min: 0, max: 2, step: 0.001, def: 0.25, hardMin: -100, hardMax: 100, gate: 'matOn', row: 'mk', mutate: true },
  { id: 'matOffset', label: 'Key +', type: 'range', group: 'mat', min: -1, max: 1, step: 0.001, def: 0, gate: 'matOn', row: 'mk', mutate: true },
  { id: 'matSplit1', label: 'A|B', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.34, gate: 'matOn', row: 'msp' },
  { id: 'matSplit2', label: 'B|C', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.67, gate: 'matOn', row: 'msp' },
  { id: 'matSoft', label: 'Band Softness', type: 'range', group: 'mat', min: 0, max: 0.5, step: 0.005, def: 0.03, hardMin: 0, gate: 'matOn' },
  { id: 'matRepeat', label: 'Repeat Bands', type: 'bool', group: 'mat', def: true, gate: 'matOn' },
  { id: 'matAType', label: 'Type', type: 'select', group: 'mat', options: MAT_TYPES, def: 0, gate: 'matOn', section: 'Slot A', row: 'mA1' },
  { id: 'matATint', label: 'Tint', type: 'color', group: 'mat', def: '#ffffff', gate: 'matOn', row: 'mA1' },
  { id: 'matAMix', label: 'Mix', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0, hardMin: 0, hardMax: 1, gate: 'matOn', row: 'mA2' },
  { id: 'matARough', label: 'Rough', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.45, hardMin: 0, hardMax: 1, gate: 'matOn', row: 'mA2', mutate: true },
  { id: 'matAAmt', label: 'Amount (by type)', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.3, hardMin: 0, hardMax: 4, gate: 'matOn' },
  { id: 'matBType', label: 'Type', type: 'select', group: 'mat', options: MAT_TYPES, def: 1, gate: 'matOn', section: 'Slot B', row: 'mB1' },
  { id: 'matBTint', label: 'Tint', type: 'color', group: 'mat', def: '#e2b86a', gate: 'matOn', row: 'mB1' },
  { id: 'matBMix', label: 'Mix', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.35, hardMin: 0, hardMax: 1, gate: 'matOn', row: 'mB2' },
  { id: 'matBRough', label: 'Rough', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.25, hardMin: 0, hardMax: 1, gate: 'matOn', row: 'mB2', mutate: true },
  { id: 'matBAmt', label: 'Amount (by type)', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 1, hardMin: 0, hardMax: 4, gate: 'matOn' },
  { id: 'matCType', label: 'Type', type: 'select', group: 'mat', options: MAT_TYPES, def: 3, gate: 'matOn', section: 'Slot C', row: 'mC1' },
  { id: 'matCTint', label: 'Tint', type: 'color', group: 'mat', def: '#ffffff', gate: 'matOn', row: 'mC1' },
  { id: 'matCMix', label: 'Mix', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0, hardMin: 0, hardMax: 1, gate: 'matOn', row: 'mC2' },
  { id: 'matCRough', label: 'Rough', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.15, hardMin: 0, hardMax: 1, gate: 'matOn', row: 'mC2', mutate: true },
  { id: 'matCAmt', label: 'Amount (by type)', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0.5, hardMin: 0, hardMax: 4, gate: 'matOn' },
  { id: 'matIor', label: 'Glass Index of Refraction', type: 'range', group: 'mat', min: 1, max: 2.5, step: 0.01, def: 1.45, hardMin: 1, hardMax: 4, gate: 'matOn', section: 'Glass' },
  { id: 'creaseAmt', label: 'Crease Tint', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 0, hardMin: 0, hardMax: 2, section: 'Crease Colour (works without materials)' },
  { id: 'creaseCol', label: 'Colour', type: 'color', group: 'mat', def: '#2a1408', row: 'crs' },
  { id: 'creaseRad', label: 'Radius', type: 'range', group: 'mat', min: 0.1, max: 5, step: 0.01, def: 1, hardMin: 0.01, row: 'crs' },
  { id: 'texMode', label: 'Texture', type: 'select', group: 'mat', options: ['Off', 'Colour', 'Bump', 'Colour + Bump'], def: 0, section: 'Texture (works without materials)' },
  { id: 'texSrc', label: 'Image', type: 'select', group: 'mat', options: TEX_SOURCES, def: 1, gate: 'texMode', gateEq: [1, 2, 3] },
  { id: 'texMap', label: 'Mapping', type: 'select', group: 'mat', options: ['Surface (seamless triplanar)', 'Fractalized orbit (Mandelbulber)'], def: 0, gate: 'texMode', gateEq: [1, 2, 3] },
  { id: 'texBlend', label: 'Blend', type: 'select', group: 'mat', options: ['Multiply', 'Overlay', 'Replace', 'Screen'], def: 0, gate: 'texMode', gateEq: [1, 2, 3], row: 'tbl' },
  { id: 'texSlot', label: 'Apply To', type: 'select', group: 'mat', options: ['All', 'Slot A', 'Slot B', 'Slot C'], def: 0, gate: 'texMode', gateEq: [1, 2, 3], row: 'tbl' },
  { id: 'texScale', label: 'Scale (tiles per unit)', type: 'range', group: 'mat', min: 0.05, max: 10, step: 0.001, def: 1, hardMin: 0.0001, hardMax: 1000, gate: 'texMode', gateEq: [1, 2, 3], mutate: true },
  { id: 'texOffX', label: 'Off X', type: 'range', group: 'mat', min: -1, max: 1, step: 0.001, def: 0, gate: 'texMode', gateEq: [1, 2, 3], row: 'tof' },
  { id: 'texOffY', label: 'Off Y', type: 'range', group: 'mat', min: -1, max: 1, step: 0.001, def: 0, gate: 'texMode', gateEq: [1, 2, 3], row: 'tof' },
  { id: 'texMix', label: 'Colour', type: 'range', group: 'mat', min: 0, max: 1, step: 0.01, def: 1, hardMin: 0, hardMax: 1, gate: 'texMode', gateEq: [1, 2, 3], row: 'tmx' },
  { id: 'texBump', label: 'Bump', type: 'range', group: 'mat', min: 0, max: 3, step: 0.01, def: 1, hardMin: 0, hardMax: 20, gate: 'texMode', gateEq: [1, 2, 3], row: 'tmx' },
  { id: 'texSharp', label: 'Seams', type: 'range', group: 'mat', min: 1, max: 16, step: 0.1, def: 4, hardMin: 1, hardMax: 64, gate: 'texMode', gateEq: [1, 2, 3], row: 'tsh' },
  { id: 'texBlur', label: 'Blur', type: 'range', group: 'mat', min: 0, max: 6, step: 0.01, def: 0, hardMin: 0, hardMax: 12, gate: 'texMode', gateEq: [1, 2, 3], row: 'tsh' },
  { id: 'texFracStart', label: 'From It', type: 'range', group: 'mat', min: 0, max: 40, step: 1, def: 2, int: true, hardMin: 0, hardMax: 250, gate: 'texMap', gateEq: 1, row: 'tfr' },
  { id: 'texFracCube', label: 'Cube', type: 'range', group: 'mat', min: 0.1, max: 20, step: 0.01, def: 2, hardMin: 0.0001, hardMax: 1e5, gate: 'texMap', gateEq: 1, row: 'tfr' },

  // ── Environment (image source is chosen in the UI; see engine/environment.js) ──
  { id: 'envMode', label: 'Background', type: 'select', group: 'env', options: ['Solid Color', 'Backdrop (fit to view)', 'Panorama (360° sky)'], def: 0 },
  { id: 'envIntensity', label: 'Background Brightness', type: 'range', group: 'env', min: 0, max: 3, step: 0.01, def: 1 },
  { id: 'envBlur', label: 'Background Blur', type: 'range', group: 'env', min: 0, max: 8, step: 0.01, def: 0 },
  { id: 'envYaw', label: 'Panorama Yaw', type: 'range', group: 'env', min: -PI, max: PI, step: 0.001, def: 0, interp: 'angle', fine: true },
  { id: 'envPitch', label: 'Panorama Pitch', type: 'range', group: 'env', min: -1.5707, max: 1.5707, step: 0.001, def: 0, fine: true },
  { id: 'envReflect', label: 'Reflections', type: 'range', group: 'env', min: 0, max: 2, step: 0.01, def: 0.4, section: 'Image-Based Lighting' },
  { id: 'envLight', label: 'Ambient from Image', type: 'range', group: 'env', min: 0, max: 2, step: 0.01, def: 0.5 },
  { id: 'envFog', label: 'Fog Takes Image Color', type: 'bool', group: 'env', def: true },

  // ── Atmosphere & light ──────────────────────────────────────────────────
  // ── Object transform: moves the fractal, not the camera / light / ground ──
  { id: 'objX', label: 'X', type: 'range', group: 'object', min: -10, max: 10, step: 0.01, def: 0, row: 'opos', section: 'Position', fine: true },
  { id: 'objY', label: 'Y', type: 'range', group: 'object', min: -10, max: 10, step: 0.01, def: 0, row: 'opos', fine: true },
  { id: 'objZ', label: 'Z', type: 'range', group: 'object', min: -10, max: 10, step: 0.01, def: 0, row: 'opos', fine: true },
  { id: 'objRotX', label: 'Pitch', type: 'range', group: 'object', min: -180, max: 180, step: 0.1, def: 0, row: 'orot', section: 'Rotation (degrees)', fine: true },
  { id: 'objRotY', label: 'Yaw', type: 'range', group: 'object', min: -180, max: 180, step: 0.1, def: 0, row: 'orot', fine: true },
  { id: 'objRotZ', label: 'Roll', type: 'range', group: 'object', min: -180, max: 180, step: 0.1, def: 0, row: 'orot', fine: true },
  { id: 'objScale', label: 'Object Scale', type: 'range', group: 'object', min: 0.1, max: 5, step: 0.01, def: 1, hardMin: 0.01, fine: true },

  // ── Ground plane ────────────────────────────────────────────────────────
  { id: 'groundType', label: 'Ground', type: 'select', group: 'ground', options: GROUND_TYPES, def: 0 },
  { id: 'groundY', label: 'Height', type: 'range', group: 'ground', min: -10, max: 10, step: 0.01, def: -2, fine: true, gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundColor', label: 'Color', type: 'color', group: 'ground', def: '#4a6b2e', interp: 'color', row: 'gcol', gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundColor2', label: 'Color 2', type: 'color', group: 'ground', def: '#8fae4a', interp: 'color', row: 'gcol', gate: 'groundType', gateEq: [2, 3, 4, 7] },
  { id: 'groundScale', label: 'Texture Scale', type: 'range', group: 'ground', min: 0.05, max: 10, step: 0.01, def: 1, hardMin: 0.01, gate: 'groundType', gateEq: [2, 3, 4, 5, 7] },
  { id: 'groundBump', label: 'Terrain / Waves', type: 'range', group: 'ground', min: 0, max: 3, step: 0.01, def: 0.3, gate: 'groundType', gateEq: [2, 3, 4, 5] },
  { id: 'groundReflect', label: 'Reflectivity', type: 'range', group: 'ground', min: 0, max: 1, step: 0.01, def: 0.6, gate: 'groundType', gateEq: [5, 6] },
  { id: 'groundRough', label: 'Blur (path traced)', type: 'range', group: 'ground', min: 0, max: 1, step: 0.01, def: 0.05, gate: 'groundType', gateEq: [5, 6] },
  { id: 'groundTiltX', label: 'Tilt X', type: 'range', group: 'ground', min: -45, max: 45, step: 0.1, def: 0, row: 'gtilt', section: 'Plane Orientation (degrees)', fine: true, gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundTiltZ', label: 'Tilt Z', type: 'range', group: 'ground', min: -45, max: 45, step: 0.1, def: 0, row: 'gtilt', fine: true, gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundYaw', label: 'Spin', type: 'range', group: 'ground', min: -180, max: 180, step: 0.1, def: 0, row: 'gtilt', fine: true, gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundOffX', label: 'Slide X', type: 'range', group: 'ground', min: -20, max: 20, step: 0.01, def: 0, row: 'goff', gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundOffZ', label: 'Slide Z', type: 'range', group: 'ground', min: -20, max: 20, step: 0.01, def: 0, row: 'goff', gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundFade', label: 'Horizon Haze', type: 'range', group: 'ground', min: 0, max: 2, step: 0.01, def: 0.3, gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'groundShadows', label: 'Receives Shadows', type: 'bool', group: 'ground', def: true, gate: 'groundType', gateEq: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'lightX', label: 'LX', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: 2, row: 'light', section: 'Light Position' },
  { id: 'lightY', label: 'LY', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: 4, row: 'light' },
  { id: 'lightZ', label: 'LZ', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: 3, row: 'light' },
  { id: 'lightRelative', label: 'Headlight (follows camera)', type: 'bool', group: 'light', def: false },
  { id: 'light2On', label: 'Light 2', type: 'bool', group: 'light', def: false, section: 'Light 2 (optional)' },
  { id: 'light2X', label: 'LX', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: -4, row: 'l2p', gate: 'light2On' },
  { id: 'light2Y', label: 'LY', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: 2, row: 'l2p', gate: 'light2On' },
  { id: 'light2Z', label: 'LZ', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: -3, row: 'l2p', gate: 'light2On' },
  { id: 'light2Color', label: 'Colour', type: 'color', group: 'light', def: '#ffb070', interp: 'color', row: 'l2c', gate: 'light2On' },
  { id: 'light2Int', label: 'Intensity', type: 'range', group: 'light', min: 0, max: 3, step: 0.01, def: 0.8, hardMin: 0, hardMax: 20, row: 'l2c', gate: 'light2On' },
  { id: 'light2Shadows', label: 'Casts Shadows (needs Soft Shadows)', type: 'bool', group: 'light', def: true, gate: 'light2On' },
  { id: 'light2Relative', label: 'Follows Camera', type: 'bool', group: 'light', def: false, gate: 'light2On' },
  { id: 'light3On', label: 'Light 3', type: 'bool', group: 'light', def: false, section: 'Light 3 (optional)' },
  { id: 'light3X', label: 'LX', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: 3, row: 'l3p', gate: 'light3On' },
  { id: 'light3Y', label: 'LY', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: -3, row: 'l3p', gate: 'light3On' },
  { id: 'light3Z', label: 'LZ', type: 'range', group: 'light', min: -10, max: 10, step: 0.1, def: 4, row: 'l3p', gate: 'light3On' },
  { id: 'light3Color', label: 'Colour', type: 'color', group: 'light', def: '#6f8cff', interp: 'color', row: 'l3c', gate: 'light3On' },
  { id: 'light3Int', label: 'Intensity', type: 'range', group: 'light', min: 0, max: 3, step: 0.01, def: 0.6, hardMin: 0, hardMax: 20, row: 'l3c', gate: 'light3On' },
  { id: 'light3Shadows', label: 'Casts Shadows (needs Soft Shadows)', type: 'bool', group: 'light', def: true, gate: 'light3On' },
  { id: 'light3Relative', label: 'Follows Camera', type: 'bool', group: 'light', def: false, gate: 'light3On' },
  { id: 'ambient', label: 'Ambient', type: 'range', group: 'light', min: 0, max: 1, step: 0.01, def: 0.2 },
  { id: 'volumetric', label: 'Volumetric', type: 'range', group: 'light', min: 0, max: 10, step: 0.01, def: 1.5, hardMin: 0 },
  { id: 'fog', label: 'Fog', type: 'range', group: 'light', min: 0, max: 2, step: 0.01, def: 0.2 },
  { id: 'stepAO', label: 'Step AO (march glow)', type: 'range', group: 'light', min: 0, max: 2, step: 0.01, def: 1, section: 'Occlusion & Shadow' },
  { id: 'aoStrength', label: 'Surface AO', type: 'range', group: 'light', min: 0, max: 2, step: 0.01, def: 0, hardMin: 0 },
  { id: 'shadows', label: 'Soft Shadows', type: 'bool', group: 'light', def: false },
  { id: 'shadowSoft', label: 'Shadow Sharpness', type: 'range', group: 'light', min: 2, max: 64, step: 0.5, def: 12, hardMin: 0.5, gate: 'shadows' },

  // ── Sequencer ────────────────────────────────────────────────────────────
  { id: 'seqDuration', label: 'Trans. Duration (s)', type: 'range', group: 'seq', min: 0.5, max: 20, step: 0.1, def: 3, hardMin: 0.05, interp: 'none', noReset: true },
  { id: 'seqMode', label: 'Playback', type: 'select', group: 'seq', options: ['Once', 'Loop (seamless)', 'Ping-Pong'], def: 0, interp: 'none', noReset: true, row: 'seqsel' },
  { id: 'seqEasing', label: 'Interpolation', type: 'select', group: 'seq', options: ['Linear', 'Smooth (Catmull-Rom)', 'Ease In-Out'], def: 1, interp: 'none', noReset: true, row: 'seqsel' },
  { id: 'pulse', label: 'Scale Pulse', type: 'bool', group: 'seq', def: false, interp: 'step', noReset: true },

  // ── Video & frames export ───────────────────────────────────────────────
  { id: 'recMode', label: 'Record Mode', type: 'select', group: 'video', options: ['Real-time (live view)', 'Offline (frame-exact)'], def: 1, interp: 'none', noReset: true },
  { id: 'recRes', label: 'Resolution', type: 'select', group: 'video', options: ['As Save Image', 'Viewer', '720p', '1080p', '1440p', '4K'], def: 0, interp: 'none', noReset: true, row: 'recA' },
  { id: 'recFps', label: 'Frame Rate', type: 'select', group: 'video', options: ['24 fps', '30 fps', '60 fps'], def: 1, interp: 'none', noReset: true, row: 'recA' },
  { id: 'recQuality', label: 'Quality', type: 'select', group: 'video', options: ['Draft', 'Good', 'High', 'Maximum'], def: 2, interp: 'none', noReset: true, row: 'recB' },
  { id: 'recFormat', label: 'Format', type: 'select', group: 'video', options: ['MP4 (H.264)', 'WebM (VP9)'], def: 0, interp: 'none', noReset: true, row: 'recB' },
  { id: 'recSamples', label: 'Samples / Frame (offline)', type: 'range', group: 'video', min: 1, max: 256, step: 1, def: 16, int: true, hardMin: 1, interp: 'none', noReset: true },

  // ── Quality & output ────────────────────────────────────────────────────
  { id: 'renderScale', label: 'Live Render Scale', type: 'range', group: 'quality', min: 0.25, max: 1, step: 0.05, def: 1, hardMin: 0.1, hardMax: 1, interp: 'none', noReset: true },
  { id: 'maxSamples', label: 'Live Max Samples', type: 'range', group: 'quality', min: 1, max: 256, step: 1, def: 64, int: true, hardMin: 1, interp: 'none', noReset: true },
  { id: 'exportSamples', label: 'Export Samples / Pixel', type: 'range', group: 'quality', min: 1, max: 512, step: 1, def: 48, int: true, hardMin: 1, interp: 'none', noReset: true },
];

// Install the formula's groups and params plus the scene. Call exactly once.
//   groups   formula groups, in order (side: 'left'); 'presets' and 'iter' included
//   params   formula params (left dock)
//   scene    { override: { id: fields }, remove: [id], after: { id: [params] } }
//            adjusts the right-dock params (e.g. a different default view, extra
//            colour-source options, or an extra colour weight after foldColW).
export function defineParams({ groups, params, scene = {} }) {
  if (PARAMS.length) throw new Error('Organon: defineParams() called twice');
  const over = scene.override || {}, drop = new Set(scene.remove || []), after = scene.after || {};
  const sceneParams = [];
  for (const p of SCENE_PARAMS) {
    if (drop.has(p.id)) continue;
    sceneParams.push(over[p.id] ? { ...p, ...over[p.id] } : p);
    if (after[p.id]) sceneParams.push(...after[p.id]);
  }
  GROUPS.push(...groups, ...SCENE_GROUPS);
  PARAMS.push(...params, ...sceneParams);
  for (const p of PARAMS) {
    if (PARAM_BY_ID.has(p.id)) throw new Error(`Organon: duplicate param id "${p.id}"`);
    PARAM_BY_ID.set(p.id, p);
  }
}

export function defaults() {
  const o = {};
  for (const p of PARAMS) o[p.id] = p.def;
  return o;
}

export function interpOf(p) {
  if (p.interp) return p.interp;
  if (p.type === 'bool' || p.type === 'select') return 'step';
  if (p.type === 'color') return 'color';
  if (p.type === 'text') return 'step';
  return 'lerp';
}

// Coerce + clamp a raw value into the param's domain. Returns undefined when the
// value is unusable (NaN, malformed colour) so callers can ignore it.
export function coerce(p, v) {
  switch (p.type) {
    case 'bool': return !!v;
    case 'select': {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return undefined;
      return Math.max(0, Math.min(p.options.length - 1, n));
    }
    case 'text': return typeof v === 'string' ? v.slice(0, 4000) : undefined;
    case 'color': {
      if (typeof v !== 'string') return undefined;
      const s = v.trim().toLowerCase();
      return /^#[0-9a-f]{6}$/.test(s) ? s : undefined;
    }
    default: {
      let n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      if (p.int) n = Math.round(n);
      if (p.hardMin !== undefined && n < p.hardMin) n = p.hardMin;
      if (p.hardMax !== undefined && n > p.hardMax) n = p.hardMax;
      return n;
    }
  }
}

// Iterations actually used: Deep Zoom can add iterations as the view closes in
// (about 1 per halving of View Distance below 5 × Add Iterations as You Zoom),
// since finer surface detail only appears after more folds.
export function effectiveIterations(v) {
  const base = v.iterations | 0;
  if (!v.deepZoom || !(v.deepIters > 0) || !(v.dist < 5)) return base;
  return Math.min(250, base + Math.round(Math.log2(5 / Math.max(v.dist, 1e-12)) * v.deepIters));
}
