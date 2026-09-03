# 01 — Free zoom/pan, and a "Fit to canvas" button

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/PoseUIStore.ts` · `client/src/stores/ui/__tests__/PoseUIStore.test.ts`
**Effort:** M

## Objective

Zoom and pan stop being clamped to a range that caps how large the model can be drawn.
After this task the store exposes an unbounded-but-finite `zoom`, a `pan` that is never
clamped to the canvas, and a `fitGeneration` counter that the container will later watch to
re-run the auto-fit on demand. The *initial* framing still auto-fits — that behaviour is
preserved and pinned by a test.

This task is **store-only**. It deliberately does not touch the camera maths or the
container; task 04 consumes what this task exposes. That split is what lets 01 and 02 run in
the same wave.

## Context

**The current clamp — the thing the owner hit.**
`client/src/stores/ui/PoseUIStore.ts`:

- `:126-127` — `export const POSE_ZOOM_MIN = 0.1;` / `export const POSE_ZOOM_MAX = 10;`
- `:180` — `zoom = 1;`
- `:276` — `setZoom(zoom) { this.zoom = clamp(zoom, POSE_ZOOM_MIN, POSE_ZOOM_MAX); }`
- `:308` — `clear()` resets `zoom = 1`.

⚠️ **The clamp is only half the cause.** Pose-tool task 08 deliberately **folded zoom into
`fitCameraToMesh`'s padding** rather than applying it as a separate camera scale, so
`fitCameraToMesh` is currently the sole owner of framing. Folding a multiplier into a
"fit with 10% padding" computation means the fit keeps re-normalising the result — which is
why raising `POSE_ZOOM_MAX` alone will not give the owner what they asked for. **Unclamping
here is necessary but not sufficient; task 04 owns the fold.** Do not try to fix the fold
from this file — you do not own `poseCamera.ts` or `CanvasContainer.tsx`.

**The `clamp()` helper in this file has a deliberate quirk** (pose-tool W1 deviation): only
`NaN` falls back to `min`; infinities clamp to whichever bound they run into. Preserve that
reasoning when you replace clamping with sanitising — `NaN` must never reach the camera, and
neither must `Infinity`.

**Pattern to follow:** this file is MobX (`makeObservable`, `observableRef` for objects,
plain `observable` for scalars, `action` for setters). The refresh is complete; there is one
pattern. Do not touch `client/src/store/` (legacy Zustand residue).

**D6 still binds:** pose state is session-only. **No key may be added to
`toPersistedUIState()`** — the wire format must not change and the 151 corpus digests must
stay identical. `client/src/stores/ui/UIStore.ts` is **not** in your `Touches`; if you think
you need it, you have misunderstood the task.

## Steps

1. Read the whole of `PoseUIStore.ts` first, including the doc header. It states what is not
   persisted and why; your changes must keep that statement true.
2. **Replace the zoom clamp with a sanity guard.** Keep `zoom` a plain observable scalar.
   `setZoom` must accept any positive finite number — no upper bound. Reject only values
   that would break the camera: `NaN`, `±Infinity`, zero and negatives. Pick a tiny positive
   floor (e.g. `1e-3`) and document *why* a floor exists at all (a zero or negative scale
   inverts or collapses the projection) as distinct from the removed *cap*.
3. **Delete `POSE_ZOOM_MAX`.** Keep a renamed floor constant (e.g. `POSE_ZOOM_MIN_SAFE`) so
   the intent reads as "safety floor", not "range". Grep the repo for `POSE_ZOOM_MAX`
   before deleting; if anything outside your `Touches` imports it, **stop and report** —
   do not edit that file.
4. **Confirm `pan` is unclamped.** Read the pan field and its setter. The owner wants free
   movement "even off canvas", so no bound may be introduced; if a clamp exists, remove it.
   Record in a comment that off-canvas pan is intentional.
5. **Add `fitGeneration: number` (starts at 0) and a `requestFit()` action** that increments
   it. This is the seam for the owner's "fit to canvas with the current rotation and camera
   properties" button: the store records *that* a fit was asked for; the container watches
   the counter and performs it. A counter, not a boolean, so two consecutive requests are
   two distinct events.
   ⚠️ **`requestFit()` must not touch `zoom`, `pan`, `rotation` or any camera field.** The
   whole point is that it fits *at the current settings*. The container decides what fitting
   means.
6. **Confirm the initial-fit behaviour is preserved.** `setMesh` currently resets `pan` and
   framing. Leave the pan reset alone (a new mesh should arrive centred) and make sure
   nothing you changed prevents the first render from auto-fitting.
7. **Update the tests** in `__tests__/PoseUIStore.test.ts`: the existing clamp tests assert
   the old bounds and will fail. Replace them with tests for the new contract — a large zoom
   (e.g. 5000) is accepted verbatim; `NaN`/`Infinity`/`0`/negative are rejected to the floor;
   `fitGeneration` starts at 0 and increments per `requestFit()`; `requestFit()` mutates
   nothing else; `clear()` resets zoom to 1 and `fitGeneration` behaviour is defined.
   **Do not weaken the existing "not persisted" assertions** — they are the D6 guard.
8. Commit.

## Constraints

- **Do not edit** `poseCamera.ts`, `CanvasContainer.tsx`, `PoseSection.tsx`, `poseTypes.ts`
  or `UIStore.ts`. Task 04 owns the camera fold and the container wiring; task 03 owns the
  panel button.
- **Do not add a key to `toPersistedUIState()`.** Verify with
  `git diff -- client/src/stores/ui/UIStore.ts` → must be empty.
- Do not change `rotation`, `lightDirection`, `projection`, `preset` or `fov` semantics.
- Do not remove the `NaN`-vs-infinity distinction in `clamp()` without saying why.
- `framing` still exists at this point — **task 05 deletes it.** Leave it alone.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors (65 warnings is the baseline)
bunx vitest run                   # all pass; corpus digests unchanged
bun run lint:boundaries           # OK — all 5 rules
```

Then, from the repo root:

```sh
git diff -- client/src/stores/ui/UIStore.ts        # MUST be empty
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # MUST be empty
```

⚠️ `bunx` recreates `client/bun.lock` in this repo. Sweep after **every** invocation.

**Manual checks:** none for this task — it is pure store logic with no UI surface yet. Say
so explicitly in your report rather than leaving the section blank.

## Definition of done

- [ ] `POSE_ZOOM_MAX` is gone; no upper bound on `zoom`.
- [ ] `setZoom` rejects `NaN`, `±Infinity`, zero and negatives, and accepts large values.
- [ ] A comment explains why a floor exists but a cap does not.
- [ ] `pan` is provably unclamped, with a comment saying off-canvas is intentional.
- [ ] `fitGeneration` + `requestFit()` exist; `requestFit()` mutates nothing else.
- [ ] Tests updated, including a large-zoom case and a `requestFit()` isolation case.
- [ ] The "not persisted" tests still pass unmodified.
- [ ] `git diff` over `UIStore.ts` is empty.
- [ ] Gate green, no lockfile.
