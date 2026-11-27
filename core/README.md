# Organon v1.0.0

**Organon** (ὄργανον, Greek for "instrument") is the shared engine behind Brad's 3D fractal explorers: [Kyma](https://github.com/snicker02/Kyma) (Amazing Surf) and [Eidos](https://github.com/snicker02/Eidos) (Kaleidoscopic IFS). It is a progressive WebGL1 raymarcher plus the app shell around it. It has no dependencies and no build step.

Organon handles everything that doesn't depend on the formula:

- Rendering: surface, path traced and volumetric modes, progressive accumulation and tiled export.
- Scene: camera, Deep Zoom, lighting with three lights, environment / HDR panoramas, ground plane, materials and textures, repetition / arrays, and the object transform.
- UI: docked panels, mobile tabs, per-input reset-to-default, Evolve / Rebirth / mutation grid, and undo / redo.
- Animation and export: the keyframe sequencer, PNG and PNG frames, WebM **and** MP4 video, project files and discovery links.
- Mandelbulber `.fract` import for everything except the formula itself.

An app is **one formula module** plus this engine, added as a git submodule at `core/`.

## Using it in an app

```
MyApp/
  index.html        links core/css/style.css and main.js (copy template/index.html)
  main.js           import './formula/index.js'; import './core/app.js';
  formula/          the formula module (copy template/formula/ to start)
  tests/
  core/             ← git submodule → github.com/snicker02/Organon
```

```bash
# once, in the app repo
git submodule add https://github.com/snicker02/Organon.git core
git commit -m "Use Organon engine as submodule"

# cloning an app
git clone --recurse-submodules https://github.com/snicker02/Kyma.git
#   (already cloned without it?  git submodule update --init)

# moving an app to a newer engine (do it on a PR branch)
git submodule update --remote core
git commit -am "Bump Organon to v1.1.0"
```

GitHub Pages builds public submodules, as long as `.gitmodules` uses an `https://` URL. Each app is pinned to an exact engine commit, so a change to Organon never reaches a live app until that app bumps the submodule.

Run an app locally with `python3 -m http.server 8000` from the app's root. ES modules don't load from `file://`.

## The formula contract

`formula/index.js` builds a formula object and passes it to `installFormula()` (from `engine/formula.js`). Its `params.js` calls `defineParams()` when the module loads, and every engine module reads the formula through the live binding `F`. Engine modules only read `F` inside functions, never at load time, so the import order is just:

```js
import './formula/index.js'; // defineParams() + installFormula()
import './core/app.js';      // the app shell
```

### Parameters (`engine/params.js`)

```js
defineParams({
  groups: [{ id: 'presets', side: 'left', title: 'Presets', accent: true, open: true }, …, { id: 'iter', … }],
  params: [ …formula params…, ...marchParams() ],
  scene: { override: { rotX: { def: 0.6 } }, after: { foldColW: [ …extra colour weight… ] }, remove: [] },
});
```

- The formula owns the **left** dock. It must include a `presets` group (the preset menu and importer go there) and an `iter` group. `marchParams(overrides)` gives the shared ray-march controls: Max Ray Steps, Surface Detail, Step Factor, Max Step, Max Distance, stranded rays and Debug View.
- Organon owns the **right** dock (`SCENE_GROUPS` / `SCENE_PARAMS`). `scene.override` changes fields of right-dock params (a default view, extra colour-source options, labels). `scene.after` inserts params after a given id, and `scene.remove` drops params.
- The field reference (`type`, `gate` / `gateEq`, `row`, `section`, `fine`, `interp`, `mutate` …) is at the top of `engine/params.js`.

### The formula object

| Key | What it is |
|---|---|
| `id`, `name`, `version` | e.g. `'kyma'`, `'Kyma'`, `'2.22.0'`. `id` is the default for storage keys and download names. |
| `brand` | Optional overrides: `storagePrefix`, `filePrefix`, `globalName` (the `window.<name>` test hook), `discoveryPrefix` (default `<ID>1:`), `projectApp`, `legacyDockKey`. |
| `glsl.uniforms` | GLSL uniform declarations for the formula. |
| `glsl.source(spec)` | GLSL helpers plus **`float mapLocal(vec3 p, out float trap)`**: the distance in the fractal's own frame, with `trap` = orbit trap (min \|z\|²) or the colour index. |
| `glsl.defines(spec)` | `#define` lines that specialise the program (e.g. `#define SURF_VARIANT 3\n`). |
| `uniforms(v, scaleOverride)` | Formula uniform values from the state `v`, plus `__f`: the raw data its program spec is built from. `scaleOverride` carries the Scale Pulse. |
| `spec(raw)` | The canonical program spec from `__f`. Normalise away anything the program doesn't use, so it doesn't multiply the number of compiled programs. |
| `specKey(spec)` | A unique string per compiled program. |
| `defaultSpec` | The program compiled synchronously at start-up, for an immediate first paint. |
| `localDE(v, scaleOverride)` | The CPU port of `mapLocal`: `p → { d, trap }`. Organon adds the object transform, repetition and marching (`engine/de.js`). It is used for autofocus, Rebirth, Auto-fix Cut-offs and Auto Shell. |
| `presets` | `{ key: { label, group?, v: { …values } } }`. |
| `presetGroups` | `[[menu label, key => bool], …]`. |
| `presetReset` | Optional regex of extra param ids that are reset to defaults when a preset is applied, unless the preset sets them. |
| `firstPreset` | Optional preset key to open on a first visit (one without a shared link). |
| `rebirth` | `{ candidate(current) → values, target: { hit, lo, hi } }`. Organon scores each candidate for visibility. |
| `migrateLegacy(obj)` | Optional: maps renamed params from older links and projects. |
| `importFract({ S, m, notes })` | Optional Mandelbulber import of the formula's own parameters. It returns `{ ok: true, formula, params }` or `{ ok: false, error }`. `S` is the parsed file and `m` = `S.main_parameters`. Helpers `num`, `vec`, `bool`, `nums`, `fractalAnglesFor` and `mbRotation2` come from `engine/mbimport.js`. Organon then does iterations, camera, transform, light, background, materials and ground. |
| `importTitle` | Tooltip for the import button. |
| `setupUI(ctx)` | Optional: extra panel UI (descriptions, helper buttons). `ctx = { state, panel, el, toast, pushHistory, pushSnapshot }`. |
| `shaderFallback` | `{ message, values() }`: what to switch to if this GPU can't build a program. |

### What `mapLocal()` can use and must set

The shader is assembled as follows: defines → render-mode uniforms → `glsl.uniforms` → camera / shading / environment / colour / light uniforms → core globals → `glsl.source(spec)` → the shared tail (object transform, repetition, `map()`, normals, AO, shadows, ground, materials and the three render mains). See the comment at the top of `engine/glsl.js`.

- Uniforms: everything in `sceneUniforms()` (`engine/renderer.js`), including `u_colorSource`, `u_foldColW` and `u_colorIters`.
- Globals to write: `g_boxCol` / `g_sphCol` (fold counts for colour and the material "Fold Count" key) and `g_colOn`. Under `#ifdef HAS_MAT`, also the texture probe `g_texProbe`, `g_texDone`, `g_texZ` and `g_orbit` (see Kyma's or Eidos's `mapLocal` for the pattern).
- The distance estimate must be conservative. If it can overshoot, say so in the UI and lower Step Factor.

## Template

`template/` is a minimal working app: a plain Mandelbox (box fold, sphere fold, scale, Julia). Copy it to start a new formula app. It shows the whole contract in about 250 lines.

## Tests

```
node tests/run.mjs        # engine logic + the template formula (shader assembly, glslangValidator if installed)
```

Each app also has its own suite (`tests/run.mjs`, and `tests/browser.mjs` with Playwright + Chrome), which tests the formula on the engine it pins.

## Versions

Organon uses semantic versioning. A minor version adds to the contract and a major version changes it. `ENGINE_VERSION` is in `app.js`, and the app's version badge tooltip shows both.

- **1.0.0** (Nov 2026): extracted from Kyma 2.21.0 and Eidos 1.3.0. Kyma and Eidos render pixel-identical images on it.

Created with help from Claude AI.
