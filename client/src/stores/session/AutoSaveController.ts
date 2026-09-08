/**
 * AutoSaveController — the ONE owner of auto-save (REFRESH task 16).
 *
 * Replaces `services/autoSave.ts`, which held five module-level mutable
 * variables and an infinite, no-backoff retry loop, and whose status callback
 * was a single global slot registered from inside the Zustand `create()` call.
 *
 * ── Design (spec table, task 16) ───────────────────────────────────────────
 *
 *  What is observed   Two integer version counters (`domainVersion`,
 *                     `pixelVersion`) — never the data. Observing the tree
 *                     would re-evaluate a 300,249-cell structure per
 *                     keystroke; counters make the trigger O(1).
 *                     ⚠️ W29d JOINED THE THIRD COUNTER. Task 16 left a note
 *                     saying "`persistedUIVersion` joins with the UIStore
 *                     task"; task 24 built the counter but never wired it
 *                     here, and nothing measured the gap. MEASURED W29d: a
 *                     UI-only write bumped `persistedUIVersion` 1 -> 2 and
 *                     produced ZERO `POST /api/project`. Every UI setting
 *                     persisted only because the LEGACY Zustand setters still
 *                     ran `updateProjectAndSave` beside them — so the moment a
 *                     setting's ownership flips to MobX it silently stops
 *                     persisting. That is exactly the trap `setAiServiceUrl`
 *                     was stuck behind. See {@link PersistedUISource}.
 *  Debounce           500 ms, trailing edge, RESET on each change, coalesce
 *                     to the latest — identical to the old `DEBOUNCE_MS`.
 *                     ⚠️ Spec correction: the spec's `{ delay: 500 }` reaction
 *                     option is a THROTTLE in MobX (the window does not reset
 *                     per change), which would fire mid-stroke and violate
 *                     the pinned coalescing semantics. The debounce is
 *                     therefore owned by this class via the injected clock;
 *                     the reaction itself fires eagerly.
 *  THE GATE (R5)      The trigger returns `null` unless
 *                     `domain.loadState === "loaded"`. A FAILED load can
 *                     therefore never be followed by `POST /api/project` —
 *                     this is the fix for the highest-severity bug in the
 *                     repo. The same check covers hydration (`loading`).
 *  Replay guard       `history?.isReplaying` — dormant until task 17.
 *  Suspend            `session.saveSuspended`, set by the DomainStore
 *                     lifecycle flows for their duration. Replaces the four
 *                     manual `cancelPendingSave()` calls and structurally
 *                     covers rename.
 *  Retry              Exponential backoff 500 ms × 2ⁿ (capped at 30 s),
 *                     MAX 6 attempts, then `saveStatus = "error"` with the
 *                     `ApiError` surfaced on `session.lastSaveError`.
 *  Re-entrancy        One in-flight promise; a save requested mid-flight sets
 *                     a dirty flag and runs exactly once afterwards.
 *  Save status        Written ONLY here, onto `SessionStore.saveStatus`;
 *                     `markSaved()` owns the 2 s `saved → idle` cycle.
 *  Testability        A class taking its collaborators and a clock —
 *                     constructed per test under `vi.useFakeTimers()`.
 *  Document           Generic (brush-studio 05). The store under save is any
 *                     `AutoSaveDocument<TDoc>`, not `DomainStore`: the
 *                     same class saves brush files through a second instance.
 */
import {
  IReactionDisposer,
  compareStructural,
  reaction,
  runInAction,
} from "mobx";
import { CompactProject } from "../../types";
import { isApiError, projectApi } from "../../api";
import type { LoadState } from "../domain/DomainStore";
import type { SessionStore } from "./SessionStore";

/** The slice of the future HistoryStore (task 17) the trigger consults. */
export interface ReplayGuard {
  readonly isReplaying: boolean;
}

/**
 * The slice of `UIStore` the trigger consults — W29d.
 *
 * A COUNTER, never the fields. `UIStore` bumps it from a reaction over
 * `persistedSignature`, a structural projection built from
 * `toPersistedUIState()` itself, so a field added to that builder cannot be
 * forgotten here. Observing the counter keeps this trigger O(1) for the same
 * reason `domainVersion`/`pixelVersion` do.
 *
 * ⚠️ Optional, and deliberately so. `AutoSaveController` is constructed by
 * `ApplicationStore` AFTER `UIStore`, but the task-16 suites build one with
 * only a domain and a session; a required dependency would rewrite tests that
 * are pinning save behaviour, not UI behaviour. Absent, the trigger keeps its
 * task-16 two-counter shape exactly.
 */
export interface PersistedUISource {
  readonly persistedUIVersion: number;
}

/** Injectable timer source so tests own time. */
export interface Clock {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

/**
 * The slice of a document store the controller observes and saves —
 * brush-studio task 05.
 *
 * STRUCTURAL, not `DomainStore`: the same controller class saves the pixel
 * project (`TDoc = CompactProject`; `DomainStore` satisfies this through its
 * `saveName` getter) and, from task 11 on, a brush document through a second
 * instance. The four counters are the trigger, `serialize()` is the payload,
 * and `saveName` is the file identity — an empty string means "let the
 * transport default", exactly as `projectName` always did.
 */
export interface AutoSaveDocument<TDoc> {
  readonly loadState: LoadState;
  readonly loadGeneration: number;
  readonly domainVersion: number;
  readonly pixelVersion: number;
  readonly saveName: string;
  serialize(): TDoc | null;
}

export interface AutoSaveControllerOptions<TDoc = CompactProject> {
  /**
   * Transport override for tests. Defaults to `projectApi.save`, which is
   * correct ONLY for the default `TDoc = CompactProject`; a controller over
   * any other document type must inject its own transport (see the ctor).
   */
  save?: (doc: TDoc, name?: string) => Promise<unknown>;
  clock?: Clock;
}

/** `0` stands in for "no UI source injected" — see {@link PersistedUISource}. */
const NO_UI_VERSION = 0;

type Versions = readonly [domain: number, pixel: number, ui: number];
/**
 * `[loadGeneration, domainVersion, pixelVersion, persistedUIVersion]` when the
 * gate is open. The fourth member joined in W29d — see the header.
 */
type Trigger = readonly [
  generation: number,
  domain: number,
  pixel: number,
  ui: number,
];

export class AutoSaveController<TDoc = CompactProject> {
  static readonly DEBOUNCE_MS = 500;
  static readonly MAX_ATTEMPTS = 6;
  static readonly BACKOFF_BASE_MS = 500;
  static readonly BACKOFF_CAP_MS = 30_000;

  private readonly domain: AutoSaveDocument<TDoc>;
  private readonly session: SessionStore;
  private readonly history: ReplayGuard | null;
  /** W29d. `null` keeps the task-16 two-counter trigger exactly. */
  private readonly persistedUI: PersistedUISource | null;
  private readonly save: (doc: TDoc, name?: string) => Promise<unknown>;
  private readonly clock: Clock;

  private readonly disposeReaction: IReactionDisposer;
  private inFlight: Promise<void> | null = null;
  private dirty = false;
  private attempts = 0;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  /** Versions covered by the last successful save (or clean baseline). */
  private lastSaved: Versions;
  /** Which fresh install the baseline belongs to. */
  private lastGeneration: number;

  constructor(
    domain: AutoSaveDocument<TDoc>,
    session: SessionStore,
    history: ReplayGuard | null = null,
    options: AutoSaveControllerOptions<TDoc> = {},
    persistedUI: PersistedUISource | null = null,
  ) {
    this.domain = domain;
    this.session = session;
    this.history = history;
    this.persistedUI = persistedUI;
    this.save =
      options.save ??
      // The default transport is the PROJECT transport, correct only for the
      // default `TDoc = CompactProject`. The cast lives on this one line so
      // the public `save` option keeps its exact `TDoc` signature; a
      // controller over any other document injects its own transport
      // (task 11 passes `brushApi.save`).
      ((doc, name) => projectApi.save(doc as unknown as CompactProject, name));
    this.clock = options.clock ?? realClock;
    // The construction-time counters are the clean baseline: a load that
    // merely OPENS the gate (trigger `null` → `[g, n, n]`) is not an edit and
    // must not save — only an actual bump past the baseline does.
    [this.lastGeneration, this.lastSaved] = runInAction(
      () =>
        [
          domain.loadGeneration,
          [
            domain.domainVersion,
            domain.pixelVersion,
            persistedUI?.persistedUIVersion ?? NO_UI_VERSION,
          ] as const,
        ] as const,
    );

    this.disposeReaction = reaction(
      () => this.saveTrigger,
      (trigger) => {
        if (trigger === null) {
          // Gate closed (failed load / hydration / suspend / replay): drop
          // any pending debounce — the old `cancelPendingSave()` semantics.
          this.clearPendingDebounce();
          return;
        }
        const [generation, domainV, pixelV, uiV] = trigger;
        if (generation !== this.lastGeneration) {
          // A FRESH project was installed (init/load/create/switch/delete):
          // adopt its counters as the clean baseline. Opening the gate is not
          // an edit, and a pending pre-switch edit dies here exactly as it
          // died under the old `cancelPendingSave()`.
          this.lastGeneration = generation;
          this.lastSaved = [domainV, pixelV, uiV];
          this.clearPendingDebounce();
          return;
        }
        if (
          domainV === this.lastSaved[0] &&
          pixelV === this.lastSaved[1] &&
          uiV === this.lastSaved[2]
        ) {
          // Gate re-opened (suspend lifted / replay ended) with nothing new.
          return;
        }
        this.scheduleDebounced();
      },
      { equals: compareStructural },
    );
  }

  /** Trailing-edge debounce: every change RESETS the 500 ms window. */
  private scheduleDebounced(): void {
    // ⚠️ The status goes `pending` the MOMENT an edit is seen, not when the
    // request leaves. The header's dot turns orange here and stays orange
    // through the debounce and the in-flight save, so "orange" always means
    // exactly one thing: your work is not on disk yet.
    runInAction(() => this.session.setSaveStatus("pending"));
    this.clearPendingDebounce();
    this.debounceHandle = this.clock.setTimeout(() => {
      this.debounceHandle = null;
      this.requestSave();
    }, AutoSaveController.DEBOUNCE_MS);
  }

  private clearPendingDebounce(): void {
    if (this.debounceHandle !== null) {
      this.clock.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
  }

  /**
   * `null` = "no save may fire". The load-state check is the R5 gate: it
   * covers hydration (`loading`), the never-loaded app (`idle`) and — the
   * critical case — the FAILED load (`failed`).
   */
  private get saveTrigger(): Trigger | null {
    if (this.domain.loadState !== "loaded") return null; // hydration + FAILURE gate
    if (this.history?.isReplaying) return null; //          undo/redo replay guard
    if (this.session.saveSuspended) return null; //         rename/switch/delete
    return [
      this.domain.loadGeneration,
      this.domain.domainVersion,
      this.domain.pixelVersion,
      // W29d. `?? NO_UI_VERSION` rather than a branch: with no source injected
      // the member is a CONSTANT, so it can never move the trigger and the
      // task-16 behaviour is preserved bit for bit.
      this.persistedUI?.persistedUIVersion ?? NO_UI_VERSION,
    ] as const;
  }

  /** Re-entrancy guard: one in-flight run; extra requests set `dirty`. */
  private requestSave(): void {
    if (this.inFlight) {
      this.dirty = true;
      return;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
      // A request that arrived in the gap between the loop exiting and this
      // finally would otherwise be stranded.
      if (this.dirty) {
        this.dirty = false;
        this.requestSave();
      }
    });
  }

  /**
   * The save loop: gate → capture payload → save → mark; retry with backoff
   * on failure; loop again if an edit arrived mid-flight (coalescing to the
   * LATEST payload, exactly like the old `pendingProject` slot).
   */
  private async run(): Promise<void> {
    for (;;) {
      this.dirty = false;

      // Capture inside an action: legal observable reads under strict mode,
      // and an atomic snapshot of gate + payload + name.
      const attempt = runInAction(() => {
        const trigger = this.saveTrigger;
        if (trigger === null) return null; // late gate (retry timers)
        const [generation, domainV, pixelV, uiV] = trigger;
        if (
          generation === this.lastGeneration &&
          domainV === this.lastSaved[0] &&
          pixelV === this.lastSaved[1] &&
          uiV === this.lastSaved[2]
        ) {
          // Nothing unsaved (e.g. a fresh install was adopted mid-flight).
          return null;
        }
        const doc = this.domain.serialize();
        if (!doc) return null;
        return {
          doc,
          generation,
          versions: [domainV, pixelV, uiV] as Versions,
          name: this.domain.saveName || undefined,
        };
      });
      if (attempt === null) return;

      this.session.setSaveStatus("saving");
      try {
        await this.save(attempt.doc, attempt.name);
      } catch (error) {
        this.attempts += 1;
        if (this.attempts >= AutoSaveController.MAX_ATTEMPTS) {
          // Bounded, unlike the old 2 Hz infinite loop: surface and stop.
          // The NEXT edit re-opens a fresh 6-attempt budget.
          this.attempts = 0;
          this.session.setSaveError(isApiError(error) ? error : null);
          this.session.setSaveStatus("error");
          return;
        }
        await this.backoff();
        continue;
      }

      this.attempts = 0;
      this.lastGeneration = attempt.generation;
      this.lastSaved = attempt.versions;
      this.session.setSaveError(null);
      this.session.markSaved();
      if (!this.dirty) return;
    }
  }

  /** 500 ms × 2ⁿ, capped at 30 s. `attempts` has already been incremented. */
  private backoff(): Promise<void> {
    const ms = Math.min(
      AutoSaveController.BACKOFF_BASE_MS * 2 ** (this.attempts - 1),
      AutoSaveController.BACKOFF_CAP_MS,
    );
    return new Promise<void>((resolve) => {
      this.retryHandle = this.clock.setTimeout(() => {
        this.retryHandle = null;
        resolve();
      }, ms);
    });
  }

  dispose(): void {
    this.disposeReaction();
    this.clearPendingDebounce();
    if (this.retryHandle !== null) {
      this.clock.clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }
}
