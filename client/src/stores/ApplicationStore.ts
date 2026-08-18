/**
 * ApplicationStore — the root of the MobX store tree (task 14).
 *
 * It constructs and wires the child stores and will host the cross-store
 * computeds (`currentObject`, `currentFrame`, …) when they arrive with task
 * 23. Children land incrementally:
 *
 *   session  — task 14 (SessionStore)
 *   domain   — task 16 (DomainStore load lifecycle + AutoSaveController)
 *   history  — HERE (task 17: HistoryStore — command stack, byte budget,
 *              undo/redo, the `isReplaying` auto-save guard)
 *   ui       — task 24 (UIStore + sub-stores, toPersistedUIState())
 *
 * ── Never a module-level singleton ─────────────────────────────────────────
 * The store is constructed ONCE, in `main.tsx`, and passed into React via
 * `StoreProvider`. Storybook and Vitest construct a fresh instance per story
 * and per test. A module-level singleton is exactly the defect the deleted
 * `services/autoSave.ts` had, and it is not carried forward.
 *
 * ⚠️ Bridge-era exception, task 17: `history` ADOPTS the shared
 * `editorHistory` instance from `store/index.ts` rather than constructing its
 * own — the Zustand actions (undo/redo/commit) and the MobX tree must share
 * ONE command stack so `AutoSaveController`'s replay guard observes the same
 * `isReplaying` the undo path sets. Same temporariness and rationale as
 * `createZustandProjectHost()`; per-instance construction arrives when the
 * Zustand store is retired.
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
import { editorHistory } from "../store";
import type { HistoryStore } from "./history/HistoryStore";

export interface ApplicationStoreOptions {
  /**
   * The typed API layer (task 15). Untyped until that task lands; tests pass
   * a mock here so no store ever reaches for a module-level API import.
   */
  api?: unknown;
  /** Tests set `false` so no save reaction is ever wired (task 16). */
  autoSaveEnabled?: boolean;
  /**
   * Tests shrink this to exercise history eviction (task 17). Applied to the
   * shared `editorHistory` instance — tests that set it must restore
   * `MAX_HISTORY_BYTES` afterwards (bridge-era sharing, see the header).
   */
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
  /** The undo/redo owner (task 17) — bridge-era shared instance, see header. */
  readonly history: HistoryStore;
  /** `null` when `autoSaveEnabled: false` (the test default). */
  readonly autoSave: AutoSaveController | null;

  // Future children — typed and constructed by their own tasks:
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
    this.history = editorHistory;
    this.history.setBudgetBytes(this.options.historyBudgetBytes);
    // The save reaction — constructed LAST so it observes fully-built stores.
    // `history` is the live replay guard (task 17): the trigger is `null`
    // while `isReplaying` is set, so undo/redo never schedules a save.
    this.autoSave = this.options.autoSaveEnabled
      ? new AutoSaveController(
          this.domain,
          this.session,
          this.history,
          options.autoSave,
        )
      : null;
  }

  /** Storybook/Vitest teardown: stop the save reaction and its timers. */
  dispose(): void {
    this.autoSave?.dispose();
  }
}
