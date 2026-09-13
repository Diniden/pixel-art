# 01 — Brush-level apply defaults on the wire

**Wave:** W1 · **Depends on:** none (requires plan 14 merged — see MASTER pre-flight)
**Touches:** `client/src/types/brush.ts` · `client/src/types/__tests__/brush.test.ts`
**Effort:** S

## Objective
A brush layer can carry `applyDelta?: number` and a brush frame `applyTo?: number[]` — the brush's
default application mapping — with helpers that resolve the defaults, a normaliser that accepts, cleans
or drops the keys, and the guarantee that a brush which never set them round-trips **byte-identically**
(no key appears). Nothing else in the app reads them yet.

## Context
- `client/src/types/brush.ts` is the brush wire format: in-memory shape **is** the JSON on disk (header
  lines 1-17), no codec, no migration. After plan 14 the file exports `Brush`, `BrushDocument`
  (`brush-2`), `brushIn`, `normalizeBrush(raw, index)`, `assertBrushDocument`, `assertUniformLayers(brush)`.
- The optional-key precedent is `colorSource` (MASTER D1 names the lines pre-14): `BrushLayer.colorSource?`
  with its additive-key comment; `createBrushLayer` writes the key **only** for `"target"`;
  `normalizeLayer` keeps it only for the literal `"target"`; `brushLayerColorSource(layer)` resolves the
  default. Copy this shape for `applyDelta`. `BrushFrame { id; name; layers }` has no optional key yet —
  `createBrushFrame(id, name, layers)` and `normalizeFrame(raw)` are the two places to extend.
- `normalizeFrame` today receives no index. `applyTo`'s default depends on the frame index (`[index]`),
  so `normalizeFrame(raw, index)` must be passed the index by its caller (`normalizeBrush`'s `frames.map`).
- `assertUniformLayers` compares layer **ids and order** across frames; `applyDelta` lives on every
  frame's copy of a layer (as `colorSource` does) and does not affect the invariant.
- `client/src/types/__tests__/brush.test.ts` (517 lines pre-14) pins: factories (`describe :159`),
  `assertUniformLayers` (`:225`), `normalizeBrushDocument` (`:282`) including the **byte-identical
  round trip** at `:310-321` which asserts `"colorSource" in layer === false`. Plan 14 will have moved
  these to brush-2 fixtures; keep its fixture helpers.
- Pattern: pure TypeScript module, no MobX. `bun run format:check` (Prettier) covers `client/src/types/**`.

## Steps
1. Add to `brush.ts`, next to the other constants: `export const BRUSH_APPLY_DELTA_MAX = 64;`.
2. Extend `BrushLayer` with `applyDelta?: number;` and `BrushFrame` with `applyTo?: number[];`, each with
   a comment in the `colorSource` style: "present only when non-default; absent ⇔ 0 / ⇔ [frameIndex]; a
   pre-plan-15 file round-trips byte-identically".
3. Add the helpers (exact signatures in MASTER §3 type block):
   - `normalizeDeltaList(list)`: filter `Number.isInteger` and `|v| ≤ BRUSH_APPLY_DELTA_MAX`, dedupe,
     sort ascending, return a **new** array.
   - `isDefaultApplyTo(list, frameIndex)`: `list.length === 1 && list[0] === frameIndex`.
   - `brushLayerApplyDelta(layer)`: `layer.applyDelta ?? 0`.
   - `brushFrameApplyTo(frame, frameIndex)`: `frame.applyTo ? [...frame.applyTo] : [frameIndex]`.
4. `createBrushLayer` / `createBrushFrame`: **do not** write either key (defaults are absent). Commit
   after step 4: `brush-apply(01): applyDelta/applyTo types and helpers`.
5. `normalizeLayer`: keep `applyDelta` iff `Number.isInteger(v) && v !== 0 && Math.abs(v) ≤ 64`; anything
   else leaves the key absent.
6. `normalizeFrame(raw, index)`: if `raw.applyTo` is an array, `list = normalizeDeltaList(raw.applyTo.filter(n => typeof n === "number"))`;
   keep `applyTo: list` iff `!isDefaultApplyTo(list, index)`; a non-array leaves the key absent. Pass the
   index from `normalizeBrush`'s `frames.map((f, i) => normalizeFrame(f, i))`.
7. Tests in `brush.test.ts`:
   - helpers: `normalizeDeltaList([3, -1, 3, 0.5, 99])` → `[-1, 3]`; `isDefaultApplyTo([2], 2)` true,
     `([0, 2], 2)` false, `([], 0)` false; `brushFrameApplyTo({}, 3)` → `[3]`; `brushLayerApplyDelta({})` → 0.
   - factories write neither key (`"applyDelta" in layer === false`, `"applyTo" in frame === false`).
   - round trip: a factory document through `JSON.parse(JSON.stringify())` + `normalizeBrushDocument`
     has **no** `applyDelta`/`applyTo` anywhere (extend the existing byte-identical test).
   - normaliser keeps `applyDelta: -1`, drops `applyDelta: 0`, drops `1.5`, drops `65`, drops `"x"`;
     keeps `applyTo: [0, 1, 2]` on frame 0, **drops** `applyTo: [1]` on frame index 1 (default), keeps
     `applyTo: []`, sorts/dedupes `[2, 0, 2]` → `[0, 2]`, drops non-integers from the list, drops a
     non-array.
   - `assertUniformLayers` still passes when `applyDelta` differs between frames' copies (it is not part
     of the invariant) — one assertion.
   Commit after step 7: `brush-apply(01): normaliser + tests for apply defaults`.

## Constraints
- Do not touch `types/index.ts`, `types/domain.ts`, `codecs/**` (task 02 owns them this wave).
- Do not change any existing export's signature except `normalizeFrame` (internal, gains `index`).
- Never write `applyDelta: undefined` / `applyTo: undefined` — absent means absent.
- No store, no MobX, no React.

## Verification
```sh
cd client && bunx vitest run src/types        # all green; the corpus digests unchanged
cd client && bunx tsc --noEmit                 # clean
cd client && bunx eslint src/types             # 0 errors
cd .. && bun run format:check                  # clean
git status --porcelain | grep __snapshots__    # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Manual: none (pure module).

## Definition of done
- [ ] `BRUSH_APPLY_DELTA_MAX`, `applyDelta?`, `applyTo?`, the four helpers exported with the MASTER signatures.
- [ ] Factories write neither key; the byte-identical round-trip test asserts their absence.
- [ ] Normaliser rules of D1 pinned by tests (keep / drop / default-drop / sort / dedupe / clamp).
- [ ] `bunx vitest run src/types` green, snapshots untouched, format clean, tsc clean.
- [ ] Two commits with the `brush-apply(01):` prefix; no lockfile.
