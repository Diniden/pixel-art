# 03 — Add three.js and the pose engine skeleton

**Wave:** W1 · **Depends on:** none
**Touches:** `client/package.json` · `client/src/ui/canvas/pose/poseTypes.ts` (new) · `client/src/ui/canvas/pose/poseEngine.ts` (new) · `client/src/ui/canvas/pose/__tests__/poseTypes.test.ts` (new)
**Effort:** M

## Objective

`three` is an exact-pinned dependency, and `client/src/ui/canvas/pose/` exists with the
shared type vocabulary plus a `PoseEngine` that owns the WebGL lifecycle: it lazily loads
three, creates a renderer, a scene with a key light and ambient fill, a camera, and a render
target sized exactly `cellWidth × cellHeight`; it renders on demand into a `Uint8Array`; and
it disposes every GPU resource it created. No mesh library, no camera presets, no React —
those are tasks 06 and 08.

## Context

**No 3D library exists in this repo today.** `three`, `babylon`, `gl-matrix` and `ogl` are
all absent from `node_modules` and both `package.json` files, and **no WebGL context is
created anywhere in `client/src`** — this task introduces the first one.

### The `ui/` boundary permits `three` (MASTER D15)

`client/scripts/check-boundaries.mjs` rule 1 blocks imports of `stores/`, `store/`, `api/`,
`services/`, `mobx`, `mobx-react-lite`, and `useContext` from anything under `src/ui/`.
**It does not block third-party render libraries.** `three` is in the same category as
`lucide-react`. So this module belongs under `ui/canvas/pose/`, alongside the other pure
canvas modules (`ui/canvas/model/`, `ui/canvas/render/`, `ui/canvas/svg/`) — and it must
stay pure: **no store import, no MobX, no React, no `observer()`.** Verify with
`bun run lint:boundaries`.

### Dependency rules — read carefully, this is the highest-risk step in the plan

```sh
cd client
bun add --exact three
bun add --exact --dev @types/three
```

- **`--exact` is mandatory.** Plain `bun add three` writes `"^x.y.z"`. The repo has **no
  lockfile by standing owner policy**, and reproducibility comes *only* from exact version
  strings. No `^`, no `~`, no ranges.
- ⚠️ **`bun add` / `bunx` can create a lockfile as a side effect.** Immediately after
  installing, run:
  ```sh
  cd /Users/diniden/Desktop/self/pixel-art
  find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
  ```
  If it prints anything, **delete that file** and re-check. Do **not** "fix" this by editing
  `bunfig.toml` — its `[install.lockfile] save = false` is deliberate and must never be
  removed. `--frozen-lockfile` must never appear in any command.
- `node`/`npm` are not on PATH. Bun only.

### Lazy loading (MASTER D2)

three is ~600 kB minified. It must **not** land in the main bundle. Load it with a dynamic
import inside the engine, resolved once and cached:

```ts
let threePromise: Promise<typeof import("three")> | null = null;
function loadThree() {
  threePromise ??= import("three");
  return threePromise;
}
```

Everything that needs a three symbol goes through an initialised engine, so no module-level
`import * as THREE from "three"` appears anywhere in `src/`. Types may be imported
**type-only** (`import type { WebGLRenderer } from "three"`) — that is erased at build time
and does not pull the runtime in.

### The rendering contract (MASTER D5) — this is the feature

The render target is **exactly `cellWidth × cellHeight`**: one texel per art pixel, the same
1:1 dimensions every other canvas in the stack uses (`CanvasSurface` header, `:248-260`).
That *is* the pixelation technique. Concretely:

- `new WebGLRenderer({ antialias: false, alpha: true })`
- render target textures: `minFilter` and `magFilter` both `THREE.NearestFilter`
- **never** render large and downsample; **never** `drawImage` with scaling
- magnification is handled entirely by the existing CSS transform on `.canvas__layout` plus
  `image-rendering: pixelated`

Readback is `renderer.readRenderTargetPixels(target, 0, 0, w, h, buffer)` into a
`Uint8Array` of `w * h * 4`. ⚠️ **WebGL's readback origin is bottom-left; `ImageData` is
top-left.** The buffer must be **row-flipped vertically** before it becomes pixels. Getting
this wrong renders the model upside down — it is the single most likely bug in this task.
Provide the flip as an exported pure function so task 06/08 can rely on it and it can be
unit-tested without a GL context.

### Testing constraint

**jsdom has no WebGL**, so the engine's GL calls cannot be unit-tested (MASTER risk
register). Keep the pure, testable parts separate: the row-flip and any type guards go in
testable functions; the GL lifecycle is covered by task 08's manual checks. Your test file
covers `poseTypes.ts` and the flip helper only. Do not write a test that constructs a
`WebGLRenderer`.

## Steps

1. From `client/`, run `bun add --exact three` and `bun add --exact --dev @types/three`.
   **Immediately** run the lockfile `find` check from the repo root and delete anything it
   finds. Confirm `client/package.json` shows bare exact versions (no `^`).
2. Create `client/src/ui/canvas/pose/poseTypes.ts` declaring the shared vocabulary:
   `PoseMeshId`, `PoseFraming`, `PoseProjection`, `PoseCameraPreset`, `PoseVector`, and
   `PoseStampCell` (`{ x, y, color, normal, height }` — declare `color`/`normal`
   **structurally**, since `ui/` should not depend on domain types unnecessarily; a
   structural `{r,g,b,a}` / `{x,y,z}` is enough and matches the project's existing habit).
   Add `normalizeVector()` and any small vector helpers here as pure functions.
   ⚠️ These unions must be **structurally identical** to the ones task 02 declares in
   `PoseUIStore.ts` — same members, same order. Note that in a comment.
3. Create `client/src/ui/canvas/pose/poseEngine.ts` exporting a `PoseEngine` class (or a
   factory returning the same shape) with roughly this surface:
   - `static async create(): Promise<PoseEngine>` — lazily loads three, builds renderer,
     scene, ambient + directional light, and a placeholder camera.
   - `resize(width: number, height: number): void` — disposes the old render target and
     allocates a new one at exactly those dimensions, with `NearestFilter`. Idempotent when
     the size is unchanged.
   - `setLight(direction: PoseVector, color): void`
   - `setBackgroundTransparent()` — the target must clear to alpha 0 so the artwork shows
     through everywhere the model is not.
   - `render(): Uint8Array` — renders the scene to the target, reads it back, returns the
     **row-flipped, top-left-origin** RGBA buffer.
   - `setObject3D(obj): void` / `clearObject3D(): void` — task 06 supplies the meshes; the
     engine only holds and swaps one root object, disposing the previous one's geometries
     and materials.
   - `dispose(): void` — disposes the render target, the current object's geometry and
     materials, and calls `renderer.dispose()` (and `forceContextLoss()` if available).
   Document each method. The header must state the 1:1 render-target contract, the
   `NearestFilter` requirement, the bottom-left/top-left flip, and the disposal obligation.
4. Export the row-flip as a standalone pure function (e.g.
   `flipRowsInPlace(buf: Uint8Array, width: number, height: number): Uint8Array`).
5. Write `client/src/ui/canvas/pose/__tests__/poseTypes.test.ts` (unit lane) covering
   `normalizeVector` and `flipRowsInPlace` — build a small known buffer (e.g. 2×2 with
   distinct pixels) and assert rows swap correctly, including the odd-height case.
6. Run the full verification. **Commit after step 6**:
   `feat(pose): add three.js and the pose render engine skeleton`.

## Constraints

- **`--exact` on every `bun add`. Never create a lockfile.** Never edit `bunfig.toml`.
  Never use `--frozen-lockfile`.
- **No module-level runtime `import` of `three`** anywhere in `src/` — dynamic import only,
  inside the engine. Type-only imports are fine.
- **No store, no MobX, no React, no API, no `services/`** in `ui/canvas/pose/`.
- **No `antialias: true`, no `LinearFilter`, no scaling blit.** Ever.
- Do not create a `<canvas>` element in the DOM here and do not touch `CanvasSurface` — the
  engine renders offscreen and hands back a buffer. Task 04 owns the overlay canvas; task 08
  wires them together.
- Do not implement meshes, camera presets or auto-fit — that is task 06. A placeholder
  camera is fine.
- Do not write a test that needs a WebGL context.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # all pass, incl. the flip test
bun run lint:boundaries                             # OK — proves three didn't drag in a store
bunx stylelint "src/**/*.css"                       # exactly 2 errors (unchanged)
bun run build                                       # must succeed
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # MUST print nothing
grep -nE '"three"|"@types/three"' client/package.json          # exact versions, no ^ or ~
```

**Bundle check (record the numbers in `HANDOFF.md`):** after `bun run build`, list the
emitted chunks and confirm **three is in a separate lazy chunk**, not the main entry:

```sh
ls -lh client/dist/assets/ | sort -k5 -h
```

If three landed in the main bundle, the dynamic import was defeated (usually by a stray
static import) — fix it before finishing.

**Manual checks:**

1. `bun run dev` starts all three processes and the app loads normally.
2. The browser Network tab shows **no three.js chunk** loaded on initial page load. (Nothing
   uses the engine yet, so it must not be fetched at all.)
3. The console is clean — no WebGL warnings.

## Definition of done

- [ ] `three` and `@types/three` are in `client/package.json` at **exact** versions.
- [ ] **No lockfile exists** anywhere (`find` prints nothing).
- [ ] `poseTypes.ts` declares the five unions/interfaces plus `PoseStampCell` and vector
      helpers, noted as structurally identical to `PoseUIStore`'s.
- [ ] `poseEngine.ts` exports a `PoseEngine` with create/resize/setLight/setObject3D/
      render/dispose, lazily importing three.
- [ ] The render target is created at exactly the passed dimensions with `NearestFilter`,
      `antialias: false`, and transparent clear.
- [ ] `render()` returns a **top-left-origin** buffer (rows flipped), and the flip is an
      exported, unit-tested pure function.
- [ ] `dispose()` releases render target, geometries, materials and the renderer.
- [ ] `bun run build` succeeds and three is in a **separate chunk**, with sizes recorded.
- [ ] No three chunk is fetched on initial page load.
- [ ] Full gate green; `lint:boundaries` OK.
- [ ] One commit, containing only this task's hunks.
