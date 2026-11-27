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
