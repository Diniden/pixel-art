# 31 — Canvas decomposition step 2: viewport, keyboard, and the tool handlers

**Wave:** W23 · **Depends on:** 30
**Touches:** `client/src/components/Canvas/Canvas.tsx` · `client/src/ui/hooks/useCanvasViewport.ts` (new) · `client/src/ui/hooks/useCanvasKeyboard.ts` (new) · `client/src/ui/hooks/useCanvasPointer.ts` (new) · `client/src/ui/hooks/useCanvasRender.ts` (new) · `client/src/ui/canvas/tools/toolHandlers.ts` (new) · `client/src/ui/canvas/tools/brushStamp.ts` (new) · `client/src/ui/canvas/tools/traceSampler.ts` (new) · `client/src/components/Canvas/LightingCanvas.tsx` (viewport call sites) · `client/src/components/ReferenceImageModal/ReferenceImageModal.tsx` (viewport call sites) · `client/src/ui/canvas/tools/__tests__/` (new)
**Effort:** L

## Objective

After this task the viewport engine (written **three times** in this codebase), the 251-line keyboard handler, and the 1,030-line pointer section are extracted into hooks and pure tool handlers — collapsing the mouse/touch duplication that has **already drifted into a latent bug**. `Canvas.tsx` drops to roughly 400 lines.

## Context

### The viewport engine exists three times

`clampPanToViewport` is **byte-identical** between `Canvas.tsx:212-232` and `LightingCanvas.tsx:132-152` except for one identifier:

```
$ diff <(sed -n '212,232p' Canvas.tsx) <(sed -n '132,152p' LightingCanvas.tsx)
7c7
<       const container = containerRef.current;
---
>       const container = editorContainerRef.current;
```

`getTouchCenter` / `getTouchDistance` (`Canvas.tsx:2689-2702` vs `LightingCanvas.tsx:441-454`) differ by the same single token. The 62-line wheel handler differs by 27 lines, **all cosmetic** (brace style, one comment, and Canvas's two extra `scheduleCommitPan()` calls).

Full duplicate ranges — **~185 lines, ≥95% identical**:
- `Canvas.tsx:40-99, 178-232, 273-280, 2625-2702, 2704-2726, 2820-2862, 2973-2977, 3006-3012`
- `LightingCanvas.tsx:24-56, 127-161, 379-454, 456-478, 504-546, 581-585, 855-861`
- `ReferenceImageModal.tsx:505-520, 577-667` (a third, partial copy)

`useCanvasViewport` owns: `viewZoom`, `viewPanOffset`, `scheduleCommitPan`, `clampPanToViewport`, pinch/anchor refs, the wheel handler, and the touch-gesture math.

### The keyboard handler — 251 lines with three-way precedence

`Canvas.tsx:1575-1825`: undo, delete, 12 tool hotkeys, WASD under **three priority modes** (reference-trace > frame-trace > variant, at lines 1649-1699), arrow keys under all three `selectionBehavior` values, Escape with **3-level precedence** (1741-1761), and `.`/`,` frame navigation.

⚠️ **It uses `useCapture = true`, and that is load-bearing** — the capture-phase ordering versus `FrameTimeline.tsx:171-202` matters, and versus the `Modal` primitive's Escape handler (task 19) and `App.tsx:91-152`'s window-level keydown. **Preserve `useCapture = true`.**

### The pointer section — 1,030 lines, and mouse/touch have already drifted

`Canvas.tsx:1961-2990` handles mouse down/move/up, touch start/move/end, and wheel.

**Measured duplication inside it:**

| Pair | Lines | Duplicated |
| --- | --- | ---: |
| Mouse vs touch drawing bodies | `handleMouseDown` 2187-2266 vs `handleTouchStart` 2741-2816; `handleMouseMove` 2460-2547 vs `handleTouchMove` 2908-2970 | **~180** |
| Reference-trace vs frame-trace stamping | `handleMouseDown` 1984-2018 vs 2021-2054; `handleMouseMove` 2301-2344 vs 2347-2390 | ~110 |

⚠️ **The mouse and touch paths have ALREADY DRIFTED into a bug:** `handleTouchStart`'s eraser path (lines 2766-2772) **omits the bounds `.filter()`** that the mouse path applies (lines 2217-2222). That is a latent **out-of-bounds write on touch**.

**SETTLED — OWNER DECISION (2026-08-16): fix it, unifying onto the mouse behaviour.** It is a bug, not an intentional performance shortcut. Apply the bounds `.filter()` from the mouse path (`Canvas.tsx:2217-2222`) to the touch path (`Canvas.tsx:2766-2772`), closing the latent out-of-bounds write.

⚠️ **Touch behaviour changes as a result.** This task must call that out explicitly in its verification as a **manual check performed on a real touch device** — drawing and erasing at the grid edges, confirming no out-of-bounds writes and no change to in-bounds strokes — and state the change in the completion report.

`tools/toolHandlers.ts` becomes a pure `Record<Tool, {onDown, onMove, onUp}>` — one entry per tool, unifying mouse and touch. `tools/brushStamp.ts` is a pure segment + brush-shape + dedupe → pixel-list function. `tools/traceSampler.ts` puts the reference and frame samplers behind one interface.

**Task 08 wrote the mouse-vs-touch agreement test specifically to encode this drift** — it asserts both paths agree. That test is the acceptance criterion here.

### The 16 tools

`selectedTool` is a 16-member union (`types/index.ts:196-212`). Every one needs an entry in `toolHandlers`, and every one needs exercising manually.

### Where these live

`client/src/ui/hooks/` and `client/src/ui/canvas/tools/` — inside the `ui/` boundary. They are pure DOM/gesture and pure computation, so they take no store. Anything needing store data receives it as a parameter or a callback.

## Steps

Land each as its own commit.

1. **`useCanvasViewport`.** Extract from `Canvas.tsx`, then replace `LightingCanvas.tsx`'s copy, then `ReferenceImageModal.tsx`'s partial copy. Diff the three implementations first and report any difference beyond the identifier renames documented above — Canvas's two extra `scheduleCommitPan()` calls in the wheel handler are the one known functional difference and must be preserved for Canvas.
2. **`useCanvasRender`.** Extract the rAF scheduling and invalidation (`Canvas.tsx:1523-1562`).
3. **`useCanvasKeyboard`.** Extract lines 1575-1825 wholesale, preserving `useCapture = true` and all three precedence orderings.
4. **`tools/brushStamp.ts`.** Pure: segment + brush shape + dedupe → pixel list, with bounds filtering. Confirm task 08's tests pass.
5. **`tools/traceSampler.ts`.** One interface over the reference and frame samplers; replaces the ~110 duplicated stamping lines.
6. **`tools/toolHandlers.ts`.** One entry per tool. **Collapse the mouse and touch bodies onto it** — this is the step that fixes the touch eraser bounds bug.
7. **`useCanvasPointer`.** Mouse + touch dispatch delegating to `toolHandlers`.

## Constraints

- **Preserve `useCapture = true`** on the keyboard handler and all three precedence orderings (WASD's reference-trace > frame-trace > variant; Escape's 3 levels; arrows under each `selectionBehavior`).
- **Preserve Canvas's two extra `scheduleCommitPan()` calls** in the wheel handler — that is the one real difference from LightingCanvas's copy.
- **The touch eraser bounds fix changes behaviour** (owner-approved, 2026-08-16). Say so explicitly in the completion report, and do not ship it without the manual touch-device check.
- **Do not touch concerns 1 and 2** (store binding at 101-149, geometry at 151-285) — the next task owns them.
- Do not convert `Canvas.tsx` into a container or move it into `ui/components/` yet.
- Nothing in `client/src/ui/` may import a store, the API, or MobX.
- Do not change `LightingCanvas.tsx` beyond swapping its viewport call sites.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build && bunx storybook build
bunx vitest run src/ui/canvas/tools     # brushStamp mouse-vs-touch agreement
bunx vitest run                          # full suite
```

Manual checks — **this is the largest manual matrix in the plan and none of it is automatable**:

1. **All 12 tool hotkeys.**
2. **WASD under all three priority modes** (reference-trace, frame-trace, variant) — the precedence must be unchanged.
3. **Arrow keys under each of the three `selectionBehavior` values.**
4. **Escape's 3-level precedence**, and confirm it still cooperates with the `Modal` primitive's Escape (a modal must close without clearing the canvas selection).
5. **`.` / `,` frame navigation.**
6. **Draw with pixel, eraser, fill-square, line, rect, ellipse, flood fill and gaussian fill, at brush size 1 and > 1, circle and square — with a mouse AND on a touch device.** Confirm **no out-of-bounds writes at the grid edges**, which is the drift this task fixes.
7. **Trackpad pinch, ctrl+wheel zoom, two-finger pan, and touch pinch — on BOTH `Canvas` and `LightingCanvas`.** Verify zoom anchors under the cursor and does not drift or jitter.
8. All 16 tools in the `Tool` union produce their expected behaviour.
9. Undo during an in-progress drag.

## Definition of done

- [ ] `useCanvasViewport` replaces all three viewport implementations; any difference beyond the documented identifier renames is reported.
- [ ] `useCanvasKeyboard`, `useCanvasPointer` and `useCanvasRender` exist; `useCapture = true` and all three precedence orderings are preserved.
- [ ] `tools/{toolHandlers,brushStamp,traceSampler}.ts` exist and are pure; mouse and touch share one code path.
- [ ] **Task 08's brushStamp mouse-vs-touch agreement test passes**; the touch eraser bounds `.filter()` from `Canvas.tsx:2217-2222` is applied to the former `Canvas.tsx:2766-2772` touch path; and the resulting touch behaviour change is called out, having been **manually verified on a touch device**.
- [ ] Every one of the 16 tools has a `toolHandlers` entry.
- [ ] `Canvas.tsx` is roughly 400 lines.
- [ ] Everything extracted lives under `client/src/ui/` and imports no store, API or MobX.
- [ ] The full 9-point manual matrix was performed on **both** a mouse and a touch device, and recorded.
