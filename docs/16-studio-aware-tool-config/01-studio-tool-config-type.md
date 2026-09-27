# 01 — The `ToolConfigStudio` type and the per-studio capability table

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/RightSidebarTopControls/toolConfigStudio.ts` (new) · `client/src/ui/components/RightSidebarTopControls/__tests__/toolConfigStudio.test.ts` (new)

**Effort:** S

## Objective

After this task there is ONE pure module that answers, for a given studio and a given
selected tool, **which tool-option controls that studio can honour**. It is a data table
plus one predicate function, with no React, no store, no MobX. Nothing consumes it yet —
task 02 wires it into `RightSidebarTopControls` and task 03 into the brush rail.

This is the seam the request asks for: "tools should be given a *Studio* configuration when
invoked for populating the tool panel". This module IS that configuration, expressed as a
capability table rather than as a boolean flag, because the honest answer differs per
control and not per studio wholesale (see Context).

## Context

### Why a capability table and not a `studioMode` boolean

`RightSidebarTopControls` today gates every one of its seven sections on a single
`isPixelMode: boolean` prop
(`client/src/ui/components/RightSidebarTopControls/RightSidebarTopControls.tsx:111-119`):

```ts
const showBrushSize       = isPixelMode && selectedTool === "fill-square";
const showTraceBrush      = isPixelMode && (selectedTool === "reference-trace" || frameTraceActive);
const showGaussianFill    = isPixelMode && selectedTool === "gaussian-fill";
const showShapeMode       = isPixelMode && ["rectangle", "ellipse"].includes(selectedTool);
const showBorderRadius    = isPixelMode && selectedTool === "rectangle";
const showMoveAllLayers   = isPixelMode && selectedTool === "move";
const showSelectionOptions= isPixelMode && selectedTool === "selection";
```

and the container passes `isPixelMode={lightingUI.studioMode === "pixel"}`
(`client/src/containers/RightSidebarTopControlsContainer.tsx:76`). That exact match — not
`!== "lighting"` — is **why the brush studio shows no tool options at all**, which is the
bug the request reports. Note the component's own header comment at
`RightSidebarTopControls.tsx:21` still says `studioMode !== "lighting"`; the comment is
stale and the container is authoritative. Do not "fix" the comment to match the old claim.

Flipping that boolean true for `"brush"` would be wrong, and this is measured, not
assumed. In the brush studio:

| Control | Honoured in brush studio? | Evidence |
| --- | --- | --- |
| `fill-square` size | **yes** | `BrushCanvasContainer.tsx:159` reads `tool.brushSize`; `brushToolContext.ts:664-670` `squarePixelsAt` uses `pencilBrushSize` |
| shape mode (rect/ellipse) | **yes** | `BrushCanvasContainer.tsx:163` reads `tool.shapeMode`, threaded at `:276`, `:306` |
| border radius (rect) | **yes** | `BrushCanvasContainer.tsx:164` reads `tool.borderRadiusOrZero`, threaded at `:277`, `:307` |
| gaussian-fill smoothing/radius | **NO** | `brushToolContext.ts:670-671` `floodFillAt: fillAt, gaussianFillAt: fillAt` — gaussian IS plain flood on a delta grid; the params are never read. `grep -n gaussianFill client/src/containers/BrushCanvasContainer.tsx` → no matches |
| `move` "all layers" | **NO** | `grep -n moveAll client/src/containers/BrushCanvasContainer.tsx` → no matches. A brush stroke targets one selected brush layer |
| selection mode / behaviour / expand / shrink | **NO** | The brush selection is rectangle-only React state in `containers/brush/useBrushSelection.ts` (`useState` at `:129-131`), NOT `SelectionUIStore`. `brushSelection.ts:17-18`: "Rectangle only. Lasso is DEFERRED". `grep -n 'selectionMode\|selectionBehavior' client/src/containers/brush/brushSelection.ts` → no matches. There is no expand/shrink |
| reference-trace nudge | **NO** | `reference-trace` is in `BRUSH_INERT_TOOLS` (`brushToolContext.ts:202-212`) and hidden from the brush toolbar (`PixelStudioToolsContainer.tsx:30-35`) |

So showing the pixel studio's full `SelectionControls` in the brush studio would put four
dead controls on screen — a worse bug than the one being fixed. The table encodes the
measured truth instead.

### The selection tool is still not left empty

The request explicitly names the selection tool: "our other tools like reflection tool and
selection tool still shows their unique tool configurations". The selection tool DOES get a
brush-studio section — it just gets the honest one. Task 04 builds a brush-specific
selection readout (the live size/pixel-count summary plus Clear), sourced from the brush
canvas's own mask. This task only records the capability; task 04 supplies the UI.

`reflection` needs a different answer and this task must not pretend otherwise: it is
`BRUSH_INERT_TOOLS` (`brushToolContext.ts:205`) — reflection does nothing on a brush
canvas, and its rail section lives in `PixelStudioPanel`, not here. See MASTER §3 D6 for
the locked decision (the tool is hidden from the brush toolbar in task 05 rather than given
a section that would lie).

### The pattern to follow

This is a pure `ui/` module: **it may not import a store, the API, or MobX**
(`CLAUDE.md`, the `ui/` boundary; enforced by `client/scripts/check-boundaries.mjs` rule 1
and by ESLint). It also must not import `types/domain.ts` if it lives under
`ui/primitives/` — it does not, it lives under `ui/components/`, so a domain-type import
would be permitted by rule 2. **Do it anyway without one**: type the studio and the tool as
narrow string unions declared locally, exactly as
`BrushDeltaPicker.tsx:58` declares its own `BrushDeltaTarget = "edge" | "fill"` rather than
importing the store's identical type, and as
`ui/canvas/pose/poseTypes.ts` declares `PoseColor` as a structural twin of the domain
`Color`. The reason is in `BrushDeltaPicker.tsx:52-57`.

The closest analogue for the file's *shape* is
`client/src/ui/components/RightSidebarTopControls/brushOptions.ts` — a sibling pure data
module in the very directory you are adding to. Read it first and match its style.

### Traps

- **`selectedTool` is typed `string`, not `Tool`, throughout this component tree**
  (`RightSidebarTopControls.tsx:49`, `PixelStudioPanel.tsx:92`). Keep it `string` on the
  public function signature so no caller needs a domain import. Narrow internally.
- Do not add a `"lighting"` capability row that enables anything. The lighting studio has
  its own rail (`LightingStudioPanelContainer`) and has never shown this panel; every
  capability there is `false`.
- Do not export a default. This directory's modules use named exports.

## Steps

1. Create `client/src/ui/components/RightSidebarTopControls/toolConfigStudio.ts`.

2. Declare the studio union locally (a structural twin of the domain `StudioMode`, with a
   comment saying so and pointing at `types/domain.ts:483`):

   ```ts
   export type ToolConfigStudio = "pixel" | "lighting" | "brush";
   ```

3. Declare the capability union — one member per control group this panel can render:

   ```ts
   export type ToolConfigCapability =
     | "brushSize"        // the fill-square size slider
     | "traceBrush"       // reference-trace max + nudge
     | "gaussianFill"     // smoothing + radius
     | "shapeMode"        // outline / fill / both
     | "borderRadius"     // rectangle corner radius
     | "moveAllLayers"    // move: all layers vs current
     | "selectionFull"    // mode + behaviour + expand/shrink/clear (SelectionUIStore)
     | "selectionBasic";  // summary + clear only (the brush canvas's own mask)
   ```

   `selectionFull` and `selectionBasic` are deliberately separate members rather than one
   `selection` plus a second flag: a studio has exactly one of them, and a union member is
   checkable by the same predicate as every other capability.

4. Write the table as a frozen `Record<ToolConfigStudio, ReadonlySet<ToolConfigCapability>>`,
   with a doc comment per row citing the evidence from the Context table above (the reader
   of this file must not have to take the rows on trust):

   - `pixel`: every capability except `selectionBasic`.
   - `lighting`: empty.
   - `brush`: `brushSize`, `shapeMode`, `borderRadius`, `selectionBasic`.

5. Export the predicate:

   ```ts
   export function studioSupports(
     studio: ToolConfigStudio,
     capability: ToolConfigCapability,
   ): boolean
   ```

   Module-level `Set`s so identity is stable across renders (the reason is the same one
   `PixelStudioToolsContainer.tsx:30` gives for its module-level `BRUSH_HIDDEN_TOOLS`).

6. Create `__tests__/toolConfigStudio.test.ts`. Pin, as assertions on *observed* behaviour:
   - every studio × every capability, exhaustively — a table test, so adding a capability
     without deciding its three rows fails;
   - `lighting` supports nothing;
   - `brush` does NOT support `gaussianFill`, `moveAllLayers`, `traceBrush` or
     `selectionFull` (these are the four that would put dead controls on screen — name that
     in the test's description so a future reader does not "helpfully" enable them);
   - `pixel` does NOT support `selectionBasic`, and `brush` does NOT support
     `selectionFull` — they are mutually exclusive per studio.

7. Commit: `feat(16): studio tool-config capability table`.

## Constraints

- **No store, API, or MobX import.** No `observer`. This file is pure data + one function.
- **Do not import `types/domain.ts`.** Declare the unions locally (see Context).
- Do not modify `RightSidebarTopControls.tsx` in this task — task 02 owns it. Adding an
  unused module is expected and correct here.
- Do not add a capability for `reflection` or `pose`. Those sections live in
  `PixelStudioPanel`, not in this panel, and reflection is inert on a brush canvas.
- Do not widen `selectedTool` to the `Tool` union anywhere in this file.

## Verification

```sh
cd client && bunx tsc --noEmit                                  # must exit 0
cd client && bunx vitest run src/ui/components/RightSidebarTopControls  # new suite green
cd client && bun scripts/check-boundaries.mjs                    # "all 5 boundary rules hold"
cd client && bunx eslint src/ui/components/RightSidebarTopControls
```

Paste the real output of each into your report, not a summary.

Boundary probe note (`CLAUDE.md`: "if the rule seems not to fire, run the boundary probe"):
a rule matching nothing looks exactly like a rule that passes. Prove rule 1 is live for
this file by **temporarily** adding `import { useStores } from "../../../stores/context";`
to `toolConfigStudio.ts`, running `bun scripts/check-boundaries.mjs`, confirming it FAILS
naming this file, then removing the import and confirming it passes again. Paste both
outputs. Do not commit the temporary import.

Manual check: none — this task ships no UI.

## Definition of done

- [ ] `toolConfigStudio.ts` exists, exports `ToolConfigStudio`, `ToolConfigCapability`,
      `studioSupports`, and the table.
- [ ] Every table row carries a comment citing the measured evidence for its contents.
- [ ] `__tests__/toolConfigStudio.test.ts` covers all three studios exhaustively.
- [ ] `bunx tsc --noEmit` exits 0; the new suite passes; eslint clean.
- [ ] Boundary probe passes AND was proven live by the temporary-import experiment, with
      both outputs pasted.
- [ ] No file outside `Touches` was modified (`git status --short`).
- [ ] One commit, message as in step 7.
