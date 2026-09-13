# 07 — Incremental redraw from dirty regions

**Wave:** W6 · **Depends on:** 05
**Touches:** `client/src/containers/CanvasContainer.tsx` · `client/src/ui/hooks/useCanvasRender.ts` · `client/src/ui/canvas/render/renderLayerView.ts` · `client/src/containers/__tests__/CanvasContainer.dom.test.tsx` (created by task 05) · `client/src/ui/hooks/__tests__/useCanvasRender.test.ts` (new)
**Effort:** L

## Objective

The renderer consumes task 01's `pixelDirty` channel: an edit repaints **only the changed
cells on the one affected layer's canvas**, instead of every cell of every layer. This is
the request's core ask — "only the pixels affected should be redrawn" — and the payoff of
every wave before it.

## Context

### What is already in place

- **Task 01** publishes `DomainStore.pixelDirty` (`{layerId, cells} | null`) on both the
  write path (`commitCells`) and the replay path (`applyPatch`). `null` means "repaint
  everything".
- **Task 05** paints per layer into per-layer 1:1 canvases, addressed by a
  `Map<string, HTMLCanvasElement>`.

What remains: make invalidation carry *which* cells changed, and paint only those.

### The invalidation signal today

`CanvasContainer.tsx:1888`:

```ts
useCanvasRender(render, [render, pixelVersion]);
```

`useCanvasRender` (`ui/hooks/useCanvasRender.ts`) rAF-coalesces, calls the latest `render`
through a ref, and cancels on cleanup for StrictMode. Its structure is sound — **extend it,
do not restructure it.**

### The design

Coalescing is the subtle part. Several edits can land in one animation frame, so the hook
must **accumulate** dirty regions and hand the painter the union at paint time.

```ts
type DirtyAccumulator =
  | { kind: "all" }                                        // full repaint
  | { kind: "cells"; byLayer: Map<string, Set<number>> };  // y * cellWidth + x
```

Rules:

1. Each published region merges into the accumulator.
2. **Any `null` region promotes the accumulator to `"all"` and it stays there** until the
   frame paints. Never downgrade `"all"` back to `"cells"` — that is how stale pixels appear.
3. On paint, repaint the union, then reset.
4. Anything not a pixel edit — layer visibility, focus mode, zoom, variant selection, tool
   change, project load — is a **full repaint**. Only pixel writes take the fast path.

### Reading the channel without deep-observing

Use a MobX `reaction` on `domain.pixelDirty` in the container. It is `observableRef`
(task 01), so reading it is cheap and the cells array is never proxied.

⚠️ **`pixelVersion` must remain a full-repaint trigger** for everything that is not a pixel
write. Do not remove it from the invalidation path — narrow it. Safest arrangement: keep the
existing `pixelVersion` effect as the full-repaint path, and add the dirty reaction as the
fast path.

### ⚠️ The undo path is the one that will bite

`publishAndBump` (`PixelStore.ts:601-606`) **does not bump `pixelVersion` during replay** —
that is the deliberate no-save-on-undo gate. So on undo, `pixelVersion` never changes and the
**dirty reaction is the only signal that fires**. If you gate the fast path on `pixelVersion`
changing, undo will paint nothing and pixels will appear stuck.

Task 01 published on the replay path specifically for this. **Test undo explicitly.**

### ⚠️ Onion mode dilates the region (D9)

`isOutlineCell` (`CanvasContainer.tsx:278-291`) reads a cell's 4-neighbours. When
`layerFocusMode === "onion"`, editing one cell can change whether its **neighbours** render
as outline. Dilate the dirty region by **1 cell in each direction** in onion mode.

Simplest correct approach: in onion mode, treat every region as `"all"` for that layer.
Slower but always right. If you dilate instead, prove it with a test where a cell's neighbour
changes outline status.

### Clearing before repainting

A dirty cell that became **transparent** must be cleared, not overpainted — `fillRect` with a
transparent colour does nothing under `source-over`. Call `ctx.clearRect(x, y, 1, 1)` per
dirty cell before painting it. At 1:1 that is cheap.

### Write paths that must publish `null`

Task 01 audited these; verify its report and confirm each still lands on a full repaint:
flood fill, shape tools, paste, `moveLayerPixels`, clear-selection, variant grid resize,
`applyInterpolation`, project load. If any publishes a region it cannot describe accurately,
it must publish `null`. **Correct-but-slow always beats fast-but-wrong** (Risk R6).

### Measure it — this wave's gate is a number

The point of the plan is performance, so produce evidence. Instrument the painter (a
`performance.now()` around the paint, or the browser profiler) and record, on
**Landscapes (256×224)**:

- ms per single-cell edit **before** (`git stash`) and **after**
- cells painted per edit before (57,344) and after (should be ~1)

Put real numbers in your report. "It feels faster" is not a report.

## Steps

1. Extend `useCanvasRender.ts` with the accumulator: an `invalidateRegion(region)` alongside
   the existing `invalidate()`, merging per the rules above, `null` → `"all"`, reset after
   paint. Preserve rAF coalescing, the render-through-a-ref, and StrictMode cleanup.
2. Create `ui/hooks/__tests__/useCanvasRender.test.ts` — **`useCanvasRender` has no test file
   today**; the folder's other hook tests are `.dom.test.ts` and show the harness style.
   Cover the accumulator: merging two regions on different layers; `null` promoting to
   `"all"`; `"all"` never downgrading; reset after paint; StrictMode double-mount.
3. Commit after step 2.
4. In `CanvasContainer`, add a `reaction` on `domain.pixelDirty` calling `invalidateRegion`.
   Keep the `pixelVersion` effect as the full-repaint path.
5. Teach the per-layer painter to accept an optional cell set: iterate only those cells,
   `clearRect` then paint each. No set = full layer.
6. Handle onion mode per D9 — full-layer repaint, or dilation with a proving test.
7. Verify the `null`-publishing paths from task 01's audit.
8. Measure before/after on Landscapes and record the numbers.
9. Run the gate. Commit.

## Constraints

- **Do not modify `PixelStore`, `DomainStore` or any domain store.** Task 01 built the
  channel; you consume it.
- **Do not remove `pixelVersion` from the invalidation path** — narrow its role only.
- **Do not restructure `useCanvasRender`'s rAF/ref/StrictMode mechanism** — extend it.
- Do not deep-observe `layer.pixels` or `pixelDirty`.
- Never downgrade `"all"` to `"cells"`.
- Chrome overlays (selection, hover, reflection) keep their current invalidation. Do not
  route them through the dirty channel.
- Do not touch `LightingCanvasContainer`.

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint
bun run --cwd client lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

All exit 0, corpus snapshots unchanged. Paste real output.

**Manual checks — mandatory. Correctness first, then the numbers.**

1. **Draw a stroke** on Base Unit — every cell appears, none missing, none lagging a frame.
2. **Erase to transparent** — cells actually clear (the `clearRect` check). Overpainting
   instead of clearing leaves ghosts.
3. **Undo a stroke** — every pixel reverts. **This is the `publishAndBump` trap**; if pixels
   stick, the replay path is not wired.
4. **Redo** — likewise.
5. **Flood fill** a large region — completes correctly (full-repaint path).
6. **Shape tools, paste, move** — all correct.
7. **Onion mode** — edit a cell at the edge of a shape; **the neighbours' outlines update**.
   This is the D9 check and the easiest to get wrong.
8. **Variant-edit** — edits inside a variant repaint correctly with the offset applied.
9. **Toggle layer visibility / focus mode / zoom** — full repaints still happen.
10. **Rapid scribble** — several edits per frame coalesce with no dropped or stale cells.
11. **Split canvas** — edit in one pane, the other updates.
12. **Landscapes measurement** — before/after ms and cells-painted, with real numbers.

## Definition of done

- [ ] `useCanvasRender` accumulates regions; `null` → `"all"`, never downgraded; reset after paint.
- [ ] rAF coalescing, render-through-ref and StrictMode cleanup preserved.
- [ ] Container reacts to `pixelDirty`; `pixelVersion` retained as the full-repaint path.
- [ ] Per-layer painter accepts an optional cell set and `clearRect`s before painting.
- [ ] Onion mode handled per D9, with a proving test if dilating.
- [ ] `null`-publishing paths verified against task 01's audit.
- [ ] No domain store modified.
- [ ] Accumulator unit tests pass, including StrictMode double-mount.
- [ ] All four gate commands exit 0; corpus snapshots unchanged; output pasted.
- [ ] All twelve manual checks done and reported, especially #3 (undo) and #7 (onion).
- [ ] **Before/after measurement on Landscapes reported with real numbers.**
- [ ] No lockfile.
- [ ] Two commits (step 3, step 9).
