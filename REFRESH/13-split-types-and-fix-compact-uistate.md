# 13 — Split `types/index.ts` behind a barrel and complete `CompactUIState`

**Wave:** W7 · **Depends on:** 07
**Touches:** `client/src/types/index.ts` (becomes a barrel) · `client/src/types/domain.ts` (new) · `client/src/types/constants.ts` (new) · `client/src/types/factories.ts` (new) · `client/src/types/codecs/pixel.ts` (new) · `client/src/types/codecs/compactTypes.ts` (new) · `client/src/types/codecs/serialize.ts` (new) · `client/src/types/codecs/deserialize.ts` (new) · `client/src/types/codecs/migrate.ts` (new) · `client/src/types/__tests__/` (update imports only)
**Effort:** M

## Objective

After this task the 1,086-line `types/index.ts` is split along its natural seam into domain types, constants, factories and codecs, with `index.ts` remaining a barrel so all ~35 importers keep working unchanged. The three `UIState` fields that are silently dropped on save are declared on `CompactUIState`. The wire format is byte-identical and every migration behaves identically.

## Context

**Ownership note:** two audits proposed work on this file — one wanted it split by responsibility, the other wanted the serializers moved out. **This task owns both**, because they are the same cut and doing them separately means editing the same 1,086 lines twice.

### The seam is exact

Lines **1-517** are domain types, constants and factories. Lines **519-1086** are the compact serialization format. That is a clean boundary with no interleaving.

| New file | Source lines | Contents |
| --- | --- | --- |
| `types/domain.ts` | 1-235 | `Pixel`, `Normal`, `PixelData`, `Layer`, `Frame`, `Variant`, `VariantGroup`, `VariantFrame`, `PixelObject`, `Color`, `Palette`, `Project`, `UIState`, `Tool`, `SelectionBox`, `Point` |
| `types/constants.ts` | 236-292, 344-459 | `DEFAULT_*`, `EMPTY_PIXEL_DATA`, `DEFAULT_UI_STATE`, `BASE_PALETTES` |
| `types/factories.ts` | 293-343, 460-484 | `createEmptyPixelGrid`, `createDefaultLayer/Frame/Object/Project`, `generateId` |
| `types/codecs/pixel.ts` | 485-543 | `rgbaToHex`, `hexToRgba`, `normalToPacked`, `packedToNormal`, `pixelDataToCompact`, `compactToPixelData` |
| `types/codecs/compactTypes.ts` | 544-684 | every `Compact*` interface |
| `types/codecs/serialize.ts` | 685-772 | `layerToCompact`, `variantGroupsToCompact`, `projectToCompact` |
| `types/codecs/deserialize.ts` | 773-1015 | `compactToLayer`, `compactToVariantGroups`, `compactToProject` |
| `types/codecs/migrate.ts` | 843-866, 1016-1086 | `migrateLayerVariantOffset`, `isCompactFormat`, `isLegacyCompactFormat`, `migrateLegacyPixel`, `migrateLegacyLayer` |

`types/index.ts` becomes a barrel that re-exports **all 57 exported symbols**. About 35 files import from `"../types"` today and none of them may need to change.

### The `CompactUIState` completeness fix

`CompactUIState` (`types/index.ts:612-663`) is missing three fields that `UIState` has and that `projectToCompact` nonetheless writes, because it spreads `...project.uiState` at line 754 — bypassing TypeScript's excess-property checking:

| Field | Declared in `UIState` at | Consequence today |
| --- | --- | --- |
| `referenceImagePanelPosition` | `:171` | Panel geometry does not reliably survive a reload |
| `referenceImagePanelMinimized` | `:172` | Same |
| `layerSelectionCounter` | `:153` | Read by `FrameTimeline.tsx` to detect re-selection of the same layer; does not reliably survive a reload |

(`lightGridMode` was the fourth; task 02 already declared it.)

Declaring them is **additive and backward-compatible** — the fields are already being written to disk. But **task 07's golden snapshots will flag the newly-declared keys**, and those expectations must be updated **deliberately, one file at a time, with each diff read by a human** — never with `vitest -u`.

### What must not change

**The wire format is a hard contract.** `server/src/data/` holds the owner's real 1.1 MB project plus gzipped backups spanning Jan–Jul 2026, and the server stores compact JSON directly. Preserve verbatim:

- The `[colorHex, normalPacked, height]` pixel tuple and the `0`-for-empty-pixel elision. This is what keeps a 300,249-cell project at 1.1 MB instead of ~30 MB.
- All the migration detectors, transforms and their **order**: `isCompactFormat`, `isLegacyCompactFormat`, `migrateLegacyPixel`, `migrateLegacyLayer`, `migrateLayerVariantOffset`, the variant-frame `offset` → `baseFrameOffsets` back-fill inside `compactToVariantGroups` (`:806-825`), and the object→project variant migration inside `compactToProject` (`:867-938`).
- The ~20 field-level defaults applied unconditionally in `compactToProject`'s `uiState` block (`:961-1007`).

**In particular: `compactToProject` contains a second, independent implementation of the object→project variant migration** (lines 867-938) that differs from the one in `services/api.ts:112-145` — the `types/index.ts` copy *additionally* rewrites each variant layer's `variantOffsets` from `baseFrameOffsets[frameIndex]` at line 917. Task 07 pinned that difference with a test. **Move it verbatim into `codecs/deserialize.ts`. Do not reconcile the two implementations here** — that is a semantic change and it is filed as an open question.

**And remember why this matters twice over:** `compactToProject(projectToCompact(p))` is not only the save/load path, it is **the deep-clone used for undo** (`store/index.ts:63-64`, `:96-97`; `projectActions.ts:182-183`, `:216-217`). A field lost in the round trip is lost on undo, not just on reload.

## Steps

1. Run task 07's suites and record them green as the starting point:
   ```sh
   cd client && bunx vitest run src/types/__tests__/
   ```
2. Create the new files and **move code verbatim**, one file per commit so a regression is bisectable. Do not reformat, do not reorder within a moved block, do not rename anything.
3. Rewrite `types/index.ts` as a pure barrel: `export * from "./domain"` etc., plus any explicitly-named re-exports needed to preserve the exact public surface. Verify all 57 symbols are still exported.
4. Run `bunx tsc --noEmit` — if any of the ~35 importers breaks, the barrel is incomplete. Fix the barrel, not the importer.
5. Add the three missing fields to `CompactUIState` in `codecs/compactTypes.ts`.
6. Re-run task 07's suites. Golden snapshots **will** now differ by exactly those three keys. Review each diff by eye, confirm the only change is the newly-declared keys appearing where they were already being written, and update the expectations deliberately. Note in the commit message which snapshots changed and why.
7. Update the imports inside `client/src/types/__tests__/` to point at the new module paths (the tests themselves must not change their assertions).

## Constraints

- **Move verbatim. Fix nothing while moving.** If a bug is spotted, note it and leave it.
- **Do not reconcile the two object→project variant migration implementations.** Both must still exist after this task.
- **Do not change any migration's detector, transform, ordering, or default value.**
- Do not change the pixel tuple format or the empty-pixel elision.
- **Never run `vitest -u`.** Every snapshot change is a change to real user data and must be read by a human.
- Do not touch `client/src/store/`, `client/src/services/api.ts`, or any component. Their imports resolve through the barrel and must not need editing.
- Do not run Prettier on the moved files (Sweep B, later, covers them).

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build     # all exit 0
bunx vitest run src/types/__tests__/                     # exit 0
bunx vitest run                                          # full suite exit 0
# The barrel is complete — no importer had to change:
git diff --name-only | grep -v '^client/src/types/' | grep -E '\.tsx?$' && echo "UNEXPECTED non-types file changed"
# Round-trip and idempotency still hold over the whole corpus:
bunx vitest run src/types/__tests__/migrations.test.ts
```

Manual checks:
1. **Wire-format stability, byte level.** Copy `server/src/data/Base Unit.json` aside, make one small edit in the running app, wait for the save, then compare the saved file to the copy. The only differences permitted are the edited field and the three newly-declared `uiState` keys.
2. Load a **legacy** project from the task-07 corpus in the running app and confirm the object, frame, layer and variant counts match the values the corpus README recorded.
3. Move and minimise the reference-image panel, then reload — position and minimised state must now persist (they do not today).
4. Click the same layer twice in the timeline and reload — confirm `layerSelectionCounter` behaviour survives.

## Definition of done

- [ ] `types/index.ts` is a barrel re-exporting all 57 symbols; no file outside `client/src/types/` needed an import change.
- [ ] The 8 new modules exist and contain verbatim moves of the line ranges in the Context table.
- [ ] `referenceImagePanelPosition`, `referenceImagePanelMinimized` and `layerSelectionCounter` are declared on `CompactUIState`.
- [ ] Task 07's suites pass; every changed golden snapshot was reviewed by eye and the change is limited to the three newly-declared keys.
- [ ] `vitest -u` was **not** used.
- [ ] Both object→project variant migration implementations still exist, unreconciled.
- [ ] No migration detector, transform, order or default value was changed.
- [ ] The byte-level wire-format check was performed and its result recorded.
