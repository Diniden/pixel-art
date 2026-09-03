# 02 — The outline reaches the stamp (colour channel only)

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/pose/poseStamp.ts` · `client/src/ui/canvas/pose/__tests__/poseStamp.test.ts` · `client/src/containers/CanvasContainer.tsx`
**Effort:** M

## Objective

Stamping a pose writes the outline as well as the model. Outline pixels get the **Edge colour**
and nothing else: the normal and height channels of whatever was already at those coordinates
are **left exactly as they were**.

## Context

**The owner's words:** *"Stamping should definitely include the outline"*.

This **reverses** plan 07's decision (its E7 made the outline display-only). The owner has now
decided otherwise, and **decided how**: locked decision **F1** — colour channel only, normal and
height untouched. Do not re-open it; do not invent normals; do not zero existing data.

**Why "colour only" is the right shape and not a cop-out.** Every stamped cell normally carries
colour + normal + height. An outline pixel is a 2D dilation of a silhouette — there is no
geometry beneath it, so there is no honest normal and no depth to normalise. `height: 0` is
already the "no data" sentinel. Writing colour alone means: *this pixel is this colour, and I
know nothing about its surface* — which is exactly true. An outline pixel stamped over existing
artwork keeps that artwork's lighting data, which is the behaviour the owner will expect.

**Where things are today (measured 2026-09-03):**

| Site | What |
| --- | --- |
| `CanvasContainer.tsx:2456-2576` | `renderPose`, the **overlay** painter |
| `CanvasContainer.tsx:2488` | `engine.render()` for the overlay |
| `CanvasContainer.tsx:2517-2518` | the **single** `applyOutline` call site, guarded by `poseEdgeWidth > 0` |
| `CanvasContainer.tsx:3046-3206` | the **stamp** callback |
| `CanvasContainer.tsx:3060` | `engine.render()` for the stamp (colour pass), copied via `Uint8Array.from` |
| `CanvasContainer.tsx:3068-3090` | `renderWithMaterial` helper → normals `:3103`, depth `:3115` |
| `CanvasContainer.tsx:3205` | `setPixelCells` |
| `poseStamp.ts:129-132` | `buildStampCells` params (`offsetX`/`offsetY` declared) |
| `poseStamp.ts:246-247` | those params destructured |
| `poseStamp.ts:~299-300` | the push: `x: x + offsetX, y: y + offsetY` |

The stamp takes its **own** `engine.render()` readback, separate from the overlay's — which is
precisely why the outline is absent from stamps today.

⚠️ **Three traps, all measured:**

1. **`applyOutline` MUTATES IN PLACE and is NOT idempotent.** Applying width 1 twice equals
   width 2 once, because the painted outline is alpha-255 and a second pass reads it as model.
   The stamp must apply it **exactly once**, to its **own** buffer.
2. **`PoseEngine.render()` reuses `this.readback`** (`poseEngine.ts:441-456`) — the same
   `Uint8Array` every frame. **Callers must copy.** The stamp already does
   (`Uint8Array.from` at `:3060`); keep that, and make sure the outline is applied to the *copy*,
   never to the engine's live buffer, or the overlay and the stamp will fight.
3. **The alpha threshold must stay coupled.** `applyOutline`'s
   `DEFAULT_OUTLINE_ALPHA_THRESHOLD = 128` matches the stamp's `POSE_ALPHA_THRESHOLD` so both
   trace the same silhouette. Pass it explicitly at the call site, as the overlay does.

**`applyOutline`'s signature** (`poseOutline.ts`):

```ts
applyOutline<T extends Uint8Array | Uint8ClampedArray>(
  rgba: T, width: number, height: number, outlineWidth: number,
  color: PoseColor, options?: { alphaThreshold?: number },
): T   // same reference, MUTATED in place
```

**Boundary:** `poseStamp.ts` is under `client/src/ui/` — pure, no store/API/MobX/`services/`,
type-only included. `CanvasContainer.tsx` is a container and may use `observer()` and read stores.

**Prior art:** `poseStamp.ts`'s own 46-test suite is the model for how to test this — synthetic
buffers, exact assertions, no GL.

## Steps

1. Read `poseStamp.ts` end to end, then `CanvasContainer.tsx:3046-3206` (the whole stamp
   callback), then the overlay's `applyOutline` call at `:2517-2518` to copy its shape.
2. **Decide where the outline is applied** and document it. Two defensible places:
   - **In the container**, on the copied colour buffer, before `buildStampCells` — mirrors the
     overlay exactly and keeps `poseStamp.ts` free of outline knowledge; or
   - **Inside `buildStampCells`**, behind new parameters — keeps the "one function builds the
     cells" story and is easier to unit-test without a container.
   Either is acceptable. **Pick one, state why, and be consistent.** The second is likely easier
   to test exhaustively in the node lane, which this project values.
3. **Thread the edge width and edge colour to the stamp.** The store already has `edgeWidth`
   (integer 0–4, default 0) and the Edge colour comes from `ui.tool.selectedColor` via the
   container. **Skip the outline entirely when `edgeWidth === 0`.**
4. **Implement F1 — colour only.** For each outline pixel:
   - write the **colour**;
   - **do not** write a normal, and **do not** write a height.
   ⚠️ `setPixelCells` takes cells; you must express "leave these channels alone" in whatever
   shape the cell type uses. **Read how `PoseStampCell` and `setPixelCells` represent an
   unspecified channel before you design this** — if the cell type cannot express "colour only",
   that is a real finding: **stop and report it** rather than inventing a normal.
5. **Preserve "fresh objects per cell".** `setPixelCells` does not deep-copy, so each cell needs
   a **new** `color`/`normal` object. This already holds in `buildStampCells` — do not regress it.
6. **Keep the stamp one undo entry.** The outline must land in the same `setPixelCells` call as
   the model, not a second one.
7. **Test exhaustively** in `poseStamp.test.ts`:
   - a model with `edgeWidth = 0` produces byte-identical cells to today (**a regression pin**);
   - `edgeWidth = 1..4` adds outline cells in the Edge colour;
   - **outline cells carry no normal/height, and model cells are unchanged** — the F1 assertion;
   - the outline never overwrites a model pixel;
   - the outline is applied **exactly once** (a width-1 stamp is not a width-2 ring);
   - the offsets (`offsetX`/`offsetY`) apply to outline cells identically to model cells;
   - the whole stamp is still a single `setPixelCells` payload.
8. Run the gate, then commit.

## Constraints

- **Do not edit** `poseOutline.ts` — it is correct and tested; you are calling it.
- **Do not edit** `poseMeshes.ts` or its test (task 01 owns them this wave), `poseCamera.ts`,
  `poseEngine.ts` or `PoseUIStore.ts`.
- **Do not change the normal/height encoding conventions**: project is **Y-DOWN**, three is
  **Y-UP**, the decode negates Y; scales 127 for x/y, 255 for z; height 1–255 with **0 = "no
  data"**.
- **Do not apply the outline to the engine's live readback buffer** — copy first (trap 2).
- Do not change the render target's size or the 1:1 rule; no scaling anywhere.
- ⚠️ **The depth-derived heights have never been run on a GPU** and share this readback path.
  Do not restructure the depth pass; add the outline alongside it without disturbing it.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK
```

Root: lockfile sweep after every `bunx`.

Report your new/changed test count and paste the passing line for `poseStamp.test.ts`.

**Manual checks — you cannot perform these; list them as owed:**

1. Stamping with edge width 0 produces exactly what it did before.
2. Stamping with width 1–4 writes a crisp outline in the **Edge** colour.
3. The stamp is still **one** undo entry.
4. ⚠️ **Stamping an outline over existing artwork leaves that artwork's normals and heights
   intact** — open the lighting studio and confirm the underlying surface still shades as it did.
   This is the F1 assertion and the highest-value check of the four.
5. An outline pixel on empty canvas has colour but no lighting response — expected, not a bug.

## Definition of done

- [ ] The stamp includes the outline when `edgeWidth > 0`, and is unchanged when it is 0.
- [ ] Outline pixels write **colour only** — normal and height untouched (F1), proven by test.
- [ ] `applyOutline` is applied **exactly once**, to a **copy**, never to the engine's live buffer.
- [ ] The alpha threshold is passed explicitly and matches the stamp's.
- [ ] Still one `setPixelCells` call — one undo entry.
- [ ] Fresh `color`/`normal` objects per cell preserved.
- [ ] Where the outline is applied (container vs `buildStampCells`) is decided and documented.
- [ ] Gate green, no lockfile.
