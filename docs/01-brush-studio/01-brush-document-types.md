# 01 — Brush document types & colourisation

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/brush.ts` (new) · `client/src/types/index.ts` · `client/src/types/__tests__/brush.test.ts` (new)
**Effort:** S

## Objective
After this task the client has a single, tested module defining what a brush document is
(`BrushDocument`, `BrushFrame`, `BrushLayer`, `BrushCell`, `BrushDelta`, `BrushChannelType`,
`BrushAppliedGroup`), the per-channel-type channel table, the delta→byte colourisation, cell→RGBA
colourisation, factories, an invariant checker, and a lenient normaliser for raw JSON. Every
later task imports its types from here.

## Context
- The pixel project's types live in `client/src/types/domain.ts` (`Pixel :1-9`, `PixelData :18-22`,
  `Layer :24-39`, `Frame :41-46`). **Do not modify that file** (task 03 owns it). The brush
  document is a separate type family — it never extends `Project`/`Layer`.
- `client/src/types/index.ts` is the barrel; add `export * from "./brush";`.
- `client/src/types/factories.ts:4-25` shows the factory style (`createEmptyPixelGrid`,
  `createDefaultLayer`). Copy the style, not the file.
- `client/src/types/__tests__/` holds the type tests; `roundtrip.test.ts` shows the vitest
  conventions (`describe/it/expect`, unit lane, no DOM).
- Data-safety: `types/` is on the corpus-sensitive list only because the codecs live there.
  You add a new file and one export line; the corpus digests must be unchanged (they will be —
  verify anyway).
- Naming: do **not** use `BrushShape`, `BrushShapeFn`, `isBrushTool` — they exist in
  `client/src/ui/canvas/tools/` and mean stroke geometry.

## Steps
1. Create `client/src/types/brush.ts` with a header comment naming this plan
   (`docs/01-brush-studio`) and containing exactly:
   ```ts
   export type BrushChannelType = "hsl" | "rgb" | "normal" | "heightmap";
   export const BRUSH_CHANNEL_TYPES: readonly BrushChannelType[] = ["hsl", "rgb", "normal", "heightmap"];
   export const BRUSH_CHANNELS: Record<BrushChannelType, readonly string[]> = {
     hsl: ["H", "S", "L", "A"], rgb: ["R", "G", "B", "A"], normal: ["X", "Y", "Z"], heightmap: ["H"],
   };
   export const BRUSH_CHANNEL_BADGE: Record<BrushChannelType, string> = { hsl: "HSL", rgb: "RGB", normal: "NRM", heightmap: "HGT" };
   export const BRUSH_DELTA_MIN = -255;
   export const BRUSH_DELTA_MAX = 255;
   /** Four signed deltas in −255..255. Unused slots (normal: index 3; heightmap: 1–3) are 0. */
   export type BrushDelta = [number, number, number, number];
   /** `0` = unpainted (renders transparent). */
   export type BrushCell = BrushDelta | 0;
   export interface BrushAppliedGroup { id: string; name: string }
   export interface BrushLayer { id: string; name: string; channelType: BrushChannelType; visible: boolean; appliedGroupId?: string; pixels: BrushCell[][] /* [y][x] */ }
   export interface BrushFrame { id: string; name: string; layers: BrushLayer[] }
   export const BRUSH_DOCUMENT_VERSION = "brush-1" as const;
   export interface BrushDocument { version: typeof BRUSH_DOCUMENT_VERSION; width: number; height: number; frames: BrushFrame[]; appliedGroups: BrushAppliedGroup[] }
   ```
   plus these functions (all pure, no imports beyond `./domain` for `Pixel`):
   - `clampDelta(v: number): number` — round, clamp to ±255, NaN → 0.
   - `deltaToByte(v: number): number` = `Math.max(0, Math.min(255, Math.round(127 + v / 2)))`.
   - `brushCellToRgba(cell: BrushCell, type: BrushChannelType): Pixel | null` per MASTER D5.
   - `createEmptyBrushGrid(width, height): BrushCell[][]` (rows of `0`).
   - `createBrushLayer(id, name, width, height, channelType: BrushChannelType = "rgb"): BrushLayer`.
   - `createBrushFrame(id, name, layers: BrushLayer[]): BrushFrame`.
   - `createBrushDocument(width = 16, height = 16): BrushDocument` — one frame `frame-1`
     "Frame 1" with one layer `layer-1` "Layer 1" (`rgb`), `appliedGroups: []`.
   - `assertUniformLayers(doc: BrushDocument): void` — throws `Error` if any frame's layer id
     sequence differs from frame 0's, or any layer grid is not `height` rows × `width` cells.
   - `normalizeBrushDocument(raw: unknown): BrushDocument | null` — returns `null` unless
     `raw` is an object with numeric `width/height ≥ 1` and a non-empty `frames` array; fills
     missing `appliedGroups` with `[]`, missing `visible` with `true`, unknown `channelType`
     with `"rgb"`, clamps every cell via `clampDelta`, pads/truncates grids to
     `height × width`, then calls `assertUniformLayers` and returns `null` if it throws.
2. Add `export * from "./brush";` to `client/src/types/index.ts` (keep the file's existing
   ordering/comment style).
3. Write `client/src/types/__tests__/brush.test.ts` covering: `deltaToByte` at −255/−100/0/100/255
   (expect 0, 77, 127, 177, 255); `brushCellToRgba` for each channel type and for `0`;
   `createBrushDocument` satisfies `assertUniformLayers`; `assertUniformLayers` throws on a
   frame with a missing layer and on a wrong-size grid; `normalizeBrushDocument` rejects
   `null`, `{}`, and `{width:0}`; accepts a document with missing `appliedGroups` and out-of-range
   cell values (clamped).
4. Run the verification below. Commit: `brush-studio(01): brush document types and colourisation`.

## Constraints
- No MobX, no store, no API imports — this is a pure types module.
- Do not touch `types/domain.ts`, `types/codecs/**`, `types/factories.ts`, `services/**`.
- Do not add a compact/wire codec; the in-memory shape is the wire shape (D3).

## Verification
```sh
cd client && bunx tsc --noEmit                      # clean
cd client && bunx eslint src/types                  # 0 errors
cd client && bunx vitest run src/types              # all pass; migrations/roundtrip digests unchanged
cd client && bun run lint:boundaries                # OK — all 5 boundary rules hold
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # no output
```
Paste the vitest summary line and confirm `migrations.test.ts` reported no snapshot diff.

## Definition of done
- [ ] `client/src/types/brush.ts` exists with every type/constant/function listed above.
- [ ] `types/index.ts` re-exports it.
- [ ] `brush.test.ts` passes with the listed cases.
- [ ] `bunx vitest run src/types` shows **0 snapshot mismatches** (no `-u` used).
- [ ] tsc, eslint, boundaries clean; no lockfile created.
- [ ] Committed with only the three Touches files staged.
