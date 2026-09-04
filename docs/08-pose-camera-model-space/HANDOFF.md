# HANDOFF — Pose camera, model space, and presets

**Current position:** W5 IN PROGRESS (tasks 06, 07)
**Branch:** `feat/08-pose-camera-model-space` (created 2026-09-03 off `00616a1`)
**Last commit:** `cee0910` (W4 complete; W5 dispatched)
**Plan written:** 2026-09-03 · Planning baseline HEAD: `494b5b4` (branch `feat/07-pose-refinements`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | **DONE** | 2026-09-04 | `19c8538` | tsc 0 · eslint **0 errors**/65 warn (baseline) · vitest **146 files / 2931 tests pass** · boundaries OK all 5 · snapshots **unmoved** · no lockfile |
| W2 | 03 | **DONE** | 2026-09-04 | `4727a53` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2945 tests pass** · boundaries OK · snapshots unmoved · **`UIStore.ts` diff EMPTY** · no lockfile |
| W3 | 04 | **DONE** | 2026-09-04 | `62f3052` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2965 tests pass** · boundaries OK · snapshots unmoved · `UIStore.ts` diff EMPTY · no lockfile |
| W4 | 05 | **DONE** | 2026-09-04 | `673f5fe` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2984 tests pass** · boundaries OK all 5 · snapshots **unmoved** · `UIStore.ts` diff EMPTY · no lockfile |
| W5 | 06, 07 | IN PROGRESS | 2026-09-04 | | |
| W6 | 08 | TODO | | | ⚠️ the persistence wave — data-safety gate |
| W7 | 09 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Model-space origins | W1 | **DONE** | `19c8538` | Vertices translated, not transforms (F2). ⚠️ Found `BufferGeometry.translate()` rewrites normals — avoided, pinned |
| 02 | Outline in the stamp | W1 | **DONE** | `9d89fd9` | Colour-only via `readExistingCell` (F1). See deviation D08-1 |
| 03 | Camera holds still: fit → scale | W2 | **DONE** | `76ce43f`, `4727a53` | F5 cure = **bounding sphere**. `rotation` REMOVED from `FitCameraParams`. ⚠️ See F5-COST below |
| 04 | Camera-space pan | W3 | **DONE** | `62f3052` | **No deviations.** Blit back to fixed origin; `viewToWorld` verified against three itself to 1.7e-16 |
| 05 | Presets + viewpoint semantics | W4 | **DONE** | `673f5fe` | F7 via one `applyCameraPreset` action; F9 inverts left/right **as a semantic change, maths byte-identical**. ⚠️ Records F8 (below). Open question 1 CLOSED. See deviation D08-8 |
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

- **F8 — F7 SUPERSEDES plan 06's D14. RECORDED BY TASK 05, 2026-09-04.**

  ⚠️ **D14 was not dropped by accident, and it was not reversed. It was subsumed.** Plan 06's
  **D14** read *"a camera preset overrides the projection"*, and it was deliberately **kept** by
  owner decision on **2026-09-03** — a conscious choice to preserve it, made *before* F7 existed.
  Plan 08's **F7** then widened the same behaviour: a preset now owns **`projection`, `pitch`,
  `yaw`, `fov`, the near/far clip policy, the fit, AND the model's `rotation`**, applied as one
  action. Projection-override is therefore a strict subset of what a preset does today.

  **What this means for a reader of plan 06:** D14's guarantee still holds, unchanged and
  observable — pressing **Isometric** still forces the projection to orthographic regardless of
  what the Projection buttons were set to. It is pinned by
  `PoseUIStore.test.ts` → *"applyCameraPreset writes the id, the projection, the FOV and the
  model's ROTATION"*. D14 has simply stopped being the **whole** rule; **F7 is now the whole
  rule, and D14 is the part of it that concerns projection.** If the two ever appear to
  conflict, **F7 wins** — it is the later owner decision and the wider one.

  **Where it is written in the code:** `PoseCameraPresetSpec`'s header and
  `PoseUIStore.applyCameraPreset`'s header both name D14 and state the supersession, so a reader
  arriving from either side finds it without needing this file.
- **F1 supersedes plan 07's E7** ("the outline is display-only, NOT stamped"). The owner reversed
  it directly: *"Stamping should definitely include the outline"*.

## Open questions for the owner

1. ~~**Does a camera preset also reset scale and pan?**~~ **CLOSED by task 05 (2026-09-04): NO.
   A preset sets every camera field and the model's rotation, and leaves `scale` and `pan`
   exactly as they were.**

   **Reasoning.** The owner's phrase was *"all of the other settings that can be used for the
   camera"* — and after tasks 03 and 04, **neither of these is a camera setting any more**:
   `scale` is a **model** transform (F6, `root.scale.setScalar(...)`, the camera does not move
   for it) and `pan` is a camera *translation* but expresses **framing**, not orientation. The
   distinction that settles it: **a preset restores which way the scene is POINTING; scale and
   pan are where the owner has PUT it and how close in they are working.** Rotation is
   overwritten because a preset is *about* orientation; scale and pan are preserved because a
   preset is not about framing. Losing your zoom every time you change angle is hostile in a way
   that losing your angle — the thing you asked to change — is not.

   ⚠️ **The counter-argument, recorded so this is re-decided rather than merely flipped:** a
   preset that leaves scale and pan alone is **not fully reproducible** — two presses of
   **Isometric** from different framings give two different pictures, which is in tension with
   F7's own "fully known state" language. That cost is real. The mitigation already exists and
   is one press away: **Fit to canvas** restores the scale separately, when that is what the
   owner actually wanted. If the owner disagrees after seeing it, the change is two lines in
   `applyCameraPreset` — but the counter-argument must be re-read first.

   Pinned by `PoseUIStore.test.ts` → *"leaves SCALE and PAN alone — open question 1, decided
   2026-09-04"*. The full reasoning also lives beside `PoseCameraPresetSpec` in
   `ui/canvas/pose/poseCamera.ts`, so it is found from the code as well as from here.
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

**⚠️ COORDINATOR'S INDEPENDENT VERIFICATION OF F9 (mistake 6 — the one that has already bitten
this table twice).** Task 05 claimed it changed *semantics only*, not maths. **I verified that
claim two ways rather than accepting it:**

1. **The non-comment diff of `poseCamera.ts` for W4 is, in its entirety:** the additive preset
   fields (`fov`, `rotation`, `clipPolicy`, `DEFAULT_PRESET_FOV`) **plus exactly two lines** —
   `left` and `right` exchanging their yaw values. **No maths function appears in the diff at all.**
2. **I re-derived the convention from scratch** in a scratch script, replicating the XYZ-order Y
   rotation independently of the codebase:
   - `left` (new yaw **−90°**): model front `(0,0,1)` → **`(−1,0,0)`** = screen-LEFT ✅, and the
     model's own right `(1,0,0)` → **`(0,0,1)`** = toward the viewer ✅
   - `right` (new yaw **+90°**): the exact mirror ✅
   That is **F9 stated exactly**: *left = the model turns to face left, so you see its RIGHT flank.*

**Conclusion: F9 is correctly implemented as a two-line semantic swap. The maths was not touched,
and the third accidental inversion did not happen.** ⚠️ This does **not** discharge manual check
W4-1 — see the note there about why no test can close it.

**Task 04 (W3) reported NO deviations** — its diff was exactly its three Touches files. Two design
points recorded as *inside* spec, not departures: it chose F3 **option 1** (move position and
target together) because option 2 cannot express an off-axis perspective through
`applyCameraParams` (F16); and it composes the pan **at paint time** rather than "splitting the
effect" as step 7 offered, because splitting still leaves pan a dependency of *something* running
per pointer sample — the D11 regression. ⚠️ **Two structural facts a later task must not undo:**
the fit effect deliberately does **not** depend on `pose.pan` (the un-panned result lives in
`poseFitParamsRef` with the pitch/yaw that placed it, since the basis cannot be recovered once the
pan has moved position and target), and the stamp calls `poseApplyPannedCamera()` before its three
passes so it cannot rasterise through a stale camera. ⚠️ The stamp's offset term was **dropped, not
adjusted** (`Math.round(pan.x) - stampOx` → `-stampOx`): pan now lives in the camera, so keeping it
would displace the stamp by the pan a second time.

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

**D08-8 — task 05 edited `PoseSection.stories.tsx`, which its own Constraints list forbids.**
The task file says *"Do not change … `PoseSection.stories.tsx`"*, and `PixelStudioPanelContainer.tsx`
**is** in its Touches (the known W2 exception). But the stories file spreads a `handlers` object
into every story's `args`, and it named `onSelectCameraPreset`. Renaming that prop to
`onApplyCameraPreset` — the rename is *inside* Touches, in `PoseSection.tsx` — left the stories
file failing `tsc` on **four** stories with *"Property 'onApplyCameraPreset' is missing"*, i.e. a
**broken build**, which rule 5 forbids outright. The edit is **one renamed key plus its comment**;
no story, arg, or description changed. Same class as **D08-5**: the collision matrix was not wrong,
it simply did not enumerate a rename's second consumer. ⚠️ **Note for task 06**, which owns
`PosePanel/` files in W5: the stories file's `handlers` block is now correct and needs no further
edit.

**D08-9 — the preset callback carries the SPEC, not the id, and the prop was RENAMED.**
`onSelectCameraPreset(id)` became `onApplyCameraPreset(spec)`. Two reasons, both load-bearing:
(1) F7 needs `projection`/`pitch`/`yaw`/`fov`/`rotation`/`clipPolicy` to reach the store in **one**
action, and an id alone cannot supply them without the container performing a second lookup into a
table the rail has already resolved; (2) the **rename is deliberately breaking** — a caller still
wired to the old, half-applying behaviour now fails to compile instead of silently setting only the
id. ⚠️ `PoseCameraPresetSpec` is a `ui/` type and the store may not import it, so
`PoseUIStore.ts` declares a **structural duplicate**, `PoseCameraPresetApplication`, under exactly
the same "these two change together" rule as the existing `poseTypes.ts` unions. It deliberately
omits `label` (a rail concern); the wider type is assignable to the narrower, so the seam needs no
cast. **`poseTypes.ts` was NOT touched** — the preset *id* union is unchanged, so the task's
stop-and-report condition never triggered.

**D08-10 — `setCameraPreset` was KEPT alongside `applyCameraPreset`, not replaced.**
It now only records the id. It survives because a future caller — session restore, and task 08's
saved scene presets — may legitimately have written the other fields itself. ⚠️ **A preset
BUTTON must never call it**: that is precisely the half-applied behaviour F7 exists to remove. Both
its header and its test say so.

**⚠️ D08-11 — F9 IS A SEMANTIC CHANGE. THE MATHS WAS NOT TOUCHED. HERE IS THE PROOF.**
The risk register warned that *"item 11 is implemented as a maths fix, re-inverting the buttons a
**third** time"*. It was not. Evidence, in order of strength:

1. **Every maths function in `poseCamera.ts` is byte-identical to `d4ae2b5`** — verified by
   extracting each function body and comparing digests: `applyEulerXYZ`, `orbitDirection`,
   `worldToView`, `viewToWorld`, `fitCameraToMesh`, `solveFitScale`, `offsetCameraParams`,
   `applyCameraParams`, `boundsRadius`, `boundsCentre`, `boxCorners` — **all UNCHANGED**.
2. **The entire non-comment diff of that file, outside the preset table, is two lines**:
   `left` and `right` **exchanged their yaw values** (`+90°` ↔ `−90°`). Nothing else.
3. **`applyEulerXYZ`'s own `describe` block is untouched**, including its "rotates +X to −Z under
   a +90 degree yaw" pin — the standing proof that the convention moved and the maths did not.
4. **Independently re-derived before editing.** With the camera on +Z: yaw `−90°` sends the model's
   front `(0,0,1)` → `(−1,0,0)` (**it faces screen-left**, as the button says) and its own right
   `(1,0,0)` → `(0,0,1)` (**toward the camera**). That is F9 exactly, and it is *today's `right`
   value*. So F9 is a **swap of two table entries**, which is what a change of meaning looks like.

**`three-quarter` was re-examined and deliberately LEFT AS IT WAS** (`{15°, 45°, 0}`). Its name
describes a **picture**, not a facing, so F9's model-centric/viewer-centric distinction — the thing
that inverts left/right — has nothing to bite on. Read model-centrically its 45° yaw turns the
subject to its right, presenting the viewer with its front and its **left shoulder**: the standard
reference 3/4, and the **same shoulder as before plan 08**. Flipping it would have swapped which
shoulder is shown for no reason the owner asked for, purely from a false analogy with `left`.

⚠️ **The tests were rewritten to be un-re-invertible.** The viewpoint assertions now read as
English sentences over **transformed basis vectors** — *"Left turns the model to FACE left, showing
the viewer its RIGHT flank"* — not over raw angle values. A test asserting `left.y === −90°` can be
"fixed" by editing the number on both sides; a test asserting which way the model's face points
cannot. The convention header was **rewritten, and the old "`left` shows the model's LEFT flank"
claim DELETED** rather than amended — a stale sentence contradicting the table is exactly how this
got inverted twice.

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

### W3 — 6 owed, **0 performed**

⚠️ **The most visually-dependent task of the plan so far.** The gate proves the arithmetic and the
sign conventions — and proves them well — but **the pan fix is almost entirely a claim about a
picture.** Task 04 verified `viewToWorld` against **three 0.185.1 itself** (camera placed, `lookAt`
called, `matrixWorld` columns compared) to **1.7e-16**, including at 89.9° pitch just short of
`lookAt`'s pole singularity; a 20,000-vector round trip closes to 1.1e-15. That is unusually strong
evidence for the *maths*. It is not evidence about the *render*.

1. ⚠️ **Highest value — the whole point of the task (owner item 3): pan the model toward a border
   and confirm it does NOT clip.** It should slide out of frame smoothly and be able to leave
   entirely.
2. The image stays **pixel-aligned while dragging** — no shimmer, no half-texel crawl. Pinned by
   the whole-texel snap test, but "no shimmer" is perceptual.
3. Dragging feels **1:1** with the finger/cursor and is **not inverted**. Pinned in NDC by two sign
   tests; the pointer path is byte-identical.
4. **Panning does not change the model's apparent size.** Pinned hard (no frustum dimension
   changes; distance preserved to 1e-10) — but perspective near-field parallax is real, and only an
   eye judges whether it reads as wrong.
5. **A stamp taken after panning lands where the model is drawn.** ⚠️ The variant-editing branch is
   unit-untested here, as under D08-1.
6. **Touch/iPad: pan still works, and a pinch still zooms the view** rather than dragging the
   model. Gesture routing (D12) untouched, but all touch behaviour in this project is unverified.

⚠️ Task 04's note: **F5-COST (the ~0.52 frame fill) will be visible in the same session** as
anyone who checks pan check 1 — a loosely-framed model makes panning to the border *easier*, not
harder. Judge the two together.

### W4 — 9 owed, **0 performed**

⚠️ **This task's central claim is about a picture, and no agent has one.** The gate proves that
the store writes six fields in one action and that the rotation table's transformed basis vectors
point where the sentences say — it proves **nothing about what appears on screen**.

⚠️⚠️ **CHECK 1 IS THE ONE THAT MATTERS AND IS THE HARDEST OF THE PLAN TO VERIFY WITHOUT EYES.**
Left/right inversion is *uniquely* resistant to unit testing: the maths is self-consistent under
**both** conventions, so a test can only ever assert the convention it was written against. This
table has now been inverted **twice** (once as a genuine bug fix, once as F9's deliberate semantic
change). The tests were written as English sentences over basis vectors specifically to make a
third accidental inversion hard — **but nothing in the suite can tell the owner whether the model
on their screen turns the way they meant.** Only their eyes close this.

1. ⚠️⚠️ **THE DECIDING CHECK. Press Left: the model TURNS TO FACE LEFT**, so you see its **RIGHT**
   side. Press **Right**: the mirror — it faces right and you see its **LEFT** side. If this feels
   backwards to the owner, **F9 itself is what needs re-deciding — do NOT flip the signs**, and do
   not touch `applyEulerXYZ`. Re-read D08-11 first.
2. **Top** shows the crown; **Bottom** the underside; **Front** and **Back** are unchanged from
   before plan 08. ⚠️ These are the control group: if left/right look right but top/bottom now look
   wrong, something *did* change in the maths and D08-11's evidence needs re-reading.
3. Pressing **Isometric** (or any preset) changes projection, camera angle **and** model rotation
   in one go, giving an immediately recognisable known view.
4. ⚠️ **Pressing a preset OVERWRITES a rotation you set with the orb.** This is intended (F7,
   owner-decided) and will feel destructive the first time. Confirm the owner still wants it after
   using it.
5. Pressing the same preset **twice** does nothing the second time.
6. ⚠️ **Open question 1's decision, seen: a preset does NOT reset Scale or Pan.** Scale the model
   up, pan it off-centre, press **Isometric** — the angle changes, the size and position do not.
   Confirm this is the wanted behaviour; the counter-argument is recorded above.
7. **`three-quarter` still looks like the classic reference pose** and shows the **same shoulder**
   it did before plan 08 — the check that it was correctly left alone.
8. **Oblique's model rotation matches the ¾ button.** Pressing **Oblique** then **3/4** should
   change the camera but leave the model's orientation where it was.
9. ⚠️ Every preset now writes the **FOV** too, including the four orthographic ones (which ignore
   it while selected). Press **2D**, then switch to **Perspective**: the FOV should read 50, not
   whatever it was before. This is the least obvious consequence of "a preset sets everything".

**This agent could not confirm `bun run dev`** (three long-lived mprocs processes). No entry point,
config or build input was touched, and the client typecheck, lint, boundary scan and full suite all
pass — that is inference, not observation.

## Notes for the next session

(none yet)
