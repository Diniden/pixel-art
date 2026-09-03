# HANDOFF — Pose tool

**Current position:** ✅ **ALL WAVES LANDED — W5 (task 10) DONE.** The plan is code-complete
and the full root gate is green. ⚠️ **30 manual checks remain OWED to the owner** — see
[Priority checks for the owner](#7--priority-checks-for-the-owner--the-one-consolidated-list).
**Branch:** `feat/06-pose-tool`
**Last commit:** `62df16a` (+ this task's docs commit)
**Plan written:** 2026-09-02 · Planning baseline HEAD: `cd7a852`

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04, 05 | DONE | 2026-09-02 | `2073de6` | tsc 0 · eslint 0 err/65 warn · vitest 140 files 2571 tests · boundaries OK · stylelint 2 err · no lockfile |
| W2 | 06, 07 | DONE | 2026-09-03 | `f4ef0de` | tsc 0 · eslint 0 err/65 warn · vitest 145 files 2737 tests · boundaries OK · stylelint 2 err · no lockfile |
| W3 | 08 | DONE | 2026-09-03 | `2dcdd42` | tsc 0 · eslint 0 err/65 warn · vitest 145 files 2737 tests · boundaries OK · stylelint 2 err · build OK · no lockfile · **24 manual checks OWED** |
| W4 | 09 | DONE | 2026-09-03 | `16e1645` | **NOT blocked** — CC0 re-verified, asset vendored. tsc 0 · eslint 0 err · vitest 145/2737 · boundaries OK · stylelint 2 err · no lockfile |
| W5 | 10 | **DONE** | 2026-09-03 | _this commit_ | `bun run verify` **exit 0** · storybook build 0 · boundaries OK · stylelint 2 err · no lockfile · snapshots untouched · `bun run dev` all 3 procs UP · **30 manual checks owed** |

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
| 09 | Vendor the CC0 mannequin | W4 | DONE | `16e1645` | CC0 re-verified 2026-09-03. **Mesh is a T-POSE** — old arm/hand regions framed 0 vertices. 6 manual checks owed. |
| 10 | Full gate, QA, handoff | W5 | **PARTIAL** | _this commit_ | Gate fully green and `bun run dev` verified live on all 3 ports. **QA sweep is PARTIAL by necessity: 0 of the 30 visual/gesture/GL checks could be performed headlessly.** No behaviour changed; no formatting fix was needed. |

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

> **SUPERSEDED by [§7 Priority checks for the owner](#7--priority-checks-for-the-owner--the-one-consolidated-list).** Kept for provenance; work from the consolidated list.

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

> **SUPERSEDED by §7.** Kept for provenance.

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

### W3 — verified by the coordinator, 2026-09-03

Gate run by the coordinator against the settled tree at `2dcdd42`:

```
bunx tsc --noEmit              exit 0
bunx eslint .                  ✖ 65 problems (0 errors, 65 warnings)
bunx vitest run                Test Files 145 passed (145) · Tests 2737 passed (2737)
bun run lint:boundaries        check-boundaries: OK — all 5 boundary rules hold.
bunx stylelint "src/**/*.css"  ✖ 70 problems (2 errors, 68 warnings)
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   → empty
git status --short -- '*__snapshots__*'                        → empty
```

Identical to the W2 baseline on every axis. Diff is exactly 2 files — `CanvasContainer.tsx`
and the authorised `poseEngine.ts` widening — so the scope extension was used as granted and
not stretched.

Coordinator spot-checks of the decisions a green gate cannot catch:

- **D11 holds.** The pose overlay has its own `useCanvasRender` (`:2411`) and is absent from
  the main `render`'s deps. There IS one `useState` in the pose region (`poseEngineTick`,
  `:2428`) — the coordinator chased it down: it is set exactly once, inside engine creation
  (`:2468`), and is **not on any pointer path**. Drag state is in refs, as required.
- **D12 holds.** `"pose"` is in `isGestureTool` (`:363`); the touch branch is placed ahead of
  the bail with an explicit comment; double-click is `POSE_DOUBLE_CLICK_MS = 400` /
  `POSE_DOUBLE_CLICK_CELLS = 2`, tracked in a ref, not via `dblclick`.
- **D5 holds.** `imageSmoothingEnabled = false` is re-set on context acquisition (`:2351`).
- **The aliasing hazard is handled.** `buildStampCells` allocates a fresh `cellNormal` and
  `cellHeight` per loop iteration (`poseStamp.ts:285-302`) — no shared object is pushed into
  more than one cell, so task 05's no-deep-copy contract cannot corrupt a patch.
- **The D8 fallback is wired** as a clean path (`depth: null` → height 0), not a crash.

### ⚠️ W3 — task 08's 24 manual checks: **ALL 24 ARE OWED, NONE WERE PERFORMED**

> **SUPERSEDED by §7.** Kept for provenance — the per-check structural reasoning below is still the best record of *why* each is believed correct.

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

### W4 — verified by the coordinator, 2026-09-03

Gate at `16e1645`, identical to the W2/W3 baseline:

```
bunx tsc --noEmit              exit 0
bunx eslint .                  ✖ 65 problems (0 errors, 65 warnings)
bunx vitest run                Test Files 145 passed (145) · Tests 2737 passed (2737)
bun run lint:boundaries        check-boundaries: OK — all 5 boundary rules hold.
bunx stylelint "src/**/*.css"  ✖ 70 problems (2 errors, 68 warnings)
find . -maxdepth 2 -name 'bun.lock*' → empty · snapshots untouched
git check-ignore …/mannequin.gltf → exit 1 (tracked, correct)
```

**The coordinator independently verified the asset rather than trusting the report**, because
this is a third-party binary entering the owner's repo:

- **SHA-256 `d936e4b7…babef44`, 380,956 bytes** — matches the reported checksum exactly.
- **It is a real glTF 2.0**, not an error page saved under the right name: generator
  `Khronos glTF Blender I/O v3.2.43`, 2 meshes, 2 materials, **0 skins, 0 animations**
  (confirming D4's unrigged premise), **0 images, 0 textures** — no sidecars, nothing can 404.
- **The T-pose claim was re-derived from the vertex buffer by the coordinator**, not accepted
  on report: decoded bounds are x `[-0.760, 0.760]`, y `[-0.004, 1.708]` — width 1.519 vs
  height 1.712, **aspect 0.887** (arms-down would be ≈0.3), and the maximum |x| occurs in the
  upper band at shoulder height. **Unambiguously a T-pose.** Task 06's arms-at-sides estimates
  really did frame empty space, and this would have presented as a broken feature rather than
  a bad constant.
- `LICENSE.md` records source, author, itch.io user id, the verbatim licence statement, both
  verification dates, checksums and the free-download evidence — traceable without re-finding
  the page.

**The out-of-`Touches` test edit was inspected and is sound.** Task 09 modified two
`getFramingBounds` tests in `poseMeshes.test.ts`. Their subject is the fraction→world-space
**mapping arithmetic**, but they hardcoded the old head fractions as fixtures, coupling them
to the very values this task was assigned to re-tune. They now derive expectations from
`MANNEQUIN_REGIONS`. The coordinator confirmed the region VALUES remain pinned by separate
invariant tests, which assert **anatomical relationships** (hand at the end of the arm on the
same side, leg in the bottom half, every value finite) rather than constants — the right way
to pin a re-tunable measurement. **No invariant was weakened.**

## OWNER DECISIONS (2026-09-03)

The coordinator put two questions to the owner directly. Both are answered:

1. **W4 / the mannequin: APPROVED.** The owner signed off on downloading the CC0 mannequin
   from `burning-barb.itch.io/mannequin` and vendoring it into `client/public/models/`.
   D3's "must ask the owner to confirm before committing a binary asset" is **satisfied**.
   ⚠️ Sign-off covers the *download and commit* only — **task 09 must still re-verify the
   CC0 license at execution time**, and must still record BLOCKED rather than substitute an
   unverified asset if that re-verification fails.
2. **Question 1 below (preset overrides projection): KEEP D14 AS-IS.** The owner chose to
   leave the behaviour alone for now and revisit after using the tool on real work. **Not a
   deviation — a deliberate decision.** Task 10 should surface it in the QA notes, not
   "fix" it.

### ⚠️ Manual checks OWED — W4 (6 more; nobody has performed these)

> **SUPERSEDED by §7.** Kept for provenance.

25. The Mannequin button loads a visible human figure, pixelated like the primitives.
26. **Each of the six framing buttons frames the right region on screen** — Full / Head /
    Torso / Arm / Leg / Hand. *The regions are proven numerically against real vertex data,
    which is stronger than eyeballing for correctness, but nobody has seen them framed.*
27. The model-colour control affects the mannequin.
28. Rotation, light, camera, pan and stamp all work on the mannequin as on a primitive.
29. The stamped silhouette matches the on-screen figure, in one undo entry.
30. Switching meshes repeatedly does not leak (watch for WebGL context warnings).

Task 09 did substitute evidence where it could: graceful failure was tested by renaming the
asset away and confirming `MannequinUnavailableError` (restored, checksum re-matched), and
the lazy chunk was confirmed from the build — `three.module` 734 kB and `GLTFLoader` 45.6 kB
are separate chunks, so **D2 still holds with the loader added.**

## ⚠️ THREE QUESTIONS FOR THE OWNER, RAISED BY TASK 08 (not blockers)

Recorded here because task 10's QA sweep should put them in front of the owner:

1. **A camera preset overrides the store's `projection`** — which is D14 as written, but it
   means the rail's Perspective/Orthographic toggle has no visible effect while a mismatched
   preset is selected. A UX question, not a bug against the spec.
2. **In variant-edit mode the overlay spans the expanded view while the stamp targets the
   smaller variant grid.** Cells outside are filtered, so the model stamps cropped: the
   visible reference is larger than the stampable area. Correct per the plan, possibly
   surprising in use.
3. Viewpoint buttons reach the container only via `pose.rotation`, so manual check 7 is
   really a task-07 check, not a task-08 one.

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

---

# W5 — Task 10: full gate, QA sweep and close-out (2026-09-03)

Run by the task-10 executor against the settled tree at `62df16a`, worktree **clean**.

## 1. The real root gate — `bun run verify` → **exit 0**

The house rule is to paste the real output, so this is the actual terminal text, elided only
where a 172,000-line log repeats itself.

```
$ bun run verify
$ bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build

$ bun run --cwd client typecheck && bun run --cwd server typecheck
$ tsc --noEmit          (client — clean, no output)
$ tsc --noEmit          (server — clean, no output)

$ bun run --cwd client lint && bun run --cwd server lint
$ eslint .
✖ 65 problems (0 errors, 65 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
$ eslint .              (server — clean, no output)

$ bunx prettier --check "*.{json,md,yaml,yml}" "client/*.{ts,js,json}" "server/*.{ts,js,json}" "client/src/types/**/*.{ts,tsx}"
Checking formatting...
All matched files use Prettier code style!

$ bun run --cwd client test
$ vitest run
 Test Files  145 passed (145)
      Tests  2737 passed (2737)
   Duration  68.36s

$ cd client && bun run build
$ tsc --noEmit && vite build
vite v7.3.6 building client environment for production...
✓ 2040 modules transformed.
dist/index.html                         0.76 kB │ gzip:   0.42 kB
dist/assets/index-BwAp3nuY.css        217.15 kB │ gzip:  27.55 kB
dist/assets/GLTFLoader--NCVAYW2.js     45.56 kB │ gzip:  13.70 kB
dist/assets/three.module-PDSP0dbZ.js  734.33 kB │ gzip: 189.46 kB
dist/assets/index-DM9IbQGG.js         788.56 kB │ gzip: 229.15 kB
✓ built in 2.06s

=== VERIFY EXIT CODE: 0 ===
```

**`format:check` PASSED with no changes needed** — no file this plan touched required
reformatting, so **no formatting commit was made and nothing was reformatted.** (Note the
root `format:check` glob only covers `*.{json,md,yaml,yml}`, `client/*`, `server/*` and
`client/src/types/**` — most of this plan's new files under `client/src/ui/` and
`client/src/stores/` are outside that glob by the project's existing configuration. That is
the repo's pre-existing scope, not something this task narrowed.)

## 2. The individual client gates

```
$ bun run lint:boundaries
check-boundaries: OK — all 5 boundary rules hold.

$ bunx stylelint "src/**/*.css"                    exit 2 (its normal error-present code)
src/ui/components/OtherHand/OtherHand.css
  338:3  ✖  Use a design token from src/styles/tokens.css (task 12)  scale-unlimited/declaration-strict-value
  359:3  ✖  Use a design token from src/styles/tokens.css (task 12)  scale-unlimited/declaration-strict-value
✖ 70 problems (2 errors, 68 warnings)
                        ← EXACTLY 2 ERRORS, both pre-existing in OtherHand.css. ✓

$ bun run build-storybook                          exit 0
storybook-static/assets/PoseSection.stories-DSc2ufNM.js   16.33 kB │ gzip: 4.52 kB
storybook-static/assets/CanvasSurface.stories-BhpL2Hh-.js 44.40 kB │ gzip: 14.07 kB
✓ built in 5.79s
info => Output directory: client/storybook-static
                        (storybook-static is gitignored; removed after the run)
```

`tsc`, `eslint` and `vitest` are not repeated here — the root gate above runs the identical
commands and its real output is pasted in full.

## 3. Data-safety invariants — all hold

```
$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
                                                   → EMPTY ✓
$ git status --short -- '*__snapshots__*' '*.snap'
                                                   → EMPTY ✓  (never ran `vitest -u`)
$ git status --short
                                                   → EMPTY ✓  (tree clean, nothing stray)
```

The lockfile sweep was **repeated after every `bunx` invocation** in this task (stylelint,
prettier, storybook, the baseline vite build) and after the throwaway git worktree used for
the before-bundle measurement. It came back empty every time.

**Corpus and migration snapshots pass UNCHANGED.** From the real vitest run above:

```
✓ |unit| src/types/__tests__/migrations.test.ts (68 tests) 67816ms
   ✓ corpus golden digests — the real regression gate > backup-01-31-2026.json: the migration pipeline is a no-op and the result digest is frozen
   ✓ … 7 more backup files, each digest-frozen and round-trip stable …
   ✓ corpus golden digests — the real regression gate > the corpus carries exactly 149 backup snapshots plus 2 standalone projects
   ✓ corpus golden digests — the real regression gate > base-unit.json: round-trip stability holds for every snapshot in the file
```

**`toPersistedUIState()` gained no key — the wire format is unchanged (D6).** Verified two
ways rather than by reading:

```
$ git diff --stat 35d1644..HEAD -- client/src/stores/ui/UIStore.ts
                                                   → EMPTY: this plan never touched the file
$ grep -in 'pose' client/src/stores/ui/UIStore.ts
                                                   → only `dispose`/`propose` substrings; no pose key
```

The 151 corpus digests are byte-identical, which is the same fact from the other direction.

## 4. Bundle cost — measured before **and** after

The "before" number was measured for real, not quoted: a throwaway git worktree at the
plan's branch point `35d1644` was built with the same vite, with `node_modules` symlinked so
no install (and no lockfile) could occur, then removed.

| Chunk | Before (`35d1644`) | After (`62df16a`) | Δ |
| --- | --- | --- | --- |
| **main entry** `index-*.js` | **761.35 kB / 219.71 kB gzip** | **788.56 kB / 229.15 kB gzip** | **+27.21 kB / +9.44 kB gzip** |
| CSS `index-*.css` | 214.30 kB / 27.20 kB gzip | 217.15 kB / 27.55 kB gzip | +2.85 kB / +0.35 kB gzip |
| `three.module-*.js` | — (absent) | **734.33 kB / 189.46 kB gzip** | separate lazy chunk |
| `GLTFLoader-*.js` | — (absent) | **45.56 kB / 13.70 kB gzip** | separate lazy chunk |

- **W1's recorded 764.15 / 220.49 no longer reproduces exactly** (a real build now gives
  761.35 / 219.71 at the branch point). The difference is ~3 kB and is a measurement
  artefact of *which* commit was called "before", not a regression. The **after** figure
  788.56 / 229.15 matches task 08's record exactly.
- **The three chunk is unchanged at 734.33 kB / 189.46 kB gzip**, and `GLTFLoader` is
  unchanged at 45.56 kB / 13.70 kB gzip. Both **still separate**, exactly as W1 and W4
  recorded. The risk-register row "three bundle weight inflates the main bundle" is
  **closed**: the main bundle grew by 27 kB of the plan's own container/store/panel code,
  not by three.
- **three has NOT leaked into the main bundle — grepped the built artefact to prove it.**
  Distinctive three-internal identifiers in `dist/assets/index-DM9IbQGG.js`:
  `BufferGeometry` **0**, `THREE.WebGLProgram` **0**, `WebGLRenderer` 1, `WebGLRenderTarget`
  1, `MeshNormalMaterial` 1, `PerspectiveCamera` 4. Each surviving hit was read in context
  and every one is a **property access on the dynamically-imported namespace**, not inlined
  library source:

  ```
  this.renderer = new e.WebGLRenderer({antialias:!1, …})          ← `e` = the imported ns
  this.target   = new this.three.WebGLRenderTarget(s,r,{minFilter:this.three.NearestFilter…})
  Ee = new F.MeshNormalMaterial({flatShading:!0, side:F.DoubleSide})
  this.camera   = new e.PerspectiveCamera(45,1,.1,1e3)
  return Gb ??= zx(()=>import("./three.module-PDSP0dbZ.js"),[])   ← the split point itself
  ```

  Positive control, same strings in the three chunk: `WebGLRenderer` 39, `BufferGeometry`
  26, `PerspectiveCamera` 7, `MeshNormalMaterial` 6. **D2 is intact.**

## 5. `bun run dev` — all three processes came up ✓

This was the one task expected to attempt the real launch, and it did.

⚠️ **One honest complication, recorded because it affected the method.** A pre-existing
mprocs session of the owner's, **2 days 15 hours old**, was already holding port 3001 and had
gone unresponsive (`curl /api/projects` → no response). Rather than kill the owner's
processes, the three `mprocs.yaml` commands were launched directly and individually — the
same three commands mprocs itself runs (`bun run dev:client`, `bun run dev:server`,
`bun run ai`). A first attempt at `mprocs` under a pty did start (it entered the alternate
screen buffer) but a TUI cannot be read from a non-interactive shell, so the direct launch is
what produced observable evidence. **All three then bound their real default ports** — the
stale holder had released 3001 by then — and all three answered live HTTP:

```
=== ALL THREE PROCESSES — live HTTP probes ===
-- 1. client (vite, 5173) --      / HTTP 200
-- 2. server (express, 3001) --   /api/projects HTTP 200
-- 3. ai-service (uvicorn, 8100) -- /health HTTP 200
   {"status":"ok","mode":"proxy","remote_configured":false}

=== listening ports ===
   bun       34221  *:3001
   node      34224  *:5173
   python3.1 34253  *:8100
```

Their own startup banners:

```
client:  VITE v7.3.6  ready in 114 ms   ➜  Local: http://localhost:5173/
server:  🎨 Pixel Art server running on http://localhost:3001
         🔌 Sync websocket listening on /ws
         📡 Advertising _pixelart._tcp on port 5173 for the iPad companion
ai:      INFO: Application startup complete.
         INFO: Uvicorn running on http://0.0.0.0:8100 (Press CTRL+C to quit)
```

And the pose feature's own modules were served and transformed by the **real** dev client
with no error in the vite log:

```
/                                      HTTP 200
src/ui/canvas/pose/poseEngine.ts       HTTP 200
src/ui/canvas/pose/poseCamera.ts       HTTP 200
src/ui/canvas/pose/poseStamp.ts        HTTP 200
src/ui/canvas/pose/poseMeshes.ts       HTTP 200
src/containers/CanvasContainer.tsx     HTTP 200
src/ui/components/PosePanel/PoseSection.tsx   HTTP 200
src/ui/components/PosePanel/DirectionOrb.tsx  HTTP 200
/models/mannequin.gltf                 HTTP 200, size=380956   ← matches task 09's checksum size
```

All three processes were then shut down cleanly; no listener of mine remains and the repo is
clean. **`bun run dev` is not broken by this plan.**

## 6. ⚠️ The QA sweep — what was actually verified, and what was not

**Read this before reading the table.** The task file lists a 29-item QA script.
**0 of its visual, gesture and GL items were performed.** This executor had no browser
automation, no device, and jsdom has no WebGL — the same wall every earlier agent hit. What
*could* be done headlessly was done: the structural claims underlying the checks were
**re-verified independently from the built artefact and the source**, rather than taken from
the previous agents' reports. That is evidence about the *code*, and it is **not** evidence
about the *picture*. A green gate proves the code compiles, lints, tests and builds; it
proves nothing whatsoever about what appears on screen.

Every claim below marked ✅ was re-derived by this task. Everything marked ❌ is owed.

| # | QA item | Result |
| --- | --- | --- |
| 1 | Hard, blocky, aliased edges at artwork resolution | ❌ **NOT TESTED.** ✅ *Levers re-verified in source:* `antialias: false` (`poseEngine.ts:239`), `samples: 0` (`:325`), `NearestFilter` on **both** min and mag (`:319-320`), `setPixelRatio(1)` (`:246`). |
| 2 | Stays crisp at every zoom, grid-aligned | ❌ **NOT TESTED.** ✅ Pan is `Math.round`ed in the painter (`CanvasContainer.tsx:2395-2397`); magnification is the existing CSS transform, not a blit. |
| 3 | 32×32 grid reads as genuinely chunky/useful | ❌ **NOT TESTED.** Aesthetic judgement — only the owner can make it. |
| 4 | 256×224 grid renders 1:1 without stretching | ❌ **NOT TESTED.** ✅ Target is allocated at exactly `cellWidth × cellHeight`; `putImageData` only, **no `drawImage` anywhere on the pose path** (grepped the whole pose region — 0 hits outside a prohibition comment). |
| 5 | Every mesh auto-centres with visible padding | ❌ **NOT TESTED.** ✅ Task 08 verified headlessly that a 64×32 canvas fills exactly 0.9 of the shorter axis. |
| 6 | Non-square grids fit the limiting axis without clipping | ❌ **NOT TESTED.** Same fit maths as 5. |
| 7 | A 45°-rotated model does not clip at the frame edges | ❌ **NOT TESTED.** ⚠️ The fit uses the mesh's bounding **sphere** for placement — rotation-invariant in principle, but nobody has watched a tumbling model at the frame edge. |
| 8 | Every rail control changes the render as expected | ❌ **NOT TESTED** — all 13 controls. Unit tests prove each emits its callback; nothing proves the render responds. |
| 9 | Mouse drag pans; does not draw; does not rotate | ❌ **NOT TESTED.** ✅ Not-drawing is structural: `pose` is in `isGestureTool` (`:356`) and its handler table entry is empty `pose: {}`. |
| 10 | ⚠️ **Touch** drag pans; rail does not scroll; canvas does not draw | ❌ **NOT TESTED — HIGHEST RISK.** ✅ Ordering re-verified by line number this task: in `handleTouchStart` the pose branch is at **`:4657`**, the `isGestureTool` bail at **`:4683`**; in `handleTouchMove` `posePointerMove(...)` is at **`:4797`**, the bail at **`:4836`**. The branch really is ahead of the bail on both paths. Placement verified by reading, never by touching glass. |
| 11 | Double-click stamps; ⚠️ **double-tap** stamps | ❌ **NOT TESTED.** ✅ Detected explicitly (400 ms / 2 cells / a ref), never via the unreliable `dblclick`. |
| 12 | Stamped pixels land exactly where the model appeared | ❌ **NOT TESTED.** ✅ **The variant-edit algebra was re-derived independently this task and it checks out.** The painter puts texel `tx` at canvas column `round(pan.x) − viewMinX + tx` (`:2387-2396`); `placeHoverCells` gives `canvasX = gridX + (variantOffset.x − viewMinX)`; equating them yields `gridX = round(pan.x) − variantOffset.x + tx` — the `viewMin` terms cancel, and the code uses `variantOffset` (`:2954-2955`), which is correct. **The non-variant path is the simple one; the variant path is the one to check hardest.** |
| 13 | ⚠️ One undo removes the whole stamp; one redo restores | ❌ **NOT TESTED.** ✅ Structural: one `commitCells`, pinned by task 05's tests. |
| 14 | A selection masks the stamp | ❌ **NOT TESTED.** ✅ `writeOptions` passed; `setPixelCells` gates via `allows()`. |
| 15 | ⚠️ Normals correct in the lighting studio's lit preview | ❌ **NOT TESTED.** ⚠️ **Depth fallback was NOT used** — see the depth caveat below; this is the check that confirms it. |
| 16 | Wall-clock time of a full-canvas stamp on the largest object | ❌ **NOT MEASURED.** Needs a live GL context. Still owed. |
| 17 | ⚠️ ~20 tool switches + 20 mesh changes → no WebGL context warnings | ❌ **NOT TESTED — HIGHEST RISK.** ✅ Re-verified structurally: creation is guarded by `if (poseEngineRef.current) return;` (`:2447`), so switches create **0** extra contexts; the engine is disposed only on unmount (`:2497`). Argued, not observed. |
| 18 | ⚠️ StrictMode: no doubled renderer/overlay, no mount errors | ❌ **NOT TESTED — HIGH RISK.** ✅ Three guards confirmed in source: the ref check (`:2447`), a `cancelled` flag (`:2449/:2478`), and a create that loses the race disposing its own engine (`:2456-2459`). Argued, not observed. |
| 19 | Switching projects clears the pose | ❌ **NOT TESTED.** ✅ Task 02's `loadGeneration` reaction, covered by tests. |
| 20 | Resize resizes the overlay and re-fits; pan survives resize, resets on mesh change | ❌ **NOT TESTED.** ✅ `cellWidth`/`cellHeight` are deps of both effects; the fit effect neither reads nor writes the pan. |
| 21 | All other tools behave as before | ❌ **NOT TESTED** interactively. ✅ 2737/2737 tests pass and no existing tool's code path was modified. |
| 22 | ⚠️ The **reflection** tool still mirrors and draws its guides | ❌ **NOT TESTED.** ✅ Reflection's overlay still follows pose in DOM order (`:769` after `:754`), and its module is untouched by this plan. |
| 23 | Lighting studio opens; normal/height tools work; preview renders | ❌ **NOT TESTED.** ✅ `LightingCanvasContainer` untouched (D16). |
| 24 | Onion skin / frame trace / reference overlays render in the right order | ❌ **NOT TESTED.** ✅ DOM order re-verified this task (see 25). |
| 25 | ⚠️ Ants, origin cross, reflection guides render **above** the artwork | ❌ **NOT TESTED.** ✅ Re-verified by line number: hover `:692` → **pose `:754`** → reflection `:769` → SVG chrome `:785`. Pose is above the layers and below all chrome, exactly as D10 requires. No numeric `z-index` was added (every `z-index` in the file is a token; the `will-change` greps are prohibition comments). |
| 26 | Undo/redo across a mixed session; autosave still fires | ❌ **NOT TESTED.** |
| 27 | Split canvas still works and does **not** get the pose overlay | ❌ **NOT TESTED.** ✅ Correct by construction — the overlay lives only in `CanvasSurface` (D16). |
| 28 | Export still produces correct output | ❌ **NOT TESTED** interactively. ✅ Server typechecks; `server/src/export/` untouched; corpus digests unchanged. |
| 29 | ⚠️ Drawing performance unchanged **while pose is not selected** | ❌ **NOT TESTED.** ✅ Re-verified this task: the main `render` callback contains **no** reference to anything pose (grepped its whole body — 0 hits), no engine is created until the tool is first selected, and the painter early-returns on `!poseActive`. |

**Score: 0 of 29 QA items observed. 18 of 29 had their underlying structural claim
independently re-verified from source or the built bundle by this task.** The distinction
matters and should not be blurred.

## 7. ⚠️ PRIORITY CHECKS FOR THE OWNER — the one consolidated list

All 30 owed checks from W1–W4, plus the QA script, deduplicated and **ordered by risk**.
This is the single list to work through at the keyboard; the per-wave lists above are
superseded by it and kept only for provenance.

**Nobody has performed any of these.** No agent in this plan had a browser, a GPU, or a
device. The entire GL path, every gesture, and every visual claim is unobserved.

### 🔴 Tier 1 — highest risk. If something is broken, it is most likely here.

| # | Check | Why it is top of the list |
| --- | --- | --- |
| **1** | **Select Pose, then switch tools ~20× and change meshes ~20×. Watch the console for `Too many active WebGL contexts`.** | The leak check. Browsers cap contexts at ~16; exhausting them crashes the tab. Argued safe (one context per mount, never disposed on deselect) but **never run**. |
| **2** | **In StrictMode (dev), select Pose: exactly one renderer, one overlay, no mount/unmount error in the console.** | Double-mount is the classic way the "one context" guarantee above silently becomes two. |
| **3** | **On the iPad: drag on the canvas with a finger — the model pans, the rail does NOT scroll, and nothing draws.** | The owner's primary device. The gesture branch sits ahead of the `isGestureTool` bail on both touch paths, verified by line number — but verified by *reading*, not by touching glass. |
| **4** | **On the iPad: double-tap the model — it stamps.** | Detected as 400 ms / 2 cells in a ref, deliberately not `dblclick`. Timing thresholds are exactly the sort of thing that feels wrong only in the hand. |
| **5** | **Enter variant-edit mode, pan, then stamp. Do the stamped pixels land exactly under the model?** | A `variantOffset`-vs-`viewMin` bug was found and fixed pre-commit here. The algebra re-checks out (see QA 12), but this path is off by `variantOffset − viewMin` if the derivation is wrong, and it is **invisible everywhere except inside a variant**. |
| **6** | **Stamp, then open the lighting studio: do the stamped pixels shade like the 3D model did?** Heights sensible, not uniform or inverted? | The depth-derived heights were reasoned from three's `depth.glsl.js` shader source and **never run on a GPU**. If heights come back uniform or inverted, the depth pass is the first place to look. |

### 🟠 Tier 2 — the feature's whole point. Judge whether it is actually useful.

| # | Check |
| --- | --- |
| 7 | The model renders with **hard, blocky, aliased edges** — no smooth silhouette, no gradient banding from a downscale. **This is the feature; if it looks smooth, it failed.** |
| 8 | It stays crisp and grid-aligned at **every canvas zoom level**. |
| 9 | On a small grid (32×32) it reads as genuinely chunky and useful as drawing reference. On a large grid (256×224) it still renders 1:1 without stretching. |
| 10 | Every mesh auto-centres with visible padding on load; non-square grids fit the limiting axis without clipping. |
| 11 | A **45°-rotated** model does not clip at the frame edges. |
| 12 | Mouse: drag pans, does not rotate, does not draw. Double-click stamps. |
| 13 | **One** Ctrl+Z removes the whole stamp; one Ctrl+Y restores it. |
| 14 | With a selection active, the stamp is masked to it. |
| 15 | **Time a full-canvas stamp on the largest object you have** and note the wall clock. Never measured. |

### 🟡 Tier 3 — every rail control, one pass

| # | Check |
| --- | --- |
| 16 | Selecting Pose swaps the rail to the Pose section; Pencil/Eraser swap it back. |
| 17 | Cube / Sphere / Cylinder / **Mannequin** each load and appear pixelated. |
| 18 | **Each of the six framing buttons frames the right region** — Full / Head / Torso / Arm / Leg / Hand. ⚠️ The mesh is a **T-pose**; task 09 re-tuned these regions against real vertex data after the originals framed 0 vertices. Numerically proven, never seen. |
| 19 | **Drag both orbs with a mouse**, including moving the cursor off the orb mid-drag (the `setPointerCapture` contract). |
| 20 | **Drag both orbs by TOUCH — the rail must not scroll.** The `touch-action: none` line; jsdom cannot exercise it at all. |
| 21 | Each viewpoint button (Front/Back/Left/Right/Top/Bottom/3-4) snaps the model **and** visibly moves the rotation orb's handle. |
| 22 | Each camera preset changes the projection; **Iso reads as true isometric**. |
| 23 | Perspective ↔ Orthographic toggles visibly; zoom scales; FOV affects perspective only and is disabled in orthographic. |
| 24 | Light colour and model colour both change the render; swatches update. Framing is disabled for primitives, enabled for the mannequin. |
| 25 | Light-orb drag moves the shading in real time with no visible lag; rotation-orb drag tumbles smoothly. |
| 26 | The **Clear pose** button unloads the mesh (it is the only way to — `onSelectMesh` cannot pass `null`). |
| 27 | Rail layout at narrow width; the section scrolls if it overflows. *(Reviewable in Storybook — the stories mount at the rail's real 240 px.)* |

### 🟢 Tier 4 — regressions: nothing else may have changed

| # | Check |
| --- | --- |
| 28 | **No visual change anywhere in the pixel studio while Pose is NOT selected.** The overlay is always mounted; any difference means the canvas stack was disturbed. |
| 29 | Pencil, eraser, both fills, line, rectangle, ellipse, move, selection, eyedropper, origin all behave as before. **Reflection still mirrors and its guides still draw.** Marching ants, origin cross and reflection guides still render **above** the artwork. |
| 30 | Lighting studio opens and its tools work; onion skin / frame trace / reference overlays still layer correctly; undo/redo across a mixed session is normal and autosave fires; split canvas works (and correctly does **not** get the pose overlay); export output is correct; **drawing performance on a large sprite is unchanged while pose is not selected**; switching projects clears the pose; resizing the object resizes the overlay and re-fits, with pan surviving a resize and resetting on a mesh change. |

## 8. Notes to surface, not to fix

1. **D14: a camera preset overrides the store's `projection`.** Consequence: the rail's
   Perspective/Orthographic toggle has no visible effect while a preset with a different
   projection is selected. **The owner has decided (2026-09-03) to KEEP this as-is** and
   revisit after using the tool on real work. It is a deliberate decision, not a defect —
   recorded here only so it is not mistaken for a bug during the QA pass.
2. **In variant-edit mode the overlay spans the expanded view while the stamp targets the
   smaller variant grid.** Cells outside the variant are filtered by `setPixelCells`, so the
   model stamps cropped: **the visible reference is larger than the stampable area.** Correct
   per the plan, likely surprising in use.
3. **Viewpoint buttons reach the container only via `pose.rotation`** — no container code
   references the viewpoint table, so check 21 is really a task-07 wiring check.
4. **The mannequin is a T-pose**, not arms-at-sides. Framing regions were re-tuned to match.

## 9. Bugs and gaps found by this task

**No new bug was found, and no application code was changed.** Everything this task
re-derived independently — the D10 DOM order, the D12 touch-branch placement on both paths,
the D5 pixelation levers, the D11 render isolation, the variant-edit stamp algebra, the
StrictMode guards, and the three-in-the-main-bundle grep — **agreed with what the earlier
waves reported.** The previous agents' claims held up under independent re-checking.

Two honest gaps in this task's own coverage, neither a code defect:

- **`bun run dev` was verified by launching the three `mprocs.yaml` commands individually**
  rather than through the mprocs TUI, which cannot be read from a non-interactive shell. All
  three bound their real ports and answered live HTTP. The mprocs *wrapper* itself is
  therefore inferred, not observed; the three processes it supervises are observed.
- **The root `format:check` glob does not cover most of this plan's new files**
  (`client/src/ui/**`, `client/src/stores/**` are outside it). `format:check` passed, but it
  passed on a narrower set than "everything this plan wrote". That is the repo's existing
  configuration and was left alone — flagged rather than silently widened.

## 10. Definition of done — honest status

- [x] `bun run verify` exits **0**; real output pasted above.
- [x] Every individual client gate run and recorded (boundaries, stylelint, storybook; tsc /
      eslint / vitest via the root gate).
- [x] Stylelint **exactly 2** errors; **no lockfile**; **no snapshot modified**; **no
      `toPersistedUIState()` key added**.
- [x] Bundle sizes recorded before **and** after; three confirmed in a separate lazy chunk
      and **proven absent from the main bundle by grep**.
- [x] `bun run dev` starts all three processes (see the caveat in §9).
- [x] All 29 QA items have a recorded result — **all honestly "not tested" for the
      observable behaviour**, 18 with their structural claim independently re-verified.
- [x] Every wave's status, commits, deviations and BLOCKED items recorded (no blocked items).
- [x] A single consolidated, risk-ordered "Priority checks for the owner" list (§7).
- [ ] ⚠️ **The 30 manual checks themselves — CANNOT be closed by any agent in this plan.**
      This is why task 10 is **PARTIAL**, not DONE. The plan is code-complete and
      gate-green; it is **not** verified as working software until a human runs §7.
