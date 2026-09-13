# 11 — `PixelBrushUIStore`: size, ratio lock and per-axis strategy (session-only)

**Wave:** W3 · **Depends on:** 09
**Touches:** `client/src/stores/ui/PixelBrushUIStore.ts` (new) · `client/src/stores/ui/__tests__/PixelBrushUIStore.test.ts` (new) · `client/src/stores/ui/UIStore.ts`
**Effort:** M

## Objective
The pixel studio's Brush tool has a home for its stamp size (width/height in cells, `null`
= the brush's native size), the ratio lock (on by default, ratio captured at lock time),
and the scaling strategy per axis (locked → one pick sets both; a 2-D scaler always sets
both). Nothing is persisted; the corpus digests are untouched.

## Context
- Store layout: `client/src/stores/ui/UIStore.ts` constructs its sub-stores in the
  constructor (`:340-350`: `this.tool = deps.tool ?? new ToolUIStore()` …). Add
  `readonly pixelBrush: PixelBrushUIStore` constructed there with no `deps` entry.
  **Do not touch `toPersistedUIState()` (`:590-640`) or `hydrate`** — a non-persisted
  store adds no wire key (the `assign` rule in the comment `:590-611` explains why a
  `key: undefined` would change all 151 corpus digests).
- Non-persisted precedent: `ToolUIStore.ts:156-180` (`colorTarget`, header `:158-167` gives
  the justification wording). MobX style: `makeObservable(this, { field: observable, method: action, getter: computed })`
  as `ToolUIStore.ts:182-234`. The `stores/ui` boundary: may import `@/ui/canvas/tools/pixelBrushScale`
  (pure, type + registry) — `stores/ui` is not restricted from `ui/` (only `ui/` → stores is).
- Strategy ids and guards from task 09: `PixelBrushScaleStrategy`, `DEFAULT_PIXEL_BRUSH_SCALE`,
  `isPixelBrush2DStrategy`.
- Test rig: `stores/ui/__tests__/eraserBrush.test.ts` (plain vitest over a store instance)
  and `persistedUIState.test.ts` (must stay green untouched — it proves no new key).

## Steps
1. `PixelBrushUIStore.ts`:
   ```ts
   export const PIXEL_BRUSH_MAX_SIZE = 256;
   export interface PixelBrushNativeSize { width: number; height: number }
   /** Slider ceiling: min(256, max(64, 4 × the larger native side)). */
   export function pixelBrushSliderMax(native: PixelBrushNativeSize): number;
   export class PixelBrushUIStore {
     width: number | null = null;        // null = native
     height: number | null = null;
     lockRatio = true;
     /** height / width captured when the lock engaged; null = the native ratio. */
     lockedRatio: number | null = null;
     scaleX: PixelBrushScaleStrategy = DEFAULT_PIXEL_BRUSH_SCALE;
     scaleY: PixelBrushScaleStrategy = DEFAULT_PIXEL_BRUSH_SCALE;
     get isNative(): boolean;                                       // both null
     effectiveSize(native): { width: number; height: number };      // nulls → native, clamped 1..MAX
     setWidth(width, native): void;   // clamp; if lockRatio: height = clamp(round(width × ratio))
     setHeight(height, native): void; // clamp; if lockRatio: width = clamp(round(height / ratio))
     setLockRatio(locked, native): void; // engaging captures ratio = effH / effW; releasing sets lockedRatio = null
     setScale(axis: "x" | "y", id): void; // MASTER D11 rules
     resetSize(): void;               // width = height = null; lockedRatio = null (strategies kept)
     resetAll(): void;                // resetSize + lockRatio = true + both strategies default
   }
   ```
   Ratio in force = `lockedRatio ?? native.height / native.width`.
   `setScale` rules (MASTER D11): if `id` is 2-D → both axes = id. Else if `lockRatio` →
   both axes = id. Else set the one axis; if the **other** axis currently holds a 2-D id,
   set it to `"nearest"` (a 2-D scaler cannot pair with a kernel).
2. Register in `UIStore.ts`; add `pixelBrush` to `dispose()` only if the store holds a
   reaction (it should not).
3. Tests (each rule above; native 16×8 unless stated): defaults; `effectiveSize` at native;
   `setWidth(32)` locked → height 16; `setHeight(4)` locked → width 8; unlock, `setWidth(32)`
   → height untouched; re-lock at 32×8 → ratio 0.25 → `setWidth(64)` → height 16; clamps at
   1 and 256; `setScale("x","bilinear")` locked → both; unlocked → only x; `setScale("y","epx")`
   unlocked → both `epx`; then `setScale("x","lanczos3")` → x lanczos3, y nearest; `resetSize`
   keeps strategies; `resetAll` restores everything; `pixelBrushSliderMax` for 16×16 → 64,
   for 100×20 → 256, for 40×10 → 160. And: `persistedUIState.test.ts` still green (run it).
4. Commit: `brush-scale(11): PixelBrushUIStore — size, ratio lock, per-axis strategy`.

## Constraints
- Nothing persisted: no edit to `toPersistedUIState`, `hydrate`, `types/domain.ts`,
  `types/codecs/**`. The corpus check in MASTER §10 must show no snapshot change.
- No `observer`, no React. Do not read `BrushStore` from this store (native size is an argument).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/stores/ui && bunx vitest run src/stores/ui && bun run lint:boundaries
git status --short | grep __snapshots__   # nothing
```

## Definition of done
- [ ] Store exists at `ui.pixelBrush`; all rules in step 1 pinned by tests; persisted-state suites untouched and green.
