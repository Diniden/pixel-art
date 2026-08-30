/**
 * ReflectionUIStore — the reflection tool's guide lines and in-flight draft
 * (reflection-tool 2026-08-29, task 03).
 *
 * The reflection tool lets the owner drag a guide line BETWEEN pixels; every
 * subsequent pixel write is mirrored across every committed line. This store
 * is the one home for those lines (`lines`) and for the line currently being
 * dragged (`draft`).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NOTHING HERE IS PERSISTED, AND NOTHING HERE MAY BE DEEP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * - **Session-only.** No field here is read by `UIStore.toPersistedUIState()`
 *   (`stores/ui/UIStore.ts`). Adding a key there would extend the wire format
 *   across the owner's 151-snapshot backup corpus, and reflection lines were
 *   never asked to be saved (MASTER D6).
 * - **Never in history.** Committing or removing a line is not a command; the
 *   reflection gesture never opens a history stroke. Undo moves pixels, not
 *   guides.
 * - **Never schedules a save.** Nothing here is reachable from the hosted
 *   project, so no mutation can dirty it or wake `AutoSaveController`.
 * - **`observableRef` contract.** `lines` and `draft` are refs and are
 *   REPLACED WHOLESALE — never pushed into, spliced, or edited field by
 *   field. Readers may therefore compare identity to know whether anything
 *   changed, and no `ReflectionLine` is ever a MobX proxy.
 *
 * ── Lifetime (locked D6) ──────────────────────────────────────────────────
 * Lines outlive layer, frame, object and variant switches — that is the whole
 * point of the tool — and are cleared only when a DIFFERENT project is
 * installed. There is no reset hook on UI stores, so `ApplicationStore` wires
 * a `reaction` on `DomainStore.loadGeneration` (bumped once per fresh install:
 * init / load / create / switch / delete) to `clear()`. It deliberately does
 * NOT hook `adoptProject()`, which also runs on snapshot undo/redo and would
 * wipe the guides on every undo.
 *
 * Construction order is unconstrained: no dependencies in either direction,
 * exactly like `CanvasInteractionStore` and `CanvasViewsUIStore`.
 */
import { action, computed, makeObservable, observableRef } from "mobx";

/**
 * A reflection guide, in the grid space of the editable grid. Endpoints sit
 * on the integer CORNER lattice (`0..w × 0..h`) for hand-drawn lines and may
 * be half-integers for presets on odd-sized grids (MASTER D2).
 *
 * ⚠️ Declared here rather than imported: `ui/canvas/model/reflection.ts`
 * (task 02) declares a structurally identical `ReflectionLine`, and
 * `stores/**` may not depend on a `ui/` module's landing order. The two are
 * structurally identical, so no cast is ever needed.
 */
export interface ReflectionLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Hard cap on committed lines. Each line can double the number of images a
 * single write produces, so 8 lines is a 2^8 worst case — the point past
 * which a pencil stroke stops fitting in a frame (MASTER D4).
 */
export const MAX_REFLECTION_LINES = 8;

/** Zero-length lines have no axis to reflect across and are always rejected. */
function isDegenerate(line: { x1: number; y1: number; x2: number; y2: number }): boolean {
  return line.x1 === line.x2 && line.y1 === line.y2;
}

/**
 * Ids are session-scoped and only ever used as React keys and removal
 * handles, so a module counter beats a crypto dependency.
 */
let idCounter = 0;

export class ReflectionUIStore {
  /** `observableRef`: replaced wholesale, never pushed into. */
  lines: ReflectionLine[] = [];
  /** The line being dragged right now, or `null`. `observableRef`. */
  draft: ReflectionLine | null = null;

  constructor() {
    makeObservable(this, {
      lines: observableRef,
      draft: observableRef,

      hasLines: computed,
      atCapacity: computed,

      addLine: action,
      addLines: action,
      removeLine: action,
      clear: action,
      beginDraft: action,
      updateDraft: action,
      commitDraft: action,
      cancelDraft: action,
    });
  }

  get hasLines(): boolean {
    return this.lines.length > 0;
  }

  /** At `MAX_REFLECTION_LINES`; the panel disables its presets on this. */
  get atCapacity(): boolean {
    return this.lines.length >= MAX_REFLECTION_LINES;
  }

  /**
   * Commit one line. Returns the stored line, or `null` when it is degenerate
   * or the cap is already reached — the caller may show that as a no-op.
   */
  addLine(line: Omit<ReflectionLine, "id">): ReflectionLine | null {
    if (isDegenerate(line)) return null;
    if (this.atCapacity) return null;
    const stored: ReflectionLine = {
      id: `refl-${idCounter++}`,
      x1: line.x1,
      y1: line.y1,
      x2: line.x2,
      y2: line.y2,
    };
    this.lines = [...this.lines, stored];
    return stored;
  }

  /**
   * Commit several lines at once (the panel's presets). Degenerate entries
   * are skipped and the cap still holds, so a preset that would overflow adds
   * as many as fit. One wholesale replacement, so one reaction.
   */
  addLines(lines: readonly Omit<ReflectionLine, "id">[]): void {
    const next = [...this.lines];
    for (const line of lines) {
      if (next.length >= MAX_REFLECTION_LINES) break;
      if (isDegenerate(line)) continue;
      next.push({
        id: `refl-${idCounter++}`,
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
      });
    }
    if (next.length === this.lines.length) return;
    this.lines = next;
  }

  /** Remove one line by id. Unknown ids are a no-op (identity preserved). */
  removeLine(id: string): void {
    const next = this.lines.filter((line) => line.id !== id);
    if (next.length === this.lines.length) return;
    this.lines = next;
  }

  /**
   * Drop every line AND any in-flight draft. Called by the panel's "Clear
   * all" and by `ApplicationStore`'s `loadGeneration` reaction.
   */
  clear(): void {
    if (this.lines.length > 0) this.lines = [];
    this.draft = null;
  }

  /** Gesture start: a zero-length draft pinned at the pressed corner. */
  beginDraft(x: number, y: number): void {
    this.draft = { id: "refl-draft", x1: x, y1: y, x2: x, y2: y };
  }

  /** Gesture move. No-op with no draft; otherwise replaces it wholesale. */
  updateDraft(x: number, y: number): void {
    const draft = this.draft;
    if (!draft) return;
    this.draft = { id: draft.id, x1: draft.x1, y1: draft.y1, x2: x, y2: y };
  }

  /**
   * Gesture end. Commits the draft unless it is degenerate or the cap is
   * reached, and ALWAYS clears the draft either way. Returns the stored line
   * or `null`.
   */
  commitDraft(): ReflectionLine | null {
    const draft = this.draft;
    this.draft = null;
    if (!draft) return null;
    return this.addLine({ x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 });
  }

  /** Gesture abandoned (escape, pinch, pointer cancel). */
  cancelDraft(): void {
    this.draft = null;
  }
}
