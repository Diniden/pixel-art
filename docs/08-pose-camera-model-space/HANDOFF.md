# HANDOFF — Pose camera, model space, and presets

**Current position:** W7 IN PROGRESS (task 09 — final gate + closing D08-16)
**Branch:** `feat/08-pose-camera-model-space` (created 2026-09-03 off `00616a1`)
**Last commit:** `a2aa8cc` (W6 complete)
**Plan written:** 2026-09-03 · Planning baseline HEAD: `494b5b4` (branch `feat/07-pose-refinements`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | **DONE** | 2026-09-04 | `19c8538` | tsc 0 · eslint **0 errors**/65 warn (baseline) · vitest **146 files / 2931 tests pass** · boundaries OK all 5 · snapshots **unmoved** · no lockfile |
| W2 | 03 | **DONE** | 2026-09-04 | `4727a53` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2945 tests pass** · boundaries OK · snapshots unmoved · **`UIStore.ts` diff EMPTY** · no lockfile |
| W3 | 04 | **DONE** | 2026-09-04 | `62f3052` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2965 tests pass** · boundaries OK · snapshots unmoved · `UIStore.ts` diff EMPTY · no lockfile |
| W4 | 05 | **DONE** | 2026-09-04 | `673f5fe` | tsc 0 · eslint **0 errors**/65 warn · vitest **146 files / 2984 tests pass** · boundaries OK all 5 · snapshots **unmoved** · `UIStore.ts` diff EMPTY · no lockfile |
| W5 | 06, 07 | **DONE** | 2026-09-04 | `64d6629` | tsc 0 · eslint **0 errors**/65 warn · vitest **148 files / 3047 tests pass** · boundaries OK · **stylelint exactly 2 errors** (`:338`/`:359`, pre-existing) · **storybook build 0** · snapshots unmoved · `UIStore.ts` EMPTY |
| W6 | 08 | **DONE** (⚠️ one gap, D08-16) | 2026-09-04 | `a2aa8cc` | tsc 0 · eslint **0 errors**/65 warn · vitest **148 files / 3102 tests pass** · boundaries OK · stylelint exactly 2 · storybook 0 · ⚠️ **corpus digest `e448764a…` UNCHANGED, verified by coordinator against a pre-dispatch baseline** · `server/` untouched · no lockfile |
| W7 | 09 | IN PROGRESS (agent 1 hit a rate limit mid-task; resumed) | 2026-09-04 | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Model-space origins | W1 | **DONE** | `19c8538` | Vertices translated, not transforms (F2). ⚠️ Found `BufferGeometry.translate()` rewrites normals — avoided, pinned |
| 02 | Outline in the stamp | W1 | **DONE** | `9d89fd9` | Colour-only via `readExistingCell` (F1). See deviation D08-1 |
| 03 | Camera holds still: fit → scale | W2 | **DONE** | `76ce43f`, `4727a53` | F5 cure = **bounding sphere**. `rotation` REMOVED from `FitCameraParams`. ⚠️ See F5-COST below |
| 04 | Camera-space pan | W3 | **DONE** | `62f3052` | **No deviations.** Blit back to fixed origin; `viewToWorld` verified against three itself to 1.7e-16 |
| 05 | Presets + viewpoint semantics | W4 | **DONE** | `673f5fe` | F7 via one `applyCameraPreset` action; F9 inverts left/right **as a semantic change, maths byte-identical**. ⚠️ Records F8 (below). Open question 1 CLOSED. See deviation D08-8 |
| 06 | Advanced camera mode | W5 | **DONE** | `bd81268` | Standalone `CameraAdvanced.tsx`; F16 caveat rendered on screen. **Task 08 must mirror `CameraAdvancedProps` exactly** |
| 07 | Exact Euler entry | W5 | **DONE** | `64d6629` | F11 CLOSED: **two fields (azimuth/elevation), no roll box.** ⚠️ Found a quiet composition bug — verified |
| 08 | Saved scene presets, persisted | W6 | **DONE** (⚠️ D08-16) | `a2aa8cc` | F13/F14 held; digest unmoved. Split `PoseSection.tsx`. ⚠️ `onChange` reaches only `fov` |
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
2. ~~**How are the light's angles represented?**~~ **CLOSED by task 07 (2026-09-04): TWO fields —
   `Azimuth` and `Elevation` — derived from the vector every time, with NO stored second copy.**
   ⚠️ **The deciding argument was not the store constraint.** Storing typed angles alongside would
   mean shipping **a roll box that does nothing**: typing in it would change the stored angles,
   leave the vector identical, and light the model exactly as before. A control that accepts input
   and produces no effect is worse than one not offered, and no labelling rescues it. The stored-
   angles design also **drifts the instant the light orb is dragged** (the orb writes a vector; the
   copy would not know).
   **The exact round-trip the owner will experience:** type a number, the light moves; drag the
   orb, the numbers follow live; type, look away, come back — **the same two numbers**, with one
   bounded exception. Elevation is reported in −90…90 and azimuth in −180…180, so `elevation 100`
   redisplays in its canonical spelling (physically identical: 10° past the pole = `elevation 80`
   with azimuth flipped 180°) and `azimuth 370` comes back as `10`. **Nothing is lost — the light
   is exactly where the typed numbers put it** — the numbers are a *reading* of the vector, not a
   remembered copy. ⚠️ **The model's rotation is deliberately asymmetric here:** `370` stays `370`,
   because those three numbers **are** the stored state. That asymmetry is the honest price of
   storing no second copy. **Owed manual check W5-4 is where the owner accepts or rejects it.**
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
4. ~~**What does a saved preset contain?**~~ **CLOSED by task 08 (2026-09-04): `meshId`,
   `rotation`, `projection`, `cameraPreset`, `fov`, `scale`, `lightDirection`, `lightColor`,
   `edgeWidth`. It EXCLUDES `pan`.** Light and mesh are in, as recommended — a scene without its
   subject is not a scene.
   ⚠️ **The interesting half is the deliberate asymmetry with open question 1.** `scale` **is**
   included even though a *camera* preset leaves it alone, because the two are different objects:
   a **camera preset is a verb** ("put me at isometric") firing while the owner works at a scale
   they chose — taking it away punishes them for changing angle. A **scene preset is a noun** ("the
   setup I saved"), asked for so it can be *reloaded*; restoring everything except how big the
   model was gives back a view that was never saved.
   ⚠️ **`pan` is excluded for a harder reason than framing-vs-orientation:** pan is measured in
   **grid cells of whatever canvas was open**, so a pan saved on a 64×64 sprite lands somewhere
   else on a 32×32 one — and pan is unbounded (E13), so a restored preset could put the model off
   screen **with no visible cause**. Scale is canvas-independent; pan is not. The full reasoning,
   the counter-argument, and a note that this is a **one-field change** if the owner disagrees live
   beside `PersistedPosePreset` in `types/domain.ts`.

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

**⚠️ COORDINATOR-VERIFIED FINDING (task 07) — a QUIET wrong answer that was caught before it
shipped.** Composing the light's azimuth/elevation with **one** combined `applyEulerXYZ({0,0,1},
{x:-elev, y:azim, z:0})` call is **NOT** "turn, then lift": three's XYZ order composes `Rz·Ry·Rx`,
so the two operations interfere. **I re-derived this independently and my numbers match task 07's
to six decimals** — at azimuth 45 / elevation 20:

| | vector |
| --- | --- |
| **Correct** (two sequential calls) | `(0.664463, 0.342020, 0.664463)` |
| **The trap** (one combined call) | `(0.707107, 0.241845, 0.664463)` |
| delta | x **0.042644**, y **0.100175** |

⚠️ **Both results are exactly unit length**, which is precisely why this is dangerous: it would
never throw and never look broken — it would surface as *"the boxes and the orb disagree
slightly"* and be chased for hours in the wrong place. The code composes **two** `applyEulerXYZ`
calls, a test pins the difference, and the correct composition reproduces `DirectionOrb`'s own
`vectorToSpherical` **to 1e-12**, so boxes and orb cannot disagree.

**D08-13 — task 07 made two small compressions inside `PoseSection.tsx` beyond its wiring.** The
file sat at **394 of the 400 code-line `ui/` error ceiling** and the wiring pushed it to 403. Both
changes are genuine simplifications, not comment-padding: an 11-line inline `satisfies readonly
(readonly [...])[]` became a hoisted `ColorSlotRow` type alias, and `viewpointTitle`'s 16-line
`switch` became a `VIEWPOINT_TITLES` lookup plus a 5-line function. No behaviour changed and the
covering tests still pass; coordinator confirmed `max-lines` no longer fires.
⚠️⚠️ **STRUCTURAL WARNING FOR TASK 08: `PoseSection.tsx` is at ~397 code lines and has
essentially NO budget left — and task 08 must mount BOTH `CameraAdvanced` and the preset UI into
it. It very likely needs splitting BEFORE more is added.** Splitting a `ui/` component is in
keeping with the boundary rules, but it is real work that task 08's estimate may not include.

**Task 08 must mirror `CameraAdvancedProps` exactly** (task 06 ships it unmounted):
`{projection, near, far, orthographic?, perspective?, defaultOpen?, onChange, onSaveAsPreset,
onReset?}`, where `CameraAdvancedPatch` is **sparse** and deliberately omits `position`/`target` —
those belong to the fit and the pan, not the frustum.

**D08-12 — task 06's `parseNumber` / `describeInvalid` are module-private, not exported.** Its
first draft exported them for direct unit testing, but `react-refresh/only-export-components` is an
**error** under `PosePanel/` (downgraded to `warn` only for a named list of legacy directories,
which this is not), so exporting a non-component from a component module cost 2 eslint errors.
Constants like `MATRIX_NOTE` are exempt; **functions are not.** Both rules are now pinned *through
the rendered component*, which is the stronger pin — it proves the box wired to the guard rejects
the empty string, not merely that a helper does.
⚠️ **A note task 06 passed to task 07 mid-wave:** `EulerInput.tsx` hits the same rule for the same
reason. Coordinator observed 1 eslint error at `PoseSection.tsx:678` (`max-lines`) while task 07
was **mid-edit** — that is task 07's file in flight, not task 06's, and it is resolved at the W5
gate below, not here.

**Minor scope note on task 06 (not a deviation):** it also added
`PosePanel/CameraAdvanced.stories.tsx`, which the Touches list did not enumerate. It is the
conventional companion to a new `ui/` component, purely additive, and required for the
`storybook build` leg of the W5 gate. Coordinator's assessment: **within the spirit of the
matrix** — no other task owns that path, so no collision was possible.

**Coordinator verified task 06's F16 handling.** The owner asked for *"exact values for the
camera's projection matrix"*; a raw 4×4 input would be **silently overwritten** by
`updateProjectionMatrix()`. Rather than shipping a control that provably does nothing, task 06
renders the reason on screen (`MATRIX_NOTE`): *"These fields ARE the projection matrix. The camera
rebuilds its matrix from them every frame (updateProjectionMatrix), so a hand-typed 4×4 would be
overwritten — entering the frustum values is the only way to set it exactly."* Three DOM tests pin
it, one asserting the text names the **mechanism** so a future reader does not "add the missing
4×4 input". Import check: the component imports only React, one `type`, and its CSS — the `ui/`
boundary holds.

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

**D08-17 — task 09 CHANGED APPLICATION CODE, and its own task file forbids that.**
The 09 spec says *"bundle/QA notes only — no application code"* and *"do not change application
behaviour; if you find a real bug, record it rather than fixing it."* The coordinator's dispatch
overrode this deliberately, assigning task 09 the closure of **D08-16** (owner item 8's other
half) and adding `CanvasContainer.tsx`, `PixelStudioPanelContainer.tsx`, `PoseUIStore.ts` and the
`PosePanel/` wiring files to its Touches. Recorded so a reader comparing the task file against the
diff does not think the constraint was ignored. **Nothing else was patched at the gate** — the four
findings in §12 are reported, not fixed, exactly as the constraint intends.

**D08-18 — task 09 SPLIT `poseCamera.ts`, which its Touches did not enumerate.**
The inherited override layer pushed the file to **430** code lines, over the `ui/` 400-line
`max-lines` **error** ceiling (measured: `poseCamera.ts 1204:1 error File has too many lines
(430)`). Tasks 01, 07 and 08 all hit this same ceiling; task 08's precedent was to **split along a
real seam and keep an existing test as the pin that the split changed nothing**, and this follows
it. The seam: everything moved to **`poseCameraPresets.ts`** is a **named table** (the five camera
presets, the seven viewpoint rotations, the degree helpers); everything left is **geometry** (the
fit, the frustum, the pan offset, the Euler maths). ⚠️ **No consumer moved** — all eight symbols
are re-exported from `poseCamera.ts`, so `CanvasContainer.tsx`, `PixelStudioPanelContainer.tsx`,
`PoseSection.tsx`, `PoseCameraGroup.tsx`, `EulerInput.tsx`, `PoseSection.stories.tsx` and both DOM
test files are **untouched**, and `poseCamera.test.ts` still imports all eight from `poseCamera.ts`
and its **103 tests pass unchanged**. That is the proof it was a move rather than an edit. One
exception is documented in the code: `fitCameraToMesh` reports its FOV in degrees, so
`radiansToDegrees` is **imported back** as well as re-exported.

**D08-19 — the advanced camera overrides are SESSION-ONLY, decided rather than defaulted.**
The dispatch left this open (*"session-only unless you deliberately decide otherwise — and if you
persist it, F13's conditional-emission rule and the corpus digest apply"*). **Decision:
session-only.** The persistence path for an exact frustum already exists and is the one the owner
asked for — *"save that matrix into a preset I can select"* — so a second wire key would take on
F13's conditional-emission rule and the corpus-digest risk **for no behaviour a saved preset does
not already give**. The `cameraOverrides` field therefore joins the live pose as session state and
`clear()` resets it. ⚠️ **A camera preset and `requestFit()` deliberately do NOT clear it**: the
dispatch's hard constraint is that a typed value must survive a re-fit, and a preset press is a
re-fit. Two tests pin exactly that.

**D08-20 — `UIStore.ts`'s W6 diff is ~19 lines, not the "exactly one `assign()` line" the 09 spec
predicted.** The **emission** is exactly one conditional `assign()` (`UIStore.ts:581`) and is never
`posePresets: undefined` — that is the F13 mechanism and it held. But task 08 also had to make the
pose store reachable from `UIStore` (a `poseUI` dependency, an `ownPosePresets` fallback for the
harness suites, a private `toPersistedPosePresets()` and a `hydrate` branch). Coordinator-reviewed
and gate-clean; recorded because the 09 spec inverted this check specifically and told the reader
to **read the diff rather than pattern-match** — this is what reading it found. **Task 09 did not
touch `UIStore.ts`.**

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

### W5 — 11 owed, **0 performed**

**Task 06 — advanced camera mode (5):**
1. The advanced panel opens and shows the right fields for the current projection.
2. Typing an exact `fov` / ortho box changes the view to *exactly* that. ⚠️ **Blocked on task 08's
   wiring** — nothing is mounted yet.
3. An invalid `near`/`far` combination is visibly rejected and does not corrupt the view. The red
   border and reason line are asserted in the DOM; whether they *read* as rejection is perceptual.
4. ⚠️ **Most likely to send task 06 back: layout at 240 px** — six numeric boxes in a narrow rail.
   A two-column grid is the mitigation and the `Orthographic`/`Perspective` stories mount at
   exactly 240 px for review, but **no one has looked at them.**
5. Touch: the numeric fields are usable on iPad and the rail does not scroll while typing.

**Task 07 — Euler entry (6):**
6. Typing `45` into the model's Y rotation turns it exactly as dragging the orb to 45° does.
7. Dragging either orb updates its numeric fields **live**, and typing moves the orb.
8. ⚠️ **The measured trap, live:** typing a negative or partial value (`-`, `.`) does **not** snap
   the model to 0 mid-keystroke. Pinned by tests at both levels via synthetic `change` events, but
   **real browser keystroke sequences are not the same thing.**
9. ⚠️ **Highest value of the six — the visual proof of the F11 decision.** The light's fields move
   the light as expected and the values shown match its actual direction after dragging its orb,
   **including the canonicalisation behaviour the owner needs to see and accept** (see open
   question 2).
10. Layout at **240 px** with five extra number boxes in the rotation group. The `Orthographic`
    story now carries deliberately wide values (rotation ≈ −45/135/30, light ≈ azimuth −120 /
    elevation 35) so it is reviewed at its **worst case** — but Storybook was only *built*, never
    *opened*.
11. Touch: the fields are usable on iPad and the rail does not scroll while typing. ⚠️ These boxes
    reuse `pose-panel__slider-row`, so they **inherit the carried `touch-action` defect task 08
    owns.**

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

### W6 — 8 owed, **0 performed**

⚠️ **The per-task list task 08 owed was never transcribed into this file.** It is recorded
here for completeness and then superseded by §9 below.

1. ⚠️ **Highest value: save a preset, reload the app, select it — the view is restored.**
2. A project saved **before** this change still opens, with no presets and no error.
3. Saving a preset then opening a **different** project does not carry presets across.
4. Deleting a preset removes it and it stays gone after a reload.
5. The advanced camera panel and the Euler fields are mounted and actually drive the view.
   ⚠️ **The advanced half of this was the D08-16 gap and is closed by task 09** — it is now a
   real check rather than a known-failing one.
6. ⚠️ **iPad: dragging a slider no longer scrolls the rail** (the `touch-action` fix —
   confirmed defect, now fixed but **unverified**).
7. Layout at 240 px with the preset list added.
8. ⚠️ The saved preset restores `scale` but **not** `pan` (open question 4). Save at a pan,
   move the model, restore — the model returns to the saved size at the *current* pan.

### W7 — 4 owed, **0 performed** (task 09's own work, closing D08-16)

1. ⚠️⚠️ **Type an exact `near` / `far` / ortho box / `aspect` in the advanced panel and the
   view CHANGES to exactly that.** This is the whole of owner item 8's second half and it did
   nothing at all before this task.
2. ⚠️ **A typed value SURVIVES a re-fit**: type a `near`, then press **Fit to canvas**, resize
   the canvas, press a camera preset, and flip the projection — it must still be your number,
   not the derived one. The unit tests pin the arithmetic; only the app proves the wiring.
3. **"Reset to fitted" returns every field to the derived value.** It did not render at all
   before this task.
4. The advanced panel's boxes **read back** the number the camera is using after a re-fit —
   a typed value must not look like it was ignored the moment the box lost focus.

## 9. ⚠️ THE ONE CONSOLIDATED CHECKLIST FOR THE OWNER (task 09)

> ⚠️ **ALL THE PER-WAVE LISTS ABOVE ARE SUPERSEDED BY THIS SECTION.** They are kept for
> provenance only. **This is the list to take to the keyboard.**

### ⚠️ READ THIS FIRST — a green gate proves the arithmetic, NOT the picture

**`bun run verify` exits 0. That is not the same as "it works."**

**This plan is unusually visual. SIX of the eleven owner items can only be confirmed by
looking** — the pulsing (4), the pan clipping (3), part centring (2/7), scale-about-origin
(6), viewpoint semantics (11) and preset restore (10). A unit test can prove the fit is
rotation-invariant to seventeen significant digits; it cannot prove the model stops breathing
on screen. **No agent in plans 06, 07 or 08 has had a browser, a GPU or a device.**

**Score: 0 of 60 observed.** Roughly a dozen had their *structural* claim independently
re-derived from source or from the built bundle. **That is evidence about the code, not about
the picture, and the distinction must not be blurred.**

**How this list was built.** Plan 07 §7.7's **41** carried checks were merged with plan 08's
**53** owed (W1 12 · W2 7 · W3 6 · W4 9 · W5 11 · W6 8) and task 09's own **4** — **98 raw**,
de-duplicated to **60**. **38 were dropped as genuine duplicates or as subsumed**, and the
overlaps are named where they merge so nothing looks quietly deleted:

- **Smooth shading** appeared in plan 07 #9/#15 and plan 08 W1-4 — one check (**T1-3**).
- **The WebGL context leak** appeared in both plans — one check (**T1-11**).
- **GPU depth-derived heights** appeared in plan 07 #8 and plan 08 W1-12 — one check (**T1-10**).
- **iPad slider drag** was plan 07 #6 (the confirmed defect) and plan 08 W5-5, W5-11, W6-6
  (the fix and its new consumers) — one check (**T1-12**).
- **Part loading / centring** was plan 07 #12, #13, #14 and plan 08 W1-1, W1-2, W2-7 — folded
  into **T1-4** and **T2-5**.
- **The 240 px rail layout** was plan 07 #22 and plan 08 W5-4, W5-10, W6-7 — one check (**T2-13**),
  because they are one rail reviewed once.
- **Fit to canvas** was plan 07 #3/#4 and plan 08 W2-4, W2-6 — folded into **T1-7**.
- **Pan off-canvas** was plan 07 #2 and plan 08 W3-1 — one check (**T1-2**); plan 08's is the
  stronger statement (it must not *clip*, not merely travel).
- **Scale past the old cap** was plan 07 #1 and plan 08 W2-3 — one check (**T1-6**).
- **Stamp = one undo entry** was plan 07 #19 and plan 08 W1-7 — one check (**T2-3**), with the
  outline half **inverted** by F1 (plan 07 said the outline is *absent*; it is now present).
- **Variant-edit stamping** was plan 07 #11 and plan 08 W1-10, W3-5 — one check (**T1-9**).

### 🔴 Tier 1 — start here. Eleven items, most-likely-broken first.

| # | Check | Why it leads |
| --- | --- | --- |
| **T1-1** | ⚠️⚠️ **Rotate the orb through a FULL circle. The model does NOT pulse** — its apparent size is constant at every angle. | ⭐ **OWNER ITEM 4, THE HEADLINE, AND THE FIX IS ARITHMETIC THAT HAS NEVER BEEN RENDERED.** The fit no longer takes `rotation` at all, and a 24-step × 3-axis × 2-bounds × 2-projection sweep proves the *camera params* are byte-identical through a revolution. That proves the camera is still; it does not prove the model looks still. If one thing in this plan is broken, it is most likely here. |
| **T1-2** | ⚠️⚠️ **Pan the model toward a border and past it. It must NOT clip** — it slides smoothly out of frame and may leave entirely, then drags back. | **OWNER ITEM 3.** The old code blitted the whole render target at a canvas offset, which is *why* it clipped; pan is now a camera+target translation and `putImageData` is back at a fixed origin. `viewToWorld` was verified against three 0.185.1 itself to **1.7e-16** — unusually strong evidence about the *maths* and none at all about the *render*. |
| **T1-3** | ⚠️ **Smooth shading survives.** Sphere, cylinder **and** the mannequin parts show a smooth gradient — **not** a ring of flat facets — with no banding as the light orb sweeps. Silhouettes read round at 32×32. | **THE D08-2 TRIPWIRE, VISUALLY.** Task 01 refused `BufferGeometry.translate()` because it re-normalises **every** normal in the buffer (measured drift on the real torso: `0.4748470187187195` → `0.4748469889163971`). A byte-identity test pins it. **Only a GPU render proves the result**, and this is the second time flat shading has nearly returned. *(Merged: 07 #9, 07 #15, 08 W1-4.)* |
| **T1-4** | ⚠️ **Select Head. It is centred in the frame, and rotating it spins it ABOUT ITSELF**, not about a point off-screen. Then the same for a primitive. | **OWNER ITEMS 2 and 7.** The old `normalizeToUnitBox` moved the *object transform*, leaving the geometry origin at the mannequin's pelvis. Task 01 translates **vertices**. If a part still swings around an invisible pivot, F2 did not take. *(Merged: 08 W1-1, W1-2, W2-7; 07 #12, #14.)* |
| **T1-5** | ⚠️⚠️ **Press Left. The model TURNS TO FACE LEFT**, so you see its **RIGHT** flank. Press **Right**: the mirror. Then **Top/Bottom/Front/Back** as the control group. | ⚠️ **F9, AND NO TEST CAN EVER CLOSE THIS.** Left/right is *uniquely* resistant to unit testing: the maths is self-consistent under **both** conventions, so a test can only assert the convention it was written against. This table has been inverted **twice**. If it feels backwards, **F9 itself needs re-deciding — do NOT flip the signs and do NOT touch `applyEulerXYZ`.** Read D08-11 first. If left/right look right but top/bottom now look *wrong*, the maths *did* change and D08-11's evidence needs re-reading. |
| **T1-6** | ⚠️ **F5-COST: is the new framing acceptable?** The model now fills **~0.52** of the shorter axis where the old fit hit **0.9 at rest**. Also scale far past the old cap (250, 1e4): nothing clamps it and the model does not vanish through a clip plane. | ⚠️ **THE CHECK MOST LIKELY TO SEND WORK BACK.** F5's cure is the bounding **sphere**, whose projected radius is rotation-invariant *by construction* — but a box inside its own sphere reads at `1/√3 ≈ 0.577`. The old 0.9 oscillated to 0.64 at 45° yaw; **that oscillation was the bug.** The picture is worse-framed but stable. If it reads too small the lever is **the padding constant in `CanvasContainer`** — ⚠️ **NEVER a return to a rotation-dependent fit.** `POSE_DEPTH_ALLOWANCE = 64` radii is reasoned, never observed. *(Merged: 07 #1, 08 W2-3, W2-5.)* |
| **T1-7** | **Fit to canvas** re-frames at the current rotation, **does not reset pan**, and pressing it twice is two distinct events. Initial load still auto-fits. Resizing the object re-fits. | ⚠️ **D08-6 IS THE SUBTLE PART: a fit DOES reset the owner's `scale` to 1** (deliberate — without it a fit would be invisible at any other scale), while pan survives. The `> 0` guard on the effect is load-bearing: without it a reload would silently reset a scale the owner had set. *(Merged: 07 #3, 07 #4, 08 W2-4, W2-6.)* |
| **T1-8** | ⚠️ **Stamp with an outline over EXISTING artwork, then open the lighting studio: the underlying normals and heights are UNTOUCHED.** An outline pixel on empty canvas has colour but no lighting response. | ⚠️ **THE F1 ASSERTION, AND IT INVERTS PLAN 07's E7** — which said the outline is *not* stamped. `PixelCellWrite`'s `0` sentinels mean *empty*, not *unchanged*, so task 02 had to route the existing normal/height back through a new `readExistingCell` callback (D08-1). An outline over art that flattens its lighting is the failure mode. |
| **T1-9** | ⚠️ **In VARIANT-EDIT mode: pan, then stamp. Do the pixels land exactly under the model?** With an outline, and at a non-zero pan. | ⚠️ **THE ONE UNIT-UNTESTED SEAM IN THE PLAN.** D08-1: the container's `readExistingCell` **duplicates `editableGrid`'s variant resolution inline**, because the real one is declared later in the render body. That duplication has no test. The overlay also spans the expanded view while the stamp targets the smaller variant grid, so the model stamps **cropped** — correct, but surprising. *(Merged: 07 #11, 08 W1-10, W1-11, W3-5.)* |
| **T1-10** | ⚠️ **Stamp, then open the lighting studio. Are the heights sensible — not uniform, not inverted?** | **THE DEPTH-DERIVED HEIGHTS HAVE NEVER RUN ON A GPU, ACROSS THREE PLANS.** They were reasoned from three's `depth.glsl.js` source. Task 02 added a second buffer copy alongside that readback path without restructuring it. If heights come back uniform or inverted, the depth pass is the first place to look. *(Merged: 07 #8, 08 W1-12.)* |
| **T1-11** | ⚠️ **WebGL context leak.** Select Pose, then switch tools ~20× and change meshes ~20×. Watch for `Too many active WebGL contexts`. | **STILL NEVER TESTED, ACROSS THREE PLANS.** Browsers cap contexts at ~16; exhausting them crashes the tab. Argued safe (one context per mount, disposed on unmount) but never observed. Plan 07 added mesh *parts*, so there are now more switches to make. Do this in **StrictMode dev** and confirm exactly one renderer and one overlay. |
| **T1-12** | ⚠️ **iPad: drag the sliders with a finger — the rail must NOT scroll.** Scale, edge thickness, **and** the five new numeric fields. Finger-drag on the canvas pans the model; double-tap stamps; a pinch still zooms the view rather than dragging the model. | ⚠️ **A CONFIRMED DEFECT, FIXED BUT DELIBERATELY UNTESTED.** `.pose-panel__slider` had no `touch-action: none` while `.direction-orb__sphere` did, under a comment calling it "THE TOUCH FIX, not a nicety". Task 08 added the line. **No test in this repo can observe a browser choosing to scroll — jsdom has no compositor**, and a test asserting the class name would assert only that a string was typed, which reads like coverage and is worse than nothing. The owner's primary device. *(Merged: 07 #6, 07 #7, 07 #32, 08 W3-6, W5-5, W5-11, W6-6.)* |

### 🟠 Tier 2 — the new features. Do they actually work?

| # | Check |
| --- | --- |
| **T2-1** | ⚠️ **Save a scene preset, RELOAD THE APP, select it — the view is restored.** The only persistence path in the plan, and the only check that exercises the wire format end to end. Then: a project saved **before** this change still opens with no presets and no error; presets do **not** carry across into a different project; a deleted preset stays gone after a reload. |
| **T2-2** | ⚠️⚠️ **Type an exact `near`, `far`, ortho box or `aspect` in the advanced panel — the view changes to EXACTLY that.** Then confirm it **survives a re-fit**: press Fit to canvas, resize the canvas, press a camera preset, flip the projection — your number must still be there. Then **"Reset to fitted"** returns every field to the derived value. ⚠️ **Nothing but `fov` worked here before task 09 (D08-16), and "Reset to fitted" did not render at all.** |
| **T2-3** | **Stamp is still ONE undo entry** — one Ctrl-Z removes model **and** outline together. ⚠️ **The outline is now PRESENT in the stamp** (F1), inverting plan 07's E7. Edge width 0 produces exactly what it did before; widths 1–4 write a crisp outline in the **Edge** colour, landing where the overlay drew it. |
| **T2-4** | ⚠️ **Press Isometric: projection, camera angle AND model rotation all change in one go.** Pressing the same preset twice does nothing the second time. **Oblique then 3/4** changes the camera but leaves the model's orientation. `three-quarter` still shows the **same shoulder** as before plan 08 (deliberately left alone — see D08-11). |
| **T2-5** | **Each part button — Head / Torso / Arm / Leg / Hand / Full — loads that piece ALONE**, centred and auto-fitted, and none is empty. ⚠️ **The mesh is a T-POSE, so "arm" is a horizontal bar reaching BOTH ways** (E1). The full mannequin still loads and frames as it did — ⚠️ **raised in importance**: open question 3 changed that path, so it is no longer a mere no-regression check. |
| **T2-6** | ⚠️ **Pressing a preset OVERWRITES a rotation you set with the orb**, and does **NOT** reset Scale or Pan. Scale up, pan off-centre, press Isometric: the angle changes, the size and position do not. **Both halves are deliberate (F7 + open question 1) and both will feel wrong the first time.** Confirm the owner still wants them. The counter-argument is recorded above; the change is two lines if not. |
| **T2-7** | **Typing `45` into the model's Y rotation does exactly what dragging the orb to 45° does.** Dragging either orb updates its numeric fields **live**, and typing moves the orb. ⚠️ **Typing a negative or partial value (`-`, `.`) does NOT snap the model to 0 mid-keystroke** — pinned by synthetic `change` events at two levels, but real browser keystroke sequences are not the same thing. |
| **T2-8** | ⚠️ **The light's Azimuth/Elevation fields move the light as expected, and read back its actual direction after dragging its orb** — *including the canonicalisation*: `elevation 100` redisplays as `80` with azimuth flipped 180° (physically identical), and `azimuth 370` comes back as `10`. ⚠️ **The model's rotation is deliberately asymmetric — `370` stays `370` there.** This is where the owner accepts or rejects the F11 decision (open question 2). |
| **T2-9** | ⚠️ **Scale grows the model about its own centre while the camera visibly does NOT move.** A part and a primitive both scale about their own centres. **Owner item 6**, and the visible proof that `scaleCameraParams` was deleted rather than renamed. |
| **T2-10** | **The image stays pixel-aligned while panning** — no shimmer, no half-texel crawl — dragging feels **1:1** and is not inverted, and **panning does not change the model's apparent size.** Pinned hard in NDC (distance preserved to 1e-10, no frustum dimension changes), but perspective near-field parallax is real and only an eye judges whether it *reads* wrong. |
| **T2-11** | **An invalid `near`/`far` combination is visibly rejected and does not corrupt the view.** The red border and reason line are asserted in the DOM; whether they *read* as rejection is perceptual. |
| **T2-12** | ⚠️ **Every preset now writes FOV too, including the four orthographic ones** (which ignore it while selected). Press **2D**, then switch to **Perspective**: FOV should read **50**, not whatever it was. The least obvious consequence of "a preset sets everything". |
| **T2-13** | ⚠️ **Rail layout at 240 px** with everything at once: the Colours group, the tint row, the Scale box, the thickness slider, **five** Euler boxes, **six** advanced numeric boxes and the preset list. *(Reviewable in Storybook — the decorator mounts at exactly 240 px, and the `Orthographic` story carries deliberately wide worst-case values. **Storybook has only ever been BUILT, never opened.**)* *(Merged: 07 #22, 08 W5-4, W5-10, W6-7.)* |
| **T2-14** | **The outline is HARD-EDGED at 1–4 px** — crisp, no soft fringing, no partial alpha — and hugs the silhouette exactly. **0 removes it entirely.** |
| **T2-15** | **Model colour follows Fill, outline colour follows Edge**, live, with no native OS swatch anywhere. Clicking each swatch switches the main picker to the matching tab. The **light-tint preset row** (Neutral/Warm/Cool/Amber/Moon) visibly changes the key light. |
| **T2-16** | **Resize the object** — the render target follows and the model re-fits. **Pan survives a resize and resets on a mesh change.** |
| **T2-17** | **Time a full-canvas stamp on the largest object you have.** ⚠️ **Never measured**, across three plans, and the parts raised the triangle counts. |

### 🟡 Tier 3 — the rest of the rail, and the older pose behaviours

| # | Check |
| --- | --- |
| **T3-1** | The model renders with **hard, blocky, aliased edges** — no smooth silhouette, no downscale banding. **This is the feature; if it looks smooth, it failed.** |
| **T3-2** | Crisp and grid-aligned at **every canvas zoom level**. On 32×32 genuinely chunky; on 256×224 still **1:1** without stretching. |
| **T3-3** | Non-square grids fit the limiting axis without clipping; a **45°-rotated** model does not clip at the frame edges. |
| **T3-4** | Mouse: drag pans, does **not** rotate, does **not** draw. Double-click stamps. With a selection active the stamp is **masked** to it. |
| **T3-5** | **Drag both orbs with a mouse**, including moving the cursor off the orb mid-drag (the `setPointerCapture` contract). |
| **T3-6** | Each viewpoint button snaps the model **and** visibly moves the rotation orb's handle. |
| **T3-7** | Perspective ↔ Orthographic toggles visibly; FOV affects perspective only and is disabled in orthographic. **Iso reads as true isometric.** ⚠️ **See F8 below: a preset overrides the toggle, by the owner's own decision.** |
| **T3-8** | Selecting Pose swaps the rail to the Pose section; Pencil/Eraser swap it back. **Clear pose** unloads the mesh (the only way to). Switching projects clears the pose. |
| **T3-9** | Cube / Sphere / Cylinder each load and appear pixelated. *("Mannequin" is now the Mannequin row's **Full** button.)* |

### 🟢 Tier 4 — regressions: nothing else may have changed

| # | Check |
| --- | --- |
| **T4-1** | **No visual change anywhere in the pixel studio while Pose is NOT selected.** The overlay is always mounted; any difference means the canvas stack was disturbed. |
| **T4-2** | **Drawing performance on a large sprite is unchanged while pose is not selected.** |
| **T4-3** | Pencil, eraser, both fills, line, rectangle, ellipse, move, selection, eyedropper and origin all behave as before. **Reflection still mirrors and its guides still draw.** Marching ants, origin cross and reflection guides still render **above** the artwork. |
| **T4-4** | Lighting studio opens and its normal/height tools work; onion skin / frame trace / reference overlays still layer correctly; undo/redo across a mixed session is normal and autosave fires. |
| **T4-5** | Split canvas still works and correctly does **NOT** get the pose overlay; export output is still correct. |

### The eleven owner items → the checks that verify them

⚠️ **Six of these eleven can only be confirmed by looking.** Marked 👁.

| # | The owner's words (abbreviated) | Verifying checks |
| --- | --- | --- |
| **1** | Stamping should include the outline | **T1-8** (the F1 assertion: normals/heights untouched), **T2-3** (one undo entry, outline present), **T2-14** (hard-edged 1–4 px) |
| **2** | 👁 Part pieces should have their geometry centred on the canvas | **T1-4** (centred, rotates about itself), **T2-5** (each part loads alone) |
| **3** | 👁 Panning should be a parallel translation to the camera; no clipping | **T1-2** (does not clip — the deciding check), **T2-10** (pixel-aligned, 1:1, no size change), **T1-9** (stamp lands under the model at a pan) |
| **4** | 👁 The model pulses in size when rotated with the orb | **T1-1** (no pulsing through a full orbit — **the headline**) |
| **5** | Camera presets should change ALL the other camera settings | **T2-4** (projection + angle + rotation in one press), **T2-12** (FOV too), **T2-6** (…but not scale/pan — confirm), **T3-7** (the D14/F8 override) |
| **6** | 👁 Zoom → scale; camera holds still, model scales from its origin | **T2-9** (grows about its centre, camera still), **T1-6** (past the old cap, nothing clamps) |
| **7** | 👁 ALL models have their origin at the bounding-volume centre | **T1-4** (parts **and** primitives), **T2-5** (the full mannequin too — open question 3), **T1-3** (that centring did not damage the normals) |
| **8** | Advanced mode: EXACT projection values, saved into a preset | **T2-2** (all six fields reach the camera and survive a re-fit — **closed by task 09**), **T2-11** (invalid near/far rejected), **T2-1** (saving it as a preset) |
| **9** | Exact euler angles for rotation and the light | **T2-7** (rotation: typing = dragging), **T2-8** (the light's two fields and their canonicalisation — the F11 decision) |
| **10** | 👁 Save ALL orientations to a preset I can reload | **T2-1** (save → **reload the app** → restore; the only persistence path) |
| **11** | 👁 Rotation presets indicative: left means face left | **T1-5** (**the deciding check — no test can close it**) |

### ⚠️ The four most likely to send work back

1. **T1-6 / F5-COST** — the fit now fills **~0.52** of the frame where the old one hit **0.9 at
   rest**. It is stable instead of pulsing, which is the trade F5 asked for, but **no owner has
   seen it rendered.** The lever is the padding constant; **never a rotation-dependent fit.**
2. **T1-5 / F9** — left/right. **No test can ever close this**: the maths is self-consistent
   under both conventions, so a test asserts only the convention it was written against. This
   table has been inverted twice. If it feels wrong, **re-decide F9 — do not flip signs.**
3. **T2-8 / F11** — the light's angle canonicalisation. `elevation 100` comes back as `80` with
   the azimuth flipped, and the model's rotation is deliberately **asymmetric** (`370` stays
   `370` there). Nothing is lost, but it will read as the field "changing my number."
4. **T1-12 / the iPad `touch-action` fix** — a confirmed defect, fixed, and **deliberately
   untested**: jsdom has no compositor, so nothing here can observe a browser deciding to
   scroll. The owner's primary device.

## 10. Task 09's gate results (2026-09-04)

**`bun run verify` (root) — EXIT 0.** Real output:

```
$ bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build
$ bun run --cwd client typecheck && bun run --cwd server typecheck
$ tsc --noEmit
$ tsc --noEmit
$ bun run --cwd client lint && bun run --cwd server lint
$ eslint .
✖ 65 problems (0 errors, 65 warnings)
$ eslint .
$ bunx prettier --check "*.{json,md,yaml,yml}" "client/*.{ts,js,json}" "server/*.{ts,js,json}" "client/src/types/**/*.{ts,tsx}"
All matched files use Prettier code style!
$ bun run --cwd client test
$ vitest run
 Test Files  148 passed (148)
      Tests  3137 passed (3137)
$ cd client && bun run build
$ tsc --noEmit && vite build
dist/index.html                         0.76 kB │ gzip:   0.42 kB
dist/assets/index-CQ-0uNNp.css        220.84 kB │ gzip:  27.91 kB
dist/assets/GLTFLoader--NCVAYW2.js     45.56 kB │ gzip:  13.70 kB
dist/assets/three.module-PDSP0dbZ.js  734.33 kB │ gzip: 189.46 kB
dist/assets/index-Bry3rJMT.js         810.17 kB │ gzip: 236.22 kB
✓ built in 2.12s
```

**No formatting fix was needed.** The root prettier glob covers only `*.{json,md,yaml,yml}`,
`client/*`, `server/*` and `client/src/types/**` — every file task 09 touched is **outside** it,
and the glob was **not widened**.

| Command (from `client/`) | Result |
| --- | --- |
| `bunx eslint .` | **0 errors**, 65 warnings — exactly the baseline |
| `bunx vitest run` | **148 files / 3137 tests pass** (W6 was 3102; task 09 adds **+35**) |
| `bun run lint:boundaries` | **OK — all 5 boundary rules hold** |
| `bunx stylelint "src/**/*.css"` | 70 problems, **exactly 2 errors** — `OtherHand.css:338`, `:359`, both pre-existing |
| `bunx storybook build` | **exit 0** |
| lockfile sweep | **empty** after every `bunx` |

### ⚠️ DATA SAFETY — the headline result

```
$ git status --short -- '*__snapshots__*'
                                     ← EMPTY
$ shasum -a 256 client/src/types/__tests__/__snapshots__/migrations.test.ts.snap
e448764af560ed1411164e3d5ee782b0c333d4737cd32848fb5fe120d170a307
$ git diff --stat -- client/src/types/__tests__/__snapshots__/
                                     ← EMPTY
$ git diff --stat -- server/
                                     ← EMPTY
```

**NO CORPUS SNAPSHOT MOVED.** The digest is byte-for-byte the coordinator's pre-dispatch
baseline. Task 08 changed the persisted wire format and all 151 corpus digests rebuilt
identical; task 09 added a store field and did not touch the wire format at all. `vitest -u`
was never run.

**The conditional key is proven.** `persistedUIState.test.ts` → *"posePresets — absent stays
absent (plan 08, F13)"* (`:739`): a store with **no** presets builds a state where
`"posePresets" in ui.toPersistedUIState()` is **false** (`:754`, `:768`, `:774`, `:777`, `:780`),
and one **with** a preset emits it (`:792-795`) and round-trips it (`:806-808`).

⚠️ **`UIStore.ts`'s diff is NOT one line, and this corrects the task spec's expectation.**
The **emission** is exactly one conditional `assign()` — `UIStore.ts:581`,
`assign(persisted, "posePresets", this.toPersistedPosePresets())` — and it is **never**
`posePresets: undefined`, which is the F13 mechanism and the thing that matters. But task 08
also had to make the pose store **reachable** from `UIStore` (a `poseUI` dependency, an
`ownPosePresets` fallback for the harness suites, a private `toPersistedPosePresets()` and a
`hydrate` branch) — ~18 further lines. **Coordinator-reviewed and gate-clean**; recorded here
because the spec predicted one line and a reader comparing them should not think a check failed.
**Task 09 did not touch `UIStore.ts` at all.**

### Bundle

| Chunk | Plan start | Now | Δ |
| --- | --- | --- | --- |
| main | 793.89 kB / 231.22 gz | **810.17 kB / 236.22 gz** | **+16.28 kB / +5.00 gz** |
| `three.module` (lazy) | 734.33 / 189.46 gz | **734.33 / 189.46 gz** | **0 — byte-identical** |
| `GLTFLoader` (lazy) | 45.56 / 13.70 gz | **45.56 / 13.70 gz** | **0** |
| CSS | — | 220.84 / 27.91 gz | — |

**+16.28 kB (+2.1%) for eight tasks of new UI and store logic** — the advanced camera panel,
the Euler inputs, `PoseCameraGroup`, `PosePresetList`, the preset store surface and the wire
types. Expected and proportionate.

⚠️ **`three` is still NOT in the main bundle, and here is the POSITIVE CONTROL** — the grep
found the symbols where they *should* be, so a zero in main means absence and not a broken grep:

| Symbol | main | `three.module` |
| --- | --- | --- |
| `BufferGeometry` | **1** (a `new n.BufferGeometry` namespace access) | **26** |
| `WebGLRenderer` | **1** (same) | **39** |
| `PerspectiveCamera` | **4** (`poseEngine`'s structural type + the container's `new three.PerspectiveCamera()`) | **7** |

**1 and 26 is exactly plan 07's measured baseline.** `three.module` is byte-identical to the
plan-start measurement, which is the strongest possible statement that nothing leaked either way.

### Dead code

- **`scaleCameraParams` is GONE.** `grep -rn "scaleCameraParams" client/src` returns **3 hits,
  all prose** saying it was deleted (`poseCamera.ts:246`, `CanvasContainer.tsx:365`, `:2893`).
  No declaration, no call site. **F6 held.**
- **No stale pose `zoom`.** Every `setZoom`/`POSE_ZOOM` hit is either the **viewport** store's
  own unrelated `zoom` (correct) or deliberate historical prose explaining the F6 rename.
- ⚠️ **Two stale comments remain**, plan 07's finding A: `poseEngine.ts:266` *"Placeholder only —
  task 06 replaces the framing entirely"* and `:413` *"task 06 owns the real ones"*. **Task 06
  landed; only the tense is wrong.** **NOT fixed** — `poseEngine.ts` is in no task's Touches and
  a gate task does not patch application files. A future editor should rewrite them.

### `bun run dev`

⚠️ **PARTLY OBSERVED, and the distinction is stated rather than blurred.**

**All three ports were already held by the owner's own live session** (vite 5173 pid 23322 up
since Sep 3, express 3001 pid 23321, uvicorn 8100 pid 23345). **Nothing of the owner's was
killed or touched**, so a clean `bun run dev` from a cold start was **not** performed.

What **was** observed, and it is stronger than a port check:

- All three answer live HTTP: vite `200`, express `/api/projects` `200`, uvicorn `/health`
  `{"status":"ok","mode":"proxy",...}`.
- ⚠️ **The owner's running vite server transforms and serves THIS branch's code.** Requesting
  `src/stores/ui/PoseUIStore.ts` returns a module containing **6 occurrences of
  `cameraOverrides`** — a symbol that did not exist before this task. Every module task 09
  touched — `CanvasContainer.tsx`, `PixelStudioPanelContainer.tsx`, `poseCamera.ts`,
  `PoseCameraGroup.tsx`, and the **newly created** `poseCameraPresets.ts`, which that server had
  never seen — returns `200` with no transform error.

**Conclusion, honestly labelled:** the dev *client* compiling and serving this branch is
**observed**. The **mprocs wrapper** starting all three from cold is **inferred** — no entry
point, config, `mprocs.yaml` or build input was touched, and typecheck, lint, the boundary scan,
the full suite and the production build all pass.

## 11. Open questions and decisions the owner should read

1. ⚠️ **F8 — F7 SUPERSEDES plan 06's D14, and D14 was subsumed rather than dropped.** D14
   (*"a camera preset overrides the projection"*) was **deliberately kept** by owner decision on
   2026-09-03, *before* F7 existed. F7 then widened it: a preset now owns projection, pitch, yaw,
   fov, the clip policy, the fit **and** the model's rotation. **D14's guarantee still holds
   and is still observable** (Isometric still forces orthographic regardless of the toggle); it
   has simply stopped being the whole rule. **If they ever appear to conflict, F7 wins.**
   Surfaces at **T3-7**.
2. **Open question 1 (task 05): a camera preset does NOT reset scale or pan.** A preset restores
   which way the scene is *pointing*; scale and pan are where the owner *put* it. ⚠️ **The
   counter-argument is real and recorded**: two presses of Isometric from different framings give
   two different pictures, in tension with F7's "fully known state". Mitigation: **Fit to canvas**
   is one press away. Two lines to change. Surfaces at **T2-6**.
3. **Open question 2 (task 07, F11): the light has TWO fields — Azimuth and Elevation — derived
   from the vector every time, with no stored second copy.** The deciding argument was **not**
   the store constraint: storing typed angles would ship **a roll box that does nothing**. The
   price is canonicalisation (`elevation 100` → `80` with azimuth flipped; `azimuth 370` → `10`),
   and the model's rotation is deliberately **asymmetric** (`370` stays `370`, because those
   numbers *are* the stored state). Surfaces at **T2-8**.
4. **Open question 3 (task 01): the full mannequin scene IS centred too, not just the parts.**
   Baking node transforms proved unnecessary — one world offset converted into each node's local
   frame. A test pins that the two nodes' relative offset is preserved, guarding the obvious
   wrong implementation (`centerGeometryOnOrigin` inside a `traverse`), which would explode the
   figure. Surfaces at **T2-5**.
5. **Open question 4 (task 08): a saved scene preset carries `meshId`, `rotation`, `projection`,
   `cameraPreset`, `fov`, `scale`, `lightDirection`, `lightColor`, `edgeWidth` — and EXCLUDES
   `pan`.** ⚠️ `scale` is **in** even though a *camera* preset leaves it alone: a camera preset is
   a **verb**, a scene preset is a **noun**. `pan` is out for a harder reason — it is measured in
   **grid cells of whatever canvas was open**, so a pan saved on a 64×64 sprite lands elsewhere on
   a 32×32 one, and pan is unbounded (E13), so a restored preset could put the model off screen
   **with no visible cause.** One-field change if the owner disagrees. Surfaces at **W6-8**.
6. ⚠️ **D08-16 is CLOSED by task 09, and the design is worth one line of the owner's attention:**
   the fit still derives `near`/`far`/the ortho box/`aspect`, and the owner's typed values are
   applied **on top of the fit's output**. That ordering is what makes a typed value **survive**
   Fit to canvas, a resize, a preset press and a projection change. **"Reset to fitted" is the
   only way back.** ⚠️ The overrides are **session-only** — the persistence path for an exact
   frustum is a **saved scene preset**, which is what the owner asked for. Surfaces at **T2-2**.
7. **In variant-edit mode the overlay spans the expanded view while the stamp targets the smaller
   variant grid**, so the model stamps **cropped**. Correct per the plan, likely surprising in
   use. Surfaces at **T1-9**.
8. **The root `format:check` glob does not cover any file these three plans touched**
   (`client/src/ui/**`, `stores/**`, `containers/**` are all outside it). It passes, on a
   narrower set than "everything written". **Pre-existing configuration — flagged, not widened.**

## 12. Bugs and follow-ups — RECORDED, NOT FIXED

**No behavioural bug was found at the gate.** Task 09 changed application code only to close
D08-16, which was an assigned scope item and not a gate-time patch.

| # | Item | Severity | Notes |
| --- | --- | --- | --- |
| A | **Two stale comments in `poseEngine.ts` (`:266`, `:413`)** say task 06 "replaces" / "owns" as though pending. Task 06 landed. | Cosmetic | The **code is correct**; only the tense is wrong. Carried from plan 07. Outside any Touches list. |
| B | **Bundle inversion (plan 07 deviation 19).** `MANNEQUIN_PART_ORDER` lives in `poseMeshes.ts`, so importing it from the rail drags ~900 lines into main (the whole +5.33 kB of plan 07). Moving it to `poseTypes.ts` would invert it. | Low | **NOT DONE** — application code, needs owner sign-off. |
| C | **Dead state (plan 07 deviation 22).** `pose.modelColor`, its action and its `clear()` line are unread; the container uses `tool.fillColorOrSelected`. | Low | **NOT DONE.** Deleting an `observableRef` field is a store-shape change with its own risk. The store header already warns against wiring a new reader. |
| D | ⚠️ **`readExistingCell` duplicates `editableGrid`'s variant resolution inline** (D08-1), because the real one is declared later in the container's render body. **Unit-untested.** | Med | The most likely place for a variant-mode stamping bug. **T1-9** is the check. |

## Notes for the next session

(none yet)
