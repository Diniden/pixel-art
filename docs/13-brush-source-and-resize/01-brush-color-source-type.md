# 01 — `BrushLayer.colorSource`: the type, factories and normaliser

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/brush.ts` · `client/src/types/__tests__/brush.test.ts`
**Effort:** S

## Objective
A brush layer can declare where the pixel-studio Brush tool takes the colour its deltas
operate on: the **selected colour** (today's behaviour) or the **target pixel** already on
the canvas. The type family, the constant tables, `createBrushLayer` and
`normalizeBrushDocument` all know the field. Old brush files load unchanged. Nothing
consumes the field yet (tasks 02–06).

## Context
- `client/src/types/brush.ts` is the pure type module for brush documents (header `:1-17`).
  The pattern for an enum-ish field is `channelType`: union `:20`, list `BRUSH_CHANNEL_TYPES`
  `:21-26`, badge table `BRUSH_CHANNEL_BADGE` `:33-38`, guard `isChannelType` `:225-230`,
  default in `normalizeLayer` `:255-273`.
- The pattern for an **optional** field is `appliedGroupId`: declared `appliedGroupId?: string`
  on `BrushLayer` `:49-56`; `normalizeLayer` assigns the key **only when present and valid**
  (`:269-271`) — the key is omitted, never set to `undefined`. The store drops it with a
  destructure helper (`withoutAppliedGroup`, `BrushStructureStore.ts:134-138`).
- `normalizeBrushDocument` (`:310-337`) never reads `raw.version` — it always writes
  `"brush-1"`. There is **no migration chain and no version bump**: an additive optional field
  is the correct shape (MASTER D1).
- Test file `client/src/types/__tests__/brush.test.ts` imports through the `@/types` barrel
  (`:1-25`). Tests that pin the layer shape and must be extended, not rewritten:
  `createBrushLayer defaults to rgb and visible` `:141`, the JSON round-trip `:272`, the
  missing-fields test `:279`, the preserve-known-values test `:322`, ids-by-index `:396`.
- The six other files that build `BrushLayer` literals (listed in MASTER §4) must **keep
  compiling** — that is why the field is optional. Do not touch them.
- `client/src/types/**` is prettier-gated by `bun run format:check` (root `package.json`).

## Steps
1. In `types/brush.ts`, after `BRUSH_CHANNEL_BADGE`, add:
   ```ts
   /** Where the pixel-studio Brush tool takes the colour a layer's deltas operate on. */
   export type BrushColorSource = "selected" | "target";
   export const BRUSH_COLOR_SOURCES: readonly BrushColorSource[] = ["selected", "target"];
   export const BRUSH_COLOR_SOURCE_LABEL: Record<BrushColorSource, string> = {
     selected: "Selected colour",
     target: "Target pixel",
   };
   export const BRUSH_COLOR_SOURCE_BADGE: Record<BrushColorSource, string> = {
     selected: "SEL",
     target: "TGT",
   };
   /** The default when the key is absent — every pre-existing brush file. */
   export const DEFAULT_BRUSH_COLOR_SOURCE: BrushColorSource = "selected";
   ```
   Add `colorSource?: BrushColorSource;` to `BrushLayer` (after `appliedGroupId?`), with a
   doc comment: absent means `"selected"`; the key is present only when `"target"`.
   Add `export function brushLayerColorSource(layer: { colorSource?: BrushColorSource }): BrushColorSource`
   returning `layer.colorSource ?? DEFAULT_BRUSH_COLOR_SOURCE` (structural parameter so
   `ui/` scene layers can pass through it).
2. `createBrushLayer(id, name, width, height, channelType = "rgb", colorSource: BrushColorSource = "selected")`:
   set the key **only when `colorSource === "target"`** (so factory output stays
   byte-identical for the default and the JSON round-trip test `:272` is unaffected).
3. Add `isColorSource(v: unknown): v is BrushColorSource` next to `isChannelType`. In
   `normalizeLayer`, after the `appliedGroupId` block: `if (r.colorSource === "target") layer.colorSource = "target";`
   (anything else — absent, `"selected"`, garbage — leaves the key absent).
4. Tests (`brush.test.ts`): extend the channel-table test with a sibling
   `it("lists the two colour sources with labels and badges")`; extend `:141` to assert
   `colorSource` is **absent** by default (`"colorSource" in layer === false`) and present
   for `createBrushLayer(..., "rgb", "target")`; extend `:279` (missing → absent, and
   `brushLayerColorSource` returns `"selected"`), `:322` (preserves `"target"`), and add a
   case that `colorSource: "bogus"` and `colorSource: "selected"` both normalise to an
   absent key. Update the JSON round-trip test to include a `"target"` layer.
5. `cd client && bunx prettier --write src/types/brush.ts src/types/__tests__/brush.test.ts`.
   Commit: `brush-source(01): BrushLayer.colorSource type, factory param, normaliser`.

## Constraints
- Do not make the field required. Do not touch any other file.
- Do not add a `version` change or a migration. Do not edit `types/index.ts` unless the
  barrel does not already re-export `./brush` wholesale (check `export * from "./brush"`).
- No edits under `types/codecs/`, `services/`, `server/src/export/`, any `__snapshots__`.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/types && bunx vitest run src/types
bun run --cwd .. format:check
git status --short | grep __snapshots__   # must print nothing
```
Expected: tsc clean; `brush.test.ts` green with the new cases; `format:check` clean.

## Definition of done
- [ ] `BrushColorSource`, the three tables, `DEFAULT_BRUSH_COLOR_SOURCE`, `brushLayerColorSource`, `isColorSource` exported.
- [ ] `BrushLayer.colorSource?` optional; factory sets it only for `"target"`; normaliser copies only `"target"`.
- [ ] Every existing `brush.test.ts` case still passes unchanged in intent; new cases listed in step 4 exist.
- [ ] `bun run format:check` clean; no snapshot file changed.
