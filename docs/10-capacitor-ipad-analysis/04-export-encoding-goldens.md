# 04 — Export encoding & the byte-identity gates

**Wave:** W1 · **Depends on:** none
**Touches:** `docs/10-capacitor-ipad-analysis/findings/04-export-encoding.md` (new)
**Effort:** S

## Objective
The owner can make an informed decision on G-14: a findings doc laying out every viable
way to produce the export artifacts (`textures/*.png`, `frames.json`, `frames.json.gz`,
generated `index.ts`) in a browser, exactly what each option does to the byte-identity
golden gates and the frozen `server/exports/lib/` contract, and one argued
recommendation. Written to `findings/04-export-encoding.md`.

## Context
Facts to verify and build on (MASTER §4, G-01, G-06, G-14):
- sharp's entire role is `raster.ts:79-93`: raw RGBA buffer → palettized PNG
  (`compressionLevel: 9, palette: true, quality: 100, effort: 10`) → file. No other
  image work exists server-side.
- Texture filenames hash the **raw RGBA** (`raster.ts:29`), so encoder choice changes
  PNG bytes only — `frames.json` contents and texture names are encoder-independent.
- The golden suite `server/src/__tests__/export-golden.test.ts` (322 lines)
  byte-compares outputs; a sharp 0.33.5→0.35.3 bump alone changed 214/232 PNGs
  (identical decoded pixels). Read the suite: record precisely which files it pins
  byte-wise vs structurally.
- `frames.json.gz` is gzip level 9 via node:zlib (`export/write.ts:35`) and is part of
  the published artifact; `CompressionStream` can't promise those bytes (G-06).
- `server/exports/lib/` is a verbatim copy of `client/lib/` consumed by external game
  code (OPEN-QUESTIONS Q33) — but it is *copied source*, not encoded, so establish
  whether any option threatens it at all (likely no; say so with evidence).
- Decoded-pixel identity is testable: the repo already decodes PNGs in tests — check
  how the golden suite does comparisons before proposing a new equality gate.

Candidate encoders to evaluate (add better ones if found): pure-JS (`fast-png`,
`UPNG.js` — note palette support and maintenance status), `wasm-vips` (same libvips —
the only route with a real shot at byte-matching sharp; check bundle size and version
alignment with libvips 8.15.3), `canvas.toBlob("image/png")` (zero deps, zero control,
per-browser bytes). For gzip: `pako` deflate level 9 vs node zlib — likely-but-unproven
byte match, frame it as a measurement the implementation plan must make (you cannot run
browser code here; a Bun-side comparison of pako vs node:zlib on `frames.json` IS
runnable in the scratchpad without touching the repo — do it if cheap, it converts a
guess into a measurement).

## Steps
1. Read `raster.ts`, `write.ts`, `export/index.ts`, and the golden test suite; verify
   every claim above with line refs. List exactly which artifacts are byte-pinned.
2. Evaluate the encoder options: palette-PNG support, output size vs sharp's (the
   published textures are 118–752 B each — size regressions matter to the external
   consumer), speed at 264-files scale, bundle weight, maintenance, exact pinnable
   version.
3. Evaluate gzip options incl. the optional pako-vs-zlib scratchpad measurement.
4. Lay out the G-14 decision space as concrete options with consequences, e.g.:
   (a) export stays server-only (local mode: no export, or export-via-remote);
   (b) dual encoders + re-baseline goldens to decoded-pixel equality;
   (c) dual encoders + per-target golden sets;
   (d) wasm-vips everywhere aiming for one encoder... for each: what breaks, what the
   owner must sign off, ongoing cost.
5. Write `findings/04-export-encoding.md` per MASTER D5; gaps G-401….

## Constraints
- Findings file only; any measurement script lives in the scratchpad, never the repo.
  Reading `server/exports/base-unit/frames.json` for the pako comparison is fine
  (read-only); **never write under `server/`**.
- Do not decide G-14 — it is a PRODUCT-DECISION; your Recommendation says which option
  you'd argue for and why, clearly labeled as pending owner sign-off.
- Version claims about npm packages: cite registry/repo with dates (D9).

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/findings/04-export-encoding.md
grep -q '^## Options' docs/10-capacitor-ipad-analysis/findings/04-export-encoding.md
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
```
Manual: the "which artifacts are byte-pinned" list is traceable to specific golden-test
lines; every option in the decision space states its golden-gate consequence.

## Definition of done
- [ ] Byte-pinned artifact inventory with test-line citations
- [ ] ≥3 encoder options + gzip options evaluated with pinnable versions
- [ ] G-14 decision space written for DECISIONS-NEEDED.md consumption
- [ ] pako-vs-zlib either measured (scratchpad) or explicitly gapped
- [ ] Tree clean outside this folder
