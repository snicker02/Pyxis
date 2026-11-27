// The formula registry: the one seam between Organon and an app.
//
// An app (Kyma, Eidos, …) is one formula module plus this engine. Its entry
// point installs the formula, then loads the app shell:
//
//   import formula from './formula/index.js';   // defines the params, builds presets
//   import { installFormula } from './core/engine/formula.js';
//   installFormula(formula);
//   await import('./core/app.js');
//
// Engine modules read the formula through `F` (a live binding), only inside
// functions, never at module load. See README.md for the full contract.

export let F = null;

const REQUIRED = ['id', 'name', 'version', 'glsl', 'uniforms', 'spec', 'specKey', 'defaultSpec', 'localDE', 'presets'];

export function installFormula(formula) {
  for (const k of REQUIRED) if (formula[k] === undefined) throw new Error(`Organon: formula is missing "${k}"`);
  for (const k of ['uniforms', 'source', 'defines']) if (formula.glsl[k] === undefined) throw new Error(`Organon: formula.glsl is missing "${k}"`);
  F = formula;
  return formula;
}

// Branding with defaults derived from the formula id / name.
export const brand = () => ({
  storagePrefix: F.id,               // localStorage keys: <prefix>.docks, <prefix>.mtab
  filePrefix: F.id,                  // download names: <prefix>-1920x1080-….png
  globalName: `__${F.id}`,           // window.<globalName> test / debug hook
  discoveryPrefix: `${F.id.toUpperCase()}1:`,
  projectApp: F.id,
  ...(F.brand || {}),
});
