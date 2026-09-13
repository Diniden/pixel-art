# 05 — Types: `Brush` + brush-2 document + legacy normaliser

**Wave:** W2 · **Depends on:** none (codes to MASTER §3's type block; W1 must be DONE so the rename is in place)
**Touches:** `client/src/types/brush.ts` · `client/src/types/__tests__/brush.test.ts`
**Effort:** M

## Objective
`client/src/types/brush.ts` defines the brush-2 wire shape: `Brush` (today's document body plus `id`/`name`) and `BrushDocument { version: "brush-2"; brushes: Brush[] }`, with factories, the `brushIn` resolver, the two invariants, and a normaliser that accepts brush-2 **and** wraps a legacy brush-1 file as one brush. The type suite pins every rule, including a byte-level legacy round trip. This opens the W2 seam: the stores and containers stop compiling until W3/W4 (MASTER §8 lists exactly what may be red).

## Context
Current file (≈400 lines): `BrushDocument :86-92`; `createBrushLayer :177`; `createBrushFrame`; `createBrushDocument :200` (fixed ids `frame-1`/`layer-1`); `assertUniformLayers :222` (destructures `width, height, frames` at `:223`, throws on mismatched ids or grid sizes); private normaliser helpers `isRecord`, `isChannelType`, `isColorSource :270`, `normalizeCell`, `normalizeGrid`, `stringOr`, `normalizeLayer` (drops `colorSource` unless `"target"`, `:318`), `normalizeFrame`, `normalizeAppliedGroups`; `normalizeBrushDocument :357-382` (rejects non-object, non-numeric or `< 1` `width`/`height`, empty `frames`; floors dimensions; builds the literal; `assertUniformLayers` in try/catch → `null`). `generateId` lives in `types/factories.ts:70`; `types/index.ts:13` does `export * from "./brush"`.

The test suite `brush.test.ts` (30 tests): `createBrushDocument()` defaults `:203`, `(3,5)` `:218`, a hand-built two-frame doc `:226-240`, the normaliser suite `:282+` including "rejects null, {}, and {width:0}" `:283`, plan 13's `colorSource` round-trip cases.

### The locked block (MASTER §3), to implement exactly

```ts
export interface Brush {
  id: string;
  name: string;
  width: number;
  height: number;
  frames: BrushFrame[];
  appliedGroups: BrushAppliedGroup[];
}
export const BRUSH_DOCUMENT_VERSION = "brush-2" as const;
export const LEGACY_BRUSH_DOCUMENT_VERSION = "brush-1" as const;
export interface BrushDocument {
  version: typeof BRUSH_DOCUMENT_VERSION;
  /** Never empty; ids unique. */
  brushes: Brush[];
}
export function createBrush(id: string, name: string, width = 16, height = 16): Brush;
export function createBrushDocument(width = 16, height = 16, name = "Brush 1"): BrushDocument;
export function brushIn(doc: BrushDocument | null, brushId: string | null): Brush | null;
export function assertUniformLayers(brush: Brush): void;
export function assertBrushDocument(doc: BrushDocument): void;
export function normalizeBrushDocument(raw: unknown): BrushDocument | null;
```

Semantics:
- `createBrush(id, name, w, h)` = today's `createBrushDocument` body (one frame `frame-1`/"Frame 1", one layer `layer-1`/"Layer 1", rgb, `appliedGroups: []`) plus `id`/`name`. `createBrushDocument(w, h, name)` = `{ version: "brush-2", brushes: [createBrush("brush-1", name, w, h)] }`.
- `brushIn(doc, id)`: `null` doc → `null`; find by id; else `doc.brushes[0]`; else `null`. Returns the object from `doc`, not a copy (the `selectedFrameIn` convention).
- `assertUniformLayers(brush)`: identical body to today, over `brush.width/height/frames`. Error messages may keep their wording.
- `assertBrushDocument(doc)`: throws on `brushes.length === 0` ("Brush document has no brushes"), on a duplicate id ("Brush document has duplicate brush id <id>"), then calls `assertUniformLayers` on each brush.
- `normalizeBrushDocument(raw)` (MASTER D2): non-object → `null`. If `Array.isArray(raw.brushes)`: map each entry through a new `normalizeBrush(raw, index)` — the current document rules applied to the entry (`width`/`height` numeric ≥ 1 else the **whole document** is `null`; `frames` non-empty array else `null`; `id: stringOr(r.id, "brush-<i+1>")`, `name: stringOr(r.name, "Brush <i+1>")`; frames/appliedGroups through the existing helpers) — then `assertBrushDocument` in try/catch → `null`. Else if `raw.brushes` is absent **and** `raw.width`, `raw.height`, `raw.frames` look like a document (the same checks): **legacy** — `{ version: "brush-2", brushes: [normalizeBrush(raw, 0)] }`, which yields `id: "brush-1"`, `name: "Brush 1"` (a legacy object has neither key). Else `null`. `version` is never read (unchanged policy: the normaliser is lenient about the string and strict about the structure).
- Everything below `Brush` — `BrushFrame`, `BrushLayer`, `BrushCell`, `BrushDelta`, `BrushAppliedGroup`, `colorSource`, `brushCellToRgba`, `clampDelta`, `deltaToByte`, the channel tables — is untouched.

## Steps
1. Add `Brush`, the two version constants, the new `BrushDocument`; write `createBrush`, rewrite `createBrushDocument`, add `brushIn`.
2. Re-type `assertUniformLayers` to `Brush`; add `assertBrushDocument`.
3. Split the normaliser: `normalizeBrush(raw, index)` (the old document body + id/name) and the new `normalizeBrushDocument` with the brush-2 branch, the legacy branch and the rejection paths above. Update the module header (`:1-17`) to describe the two-level shape and the legacy wrap.
4. Update `brush.test.ts`: every existing case moves to the new shape (`createBrushDocument().brushes[0].width` etc.). Add: `createBrush` defaults and ids; `createBrushDocument(w, h, name)` one brush `"brush-1"`; `brushIn` (by id, fallback to first, `null` for null doc / empty); `assertBrushDocument` rejects empty, duplicate ids, a non-uniform brush; normaliser: brush-2 with two brushes round-trips; missing brush `id`/`name` get `brush-N`/`Brush N`; a second brush with `width: 0` → whole doc `null`; duplicate ids → `null`; `brushes: []` → `null`; **legacy**: a hand-written brush-1 object with two frames, an `hsl` layer, a `"target"` colour source, an applied group, and specific cell values normalises to one brush `"brush-1"`/"Brush 1" whose `frames`/`appliedGroups` deep-equal the direct normalisation of the same object as a brush-2 entry — and, crucially, `JSON.stringify(normalize(legacy).brushes[0].frames) === JSON.stringify(legacy.frames)` for a legacy input that is already clean (byte-identical wrap, R1); `{ brushes: "x", width: 4, height: 4, frames: [...] }` → `null` (a present-but-wrong `brushes` is not legacy).
5. Run the verification. Commit: `multi-brush(05): brush-2 document — many brushes per file, legacy brush-1 wrapped`.

## Constraints
- Do not touch `types/index.ts`, `types/domain.ts`, `types/factories.ts`, `types/codecs/**`, `services/**`.
- `client/src/types/**` is Prettier-gated — run `bun run format:check` from the root.
- The corpus suites (`src/types/__tests__/` other files) do not import `brush.ts`, but they must still pass unchanged — copy `client/src/test/__fixtures__/corpus/*.json` from the launch checkout if absent (MASTER R7).
- Do **not** fix the compile errors this task creates in stores/containers — W3/W4 own them.

## Verification
```sh
cd client && bunx vitest run src/types && bunx eslint src/types
cd .. && bun run format:check
cd client && bunx tsc --noEmit 2>&1 | grep -oE "^src/[^(]+" | sort -u        # paste this list
cd .. && git status --porcelain | grep __snapshots__ ; echo "exit $?"          # exit 1
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules            # prints nothing
```
Expected: `src/types` suites green (the 3 corpus files / 139 tests unchanged; `brush.test.ts` ~30 → ~45); format:check clean; the tsc file list is a **subset** of MASTER §8's W2 seam list — paste it verbatim; no snapshot change.

Manual: none.

## Definition of done
- [ ] The locked block is implemented with the semantics above; nothing below `Brush` changed.
- [ ] Legacy wrap pinned byte-identically; brush-2 rejection paths pinned.
- [ ] `src/types` green, format:check clean, corpus unchanged, snapshot check clean.
- [ ] The tsc file list is pasted in the report and is within the W2 seam.
