# 09 — Pencil and eraser get identical controls with independent values

**Wave:** W2 · **Depends on:** none
**Touches:** `client/src/stores/ui/ToolUIStore.ts` — ⚠️ see the collision note · `client/src/types/domain.ts` · `client/src/types/codecs/compactTypes.ts` · `client/src/types/constants.ts` · `client/src/stores/ui/UIStore.ts` · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/otherHand/toolWidgets.ts` — ⚠️ see the collision note · `client/src/stores/ui/__tests__/eraserBrush.test.ts` (new)
**Effort:** L

> ⚠️ **COLLISION NOTE — read before starting.** `ToolUIStore.ts` is also touched by task
> 05 (W2) and `toolWidgets.ts` by task 07 (W3). **This task is therefore scheduled ALONE
> in W2 alongside 05 only if the coordinator has confirmed the two edits are in disjoint
> regions of `ToolUIStore.ts`** — 05 adds `swapColors` beside the color setters (~line
> 313); this task adds brush fields beside the brush setters (~lines 73–95, 328–360).
> They do not overlap textually, but they are the same file. **The coordinator must run
> 05 and 09 SEQUENTIALLY within W2, 05 first, not in parallel.** See MASTER §7.

## Objective

After this task, the eraser has its **own** size and its **own** max-size setting,
independent of the pencil's, and its panel offers the same Max button row the pencil has.
Changing the pencil's brush size no longer changes the eraser's, and vice versa. The
lighting studio's normal brush also stops being dragged around by the pixel studio's
brush size.

## Objective boundary

The user's ask is: *"identical controls for size and shape, distinct values."* Shape is
**already** separate. Size and max are not. This task separates those two.

## Context

### What is shared today (measured 2026-09-06)

All fields in `client/src/stores/ui/ToolUIStore.ts`:

| Field | Line | Scope today | Wire slot |
|---|---|---|---|
| `brushSize: number` | 73 | **SHARED by everything** | 9, unconditional |
| `eraserShape: "circle"\|"square"` | 93 | eraser only ✓ | 15, conditional |
| `pencilBrushShape: "circle"\|"square"` | 94 | pencil only ✓ | 16, conditional |
| `pencilBrushMax: 8\|16\|32\|64\|128` | 95 | **named for the pencil, but bounds the eraser too** | 17, conditional |

Setters: `setBrushSize` (328), `setEraserShape` (351), `setPencilBrushShape` (355),
`setPencilBrushMax` (360 — note it re-clamps: `this.brushSize = Math.min(this.brushSize, max)`).

**`brushSize` has seven readers**, all of which currently move together:
1. Pencil — `CanvasContainer.tsx:4325` → `getToolContext().brushSize` → `toolHandlers.pixel` (`toolHandlers.ts:196-199`)
2. **Eraser — the same `ctx.brushSize`**, `toolHandlers.ts:201-204` → `paintDown/paintMove` (`:155`, `:178`)
3. `fill-square` — `CanvasContainer.tsx:4372`, `:4818`
4. Reference-trace brush — `BrushControls.tsx:88`, `:110`
5. **Lighting-studio normal pencil** — `LightingCanvasContainer.tsx:257, 439`; `LightingStudioPanelContainer.tsx:46, 51`
6. Hover/footprint preview — `toolFootprint.ts:101, 117, 129`
7. Other-hand thumb sliders — `toolWidgets.ts:130, 145, 202`

**`pencilBrushMax` is also interlaced.** `PixelStudioPanel.tsx:252-266`, the **Eraser**
section:
```tsx
<input type="range" min="1"
  max={pencilBrushMax ?? 16}   // <-- the PENCIL's max bounds the ERASER
  value={brushSize}            // <-- the PENCIL's size IS the ERASER's size
  onChange={(e) => onBrushSizeChange(parseInt(e.target.value))} />
```
And the asymmetry: the Pencil section (`:186-197`) clamps its displayed value
(`Math.min(brushSize, pencilBrushMax ?? 16)`) while the Eraser section shows raw
`brushSize` (`:257`, `:263`). Only the Pencil gets a Max button row. Same in the other
hand: `toolWidgets.ts:139-149` builds one `sizeSlider()` bounded by `pencilBrushMax`, and
both `case "pixel"` (`:180`) and `case "eraser"` (`:190`) push it, but only `"pixel"` gets
`maxButtons()` (`:184`).

### ⚠️ The wire-format rule — this is the highest-risk part of the task

The owner's 151 corpus snapshots must stay byte-identical. `UIStore.ts:381-388` and
`ToolUIStore.ts:100-108` document the rule, and `UIStore.ts:539-547` gives the precedent
for a **deliberate, owner-approved extension** (`railLayouts`, `theme`):

> "Both are safe for the 151 real snapshots for one reason, and it must not be weakened:
> **neither key is emitted until the user changes something.** … The corpus digests are
> unchanged BECAUSE of that, not by luck — making either unconditional would add two keys
> to every project the moment it is next saved."

So the two new keys **must be `undefined` by default and emitted via `assign()`**, exactly
like `eyedropperMode` (`ToolUIStore.ts:109`) and `originColor`. Readers apply `?? fallback`.
See the `eyedropperMode` doc comment (`ToolUIStore.ts:100-108`) — copy its reasoning
verbatim in spirit for your new fields.

**`brushSize` stays unconditional slot 9 and keeps its meaning: the PENCIL's size.** Do
not renumber, rename or make it conditional. An existing project's single `brushSize`
therefore becomes the pencil's size and the eraser inherits it via `?? brushSize` until
the user moves the eraser slider — which is the correct migration and requires no
migration code.

### Traps

- **`brushSize` reader #5, the lighting normal pencil, is a real bug** the user did not
  name: a pixel-studio brush-size change silently resizes the lighting brush. Fixing it
  means a third field. **That is out of scope** — record it in `HANDOFF.md` under Notes
  and leave those four call sites reading `brushSize`.
- **Readers #3, #4, #6, #7** — `fill-square`, reference-trace, the footprint preview and
  the other-hand sliders. `fill-square` and reference-trace continue to read `brushSize`
  (the pencil's). The **footprint preview (#6) must follow the active tool**, or the
  eraser's hover outline will show the pencil's size — that is a visible bug, so it is in
  scope. `toolFootprint.ts` is **not** in `Touches`: instead pass the correct size in from
  the call site that already computes the tool context. Check `CanvasContainer.tsx:4325`
  — if the change cannot be made without editing `CanvasContainer.tsx` or
  `toolFootprint.ts`, **stop and record a blocker**; do not widen `Touches`.
- `setPencilBrushMax` (360) re-clamps `brushSize`. The eraser's equivalent must re-clamp
  the *eraser's* size, not the pencil's.
- Nothing under `client/src/ui/` may import a store — `PixelStudioPanel.tsx` takes props;
  `PixelStudioPanelContainer.tsx` supplies them.
- `client/src/types/` is inside the data-safety perimeter. The corpus suite must pass
  **unchanged**, and never `vitest -u`.

## Steps

1. **`ToolUIStore.ts`** — add two tri-state fields beside the existing brush fields
   (~lines 93–95):
   ```ts
   /** ⚠️ Tri-state like `eyedropperMode`: `undefined` = absent from the project
    *  file, and readers apply `?? brushSize`. Seeding a number here would add a
    *  key to all 151 corpus snapshots on their next save — the exact wire drift
    *  R3 exists to prevent. */
   eraserBrushSize: number | undefined = undefined;
   eraserBrushMax: 8 | 16 | 32 | 64 | 128 | undefined = undefined;
   ```
   Add `setEraserBrushSize` and `setEraserBrushMax` beside the existing setters
   (~328–360); the max setter re-clamps `eraserBrushSize` the way `setPencilBrushMax`
   re-clamps `brushSize`. Add a getter `get effectiveEraserSize(): number` returning
   `this.eraserBrushSize ?? this.brushSize`, and `get effectiveEraserMax()` returning
   `this.eraserBrushMax ?? this.pencilBrushMax ?? 16`. Register everything in the
   observability block, matching the surrounding style.

2. **`types/domain.ts`** and **`types/codecs/compactTypes.ts`** — add both keys as
   **optional** (`eraserBrushSize?: number; eraserBrushMax?: 8|16|32|64|128;`) beside the
   existing `eraserShape` / `pencilBrushMax` declarations (`compactTypes.ts:117-119`),
   with the same `// Optional for backward compatibility` convention already used there.
   **`types/constants.ts`** — do **not** add a default that would make them defined; if
   `DEFAULT_UI_STATE` requires an entry, it must be `undefined`.

3. **`UIStore.ts`** — in `toPersistedUIState()`, emit both via `assign(persisted, ...)` in
   the conditional block (after ~line 620's neighbours), numbering them in the existing
   comment scheme. Do **not** put them in the unconditional 1–31 block. Copy the
   surrounding comment style and state why they are conditional.

4. **Commit** ("feat(brush): independent eraser size and max on the store").

5. **`PixelStudioPanel.tsx`** — the Eraser section (`:237-289`): bind the slider's `value`
   to the eraser's effective size and its `max` to the eraser's effective max, and add a
   **Max button row identical to the Pencil's** (mirror `:186-197`'s markup and classes).
   Apply the same displayed-value clamp the Pencil section uses, so the two sections are
   symmetric. New props for the eraser size/max and their callbacks — this is a `ui/`
   component, so props in and callbacks out, no store import.

6. **`PixelStudioPanelContainer.tsx`** (`:143-149`) — supply the new props from the store.

7. **`toolWidgets.ts`** — `case "eraser"` (`:188-194`) gets its own `sizeSlider()` bound to
   the eraser's values plus a `maxButtons()` row, so the other-hand rail matches the
   panel. `case "pixel"` (`:179-186`) is unchanged.
   ⚠️ Task 07 (W3) also edits this file — **W2 runs first**, so 07 rebases onto you.

8. **Commit** ("feat(brush): eraser gets its own size and max controls").

9. **Wire the eraser's draw path.** The eraser reads `ctx.brushSize` at
   `toolHandlers.ts:201-204`. `toolHandlers.ts` is **not** in `Touches` and
   `CanvasContainer.tsx` is owned by tasks 07/08. Therefore: **do not change the draw
   path in this task.** Instead confirm by reading `CanvasContainer.tsx:4321-4391`
   (`getToolContext`) whether the context's `brushSize` can be made tool-aware from within
   `ToolUIStore` alone — e.g. by having the container read a single store getter that
   already branches on `selectedTool`. If yes, add that getter here and record in
   `HANDOFF.md` that a **one-line follow-up in `CanvasContainer.tsx` is required in W5**
   to consume it. If no, record a blocker. **Do not edit `CanvasContainer.tsx`.**

10. **New test `client/src/stores/ui/__tests__/eraserBrush.test.ts`** — follow the
    conventions of `client/src/stores/ui/__tests__/fillColor.test.ts`, the sibling suite
    that already pins a tri-state field. Cover:
    - both new fields default to `undefined`;
    - `toPersistedUIState()` on an untouched store emits **neither** key;
    - after `setEraserBrushSize(8)`, only `eraserBrushSize` appears;
    - `effectiveEraserSize` falls back to `brushSize` when unset and returns its own value when set;
    - `setBrushSize` does not change `effectiveEraserSize` once the eraser size is set;
    - `setEraserBrushMax(8)` clamps `eraserBrushSize` and leaves `brushSize` alone;
    - a round-trip through hydrate preserves both.

11. **Commit** ("test(brush): pin the eraser's independent size and max").

## Constraints

- **The corpus snapshots must be byte-identical.** Both new keys are conditional and
  `undefined` by default. Never run `vitest -u`.
- Do not renumber, rename, or change the conditionality of any existing wire key.
  `brushSize` stays unconditional slot 9 and means the pencil's size.
- Do not write a migration. The `?? brushSize` fallback is the migration.
- Do not touch `client/src/containers/CanvasContainer.tsx`, `toolHandlers.ts`, or
  `toolFootprint.ts`.
- Do not give the lighting normal pencil its own size — out of scope, record it.
- Do not change `eraserShape` or `pencilBrushShape`; shape is already correct.
- Nothing under `client/src/ui/` may import a store.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures — the corpus suite MUST pass UNCHANGED
bun run build
```

⚠️ **The corpus suite is the gate that matters here.** If any snapshot digest changes,
you have made a key unconditional. Revert and fix; do not update the snapshot.

**Manual checks:**

1. Set the pencil to size 12. Switch to the eraser → the eraser is at its own size (on a
   fresh project it inherits 12; once you move it, it stays put).
2. Set the eraser to size 3, switch back to the pencil → the pencil is still 12.
3. Switch to the eraser → still 3. The two no longer track each other.
4. The Eraser panel now has a **Max** row identical to the Pencil's; changing the eraser's
   max does not change the pencil's, and vice versa.
5. Set the eraser's max to 8 while its size is 32 → the size clamps to 8 and the pencil's
   size is untouched.
6. The hover footprint under the cursor matches the **active** tool's size (or, if step 9
   deferred this, the deferral is recorded in `HANDOFF.md`).
7. Same checks in the other-hand rail on the iPad.
8. **Save the project, reload it** → both tools' sizes and maxes come back correctly.
9. **Open an existing project that predates this change** → the eraser inherits the saved
   `brushSize` and nothing is lost.

## Definition of done

- [ ] `eraserBrushSize` and `eraserBrushMax` exist as tri-state fields, `undefined` by default.
- [ ] Both are emitted conditionally via `assign()`; an untouched project emits neither key.
- [ ] The corpus suite passes **unchanged**; no `vitest -u` was run.
- [ ] The Eraser panel has size and Max controls identical in form to the Pencil's, bound to the eraser's own values.
- [ ] The other-hand rail's eraser case has its own size slider and Max row.
- [ ] `CanvasContainer.tsx`, `toolHandlers.ts` and `toolFootprint.ts` are **not** in the diff.
- [ ] Any required follow-up (step 9) or out-of-scope finding (the lighting brush) is written into `HANDOFF.md`.
- [ ] `eraserBrush.test.ts` covers all seven cases in step 10.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All nine manual checks performed and recorded, including check 9 against a pre-existing project.
