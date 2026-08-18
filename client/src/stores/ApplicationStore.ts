/**
 * ApplicationStore — the root of the MobX store tree (task 14).
 *
 * It constructs and wires the child stores and will host the cross-store
 * computeds (`currentObject`, `currentFrame`, …) when they arrive with task
 * 23. Children land incrementally:
 *
 *   session  — task 14 (SessionStore)
 *   domain   — HERE (task 16: DomainStore load lifecycle + AutoSaveController)
 *   history  — task 17 (HistoryStore: command stack, byte budget, undo/redo)
 *   ui       — task 24 (UIStore + sub-stores, toPersistedUIState())
 *
 * ── Never a module-level singleton ─────────────────────────────────────────
 * The store is constructed ONCE, in `main.tsx`, and passed into React via
 * `StoreProvider`. Storybook and Vitest construct a fresh instance per story
 * and per test. A module-level singleton is exactly the defect the deleted
 * `services/autoSave.ts` had, and it is not carried forward.
 */
// ⚠️ Side-effect import FIRST: configures MobX strict mode
// (`enforceActions: "always"` + the dev-only strictness flags) before any
// observable in this tree is created.
import "./configure";
import { SessionStore } from "./session/SessionStore";
import {
  AutoSaveController,
  type AutoSaveControllerOptions,
} from "./session/AutoSaveController";
import { DomainStore, type ProjectHost } from "./domain/DomainStore";
import { createZustandProjectHost } from "./bridge/zustandProjectHost";

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
  /**
   * Where the project TREE lives during the bridge era. Defaults to the
   * Zustand-backed host; tests may substitute an in-memory one.
   */
  projectHost?: ProjectHost;
  /** Auto-save transport/clock overrides for tests. */
  autoSave?: AutoSaveControllerOptions;
}

const DEFAULT_HISTORY_BUDGET_BYTES = 64 * 1024 * 1024;

export class ApplicationStore {
  readonly session: SessionStore;
  readonly domain: DomainStore;
  /** `null` when `autoSaveEnabled: false` (the test default). */
  readonly autoSave: AutoSaveController | null;

  // Future children — typed and constructed by their own tasks:
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
    this.domain = new DomainStore({
      session: this.session,
      host: options.projectHost ?? createZustandProjectHost(),
    });
    // The save reaction — constructed LAST so it observes fully-built stores.
    // `history` is null until task 17 injects the replay guard.
    this.autoSave = this.options.autoSaveEnabled
      ? new AutoSaveController(this.domain, this.session, null, options.autoSave)
      : null;
  }

  /** Storybook/Vitest teardown: stop the save reaction and its timers. */
  dispose(): void {
    this.autoSave?.dispose();
  }
}
