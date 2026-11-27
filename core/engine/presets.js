// Evolve / Rebirth, the discovery-string codec and project files. The
// presets themselves (formula.presets) and Rebirth's random geometry
// (formula.rebirth) come from the formula.

import { PARAMS, PARAM_BY_ID, defaults, coerce } from './params.js';
import { viewScore } from './de.js';
import { F, brand } from './formula.js';

export const r = (a, b) => a + Math.random() * (b - a);
export const ri = n => Math.floor(Math.random() * n);
export const pick = a => a[ri(a.length)];
export const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Is a control live for the current values? Its own gate open, and its gate's
// control live too (visibility cascades exactly as in the panel).
export function isActive(p, values) {
  if (!p.gate) return true;
  const g = values[p.gate];
  const open = p.gateEq === undefined ? !!g : Array.isArray(p.gateEq) ? p.gateEq.includes(g) : g === p.gateEq;
  return open && isActive(PARAM_BY_ID.get(p.gate), values);
}

// Small mutation of 3–5 live geometric params (~6% of each slider span).
export function evolve(values, strength = 0.06, { exclude = [] } = {}) {
  // Only parameters that currently do something, and always at least one real
  // change (picking hidden params or rounding back to the same value does nothing).
  const pool = PARAMS.filter(p => p.mutate && isActive(p, values) && !exclude.includes(p.id));
  const out = {};
  const count = 3 + ri(3);
  for (let tries = 0; Object.keys(out).length < count && tries < 40; tries++) {
    const p = pool[ri(pool.length)];
    if (!p || p.id in out) continue;
    const span = p.max - p.min;
    let nv = values[p.id] + gauss() * span * strength;
    nv = coerce(p, Math.max(p.min, Math.min(p.max, nv)));
    if (nv !== values[p.id]) out[p.id] = nv;
  }
  return out;
}

// Fresh random geometry, validated on the CPU so you don't land inside the
// fractal or stare at empty space. Returns { values, score, tries }.
// formula.rebirth = { candidate(current) → values, target: { hit, lo, hi } }:
// fitness peaks at hit-fraction `hit`; a candidate in [lo, hi] (camera clear,
// no wall in the face) is taken at once.
export function rebirth(current, tries = 24) {
  const { candidate, target = { hit: 0.6, lo: 0.3, hi: 0.92 } } = F.rebirth;
  let best = null;
  for (let t = 0; t < tries; t++) {
    const g = candidate(current);
    const cand = { ...current, ...g };
    const s = viewScore(cand, 5);
    // Want: camera outside the surface, a healthy mix of hit and sky, not a wall in the face.
    const fitness = (s.clearance > 0.02 ? 1 : 0) * (1 - Math.abs(s.hitFrac - target.hit)) * (1 - s.nearFrac);
    if (!best || fitness > best.fitness) best = { values: g, fitness, score: s, tries: t + 1 };
    if (s.clearance > 0.02 && s.hitFrac >= target.lo && s.hitFrac <= target.hi && s.nearFrac < 0.2) break;
  }
  return best;
}

// ── Discovery string ───────────────────────────────────────────────────────
// <PREFIX><base64url(JSON of non-default values)>, PREFIX = brand().discoveryPrefix

const b64urlEncode = str => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const round = x => (typeof x === 'number' ? Number(x.toPrecision(7)) : x);

export function encodeDiscovery(values) {
  const d = defaults();
  const o = {};
  for (const p of PARAMS) {
    const v = values[p.id];
    if (v !== d[p.id]) o[p.id] = round(v);
  }
  return brand().discoveryPrefix + b64urlEncode(JSON.stringify(o));
}

// Renamed parameters from older versions: formula.migrateLegacy(obj) → obj.
// Unknown keys pass through (and are then ignored).
export function migrateLegacy(obj) { return F.migrateLegacy ? F.migrateLegacy(obj) : obj; }

// Returns a full, validated value set (defaults filled in) or throws.
export function decodeDiscovery(str) {
  str = String(str).trim();
  let obj;
  const prefix = brand().discoveryPrefix;
  if (str.startsWith(prefix)) obj = JSON.parse(b64urlDecode(str.slice(prefix.length)));
  else if (str.startsWith('{')) {
    const j = JSON.parse(str);
    obj = j.params ?? j; // also accept a project file pasted in
  } else throw new Error('Not a discovery string');
  if (!obj || typeof obj !== 'object') throw new Error('Malformed discovery string');
  obj = migrateLegacy(obj);
  const out = defaults();
  for (const id in obj) {
    const p = PARAM_BY_ID.get(id);
    if (!p) continue;
    const v = coerce(p, obj[id]);
    if (v !== undefined) out[id] = v;
  }
  return out;
}

export const PROJECT_VERSION = 2;

export function makeProject(values, keys) {
  return { app: brand().projectApp, version: PROJECT_VERSION, params: { ...values }, keyframes: keys };
}

export function parseProject(text) {
  const j = JSON.parse(text);
  if (!j || typeof j !== 'object') throw new Error('Not a project file');
  const params = decodeDiscovery(JSON.stringify(j.params ?? {}));
  return { params, keyframes: Array.isArray(j.keyframes) ? j.keyframes.map(migrateLegacy) : [] };
}
