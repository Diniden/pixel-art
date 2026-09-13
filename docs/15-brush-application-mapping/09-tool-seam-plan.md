# 09 — Tool seam: `pixelBrushPlan` + `setPixelsAt`

**Wave:** W3 · **Depends on:** 06
**Touches:** `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/canvas/tools/__tests__/toolHandlers.test.ts`
**Effort:** S

## Objective
The `brush` tool handler can stamp a **plan** — several stamps, each bound to a `(frameId, layerId)` —
routing the current target through `ctx.setPixels` and every other target through a new optional
`ctx.setPixelsAt`. The legacy single-stamp path (`pixelBrushStamp` / `pixelBrushTarget`) keeps working
untouched so this wave's gate stays green; task 12 removes it.

## Context
- `client/src/ui/canvas/tools/toolHandlers.ts` (371 lines): `ToolContext :83-140` (`pixelBrushStamp? :105`,
  `pixelBrushTarget? :114`, `setPixels :128`, `beginStroke :126`, `line :96`, `gridWidth/gridHeight :85-86`
  — `ctx` doubles as `StampBounds`), `ToolPixelWrite :72-76`, the `brush` handler `:309-343` (`onDown`:
  `beginStroke`, clear `touched`, one `stampPixelBrushSegment(null, e.coords, …)`, `setPixels`,
  `setLastStrokePixel`; `onMove`: same from `lastStrokePixel`; no `onUp`).
- From task 06: `PixelBrushPlan`, `PixelBrushPlanEntry` (`client/src/ui/canvas/tools/pixelBrushApply.ts`).
  `stampPixelBrushSegment` and `PixelBrushTarget` stay in `pixelBrushStamp.ts`.
- Tests: `__tests__/toolHandlers.test.ts` (346 lines), `describe("toolHandlers.brush")` `:83` — a fake
  `ToolContext` factory with a recording `setPixels` and a straight-line `LineFn`. Extend it with
  `setPixelsAt` recording `(target, writes)`.
- The `ui/` boundary applies (no stores). The file is under `src/ui/**` so `max-lines` is an **error** at
  400 code lines; the handler grows by ~20 lines — fine, but check.

## Steps
1. `ToolContext`: add `pixelBrushPlan?: PixelBrushPlan | null;` (doc: "plan 15 — several stamps with
   targets; when present it wins over `pixelBrushStamp`") and
   `setPixelsAt?: (target: { frameId: string; layerId: string }, writes: ToolPixelWrite[]) => void;`
   (doc: "writes to a non-current layer/frame of the selected object; absent → such entries are culled").
2. Private helper `stampPlan(prev, next, ctx, plan)`: for each entry → `stampPixelBrushSegment(prev, next, ctx.line, entry.stamp, ctx, entry.target)`;
   if `writes.length > 0`: `entry.current ? ctx.setPixels(writes) : ctx.setPixelsAt?.(entry, writes)`.
3. `brush.onDown`: `beginStroke`; `const plan = ctx.pixelBrushPlan ?? null;` if `plan`: clear every
   `entry.target?.touched`, `stampPlan(null, e.coords, ctx, plan)`; else the existing legacy body.
   `setLastStrokePixel(e.coords)`. `brush.onMove`: same branching from `ctx.lastStrokePixel`.
   Commit: `brush-apply(09): brush handler stamps a PixelBrushPlan`.
4. Tests (extend the describe):
   - plan with a `current` entry and a non-current entry: `onDown` → `setPixels` receives the current
     entry's writes, `setPixelsAt` receives `(entry, writes)` for the other; cell sets match each stamp.
   - non-current entry with `setPixelsAt` **absent** → nothing is written for it, no throw; the current
     entry still writes.
   - an entry whose stamp writes nothing in bounds → no call at all for it.
   - `onDown` clears every entry's `touched` (pre-fill two sets, assert both empty afterwards).
   - `onMove` rasterises from `lastStrokePixel` to the new point for **each** entry (two entries → each
     receives the same segment's cells through its own stamp).
   - plan present **and** legacy `pixelBrushStamp` present → only the plan is stamped (legacy ignored).
   - plan `null` / absent → legacy behaviour unchanged (the existing tests are that proof; keep them).
   Commit: `brush-apply(09): handler plan tests`.

## Constraints
- Do not remove or alter `pixelBrushStamp` / `pixelBrushTarget` or their tests — task 12 does.
- No new imports beyond the types from `pixelBrushApply.ts`.
- No other handler changes; `paintDown`/`paintMove` untouched.

## Verification
```sh
cd client && bunx vitest run src/ui/canvas/tools             # green
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas  # clean; no max-lines error
cd client && bun run lint:boundaries                         # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none (bound in task 12).

## Definition of done
- [ ] `ToolContext.pixelBrushPlan?` and `setPixelsAt?` exist; the handler stamps every entry with the D5 routing.
- [ ] Legacy path untouched and its tests still green; new tests listed above green.
- [ ] Boundaries 5/5; no `max-lines` error.
- [ ] Two commits `brush-apply(09):`; no lockfile.
