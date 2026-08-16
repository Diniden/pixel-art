# 16 — `DomainStore` load lifecycle, `AutoSaveController`, and the load-state gate

**Wave:** W10 · **Depends on:** 15
**Touches:** `client/src/stores/domain/DomainStore.ts` (new) · `client/src/stores/session/AutoSaveController.ts` (new) · `client/src/stores/ApplicationStore.ts` · `client/src/stores/session/SessionStore.ts` · `client/src/stores/bridge/zustandBridge.ts` · `client/src/services/migrations/` (new) · `client/src/services/autoSave.ts` (deleted) · `client/src/store/index.ts` · `client/src/store/projectActions.ts` · `client/src/App.tsx` · `client/src/containers/HeaderContainer.tsx` · `client/src/stores/session/__tests__/` (new)
**Effort:** L

## Objective

After this task the highest-severity bug in the repository is closed: a project that failed to load can never be written back over the user's real file. Auto-save becomes a single MobX reaction with a debounce, exponential backoff and an attempt cap, replacing five module-level mutable variables. The migration chain moves out of the transport layer into the store's load path, verbatim.

## Context

### The bug being closed

```
services/api.ts (deleted in task 15) used to: catch → return createDefaultProject()
  → the store accepted the blank project
    → any subsequent edit → scheduleAutoSave → POST /api/project?name=<real name>
      → the server atomically overwrote the user's real 1.1 MB file with a blank one
```

Task 15 removed the fabrication half — `projectApi.get` now throws. **This task adds the gate:** a `loadState` that blocks auto-save unless the project actually loaded. `isLoading: boolean` cannot express this, which is why it widens.

Task 07's `loadProject.test.ts` assertion **L6** pins the old behaviour. Flip it here, in the same commit as the fix.

### `DomainStore` — the load lifecycle

```ts
class DomainStore {
  loadState: "idle" | "loading" | "loaded" | "failed" = "idle";
  loadError: ApiError | null = null;
  projectName = "";
  projectList: string[] = [];           // observable.shallow
  version?: string;
  // objects / palettes / variants / referenceImage arrive in a LATER task —
  // this task ships the lifecycle only.
  get isLoading() { return this.loadState === "loading"; }   // computed, so consumers need not change
}
```

`projectName` stays in `DomainStore`, not `SessionStore`: `projectApi.save(project, name)` needs both, and putting the name in `SessionStore` forces a cross-store read on every save. It is loaded from `getConfig().currentProject` (`projectActions.ts:26`) — a server *config* endpoint.

The load flow:

```ts
async loadProject(name?: string) {
  this.loadState = "loading";
  try {
    const raw = await projectApi.get(name);              // API: transport only, RAW payload
    const { project, applied } = runMigrations(raw);     // domain logic, in the store
    if (applied.length > 0) {
      await backupApi.createMigrationBackup(raw);        // see the note below
    }
    runInAction(() => {
      this.project = compactToProject(project);
      this.loadState = "loaded";
    });
  } catch (e) {
    runInAction(() => {
      this.loadState = "failed";
      this.loadError = isApiError(e) ? e : null;
    });
    throw e;
  }
}
```

**Note on the pre-migration backup:** today it is best-effort — `api.ts:211-219` wraps the backup POST in its own try/catch and the migration proceeds even if the backup fails. One audit recommended promoting it to blocking (refuse to load if the backup fails). **Keep it best-effort in this task**, matching current behaviour, and record the recommendation as an open question. Making it blocking means a user with a full disk or a down server cannot open their project at all, which is a product decision, not a refactor.

### Moving the migration chain — verbatim

All the migration logic currently in `client/src/services/api.ts:15-145` moves into `client/src/services/migrations/`, as pure `(CompactProject) => CompactProject` functions plus a `runMigrations` orchestrator. **Transport must not mutate domain data**, and today any read path other than `loadProject` skips migrations entirely.

The functions to move, with their exact current homes:

| Function | Currently at |
| --- | --- |
| `needsVariantMigration` | `services/api.ts:15-24` |
| `migrateLegacyProject` | `services/api.ts:27-109` |
| `migrateVariantsToProjectLevel` | `services/api.ts:112-145` |
| the load-order orchestration | `services/api.ts:194, 209-231` |

⚠️ **Preserve the exact order and the exact `if`/`else if` structure at `api.ts:223-229`.** Task 07's `loadProject.test.ts` assertions L3 and L4 pin the fact that legacy-pixel migration and variant migration are mutually exclusive on that branch. Changing `else if` to `if` is a silent semantic change.

⚠️ **`migrateVariantsToProjectLevel` (`api.ts:112-145`) is one of two divergent implementations of the same migration** — the other lives inside `compactToProject` (now `types/codecs/deserialize.ts` after task 13) and *additionally* rewrites variant layers' `variantOffsets` from `baseFrameOffsets[frameIndex]`. Task 07 pinned the difference with a test. **Move the `api.ts` one verbatim and leave both in place.** Reconciling them is a semantic change and is recorded as an open question.

⚠️ `migrateLegacyProject` **drops the `version` field** — it returns an object literal with no `version` key, so a legacy project is silently re-versioned to `"1.1.0"` by the `?? "1.1.0"` default in `compactToProject`. Harmless today, a landmine for any future version-gated migration. **Preserve this behaviour**; do not "fix" it here.

**The corpus snapshots from task 07 are the proof of equivalence.** They must pass **unchanged** after the move. If any snapshot differs, the move was not verbatim.

### `AutoSaveController`

Replaces `client/src/services/autoSave.ts`, which holds **five module-level mutable variables** (`pendingProject`, `pendingProjectName`, `saveTimeout`, `isSaving`, `onSaveStatusChange`) and registers its status callback from inside the Zustand `create()` call.

```ts
class AutoSaveController {
  constructor(private domain: DomainStore,
              private session: SessionStore,
              private history: HistoryStore | null,   // null until the history task lands
              private clock: Clock = realClock) {
    this.dispose = reaction(
      () => this.saveTrigger,
      () => this.scheduleSave(),
      { delay: 500, equals: comparer.structural }
    );
  }

  private get saveTrigger() {
    if (this.domain.loadState !== "loaded") return null;   // hydration + FAILURE gate
    if (this.history?.isReplaying) return null;            // undo/redo replay guard
    if (this.session.saveSuspended) return null;           // rename/switch/delete
    return [this.domain.domainVersion, this.domain.pixelVersion, this.ui.persistedUIVersion] as const;
  }
}
```

| Concern | Design | Replaces |
| --- | --- | --- |
| **What is observed** | Three integer version counters, **not the data**. Observing the whole tree would re-evaluate a 300,249-cell structure on every keystroke; counters make the trigger O(1). | — |
| **Debounce** | `{ delay: 500 }` on the reaction — identical to today's `DEBOUNCE_MS = 500` (`autoSave.ts:10`), trailing edge, reset on each change. Coalescing is inherent: MobX reactions do not queue. | `autoSave.ts:45-56` |
| **Load-failure gate** | `loadState === "failed"` permanently blocks saves until a successful load. **This is the fix.** | — |
| **Hydration guard** | Hydration happens while `loadState === "loading"`, so the trigger returns `null` and no save fires. | — |
| **Suspend on rename/switch/delete** | `session.saveSuspended` set by the `DomainStore` flows for their duration. This replaces the 4 manual `cancelPendingSave()` calls at `projectActions.ts:58,85,141,178` **and structurally covers `renameCurrentProject`**, which task 14 patched by hand. | `cancelPendingSave` |
| **Retry** | Exponential backoff (500 ms × 2ⁿ, cap 30 s), **max 6 attempts**, then `saveStatus = "error"` with `ApiError.serverMessage` surfaced. | the infinite, no-backoff, no-cap 2 Hz loop at `autoSave.ts:29-34` |
| **Re-entrancy** | A single in-flight promise held on the controller; a save scheduled mid-flight sets a dirty flag and fires once the current one settles. | the **un-awaited** recursion at `autoSave.ts:38-41`, which can nest without a depth limit |
| **Save status** | `SessionStore.saveStatus`, written only by this controller. `markSaved()` sets `saved` then schedules `idle` after 2 s, matching `store/index.ts:41-46`. | the single global callback slot at `autoSave.ts:12`, which a second registration would silently replace |
| **Testability** | A class taking its collaborators and a clock, constructed per test with `vi.useFakeTimers()`. | module singletons that two tests in one process would share |

**`domainVersion` and `pixelVersion` must be bumped in exactly the places that own them**, each with a unit test. A missed bump is silent data loss; observing too much is a save per keystroke. In this task only `domainVersion` exists (the pixel grid moves later) — wire `pixelVersion` as a placeholder that later tasks bump.

### Serialization at save time

`AutoSaveController` calls `domain.serialize()`. In this task `serialize()` still produces the payload from the Zustand-held project via the bridge, because `objects`/`palettes`/`variants` have not moved yet. **The saved bytes must be identical to today's.** The full `serialize()` with the UI slice merged arrives with the `UIStore` task.

`DomainStore` must **not** import `UIStore`. When the UI slice arrives, `ApplicationStore` injects it:
```ts
this.domain.setUIStateProvider(() => this.ui.toPersistedUIState());
```

## Steps

1. Create `client/src/services/migrations/` and **move** `needsVariantMigration`, `migrateLegacyProject`, `migrateVariantsToProjectLevel` and the orchestration verbatim from `services/api.ts`'s former content, exposing `runMigrations(raw): { project, applied }`. Preserve the `if`/`else if` structure exactly.
2. Run task 07's suites. The corpus snapshots must pass **unchanged**. If not, the move was not verbatim — fix the move, never the snapshot.
3. Create `client/src/stores/domain/DomainStore.ts` with `loadState`, `loadError`, `projectName`, `projectList`, the `isLoading` computed, and the `loadProject` flow above. Also implement `createProject`, `switchProject`, `renameProject`, `deleteProject`, `refreshProjectList` and `restoreFromBackup` as MobX `flow`s (everything touching the API is a `flow` — `flow` gives implicit `action` wrapping after each `yield`, which `async/await` does not under `enforceActions: "always"`). Each sets `session.saveSuspended` for its duration.
4. Create `client/src/stores/session/AutoSaveController.ts` per the table. Wire it in `ApplicationStore`'s constructor.
5. Delete `client/src/services/autoSave.ts`. Update `store/index.ts` (lines 3-6, 37-48, 84) and `store/projectActions.ts` (lines 16, 58, 85, 141, 178, 202, 224) so the Zustand store no longer schedules its own saves — the reaction now owns it. Update the two former call sites in `AIInterpolateModal` (task 14 already removed its direct `scheduleAutoSave` imports; confirm nothing remains).
6. Move `loadState` consumption in `client/src/App.tsx` from `isLoading` to the `DomainStore` computed, and have the failed state render an explicit error rather than an empty editor.
7. Update the bridge: `loadState`, `projectName`, `projectList` and `saveStatus` move from the Phase A list to the Phase B list in **this** change.
8. Write the tests listed in Verification.

## Constraints

- **Preserve all 8 schema migrations.** Move verbatim; change no detector, transform, order, default value, or the `if`/`else if` at the former `api.ts:223-229`. Task 07's corpus snapshots must pass unchanged. ⚠️ Measured 2026-08-16: **no pre-migration data survives in this repo** — all 149 snapshots in the 9 gzipped backups are already fully migrated — so the migrations are covered **only** by task 07's hand-authored synthetic fixtures. There is no real-data safety net; move the code verbatim.
- **The saved bytes must not change in this task, or in any task in this plan.** `serialize()` still emits exactly what `projectToCompact` emits today, **including `uiState.aiServiceUrl`, which the owner decided (2026-08-16) stays in the wire format permanently.** There is no deliberate wire-format change anywhere in this plan.
- Keep the pre-migration backup **best-effort**, matching today.
- Preserve the debounce semantics exactly: 500 ms, trailing edge, reset on each change, coalesce to the latest.
- `DomainStore` must not import anything from `client/src/stores/ui/`. Task 05's ESLint rule enforces this.
- **Do not remove `zustand`** and do not move `objects`/`palettes`/`variants`/`referenceImage` — those are later tasks.
- Do not make the pixel grid observable.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build && bunx storybook build
bunx vitest run src/types/__tests__/          # corpus snapshots UNCHANGED
bunx vitest run src/services/migrations       # migration suite green after the move
bunx vitest run src/stores/session            # autosave suite
bunx vitest run                               # full suite
test ! -f src/services/autoSave.ts
```

The autosave test suite must assert, with fake timers:
- 10 edits within 500 ms → **exactly 1** `POST /api/project`
- a failed load (`GET /api/project` returns 500) → **zero** `POST /api/project` afterwards ← **this is the regression test for the critical bug**
- a save failure → backoff, capped at 6 attempts, then `saveStatus === "error"`
- coalescing: only the latest project is sent
- the `isSaving` re-entrancy guard: a save scheduled mid-flight fires exactly once afterwards
- `saveStatus` cycles `saving → saved → idle` with the 2 s delay

Manual checks — required:
1. **The critical one.** Stop the server. Reload the app. Expect an explicit error, **not** a blank canvas. Make an edit. Restart the server. Then `ls -la server/src/data/` — `Base Unit.json` **must still be ~1.1 MB, not ~2 kB.**
2. Draw a pixel and immediately rename the project within 500 ms — no file may be written under the old name.
3. With the server stopped, edit a pixel: the header must show `error` and the CPU must not spin (no 2 Hz POST loop). Restart the server and confirm the queued save lands.
4. Load each of `server/src/data/Base Unit.json` and `Test Blend.json` plus one dated backup in the running app, and confirm the object, frame, layer and variant counts match the values task 07's corpus README recorded.
5. **Wire-format stability:** copy `Base Unit.json` aside, make one edit, wait for the save, and diff. Only the edited field may differ.

## Definition of done

- [ ] `DomainStore.loadState` is a 4-state field; `isLoading` survives as a computed.
- [ ] `AutoSaveController` exists as an injectable class with a clock; `client/src/services/autoSave.ts` is deleted.
- [ ] **A failed load produces zero `POST /api/project` requests**, asserted by a test and confirmed manually against the real 1.1 MB file.
- [ ] Retry is bounded: exponential backoff, max 6 attempts, then `saveStatus = "error"` with the server message surfaced.
- [ ] All project-lifecycle actions are MobX `flow`s and set `saveSuspended` for their duration.
- [ ] The migration chain lives in `client/src/services/migrations/`, moved **verbatim**, with the `if`/`else if` structure preserved.
- [ ] Task 07's corpus snapshots pass **unchanged**.
- [ ] The pre-migration backup remains best-effort.
- [ ] The saved bytes are unchanged, verified by the copy-edit-diff check.
- [ ] `DomainStore` imports nothing from `stores/ui/`; `bunx eslint .` exits 0.
- [ ] The bridge's Phase A / Phase B lists were updated in the same change.
- [ ] `zustand` is still installed.
