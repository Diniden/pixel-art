# MASTER — Pose tool refinements

Plan folder: `docs/07-pose-refinements/`. Planned 2026-09-03. Executed by `/plan-go`.
Builds on `docs/06-pose-tool/`, which is landed and gate-green at `54d6501`.

## 1. Request

Verbatim:

> The implementation is actually REALLY CLOSE! We have a few items:
>
> - The zoom is capping out how large the model can be rendered on the canvas. I just want
>   initial render to be correctly sized to fit and I'd like a button to make the model fit to
>   the canvas with the current rotation and camera properties. After that, the zoom and
>   panning should be free movement even off canvas.
> - The color selection is using some form of native color picker. I want to use the current
>   color picker to set the color. Let's use "Fill" for setting that color.
> - It would be neat to support the "Edge" color as well by making it do an outline around the
>   model in that color. It would need a thickness slider for that edge.
> - Right now the poses let me place the full mannequin, Let's instead break it down to just
>   render the head, torso, arms etc as individual pieces, this would replace the "framing"
>   feature you made.
> - We need to improve the lighting model a hair: right now it's rendering the normals for the
>   faces orthogonal to the face: we need to do normal blending at the vertices so the light
>   blends better. Also, you can up the polys for the rounded primitives. We're dealing with
>   barely any pixels.

**Interpretation.** Five independent refinements to a working feature. Three are small and
local (unclamp zoom, turn off `flatShading`, raise segment counts); two are structural (the
mannequin becomes real per-part geometry, replacing the camera-framing approach; the rail
stops using native colour inputs and consumes the app's own Fill/Edge slots, gaining an
outline post-pass and a thickness slider). Nothing here changes the wire format, the stamp's
commit path, or the 1:1 render-target rule.

**Assumptions made, where the request was ambiguous.**

- **"Zoom is capping out"** has two causes, not one: the `POSE_ZOOM_MAX = 10` clamp *and*
  pose-tool task 08's decision to fold zoom into `fitCameraToMesh`'s padding, which makes the
  fit re-normalise the result. Both are addressed — the clamp in task 01, the fold in task 06.
  Removing only the clamp would not satisfy the request.
- **"Use the current color picker"** means the pose rail does **not** get its own embedded
  picker. It shows the current Fill/Edge colours and switches which slot the main picker is
  editing. One picker, two slots, no third UI.
- **Light colour** is not a Fill/Edge concept. Task 03 decides whether it stays a separate
  control or moves behind the same picker, and must document the choice — it is not silently
  dropped.
- **"Head, torso, arms etc as individual pieces"** replaces framing entirely. `PoseFraming`,
  `MANNEQUIN_REGIONS` and `getFramingBounds` are deleted, not deprecated.
- **The outline is display-only by default** — not written by the stamp — because an
  edge-coloured pixel has no meaningful normal or height. Task 06 may decide otherwise but
  must justify it and define those channels. Flagged as an owner question.
- **"Up the polys"** is unbounded in the request; task 02 chooses concrete values and must
  justify them next to the constants, and keep *some* upper bound so nobody later ships 512
  segments by accident.

## 2. Outcome

When the plan is complete the owner can:

- Zoom the model far past the old cap, and pan it **entirely off canvas**, with nothing
  clamping either. The **initial** render still auto-fits with padding.
- Press **Fit to canvas** to re-frame at the *current* rotation and camera settings, without
  zoom or pan being reset.
- Set the model colour from the app's **Fill** slot and the outline colour from **Edge**,
  using the picker they already use — no native OS swatch anywhere in the rail.
- Drag an **edge thickness** slider (whole pixels, 1–4, plus an off state) and watch a crisp,
  hard-edged outline hug the silhouette.
- Click **Head / Torso / Arm / Leg / Hand / Full** and get *that piece alone*, centred and
  auto-fitted, rotating, lighting, panning and stamping exactly like a cube.
- See **smooth, blended shading** on the sphere, cylinder and mannequin parts instead of flat
  facets, with enough geometry that the silhouette reads as round at 32×32.
- `bun run verify` exits 0.

## 3. Locked decisions

Executors **must not re-decide these**. If one is genuinely wrong, record it in `HANDOFF.md`
under Deviations and say why.

| # | Decision | Value |
| --- | --- | --- |
| **E1** | Mannequin parts | **Real sub-geometry per part**, built by spatial **triangle** segmentation at load. Owner-decided 2026-09-03. Not node selection (there are no per-limb nodes) and not camera framing (that is what is being replaced). **No left/right variants.** |
| **E2** | Framing feature | **Deleted**, not deprecated: `PoseFraming`, `MANNEQUIN_REGIONS`, `getFramingBounds` and every reference. Task 05 removes it from `ui/canvas/pose/`; task 06 removes it from the store, containers and panel. |
| **E3** | Outline implementation | **Post-pass on the rendered silhouette**, at the 1:1 render target, in a pure module (`poseOutline.ts`). **Not** an inverted-hull or shader outline — at this resolution those give fractional coverage and soft fringes. Owner-decided 2026-09-03. |
| **E4** | Outline thickness | **Whole pixels, integer 1–4**, plus an off state (0 or a toggle — task 03 decides and documents). Owner-decided 2026-09-03. |
| **E5** | Outline kernel | Task 04 chooses **Chebyshev (square)** or **Euclidean (round)**, documents it, and tests it. Square is the recommended default for pixel art. |
| **E6** | Outline alpha threshold | Matches the stamp's existing `>= 128` (D8), so the outline traces the same silhouette the stamp writes. The coupling must be documented. |
| **E7** | Outline vs stamp | **Default: display-only, NOT stamped.** An edge pixel has no meaningful normal or height. Task 06 may decide otherwise with justification and defined channels; either way it is documented and surfaced to the owner. |
| **E8** | Model colour source | `ui.tool.fillColorOrSelected` — the **Fill** slot. ⚠️ Always through `fillColorOrSelected`; **never seed a default `fillColor`** (it is tri-state; seeding adds a key to all 151 corpus snapshots). |
| **E9** | Outline colour source | `ui.tool.selectedColor` — the **Edge** slot. |
| **E10** | Colour UI shape | The rail shows **swatches** and switches `ui.tool.colorTarget`; it does **not** embed a second picker. |
| **E11** | Zoom | Unbounded above. A tiny positive **floor** remains (a zero/negative scale collapses or inverts the projection) — a *safety floor*, explicitly not a cap. `POSE_ZOOM_MAX` is deleted. |
| **E12** | Zoom vs fit | **Separated.** Zoom becomes a free multiplier applied *after* the fit; it is no longer folded into `fitCameraToMesh`'s padding. This is the real fix for the owner's complaint. |
| **E13** | Pan | Never clamped. The model may leave the canvas entirely. Still reset by a **new mesh**, still preserved across a resize. |
| **E14** | Fit trigger | Store exposes `fitGeneration` + `requestFit()`; the container reacts to the counter. A **counter, not a boolean**, so two presses are two events. `requestFit()` mutates no camera state. |
| **E15** | Fit semantics | Re-frames at the **current** rotation/projection/preset. **Does not reset zoom or pan.** Auto-fit still runs on mesh change, projection/preset change and `cellWidth`/`cellHeight` change. |
| **E16** | Shading | `flatShading` off — three interpolates per-vertex normals. The old "each facet is one tone" comment is rewritten, not left contradicting the code. |
| **E17** | Tesselation | Rounded primitives raised (suggested sphere 48×32, cylinder radial 48); task 02 may choose otherwise **with reasoning written next to the constants**. An upper bound remains in the tests. `CYLINDER_HEIGHT_SEGMENTS` decision justified either way. |
| **E18** | Stamped normals change | Smoothing normals changes what the normal pass writes — interpolated instead of faceted. **This is intended.** It must be stated in the report and checked in the lighting studio. |
| **E19** | D14 unchanged | Preset-overrides-projection **stays as written** (owner decision, 2026-09-03). Not to be "fixed" as a side effect. |
| **E20** | Union duplication | `ui/canvas/pose/poseTypes.ts` and `stores/ui/PoseUIStore.ts` keep their deliberate duplicate unions (the `ui/` boundary forbids importing `stores/`). **They change together**: task 05 writes the `ui/` side and reports the exact shape; task 06 mirrors it character for character. |

## 4. Ground truth (measured 2026-09-03)

**Refresh state: COMPLETE.** No `REFRESH/` directory. Every file this plan touches is already
in the target architecture: MobX stores under `stores/`, pure `ui/`, `observer()` only in
`containers/`, BEM CSS with tokens. `client/src/store/` (Zustand) is residue — do not extend it.

**Baseline.** Branch `feat/06-pose-tool`, HEAD `54d6501`, worktree **clean**, `bun run verify`
**exit 0**. The pose tool is landed and working; this plan refines it.

**Gate, measured this session:**

| Command | Result |
| --- | --- |
| `bun run verify` (root) | **exit 0** — `typecheck && lint && format:check && test && build` |
| `bunx tsc --noEmit` (client) | exit 0 |
| `bunx eslint .` | **0 errors**, 65 warnings (the baseline) |
| `bunx vitest run` | **145 files / 2737 tests pass** |
| `bun run lint:boundaries` | OK — all 5 rules |
| `bunx stylelint "src/**/*.css"` | 70 problems: **2 errors** (`OtherHand.css:338`, `:359`) + 68 warnings. **The 2-error baseline is pre-existing.** |
| `find . -maxdepth 2 -name 'bun.lock*' \| grep -v node_modules` | **empty — and must stay empty** (`bunx` recreates it) |

**Zoom / fit — the owner's first complaint.** `stores/ui/PoseUIStore.ts`: `POSE_ZOOM_MIN = 0.1`
and `POSE_ZOOM_MAX = 10` at `:126-127`; `zoom = 1` at `:180`; `setZoom` clamps at `:276`;
`clear()` resets at `:308`. ⚠️ Pose-tool task 08 **folded zoom into `fitCameraToMesh`'s
padding** rather than applying a separate camera scale, making the fit the sole owner of
framing — that fold is why zoom caps out, and unclamping alone will not fix it. The
file's `clamp()` deliberately treats only `NaN` as "fall back to min"; infinities clamp to the
bound they meet.

**Colour — the owner's second and third complaints.**
`ui/components/PosePanel/PoseSection.tsx` renders native `<input type="color">` at **`:264`**
(light) and **`:274`** (model), with local `toHex`/`fromHex` at `:130`/`:136` transcribed from
`OriginColorPicker`.

The seam that makes the fix clean is the **edge/fill colour split**, commit `45e3c8a`
(this session):

- `ui.tool.selectedColor` = **EDGE** (pencil, line, shape outline).
- `ui.tool.fillColor` = **FILL** (bucket, gaussian fill, shape interior). ⚠️ **Tri-state**:
  `undefined` means "absent from the project file". Readers use **`ui.tool.fillColorOrSelected`**,
  which falls back to `selectedColor`. **Seeding a default would add a key to all 151 corpus
  snapshots and change their digests.**
- `ui.tool.colorTarget` (`"edge" | "fill"`) — which slot the picker edits. Deliberately **not
  persisted**.

The real picker is `ui/components/ColorPicker/ColorPicker.tsx` (props at `:35-58`), wired in
`containers/ColorPickerContainer.tsx:105-127`. That wiring is the precedent to copy.

**The mannequin — the owner's fourth complaint.** `client/public/models/mannequin.gltf`, CC0,
380,956 bytes, sha256 `d936e4b7602147f05b4fe5a6d712eebf0a575be154e66834c9a9e0e0ebabef44`.
Measured directly from the file:

| Node | Mesh | Verts | Bounds |
| --- | --- | --- | --- |
| `mannequin_joints` | `joints` | 1,270 | x `[-0.75, 0.75]`, y `[0.00, 1.56]` |
| `mannequin_body` | `body` | 5,738 | x `[-0.76, 0.76]`, y `[-0.00, 1.71]` |

**Only two nodes, and both span the whole figure.** 0 skins, 0 animations, 0 images, 0
textures. **There is no per-limb node** — parts require spatial triangle segmentation.

The mesh is a **T-POSE**: width 1.519 × height 1.712, **aspect 0.887** (arms-down would be
≈0.3), and maximum |x| occurs at shoulder height. Pose-tool task 09 segmented it by the mesh's
own structure — **crotch split** (disjoint x-clusters below y ≈ 0.47), **neck pinch** (|x| < 0.06
at y ≈ 0.84), **arm bar** (|x| > 0.25 only in y ≈ 0.76–0.81) — and those landmarks are recorded
in `MANNEQUIN_REGIONS`' comments. ⚠️ Task 09's *first* estimates put Arm and Hand over **zero
vertices** because they assumed arms at the sides; **every part must be asserted non-empty.**

**Shading — the owner's fifth complaint.** `ui/canvas/pose/poseMeshes.ts:422` sets
`flatShading: true` on the `MeshLambertMaterial` built at `:416`; the comment at `:402-408`
currently argues *for* facets. Segment constants at `:73-84`: sphere 16×12, cylinder radial 16,
cylinder height 1 — pinned by `describe("segment counts")` in `__tests__/poseMeshes.test.ts`
with `<= 24` upper bounds and a "stays low-poly on purpose" rationale that the owner has now
overruled.

**Framing blast radius** (measured — code references, not prose):
`ui/canvas/pose/{poseMeshes,poseTypes,poseCamera}.ts` + their tests · `stores/ui/PoseUIStore.ts`
+ test · `containers/CanvasContainer.tsx` · `containers/PixelStudioPanelContainer.tsx` ·
`ui/components/PosePanel/{PoseSection.tsx,PoseSection.stories.tsx,PosePanel.css,__tests__/PoseSection.dom.test.tsx}`.
`ApplicationStore.ts:422`, `poseEngine.ts:205/266`, `railVisibility.ts:14` and
`store/__tests__/helpers.test.ts:295` match **only in prose comments** — no code change needed.

**The panel seam.** `PixelStudioPanel.tsx:135` takes `pose?: PoseSectionProps` — **one optional
grouped object** — with `showPoseControls` at `:161` and the mount at `:304-313`. Extending the
grouped object needs **no edit to `PixelStudioPanel.tsx`**.

**Still-unverified ground.** All **30 manual checks** in `docs/06-pose-tool/HANDOFF.md` §7 remain
**unperformed** — no agent has had a browser or GPU. In particular the **depth-derived heights
were reasoned from three's shader source and never run on a GPU**, and they share the readback
path this plan adds the outline to. No task may assume that path is proven.

## 5. Wave table

| Wave | Tasks | Parallel | Gate that must pass before the next wave |
| --- | --- | --- | --- |
| **W1** | 01 free zoom + fit seam · 02 smooth normals + tesselation | 2 agents | From `client/`: `bunx tsc --noEmit` **0** · `bunx eslint .` **0 errors** · `bunx vitest run` **all pass** · `bun run lint:boundaries` **OK** · lockfile check **empty** |
| **W2** | 03 panel colours/fit/slider · 04 outline post-pass | 2 agents | same gate **+** `bunx stylelint` **exactly 2 errors** · `bunx storybook build` **0** |
| **W3** | 05 mannequin part meshes (deletes framing from `ui/canvas/pose/`) | 1 agent | ⚠️ **`tsc` may legitimately FAIL** on task-06-owned files still referencing `PoseFraming`. Required: `bun run lint:boundaries` **OK**, task 05's own suites pass, every part proven **non-empty**, and the exact `tsc` errors reported |
| **W4** | 06 container integration (closes the type hole) | 1 agent | full gate green again: `bunx tsc --noEmit` **0** · eslint **0 errors** · vitest **all pass** · boundaries **OK** · stylelint **2 errors** · `git diff -- UIStore.ts` **empty** · no lockfile |
| **W5** | 07 gate, QA sweep, handoff | 1 agent | `bun run verify` **exit 0** at root; `bun run dev` starts all three processes |

⚠️ **W3 is the one wave that may end with a red `tsc`, by design.** Task 05 owns the `ui/`
half of the framing deletion and task 06 owns the store/container half; splitting them is what
keeps `CanvasContainer.tsx` in a wave of its own. The coordinator must not treat W3's red
`tsc` as a failure **provided** the errors are confined to task-06-owned files and are listed.

## 6. Dependency graph

```
01 zoom/fit seam ──┐
                   ├──► 03 panel (colours, fit btn, slider) ──┐
02 shading ────────┤                                          ├──► 06 container ──► 07 gate/QA
                   │   04 outline post-pass (independent) ────┤
                   └──► 05 part meshes ───────────────────────┘
```

- **01 and 02** are independent of everything and of each other.
- **03** ← 01 (needs `requestFit()` to wire the button).
- **04** ← nothing. It is pure array maths and could run in any wave; it sits in W2 to balance
  the waves and because task 06 consumes it.
- **05** ← 02 (same file — `poseMeshes.ts` — so they must not share a wave).
- **06** ← 01, 02, 03, 04, 05. The integration task.
- **07** ← everything.

## 7. Collision matrix

**W1 — two tasks**

| Task | Touches |
| --- | --- |
| 01 | `stores/ui/PoseUIStore.ts` · `stores/ui/__tests__/PoseUIStore.test.ts` |
| 02 | `ui/canvas/pose/poseMeshes.ts` · `ui/canvas/pose/__tests__/poseMeshes.test.ts` |

Disjoint — different subtrees entirely (`stores/` vs `ui/canvas/`).

**W2 — two tasks**

| Task | Touches |
| --- | --- |
| 03 | `ui/components/PosePanel/{PoseSection.tsx,PosePanel.css,PoseSection.stories.tsx,__tests__/PoseSection.dom.test.tsx}` · `containers/PixelStudioPanelContainer.tsx` |
| 04 | `ui/canvas/pose/poseOutline.ts` (new) · `ui/canvas/pose/__tests__/poseOutline.test.ts` (new) |

Disjoint — 03 is entirely `ui/components/` + one container; 04 creates two new files under
`ui/canvas/pose/` and edits nothing existing.

**W3, W4, W5 are single-task waves** and need no matrix. Task 06 owns `CanvasContainer.tsx`
exclusively, which is why it is alone.

## 8. Alignment guide

**Names to hold** (a synonym invented here breaks the next task):

- `poseOutline.ts` / `applyOutline()`; store field `edgeWidth` + `setEdgeWidth`.
- `fitGeneration` + `requestFit()`; panel callback `onRequestFit`.
- Part ids exactly as task 05 reports them — task 06 mirrors that union character for character.
- Existing names unchanged: `PoseUIStore` / `app.pose`, `poseTypes.ts`, `poseEngine.ts`,
  `poseMeshes.ts`, `poseCamera.ts`, `poseStamp.ts`, ref `poseCanvasRef`, BEM blocks
  `pose-panel` and `direction-orb`, `canvas__overlay--pose`, `pose?: PoseSectionProps`.

**Analogues to imitate:**

| Building | Copy the shape of |
| --- | --- |
| Pure pixel maths + exhaustive tests | `ui/canvas/pose/poseStamp.ts` and its 46-test suite |
| Consuming the app colour picker | `containers/ColorPickerContainer.tsx:105-127` |
| A pure rail control | the existing `DirectionOrb` / `PoseSection` (props in, callbacks out) |
| Store field + action + session-only doc header | `PoseUIStore`'s existing fields |
| An independent overlay repaint cadence | the pose overlay's own `useCanvasRender` (D11) |

**Boundaries that must not be crossed:**

- Nothing under `ui/` imports a store, the API, `services/`, MobX, or calls `useContext` —
  **type-only imports included**. `three` is fine (D15). `observer()` only in `containers/`.
- **No key added to `toPersistedUIState()`.** `git diff -- UIStore.ts` must be empty at the end.
- Pixel grids are `observable.ref`; never deep-observed, never mutated in place.
- The render target stays **exactly `cellWidth × cellHeight`**; no scaling `drawImage`, no
  `antialias: true`, no `LinearFilter`. The outline runs at 1:1.
- The pose overlay keeps its **own** `useCanvasRender`; **no `useState` on a pointer path**.
- No numeric `z-index` in new CSS; stylelint stays at **exactly 2 errors**.
- No `will-change: transform` anywhere in the canvas stack.
- `three` stays lazy: dynamic `import("three")`, `import type` only at module level.

**What "done" looks like, visually:** a chunky 3D reference that shades as a *smooth gradient*
rather than flat facets, wrapped in a crisp N-pixel outline in the Edge colour, at the
artwork's own resolution. Clicking **Head** puts a head on screen — alone, centred, filling the
frame. The model can be zoomed far past the canvas and dragged completely off it, and one press
of **Fit** brings it back to a tidy fit at whatever rotation it is currently in.

**The five mistakes an executor is most likely to make:**

1. **Unclamping zoom and stopping there.** The fold into `fitCameraToMesh`'s padding is the
   other half of the bug (E12). Task 06 owns it.
2. **Seeding a default `fillColor`.** It is tri-state; a default adds a key to 151 corpus
   snapshots. Always read `fillColorOrSelected`.
3. **Building parts by vertex instead of by triangle**, leaving holes and dangling indices —
   or shipping a part with zero triangles, exactly the T-pose bug task 09 already hit once.
4. **Letting the unions drift** between `poseTypes.ts` and `PoseUIStore.ts`. They duplicate on
   purpose and must change together (E20).
5. **Treating W3's red `tsc` as a failure**, or reaching outside `Touches` to silence it.

Also easy to get wrong: an outline that overwrites the model's own edge pixels instead of going
around them; forgetting that `canvas.width =` re-enables `imageSmoothingEnabled`; letting a
part revert to flat shading after task 02 enabled smooth normals; and creating a lockfile.

## 9. Risk register

| Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Unclamping zoom does not actually fix the cap, because the fit re-normalises it | **High** | High | E12 makes the separation explicit and assigns it to task 06; task 01's file cannot fix it alone and says so | 01, 06 |
| A mannequin part builds with **zero triangles** (the T-pose bug, already hit once) | Med | **High** | Every part asserted non-empty; triangle counts reported; measured landmarks reused rather than re-estimated | 05 |
| Union drift between `poseTypes.ts` and `PoseUIStore.ts` | Med | High | E20; task 05 reports the exact shape, task 06 mirrors it; `tsc` catches a mismatch | 05, 06 |
| W3 leaves `tsc` red and a coordinator treats it as failure | **High** | Med | Stated in the wave table, the task file and here; W3's gate explicitly excludes `tsc` | 05, coordinator |
| Outline overwrites the model's own edge pixels | Med | Med | Explicit test: opaque pixels are never overwritten; silhouette read from the original alpha | 04 |
| Outline and stamp disagree about the silhouette | Low | Med | E6 pins the alpha threshold to the stamp's `>= 128`, with the coupling documented | 04, 06 |
| Smooth normals silently change stamped normals and surprise the owner | **High** | Low | E18 — intended, but must be reported and checked in the lighting studio | 02, 06 |
| Seeding `fillColor` changes 151 corpus digests | Low | **High** | E8; always `fillColorOrSelected`; corpus digests in every wave gate | 03, 06 |
| A key reaches `toPersistedUIState()` | Low | **High** | `git diff -- UIStore.ts` must be empty, checked in W4 and W5 | 06, 07 |
| New CSS raises the stylelint error count | Med | Low | Compare to exactly 2 before committing | 03, 07 |
| `bunx` writes a lockfile | **High** | High | Sweep after every invocation, in every task | all |
| Raising segment counts hurts frame time | Low | Low | A few thousand triangles into a tiny target; not a real trade-off at this scale — but task 07 records the bundle and the owner checks interactivity | 02, 07 |
| Building on the 30 unperformed checks from plan 06 (esp. GPU depth heights) | **High** | Med | No task may assume that path is proven; task 07 merges both lists into one honest checklist | all, 07 |

## 10. Rules for every executor

1. **Bun only.** `node`/`npm` are not on PATH. Use `bun` / `bunx`.
2. **Never create a lockfile.** `bunx` **does** recreate `client/bun.lock` here. After *every*
   `bunx`, run `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` and delete
   anything found. Never remove `save = false` from `bunfig.toml`. `--frozen-lockfile` must
   never appear. Any `bun add` needs `--exact` (this plan should add no dependency).
3. **Never `vitest -u`.** The corpus, round-trip and `persistedUIState` snapshots must pass
   **unchanged**.
4. **The wire format does not change.** No key is added to `toPersistedUIState()`;
   `git diff -- client/src/stores/ui/UIStore.ts` must be empty.
5. **Never break `bun run dev`.**
6. **The `ui/` boundary.** No store, API, `services/`, MobX or `useContext` under
   `client/src/ui/` — type-only included. `observer()` only in `containers/`. Run
   `bun run lint:boundaries`.
7. **Never deep-observe a pixel grid**, never mutate one in place.
8. **Stay inside your task's `Touches` list.** If you need a file that is not yours, **stop**
   and record what you needed and why. (Task 05 is *expected* to leave other files broken —
   that is the plan, not an exception to this rule.)
9. **Commit at task granularity** on a branch. Never commit to `main`.
10. **Report honestly, including partial completion.** Never mark a task done while claiming
    manual checks that nobody performed. `PARTIAL` is a legitimate outcome.

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Free zoom/pan, and a Fit button seam | W1 | M | Delete `POSE_ZOOM_MAX`, sanitise instead of clamp, add `fitGeneration` + `requestFit()` |
| 02 | Smooth vertex normals, more polys | W1 | S | `flatShading` off; raise sphere/cylinder segments; update the pinned bounds deliberately |
| 03 | Panel: app colours, Fit button, edge slider | W2 | M | Replace native colour inputs with Fill/Edge swatches; add Fit button and 1–4 px thickness slider |
| 04 | The outline post-pass | W2 | M | Pure, exhaustively tested silhouette dilation at 1:1 — `poseOutline.ts` |
| 05 | Mannequin part meshes; delete framing | W3 | L | Spatial triangle segmentation into real per-part geometry; remove `PoseFraming` from `ui/` |
| 06 | Container integration | W4 | L | Close the type hole, separate zoom from fit, wire colours/outline/parts, react to `fitGeneration` |
| 07 | Full gate, QA, handoff | W5 | M | `bun run verify`, bundle check, one consolidated risk-ordered manual checklist |
