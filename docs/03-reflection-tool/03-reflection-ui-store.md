# 03 — `ReflectionUIStore` and `ApplicationStore` wiring

**Wave:** W1 · **Depends on:** none (uses the `ReflectionLine` *shape*; declare it locally as a structural type until task 02 lands — see Constraints)
**Touches:** `client/src/stores/ui/ReflectionUIStore.ts` (new) · `client/src/stores/ui/__tests__/ReflectionUIStore.test.ts` (new) · `client/src/stores/ApplicationStore.ts`
**Effort:** M

## Objective
`app.reflection` holds the committed reflection lines and the in-flight draft line as
session-only MobX state. Lines survive layer/frame/object switches, are cleared when a
different project is installed, are never persisted, never enter history, and never
schedule a save.

## Context
- Pattern to copy: `client/src/stores/ui/CanvasCameraStore.ts` (82 lines, observableRef +
  actions) and `CanvasViewsUIStore.ts` (107 lines, header convention with the
  `⚠️ NOTHING HERE IS PERSISTED` banner). Test pattern:
  `stores/ui/__tests__/CanvasViewsUIStore.test.ts` — bare `new Store()`, `runInAction`
  around every mutation (`enforceActions: "always"`), and the "observable AS A REF: the
  value is NOT a proxy" assertion.
- Wiring template: the **uncommitted** hunks in `git diff client/src/stores/ApplicationStore.ts`
  that add `CanvasViewsUIStore` (import, `readonly canvasViews`, `new` after
  `canvasInteraction` at ~`:493`). Add `readonly reflection: ReflectionUIStore` the same
  way. Construction order is unconstrained for a non-persisted store (comment at
  `ApplicationStore.ts:378-382`).
- **Not persisted = absent from `UIStore.toPersistedUIState()` (`stores/ui/UIStore.ts:345-512`).**
  Do not add a key there; `persistedUIState.test.ts` would fail and the 151-snapshot
  corpus would drift.
- **Project scoping (locked D6):** there is no reset hook on UI stores. `DomainStore.loadGeneration`
  (`stores/domain/DomainStore.ts:209`, observable, bumped once per fresh install —
  init/load/create/switch/delete, **not** undo restore) is the signal. In the
  `ApplicationStore` constructor add
  `this.disposeReflectionReaction = reaction(() => this.domain.loadGeneration, () => this.reflection.clear())`
  and dispose it in `ApplicationStore.dispose()` (`:1654`). Do **not** hook
  `adoptProject()` — it also runs on snapshot undo/redo and would wipe lines on undo.
- Keep `ApplicationStore.ts` edits minimal: import, field + doc block, `new`, reaction,
  dispose line.

## Steps
1. Create `ReflectionUIStore.ts`:
   ```ts
   export interface ReflectionLine { id: string; x1: number; y1: number; x2: number; y2: number }
   export class ReflectionUIStore {
     lines: ReflectionLine[] = [];          // observableRef, replaced wholesale
     draft: ReflectionLine | null = null;   // observableRef
     get hasLines(): boolean                // computed
     addLine(line: Omit<ReflectionLine, "id">): ReflectionLine | null  // null when degenerate or at cap (8)
     addLines(lines: readonly Omit<ReflectionLine,"id">[]): void       // presets; respects cap, skips degenerate
     removeLine(id: string): void
     clear(): void
     beginDraft(x: number, y: number): void   // draft = {x1:x,y1:y,x2:x,y2:y}
     updateDraft(x: number, y: number): void  // replaces draft wholesale
     commitDraft(): ReflectionLine | null     // adds unless degenerate; always clears draft
     cancelDraft(): void
   }
   ```
   Ids: `\`refl-${counter++}\`` (module-level counter; no crypto dependency).
   Degenerate = `x1===x2 && y1===y2`. Header must state: session-only, not persisted,
   never history, never save, observableRef contract, cleared on `loadGeneration`.
2. Tests: defaults; add/remove/clear; cap at 8; degenerate rejected; draft lifecycle;
   `lines` is a ref (not a proxy) and each mutation produces a **new array identity**;
   `commitDraft` on a degenerate draft returns null and clears the draft.
3. Wire into `ApplicationStore` (field, construction, `loadGeneration` reaction, dispose).
   Add one integration test in the same test file or `stores/__tests__/` **only if** an
   existing test already constructs `ApplicationStore` cheaply (e.g. `stores/__tests__/computeds.test.ts`)
   — otherwise assert the reaction by constructing the store the way that file does and
   bumping `loadGeneration` via `runInAction`. If neither is feasible in < 30 min, state
   so in HANDOFF and cover it in task 08's manual check (switch project → lines gone).
4. Commit: `feat(stores): ReflectionUIStore, cleared on project install`.

## Constraints
- ⚠️ `ApplicationStore.ts` currently carries **uncommitted hunks from plan 02** (split
  canvas). Stage only your own hunks (`git add -p`) and leave the others in the tree;
  never revert them. If plan 02 W1 has been committed by the time you run, this caveat
  is moot.
- Do not import from `ui/canvas/model/reflection.ts` (task 02, same wave). Declare the
  structural `ReflectionLine` interface locally; task 07 reconciles types (they are
  structurally identical, so no cast is needed).
- Do not touch `UIStore.ts`, `SessionStore.ts`, `DomainStore.ts`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/stores 2>&1 | tail -8   # all green, incl. persistedUIState.test.ts unchanged
cd client && bun run lint:boundaries
git diff --stat client/src/stores/ApplicationStore.ts    # your hunks only in the commit
```

## Definition of done
- [ ] `app.reflection` exists; store tests green (≥ 10 cases).
- [ ] `persistedUIState.test.ts`, `persistedUIVersion.test.ts`, corpus tests unchanged and green.
- [ ] `loadGeneration` reaction present and disposed in `dispose()`.
- [ ] No key added to `toPersistedUIState()`.
