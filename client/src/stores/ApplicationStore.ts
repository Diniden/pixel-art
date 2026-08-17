/**
 * ApplicationStore — the root of the MobX store tree (task 14).
 *
 * Skeleton for now: it constructs and wires the child stores and will host the
 * cross-store computeds (`currentObject`, `currentFrame`, …) when they arrive
 * with task 23. Children land incrementally:
 *
 *   session  — HERE (task 14)
 *   domain   — task 16 (DomainStore: loadState, project tree, load/save flows)
 *   history  — task 17 (HistoryStore: command stack, byte budget, undo/redo)
 *   ui       — task 24 (UIStore + sub-stores, toPersistedUIState())
 *
 * ── Never a module-level singleton ─────────────────────────────────────────
 * The store is constructed ONCE, in `main.tsx`, and passed into React via
 * `StoreProvider`. Storybook and Vitest construct a fresh instance per story
 * and per test. A module-level singleton is exactly the defect
 * `services/autoSave.ts` and `ReferenceImageModal`'s `persistentState` have
 * today, and it is not carried forward.
 */
// ⚠️ Side-effect import FIRST: configures MobX strict mode
// (`enforceActions: "always"` + the dev-only strictness flags) before any
// observable in this tree is created.
import "./configure";
import { SessionStore } from "./session/SessionStore";

export interface ApplicationStoreOptions {
  /**
   * The typed API layer (task 15). Untyped until that task lands; tests pass
   * a mock here so no store ever reaches for a module-level API import.
   */
  api?: unknown;
  /** Tests set `false` so no save reaction is ever wired (task 16). */
  autoSaveEnabled?: boolean;
  /** Tests shrink this to exercise history eviction (task 17). */
  historyBudgetBytes?: number;
}

const DEFAULT_HISTORY_BUDGET_BYTES = 64 * 1024 * 1024;

export class ApplicationStore {
  readonly session: SessionStore;

  // Future children — typed and constructed by their own tasks:
  // readonly domain: DomainStore;    (task 16)
  // readonly history: HistoryStore;  (task 17)
  // readonly ui: UIStore;            (task 24)

  readonly options: Readonly<{
    api: unknown;
    autoSaveEnabled: boolean;
    historyBudgetBytes: number;
  }>;

  constructor(options: ApplicationStoreOptions = {}) {
    this.options = {
      api: options.api ?? null,
      autoSaveEnabled: options.autoSaveEnabled ?? true,
      historyBudgetBytes:
        options.historyBudgetBytes ?? DEFAULT_HISTORY_BUDGET_BYTES,
    };
    this.session = new SessionStore();
  }
}
