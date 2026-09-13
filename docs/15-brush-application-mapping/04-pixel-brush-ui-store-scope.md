# 04 — `PixelBrushUIStore.applyScope`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/PixelBrushUIStore.ts` · `client/src/stores/ui/__tests__/PixelBrushUIStore.test.ts`
**Effort:** S

## Objective
`app.ui.pixelBrush.applyScope` (`"object" | "brush"`, default `"object"`) records which level the
rail's Application block is editing, with `setApplyScope(scope)` and a reset in `resetAll()`. It is
**session-only** and nothing about persistence changes.

## Context
- `client/src/stores/ui/PixelBrushUIStore.ts` (179 lines): observables `width/height/lockRatio/lockedRatio/scaleX/scaleY`
  (`:69-77`), `makeObservable` annotations (`:81-93`), actions `setWidth … resetSize`, `resetAll()` (`:173-178`).
  Module exports `PIXEL_BRUSH_MAX_SIZE`, `PixelBrushNativeSize`, `PixelBrushAxis`, `pixelBrushSliderMax`.
- Mounted at `UIStore.ts` (import `:115`, field `:264`, `new PixelBrushUIStore()` `:358`) — **not** part of
  `toPersistedUIState()`; `client/src/stores/ui/__tests__/persistedUIState.test.ts` proves no key was
  added (it parses `CompactUIState` from source and compares against a fully-populated project). Do not
  touch `UIStore.ts`.
- Test file `client/src/stores/ui/__tests__/PixelBrushUIStore.test.ts` (286 lines): describes at `:35`
  (defaults), `:232` (resets). Add there.
- Pattern: MobX class store, `makeObservable` with explicit annotations, one action per setter.
  `stores/ui/**` never imports `stores/domain/**`.

## Steps
1. Add `export type PixelBrushApplyScope = "object" | "brush";` and the observable
   `applyScope: PixelBrushApplyScope = "object";` with the annotation; `setApplyScope(scope)` (no-op
   when equal); `resetAll()` sets it back to `"object"`. Header comment: session-only, the same
   justification as the size fields (persisting would add a key to all 151 corpus digests).
2. Tests: default is `"object"`; `setApplyScope("brush")` flips it; `resetAll()` restores it;
   `resetSize()` does **not** touch it.
3. Run `bunx vitest run src/stores/ui` — including `persistedUIState.test.ts` and
   `persistedUIVersion.test.ts`, which must stay green **unchanged**.
4. Commit: `brush-apply(04): PixelBrushUIStore.applyScope (session-only)`.

## Constraints
- Do not touch `UIStore.ts`, `persistedUIState.test.ts`, `persistedUIVersion.test.ts`, `types/**`.
- No new import into the store; the scope type is declared locally (the UI layer declares its own
  identical union in task 05 — the container bridges them).

## Verification
```sh
cd client && bunx vitest run src/stores/ui                   # green, persisted-state suites unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores/ui  # clean
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none.

## Definition of done
- [ ] `applyScope`, `setApplyScope`, `PixelBrushApplyScope` exported; `resetAll` resets it.
- [ ] Four new tests green; persisted-UI suites untouched and green.
- [ ] One commit `brush-apply(04):`; no lockfile.
