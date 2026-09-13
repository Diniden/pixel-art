/**
 * BrushStore — the loaded brush document plus its load/save lifecycle
 * (Brush Studio plan, `docs/01-brush-studio`, task 07; MASTER D7/D8/D9).
 *
 * The brush-file analogue of `./DomainStore.ts`, and deliberately shaped like
 * it: the same four-state load machine, the same three version counters the
 * auto-save reaction observes, the same `session.setSaveSuspended` bracketing
 * around every lifecycle flow, and the same R5 rule — NOTHING here installs a
 * default document on failure. It satisfies `AutoSaveDocument<BrushDocument>`
 * so a second `AutoSaveController` (task 11) saves brushes through
 * `brushApi.save` with no controller changes.
 *
 * ── `document` IS `observable.ref` — THIS IS THE WHOLE DESIGN ─────────────
 * A brush document is held as ONE opaque reference (MASTER D8). MobX tracks
 * the identity of `document`, never its contents: no frame, layer, row or
 * cell is ever proxied. Every mutation — here and in the behaviour stores
 * built over this one (tasks 08/09) — REPLACES the document immutably and
 * bumps a counter; canvases redraw from `pixelVersion`, never by observing
 * the tree. `adoptDocument` is the single writer of the field.
 *
 * ── Own history ────────────────────────────────────────────────────────────
 * `history` is this store's OWN `HistoryStore` instance (D7/D9). Brush edits
 * never touch the shared editor history, and `ApplicationStore.activeHistory`
 * (task 11, D10) routes ⌘Z to it in brush mode. `commit()` is the snapshot
 * primitive for structural ops; pixel writes use `createBrushPixelCommand`
 * from the behaviour store that owns them.
 *
 * ── Flows, not async/await ─────────────────────────────────────────────────
 * Everything touching the API is a MobX `flow` (implicit action wrapping
 * after each `yield` under `enforceActions: "always"`). Nested flows are
 * awaited through `flowResult`, which is an identity at runtime.
 *
 * ── Boundaries ─────────────────────────────────────────────────────────────
 * Imports nothing from `stores/ui/`, `editorHistory.ts` or `ApplicationStore`
 * (ESLint-enforced for the first). The one outward notification —
 * `onDocumentInstalled` — is an INJECTED callback, so the UI store that
 * clamps its selection to the new document (task 10) is wired by
 * `ApplicationStore`, not imported here.
 */
import {
  action,
  computed,
  flow,
  flowResult,
  makeObservable,
  observable,
  observableRef,
  observableShallow,
} from "mobx";
import { ApiError, brushApi, isApiError } from "../../api";
import {
  createBrushDocument,
  normalizeBrushDocument,
  type BrushDocument,
} from "../../types";
import { HistoryStore } from "../history/HistoryStore";
import {
  createBrushSnapshotCommand,
  type BrushSnapshotHost,
} from "../history/brushCommands";
import type { AutoSaveDocument } from "../session/AutoSaveController";
import type { SessionStore } from "../session/SessionStore";
import type { LoadState } from "./DomainStore";

/**
 * The slice of `brushApi` the store drives. Structural so a test can inject
 * an in-memory fake; `brushApi` itself satisfies it (its optional
 * `AbortSignal` parameters are simply never passed).
 */
export interface BrushApiLike {
  list(): Promise<string[]>;
  /** The RAW payload — the store runs `normalizeBrushDocument` on it. */
  get(name: string): Promise<unknown>;
  save(doc: BrushDocument, name: string): Promise<unknown>;
  create(name: string, doc?: BrushDocument): Promise<unknown>;
  rename(oldName: string, newName: string): Promise<unknown>;
  remove(name: string): Promise<unknown>;
}

export interface BrushStoreDeps {
  session: SessionStore;
  /** Defaults to the real `brushApi`. */
  api?: BrushApiLike;
  /** Defaults to a fresh, private `HistoryStore`. NEVER pass the shared editor history. */
  history?: HistoryStore;
  /**
   * Fired from `adoptDocument` — i.e. after EVERY install or replace,
   * including undo/redo restores — with the newly adopted document (or
   * `null` when the last brush was deleted). Injected so a UI store can
   * clamp its selection without this store importing it.
   */
  onDocumentInstalled?: (doc: BrushDocument | null) => void;
}

export interface ReplaceDocumentOptions {
  /** Also bump `pixelVersion` so the canvas redraws. Default `false`. */
  bumpPixels?: boolean;
}

export class BrushStore implements AutoSaveDocument<BrushDocument> {
  /* ── the load-state machine (see DomainStore's R5 header) ─────────────── */
  loadState: LoadState = "idle";
  /** The typed failure behind `loadState === "failed"`, or `null`. */
  loadError: ApiError | null = null;

  /** The filename stem of the loaded brush — its identity (D2). */
  brushName = "";
  /** Brush file names as the SERVER returned them (it sorts; the store does not). */
  brushList: string[] = [];

  /**
   * The loaded brush document.
   *
   * ⚠️ `observable.ref` — NEVER `observable`. See the module header. A 64×64
   * brush with 8 layers × 8 frames is 262,144 cells; deep observation would
   * proxy every one of them and present as "MobX is slow" rather than as the
   * modelling error it is (`CLAUDE.md`, "Never deep-observe a pixel grid").
   */
  document: BrushDocument | null = null;

  /**
   * The auto-save trigger counters. `domainVersion` bumps once per committed
   * structural change (every `replaceDocument`); `pixelVersion` once per
   * pixel write (or restore) and is what the canvas redraws from;
   * `loadGeneration` once per fresh install, so the controller adopts a new
   * clean baseline instead of saving the freshly loaded file back.
   */
  domainVersion = 0;
  pixelVersion = 0;
  loadGeneration = 0;

  /** This store's OWN undo stack (D7). Never the shared editor history. */
  readonly history: HistoryStore;

  private readonly session: SessionStore;
  private readonly api: BrushApiLike;
  private readonly onDocumentInstalled:
    ((doc: BrushDocument | null) => void) | null;

  /** How a snapshot command reaches the live document (D9). Plain wiring. */
  private readonly snapshotHost: BrushSnapshotHost = {
    current: () => this.document,
    restore: (doc) => this.replaceDocument(doc, { bumpPixels: true }),
  };

  constructor(deps: BrushStoreDeps) {
    this.session = deps.session;
    this.api = deps.api ?? brushApi;
    this.history = deps.history ?? new HistoryStore();
    this.onDocumentInstalled = deps.onDocumentInstalled ?? null;
    makeObservable(this, {
      loadState: observable,
      loadError: observableRef,
      brushName: observable,
      brushList: observableShallow,
      document: observableRef, //  NEVER `observable` — see the field's note
      domainVersion: observable,
      pixelVersion: observable,
      loadGeneration: observable,
      hasBrush: computed,
      isLoading: computed,
      saveName: computed,
      adoptDocument: action,
      installDocument: action,
      replaceDocument: action,
      commit: action,
      bumpPixelVersion: action,
      init: flow,
      loadBrush: flow,
      createBrush: flow,
      switchBrush: flow,
      renameBrush: flow,
      deleteBrush: flow,
      refreshList: flow,
    });
  }

  /* ── computeds ────────────────────────────────────────────────────────── */

  get hasBrush(): boolean {
    return this.document !== null;
  }

  get isLoading(): boolean {
    return this.loadState === "loading";
  }

  /** `AutoSaveDocument.saveName` — the file the controller saves to. */
  get saveName(): string {
    return this.brushName;
  }

  /**
   * `AutoSaveDocument.serialize` — the payload `AutoSaveController` saves.
   * The in-memory shape IS the wire shape (D3) and the document is already a
   * plain object, so this is the reference itself.
   */
  serialize(): BrushDocument | null {
    return this.document;
  }

  /* ── the document writers ─────────────────────────────────────────────── */

  /**
   * THE single writer of `document`. Every other path (install, replace,
   * commit, undo/redo restore) funnels through here, so the injected
   * `onDocumentInstalled` callback can never be skipped.
   */
  adoptDocument(doc: BrushDocument | null): void {
    this.document = doc;
    this.onDocumentInstalled?.(doc);
  }

  /**
   * Install a FRESHLY loaded/created document (or `null` after deleting the
   * last brush): adopt it, wipe the undo stack, and advance `loadGeneration`
   * so the auto-save controller treats the new counters as a clean baseline
   * rather than an edit.
   */
  installDocument(doc: BrushDocument | null): void {
    this.adoptDocument(doc);
    this.history.clear();
    this.loadGeneration += 1;
  }

  /**
   * Replace the live document with an EDITED one (history-preserving) and
   * bump `domainVersion` — the auto-save trigger — plus `pixelVersion` when
   * the caller says the rendered pixels changed.
   */
  replaceDocument(
    doc: BrushDocument,
    options: ReplaceDocumentOptions = {},
  ): void {
    this.adoptDocument(doc);
    this.domainVersion += 1;
    if (options.bumpPixels) this.pixelVersion += 1;
  }

  /**
   * The snapshot primitive for structural ops (D9).
   *
   * `mutate` receives the current document and returns the next one; it
   * MUST NOT mutate its argument (see `brushCommands.ts`, "held by
   * reference"). Returning the very same object means "nothing changed" and
   * records nothing. Otherwise ONE whole-document snapshot command is
   * recorded into this store's own history and the document is replaced.
   *
   * While `history.isReplaying` (an undo/redo restore re-entering an action
   * path) `record()` is a no-op, so a restore can never spiral into a new
   * entry.
   */
  commit(
    label: string,
    mutate: (doc: BrushDocument) => BrushDocument,
    options: ReplaceDocumentOptions = {},
  ): void {
    const before = this.document;
    if (!before) return;
    const next = mutate(before);
    if (next === before) return;
    this.history.record(
      createBrushSnapshotCommand({ label, before, host: this.snapshotHost }),
    );
    this.replaceDocument(next, options);
  }

  /** One pixel write published — the canvas redraws and auto-save wakes. */
  bumpPixelVersion(): void {
    this.pixelVersion += 1;
  }

  /* ── lifecycle flows ──────────────────────────────────────────────────── */

  /**
   * Entry point on entering the brush studio. Lists the brush files and, if
   * there are any, loads the FIRST one as the server returned it (the server
   * sorts). An empty library is a legitimate `idle` state — the empty state
   * until a brush is created — not a failure.
   *
   * StrictMode-safe exactly like `DomainStore.initProject`: a second call
   * while `loading` (or after `loaded`) is a synchronous no-op; `idle` and
   * `failed` allow a retry. NEVER rejects — failure is `loadState ===
   * "failed"` + `loadError`, because the caller is a fire-and-forget effect.
   */
  *init(): Generator<Promise<unknown>, void, never> {
    if (this.loadState === "loading" || this.loadState === "loaded") return;
    this.loadState = "loading";
    this.loadError = null;
    try {
      const brushList: string[] = yield this.api.list();
      this.brushList = brushList;
      if (brushList.length === 0) {
        this.loadState = "idle";
        return;
      }
      yield flowResult(this.loadBrush(brushList[0]));
    } catch (error) {
      console.error("Failed to load brushes:", error);
      this.loadState = "failed";
      this.loadError = isApiError(error) ? error : null;
      // ⚠️ R5: no createBrushDocument() here, ever. A failed load leaves
      // whatever was installed untouched and the auto-save gate shut.
    }
  }

  /**
   * Load one brush by name. THROWS on failure — `loadState` becomes `failed`,
   * `loadError` records why, and the previously installed document (if any)
   * is left exactly as it was. A payload `normalizeBrushDocument` rejects is
   * a failure of kind `"unknown"`: a corrupt brush file is an ERROR, never a
   * blank default.
   */
  *loadBrush(name: string): Generator<Promise<unknown>, BrushDocument, never> {
    this.loadState = "loading";
    this.loadError = null;
    try {
      const raw: unknown = yield this.api.get(name);
      const doc = normalizeBrushDocument(raw);
      if (!doc) {
        throw new ApiError({
          kind: "unknown",
          path: "/brush",
          message: `Brush "${name}" is not a valid brush document`,
        });
      }
      this.brushName = name;
      this.installDocument(doc);
      this.loadState = "loaded";
      return doc;
    } catch (error) {
      this.loadState = "failed";
      this.loadError = isApiError(error) ? error : null;
      throw error;
    }
  }

  /* Each of the following suspends auto-save for its duration, exactly like */
  /* DomainStore's lifecycle flows, and mirrors their boolean/`void` +        */
  /* `console.error`-on-failure contract.                                     */

  /**
   * Create a new brush file from a fresh `width × height` document, refresh
   * the list, then load it back — so the in-memory document is exactly what
   * the server stored.
   */
  *createBrush(
    name: string,
    width = 16,
    height = 16,
  ): Generator<Promise<unknown>, boolean, never> {
    this.session.setSaveSuspended(true);
    try {
      yield this.api.create(name, createBrushDocument(width, height));
      const brushList: string[] = yield this.api.list();
      this.brushList = brushList;
      yield flowResult(this.loadBrush(name));
      return true;
    } catch (error) {
      console.error("Failed to create brush:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *switchBrush(name: string): Generator<Promise<unknown>, boolean, never> {
    this.session.setSaveSuspended(true);
    const before = this.loadState;
    try {
      yield flowResult(this.loadBrush(name));
      return true;
    } catch (error) {
      console.error("Failed to switch brush:", error);
      // The previously loaded brush (if any) is still installed and intact.
      this.loadState = before;
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *renameBrush(newName: string): Generator<Promise<unknown>, boolean, never> {
    if (!this.hasBrush) {
      console.error("Cannot rename: no brush is loaded");
      return false;
    }
    this.session.setSaveSuspended(true);
    try {
      yield this.api.rename(this.brushName, newName);
      const brushList: string[] = yield this.api.list();
      this.brushName = newName;
      this.brushList = brushList;
      return true;
    } catch (error) {
      console.error("Failed to rename brush:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  /**
   * Delete the loaded brush, then load the first remaining one — or, when it
   * was the last, return to the empty `idle` state with no document. Unlike
   * projects, deleting the last brush is allowed (MASTER §1).
   */
  *deleteBrush(): Generator<Promise<unknown>, boolean, never> {
    if (!this.hasBrush) {
      console.error("Cannot delete: no brush is loaded");
      return false;
    }
    this.session.setSaveSuspended(true);
    try {
      yield this.api.remove(this.brushName);
      const brushList: string[] = yield this.api.list();
      this.brushList = brushList;
      if (brushList.length > 0) {
        yield flowResult(this.loadBrush(brushList[0]));
      } else {
        this.brushName = "";
        this.installDocument(null);
        this.loadState = "idle";
      }
      return true;
    } catch (error) {
      console.error("Failed to delete brush:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *refreshList(): Generator<Promise<unknown>, void, never> {
    this.session.setSaveSuspended(true);
    try {
      const brushList: string[] = yield this.api.list();
      this.brushList = brushList;
    } catch (error) {
      console.error("Failed to refresh brush list:", error);
    } finally {
      this.session.setSaveSuspended(false);
    }
  }
}
