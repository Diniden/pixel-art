# 04 — The silhouette outline post-pass (pure, 1:1, whole pixels)

**Wave:** W2 · **Depends on:** none
**Touches:** `client/src/ui/canvas/pose/poseOutline.ts` (new) · `client/src/ui/canvas/pose/__tests__/poseOutline.test.ts` (new)
**Effort:** M

## Objective

A pure, fully unit-tested function that takes the rendered RGBA buffer and returns it with a
hard-edged outline of N whole pixels drawn around the model's silhouette, in a given colour.
No GL, no canvas, no store — just pixels in, pixels out, so it can be tested exhaustively in
the node lane where there is no WebGL.

## Context

**The owner's words:** *"support the 'Edge' color as well by making it do an outline around
the model in that color. It would need a thickness slider for that edge."*

**The owner's decision (locked):** thickness is **whole pixels, integer**, applied as a
**post-pass on the rendered silhouette** in the 1:1 render target — *not* a sub-pixel
inverted-hull or shader outline. At this resolution a 3D outline produces fractional coverage,
soft fringes and dropped thin features. A post-pass on the already-rasterised alpha gives a
crisp result that matches the pixelated look.

**Why this is a separate, pure task.** D5 fixes the render target at exactly
`cellWidth × cellHeight` — one texel per art pixel. That means the outline is a plain 2D
morphological dilation over an alpha mask, which is ordinary array maths. Keeping it out of
the engine means it can be tested properly (jsdom has no WebGL, so anything touching GL
cannot be unit-tested — this is the same split that made `poseCamera`/`poseStamp` testable).

**Where it will be used (not your job — task 06 wires it):** the container
reads back the render target into a `Uint8Array`, and this function runs over that buffer
before it is written to the overlay `ImageData`. ⚠️ **That readback path is shared with the
depth-derived heights**, which were reasoned from three's shader source and have **never been
run on a GPU** (30 manual checks from the pose-tool plan remain unperformed). Do not assume
the surrounding readback is proven correct; keep your function's contract narrow and total so
it cannot make that situation worse.

**Prior art in the repo for pure pixel maths + exhaustive tests:**
`client/src/ui/canvas/pose/poseStamp.ts` (and its 46-test suite) is the closest analogue —
same directory, same "decode a buffer, return plain data" shape. Copy its structure and its
documentation style.

**Boundary:** under `client/src/ui/` — no store, API, `services/`, MobX or `useContext`,
type-only included. **This module should not need `three` at all** (it is array maths), which
makes it the purest module in the directory. If you find yourself importing `three`, stop and
reconsider the design.

## Steps

1. Read `poseStamp.ts` first — its header, its clamp helper, and how it documents byte
   conventions. Match that style.
2. **Define the contract.** Something like:

   ```ts
   export function applyOutline(
     rgba: Uint8Array | Uint8ClampedArray,   // length width*height*4, MUTATED or copied — decide and document
     width: number,
     height: number,
     outlineWidth: number,                    // whole pixels; 0 = no-op
     color: PoseColor,
     options?: { alphaThreshold?: number },
   ): void | Uint8Array
   ```

   **Decide whether you mutate in place or return a new buffer, and document it loudly.**
   In-place is cheaper and this runs per frame; a copy is safer. Either is defensible —
   an undocumented choice is not. Whichever you pick, the *silhouette test must be taken
   from the ORIGINAL alpha*, not from a partially-outlined buffer, or the outline will
   grow into itself.
3. **Implement the dilation.** For each pixel that is transparent (alpha below the
   threshold) but within `outlineWidth` pixels of an opaque pixel, write the outline colour
   at full alpha. Use a **Chebyshev (square) or Euclidean (round) distance** — pick one,
   document it, and test it. At 1–4 px a square kernel reads as a blockier outline and a
   round one as a softer corner; the owner draws pixel art, so a square/Chebyshev kernel is
   the safer default unless you argue otherwise.
4. **Handle the alpha threshold explicitly.** The colour pass is alpha-thresholded at `>= 128`
   elsewhere in this feature (the stamp's D8 rule). **Use the same threshold by default** so
   the outline traces the same silhouette the stamp writes — a mismatch here would put the
   outline half a pixel out of step with what gets stamped. Document the coupling.
5. **Handle the edges of the buffer.** A model touching the canvas border must not read out
   of bounds, and must not wrap. Test all four borders and all four corners.
6. **Make `outlineWidth <= 0` a fast no-op**, and clamp absurd values (a width larger than
   the canvas should not loop for ever). Non-finite input must not crash.
7. **Write the tests — this is most of the task's value.** At minimum:
   - a single opaque pixel in the middle gains a ring of exactly 1, then 2, 3, 4 px;
   - a 2×2 block; a diagonal line; a shape with a one-pixel-wide neck;
   - a hole *inside* the shape is outlined on its inner edge (or is not — decide and pin it);
   - a shape flush against each border and each corner, no wrap, no out-of-bounds;
   - `outlineWidth = 0` leaves the buffer byte-identical;
   - a fully transparent buffer stays fully transparent;
   - a fully opaque buffer is unchanged (nothing to outline);
   - the outline colour is written exactly, at full alpha;
   - **existing opaque pixels are never overwritten** — the outline goes *around* the model,
     never on top of it. This is the assertion most worth having.
   - idempotence or the lack of it: applying twice at width 1 should not equal width 2
     (unless you designed it to) — pin whichever is true.
8. Commit.

## Constraints

- **Pure.** No store, no MobX, no API, no `services/`, no `useContext`, no DOM, no canvas,
  no `three`. Plain typed arrays and numbers.
- **Do not touch** `poseEngine.ts`, `poseStamp.ts`, `poseMeshes.ts`, `poseCamera.ts`, the
  container, or the panel. Task 06 wires this in; task 03 ships the slider.
- Do not add a numeric `z-index` (no CSS in this task at all).
- Do not change the alpha-threshold convention used elsewhere without saying so.
- **Never run `vitest -u`.**

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass, including your new suite in the NODE lane
bun run lint:boundaries           # OK
```

Root: lockfile sweep after every `bunx`.

Report your new suite's test count and paste the passing line for it specifically.

**Manual checks:** none — this task is deliberately pure so that it needs none. The *visual*
result is verified in task 06 once it is wired. Say this explicitly rather than leaving the
section empty.

## Definition of done

- [ ] `poseOutline.ts` exists, pure, importing nothing but types.
- [ ] Mutate-vs-copy decided and documented; silhouette read from the original alpha.
- [ ] Kernel shape (Chebyshev vs Euclidean) chosen, documented and tested.
- [ ] Alpha threshold matches the stamp's `>= 128`, with the coupling documented.
- [ ] Borders and corners handled; no wrap, no out-of-bounds.
- [ ] `outlineWidth <= 0` is a byte-identical no-op; non-finite input cannot crash.
- [ ] Opaque model pixels are provably never overwritten.
- [ ] Test suite covers every case listed in step 7.
- [ ] Gate green, no lockfile.
