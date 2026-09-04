# HANDOFF — Pose camera, model space, and presets

**Current position:** W3 IN PROGRESS (task 04)
**Branch:** `feat/08-pose-camera-model-space` (created 2026-09-03 off `00616a1`)
**Last commit:** `4727a53` (W2 complete)
**Plan written:** 2026-09-03 · Planning baseline HEAD: `494b5b4` (branch `feat/07-pose-refinements`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | **DONE** | 2026-09-04 | `19c8538` | tsc 0 · eslint **0 errors**/65 warn (baseline) · vitest **146 files / 2931 tests pass** · boundaries OK all 5 · snapshots **unmoved** · no lockfile |
| W2 | 03 | **DONE** | 2026-09-04 | `4727a53` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2945 tests pass** · boundaries OK · snapshots unmoved · **`UIStore.ts` diff EMPTY** · no lockfile |
| W3 | 04 | IN PROGRESS | 2026-09-04 | | |
| W4 | 05 | TODO | | | |
| W5 | 06, 07 | TODO | | | |
| W6 | 08 | TODO | | | ⚠️ the persistence wave — data-safety gate |
| W7 | 09 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Model-space origins | W1 | **DONE** | `19c8538` | Vertices translated, not transforms (F2). ⚠️ Found `BufferGeometry.translate()` rewrites normals — avoided, pinned |
| 02 | Outline in the stamp | W1 | **DONE** | `9d89fd9` | Colour-only via `readExistingCell` (F1). See deviation D08-1 |
| 03 | Camera holds still: fit → scale | W2 | **DONE** | `76ce43f`, `4727a53` | F5 cure = **bounding sphere**. `rotation` REMOVED from `FitCameraParams`. ⚠️ See F5-COST below |
| 04 | Camera-space pan | W3 | TODO | | |
| 05 | Presets + viewpoint semantics | W4 | TODO | | ⚠️ Records F8: F7 supersedes D14 |
| 06 | Advanced camera mode | W5 | TODO | | Ships a component; 08 mounts it |
| 07 | Exact Euler entry | W5 | TODO | | ⚠️ F11 decision required for the light |
| 08 | Saved scene presets, persisted | W6 | TODO | | ⚠️ **The only wire-format change** |
| 09 | Full gate, QA, handoff | W7 | TODO | | Likely ends `PARTIAL` |

## Known state at planning time (2026-09-03)

**The worktree is CLEAN** at `494b5b4` on `feat/07-pose-refinements`, and `bun run verify`
**exits 0**. Plan 07 is code-complete.

**Gate baseline measured 2026-09-03:**

- `bun run verify` (root) → **exit 0**
- `bunx tsc --noEmit` → exit 0
- `bunx eslint .` → **0 errors**, 65 warnings
- `bunx vitest run` → **146 files / 2866 tests pass**
- `bun run lint:boundaries` → OK, all 5 rules
- `bunx stylelint "src/**/*.css"` → 70 problems: **2 errors** (`OtherHand.css:338`, `:359`),
  both pre-existing
- `bunx storybook build` → exit 0
- No lockfile. ⚠️ `bunx` recreates `client/bun.lock` — sweep after every invocation.

**Bundle baseline:** main **793.89 kB / 231.22 kB gz**; `three.module` **734.33 / 189.46 gz**
(lazy); `GLTFLoader` **45.56 / 13.70 gz** (lazy). `three` is **not** in the main bundle.
⚠️ `BufferGeometry` appears **1×** in main (a namespace access, not library source) and **26×**
in the three chunk — that is the positive-control baseline, not zero.

## ⚠️ Carried debt — read before starting

**All 41 consolidated manual checks from `docs/07-pose-refinements/HANDOFF.md` §7.7 remain
UNPERFORMED — 0 of 41 observed.** No agent in plans 06, 07 or this one has had a browser, a GPU
or a device. In particular:

- The **depth-derived heights** were reasoned from three's shader source and **never executed on
  a GPU**. Task 02 adds a second outline pass alongside that readback path.
- **WebGL context-leak behaviour** across repeated tool switches is untested.
- **All touch/iPad gestures** are untested.

⚠️ **This plan is unusually visual.** Six of its eleven items can only be confirmed by looking.
A green gate here proves the arithmetic, not the picture. Task 09 must say so plainly.

**A confirmed, unfixed defect carried in:** `.pose-panel__slider` has **no `touch-action: none`**
while `.direction-orb__sphere` (`PosePanel.css:257`) has it under a comment calling it "THE TOUCH
FIX, not a nicety". **Task 08 fixes it** (this plan adds more sliders), but it stays unverifiable
without a device.

## Owner decisions carried in (do not re-open)

- **F1** The stamped outline writes **colour only** — normal and height **untouched**.
- **F4/F6** The camera **holds still**; `fit()` solves for the **model scale**; `zoom` → `scale`.
- **F7** A camera preset sets **everything, including the model's rotation**.
- **F9** **`left` = the model turns to face left** (you see its RIGHT flank) — this **inverts**
  today's left/right. `top`/`bottom`/`front`/`back` are unchanged.
- **F12** Presets are **persisted to the project file**, following `layoutPresets` exactly.

⚠️ **A correction the owner should know about, recorded for honesty:** during planning the
coordinator first warned that persisting presets would force a schema migration and shift all 151
corpus digests. **That was wrong**, and the owner was told so before confirming. Measured: the
digest pipeline is `digest(compactToProject(rawJSON))` and never calls `toPersistedUIState()`, so
a **conditionally-emitted** key shifts nothing and needs no migration (F13/F14). Seven keys were
added this way before. The remaining real risks are the three traps in task 08's Context.

## ⚠️ Decisions this plan SUPERSEDES

- **F8 — F7 supersedes plan 06's D14** ("preset overrides projection"). D14 was kept by owner
  decision on 2026-09-03, *before* F7 existed; F7 subsumes it because a preset now owns
  projection **and** every other camera field **and** the model's rotation. **Task 05 must record
  this explicitly** — do not let a later reader think D14 was dropped by accident.
- **F1 supersedes plan 07's E7** ("the outline is display-only, NOT stamped"). The owner reversed
  it directly: *"Stamping should definitely include the outline"*.

## Open questions for the owner

1. **Does a camera preset also reset scale and pan?** Task 05 decides and records. Recommended:
   no — a preset restores orientation and projection, leaving the owner's framing alone.
2. **How are the light's angles represented?** (F11) The light is a **unit vector** with no Euler
   form today, and vector → Euler is **not unique** (roll is unconstrained). Task 07 decides;
   recommended is a two-field azimuth/elevation control, honestly labelled.
3. ~~**Is the full mannequin's geometry centred too, or only the parts?**~~ **CLOSED by task 01
   (2026-09-04): YES, the full scene is centred too.** Baking node transforms proved unnecessary —
   a scene has one centre, so the single world offset is converted into each node's local frame via
   the inverse world matrix (differencing two mapped *points*, which strips the translation column).
   The node tree keeps its shape; nothing is flattened. Rationale: the owner's instruction was
   unqualified, and the full figure is the mesh the orb rotates most often, so leaving it orbiting
   its own pelvis would have reproduced the reported bug on the most visible mesh. A test pins that
   the two nodes' relative offset is preserved — the guard against the obvious wrong implementation
   (`centerGeometryOnOrigin` inside a `traverse`), which would centre each mesh on its own centre
   and explode the figure.
4. **What does a saved preset contain?** Task 08 decides `pan` / `lightDirection` / `lightColor` /
   `edgeWidth` / `meshId` inclusion. Recommended: include light and mesh, exclude pan.

## Deviations

**D08-1 — task 02 resolved its stop-and-report condition inside Touches instead of stopping.**
Task 02 step 4 said: *"if the cell type cannot express 'colour only', that is a real finding:
stop and report it."* **It cannot.** `PixelStore.setPixelCells` is authoritative on all three
channels (`PixelStore.ts:112-118`) and `PixelCellWrite`'s `0` sentinels mean *empty* / *no data*,
**not** *unchanged*. The agent implemented F1 anyway, without leaving its Touches list, by having
the container read the existing cell and pass its normal/height back through a new
`readExistingCell` callback. Coordinator's assessment: **the right call** — stopping would have
required editing `PixelStore.ts`, which is in no task's Touches, and the callback keeps
`poseStamp.ts` pure (the new `PoseExistingCell` is structural, so `ui/` still imports no
`types/domain.ts`). The finding is recorded in both files' headers. ⚠️ The container's
`readExistingCell` duplicates `editableGrid`'s variant resolution inline (the real one is declared
later in the render body, so the earlier callback cannot call it) — **that duplication is
unit-untested and is owed manual check 6.**

**D08-2 — task 01 did NOT use `BufferGeometry.translate()`**, the spec's first-listed option (it
allowed either that or writing the attribute directly). ⚠️ **This one is load-bearing, not a style
preference.** `translate()` delegates to `applyMatrix4()`, which does not stop at `position`: it
derives the normal matrix and calls `normal.applyNormalMatrix()`, ending in `.normalize()` on
**every normal in the buffer**. For a pure translation no normal changes *direction*, but the
asset's authored normals are **not exactly unit length**, so re-normalising rewrites them
(measured: real torso `0.4748470187187195` → `0.4748469889163971`). That is the same regression
class as `computeVertexNormals()` — a silent partial return of flat shading — arriving through a
function whose name promises it only moves vertices, and it would have silently mutated the exact
data plan 07 task 05 went out of its way to **copy** rather than recompute. Task 01 writes
positions directly instead and pins it two ways: a deliberately **non-unit** normal as a tripwire
(`poseMeshes.test.ts:1078`) and a **byte-identity** assertion on the real asset (`:1528`).
Coordinator verified both tests exist and the file contains no `.translate()` call.

**D08-3 — task 01's test file now constructs real `three` objects**, contradicting its own header
rule and MASTER's note that geometry construction "cannot run where there is no WebGL". Measured
by the agent: WebGL is needed only by `WebGLRenderer`; `BufferGeometry`/`Box3`/`Vector3`/`Matrix4`
are float maths, and the unit lane is **node**, not jsdom (`vitest.config.ts`,
`projects[0].environment: "node"`). This matters because **F2 is a claim about vertex positions**,
and asserting it on exported constants would not have asserted it at all. The stale header rule was
rewritten rather than left in place. Coordinator's assessment: correct, and the 2931-test green run
confirms it executes.

**⚠️ F5-COST — A REAL, OWNER-VISIBLE TRADE-OFF THAT NEEDS THE OWNER'S EYES (task 03).**
Task 03 chose F5 **option 1, the bounding sphere**, because its rotation-invariance is provable
by construction rather than approximate: rotating a model about its centre moves every vertex
along the sphere's surface and can never move one outside it. Option 2 (unrotated box) would
trade a pulsing model for an **intermittently clipped** one.

**The price is real and visible.** A box inside its own bounding sphere reads at **1/√3 ≈ 0.577**
of the frame, so the unit box now fills **~0.52** of the shorter axis at the default 10% padding —
where the old rotated-box fit hit **0.9 at rest** (and 0.9/√2 ≈ 0.64 at 45° yaw; *that oscillation
was the bug*). **The picture is worse-framed but stable.** That is exactly the trade F5 asks for,
but **no owner has seen it rendered.**
→ If it reads as too small, **the lever is the padding constant in `CanvasContainer`** — ⚠️ **NEVER
a return to a rotation-dependent fit**, which brings the pulsing straight back. The exact constant
is asserted in `poseCamera.test.ts` so a silent switch to option 2 cannot pass. **This is owed
manual check W2-5 and is the one most likely to send task 03 back.**

**D08-5 — task 03 edited `PixelStudioPanelContainer.tsx`, which is not in its Touches list.**
It is the **only** wiring between `pose.zoom`/`setZoom` and `PoseSectionProps`; not editing it
would have left the **build broken**. Coordinator verified the diff: **two functional lines**
(`scale: pose.scale`, `onSetScale: …`) plus comment updates — the unavoidable consequence of a
rename that *is* inside Touches. Assessment: **correct call**; the collision matrix was not wrong,
it simply did not enumerate the rename's one consumer.

**D08-6 — "Fit to canvas" resets the owner's `scale` to 1**, from a container effect. The fit
scale is a pure function of two constants, so without this a fit would be **invisible** at any
scale but 1 (spec step 8: "a fit now sets the scale"). The store's `requestFit()` stays pure — its
exactness test passes verbatim. ⚠️ The effect's `> 0` guard is **load-bearing**: the counter starts
at 0 and the effect runs on mount, so without it a reload would silently reset a scale the owner
had set.

**D08-7 — mesh-swap safety uses `poseBaseScaleRef`, not a wrapper Group.** `normalizeToUnitBox`
writes `object.scale.multiplyScalar(1/largest)` on the very object `poseRootRef` holds, so
`setScalar(user)` would **overwrite** it (a 170-unit mannequin jumps to 170× a cube) and
`multiplyScalar` would **compound every render**. The base is captured once per mesh right after
`setObject3D`; every write is `setScalar(base × fit × user)` — an assignment from a constant, so
idempotent, and a swap re-captures.

**A self-inflicted bug task 03 caught and fixed mid-task**, recorded because the measurement is
useful: its first draft folded the (deliberately large, scale-proof) depth allowance into the
camera **distance**, which for a perspective camera is what sets framing — measured
`frameOccupancy` fell to **0.02**. The allowance now reaches the **clip planes only**.

**D08-4 — `poseMeshes.ts` is now near the `ui/` 400-line ceiling.** Task 01's first draft hit 408
code lines (1 eslint error) and was resolved by factoring a genuine duplication into `usableCentre`,
not by padding comments. ⚠️ **Note for a later task adding to this file: it may need to be split.**

## Blocked items

(none yet)

## Manual check results

(recorded per task as waves complete — **every task in this plan carries owed visual checks**;
none of the eleven owner items can be fully confirmed without a browser)

### W1 — 12 owed, **0 performed**

Neither W1 agent had a browser, a GPU or a device. The gate proves the arithmetic, not the picture.

**Task 01 (4):**
1. Selecting **Head** shows a head centred in the frame.
2. Rotating a part with the orb spins it **about itself**, not about a point off-screen.
3. The full mannequin still loads and frames as it did. ⚠️ **Raised in importance by the
   open-question-3 decision** — task 01 changed this path, so it is no longer a mere no-regression
   check.
4. ⚠️ **Highest value of the four:** parts still shade **smoothly** (no flat facets) — the visual
   proof of the D08-2 `translate()` finding. The byte-identity test is strong evidence; only a GPU
   render proves the result.

**Task 02 (8):**
5. Stamping with edge width 0 produces exactly what it did before.
6. Stamping with width 1–4 writes a crisp outline in the **Edge** colour, landing where the overlay
   drew it.
7. The stamp is still **one** undo entry (one Ctrl-Z removes model + outline together).
8. ⚠️ **Highest value overall — the F1 assertion.** Stamping an outline over existing artwork
   leaves that artwork's normals and heights intact; open the lighting studio and confirm the
   underlying surface still shades as it did.
9. An outline pixel on empty canvas has colour but no lighting response — **expected, not a bug**.
10. The outline stamps correctly **while editing a variant** (the `readExistingCell` grid
    resolution's variant branch is unit-untested — see D08-1).
11. The outline stamps correctly **at a non-zero pan**.
12. ⚠️ **The depth-derived height path has still never run on a GPU** (plan 07; 0 of 41 observed).
    Task 02 adds a second buffer copy alongside it without restructuring it, but it stays unproven.

**Neither agent could confirm `bun run dev`** (three long-lived mprocs processes). Client build,
typecheck, lint and the full suite pass and no config or entry point was touched — that is
inference, not observation.

### W2 — 7 owed, **0 performed**

The 17-significant-digit invariance sweep proves the **camera** is constant through a full
revolution (24 steps × 3 axes × 2 bounds × 2 projections, `PoseCameraParams` deep-equal). It does
**not** prove the rendered model is. Only an eye does that.

1. ⚠️ **Highest value: rotate the orb through a full circle — the model does NOT pulse.** This is
   owner item 4, the whole point of the wave.
2. The **Scale** control grows/shrinks the model about its own centre while the camera visibly
   does not move (owner item 6).
3. Scale far past the old cap (250, 1e4): nothing clamps it, **and the model does not vanish
   through a clip plane**. ⚠️ `POSE_DEPTH_ALLOWANCE = 64` radii is **reasoned, not observed**.
4. **Fit to canvas** returns the model to the fitted size at the current rotation, without
   resetting pan.
5. ⚠️ **The one most likely to send task 03 back — see F5-COST above.** Initial load still
   auto-fits, **and the new ~0.52 frame fill is acceptable to the owner.**
6. Resizing the object re-fits.
7. A part and a primitive both scale about their own centres (depends on task 01, whose 4 checks
   are also unobserved).

## Notes for the next session

(none yet)
