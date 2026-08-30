/**
 * SyncController — applies a peer tab's save to THIS tab (cross-instance sync).
 *
 * ── The refresh must not flash ────────────────────────────────────────────
 * It calls `DomainStore.refreshFromServer`, NOT `loadProject`. `loadProject`
 * sets `loadState = "loading"` before fetching, and `AppContainer` renders
 * `<LoadingLayout />` for any state that is not `"loaded"` — so the load path
 * would unmount the whole editor and remount it on every peer save. The
 * refresh flow leaves `loadState` at `"loaded"` throughout, swapping the tree
 * underneath a mounted editor so MobX re-renders only what changed.
 *
 * Owns the one decision `SyncClient` deliberately does not make: what a
 * "project saved elsewhere" notification should DO.
 *
 * ── The semantics, as specified ───────────────────────────────────────────
 * Last-write-wins, single author. When a peer saves, this tab reloads from the
 * server immediately and whatever was unsaved here is CLOBBERED. There is no
 * merge, no conflict prompt, and no presence. Two tabs are expected to be the
 * same person, not two collaborators.
 *
 * ── Why the reload cannot simply call `loadProject` and stop ──────────────
 * Two hazards, both of which would corrupt the very state we are syncing:
 *
 *  1. **The echo.** Applying a reload bumps the domain counters. Left alone,
 *     `AutoSaveController` would see the bump and save the freshly-loaded tree
 *     straight back — a write amplification loop between tabs. It does NOT
 *     happen here, because `loadProject` increments `loadGeneration`, and the
 *     auto-save trigger treats a new generation as a clean baseline rather
 *     than an edit. That guarantee is load-bearing: it is the reason this
 *     controller can be as small as it is.
 *
 *  2. **The stranded pending save.** A debounced save may already be queued in
 *     this tab when the notification arrives. If it fired after the reload it
 *     would push the pre-reload tree back to the server and undo the refresh —
 *     the newest save would lose. `setSaveSuspended(true)` for the duration of
 *     the reload drops that pending debounce, exactly as the rename/switch
 *     flows do.
 *
 * ── Ignoring other projects ──────────────────────────────────────────────
 * A notification for a project this tab is not viewing is dropped. Reloading
 * would otherwise yank the user into a different project.
 */
import { flowResult, runInAction } from "mobx";
import type { ProjectSavedEvent } from "../../api";
import type { DomainStore } from "../domain/DomainStore";
import type { SessionStore } from "./SessionStore";

export interface SyncControllerOptions {
  /**
   * Reload override for tests. Defaults to `domain.refreshFromServer`, which
   * re-reads and installs the project WITHOUT touching `loadState` — see the
   * "no flash" note in the class header.
   */
  reload?: (name: string | undefined) => Promise<unknown>;
}

export class SyncController {
  private readonly domain: DomainStore;
  private readonly session: SessionStore;
  private readonly reload: (name: string | undefined) => Promise<unknown>;

  /** One reload at a time; a burst of notifications collapses to one refresh. */
  private inFlight: Promise<void> | null = null;
  /** A notification that arrived mid-reload; runs once the current one ends. */
  private pending = false;

  constructor(
    domain: DomainStore,
    session: SessionStore,
    options: SyncControllerOptions = {},
  ) {
    this.domain = domain;
    this.session = session;
    this.reload =
      options.reload ?? ((name) => flowResult(domain.refreshFromServer(name)));
  }

  /**
   * Handle a peer's save. Safe to call at any time; decides for itself whether
   * this tab should act.
   */
  handleProjectSaved(event: ProjectSavedEvent): void {
    // Read the gate inside an action: this runs from a socket callback, which
    // is not a reactive context, and the store enforces MobX strict mode.
    const shouldReload = runInAction(() => {
      // Never reload over a project this tab is not showing.
      const current = this.domain.projectName;
      if (current && event.projectName && current !== event.projectName) {
        return false;
      }
      // Nothing to refresh if this tab never finished loading. A `failed` load
      // must stay failed rather than being silently retried by a peer's save.
      return this.domain.loadState === "loaded";
    });

    if (shouldReload) this.requestReload();
  }

  /** Collapse concurrent notifications into a single in-flight reload. */
  private requestReload(): void {
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    this.inFlight = this.runReload().finally(() => {
      this.inFlight = null;
      if (this.pending) {
        this.pending = false;
        this.requestReload();
      }
    });
  }

  /**
   * Suspend auto-save, reload, resume.
   *
   * The suspend window is what drops a queued debounce so it cannot fire after
   * the reload and undo it (hazard 2 in the header).
   */
  private async runReload(): Promise<void> {
    const name = runInAction(() => {
      this.session.setSaveSuspended(true);
      return this.domain.projectName || undefined;
    });
    try {
      await this.reload(name);
    } catch {
      // A failed refresh leaves the tab on its existing tree. `loadProject`
      // has already recorded `loadState`/`loadError`; there is nothing useful
      // to add, and throwing here would only produce an unhandled rejection
      // in a socket callback.
    } finally {
      runInAction(() => this.session.setSaveSuspended(false));
    }
  }

  /** True while a refresh is being applied. Exposed for tests. */
  get isReloading(): boolean {
    return this.inFlight !== null;
  }
}
