# Pyxis v1.1.0

**Pyxis** (πυξίς, Greek for "box") is a 3D explorer for the **Mandelbox family**: Tom Lowe's Mandelbox, Graeme McLaren's ABox mods, the Kali box and its variants, Mandelbox Vary Scale 4D, and seven box formulas from the Fragmentarium (FragM) examples: Kali's Kalibox, Knighty's MandalayBox, DarkBeam's SurfBox, Aexion's SphereBox 4D and TetraBox, iRyanBell's PetraBox and CozyG's ABox Inverse Cylinder. It is a sibling of [Kyma](https://github.com/snicker02/Kyma) (Amazing Surf) and [Eidos](https://github.com/snicker02/Eidos) (KIFS), and is built on the shared [Organon](https://github.com/snicker02/Organon) engine.

**Live:** https://snicker02.github.io/Pyxis/

It is plain WebGL1 with ES modules: no dependencies, no build step.

## Formulas

Formulas 0–12 are line-for-line ports of Mandelbulber's `FormulaCode`; 13–19 are ports of the `DE()` of the FragM example files, each with its own loop, constant and distance rule. Changing **Box Formula** loads that formula's defaults (Mandelbulber's, or the `.frag` file's slider defaults) in one undo step.

| Pyxis | Mandelbulber formula | id |
|---|---|---|
| Mandelbox (+ optional Rotated Folds) | `fractal_mandelbox.cpp` | 8 |
| ABox Mod 1 | `fractal_abox_mod1.cpp` | 64 |
| ABox Mod 2 | `fractal_abox_mod2.cpp` | 75 |
| ABox Mod 11 | `fractal_abox_mod11.cpp` | 119 |
| ABox Mod 12 | `fractal_abox_mod12.cpp` | 123 |
| ABox Mod 13 | `fractal_abox_mod13.cpp` | 127 |
| ABox Mod 14 | `fractal_abox_mod14.cpp` | 206 |
| ABox Mod 15 | `fractal_abox_mod15.cpp` | 226 |
| Kali Box (ABox Mod Kali) | `fractal_abox_mod_kali.cpp` | 60 |
| ABox Mod Kali V2 | `fractal_abox_mod_kali_v2.cpp` | 135 |
| ABox Mod Kali V3 | `fractal_abox_mod_kali_v3.cpp` | 136 |
| ABox Mod Kali-Eiffie | `fractal_abox_mod_kali_eiffie.cpp` | 87 |
| Mandelbox Vary Scale 4D | `fractal_mandelbox_vary_scale4d.cpp` | 18 |

| Pyxis | Fragmentarium (FragM examples) file | Author |
|---|---|---|
| Kalibox | `Kali's Creations/Kalibox.frag` | Kali (Rrrola's DE) |
| MandalayBox (+ Pseudo) | `Knighty Collection/MandalayBox.frag`, `Pseudo-MandalayBox.frag` | Knighty, after DarkBeam's fold |
| SurfBox | `mclarekin/darkbeam_surfbox.frag` | DarkBeam, ported by mclarekin |
| SphereBox 4D | `mclarekin/AexionnSphereBoxRot4D.frag` | Aexion, updated by mclarekin |
| TetraBox | `mclarekin/Aexions_TetraBox2.frag` | Aexion |
| PetraBox | `3DickUlus/PetraBox.frag` | iRyanBell, for FragM by 3Dickulus |
| ABox Inverse Cylinder | `mclarekin/abox inCyl-10.frag` | CozyG |

The other box frags in the FragM examples are covered by formulas above: CozyG / mclarekin's `aboxMinR2Bias`, `aboxMinR2Cuboid` and `mboxR2` became Mandelbulber's ABox Mod 12 (biased / cuboid sphere fold), `aboxMod14a` is ABox Mod 14, `Historical 3D Fractals/Mandelbox.frag` is the Mandelbox, and `KboxExpSmooth.frag` is the Kalibox with a different colouring.

Controls show only for the formulas that use them. They cover:

- box fold limits and values
- the sphere fold (min / fixed R², offsets, r power)
- scale and scale vary
- the main and per-fold rotations
- cylinder / smooth / cuboid folds, biased sphere
- inverted c, pre-offsets, additions
- the 4D w axis and its rotation
- Julia mode and c multipliers

The formula is drawn in Mandelbulber's own frame (Z up), stood upright by the default object rotation, so imported cameras land where they did in Mandelbulber.

## Mandelbulber import

**Import Mandelbulber Settings** reads a `.fract` file that uses one of the formulas above: camera, lights, colouring, fog, and the formula itself. Hybrids of more than one formula are refused. Anything Pyxis can't reproduce is listed in the import notes, e.g. "Not supported: …". Older files with decimal commas are handled.

## Validation

The CPU distance estimator (`formula/de.js`) mirrors the GLSL exactly. It is checked against Mandelbulber's actual C++ `FormulaCode`: random Mandelbulber parameter sets for every formula, run through both Mandelbulber and Pyxis's importer + DE.

- The committed fixture `tests/fixtures/mbref.json` holds 15 cases × 12 points per formula. All 13 formulas match it to 1e-6.
- `tools/mbref-compare.mjs` reruns the comparison at any size; see [tools/README.md](tools/README.md). The C++ harness is GPL Mandelbulber code and is not part of this repo.

The Fragmentarium formulas are checked against the original `.frag` code itself. `tools/fragm-compare.mjs` compiles each file's own `DE()` on the GPU (uniforms set from random parameter sets) next to Pyxis's shader and CPU port:

- Pyxis's shader vs the original, same GPU: 99.3 % of 1,812 points within 1e-3 (relative); the rest are MandalayBox points where float32 rounding is amplified through its folds (worst 0.6 %).
- Pyxis's CPU port (double precision) vs the original: every fixture point within 1e-3 (absolute, relative above 1), which `tests/run.mjs` checks from `tests/fixtures/fragmref.json`; by the strict relative measure 98.8 % (MandalayBox 95 %).
- SurfBox and Inverse Cylinder end their original `DE()` without a `return` for points that never bail out (undefined in GLSL; the GPU gave 0). Pyxis returns r / |dr| there, Mandelbulber's rule; both mean "inside".

```bash
node tests/run.mjs
```

This runs:

- the parameter schema and gates
- the per-formula defaults
- CPU DE vs Mandelbulber
- every shader program compiled with `glslangValidator`, if installed
- every preset
- CPU DE vs the original Fragmentarium code
- every bundled `.fract` import
- discovery / project / Evolve / Rebirth round trips

## Presets

The presets are 26 Pyxis originals (one or more per formula), 12 scenes rebuilt from the `#preset` blocks of the FragM example files (their camera and formula values; credited per preset), and 14 scenes from the CC-BY 4.0 collections that ship with Mandelbulber:

- Krzysztof Marczak
- Graeme McLaren
- Robert Pancoast

Each is credited in the menu and in [presets/mandelbulber/README.md](presets/mandelbulber/README.md). Presets are generated by `node tools/build-scenes.mjs` from `tools/scenes-list.json`.

## Everything else

The engine provides the rest; see [Organon's README](https://github.com/snicker02/Organon#readme):

- surface, path traced and volumetric rendering
- Deep Zoom
- three lights, HDR environments, ground, materials and textures
- repetition
- Evolve / Rebirth / mutation grid
- the keyframe sequencer
- PNG, WebM and MP4 export
- project files and `PYXIS1:` discovery strings
- the phone layout with docked view and tabs

## Run

```bash
git clone --recurse-submodules https://github.com/snicker02/Pyxis.git
cd Pyxis
python3 -m http.server 8000   # any static server; ES modules need http://, not file://
```

If you cloned without `--recurse-submodules`, run `git submodule update --init`.

## Files

```
index.html            page shell (Organon template + Pyxis branding)
main.js               import './formula/index.js'; import './core/app.js';
formula/
  index.js            the formula object handed to Organon
  params.js           controls, groups, per-formula gating
  glsl.js             mapLocal() — the 20 formulas in GLSL
  uniforms.js         parameter → uniform mapping, rotation matrices
  de.js               double-precision CPU port of mapLocal()
  fragm.js            CPU port of the Fragmentarium formulas (13–19)
  mbimport.js         Mandelbulber .fract → Pyxis mapping
  presets.js          per-formula defaults, descriptions, Rebirth
  scenes.js           preset scenes (generated)
  ui.js               formula description + "Load Formula Defaults"
presets/mandelbulber/ the CC-BY .fract files the Mandelbulber presets come from
tests/                run.mjs, lib.mjs, fixtures/mbref.json, fixtures/fragmref.json
tools/                build-scenes.mjs, scenes-list.json, mbref-compare.mjs, fragm-compare.mjs, fragm-presets.mjs
core/                 → Organon (git submodule)
```

## Changelog

### 1.1.0
- Seven formulas from the Fragmentarium (FragM) examples: Kalibox, MandalayBox / Pseudo-MandalayBox, SurfBox, SphereBox 4D, TetraBox, PetraBox, ABox Inverse Cylinder — checked against the original `.frag` code.
- 20 new presets (8 originals, 12 from the FragM files' own presets); 52 in all.
- `core/` is now the Organon git submodule (as in Kyma and Eidos) instead of a copy.

### 1.0.0
- First release:
  - 13 Mandelbox-family formulas, verified against Mandelbulber's C++
  - Mandelbulber import
  - 32 presets
  - Organon v1.0.0 engine

## Credits

- Mandelbox by Tom Lowe.
- ABox mods by Graeme McLaren.
- Kali box and Kalibox by Kali; the Kali-Eiffie variant after Eiffie.
- MandalayBox by Knighty, with DarkBeam's fold; SurfBox by DarkBeam; SphereBox and TetraBox by Aexion; PetraBox by iRyanBell; ABox Inverse Cylinder by CozyG; Fragmentarium ports by mclarekin and 3Dickulus. Code from the [FragM](https://github.com/3Dickulus/FragM) examples ([Fragmentarium_Examples_Folder](https://github.com/3Dickulus/Fragmentarium_Examples_Folder)).
- Formula code ported from [Mandelbulber](https://github.com/buddhi1980/mandelbulber2) (Krzysztof Marczak and contributors).
- Preset scenes from the Mandelbulber example collections of Krzysztof Marczak, Graeme McLaren and Robert Pancoast, used under CC-BY 4.0.

---

Created with help from Claude AI.
