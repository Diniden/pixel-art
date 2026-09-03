# HANDOFF — Pose tool

**Current position:** W3 DONE (task 08) — W4 next
**Branch:** `feat/06-pose-tool`
**Last commit:** `2dcdd42`
**Plan written:** 2026-09-02 · Planning baseline HEAD: `cd7a852`

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | DONE | 2026-09-02 | `2073de6` | tsc 0 · eslint 0 err/65 warn · vitest 140 files 2571 tests · boundaries OK · stylelint 2 err · no lockfile |
| W2 | 06, 07 | DONE | 2026-09-03 | `f4ef0de` | tsc 0 · eslint 0 err/65 warn · vitest 145 files 2737 tests · boundaries OK · stylelint 2 err · no lockfile |
| W3 | 08 | DONE | 2026-09-03 | `2dcdd42` | tsc 0 · eslint 0 err/65 warn · vitest 145 files 2737 tests · boundaries OK · stylelint 2 err · build OK · no lockfile · **24 manual checks OWED** |
| W4 | 09 | TODO | | | |
| W5 | 10 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Register the `pose` tool | W1 | DONE | `74e709b` | Tool union 18, `pose: {}`, hotkey P/p, Box button last. 5 manual checks owed. |
| 02 | `PoseUIStore` + wiring | W1 | DONE | `23906d5` | 11 fields, 25 tests. Cleared on `loadGeneration`, NOT `adoptTree`. Not persisted. |
| 03 | three.js + engine skeleton | W1 | DONE | `14ee191` | three 0.185.1 / @types 0.185.4, both exact. Lazy chunk proven: 734 kB split. |
| 04 | Pose overlay canvas | W1 | DONE | `bc27135` | Overlay before reflection (754 < 769). CSS comment-only. Negative control run. |
| 05 | `PixelStore.setPixelCells()` | W1 | DONE | `2073de6` | `setPixelCells` additive, one history entry. Corpus digests unchanged. |
| 06 | Meshes, camera, auto-fit, stamp math | W2 | DONE | `f4ef0de` | 133 tests. Fuzzed applyEulerXYZ vs three (2.2e-15). ⚠️ setCamera widening owed to 08. |
| 07 | Pose rail section + orbs | W2 | DONE | `5193dfd` | 33 tests. One DirectionOrb used twice. Added a Clear-pose button. 9 manual checks owed. |
| 08 | `CanvasContainer` integration | W3 | DONE | `2dcdd42` | Own `useCanvasRender`; lazy engine + token guard; 3-pass stamp. **Depth fallback NOT needed.** 24 manual checks owed. |
| 09 | Vendor the CC0 mannequin | W4 | TODO | | May legitimately end BLOCKED |
| 10 | Full gate, QA, handoff | W5 | TODO | | |

## Known state at planning time (2026-09-02)

✅ **RESOLVED 2026-09-02 by /plan-go, with owner sign-off.** The in-flight edge/fill colour
split was complete and green (tsc 0 · eslint 0 errors · 2497/2497 tests · boundaries OK ·
stylelint 2 errors · no lockfile), so it was committed on its own as `45e3c8a
"feat(color): split the edge colour from the fill colour"`. The plan folder was then
committed as `35d1644` on a fresh `feat/06-pose-tool` branched from it. **Executors get a
clean tree — no `git add -p` hunk-staging is needed, and the four-shared-file risk is gone.**
The four files are now at their post-split state; task 01 and 08 must read them as they are
rather than as MASTER.md's line numbers describe (the line numbers may have shifted).

The original warning, for the record:

⚠️ **The worktree was DIRTY when this plan was written.** 27 modified files and 1 untracked,
an unrelated in-flight **edge/fill colour split** (`ToolUIStore.fillColor`, `colorTarget`,
`ColorPicker` tabs, a new `"pixel-unbounded"` snap mode, marker policy). It shares four files
with this plan:

- `client/src/types/domain.ts` (task 01)
- `client/src/ui/components/Toolbar/PixelStudioTools.tsx` (task 01)
- `client/src/stores/ui/UIStore.ts` (not in any Touches list — do not edit)
- `client/src/containers/CanvasContainer.tsx` (task 08)

**Ideally that work is committed or stashed before `/plan-go` runs.** Otherwise every
executor touching those files must stage only their own hunks with `git add -p`, and must
never revert or commit someone else's work.

**Gate baseline measured 2026-09-02:**

- `bunx tsc --noEmit` → exit 0, clean
- `bunx stylelint "src/**/*.css"` → exit 0, **2 errors** (`ConfirmDialog.css:15`,
  `IconButton.css:32`) + 67 warnings. **This 2-error baseline is pre-existing.**
- No lockfile present anywhere.
- No 3D library installed; no WebGL context created anywhere in `client/src`.

## Deviations

- **2026-09-02 · pre-W1 · owner-approved.** The plan assumed the dirty worktree might have to
  be worked around with `git add -p`. Instead the unrelated edge/fill work was committed
  first (`45e3c8a`) and the pose branch cut from it, so risk-register row 1 ("Dirty
  worktree", High/High) **does not apply to this execution**. MASTER.md's stated line
  numbers for `types/domain.ts`, `PixelStudioTools.tsx`, `UIStore.ts` and
  `CanvasContainer.tsx` predate that commit — locate symbols by name, not by line.
- **2026-09-02 · W1 · task 01.** Corrected four stale doc counts its change falsified
  ("16-tool union"→18, "17th tool"→19th in `toolHandlers.ts`; "17-member"→18, "12 tool
  hotkeys"→13 in `useCanvasKeyboard.ts`) and renamed the `maps all 12 tools` test to 13 —
  that assertion is `expect(tools.size).toBe(12)` and would otherwise fail. In-scope files,
  no behaviour change.
- **2026-09-02 · W1 · task 02.** `clamp()` treats only `NaN` as "fall back to min";
  infinities clamp to the bound they run into, so `setFov(Infinity)` gives 120 rather than
  10. Both pinned by tests.
- **2026-09-02 · W1 · task 03.** Added `setCamera()`/`getCamera()` to `PoseEngine` beyond
  the stated surface, so task 06 has a public seam for its camera. Also confirmed
  `bun add --exact` **does** write `client/bun.lock` — deleted after every invocation, and
  the coordinator re-verified the tree is lockfile-free.
- **2026-09-02 · W1 · task 04.** Added **no** `.canvas__overlay--pose` declarations, only a
  comment block: nothing differs from the `.canvas__overlay` base, and both sibling
  modifiers (`--hover`, `--reflection`) are comment-only by explicit design. Also added
  `:not(--pose)` to an existing overlay-counting test that would otherwise have silently
  stopped asserting anything.
- **2026-09-02 · W1 · task 05.** Added 4 tests beyond the 7 specified, all pins on the new
  action only. Flagged that `after` does not deep-copy caller objects (see Notes).
- **2026-09-02 · W1 · coordinator.** MASTER.md's stylelint baseline named the wrong files.
  Corrected in place: the 2 errors are `OtherHand.css:338`/`:359`.
- **2026-09-03 · W2 · task 06.** Its own first draft had three bugs, all caught by testing
  against the real library rather than by reasoning: `applyEulerXYZ` composed the rotations
  in the wrong order (three's "XYZ" is `Rz·Ry·Rx`); all four side/top/bottom viewpoint
  rotations were sign-inverted; and `-0` leaked into normals because `(128,128,128)` decodes
  to `0.00392`, not `0`, so an exact-zero guard never fired. Also fixed a `far <= near`
  inversion for a point-sized bounding box. Worth recording because it is evidence the
  fuzzing was load-bearing, not decoration.
- **2026-09-03 · W2 · task 06.** `MannequinUnavailableError` sets `cause` as an own field
  rather than `super(message, { cause })` — the project targets **ES2020**, whose `Error`
  type takes no options argument. Same observable shape; no compiler-target change.
- **2026-09-03 · W2 · task 07.** Three orb maths helpers were made module-private:
  exporting them tripped `react-refresh/only-export-components` as 3 eslint **errors**.
  They are exercised through the rendered DOM.
- **2026-09-03 · W2 · task 07.** `DirectionOrb` gained a `mode` prop beyond the stated
  surface (the two orbs carry different value kinds), and a **Clear pose** button was added
  that is not in the task's control table — without it there is no way to unload a mesh,
  since `onSelectMesh` cannot pass `null`. Coordinator verified it is a plain callback to
  the store's existing `clear()`.
- **2026-09-03 · W2 · coordinator.** **Task 08's `Touches` extended** to allow widening
  `setCamera`/`getCamera` in `poseEngine.ts`. See the authorised-scope-extension section.


- **2026-09-03 · W3 · task 08.** The authorised `setCamera`/`getCamera` widening was taken,
  as a **union** (`PoseEngineCamera = PerspectiveCamera | OrthographicCamera`) rather than
  the bare `Camera` base class. `resize()` narrows on the perspective discriminant to refresh
  the aspect ratio, and only a union makes that visible to the compiler. ⚠️ Both classes
  declare only their OWN `is*Camera` flag, as the literal `true`, so a direct property read
  does not compile on the union — the narrowing had to be written as
  `"isPerspectiveCamera" in camera`, in the engine and in the container's fit effect.
  `setPixelRatio(1)` was not touched.
- **2026-09-03 · W3 · task 08.** **The engine is NOT disposed on tool deselect**, only on
  unmount. The task text says "dispose on tool deselect and on unmount"; disposing on
  deselect would build and destroy a WebGL context on every tool switch, which is manual
  check 22's own leak scenario (20 switches against a browser cap of ~16) arriving from the
  other direction. One idle context is held for the container's lifetime; it renders nothing
  while inactive. Geometries and materials ARE disposed on every mesh change, through
  `setObject3D`'s ownership transfer.
- **2026-09-03 · W3 · task 08.** **The user's `zoom` is folded into the auto-fit's PADDING**
  (`padding = 1 - (1 - 0.1) * zoom`) rather than applied as a separate camera scale, so
  `fitCameraToMesh` stays the single owner of how big the model is. Verified headlessly:
  zoom 1 gives exactly the D7 90% fill of the shorter axis on a 64x32 canvas; zoom 10 clamps
  to padding 0 and still yields a finite frustum; zoom 0.1 gives 0.91, inside the fit's 0.95
  ceiling.
- **2026-09-03 · W3 · task 08.** **The pan is applied as a whole-image translation in the
  PAINTER, not by moving the camera** — a camera pan would re-fit and re-rasterise, and the
  drag exists to slide the picture the user is already looking at. It is rounded to whole
  cells in the painter AND in the stamp, with the same `Math.round`, so the two cannot
  disagree at a half-integer pan.
- **2026-09-03 · W3 · task 08.** ⚠️ **A variant-edit offset bug was found and fixed during
  self-review, before commit.** The stamp's offset must be `variantOffset`, NOT `viewMin`.
  Derived from `placeHoverCells` (`canvasX = gridX + (variantOffset.x - viewMinX)`): the
  painter puts texel (0,0) at canvas column `round(pan.x) - viewMinX`, so inverting gives a
  GRID column of `round(pan.x) - variantOffset.x` — the `viewMin` terms cancel exactly, and
  `setPixelCells` writes the VARIANT's own grid while one is being edited. The first draft
  used `viewMin` and would have been wrong by `variantOffset - viewMin`, visible ONLY while
  editing a variant.
- **2026-09-03 · W3 · task 08.** `poseEngineTick` is a `useState` counter that ticks exactly
  ONCE per engine, so the mesh/camera/light effects (which cannot run against a `null`
  engine) get a chance to run after the async create resolves. It is not on any pointer path.

## Blocked items

(none — the authorised scope extension covered the only file task 08 needed beyond its
`Touches`, and the depth-readback fallback was not required.)

## Manual check results

### W1 — verified by the coordinator, 2026-09-02

Gate run by the coordinator against the combined tree at `2073de6` (not taken from any
subagent's report — each of theirs was measured on a moving worktree while siblings wrote):

```
bunx tsc --noEmit              exit 0
bunx eslint .                  ✖ 65 problems (0 errors, 65 warnings)
bunx vitest run                Test Files 140 passed (140) · Tests 2571 passed (2571)
bun run lint:boundaries        check-boundaries: OK — all 5 boundary rules hold.
bunx stylelint "src/**/*.css"  ✖ 69 problems (2 errors, 67 warnings)
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   → empty
```

Coordinator spot-checks, all passing: 18 changed files, all inside the union of the five
`Touches` lists (no scope creep); no `stores/`/`mobx`/`services/` import anywhere under
`ui/canvas/pose/` or in `CanvasSurface.tsx`; `UIStore.ts` untouched, so `toPersistedUIState()`
gained no key (D6); no `z-index` or `will-change` declaration added (the grep hits are
comment text explaining the prohibition); `three` and `@types/three` pinned bare with no
`^`/`~`; the only `from "three"` is an `import type` (erased at build — D2's lazy loading
is intact, and task 03's probe build measured the 734 kB chunk separately); pose overlay at
`CanvasSurface.tsx:754`, reflection at `:769`, so DOM order satisfies D10.

### W2 — verified by the coordinator, 2026-09-03

Gate run by the coordinator against the settled tree at `f4ef0de`. **Task 07 reported a tsc
error and 2 test failures in task 06's files; those were mid-write and are GONE from the
settled tree** — this is why the coordinator's gate, not a subagent's, is the one recorded:

```
bunx tsc --noEmit              exit 0
bunx eslint .                  ✖ 65 problems (0 errors, 65 warnings)
bunx vitest run                Test Files 145 passed (145) · Tests 2737 passed (2737)
bun run lint:boundaries        check-boundaries: OK — all 5 boundary rules hold.
bunx stylelint "src/**/*.css"  ✖ 70 problems (2 errors, 68 warnings)   ← 2 errors = the gate's bar
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   → empty
```

Stylelint warnings moved 67 → 68 (`PosePanel.css:88`, a known-benign
`no-descending-specificity` false positive on a `:hover:not(:disabled)` / `:disabled` pair).
**The gate's bar is the ERROR count and it is still exactly 2.**

Coordinator spot-checks, all passing: 14 changed files, all inside the two `Touches` lists
(no scope creep); no `stores/`/`mobx`/`services/`/`api` import under `ui/canvas/pose/` or
`ui/components/PosePanel/`; no `observer()` in the pure components (the one grep hit is
comment text); the Clear-pose button is a plain `onClear` callback wired to the store's
existing `pose.clear()` in the container, mirroring reflection's `onClearAll` — no new
behaviour invented.

### ⚠️ Manual checks OWED to the owner — W2 (nobody has performed these)

All 9 of task 07's manual checks are unperformed — no subagent had a browser or a device:

13. Select Pose in the running app — the rail shows the Pose section; Pencil/Eraser swap it out.
14. Every button and slider reachable; active styling correct.
15. **Drag both orbs with a mouse**, including moving the cursor off the orb mid-drag
    (the `setPointerCapture` contract). *Unit-covered by a spy, never observed live.*
16. **Drag both orbs by TOUCH — the rail must not scroll.** This is the `touch-action: none`
    line. jsdom cannot exercise it at all, and given the owner's iPad this is **the single
    most important unverified behaviour in W2.**
17. Framing disabled for primitives / enabled for the mannequin; FOV disabled in orthographic.
18. Clicking a viewpoint button visibly moves the rotation orb's handle.
19. Colour inputs change their swatches.
20. Switch projects — the section resets (proves task 02's `clear()` reaction end to end).
21. Rail layout at narrow width; the section scrolls if it overflows. *The stories mount at
    the rail's real 240 px, so this is reviewable in Storybook.*

### ⚠️ Manual checks OWED to the owner — W1 (nobody has performed these)

No subagent had a browser. Every check below needs the owner at the running app. None
block W2, but **task 10's QA sweep must cover them.**

From task 01 (tool registration):
1. The Box icon renders last in the toolbar, tooltip reads "Pose (3D reference)".
2. Clicking it applies active styling; console stays clean.
3. `P` selects it; another hotkey moves off it. *(3 hotkey tests pass, but unobserved.)*
4. Click-dragging the canvas with pose selected draws nothing and does not throw.
   *(Structurally guaranteed by the empty `pose: {}` handler — no `onDown`/`onMove` exists.)*
5. Undo/redo still work after selecting pose.

From task 04 (overlay):
6. **No visual change at all** anywhere in the pixel studio. The overlay is transparent and
   empty; any visible difference means the canvas stack was disturbed.
7. Resize the object in the app; the pose canvas's `width`/`height` follow.
8. Draw with the pencil — marching ants and the origin cross still render above the artwork.
9. Open the lighting studio; `LightingCanvasContainer` still renders correctly.

From task 05 (`setPixelCells`):
10. Draw / erase / flood fill / lighting normal + height tools all behave unchanged.
11. Undo/redo across a mixed draw + normal + height sequence.
12. Save indicator behaves normally, no spurious saves.

From task 02: switching projects then undoing several times produces no console errors.
*(Covered non-visually by three tests: `adoptTree` leaves pose intact, `loadGeneration`
clears it, `dispose()` stops the reaction.)*

Also unperformed by anyone: the full three-process `bun run dev` under mprocs. Each agent
started only the Vite client (on a non-default port) to avoid seizing ports from siblings.
All four confirmed the client serves HTTP 200 and transforms the new modules.

### ⚠️ W3 — task 08's 24 manual checks: **ALL 24 ARE OWED, NONE WERE PERFORMED**

**The executor had no browser and no automation driver.** Chrome, Safari and Firefox are
installed on the machine, but neither Playwright nor Puppeteer is in `node_modules`, and
installing one would have touched `client/package.json` (outside `Touches`) and risked a
lockfile. jsdom has no WebGL, so the `dom` lane cannot exercise a single line of the GL path.

**This matters more here than in W1/W2: these are the checks that exercise the GL pipeline
for the first time.** Nothing below has been SEEN. Do not treat the green gate as evidence
that the picture is right — the gate proves the code compiles, lints, tests and builds, and
proves nothing whatsoever about what appears on screen.

| # | Check | Status |
| --- | --- | --- |
| 1 | Cube/Sphere/Cylinder appear centred, ~90% of the shorter axis, with padding | **NOT PERFORMED** — but the fit maths was verified headlessly: on a 64x32 canvas the model's projected half-extent is exactly 0.9 of the frustum's shorter axis |
| 2 | The render is visibly PIXELATED — hard blocky edges, no AA silhouette | **NOT PERFORMED.** Structurally: `antialias: false`, `samples: 0`, `NearestFilter` on both filters, target exactly `cellWidth x cellHeight`, `putImageData` at 1:1, `imageSmoothingEnabled = false` on every paint. Every known lever is set correctly; none was observed. |
| 3 | Zoom the view — the model stays crisp and grid-aligned | **NOT PERFORMED.** The pan is rounded to whole cells in the painter, which is the alignment mechanism. |
| 4 | Renders above every layer, below the ants / origin cross / reflection guides | **NOT PERFORMED.** DOM order verified statically in W1: pose overlay at `CanvasSurface.tsx:751`, reflection at `:769`, SVG chrome last. |
| 5 | Light-orb drag moves the shading in real time, no lag | **NOT PERFORMED** |
| 6 | Rotation-orb drag tumbles the model smoothly | **NOT PERFORMED** |
| 7 | Each viewpoint button snaps correctly | **NOT PERFORMED.** ⚠️ See the gap noted below — the container does not read the viewpoint buttons directly; they write `pose.rotation`, which it does read. |
| 8 | Each camera preset changes the projection; Iso reads as TRUE isometric | **NOT PERFORMED.** The preset's pitch/yaw/projection are read and passed to `fitCameraToMesh`; the iso pitch is `atan(1/√2)`, pinned by task 06's tests. |
| 9 | Perspective ↔ Orthographic toggles visibly; zoom scales; FOV affects only perspective | **NOT PERFORMED.** ⚠️ Note: a PRESET overrides the store's `projection`, so the projection toggle is only visible on a preset whose projection matches — see the gap below. |
| 10 | Light colour and model colour both change the render | **NOT PERFORMED** |
| 11 | **Mouse**: drag pans; does not rotate; does not draw | **NOT PERFORMED.** Structurally guaranteed against drawing by `isGestureTool` + the empty `pose: {}` handler. |
| 12 | **Touch**: the same drag works and does not scroll or draw | **NOT PERFORMED. This is the highest-risk unverified item** — the owner uses an iPad. The branches are placed before the `isGestureTool` bails in `handleTouchStart` and `handleTouchMove`, which is the documented failure mode, but placement was verified by reading, not by touching glass. |
| 13 | Double-click stamps; **touch double-tap also stamps** | **NOT PERFORMED.** Detected explicitly (400 ms / 2 cells / a ref), never via `dblclick`. |
| 14 | Stamped pixels land EXACTLY where the model was drawn — no offset | **NOT PERFORMED.** The painter and the stamp share one `Math.round(pan)`; the variant-edit term was derived from `placeHoverCells` and corrected pre-commit (see Deviations). **The non-variant path is the simple one and is most likely right; the VARIANT path is the one to check hardest.** |
| 15 | ONE Ctrl+Z removes the whole stamp; one Ctrl+Y restores it | **NOT PERFORMED.** Guaranteed structurally by `setPixelCells`' single `commitCells`, which task 05 pinned with tests. |
| 16 | With a selection active, the stamp is MASKED | **NOT PERFORMED.** `app.selectionUI.writeOptions` is passed; `setPixelCells` gates through `allows()`. |
| 17 | In the lighting studio the stamped pixels carry sensible normals and heights | **NOT PERFORMED. Depth was NOT the fallback** — see the note below. The Y-negation convention is task 06's, untouched. |
| 18 | Resize the object — the overlay resizes, stays 1:1, and the model RE-FITS | **NOT PERFORMED.** `cellWidth`/`cellHeight` are dependencies of both the resize effect and the fit effect. |
| 19 | Pan then resize — the pan is preserved. Change mesh — the pan resets. | **NOT PERFORMED.** The fit effect neither reads nor writes the pan; `PoseUIStore.setMesh` resets it. |
| 20 | Switch tools — the overlay disappears. Switch back — the pose is still there. | **NOT PERFORMED.** `poseActive` gates the painter; the store is untouched by a tool switch. |
| 21 | Switch projects — the pose is cleared | **NOT PERFORMED.** Task 02's `loadGeneration` reaction; covered by its tests. |
| 22 | **20 tool switches + 20 mesh changes, then no `Too many active WebGL contexts`** | **NOT PERFORMED. THIS IS THE LEAK CHECK AND IT IS THE MOST IMPORTANT ONE OWED.** By construction there is exactly ONE context per mount (created once, never disposed on deselect, disposed once on unmount), so 20 tool switches create 20 - 1 = 0 extra contexts. Mesh changes go through `setObject3D`, which disposes the outgoing geometry and materials. **Argued, not observed.** |
| 23 | **StrictMode**: no doubled renderer, no doubled overlay, no console error | **NOT PERFORMED.** Guarded by the ref check, the `cancelled` flag and `poseTokenRef`; a create that loses the race disposes its own engine. **Argued, not observed.** |
| 24 | Drawing performance with a large sprite is unchanged while pose is NOT selected | **NOT PERFORMED.** Structurally: nothing pose-related is in the main `render`'s dependencies, no engine is created until the tool is first selected, and the painter early-returns when `poseActive` is false. |

**The wall-clock time of a full-canvas stamp was NOT measured** — it needs a running GL
context on a real object. Task 10's QA sweep must take it.

### Depth readback: the D8 fallback was **NOT** needed

The obstacle D8 anticipated is real — `readRenderTargetPixels` is RGBA-only, so the depth
ATTACHMENT cannot be read back directly. It is sidestepped rather than hit:
`MeshDepthMaterial` with `BasicDepthPacking` writes `1 - ndcDepth` into RGB as luminance, so
the engine's existing RGBA readback **is** the depth buffer, with **nearer = larger**. The
fallback is still wired and still live: if the pass throws or returns the wrong size,
`depth` is passed as `null`, every height becomes the `0` "no data" sentinel, and colour and
normal still land.

⚠️ **Untested against a real GPU.** The shader was read out of
`three/src/renderers/shaders/ShaderLib/depth.glsl.js` at 0.185.1 and the mapping reasoned
from it. **Manual check 17 is what confirms it**, and if the heights come back uniform or
inverted, the depth pass is where to look first.

### Gaps found in the plan while integrating (for task 10, not blockers)

1. **The viewpoint buttons are not wired to anything task 08 owns.**
   `POSE_VIEWPOINT_ROTATIONS` lives in `poseCamera.ts` and task 07's panel calls
   `onSetRotation`, so a viewpoint click writes `pose.rotation` and the container picks it
   up like any other rotation. Nothing is missing — but no code in the container references
   the viewpoint table, so manual check 7 is really a check on task 07's wiring.
2. **A camera PRESET overrides the store's `projection`.** D14 says a preset "sets projection
   + angles", and the fit effect implements exactly that: `preset.projection ?? store
   .projection`. The consequence is that the rail's Perspective/Orthographic toggle has no
   visible effect while a preset whose projection differs is selected. That follows from D14
   as written; flag it to the owner as a UX question rather than a bug.
3. **In variant-edit mode the overlay spans the EXPANDED view while the stamp targets the
   smaller variant grid.** Cells outside the variant are filtered by `setPixelCells`, so the
   model stamps cropped to the variant — which is the right behaviour, but it means the
   visible reference is larger than the stampable area. Worth a line in the QA notes.

### Verification output — task 08, run by the executor at `2dcdd42`

```
bunx tsc --noEmit              exit 0, clean
bunx eslint .                  ✖ 65 problems (0 errors, 65 warnings)
bunx vitest run                Test Files 145 passed (145) · Tests 2737 passed (2737)
bun run lint:boundaries        check-boundaries: OK — all 5 boundary rules hold.
bunx stylelint "src/**/*.css"  ✖ 70 problems (2 errors, 68 warnings)
bun run build                  ✓ built in 2.05s
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   → empty
git status --short -- '*__snapshots__*'                        → empty
```

Bundle, for task 10's before/after: main `788.56 kB / 229.14 kB gzip` (W1 recorded
764.15 / 220.49 — the +24 kB is this task's container code). **`three` did NOT leak into the
main bundle**: it is still its own `734.33 kB / 189.46 kB gzip` chunk, plus a 45.56 kB
`GLTFLoader` chunk. Grepped the built main bundle to confirm — its single `WebGLRenderer`
occurrence is `PoseEngine`'s own `new e.WebGLRenderer(...)` on the dynamically-imported
namespace, not three's source. D2 is intact.

**Boundary probe (negative control).** `bun run lint:boundaries` reporting OK is only
meaningful if the rule can fail. Adding `import { PoseUIStore } from "@/stores/ui/PoseUIStore"`
to `poseEngine.ts` produced `[ui-purity] ... imports stores/ or store/` and exit 1; the file
was restored and the rule went back to OK. The rule fires.

**Headless probes run and then deleted** (a test file is outside task 08's `Touches`): 8
assertions over `depthToHeight`, `buildStampCells` and `fitCameraToMesh`, all passing —
the zoom→padding fold, the 90%-of-the-shorter-axis fill on a non-square canvas, nearer =
taller under the observed range, the `depth: null` fallback producing height 0 with colour
and normal intact, the pan offset, and fresh per-cell `color`/`normal` objects.

**Dev server**: `bunx vite` on port 5279 serves `/` 200 and transforms the modified
`CanvasContainer.tsx` 200, with `poseCanvasRef` present in the transformed output. The full
three-process `bun run dev` under mprocs was **not** run.

## ⚠️ AUTHORISED SCOPE EXTENSION FOR TASK 08 (coordinator, 2026-09-03)

**Task 08's `Touches` says `CanvasContainer.tsx` only. It is hereby extended to include
`client/src/ui/canvas/pose/poseEngine.ts`, for one specific one-line change and nothing else.**

Why: `PoseEngine.setCamera()` / `getCamera()` are typed `PerspectiveCamera` (task 03), but
D14 makes **four of the five camera presets ORTHOGRAPHIC**. `OrthographicCamera` is not
assignable to `PerspectiveCamera` in `@types/three`. Task 06 verified this, could not fix it
(the file was outside its `Touches`), and worked around it so nothing is blocked:
`fitCameraToMesh()` returns plain numbers and `applyCameraParams()` takes a structural
`PoseCameraLike` that both camera classes satisfy.

Without this extension task 08 would have to stop and report BLOCKED under rule 8 for a
change that is trivial and fully understood. **Widen `setCamera`/`getCamera` to `Camera`
(or a union). Change nothing else in that file** — in particular `setPixelRatio(1)` stays.

## Notes for the next session

**Carry into W3 (task 08):**

- **The `setCamera` widening above is authorised** — read that section before you start.
- **Pass FRESH `color`/`normal` objects per cell to `setPixelCells`.** Task 05's `after`
  cell does not deep-copy (consistent with `setPixels`); a caller that mutates a `Normal`
  after passing it in would corrupt the recorded patch.
- **Do not "fix" `setPixelRatio(1)`** in the engine — a HiDPI ratio would silently
  supersample the 1:1 render target and defeat D5.
- **The normal convention is settled and verified** (task 06): the project is **Y-DOWN**,
  three's `MeshNormalMaterial` is Y-UP, **so the decode negates Y**. Confirmed against
  `NormalPicker.tsx:227-228`, `lightingRenderer.ts:299` and `flipGridVertical`. Byte scales
  are 127 for x/y and 255 for z, matching `edgeInterpolate.ts`. Height is 1–255 with **0 as
  the "no data" sentinel**, nearer = taller, mirroring `normalCompute.ts:269`.
- **`applyEulerXYZ` is fuzzed against real three** over 2000 cases (worst deviation
  2.2e-15). Three's "XYZ" euler is the matrix `Rz·Ry·Rx` — do not "simplify" it.
- Task 07 added a **Clear pose** button wired to `pose.clear()`; `onSelectMesh` cannot pass
  `null`, so this is the only way to unload a mesh from the UI.
- `DirectionOrb` takes a **`mode="direction"|"euler"`** prop — the two orbs carry genuinely
  different value kinds (unit vector vs euler radians), and euler mode preserves `z` roll.

**Carried from W1 (tasks 06 and 07):**

- **Task 03 added `setCamera()`/`getCamera()`** to `PoseEngine` beyond the task's stated
  surface, specifically so task 06 can install its camera without reaching into a private
  field. Task 06 should use it rather than inventing a seam.
- **`setPixelRatio(1)` is deliberate** in the engine. A HiDPI ratio would silently
  supersample the 1:1 render target and defeat D5. Task 08 must not "fix" it.
- **`poseTypes.ts` duplicates the five unions in `PoseUIStore.ts`** — unavoidable, because
  the `ui/` boundary forbids importing from `stores/`. They are currently member-for-member
  identical. **Any change to one must change the other**; both files say so in their headers.
- **Task 05's `after` cell does not deep-copy the caller's `color`/`normal` objects**
  (consistent with `setPixels`). **Task 08 must pass fresh objects per cell** — a caller
  that mutates a `Normal` after passing it in would corrupt the recorded patch.
- **Stylelint baseline locations were wrong in MASTER.md** and are now corrected there: the
  2 errors are `OtherHand.css:338` and `:359`, not `ConfirmDialog.css`/`IconButton.css`
  (those are warnings). The count of 2 is what matters and is unchanged.
- **Bundle numbers for task 10:** main bundle 764.15 kB / 220.49 kB gzip, unchanged by W1.
  The three chunk is 734.33 kB / 189.46 kB gzip and loads only on first engine use.
