# 05 — Camera presets set everything; viewpoint buttons mean what they say

**Wave:** W4 · **Depends on:** 03
**Touches:** `client/src/ui/canvas/pose/poseCamera.ts` · `client/src/ui/canvas/pose/__tests__/poseCamera.test.ts` · `client/src/stores/ui/PoseUIStore.ts` · `client/src/stores/ui/__tests__/PoseUIStore.test.ts` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/ui/components/PosePanel/PoseSection.tsx` · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx`
**Effort:** M

## Objective

Pressing a camera preset puts the **whole scene** into a known state — every camera property
**and** the model's rotation. And the viewpoint buttons finally match the owner's mental model:
**Left turns the model to face left**.

## Context

**The owner's words:** *"The camera preset buttons: these should CHANGE all of the other settings
that can be used for the camera."* and *"The rotation presets of the model should be indicative
of what the model should do: left means the model rotates to face the left, right means rotate to
face the right, top means I look at the top of the model, etc etc"*.

### Part A — presets set everything (F7)

**What they set today.** `POSE_CAMERA_PRESETS` at `poseCamera.ts:98-136` — five entries (`2d`,
`2.5d`, `iso`, `top-down`, `oblique`) carrying **only** `{id, label, projection, pitch, yaw}`.
They do not touch `fov`, scale, pan or rotation, which is why they feel partial.

**F7 — a preset now sets:** `projection`, `pitch`, `yaw`, `fov`, the near/far policy, the fit,
**and the model's `rotation`**. Pressing a preset **overwrites the viewpoint rotation**. Owner
decided this explicitly on 2026-09-03.

⚠️ **F8 — this SUPERSEDES D14.** Plan 06's D14 ("preset overrides projection") was kept by owner
decision *before* F7 existed; F7 subsumes it, because a preset now owns projection *and*
everything else. **Record the supersession in `HANDOFF.md` explicitly** — do not silently drop a
decision a previous plan deliberately preserved.

**Open question for this task:** should a preset also reset **scale** and **pan**? The owner said
"all of the other settings that can be used for the camera" — scale is now a *model* property
(task 03) and pan is a *camera* property (task 04). **Decide, document, and surface it in
`HANDOFF.md`.** The recommended reading: a preset restores **orientation and projection**, and
leaves the owner's framing (scale, pan) alone, because losing your zoom every time you change
angle is hostile. State whichever you choose.

### Part B — viewpoint semantics (F9)

**What exists.** `POSE_VIEWPOINT_ROTATIONS` at `poseCamera.ts:178-186`:

```ts
front: {0,0,0}       back: {0, 180°, 0}
left:  {0, 90°, 0}   right: {0, -90°, 0}
top:   {90°, 0, 0}   bottom: {-90°, 0, 0}
"three-quarter": {15°, 45°, 0}
```

⚠️ **The maths is CORRECT and self-consistent — do not "fix" it.** Re-verified 2026-09-03
against three's XYZ convention: with the camera on +Z, `left: yaw +90°` genuinely brings the
model's **left flank** (−X face) toward the viewer. The file header at `:150-177` documents this
convention and admits the first draft had left/right/top/bottom **all inverted** — so this is
the *third* time these signs are being touched. **Get it right by being clear about the
semantics, not by flipping signs until it looks right.**

**F9 — the semantic change.** The owner's model is *"the model rotates to face the left"*:

| Button | Owner's meaning | Consequence | vs today |
| --- | --- | --- | --- |
| **left** | the model turns to face left | you see its **RIGHT** flank | **INVERTED** |
| **right** | the model turns to face right | you see its **LEFT** flank | **INVERTED** |
| **top** | "I look at the top of the model" | crown toward viewer | **unchanged** |
| **bottom** | I look at its underside | unchanged | **unchanged** |
| **front / back** | unchanged | unchanged | **unchanged** |

⚠️ Note the owner phrased `top` differently from `left` — *"top means I look at the top of the
model"* is a **viewer-centric** phrasing, while *"left means the model rotates to face the left"*
is **model-centric**. That is why only left/right invert. **Rewrite the file header comment to
state the new convention plainly**, including why left/right and top/bottom read differently —
otherwise the next reader will "fix" it a fourth time.

**Think carefully about `three-quarter`.** It is `{15°, 45°, 0}`. Under the new convention, does
45° yaw still show the intended shoulder? Decide and document.

**Where the buttons live.** `PoseSection.tsx:356-366` maps `POSE_VIEWPOINT_ORDER` and calls
`onSetRotation(POSE_VIEWPOINT_ROTATIONS[id])` at `:362`; the container wires
`onSetRotation` → `pose.setRotation` (`PixelStudioPanelContainer.tsx:180`);
`PoseUIStore.setRotation` at `:412-414` replaces the vector wholesale.

**Boundary:** `poseCamera.ts` and `PoseSection.tsx` are under `client/src/ui/` — no store, API,
`services/`, MobX or `useContext`, type-only included. `PixelStudioPanelContainer.tsx` is the only
file here that may read stores. `observer()` only in `containers/`.

## Steps

1. Read `poseCamera.ts:98-197` (both preset tables and the convention header), then
   `PoseSection.tsx:340-370` (the orb and the viewpoint buttons), then the container wiring.
2. **Extend `PoseCameraPresetSpec`** so a preset carries every field F7 requires — at minimum
   `projection`, `pitch`, `yaw`, `fov`, and a `rotation`. Fill in sensible values for all five
   existing presets and **write the reasoning next to each** (why 2.5D is 30°, why iso is
   `TRUE_ISOMETRIC_PITCH_RADIANS` + 45° yaw, and now: what rotation each implies).
3. **Apply the whole spec** when a preset is selected. Find where `cameraPreset` is consumed and
   make selecting one write **all** of the fields, including `pose.setRotation(...)`.
   ⚠️ Keep it **one** logical user action — selecting a preset should be a single undoable/
   coherent state change, not five separate observable writes that each trigger a re-render
   storm. Consider a single store action, e.g. `applyCameraPreset(id)`.
4. **Decide the scale/pan question** from the Context, implement it, and record it.
5. **Invert `left` and `right`** in `POSE_VIEWPOINT_ROTATIONS` per F9. Leave `top`, `bottom`,
   `front`, `back` alone. Re-examine `three-quarter` and state your conclusion.
6. **Rewrite the convention header** (`poseCamera.ts:150-177`) to describe the new,
   owner-stated semantics — including the model-centric vs viewer-centric distinction that makes
   left/right invert while top/bottom do not. ⚠️ **Delete or correct the old claim** that `left`
   shows the left flank; leaving it contradicting the table is how this got inverted twice.
7. **Pin the semantics with tests that read as English**, so a future reader cannot re-invert
   them by accident. Assert against **transformed basis vectors**, not against raw angle values:
   - `left` puts the model's **+X (right) face** toward the camera (+Z);
   - `right` puts its **−X (left) face** toward the camera;
   - `top` puts its **+Y (crown)** toward the camera;
   - `bottom` puts its **−Y** toward the camera;
   - `front` is identity; `back` puts **−Z** toward the camera.
   Name the tests after the behaviour ("Left turns the model to face left, showing its right
   flank"), not after the numbers.
8. **Test the presets:** each of the five sets every field; selecting one twice is idempotent;
   selecting one leaves whatever you decided in step 4 untouched; and the F8 supersession is
   reflected (projection follows the preset).
9. **Update the DOM tests** for the panel: pressing a preset button calls the new action;
   pressing a viewpoint button sets the new rotation.
10. Run the gate, then commit.

## Constraints

- **Do not change `applyEulerXYZ`** (`poseCamera.ts:521-560`) — it is transcribed from three's
  own `Matrix4.makeRotationFromEuler` and is pinned. The bug is semantic, not mathematical.
- **Do not "fix" the viewpoint maths.** F9 is an intentional inversion of meaning.
- **Do not change** `poseMeshes.ts`, `poseStamp.ts`, `poseOutline.ts`, `poseEngine.ts`,
  `CanvasContainer.tsx` or `PoseSection.stories.tsx`.
- **Do not add a key to `toPersistedUIState()`** — that diff stays empty until task 08.
- ⚠️ `poseTypes.ts` and `PoseUIStore.ts` duplicate unions deliberately. If the preset id union
  changes, **both change together, character for character** — and `poseTypes.ts` is **not** in
  your `Touches`, so if you need it, **stop and report**.
- Keep `observer()` out of `ui/`; keep stores out of `ui/`.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK
```

Root: `git diff -- client/src/stores/ui/UIStore.ts` → empty; lockfile sweep after every `bunx`.

**Manual checks — you cannot perform these; list them as owed:**

1. ⚠️ **Press Left: the model turns to face left** (you see its right side). Press Right: the
   mirror. This is the check that decides whether F9 landed the right way round.
2. **Top** shows the crown; **Bottom** the underside; **Front**/**Back** unchanged.
3. Pressing **Isometric** (or any preset) changes projection, angle **and** model rotation in one
   go, giving a recognisable known view.
4. Pressing a preset twice does nothing the second time.
5. Whatever you decided about scale/pan on preset — confirm it behaves that way.
6. `three-quarter` still looks like the classic reference pose.

## Definition of done

- [ ] `PoseCameraPresetSpec` carries every F7 field, with per-preset reasoning written down.
- [ ] Selecting a preset sets **all** camera fields **and** the model rotation, as one action.
- [ ] The scale/pan-on-preset question is decided, implemented and recorded in `HANDOFF.md`.
- [ ] `left`/`right` inverted per F9; `top`/`bottom`/`front`/`back` unchanged; `three-quarter`
      re-examined and its conclusion stated.
- [ ] The convention header is rewritten; no stale claim contradicts the table.
- [ ] Semantics pinned by tests asserting on **transformed basis vectors**, named in English.
- [ ] **F8 recorded**: F7 supersedes D14, stated explicitly in `HANDOFF.md`.
- [ ] Gate green, `UIStore.ts` diff empty, no lockfile.
