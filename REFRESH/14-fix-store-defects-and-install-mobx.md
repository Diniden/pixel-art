# 14 — Fix the three pre-existing store defects; install MobX and the store scaffolding

**Wave:** W8 · **Depends on:** 08, 13
**Touches:** `client/package.json` · `client/src/store/lightingActions.ts` · `client/src/store/projectActions.ts` · `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` (history/save calls only) · `client/src/stores/ApplicationStore.ts` (new) · `client/src/stores/context.ts` (new) · `client/src/stores/configure.ts` (new) · `client/src/stores/session/SessionStore.ts` (new) · `client/src/stores/bridge/zustandBridge.ts` (new) · `client/src/main.tsx` · `client/src/components/Header/Header.tsx` · `client/src/store/toolActions.ts` (`setAiServiceUrl` only) · `client/src/store/__tests__/` (flip the three BUG assertions)
**Effort:** L

## Objective

After this task the three silent-data-loss defects that predate the refresh are fixed against the **Zustand** store (so they can never be confused with migration regressions), MobX is installed, and the `ApplicationStore` skeleton with a real `SessionStore` and a one-directional bridge is running with `Header` as the first observer-driven consumer.

## Context

### Part A — the three pre-existing defects

These must be fixed **before** the store migration, not after. Silent data loss that predates the refactor would otherwise be attributed to the refactor, and vice versa. Task 08 pinned all three as `// BUG:` assertions naming this task; flip those assertions here, in the same commit as each fix.

**Defect 1 — 8 lighting setters silently never autosave.** `client/src/store/lightingActions.ts:11-129` writes `project` via raw `set({ project: {...project, uiState: {...}} })` instead of `updateProjectAndSave`. Verified: `lightingActions.ts` **does not import `services/autoSave` at all** — its only imports are `storeTypes`, `types`, and `utils/edgeInterpolate`. The 8 setters are:

`setStudioMode` (:15) · `setLightingDataLayerEditMode` (:31) · `setSelectedNormal` (:46) · `setLightDirection` (:61) · `setLightColor` (:76) · `setAmbientColor` (:91) · `setHeightBrushValue` (:106) · `setHeightScale` (:121)

Changing light colour, ambient colour, height scale, selected normal, light direction, studio mode, height brush value, or lighting-data edit mode mutates the project and **schedules no save**. The change survives only if some other action happens to fire within the session.

Fix: route all 8 through `updateProjectAndSave` with **`trackHistory = false`**. That value is deliberate — every other `uiState` writer in the codebase uses `false` (all 33 `toolActions` call sites do). Using `true` would silently add 8 new undo entries, which is a different behaviour change from the one being fixed.

**Defect 2 — `AIInterpolateModal` reimplements `updateProjectAndSave` and omits the history cap.** `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx:754-763` and `:841-850` call `useEditorStore.setState()` directly and hand-roll the `projectHistory` splice — **without** the `if (newHistory.length > MAX_HISTORY) newHistory.shift()` guard that `client/src/store/index.ts:72-74` applies. Repeated AI interpolation grows `projectHistory` **without bound**. The same code also dynamic-imports `scheduleAutoSave` and calls it directly at `:766-767` and `:853-854`, bypassing the store entirely.

Fix: replace both blocks with calls to a proper store action, so the `MAX_HISTORY` cap and the normal save path both apply. Do **not** change what the AI accept flow produces — only how it commits.

**Defect 3 — `renameCurrentProject` can save to the wrong file.** `client/src/store/projectActions.ts:111-129` does **not** call `cancelPendingSave()`, unlike its three siblings at `:58`, `:85`, `:141`, `:178`. A save scheduled under the old name within the 500 ms debounce window fires with the stale `pendingProjectName` **after** the server-side rename has happened.

Fix: add `cancelPendingSave()` to `renameCurrentProject`, matching the siblings.

### Part B — MobX installation

```sh
cd client
bun add --exact mobx@7.0.0 mobx-react-lite@5.0.0
```

`mobx-react-lite` **must be v5** — v4 pairs with mobx 6. v5's peers are `mobx ^7.0.0` and `react ^18 || ^19`, which matches the React 19.2.8 from task 03.

**Do not remove `zustand` yet.** `client/src/store/index.ts:1` is its sole importer and it stays live until the very last migration task. Removing it now breaks the build instantly.

### Part C — the store scaffolding

Target structure (later tasks fill in the rest):

```
client/src/stores/
  ApplicationStore.ts    root: constructs and wires children; hosts cross-store computeds
  context.ts             React context, Provider, typed hooks
  configure.ts           MobX strict-mode configuration
  session/SessionStore.ts
  bridge/zustandBridge.ts   TEMPORARY — deleted by the final migration task
```

`configure.ts`:

```ts
import { configure } from "mobx";
configure({
  enforceActions: "always",          // every observable write must be inside an action/flow
  computedRequiresReaction: true,
  reactionRequiresObservable: true,
  observableRequiresReaction: true,
  disableErrorBoundaries: false,
  safeDescriptors: true,
});
```

All five on in development and in tests. In production keep `enforceActions: "always"` (a correctness guarantee) and disable the three `*RequiresReaction` warnings — they only log, but they log on hot paths.

`observableRequiresReaction: true` will be **noisy** during the migration because the bridge reads observables from Zustand-land. Accept the noise: **every warning it emits marks a component that has not been migrated yet.** It is a free progress meter.

`context.ts`:

```ts
const StoreContext = createContext<ApplicationStore | null>(null);
export function StoreProvider({ store, children }: { store: ApplicationStore; children: ReactNode }) { … }
export function useStores(): ApplicationStore { /* throws if no provider */ }
export const useDomainStore  = () => useStores().domain;
export const useUIStore      = () => useStores().ui;
export const useSessionStore = () => useStores().session;
export const useHistoryStore = () => useStores().history;
```

**The store is constructed once, in `main.tsx`, and passed in. It is never a module-level singleton.** That is what lets Storybook and Vitest build a fresh instance per story and per test. Module-level singletons are exactly the defect that `services/autoSave.ts` and `ReferenceImageModal`'s `persistentState` both have today, and it is not carried forward.

`ApplicationStore` must take an **options object** (`{ api, autoSaveEnabled, historyBudgetBytes }`) so tests can disable auto-save and shrink budgets.

### Part D — `SessionStore` (five real tenants on day one)

There is no auth, no user, no profile, no login and no multi-user concept anywhere in `client/`, `server/` or `ai-service/`. `SessionStore` is nonetheless **not a placeholder** — it has five tenants immediately:

```ts
class SessionStore {
  // persistence health (moved from EditorState.saveStatus)
  saveStatus: SaveStatus = "idle";
  lastSaveError: ApiError | null = null;
  saveSuspended = false;             // set during rename/switch/delete flows

  // app-level configuration — the SINGLE READ SOURCE.
  // Note: it still ROUND-TRIPS to the persisted project file unchanged (owner
  // decision 2026-08-16); only the read source moves here.
  aiServiceUrl: string | null = null;
  aiConnection: "unknown" | "ok" | "unconfigured" | "error" = "unknown";

  // cross-project buffers (MUST survive project switch)
  layerClipboard: LayerClipboard | null = null;
  timelineCellClipboard: TimelineCellClipboard | null = null;

  // user preference trail
  colorHistory: Color[] = [];        // capped at MAX_COLOR_HISTORY = 10

  get isSaving() { return this.saveStatus === "saving"; }
  get canPaste()  { return this.layerClipboard !== null; }
  // NOT reset by project switch — this is the contract
}
```

| Tenant | Why SESSION |
| --- | --- |
| `saveStatus` (currently `EditorState`, `storeTypes.ts:80`; read **only** by `Header.tsx`) | It is the state of the app's link to its backend — not domain data, not view state. |
| `aiServiceUrl` (currently `uiState.aiServiceUrl`, `types/index.ts:193`, written by `toolActions.ts:488`) | App-level configuration for an external endpoint, so `SessionStore` is the right **read** source. It nevertheless **stays in the persisted project file** — see the note below. |
| `layerClipboard` / `timelineCellClipboard` (currently `EditorState`) | They **deliberately outlive the project** — nothing in `projectActions` clears them (verified: the `set()` calls at `:67`, `:95`, `:150` touch only `project`, `projectName`, `projectList`, `projectHistory`, `historyIndex`). `copyLayerFromObject` exists precisely to move layers between objects. Because this design's `UIStore` **is** project-scoped, leaving them in `UIStore` would silently break cross-project copy. |
| `colorHistory` (currently `EditorState`, capped at `MAX_COLOR_HISTORY = 10` per `storeTypes.ts:23`) | A cross-project preference trail, meaningless to any single view. |

**`colorHistory` is not persisted in this task.** Its `localStorage` hookup is separate follow-up work; placing it in `SessionStore` now simply avoids moving it twice.

### `aiServiceUrl` stays in the wire format — OWNER DECISION (2026-08-16)

**The owner decided that `uiState.aiServiceUrl` remains in the persisted project/wire format.** It is **not** removed, now or later. Therefore:

- `SessionStore` becomes the **single read source** for the value, adopting it from `compact.uiState.aiServiceUrl` on load.
- The value **round-trips to the project file exactly as it does today**. `toolActions.setAiServiceUrl` keeps writing through the bridge, `projectToCompact` keeps emitting it, and task 24's `toPersistedUIState()` emits `session.aiServiceUrl` back into `CompactUIState`.
- **There is now no deliberate wire-format change anywhere in this plan.** The persisted bytes are byte-identical end to end, and task 07's golden fixtures never need re-blessing.
- **Known, accepted consequence:** switching projects still repoints the AI endpoint, because the value is per-project. That is **existing behaviour, preserved deliberately** — it is *not* a bug to fix in this plan. It is filed as a follow-up note.

### Part E — the bridge

```ts
// client/src/stores/bridge/zustandBridge.ts   (TEMPORARY — deleted by the final migration task)
export function installBridge(app: ApplicationStore) {
  // Phase A (this task): MobX MIRRORS Zustand. Zustand is the source of truth.
  const disposeZ = useEditorStore.subscribe((s) => runInAction(() => {
    app.session.saveStatus = s.saveStatus;
    // ...only fields whose slice has NOT yet flipped
  }));

  // Phase B (a later task): Zustand mirrors MobX for not-yet-migrated consumers.
  // const disposeM = reaction(() => app.migratedSnapshot(),
  //   (snap) => useEditorStore.setState(snap, false));

  return () => { disposeZ(); };
}
```

**Bridge invariant, enforced by review:** a field is mirrored in exactly **one** direction at a time, and never has two writers. The task that flips a field's ownership also moves it from the Phase A list to the Phase B list **in the same change**. The bridge file's two explicit field lists are the migration's progress ledger. Add a dev-mode assertion that no field appears in both lists.

Every bridge write must be wrapped in `runInAction` — `enforceActions: "always"` makes an unwrapped write throw, and Zustand's `subscribe` callback runs outside any action.

Mirror `project` and pixel grids **by reference only**, never cloned.

### Part F — `Header` as the first consumer

`Header.tsx` is the **sole reader of `saveStatus`** and one of two readers of `aiServiceUrl`. Convert it to read those two values from `SessionStore` via `observer()`. Keep everything else in `Header` on Zustand for now.

Note: `observer` may only be imported from files under `client/src/containers/`. Task 05's ESLint rule enforces this. So this part creates `client/src/containers/HeaderContainer.tsx` as an `observer()` that reads the two session fields and passes them to `Header` as props. Keep the container minimal — the full `Header` purification is a later task.

## Steps

1. **Part A first, as three separate commits**, one per defect, each flipping the corresponding task-08 `// BUG:` assertion in the same commit.
2. Install `mobx@7.0.0` and `mobx-react-lite@5.0.0`. Do not remove `zustand`.
3. Create `client/src/stores/` with `configure.ts`, `context.ts` and `ApplicationStore.ts` (options-object constructor, `session` child, room for `domain`/`ui`/`history`).
4. Create `client/src/stores/session/SessionStore.ts` with the five tenants.
5. Create `client/src/stores/bridge/zustandBridge.ts` with the Phase A list and the dev-mode both-lists assertion.
6. Wire `StoreProvider` into `client/src/main.tsx`, constructing exactly one `ApplicationStore` and calling `installBridge`.
7. Create `client/src/containers/HeaderContainer.tsx` and route `saveStatus` and `aiServiceUrl` through it.
8. Add store unit tests under `client/src/stores/session/__tests__/`.

## Constraints

- **No lockfiles; pin exact versions.** Standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` is deliberate and must stay, the repo has no lockfile of any kind, and every dependency is written as an exact version in `package.json`. Every `bun add` in this task uses `--exact` (plain `bun add x@1.2.3` writes `"^1.2.3"`). Never create, commit or regenerate a lockfile; `--frozen-lockfile` is meaningless here.
- **Do not remove `zustand`.** It stays until the final migration task.
- **Do not move any field other than the five `SessionStore` tenants.** Everything else stays in `EditorState` for now.
- **Do not change the save payload.** `aiServiceUrl` is still emitted by `projectToCompact` and stays there permanently (owner decision, 2026-08-16); only the read source moves.
- `observer()` may only be imported inside `client/src/containers/` — task 05's ESLint rule enforces it and it must stay green.
- Do not deep-observe anything containing pixel data. No `makeAutoObservable` on `PixelData`, `Pixel`, `Normal`, `Layer`, `Frame` or `PixelObject` in this task — those come later with an explicit `observable.ref` contract.
- Preserve the 8 schema migrations: this task must not touch `client/src/types/` or `client/src/services/api.ts`.
- The three Part A fixes change user-visible behaviour (settings now persist; history is capped; a rename no longer races a save). Each must be verified manually.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/store/__tests__/       # the three flipped BUG assertions now assert correct behaviour
bunx vitest run src/stores/session         # new SessionStore tests
grep -q '"zustand"' package.json           # zustand must STILL be present
```

Manual checks — required:

1. **Lighting autosave (defect 1):** open the Lighting Studio, change light colour, ambient colour, height scale and selected normal, wait 2 s, hard-reload. **All four must persist.** They do not today.
2. **AI history cap (defect 2):** run AI interpolation 5×, then check `useEditorStore.getState().projectHistory.length` — it must be ≤ 100.
3. **Rename race (defect 3):** draw a pixel, then immediately rename the project within 500 ms. Confirm no file is written under the old name (`ls -la server/src/data/`).
4. **Clipboard cross-project survival:** copy a layer in project A, switch to project B, paste. **This must still work** — no automated test covers it and nothing in the code clears the clipboards on switch.
5. **AI URL:** set the AI service URL, switch projects, and confirm the behaviour is unchanged from before this task (the wire format has not moved yet).
6. **Save status:** trigger a save and confirm the header indicator still cycles `saving → saved → idle` with the 2 s delay.

## Definition of done

- [ ] All 8 lighting setters route through `updateProjectAndSave` with `trackHistory = false`, and lighting settings survive a reload.
- [ ] `AIInterpolateModal` no longer calls `useEditorStore.setState()` or imports `scheduleAutoSave`; `projectHistory` stays capped at `MAX_HISTORY`.
- [ ] `renameCurrentProject` calls `cancelPendingSave()`.
- [ ] The three corresponding task-08 `// BUG:` assertions were flipped, each in the same commit as its fix.
- [ ] `mobx@7.0.0` and `mobx-react-lite@5.0.0` installed; `zustand` **still present**.
- [ ] `stores/{ApplicationStore,context,configure}.ts` and `stores/session/SessionStore.ts` exist; the store is constructed in `main.tsx`, not as a module singleton; `ApplicationStore` takes an options object.
- [ ] `SessionStore` holds `saveStatus`/`lastSaveError`/`saveSuspended`, `aiServiceUrl`/`aiConnection`, both clipboards, and `colorHistory`.
- [ ] The bridge exists with explicit Phase A / Phase B field lists, all writes in `runInAction`, and a dev-mode assertion that no field is in both lists.
- [ ] `observer()` appears only under `client/src/containers/`; `bunx eslint .` exits 0.
- [ ] The save payload is unchanged (`aiServiceUrl` still emitted — it stays in the wire format permanently).
- [ ] All 6 manual checks performed and recorded.
