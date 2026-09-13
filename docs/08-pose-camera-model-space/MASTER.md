# MASTER — Pose camera, model space, and presets

Plan folder: `docs/08-pose-camera-model-space/`. Planned 2026-09-03. Executed by `/plan-go`.
Builds on `docs/07-pose-refinements/`, which is **code-complete and gate-green at `494b5b4`**
(branch `feat/07-pose-refinements`) with **41 manual checks still unperformed**.

## 1. Request

Verbatim, eleven items:

> - Stamping should definitely include the outline
> - The model break down pieces are in the mannequins mdoels space still. The head etc should
>   have their geometry centered on the canvas
> - Panning the pose is done wrong: right now it is moving the pose's canvas completely so if I
>   pan it down but the model goes above the top border, it looks clipped in the rendering. We
>   should be adjusting for the so the panning is just a parallel translation to the camera so
>   the canvas stays pixel aligned properly.
> - There is a rotation oddity as well: if I rotate the models with the Orb for rotation, the
>   model pulses in size like the camera is getting closer and further to the model as it goes
>   around.
> - The camera preset buttons: these should CHANGE all of the other settings that can be used
>   for the camera.
> - Zoom -> this should be scale. I want the camera to hold still and have the model scaled up
>   and down from it's origin.
> - Make sure all models loaded and utilized ALL have their origin set to the middle of the
>   bounding volume of the model
> - I want a camera advanced mode that lets me put EXACT values for the camer'a projection
>   matrix and then save that matrix into a preset I can select.
> - I want the light and rotation to also allow me to enter in the exact euler angles I want to
>   use for the rotation of the object.
> - I want a way to save ALL orientations of camera settings and model to a preset that I can
>   reload easily.
> - The rotation presets of the model should be indicative of what the model should do: left
>   means the model rotates to face the left, right means rotate to face the right, top means I
>   look at the top of the model, etc etc

**Interpretation.** Four are bug fixes with root causes already measured (items 2/7, 3, 4, 11).
Two are re-conceptions of existing controls (5, 6). Three are new UI surfaces (8, 9, 10). One is
a small behaviour change to the stamp (1). They are **not independent**: items 4 and 6 are the
same fix seen from two sides, and items 2/7 must land before either, because a model whose
geometry origin is wrong makes "scale from the origin" and "the fit is rotation-invariant" both
untestable. The plan therefore fixes **model space first, then the camera, then the UI**.

**The single conceptual change that unlocks most of this:** today the camera is re-derived from
the *rotated* model on every rotation step, so it moves constantly. After this plan the camera
is **placed once and held still**, and everything the owner manipulates — scale, pan, rotation —
is expressed as a transform of the model or as a fixed offset of the frustum. That is what makes
the pulsing stop, the pan stay pixel-aligned, and "scale from the origin" mean anything.

## 2. Outcome

When the plan is complete the owner can:

- **Stamp with the outline included** — the edge pixels are written in the Edge colour, with the
  normal and height channels of whatever was underneath left **untouched**.
- Click **Head** and get a head whose **geometry origin is its own centre**, so it rotates about
  itself and sits centred on the canvas.
- **Pan** the model and watch it translate *parallel to the camera plane*, staying pixel-aligned
  and never clipping against the render target's border.
- **Rotate with the orb and see no pulsing** — the model's apparent size is constant through a
  full revolution.
- Press a **camera preset** and have it set *every* camera property **and** the model's rotation
  — a full, known scene state.
- Use **Scale** (not "zoom"): the camera holds still and the model grows and shrinks about its
  own origin.
- Open an **advanced camera mode** and type exact projection values, then **save that as a named
  preset** and select it later.
- Type **exact Euler angles** for both the model's rotation and the light's direction.
- **Save the entire scene** — camera settings and model orientation — as a named preset that
  **survives a reload**, and reload it in one click.
- Press **Left** and watch the model *turn to face left* (so its right flank comes toward the
  viewer), matching the owner's stated mental model.
- `bun run verify` exits 0.

## 3. Locked decisions

Executors **must not re-decide these**. If one is genuinely wrong, record it in `HANDOFF.md`
under Deviations and say why.

| # | Decision | Value |
| --- | --- | --- |
| **F1** | Outline stamping | **Colour channel ONLY.** The normal and height of an outline pixel are **left exactly as they were** — not zeroed, not invented, not defaulted. Owner-decided 2026-09-03. An outline pixel over empty canvas therefore gets colour with no lighting data, which is correct: it has no surface. |
| **F2** | Part geometry origin | The part's **vertex positions are translated** so its own bounding-box centre is `(0,0,0)`. `normalizeToUnitBox`'s transform-writing is **not** sufficient (that is the bug). Applies to **every** mesh that reaches the engine (item 7), primitives included — assert it, do not assume it. |
| **F3** | Pan | A **camera-space translation**: the camera position and its target move **together** along the camera's right/up vectors (or an equivalent symmetric frustum offset). The render target stays exactly `cellWidth × cellHeight`, 1:1, and `putImageData` goes back to a **fixed** origin. |
| **F4** | Fit / framing | **The camera is placed ONCE and holds still.** `fit()` solves for the **model scale factor** that fills the frame; it does **not** move the camera. Owner-decided 2026-09-03. |
| **F5** | Rotation-invariant framing | The fit **must not** depend on the model's rotation. This is the direct fix for the pulsing (item 4) and falls out of F4: if the fit no longer re-runs per rotation, it cannot re-frame. Use a **rotation-independent** measure (see §8). |
| **F6** | `zoom` → `scale` | Renamed **and re-meant**: a multiplier on the **model's** transform about its own origin, not a frustum divisor. `scaleCameraParams` (CanvasContainer.tsx:403-432) is **deleted** — it is the old meaning. Keep a tiny positive floor as a safety guard, never an upper cap. |
| **F7** | Camera presets | Set **everything**: `projection`, `pitch`, `yaw`, `fov`, near/far policy, the fit, **and the model's `rotation`**. Owner-decided 2026-09-03. Pressing a preset puts the scene in a fully known state and **overwrites the viewpoint rotation**. ⚠️ This **supersedes D14** (see F8). |
| **F8** | D14 is superseded | Plan 06's D14 ("preset overrides projection") was kept by owner decision on 2026-09-03, *before* F7 existed. F7 subsumes it: a preset now owns projection **and** everything else. Record the supersession explicitly in `HANDOFF.md`; do not silently drop it. |
| **F9** | Viewpoint semantics | **`left` means the model turns to face left**, so the viewer sees its **RIGHT** flank. Owner-decided 2026-09-03. ⚠️ This **INVERTS** today's `left`/`right`. `top` still means "I look at the top of the model" (crown toward viewer) — that one is already correct. |
| **F10** | Euler entry | Numeric entry is in **DEGREES** in the UI, radians in the store. The store stays the single source of truth in radians; the component converts at its edge. |
| **F11** | Light Euler entry | The light stays a **unit vector** in the store (`setLightDirection` normalizes). The Euler UI converts angles → vector by applying `applyEulerXYZ` to a base axis. ⚠️ The inverse is **not unique** (roll is unconstrained), so the typed angles must be **stored alongside** if they are to round-trip in the UI. Task 07 decides and documents. |
| **F12** | Preset persistence | **Persisted to the project file**, following the **`layoutPresets` precedent exactly** (`LayoutUIStore.ts:500-570`). Owner-decided 2026-09-03, re-confirmed after the risk was re-measured. |
| **F13** | Conditional emission | The preset key is emitted **only when at least one preset exists** — `toPersistedPosePresets()` returns `undefined` otherwise, and it reaches the builder through **`assign()`**. ⚠️ **NEVER write `key: undefined`** — measured, that form changed all 11 corpus digests; the conditional form leaves every snapshot byte-identical. |
| **F14** | No migration | **None is needed.** Absent keys are handled by `?? default` on read. Do **not** add a migration, do **not** bump a version, do **not** edit `services/migrations/`. |
| **F15** | Preset shape | Wide field types on the wire (`id: string; name: string; …`), narrowed **once** on hydrate by a `narrowPosePresets()` validator — the `PersistedLayoutPreset` pattern (`domain.ts:327-331`). A file may carry a preset written by a newer build. |
| **F16** | Advanced camera mode | Exact **projection values** (the fields `PoseCameraParams` already carries: ortho `left/right/top/bottom`, or perspective `fov`/`aspect`, plus `near`/`far`), **not** a raw 16-float matrix. `applyCameraParams` writes camera *fields* and lets three build the matrix (`poseCamera.ts:476-497`); a hand-entered matrix would be overwritten by `updateProjectionMatrix()`. Task 06 must state this in the UI. |

## 4. Ground truth (measured 2026-09-03)

**Baseline.** Branch `feat/07-pose-refinements`, HEAD `494b5b4`, worktree **clean**,
`bun run verify` **exit 0**. Refresh state: **COMPLETE** (no `REFRESH/` dir). Everything this
plan touches is already MobX + BEM + `ui/`-pure.

**Gate, measured this session:**

| Command | Result |
| --- | --- |
| `bun run verify` (root) | **exit 0** — `typecheck && lint && format:check && test && build` |
| `bunx tsc --noEmit` (client) | exit 0 |
| `bunx eslint .` | **0 errors**, 65 warnings (the baseline) |
| `bunx vitest run` | **146 files / 2866 tests pass** |
| `bun run lint:boundaries` | OK — all 5 rules |
| `bunx stylelint "src/**/*.css"` | 70 problems: **2 errors** (`OtherHand.css:338`, `:359`) — pre-existing |
| `bunx storybook build` | exit 0 |
| lockfile sweep | empty — **and must stay empty** (`bunx` recreates it) |

Bundle: main **793.89 kB / 231.22 kB gz**; `three.module` **734.33 / 189.46 gz** (lazy);
`GLTFLoader` **45.56 / 13.70 gz** (lazy). `three` is **not** in the main bundle.

### 4.1 The camera (`client/src/ui/canvas/pose/poseCamera.ts`, 610 lines)

- **`fitCameraToMesh`** — signature at `:293`, body `:293-437`. `FitCameraParams` at `:240-264`;
  `PoseCameraParams` at `:223-238`: `{projection, position, target, near, far, orthographic?:
  {left,right,top,bottom}, perspective?: {fov, aspect}}`.
- ⚠️ **The pulsing, root cause (item 4).** `:331-344` loops the 8 box corners through
  `applyEulerXYZ(local, rotation)` (`:340`) then `worldToView(rotated, pitch, yaw)` (`:341`),
  taking `max |view.x|/|view.y|/|view.z|` (`:342-344`). **For a non-cubic model the projected
  extent genuinely changes as it rotates** (a box is wider across its diagonal than across its
  face), so the fit re-frames on every rotation step and the model breathes.
- `target` is **always the bounds centre** (`:396-400` places `position` = centre + orbit·dist).
  **There is currently no way to offset the target** — which is what a camera-space pan needs.
- `near` at `:411`, `far` derived from it `:412-415` so `far > near` by construction.
- **`applyCameraParams`** at `:476-497`: writes camera *fields* then `lookAt` (`:495`) and
  `updateProjectionMatrix()` (`:496`). It does **not** write a matrix directly (see F16).
  `PoseCameraLike` (`:453-468`) is structural, so this file imports nothing from three.
- **`POSE_VIEWPOINT_ROTATIONS`** at `:178-186`; `POSE_VIEWPOINT_ORDER` at `:189-197`.
  ⚠️ The header at `:150-177` documents the convention as "`left` shows the model's LEFT flank"
  and admits **the first draft had left/right/top/bottom all inverted**. The maths was
  re-verified this session and **is self-consistent with that convention** — so item 11 is a
  **semantic** change (F9), not a sign-bug fix. Do not "correct" the maths; change the meaning.
- `applyEulerXYZ` at `:521-560`, transcribed from three's `Matrix4.makeRotationFromEuler` XYZ
  branch so it matches `Object3D.rotation` exactly.

### 4.2 The container (`client/src/containers/CanvasContainer.tsx`, ~5,300 lines)

| Line | Role |
| --- | --- |
| `403-432` | **`scaleCameraParams`** — the current "zoom". Scales the ortho box or the perspective fov. **F6 deletes this.** |
| `735-737` | `poseRotation`, `poseLightDirection`, `poseLightColor` mirrored from the store |
| `2426` | `poseCameraRef` — **the container owns the camera**, not the engine |
| `2448` | `posePanRef` — the pointer-rate pan mirror |
| `2456-2576` | **`renderPose`**, the overlay painter. `useCanvasRender` at `2586-2588` |
| `2488` | `engine.render()` for the **overlay** |
| `2517-2518` | the **single** `applyOutline` call site, guarded by `poseEdgeWidth > 0` |
| `2562-2566` | ⚠️ **The pan bug (item 3).** `putImageData(image, round(pan.x)-ox, round(pan.y)-oy)` — the whole render target is blitted at a canvas-space offset, which is why it clips at the border. The comment at `2557-2561` explicitly justifies this ("a camera pan would re-fit and re-rasterise") — **that justification is what F3 reverses.** |
| `2754-2760` | rotation applied as a **mesh transform**, `root.rotation.set(...)` at `:2758` |
| `2763-2769` | `engine.setLight(...)` at `:2766` |
| `2782-2879` | the auto-fit effect. `fitCameraToMesh` at `:2832` (rotation passed at `:2837`), `applyCameraParams` at `:2866`, `engine.setCamera` at `:2867`. ⚠️ Deps **deliberately omit pan** (`2871-2879`) |
| `2899-2903` | effect syncing `posePanRef.current = pose.pan` for non-drag writes |
| `2925-2938` | `poseScreenToCellDelta` |
| `3046-3206` | the **stamp** callback. `engine.render()` at `:3060` (colour), `renderWithMaterial` `3068-3090` → normals `:3103`, depth `:3115`. `setPixelCells` at `:3205` |
| `3186-3198` | stamp reads pan, passes `offsetX/offsetY` into `buildStampCells` |
| `3232-3247` | `posePointerMove` — accumulates into `posePanRef.current`, then `app.pose.setPan(next)` |

**Every `pose.pan` consumer:** `2448`, `2562-2566`, `2901-2903`, `3186-3198`, `3241-3246`.

### 4.3 Meshes (`client/src/ui/canvas/pose/poseMeshes.ts`, 909 lines)

- ⚠️ **`normalizeToUnitBox`** at `:889-903` — **the item 2/7 root cause.** It writes
  `object.scale.multiplyScalar(scale)` and `object.position.sub(centre·scale)`: the **object
  transform**, *not* the geometry's vertices. A part therefore *looks* centred while its
  **geometry origin remains the mannequin's origin**, so it rotates about the mannequin's centre
  and anything reading vertex data sees model-space coordinates.
  ⚠️ It also writes `object.position`, so **a pan implemented via `object.position` would
  collide with it.** (F3 uses the camera, so this is avoided — but do not regress it.)
- **Only two call sites:** `:521` (the full mannequin scene, inside `loadMannequin`, guarded by
  the `normalize` flag) and `:694` (a single part, in `buildPartMesh`). `buildPartMesh` calls
  `loadMannequin(..., false)` at `:692`.
- **Primitives are never normalized** — `buildGeometry` (`:756-779`) uses literal unit-box
  constructor args (`BoxGeometry(1,1,1)`, `SphereGeometry(0.5,…)`, `CylinderGeometry(0.5,0.5,1,…)`);
  the comment at `:743-747` says "the constructor arguments ARE the normalisation".
  ⚠️ **Item 7 says *all* models — so this must be asserted, not assumed.**
- Everything reaching the engine is expected to be in `UNIT_BOUNDS` (`:72`), which is why the fit
  passes a constant `bounds: UNIT_BOUNDS` (`CanvasContainer.tsx:2833`).

### 4.4 The engine (`client/src/ui/canvas/pose/poseEngine.ts`, 525 lines)

`PoseEngine` at `:196`. `create()` `:279`, `resize()` `:305-344` (allocates the target at exactly
`w × h`, **no devicePixelRatio**), `setLight()` `:355-367`, `setObject3D()` `:393-400`,
**`setCamera()` `:419-422` — the engine does NOT own the camera** (`:414-418`), `getCamera()`
`:425`, **`render(): Uint8Array` `:441-456`** — reuses `this.readback`, so **callers must copy**
(the stamp does, at `:3060`/`:3083`); returns `flipRowsInPlace(...)` at `:455`. `dispose()` `:468+`.

### 4.5 The light

`lightDirection: PoseVector` at `PoseUIStore.ts:292` (`observableRef` `:344`), default at
`:141-143`, **normalized on write** by `setLightDirection` at `:417-419`. The engine uses it as a
**position** (`poseEngine.ts:355-367`): `keyLight.position.set(x,y,z)` with target at the origin.
**There is no Euler representation of the light anywhere today** (F11).

### 4.6 Persistence — ⚠️ read this before believing anything about corpus risk

**The corpus digests do NOT run `toPersistedUIState()`.** Measured this session:

```
migrations.test.ts:1009 →  perSnapshot.push(`${key}:${digest(compactToProject(data))}`);
grep -rn 'toPersistedUIState' client/src/types/__tests__/  →  no hits
```

The digest pipeline is `compactToProject(rawCorpusJSON)` — the legacy codec path only.
**Adding a conditionally-emitted key to the UI state cannot shift the 151 digests, and needs no
migration** (F14). Seven keys were added exactly this way: `railLayouts`, `theme`,
`layoutPresets`, `viewZoom`, `eyedropperMode`, `pencilOnly`, `hiddenRails`, plus `fillColor`.

- **`toPersistedUIState()`** — `client/src/stores/ui/UIStore.ts:349-557`. Hand-enumerated, no
  spread. 31 unconditional keys (`:377-417`); 21 conditional keys via **`assign()`**
  (`:432-555`), helper at `:656-664` (`if (value !== undefined)`).
- **Reader** — there is no `fromPersistedUIState`; it is `UIStore.hydrate(ui)` at `:566-575`,
  fanning out to `tool` / `viewport` / `layout` sub-stores. **A new key means editing the builder
  AND the owning sub-store's `hydrate`.**
- **Types** — `CompactUIState` at `client/src/types/codecs/compactTypes.ts:84-173` (**52 fields,
  unversioned**); runtime `UIState` in `client/src/types/domain.ts`.
- ⚠️ **The measured trap** (`serialize.ts:103-112`, restated at
  `persistedUIState.test.ts:263-266`): writing `key: undefined` in the legacy codec **does** add
  the key and **did change all 11 digests**. The conditional-spread form left every snapshot
  byte-identical. **F13 exists because of this.**
- ⚠️ **The test that WILL fail if you are careless** — not the digests, but
  `persistedUIState.test.ts:613-643` (`R3 — the builder against the real corpus`): it hydrates all
  151 snapshots and asserts the builder's **key set** exactly equals `projectToCompact()`'s. An
  **unconditional** new key fails there on all 151. A **conditional** one passes, because neither
  side emits it.
- ⚠️ **`persistedUIState.test.ts:267` asserts `expect(declared).toHaveLength(52)`**, reading
  `compactTypes.ts` from source at runtime. **Adding one field requires bumping this to 53** and
  adding the key to `fullyPopulatedProject()` (`:132-196`).

**The analogue to copy — `layoutPresets`:**

| Piece | Location |
| --- | --- |
| Wire type | `domain.ts:327-331` — `PersistedLayoutPreset {id, name, layout}` |
| Wire declaration | `compactTypes.ts:165` |
| Runtime declaration | `domain.ts:262` |
| Store field | `LayoutUIStore.ts:268` (`observableRef` `:285`) |
| Save | `saveCurrentAsPreset(name)` `:500-513` — trims, no-ops on empty, snapshots by value |
| Delete | `deleteLayoutPreset(id)` `:519-524` |
| Hydrate | `:534-542` — `narrowPresets(ui.layoutPresets)`, validator `:201-212`, assigned **unconditionally** so absent-stays-absent survives a project switch |
| **Serialize** | **`toPersistedLayoutPresets()` `:564-570` — returns `undefined` unless non-empty.** This is the F13 mechanism |
| Builder line | `UIStore.ts:518-521` |

### 4.7 Still-unverified ground

**All 41 consolidated manual checks from `docs/07-pose-refinements/HANDOFF.md` §7.7 remain
unperformed** — 0 of 41 observed. No agent in plans 06, 07 or this one has had a browser, a GPU
or a device. In particular the **depth-derived heights have never run on a GPU**, and they share
the readback path item 1 now adds a second outline pass to.

**A confirmed, unfixed iPad defect** (plan 07, finding B): `.pose-panel__slider` has **no
`touch-action: none`**, while `.direction-orb__sphere` (`PosePanel.css:257`) has it under a
comment calling it "THE TOUCH FIX, not a nicety". **This plan adds more sliders and numeric
inputs, so task 08 fixes it.**

## 5. Wave table

| Wave | Tasks | Parallel | Gate that must pass before the next wave |
| --- | --- | --- | --- |
| **W1** | 01 model-space origins · 02 outline in the stamp | 2 agents | From `client/`: `bunx tsc --noEmit` **0** · `bunx eslint .` **0 errors** · `bunx vitest run` **all pass** · `bun run lint:boundaries` **OK** · lockfile **empty** |
| **W2** | 03 camera holds still: fit→scale, no pulsing | 1 agent | same gate **+** `git diff -- client/src/stores/ui/UIStore.ts` **empty** |
| **W3** | 04 camera-space pan | 1 agent | same as W2 |
| **W4** | 05 presets set everything + viewpoint semantics | 1 agent | same as W2 |
| **W5** | 06 advanced camera mode · 07 exact Euler entry | 2 agents | same gate **+** `bunx stylelint` **exactly 2 errors** · `bunx storybook build` **0** |
| **W6** | 08 saved scene presets (persisted) + the iPad slider fix | 1 agent | ⚠️ **the persistence gate** — see below |
| **W7** | 09 full gate, QA, handoff | 1 agent | `bun run verify` **exit 0** at root; `bun run dev` starts all three processes |

⚠️ **W6's gate is stricter than the others** and must be read line by line:

```sh
bunx vitest run                                              # all pass — esp. persistedUIState.test.ts
git status --short -- '*__snapshots__*'                      # EMPTY — no digest moved
git diff -- client/src/types/__tests__/__snapshots__/         # EMPTY
```

**If any corpus snapshot changes, STOP.** That is real user data and a human must read the diff.
The fallback is F12's alternative — a standalone preset store leaving the project wire format
untouched — which does **not** require unwinding tasks 01-07.

## 6. Dependency graph

```
01 model-space origins ──┬──► 03 camera holds still ──► 04 camera-space pan ──┐
                         │         (fit → scale)                              │
02 outline in stamp ─────┘                                                    │
                                   03 ──► 05 presets set everything ──────────┤
                                                                              ├──► 09 gate/QA
                                   03,05 ──► 06 advanced camera mode ─────────┤
                                          ──► 07 exact Euler entry ───────────┤
                                   06,07 ──► 08 saved scene presets ──────────┘
```

- **01** is the foundation: F2 must hold before "scale about the origin" or "rotation-invariant
  fit" can even be tested.
- **02** is independent of everything (a stamp-path change) and shares W1 only to balance it.
- **03** ← 01. It is the heart of the plan (F4/F5/F6).
- **04** ← 03, because a camera-space pan needs a camera that holds still.
- **05** ← 03, because a preset that sets "everything" must know what the camera fields now mean.
- **06, 07** ← 03/05: they are numeric front-ends onto the settled camera and rotation model.
- **08** ← 06/07: it persists whatever those two settled on.
- **09** ← everything.

## 7. Collision matrix

**W1 — two tasks**

| Task | Touches |
| --- | --- |
| 01 | `ui/canvas/pose/poseMeshes.ts` · `ui/canvas/pose/__tests__/poseMeshes.test.ts` |
| 02 | `ui/canvas/pose/poseStamp.ts` · `ui/canvas/pose/__tests__/poseStamp.test.ts` · `containers/CanvasContainer.tsx` |

Disjoint. ⚠️ Task 02 owns `CanvasContainer.tsx` in W1; task 01 must not touch it.

**W5 — two tasks**

| Task | Touches |
| --- | --- |
| 06 | `ui/components/PosePanel/CameraAdvanced.tsx` (new) · its test (new) · `ui/components/PosePanel/PosePanel.css` |
| 07 | `ui/components/PosePanel/EulerInput.tsx` (new) · its test (new) · `ui/components/PosePanel/PoseSection.tsx` |

Disjoint **provided task 06 does not edit `PoseSection.tsx`** — it ships a standalone component
that task 08 mounts. ⚠️ Both touch `PosePanel/`; **only 06 may edit `PosePanel.css`.** If task 06
finds it cannot avoid `PoseSection.tsx`, it must **stop and report** rather than collide.

**W2, W3, W4, W6, W7 are single-task waves** and need no matrix.

## 8. Alignment guide

**Names to hold** (a synonym invented here breaks the next task):

- `scale` / `setScale` replace `zoom` / `setZoom` on the pose store (F6). The old
  `scaleCameraParams` is **deleted**, not repurposed.
- `fitGeneration` + `requestFit()` keep their names and meaning (a counter, monotonic).
- Presets: store field `posePresets`, wire key `posePresets`, type `PersistedPosePreset`,
  validator `narrowPosePresets()`, serializer `toPersistedPosePresets()`, save action
  `saveCurrentAsPosePreset(name)`, delete `deletePosePreset(id)` — mirroring `layoutPresets`.
- Existing names unchanged: `PoseUIStore` / `app.pose`, `poseTypes.ts`, `poseEngine.ts`,
  `poseMeshes.ts`, `poseCamera.ts`, `poseStamp.ts`, `poseOutline.ts`, `applyOutline`,
  `MANNEQUIN_PART_ORDER`, ref `poseCanvasRef`, BEM blocks `pose-panel` / `direction-orb`,
  `canvas__overlay--pose`, `pose?: PoseSectionProps`.

**How to make the fit rotation-invariant (F5).** The pulsing exists because the fit measures the
*rotated* projected extent. Two defensible cures — **task 03 picks one, documents it, and tests
it**:

1. **Bounding sphere.** Fit the model's bounding *sphere* rather than its box. A sphere's
   projected radius is rotation-invariant by construction, so the framing cannot change. Cost:
   a long thin model is framed loosely at every angle.
2. **Rotation-independent box.** Fit the **unrotated** box (pass identity rotation), so framing
   is stable but a rotated corner may overflow slightly.

Option 1 is the recommended default: it is provably invariant and needs no "does it clip?" caveat.

**Analogues to imitate:**

| Building | Copy the shape of |
| --- | --- |
| A persisted, user-named preset list | **`layoutPresets`** — `LayoutUIStore.ts:500-570` + `UIStore.ts:518-521`. Every piece is listed in §4.6 |
| Pure pixel maths + exhaustive tests | `poseOutline.ts` (48 tests) and `poseStamp.ts` (46 tests) |
| A pure numeric rail control | the existing `DirectionOrb` / the edge-width slider in `PoseSection.tsx` |
| Store field + action + session-only doc header | `PoseUIStore`'s existing fields |
| Wide-on-the-wire, narrowed-on-hydrate | `PersistedLayoutPreset` (`domain.ts:316-331`) + `narrowPresets` (`LayoutUIStore.ts:201-212`) |

**Boundaries that must not be crossed:**

- Nothing under `ui/` imports a store, the API, `services/`, MobX, or calls `useContext` —
  **type-only imports included**. `three` is fine but arrives as a `ThreeNamespace` **parameter**,
  never a module-level runtime import. `observer()` only in `containers/`.
- Pixel grids are `observable.ref`; never deep-observed, never mutated in place.
- The render target stays **exactly `cellWidth × cellHeight`**; no scaling `drawImage`, no
  `antialias: true`, no `LinearFilter`. Setting `canvas.width` re-enables
  `imageSmoothingEnabled` — re-set it on every context acquisition.
- The pose overlay keeps its **own** `useCanvasRender`; **no `useState` on a pointer path**;
  drag state in refs.
- Gesture routing (D12) unchanged: `pose` stays in `isGestureTool`, its branches stay ahead of
  the touch bails, double-click stays 400 ms / 2 cells in a ref.
- No numeric `z-index` in new CSS; stylelint stays at **exactly 2 errors**.
- `three` stays lazy: dynamic `import("three")`, `import type` only at module level.
- `poseTypes.ts` and `PoseUIStore.ts` keep their **deliberate duplicate unions** and change
  **together**, character for character.
- `fillColor` is **tri-state** — never seed a default; always read `fillColorOrSelected`.

**What "done" looks like, visually:** the model sits centred and holds a **constant apparent
size** through a full orbit of the rotation orb. Dragging it slides it smoothly in the frame,
pixel-aligned, and it may leave the frame entirely without the picture clipping to a moving
rectangle. The Scale control grows it about its own centre while the camera plainly does not
move. Pressing **Isometric** snaps the whole scene — camera *and* model orientation — into a
known state. Pressing **Left** turns the model to its left. Typing `45` into a rotation field
does exactly what dragging the orb to 45° does. Saving a preset, reloading the app, and
selecting it restores the identical view.

**The six mistakes an executor is most likely to make:**

1. **"Fixing" the pulsing by clamping or smoothing the fit** instead of making it
   rotation-invariant (F5). The fit must stop depending on rotation at all.
2. **Implementing pan via `object.position`** — it collides with `normalizeToUnitBox`, which
   writes `object.position` (§4.3). F3 says move the **camera and its target together**.
3. **Re-centring a part with `mesh.position.set(...)`** instead of translating its **vertices**
   (F2). That reproduces exactly the bug being fixed.
4. **Writing the preset key unconditionally**, or as `key: undefined` — measured to change all 11
   corpus digests (F13). Use `assign()` + a serializer that returns `undefined` when empty.
5. **Adding a field to `CompactUIState` without bumping the `toHaveLength(52)` assertion** at
   `persistedUIState.test.ts:267`, and without extending `fullyPopulatedProject()`.
6. **"Correcting" the viewpoint maths** for item 11. The maths is already self-consistent; F9 is
   a **semantic** inversion. Change the meaning and the labels, not `applyEulerXYZ`.

Also easy to get wrong: forgetting `applyOutline` **mutates in place and is not idempotent**, so
the stamp needs its **own fresh buffer** (the engine reuses `this.readback` — copy it); leaving
`scaleCameraParams` behind after F6; and creating a lockfile.

## 9. Risk register

| Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| The rotation-invariant fit is "fixed" by smoothing rather than by removing the rotation dependency | **High** | High | F5 states the requirement; task 03 must pick one of the two documented cures and **test invariance across a full revolution** | 03 |
| Pan is implemented via `object.position` and collides with `normalizeToUnitBox` | Med | **High** | Called out in §4.3, §8 mistake 2 and F3; task 04 moves camera+target together | 04 |
| A part is re-centred by transform, not by vertices — the original bug returns | Med | **High** | F2; task 01 asserts the **geometry** bounding-box centre is the origin, not the object's | 01 |
| Deleting `scaleCameraParams` breaks framing in a way tests do not catch (no GPU) | Med | **High** | Task 03 keeps the fit's *arithmetic* under unit test; the visual result is an owed manual check, stated as such | 03, 09 |
| The preset key ships unconditionally and fails `persistedUIState.test.ts` on all 151 snapshots | Med | **High** | F13 + §4.6; the W6 gate greps the snapshot dir explicitly | 08 |
| A corpus digest moves | Low | **Highest** | W6's gate stops the plan; a human reads the diff; F12's fallback needs no rework of 01-07 | 08, coordinator |
| The `toHaveLength(52)` assertion is missed | **High** | Low | §8 mistake 5 names the exact line | 08 |
| F7 silently contradicts D14 and confuses a later reader | Med | Med | F8 records the supersession explicitly in `HANDOFF.md` | 05 |
| Item 11 is implemented as a maths fix, re-inverting the buttons a **third** time | Med | Med | F9 + §8 mistake 6; the maths was re-verified this session and is correct | 05 |
| The stamp double-applies the outline (it is not idempotent) | Med | Med | Task 02 copies the buffer and applies exactly once; a test pins single application | 02 |
| Euler→vector for the light is not invertible, so typed angles do not round-trip | **High** | Low | F11 makes task 07 decide and document; storing the angles alongside is the escape hatch | 07 |
| `bunx` writes a lockfile | **High** | High | Sweep after every invocation, in every task | all |
| Building on 41 unperformed checks (esp. GPU depth heights) | **High** | Med | No task may assume that path is proven; task 09 merges all lists | all, 09 |

## 10. Rules for every executor

1. **Bun only.** `node`/`npm` are not on PATH. Use `bun` / `bunx`.
2. **Never create a lockfile.** `bunx` **does** recreate `client/bun.lock` here. After *every*
   `bunx`, run `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` and delete anything
   found. Never remove `save = false` from `bunfig.toml`. `--frozen-lockfile` must never appear.
3. **Never `vitest -u`.** The corpus, round-trip and `persistedUIState` snapshots must pass
   **unchanged**. If one changes, **stop** — that is the owner's real work.
4. **Never touch `server/src/data/`** or the vendored mannequin asset.
5. **Never break `bun run dev`.**
6. **The `ui/` boundary.** No store, API, `services/`, MobX or `useContext` under
   `client/src/ui/` — type-only included. `observer()` only in `containers/`. Run
   `bun run lint:boundaries`.
7. **Never deep-observe a pixel grid**, never mutate one in place.
8. **Stay inside your task's `Touches` list.** If you need a file that is not yours, **stop** and
   record what you needed and why.
9. **Commit at task granularity** on the plan's branch. Never commit to `main`.
   ⚠️ In a shared worktree use **`git commit --only <explicit paths>`** — plan 07 hit two commit
   races. **Never use `git stash`** — this repo has pre-existing stashes and a pop can resolve
   against the wrong one.
10. **Report honestly, including partial completion.** Never mark a task done while claiming
    manual checks nobody performed. `PARTIAL` is a legitimate outcome. ⚠️ **Most of this plan is
    visually verifiable only** — say so rather than implying otherwise.

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Model-space origins for every mesh | W1 | M | Translate part **vertices** so each mesh's geometry origin is its own bounding-box centre; assert it for primitives too (items 2, 7) |
| 02 | The outline reaches the stamp | W1 | M | Apply the outline to the stamp's colour buffer, **colour channel only**, normal/height untouched (item 1) |
| 03 | The camera holds still: fit → scale | W2 | L | Delete `scaleCameraParams`; `zoom`→`scale` on the model; make the fit rotation-invariant (items 4, 6) |
| 04 | Camera-space pan | W3 | M | Pan becomes a camera+target translation; `putImageData` returns to a fixed origin (item 3) |
| 05 | Presets set everything; viewpoint semantics | W4 | M | Camera presets set all camera fields **and** model rotation; invert `left`/`right` (items 5, 11) |
| 06 | Advanced camera mode | W5 | M | Exact numeric entry for the projection fields (item 8) |
| 07 | Exact Euler entry for rotation and light | W5 | M | Degree-based numeric entry; Euler→vector for the light (item 9) |
| 08 | Saved scene presets, persisted | W6 | L | `posePresets` following the `layoutPresets` pattern exactly; **plus the iPad slider fix** (item 10) |
| 09 | Full gate, QA, handoff | W7 | M | `bun run verify`, bundle check, one consolidated risk-ordered checklist merged with the outstanding 41 |
