/**
 * DomainMutator — the shared write seam for the domain sub-stores (REFRESH
 * task 23).
 *
 * ── Why the sub-stores do not each own a slice ─────────────────────────────
 * `ObjectStore` does not hold `objects` — `DomainStore` does. The sub-stores
 * are **behaviour modules over one observable tree**, each receiving
 * `DomainStore` + `HistoryStore` by constructor injection.
 *
 * The reason is measured: `variantActions.ts` mutates `project.objects` AND
 * `project.variants` in the same operation (`makeVariant` at
 * `variantActions.ts:23` also calls `layerActions.selectLayer` at `:446`).
 * Splitting the DATA across sub-stores would recreate that cross-module edge
 * as a cross-store write. Splitting only the BEHAVIOUR keeps one tree, one
 * `pixelVersion`, and one serializer.
 *
 * ── The bridge-era ordering constraint (the subtle part) ───────────────────
 * `HistoryStore`'s snapshot provider (wired in `store/index.ts`) captures the
 * project from ZUSTAND. So an undoable mutation must snapshot BEFORE the tree
 * changes, while Zustand still holds the pre-state:
 *
 *      1. history.snapshot()   — captures the PRE state (from Zustand)
 *      2. mutate the MobX tree — the real write
 *      3. mirror to Zustand    — so the 34 unmigrated consumers see it
 *      4. bumpDomainVersion()  — the auto-save trigger
 *
 * Getting 1 and 2 the wrong way round records the POST state and silently
 * makes one undo step a no-op. That ordering is why this seam exists as one
 * function rather than being open-coded in each action.
 *
 * Step 3 is what keeps this task's blast radius survivable: `uiState` and the
 * ~137 legacy `updateProjectAndSave` call sites are untouched, so nothing
 * outside `PaletteStore`/`ObjectStore` has to change yet.
 */
import { runInAction } from "mobx";
import type { Project } from "../../types";
import type { DomainStore } from "./DomainStore";
import type { HistoryStore } from "../history/HistoryStore";

/** How a domain sub-store publishes a committed tree to the Zustand mirror. */
export interface DomainMirror {
  /** Push the recombined project into Zustand (Phase B, by reference). */
  publish(project: Project): void;

  /**
   * Record a pre-mutation snapshot through the SAME seam the legacy actions
   * use (`store/index.ts`'s `saveCurrentStateToHistory`).
   *
   * ⚠️ Why not call `history.snapshot()` directly: task 17 made
   * `EditorState.projectHistory`/`historyIndex` PHASE B mirrors written by
   * one writer — the history glue in `store/index.ts` — which wraps every
   * history operation in `reconcile()` … `computeMirror()`. Calling
   * `HistoryStore.snapshot()` straight from here would push the command onto
   * the real stack but leave that mirror stale, so undo would work while
   * every consumer reading `projectHistory` (and task 08's whole suite)
   * disagreed about the history depth. Measured: it silently cost one entry.
   */
  snapshot(label: string): void;
}

export interface DomainMutatorDeps {
  domain: DomainStore;
  history: HistoryStore;
  mirror: DomainMirror;
}

export class DomainMutator {
  private readonly domain: DomainStore;
  /**
   * Injected per the architecture's constructor-injection rule. Read directly
   * for transaction state; the SNAPSHOT path deliberately goes through
   * `mirror.snapshot()` instead — see `DomainMirror.snapshot`'s note.
   */
  private readonly history: HistoryStore;
  private readonly mirror: DomainMirror;

  constructor(deps: DomainMutatorDeps) {
    this.domain = deps.domain;
    this.history = deps.history;
    this.mirror = deps.mirror;
  }

  /** True while a stroke/transaction is batching commands into one entry. */
  get inTransaction(): boolean {
    return this.history.inTransaction;
  }

  /**
   * Run one domain mutation end to end, in the order the header describes.
   *
   * @param label       history entry label (ignored when `undoable` is false)
   * @param undoable    `false` for the palette actions, which are
   *                    deliberately NOT undoable (pinned by task 17 — all 5
   *                    pass `trackHistory=false` today and that is preserved
   *                    exactly).
   * @param mutate      mutates `DomainStore`'s observables. Runs inside an
   *                    action; must not touch Zustand or the UI stores.
   */
  commit(label: string, undoable: boolean, mutate: () => void): void {
    // 1. Snapshot the PRE state while Zustand still holds it, through the
    //    history glue's seam so the Phase B mirror stays consistent.
    if (undoable) {
      this.mirror.snapshot(label);
    }

    // 2. The real write, onto the MobX tree.
    runInAction(mutate);

    // 3 + 4. Mirror out, then trip the auto-save trigger.
    const project = this.domain.currentProject();
    if (project) {
      this.mirror.publish(project);
    }
    runInAction(() => this.domain.bumpDomainVersion());
  }
}
