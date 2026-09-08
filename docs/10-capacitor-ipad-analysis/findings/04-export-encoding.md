# 04 — Export encoding & the byte-identity gates

**Task:** 04 · **Wave:** W1 · **Date:** 2026-09-06
**Scope:** every viable way to produce the export artifacts (`textures/*.png`,
`frames.json`, `frames.json.gz`, generated `index.ts`) in a browser; what each option
does to the byte-identity golden gates and the frozen `server/exports/lib/` contract.

All scratchpad measurements in this document were run on this machine on 2026-09-06
under Bun 1.3.5 (the runtime the server actually runs under), against the live
`server/exports/base-unit/` output (read-only). All external citations were checked
2026-09-06.

---

## Facts

### F1 — sharp's entire role is one function, and its options are load-bearing

- `server/src/export/raster.ts:79-93` — `writePng()`: raw RGBA buffer →
  `sharp(...).png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
  .toFile(outPath)`. No other image work exists server-side (no resize, composite, or
  decode anywhere in `server/src/`).
- sharp is pinned at 0.33.5 (`server/package.json:20`) with an explicit warning that
  the options "must not be touched" and that a 0.33.5 → 0.35.3 bump alone changed
  **214 of 232 PNGs with bit-identical decoded pixels** (`raster.ts:12-16`; the
  referenced OPEN-QUESTIONS.md no longer exists in the tree — it left with the
  `REFRESH/` folder — so the code comment is now the only surviving record of that
  W2b measurement).
- Measured: all 264 published `base-unit` textures are **colour type 3 (palette)**
  PNGs (IHDR byte 25 scanned across every file), sizes 117–767 B, total 63,333 B,
  mean 239 B.

### F2 — texture filenames hash the *raw RGBA*, not the PNG

`raster.ts:29-31` — `bufferHash()` = sha256 of the raw RGBA buffer, first 12 hex
chars. Browser `crypto.subtle.digest("SHA-256", …)` produces the same digest for the
same bytes. Therefore **encoder choice changes PNG bytes only**: texture filenames,
every path recorded in `frames.json`, and the `frames.json` contents itself are
encoder-independent.

### F3 — what the "golden suite" actually is (correction to the task/MASTER framing)

`server/src/__tests__/export-golden.test.ts` (322 lines) does **not** byte-compare any
export output. It is a characterisation suite over the pure functions that *shape*
the output:

- `toKebabCase` — export folder name (lines 25-65)
- `toPascalCase` — generated class-name stem (lines 67-88)
- `resolveVariantOffset` — 4-level fallback (lines 97-155)
- `applyMaxCanvas` — incl. the negative-zero pin: `offset: {x:-0, y:-0}` in memory,
  and the byte-relevant assertion `JSON.stringify(...) === '{"x":0,"y":0}'`
  (lines 198-285, the `-0` pin at 209-222)
- `isValidProjectName` (lines 290-322)

The file's own header (lines 4-8) says it pins observed behaviour because the output
"is covered by a byte-identity gate" — but **no automated byte-comparison exists
anywhere in the repo**. The byte gate is *procedural*: code comments instruct
"Re-export and `diff -r` against goldens after any change here"
(`server/src/export/index.ts:9-12`), and the "goldens" are the previous export in the
gitignored `server/exports/` tree. Grep evidence: the only "golden"/byte-identity
references in `server/src/` are comments in `codegen.ts:8`, `export/index.ts:9-12,41`
and the test header — none executable. See G-407.

Also contrary to the task brief ("the repo already decodes PNGs in tests"): no server
test decodes a PNG. The only image-decoding tests are client DOM tests using canvas
(`client/src/utils/__tests__/imageEncoding.dom.test.ts:5,32`). A decoded-pixel
equality gate would be new code — cheap, because sharp itself decodes
(`sharp(png).raw().toBuffer()`) and is already a server dependency.

### F4 — byte-pinned artifact inventory

| Artifact | How its bytes are fixed today | Enforcement | Browser-portable byte-identically? |
|---|---|---|---|
| `textures/*.png` (264 files) | sharp 0.33.5 + frozen options (`raster.ts:85-92`); pinned dep (`server/package.json:20`) | Manual `diff -r` procedure only (`export/index.ts:11-12`); characterisation tests pin the *pixels in*, not the bytes out | **No** — the fragile case; see Options |
| `frames.json` | `JSON.stringify` of a deterministically-ordered structure (`export/index.ts:96-98`; ordering warning at 77-79); `-0`→`"0"` pinned at `export-golden.test.ts:221` | `export-golden.test.ts` pins the shaping functions; string-table order fixed by traversal order | **Yes** — `JSON.stringify` output for the same data is engine-independent (spec-defined key order + shortest-round-trip number formatting) |
| `frames.json.gz` | `createGzip({ level: 9 })` (`write.ts:33-37`); "part of the published artefact" (`write.ts:6-8`) | None automated | **No** — and it is already runtime-coupled, see F5 |
| generated `index.ts` | Pure template-literal codegen, zero Node imports (`codegen.ts:6-14, 27+`) | "Do not let a formatter touch it" (`codegen.ts:10`) | **Yes** — pure string building, byte-identical anywhere |
| `exports/lib/` | Verbatim recursive `cp` of `client/lib/` (`write.ts:50-58`) — source is `client/lib/parse-pixel-project.ts` + `client/lib/versions/v1.ts` | Comment + Q33 policy | **Yes** — it is *copied source, not encoded output*. No encoder option touches it. The only way a port threatens it is by bundling/transforming instead of byte-copying; any VFS "copy file" primitive preserves it. **No option below threatens this contract.** |

So of the four generated artifact classes, two (`frames.json`, `index.ts`) are
byte-identical cross-platform for free, and filenames survive everywhere (F2). The
entire G-14 problem is **PNG bytes and gzip bytes**.

### F5 — measured: the `frames.json.gz` bytes belong to Bun's zlib, not to "zlib" in general

Scratchpad measurement (`compare.ts`, Bun 1.3.5) against
`server/exports/base-unit/frames.json` (72,893 B) and `frames.json.gz` (12,956 B):

```
on-disk vs Bun gzipSync(9): IDENTICAL (12,956 B, incl. header OS byte 0x13)
on-disk vs pako 2.1.0 gzip(9): DIFFER (13,126 B; DEFLATE bodies diverge at byte 1)
fflate 0.8.2 gzip(9, mtime 0): DIFFER (14,990 B)
all three round-trip to byte-identical JSON
```

- The published `.gz` is byte-identical to what Bun's `node:zlib` emits at level 9.
  Bun's `process.versions.zlib` is `886098f3f339617b4243b286f5ed364b9989e245`, a
  commit in **cloudflare/zlib** (verified via
  `api.github.com/repos/cloudflare/zlib/commits/886098f3…`, checked 2026-09-06) —
  Bun vendors Cloudflare's performance fork, whose gzip header OS byte (0x13) and
  DEFLATE stream differ from stock madler zlib.
- Consequence: **the `.gz` bytes are already a property of the Bun runtime**, not of
  the code. Running today's unmodified server under Node would already emit different
  `frames.json.gz` bytes. No browser-side library reproduces Cloudflare-zlib output:
  pako (a stock-zlib port) and fflate both measurably differ, and
  `CompressionStream` takes only a format argument — `new CompressionStream(format)`,
  no level parameter (WHATWG Compression spec, https://compression.spec.whatwg.org/,
  checked 2026-09-06) — and emits whatever the browser's own zlib produces.
- The `.gz` is 100% derivable from `frames.json` (which *is* byte-portable), so a
  "gunzip-equality" gate loses nothing semantically.

### F6 — measured: pure-JS encoders at 264-file scale

Scratchpad measurement (`png-compare.ts`): decode all 264 published textures to RGBA,
re-encode, compare totals against sharp's published 63,333 B:

| Encoder | Output | Total bytes | vs sharp | Pixel fidelity | Encode time (264 files) |
|---|---|---|---|---|---|
| sharp 0.33.5 (published) | palette (type 3) | 63,333 | 1.00x | — | — |
| fast-png 6.4.0 | RGBA (type 6) | 54,383 | **0.86x** | exact — decode-back byte-equal for all 264 | ~24 ms |
| UPNG.js 2.1.0 lossless (cnum 0) | varies | 63,735 | 1.01x | not verified (G-405) | ~23 ms |
| UPNG.js 2.1.0 cnum=256 | palette | 45,833 | 0.72x | quantizer is lossy-by-design; not verified (G-405) | similar |

The feared size regression from losing palette output **does not materialise at these
image sizes**: fast-png's non-palette output is *smaller in total* than sharp's
palettized output. Speed is a non-issue (tens of ms for the full texture set).

### F7 — measured: a canvas-based encoder would corrupt every texture

Scratchpad scan (`alpha-scan.ts`) of all 264 published textures' RGBA:

```
opaque pixels (a=255):            7,045
semi-transparent (0<a<255):       4,738  in 150 of 264 files
a=0 with NON-ZERO RGB:           34,011  in 264 of 264 files
a=0 with all-zero RGB:                0
```

Canvas 2D stores pixels premultiplied: drawing RGBA into a canvas and calling
`toBlob`/`convertToBlob` zeroes RGB under a=0 and rounds RGB under partial alpha.
**Every single texture** carries meaningful RGB under zero alpha (normal/height data
per `raster.ts:56-77` / `pixelDecode.ts`), so `canvas.toBlob` is not "low control,
different bytes" — it is **measured silent pixel corruption of 264/264 files**, the
exact hazard class CLAUDE.md's data rule warns about. This also disqualifies any
casual canvas round-trip anywhere in a future export path (G-404).

### F8 — the wasm-vips version alignment is exact, on paper

- sharp 0.33.x requires libvips **8.15.3**; 0.33.5 (16 Aug 2024) is the "upgrade to
  libvips 8.15.3" release
  (https://raw.githubusercontent.com/lovell/sharp/v0.33.5/docs/changelog.md, checked
  2026-09-06).
- sharp's prebuilt libvips (sharp-libvips v8.15.3, `build/lin.sh:95-104`) compiles:
  **zlib-ng 2.2.1, spng 0.7.4, imagequant 2.4.1** (lovell fork), libpng 1.6.43
  (https://raw.githubusercontent.com/lovell/sharp-libvips/v8.15.3/build/lin.sh,
  checked 2026-09-06).
- **wasm-vips v0.0.10** (2024-08-14) bundles libvips **8.15.3**, Emscripten 3.1.64
  (CHANGELOG.md), and its `build.sh:165-183` pins **zlib-ng 2.2.1, spng 0.7.4,
  imagequant 2.4.1** — the *identical* PNG-save stack, version for version
  (https://raw.githubusercontent.com/kleisauke/wasm-vips/v0.0.10/build.sh, checked
  2026-09-06).
- So wasm-vips 0.0.10 is the only browser option with a real chance of byte-matching
  sharp 0.33.5 — but it is a *chance*, not a fact: Emscripten codegen vs native, and
  zlib-ng's architecture/SIMD-dependent code paths, can change the emitted stream
  without changing decoded pixels. Byte-identity there is **NEEDS-MEASURE** (G-401).
- Cost side: wasm-vips 0.0.10 is 15,057,339 B unpacked on npm (14 files; latest
  0.0.18 is 12,502,001 B) — registry.npmjs.org/wasm-vips, checked 2026-09-06.
  Runtime requirements per README: WebAssembly SIMD + exception handling (Safari
  16.4+), and `Cross-Origin-Embedder-Policy: require-corp` / COOP for the threaded
  build — header injection inside a Capacitor custom scheme is task 02's territory
  (G-406). Latest release train: 0.0.18 (2026-06-09) = libvips 8.18.3, so choosing
  0.0.10 means pinning to a 2024 artifact — the same shape of debt as the existing
  sharp 0.33.5 pin.

### F9 — package maintenance status (registry.npmjs.org, checked 2026-09-06)

| Package | Latest | Published | Verdict |
|---|---|---|---|
| fast-png | 8.0.0 | 2025-12-18 | Active (image-js org). Encoder writes depth 8/16, channels 1-4 only — **no palette output** (README `encode(image)` API, github.com/image-js/fast-png, checked 2026-09-06). Decoder handles palette. |
| upng-js | 2.1.0 | **2017-12-12** | Dormant ~9 years. Ships its own inflate/deflate. Disqualifying as a newly-pinned long-term dep. |
| pako | 3.0.1 | 2026-07-06 | Active again (2.2.0/3.0.0/3.0.1 all mid-2026). Measured at 2.1.0 here. |
| wasm-vips | 0.0.18 | 2026-06-09 | Active; single maintainer (kleisauke). |
| fflate | 0.8.2 (measured) | — | Measured only as a gzip data point; worse compression on this input (14,990 B). |

---

## Options

The decision splits into a PNG axis and a gzip axis; `frames.json`, `index.ts`,
filenames, and `exports/lib/` are byte-safe under every option (F2/F4).

### PNG axis — G-14 decision space

**(a) Export stays server-only.** Local mode has no export (or "export" requires
attaching to a remote server and running it there).
- Golden gates: completely untouched; sharp stays the only encoder.
- `exports/lib`: untouched.
- What breaks: the write-once promise for the export subsystem, and offline iPad
  users cannot export at all. The export preview modal
  (`client/src/containers/ExportPreviewModalContainer.tsx`, textures fetched by URL)
  becomes remote-only too.
- Owner signs off on: a permanent feature gap in local mode.
- Ongoing cost: none technically; product cost recurring.

**(b) Dual encoders + re-baseline the gate to decoded-pixel equality.** Server keeps
sharp 0.33.5 byte-for-byte; browser uses fast-png (pin 8.0.0 after re-measuring —
measurements above are 6.4.0, G-408). The gate becomes an *automated* suite (which
does not exist today, F3/G-407): decoded-RGBA equality for textures + byte equality
for `frames.json`/`index.ts`/filenames + gunzip equality for `.gz`.
- Golden gates: server-side artifacts do not change at all today; the *definition* of
  the gate changes from "PNG bytes equal" (currently a manual procedure) to "decoded
  pixels equal + everything-parseable byte-equal".
- Consequence for the external consumer: a locally-exported texture is colour type 6
  instead of 3 and has different (measured: smaller, 0.86x total) bytes than the same
  texture exported by the server. Any consumer that *decodes* PNGs sees identical
  pixels; one that hashes PNG files would see per-platform bytes.
- `exports/lib`: untouched (F4).
- Owner signs off on: "the published artifact is pixel-identical, not byte-identical,
  across export platforms"; colour-type 3 → 6 for browser-exported textures.
- Ongoing cost: two pinned encoders; one new decode-equality test harness (sharp can
  decode server-side; fast-png decodes in the browser/test env). fast-png is
  deterministic pure JS, so browser exports are still reproducible byte-for-byte
  *per encoder version* — the gate could even pin browser-export bytes if wanted
  (that is option (c)).

**(c) Dual encoders + per-target golden byte sets.** Same encoders as (b), but keep
byte-gates by maintaining two golden trees (sharp-bytes, fast-png-bytes). Viable
precisely because fast-png is deterministic (unlike `canvas.toBlob`).
- Golden gates: doubled; every intentional export-affecting change re-baselines two
  trees; gate scripts must know which platform produced the tree under test.
- Owner signs off on: doubled golden maintenance forever.
- Ongoing cost: the highest recurring cost of the four; protects against silent
  encoder-version drift better than (b).

**(d) wasm-vips 0.0.10 everywhere — one encoder, aiming at true byte identity.**
Replace sharp with wasm-vips on *both* sides (it runs under Node ≥17/Deno per its
README; Bun compatibility unverified, G-406), or browser-only wasm-vips accepting a
dual-encoder gate if bytes differ.
- Golden gates: if the byte-identity measurement (G-401) passes, today's gate
  survives unchanged and even gets stronger (one encoder, two platforms). If it
  fails, you have paid the wasm cost and are back to (b)/(c).
- What breaks / costs: ~12-15 MB unpacked dependency, multi-MB wasm in the webview
  bundle; Safari 16.4+ floor; COOP/COEP response headers needed for the threaded
  build inside the Capacitor scheme (task 02, G-406); pinned to a 2024 release of a
  single-maintainer project (same debt shape as the sharp 0.33.5 pin, now in two
  places); server loses its native-speed encoder (irrelevant at 264×<1 KB scale).
- Owner signs off on: the bundle weight + the pin; and pre-approves the fallback
  (which of (b)/(c)) if G-401 measures "differ".

### gzip axis (orthogonal, smaller)

Measured reality (F5): today's `.gz` bytes are reproducible **only** by Bun's
vendored Cloudflare zlib. Options:

1. **Re-baseline `.gz` to gunzip-equality** (recommended with any of (b)/(c)/(d)):
   browser emits pako 3.0.1 (active; pin exact) at level 9; gate asserts
   `gunzip(a) === gunzip(b) === frames.json`. Cost: none beyond the gate change —
   consumers gunzip anyway, and `frames.json` itself stays byte-identical.
   `CompressionStream("gzip")` is the zero-dep variant of this same option, with
   browser-version-dependent bytes and no level control (F5) — acceptable *only*
   under a gunzip-equality gate; pako is preferred because its output is at least
   deterministic per pinned version.
2. **Chase `.gz` byte identity**: compile Cloudflare zlib (or ship Bun's exact
   deflate) to wasm. No published package does this; it is a custom-toolchain
   special measure for an artifact that is pure derived data. Listed for
   completeness; not argued for.
3. **Server-only `.gz`** (pairs with option (a) only).

Note for the implementation plan regardless of choice: `.gz` byte-stability today
also silently depends on the server always running under Bun — worth stating in the
generated plan so nobody "fixes" it onto Node CI and re-baselines by accident.

---

## Recommendation

**Pending owner sign-off — this is G-14, a PRODUCT-DECISION; nothing below is
decided.**

I would argue for **(b) + gzip option 1**: sharp 0.33.5 stays the server encoder
(today's published bytes do not move), fast-png (exact-pinned, re-measured at 8.0.0)
becomes the browser encoder, and the gate is *rebuilt as an automated suite* asserting
decoded-RGBA equality for textures, byte equality for `frames.json` / generated
`index.ts` / texture filenames, and gunzip equality for `frames.json.gz`.

Why:

1. **The byte gate's real job is catching silent pixel mangling** (CLAUDE.md's
   highest-severity rule), and decoded-pixel equality preserves exactly that
   protection — while today's "byte gate" is a manual `diff -r` habit, not a test
   (F3). Option (b) leaves the export *stronger*-gated than it is now.
2. **Byte identity across encoders is already known to be un-holdable** — a sharp
   patch bump alone broke it for 214/232 files (F1) — and for `.gz` it is already
   runtime-coupled to Bun's Cloudflare zlib (F5). The bytes were never as pinned as
   they looked.
3. Everything external code actually *parses* — `frames.json`, `index.ts`,
   filenames, `exports/lib/` — stays byte-identical under (b) (F2/F4).
4. The measured costs are nil: fast-png output is *smaller* (0.86x), pixel-exact on
   all 264 real textures, ~24 ms for the full set, actively maintained (F6/F9).
5. (d) is the only option that could keep literal byte identity, but it stakes a
   15 MB dependency, a Safari/header floor, and a second version-pin on an unproven
   measurement (G-401). If the owner values byte identity enough to fund (d), run the
   G-401 measurement *first* and fall back to (b) on failure.

What the owner must explicitly sign off for (b): locally-exported textures are
pixel-identical but not byte-identical to server exports (colour type 6 vs 3);
`frames.json.gz` is validated by content, not bytes; and the characterisation-test
discipline (`export-golden.test.ts`) extends to the new automated equality suite.

---

## Gaps

### G-401 · NEEDS-MEASURE · wasm-vips 0.0.10 byte-identity with sharp 0.33.5 is unproven
**Evidence:** Identical dep stack on paper — libvips 8.15.3 + zlib-ng 2.2.1 + spng
0.7.4 + imagequant 2.4.1 on both sides (sharp-libvips v8.15.3 `build/lin.sh:95-104`;
wasm-vips v0.0.10 `build.sh:165-183`; both checked 2026-09-06). But Emscripten
codegen and zlib-ng's SIMD/architecture-dependent paths can alter the emitted stream
without altering pixels — the same failure shape as the measured sharp-bump result
(`raster.ts:12-16`).
**Impact:** Option (d)'s core promise is unverified; choosing (d) on the version
alignment alone risks paying ~15 MB for a re-baseline anyway.
**Special measure:** A one-day spike (outside the repo): encode the 264 raw RGBA
buffers with wasm-vips 0.0.10 under the same options and `cmp` against the published
textures. The implementation plan must schedule this before any (d) commitment.

### G-402 · PRODUCT-DECISION · G-14 itself: which export-artifact identity does the owner guarantee?
**Evidence:** Option space and consequences in **Options** above; measurement basis
F1-F9.
**Impact:** Blocks the local-mode export design in docs/11; every option changes what
"the published artifact" means to the external game-code consumer.
**Special measure:** none — owner sign-off via DECISIONS-NEEDED.md (task 07).

### G-403 · BLOCKER · `frames.json.gz` bytes cannot be reproduced in a browser
**Evidence:** Measured: on-disk `.gz` is byte-identical to Bun 1.3.5 `gzipSync`
level 9 (Cloudflare-zlib fork — `process.versions.zlib` commit `886098f3…` resolves
in cloudflare/zlib, api.github.com, checked 2026-09-06); pako 2.1.0 differs (bodies
diverge at byte 1), fflate 0.8.2 differs, and `CompressionStream(format)` has no
level parameter (WHATWG spec, checked 2026-09-06).
**Impact:** Literal byte identity for `frames.json.gz` is unachievable browser-side
with any published library; it is also already runtime-coupled (a Node-run server
would emit different bytes today).
**Special measure:** Re-baseline the `.gz` gate to gunzip-equality (contents are
derived data; `frames.json` itself is byte-portable), or the custom-toolchain
Cloudflare-zlib-to-wasm build (gzip option 2 — not argued for).

### G-404 · DESIGN-RISK · any canvas round-trip in an export path silently corrupts every texture
**Evidence:** Measured (F7): 34,011 pixels with a=0 and non-zero RGB across **264 of
264** published textures, plus 4,738 semi-transparent pixels in 150 files; canvas
premultiplication destroys RGB under a=0 and rounds it under partial alpha.
**Impact:** `canvas.toBlob` / `OffscreenCanvas.convertToBlob` — the "zero-dependency"
encoder — mangles pixels silently rather than erroring, in exactly the way the data
rules warn about. The same applies to any future helper that "just draws it to a
canvas" mid-pipeline.
**Special measure:** The generated plan must ban canvas-mediated encode/decode on the
export path (lint note or code comment at the encoder seam) and route all encoding
through the chosen library on raw RGBA buffers.

### G-405 · NEEDS-MEASURE · UPNG.js palette-mode losslessness never verified (and moot)
**Evidence:** UPNG cnum=256 measured 0.72x size (F6) but its quantizer is documented
as lossy; upng-js last published 2017-12-12 (registry.npmjs.org, checked 2026-09-06).
**Impact:** None if UPNG is rejected (recommended: reject on maintenance alone). Only
becomes real if someone reaches for the 0.72x number without verifying pixel
fidelity.
**Special measure:** none needed if UPNG stays rejected; otherwise a decode-back
equality check like F6's fast-png verification.

### G-406 · NEEDS-MEASURE · wasm-vips runtime prerequisites in this stack are unverified
**Evidence:** wasm-vips README requires Wasm SIMD + exception handling (Safari
16.4+) and COOP/COEP (`require-corp`) for its threaded build (checked 2026-09-06);
whether the Capacitor iOS custom scheme can serve those headers is task 02's
finding; wasm-vips claims Node ≥17/Deno support but **Bun is untested** for the
server side of option (d).
**Impact:** Option (d) could be blocked by webview header injection or Bun
incompatibility even if G-401 measures byte-identical.
**Special measure:** Fold into the G-401 spike: run wasm-vips once under Bun and once
in a WKWebView before committing to (d).

### G-407 · DESIGN-RISK · the "byte-identity golden gate" is a manual procedure, not a test
**Evidence:** `export-golden.test.ts` contains zero file/byte comparisons (F3; whole
file read, lines 1-322); the gate exists only as comments — `export/index.ts:9-12`
("Re-export and `diff -r` against goldens"), `raster.ts:6-17`, `codegen.ts:6-10`,
`write.ts:6-8` — against gitignored previous-export output. MASTER §4 and this
task's brief describe the suite as byte-comparing; that is inaccurate.
**Impact:** Every option in the decision space (including "do nothing") is currently
guarded by discipline, not automation; the implementation plan would otherwise
inherit and build on a gate that does not exist. Whatever G-14 decision is made, the
plan must *create* the automated gate it assumed was already there.
**Special measure:** Task 07/08 should carry this correction forward: docs/11 needs a
task that builds the equality suite (byte or decoded-pixel per the G-402 decision)
with a committed synthetic fixture, since `server/exports/` is gitignored and cannot
serve as a CI golden.

### G-408 · NEEDS-MEASURE · encoder measurements were taken at fast-png 6.4.0 / pako 2.1.0, not at the versions a plan would pin
**Evidence:** F6/F5 measured fast-png 6.4.0 and pako 2.1.0; latest are fast-png 8.0.0
(2025-12-18) and pako 3.0.1 (2026-07-06) (registry.npmjs.org, checked 2026-09-06).
**Impact:** Size/fidelity/determinism numbers could shift at the pinned versions
(pako 3.x is a new major).
**Special measure:** Re-run the two scratchpad scripts at the exact pinned versions
during implementation; they are ~100 lines total and take seconds.
