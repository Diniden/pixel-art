/**
 * HistoryStore — the owner of undo/redo (REFRESH task 17).
 *
 * A bounded COMMAND stack replacing the Zustand snapshot stack
 * (`projectHistory: Project[]` — measured 6.9 MB per entry, ~680 MB at
 * `MAX_HISTORY = 100` on the owner's real project). This task ships
 * snapshot-only commands (see `commands.ts`), so behaviour is provably
 * identical to the legacy stack; the memory win arrives when task 26 converts
 * command families to inverse patches.
 *
 * ── Budget: bytes AND entries ──────────────────────────────────────────────
 * The primary bound is `budgetBytes` (default {@link MAX_HISTORY_BYTES},
 * 64 MB — configurable through `ApplicationStore`'s options), evicting from
 * the FRONT until under budget. A count cap is meaningless once entries span
 * 40 bytes to 6.9 MB.
 *
 * ⚠️ Spec correction: the spec says the byte budget "replaces"
 * `MAX_HISTORY = 100` — but task 08's suite (the R4 acceptance baseline,
 * which must pass UNCHANGED) imports `MAX_HISTORY` and pins the 100-entry
 * front-shifting cap. The count cap therefore REMAINS alongside the byte
 * budget for the bridge era (`maxEntries`, wired to `MAX_HISTORY` by
 * `store/index.ts`); with 64 MB ≈ 9 real-project snapshots the byte budget is
 * the binding constraint in practice, and the count cap can only go when the
 * baseline's cap tests are re-pinned (task 26+).
 *
 * ── Cursor semantics (task 08, pinned — do NOT normalise) ──────────────────
 * `entries[index]` is the last DONE command; its snapshot is the PRE-mutation
 * state, i.e. the state to return TO. `undo()` runs it then decrements;
 * truncation of the redo tail is DEFERRED to the next `record()` — the tail
 * stays physically present (and reachable by `redo()`) until a new command
 * arrives. A "cleanup" of this off-by-one silently breaks undo depth.
 *
 * ── Transactions ───────────────────────────────────────────────────────────
 * `beginTransaction`/`endTransaction` promote the `_strokeActive` module
 * closure (`drawingActions.ts:10`) to a first-class primitive, so variant
 * offsets, normal painting and the AI modal can batch too. Commands recorded
 * while a transaction is open buffer into it; `endTransaction` collapses them
 * to ONE entry. `beginTransaction` while a transaction is already open
 * commits the open one first — the legacy nested-`beginStroke` behaviour
 * ("each begin snapshots; a single end clears the flag", pinned by task 08).
 * The open transaction deliberately survives `replaceEntries()` (the legacy
 * closure survived a store reset — also pinned).
 *
 * ── `isReplaying` — the auto-save guard ────────────────────────────────────
 * True for the duration of `undo()`/`redo()`. `AutoSaveController`'s trigger
 * returns `null` while it is set, and the bridge's `domainVersion` bump is
 * suppressed, so a replay NEVER schedules a save — the next real edit saves
 * instead (deliberate, owner-accepted behaviour change, 2026-08-16).
 * `record()` is a no-op while replaying, so a command whose undo re-enters an
 * action path cannot spiral.
 *
 * Boundaries: imports nothing from `stores/ui/` (spec constraint) and never
 * looks inside a pixel grid — snapshots are opaque `Project` references
 * behind plain (non-observable) `Command` objects; `entries` is
 * observableShallow so MobX tracks the list, never the commands' contents.
 */
import {
  action,
  computed,
  makeObservable,
  observable,
  observableShallow,
} from "mobx";
import { collapseTransaction } from "./commands";
import type { Command, PixelPatchHost } from "./commands";

/** 64 MB — roughly 50,000 inverse-patch undos (task 26) or 9 full snapshots. */
export const MAX_HISTORY_BYTES = 64 * 1024 * 1024;

export interface HistoryStoreOptions {
  /** Byte budget; entries evict from the front until under it. */
  budgetBytes?: number;
  /** Bridge-era count cap (see the module header). Default: unbounded. */
  maxEntries?: number;
  /**
   * Builds the full-clone snapshot command for {@link HistoryStore.snapshot}.
   * Injected (rather than imported) because building one needs live-project
   * access, which lives with the glue that owns the project tree.
   */
  makeSnapshot?: (label: string) => Command | null;
}

export class HistoryStore {
  /** The command stack. Shallow: the list is tracked, commands are opaque. */
  entries: Command[] = [];
  /** Cursor: index of the last DONE command; -1 when nothing to undo. */
  index = -1;
  /** True while `undo()`/`redo()` runs — the auto-save replay guard. */
  isReplaying = false;
  /** The byte budget. Observable so a dev overlay can watch it. */
  budgetBytes: number;
  /** Bridge-era count cap (plain — never read reactively). */
  maxEntries: number;

  /** Open transaction. Plain (non-observable) by design: it must survive a
   *  store reset exactly like the `_strokeActive` closure it replaces. */
  private txn: { label: string; commands: Command[] } | null = null;
  private makeSnapshot: ((label: string) => Command | null) | null;
  /**
   * How a coalesced pixel command reaches the live project (task 26).
   * Injected by `PixelStore`, which is the only producer of the family. Plain,
   * never observable — it is wiring.
   */
  private patchHost: PixelPatchHost | null = null;

  constructor(options: HistoryStoreOptions = {}) {
    this.budgetBytes = options.budgetBytes ?? MAX_HISTORY_BYTES;
    this.maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY;
    this.makeSnapshot = options.makeSnapshot ?? null;
    makeObservable(this, {
      entries: observableShallow,
      index: observable,
      isReplaying: observable,
      budgetBytes: observable,
      canUndo: computed,
      canRedo: computed,
      historyBytes: computed,
      setBudgetBytes: action,
      beginTransaction: action,
      endTransaction: action,
      record: action,
      snapshot: action,
      undo: action,
      redo: action,
      clear: action,
      replaceEntries: action,
    });
  }

  get canUndo(): boolean {
    return this.index >= 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  /** Total estimated bytes currently held (exposed for the dev overlay). */
  get historyBytes(): number {
    return this.entries.reduce((sum, command) => sum + command.bytes, 0);
  }

  /** Whether a transaction is open. Plain, not reactive (see `txn`). */
  get inTransaction(): boolean {
    return this.txn !== null;
  }

  /**
   * Whether the open transaction has buffered nothing yet (task 26).
   *
   * Used by the stroke seam to DEFER its snapshot: a drag that painted
   * something needs no project clone (its inverse patches carry the
   * pre-state), while an empty begin/end pair must still produce one entry —
   * the behaviour task 08 pins as "beginStroke ALWAYS snapshots, even on a
   * stroke that paints nothing". Deferring turned a 50-move stroke from
   * 105,108 B into 1,684 B, measured.
   *
   * `false` when no transaction is open, so a caller cannot mistake "no
   * transaction" for "empty transaction".
   */
  get isTransactionEmpty(): boolean {
    return this.txn !== null && this.txn.commands.length === 0;
  }

  /**
   * Late injection seam for the snapshot provider.
   *
   * Returns the PREVIOUS provider so a caller that installs its own (each
   * `ApplicationStore` binds the shared instance to its own hosted project)
   * can restore it on dispose — the same capture-and-restore discipline the
   * retired bridge used for its action delegates.
   */
  setSnapshotProvider(
    make: ((label: string) => Command | null) | null,
  ): ((label: string) => Command | null) | null {
    const previous = this.makeSnapshot;
    this.makeSnapshot = make;
    return previous;
  }

  /**
   * Late injection seam for `PixelStore` (task 26): the host a COALESCED
   * pixel command is rebuilt against when a transaction collapses. Set once,
   * when `PixelStore` is constructed.
   */
  setPatchHost(host: PixelPatchHost): void {
    this.patchHost = host;
  }

  setBudgetBytes(bytes: number): void {
    this.budgetBytes = bytes;
    this.evict();
  }

  /**
   * Open a transaction. If one is already open it is committed first — the
   * legacy nested-`beginStroke` semantics (task 08: "each begin snapshots;
   * the flag is not a counter").
   */
  beginTransaction(label: string): void {
    if (this.txn) {
      this.endTransaction();
    }
    this.txn = { label, commands: [] };
  }

  /**
   * Commit the open transaction as ONE entry (a `CompositeCommand` when it
   * holds more than one command). No-op with no open transaction; an empty
   * transaction commits nothing.
   */
  endTransaction(): void {
    if (!this.txn) return;
    const { label, commands } = this.txn;
    this.txn = null;
    if (commands.length === 0) return;
    // Task 26: consecutive pixel patches on the same target are COALESCED
    // into one packed command before the collapse — a 50-move pencil drag
    // goes from 50 × 606 B to one 1,684 B command. See
    // `coalescePixelCommands`. Without a patch host (a bare HistoryStore in a
    // unit test) the commands pass through untouched.
    this.push(collapseTransaction(label, commands, this.patchHost));
  }

  /**
   * Record a done command. Buffers into the open transaction if there is
   * one; a NO-OP while replaying.
   */
  record(command: Command): void {
    if (this.isReplaying) return;
    if (this.txn) {
      this.txn.commands.push(command);
      return;
    }
    this.push(command);
  }

  /**
   * The full-clone escape hatch: record a snapshot of the current state
   * without mutating it (the legacy `saveCurrentStateToHistory`). Permanent
   * home of the ~11 structural ops whose inverse is intractable.
   */
  snapshot(label: string): void {
    if (this.isReplaying) return;
    const command = this.makeSnapshot?.(label) ?? null;
    if (command) {
      this.record(command);
    }
  }

  undo(): void {
    if (!this.canUndo) return;
    const command = this.entries[this.index];
    this.isReplaying = true;
    try {
      command.undo();
    } finally {
      this.isReplaying = false;
    }
    this.index -= 1;
  }

  redo(): void {
    if (!this.canRedo) return;
    const command = this.entries[this.index + 1];
    this.isReplaying = true;
    try {
      command.redo();
    } finally {
      this.isReplaying = false;
    }
    this.index += 1;
  }

  /** Full reset (project switch), including any open transaction. */
  clear(): void {
    this.entries = [];
    this.index = -1;
    this.txn = null;
  }

  /**
   * Bridge-era adoption seam: external code still writes the legacy
   * `projectHistory` array directly (`zustandProjectHost.installProject` /
   * `.snapshotToHistory`, the task 08 harness `load()`/`reset()`); the glue
   * wraps those raw snapshots as commands and installs them here. The index
   * is clamped; an open transaction deliberately survives (see the module
   * header).
   */
  replaceEntries(entries: Command[], index: number): void {
    this.entries = entries.slice();
    this.index = Math.max(-1, Math.min(index, this.entries.length - 1));
  }

  /**
   * Append with the pinned deferred-truncation semantics: the redo tail is
   * discarded HERE (on the next record), never by `undo()`.
   */
  private push(command: Command): void {
    this.entries = [...this.entries.slice(0, this.index + 1), command];
    this.index = this.entries.length - 1;
    this.evict();
  }

  /**
   * Evict from the FRONT until under both bounds. Always retains at least
   * one entry, so a single over-budget snapshot (a 6.9 MB resize against a
   * small test budget) remains undoable.
   */
  private evict(): void {
    while (
      this.entries.length > 1 &&
      (this.entries.length > this.maxEntries ||
        this.historyBytes > this.budgetBytes)
    ) {
      this.entries = this.entries.slice(1);
      this.index -= 1;
    }
  }
}
