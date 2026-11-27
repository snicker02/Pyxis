# Pyxis dev tools

## build-scenes.mjs

```bash
node tools/build-scenes.mjs                    # rewrite formula/scenes.js from tools/scenes-list.json
node tools/build-scenes.mjs --scan a.fract …   # what the importer makes of some files (JSON)
```

`scenes-list.json` holds:

- the menu groups
- a shared `look`
- **originals**: a formula `variant` plus overrides on that formula's defaults
- **fract** scenes: a file in `presets/mandelbulber/`, imported with the app's own importer

Every scene stores its camera, light and look in full, and formula values only where they differ from the defaults. Picking a preset resets all formula controls, so nothing leaks from the previous scene.

## mbref-compare.mjs — checking against Mandelbulber

```bash
node tools/mbref-compare.mjs <path/to/mbref> [cases-per-formula] [--write tests/fixtures/mbref.json]
```

For each formula, this tool:

1. generates random Mandelbulber parameter sets;
2. evaluates them with Mandelbulber's C++ (`mbref`) and with Pyxis's importer + `localDE`;
3. compares the distances at 12 points per case.

`--write` saves the cases and Mandelbulber's results as the fixture `tests/run.mjs` checks, so the test suite itself needs no C++.

`mbref` is **not in this repo**: it is built from Mandelbulber's GPL sources. To rebuild it:

1. Sparse-clone `mandelbulber2` and take from `mandelbulber2/src/`:
   - `algebra.hpp`, `algebra_impl.cpp`, `fractal.h`, `fractal_enums.h`, `math_utilities.h`
   - the 13 `fractal_*.cpp` files listed in the main README
2. Write a small `mbref.cpp` that reads a line protocol on stdin:

   ```
   CASE <formulaId> <maxiter> <bailout> <addc> <julia> jx jy jz cmx cmy cmz w0
   SET <name> v0 [v1 v2 v3]
   P x y z        → prints "d r iters"
   END
   ```

   - `CASE` fills an `sFractal` with Mandelbulber's defaults (generated from `src/initparameters.cpp`); `SET` overrides one value.
   - It reproduces `compute_fractal.cpp`'s loop:
     - `aux.DE = 1`, `aux.actualScale = mandelbox.scale`
     - after `FormulaCode`, add c (Julia constant × constant multiplier) when `addc` is set; the caller inverts this for formulas 206, 136 and 87
     - bail out on the 4D length
     - DE = r / |DE|
3. Build it with `g++ -O2 -std=c++17 mbref.cpp algebra_impl.cpp fractal_*.cpp -o mbref`. Stub the few Qt and `sFractal` helpers the formula files include.

Last full run (150 cases per formula, 23,400 points): 99.18 % bit-identical, 100 % within 1e-6. The remainder is floating-point rounding where the two code paths order operations differently.

## fragm-compare.mjs — checking against Fragmentarium

```bash
npm i --no-save playwright
node tools/fragm-compare.mjs <FragM Examples dir> [cases-per-formula] [--write tests/fixtures/fragmref.json]
```

`<FragM Examples dir>` is a clone of [Fragmentarium_Examples_Folder](https://github.com/3Dickulus/Fragmentarium_Examples_Folder) with the `mclarekin` and `3DickUlus` submodules checked out. For each Fragmentarium formula and random parameter set, the tool compiles the **original** `.frag` `DE()` (its uniforms turned into constants) and Pyxis's own shader on the same GPU (headless Chrome, WebGL2), runs Pyxis's CPU port too, and reports how often they agree. `--write` saves the original's distances for `tests/run.mjs`. The `.frag` files are read at run time and never copied into Pyxis.

Last run (15 cases per formula, 16 points each): Pyxis's shader within 1e-3 of the original for 99.3 % of points (all of Kalibox, SurfBox, SphereBox, TetraBox, PetraBox and Inverse Cylinder; 96–98 % of MandalayBox, where float32 rounding grows through the folds); the CPU port within 1e-3 (absolute, relative above 1) for every point, 98.8 % by the strict relative measure.

## fragm-presets.mjs

```bash
node tools/fragm-presets.mjs <FragM Examples dir> > presets.json
```

Converts the `#preset` blocks of those `.frag` files into Pyxis values: formula parameters, and the camera (`Eye` / `Target` / `Up` / `FOV`, in the formula's frame like the Mandelbulber import). The chosen ones are in `scenes-list.json` with the `fragm` group.
