/**
 * ReferenceUIStore — the owner of the reference-image and trace-overlay UI
 * state (REFRESH task 29).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS STORE EXISTS TO KILL A MODULE-LEVEL SINGLETON INSIDE A MODAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `components/ReferenceImageModal/ReferenceImageModal.tsx:29` declared this:
 *
 *     const persistentState = {
 *       image: null as HTMLImageElement | null,
 *       imageUrl: null as string | null,
 *       selection: null as SelectionBox | null,
 *       zoom: 1,
 *       panOffset: { x: 0, y: 0 },
 *       hasBeenActivated: false,
 *     };
 *
 * — a mutable singleton, above a React component, with the comment "Store
 * persistent state outside the component so it survives unmounts". It was the
 * LAST module-level state in the codebase and a fourth, undeclared store: two
 * components (`ReferenceImageModal` and `ReferenceImagePanel`) shared it, with
 * NONE of the reactivity a store gives. Mutating it re-rendered nothing, so
 * every caller threaded the returned `ReferenceImageData` back through props by
 * hand. `App.tsx` used it as a data-transfer object: it called
 * `restoreReferenceImageFromProject()` to hydrate the singleton and then
 * `getCurrentReferenceImageData()` to read it straight back out.
 *
 * ── Where each of the six fields went ─────────────────────────────────────
 *
 *   image, imageUrl   → HERE, `observableRef` (see the warning below)
 *   selection         → HERE, as `referenceImageSelection`, `observableRef`
 *   zoom, panOffset   → component-local `useState` in the modal. Nothing
 *                       outside the modal ever read them; they are viewport
 *                       state for one dialog and belong nowhere else.
 *   hasBeenActivated  → DELETED. Written in 3 places, read in 0 — dead state.
 *                       Verified by grep before removal.
 *
 * ── LIFETIME: the semantics `persistentState` provided, preserved ─────────
 *
 * The singleton's ENTIRE purpose was surviving the modal's unmount, because
 * `ReferenceImageModal` returns `null` when closed and React discards its state.
 * A store instance outlives every component in the tree, so the lifetime is
 * preserved by construction rather than by a module global — and it is now
 * SCOPED: `ApplicationStore` is constructed per test and per Storybook story, so
 * two stories no longer share one image. That was impossible before; the
 * singleton had no reset hook at all (`handleClearImage`, bound to a button,
 * was the only one).
 *
 * ⚠️ It is deliberately NOT project-scoped state. `clear()` is called when a
 * project is switched (see `DomainStore.restoreReferenceImageFromProject`,
 * which overwrites all three fields on every load) so the correct image appears
 * after a switch.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `image` HOLDS A LIVE DOM NODE — `observableRef`, ALWAYS (R2/R11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `HTMLImageElement` is a live DOM element. Deep-observing it would proxy the
 * entire DOM node — every attribute, every style — and it can never be cloned,
 * serialized, or entered into undo history. `imageUrl` is its base64 mirror and
 * can be a multi-megabyte string, so it is `observableRef` for the same reason.
 * The selection box is `observableRef` because it is always REPLACED, never
 * mutated in place.
 *
 * What actually persists is `Project.referenceImage` (base64 + selection box),
 * owned by `DomainStore` and written NON-UNDOABLY — see
 * `DomainStore.saveReferenceImageToProject`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TOOL/TRACE EXCLUSIVITY: ONE ENFORCEMENT SITE, NOT TWO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Frame trace and the `reference-trace` TOOL are mutually exclusive modes, and
 * the rule was enforced in TWO places that had to agree:
 *
 *   `store/referenceActions.ts:55-63` — enabling frame trace cleared the tool
 *   `store/toolActions.ts:24-30`      — picking the tool cleared frame trace
 *
 * Two half-rules that only compose into the real invariant by coincidence. It
 * is collapsed here into ONE `reaction` observing `ToolUIStore.selectedTool`:
 * selecting `reference-trace` turns frame trace off, wherever the tool change
 * came from. The other direction stays inside `setFrameTraceActive` because it
 * is not a reaction to anything — it is the action's own precondition, and
 * making it a second reaction would create a write cycle between two reactions.
 */
import {
  action,
  makeObservable,
  observable,
  observableRef,
  reaction,
} from "mobx";
import type { IReactionDisposer } from "mobx";
import type { ReferenceImageData } from "../../types/referenceImage";
import {
  extractPixelsFromSelection,
  resizedSelection,
  shiftedSelection,
  sizeSteppedSelection,
  type ReferenceSelectionBox,
} from "../../utils/referenceImage";
import type { ToolUIStore } from "./ToolUIStore";

/** A 2D nudge offset, in grid cells. */
export interface OverlayOffset {
  x: number;
  y: number;
}

export interface ReferenceUIStoreDeps {
  /**
   * The tool store, observed for the trace-exclusivity reaction. Optional so
   * the store can be unit-tested standalone; when omitted the reaction is not
   * installed and `setFrameTraceActive`'s own half of the rule still holds.
   */
  tool?: ToolUIStore;
  /**
   * Persist the current image + selection to `Project.referenceImage`.
   *
   * ⚠️ INJECTED, never imported. `stores/ui/**` may not depend on
   * `stores/domain/**`; `ApplicationStore` supplies
   * `DomainStore.saveReferenceImageToProject`. This is the seam that lets a
   * selection nudge reach the project file without a UI→domain import.
   */
  save?: (
    image: HTMLImageElement | null,
    selection: ReferenceSelectionBox | null,
  ) => void;
}

export class ReferenceUIStore {
  /* ── the three fields rescued from `persistentState` ──────────────────── */

  /** ⚠️ A LIVE DOM NODE. `observableRef`, never cloned, never serialized. */
  image: HTMLImageElement | null = null;

  /** The base64 (or object-URL) mirror of {@link ReferenceUIStore.image}. */
  imageUrl: string | null = null;

  /**
   * The crop rectangle inside the source image — the ONE field with genuine
   * shared behaviour between the modal and the panel, and the reason the
   * singleton existed at all.
   */
  referenceImageSelection: ReferenceSelectionBox | null = null;

  /* ── the 6 trace-overlay fields absorbed from `EditorState` ───────────── */

  /**
   * The reference-trace overlay nudge. Ephemeral — NOT persisted today, and
   * that is preserved deliberately.
   */
  overlayOffset: OverlayOffset = { x: 0, y: 0 };

  /** Frame-trace mode. Mutually exclusive with the `reference-trace` tool. */
  frameTraceActive = false;

  /** Moves ATOMICALLY with `frameTraceActive` — one action writes both. */
  frameTraceFrameIndex: number | null = null;

  /** The frame-trace overlay nudge. Ephemeral, like `overlayOffset`. */
  frameOverlayOffset: OverlayOffset = { x: 0, y: 0 };

  /** Which object the frame-reference panel reads frames from. Ephemeral. */
  frameReferenceObjectId: string | null = null;

  /**
   * The shift-modified nudge step. ⚠️ The ONE PERSISTED field on this store —
   * moved here from `UIStore` for cohesion with the other trace fields.
   *
   * ⚠️ ITS WIRE KEY IS UNCHANGED. `UIStore.toPersistedUIState()` still emits it
   * as `traceNudgeAmount` at position 18; only the field's OWNER moved.
   * `UIStore.traceNudgeAmount` is now a delegating accessor onto this store, so
   * there is exactly one storage location (R6) and the builder needs no edit.
   */
  traceNudgeAmount: 10 | 20 | 25 | 50 | 100 = 10;

  private readonly save: ReferenceUIStoreDeps["save"];
  private readonly disposeTraceExclusivity: IReactionDisposer | null = null;

  constructor(deps: ReferenceUIStoreDeps = {}) {
    this.save = deps.save;

    makeObservable(this, {
      // ⚠️ All three are `observableRef` — see the header. `image` is a live
      // DOM node and `imageUrl` a potentially multi-MB base64 string.
      image: observableRef,
      imageUrl: observableRef,
      referenceImageSelection: observableRef,
      overlayOffset: observableRef,
      frameTraceActive: observable,
      frameTraceFrameIndex: observable,
      frameOverlayOffset: observableRef,
      frameReferenceObjectId: observable,
      traceNudgeAmount: observable,
      setImage: action,
      setSelection: action,
      clear: action,
      shiftSelection: action,
      shiftSelectionBySize: action,
      adjustBoxSize: action,
      setOverlayOffset: action,
      moveOverlay: action,
      resetOverlay: action,
      setFrameTraceActive: action,
      moveFrameOverlay: action,
      resetFrameOverlay: action,
      setFrameReferenceObjectId: action,
      setTraceNudgeAmount: action,
      hydrate: action,
    });

    // ── THE SINGLE ENFORCEMENT SITE (see the header) ────────────────────────
    // Picking the `reference-trace` tool exits frame trace, wherever the tool
    // change originated. `toolActions.ts:24-30`'s duplicate is deleted.
    if (deps.tool) {
      const tool = deps.tool;
      this.disposeTraceExclusivity = reaction(
        () => tool.selectedTool,
        (selectedTool) => {
          if (selectedTool === "reference-trace" && this.frameTraceActive) {
            this.applyFrameTrace(false, null);
          }
        },
      );
    }
  }

  /* ── reference image ──────────────────────────────────────────────────── */

  /**
   * Replace the image, its URL and the selection together.
   *
   * They are written as ONE action deliberately: the three are a single
   * logical value, and a torn write (a new image against the old selection)
   * would crop from the wrong bitmap. `persistentState` had no such guarantee
   * — its three fields were assigned on three separate lines.
   */
  setImage(
    image: HTMLImageElement | null,
    imageUrl: string | null,
    selection: ReferenceSelectionBox | null,
  ): void {
    this.image = image;
    this.imageUrl = imageUrl;
    this.referenceImageSelection = selection;
  }

  setSelection(selection: ReferenceSelectionBox | null): void {
    this.referenceImageSelection = selection;
  }

  /**
   * Drop the image entirely. The replacement for `handleClearImage`'s
   * six-line manual reset of the singleton — and, unlike it, callable from a
   * test or a story rather than only from a button.
   */
  clear(): void {
    this.image = null;
    this.imageUrl = null;
    this.referenceImageSelection = null;
  }

  /** The extracted pixels for the CURRENT image + selection, or `null`. */
  get currentReferenceImageData(): ReferenceImageData | null {
    return extractPixelsFromSelection(this.image, this.referenceImageSelection);
  }

  /* ── the three selection actions (was: 3 module-level functions) ──────── */

  /**
   * Nudge the crop box by `(dx, dy)`, persist, and return the new pixels.
   *
   * The stateful half of `ReferenceImageModal.shiftReferenceSelection`; the
   * geometry is `utils/referenceImage.shiftedSelection`. The return value is
   * kept because 16 call sites in `ReferenceImagePanel` still thread it back
   * through `onReferenceImageChange` — the panel is now reactive, but the
   * pixel EXTRACTION is a canvas read-back that must stay pull-based.
   */
  shiftSelection(dx: number, dy: number): ReferenceImageData | null {
    const { image, referenceImageSelection: selection } = this;
    if (!image || !selection) return null;

    const next = shiftedSelection(selection, image, dx, dy);
    return this.commitSelection(next);
  }

  /** Jump by whole multiples of the reference size, or refuse. */
  shiftSelectionBySize(
    dx: number,
    dy: number,
    currentRefWidth: number,
    currentRefHeight: number,
  ): ReferenceImageData | null {
    const { image, referenceImageSelection: selection } = this;
    if (!image || !selection) return null;

    const next = sizeSteppedSelection(
      selection,
      image,
      dx,
      dy,
      currentRefWidth,
      currentRefHeight,
    );
    if (!next) return null;
    return this.commitSelection(next);
  }

  /** Grow/shrink one edge of the crop box by 1px. */
  adjustBoxSize(
    direction: "up" | "down" | "left" | "right",
    increase: boolean,
  ): ReferenceImageData | null {
    const { image, referenceImageSelection: selection } = this;
    if (!image || !selection) return null;

    const next = resizedSelection(selection, image, direction, increase);
    if (!next) return null;
    return this.commitSelection(next);
  }

  /**
   * Store the new box, persist it, and extract. The shared tail of all three
   * actions above — in the original these were three copies of the same four
   * lines, one of which (`shiftReferenceSelectionBySize`) reached it only by
   * delegating to another exported function.
   */
  private commitSelection(
    next: ReferenceSelectionBox,
  ): ReferenceImageData | null {
    this.referenceImageSelection = next;
    this.save?.(this.image, next);
    return extractPixelsFromSelection(this.image, next);
  }

  /* ── the reference-trace overlay ──────────────────────────────────────── */

  setOverlayOffset(offset: OverlayOffset): void {
    this.overlayOffset = offset;
  }

  moveOverlay(dx: number, dy: number): void {
    this.overlayOffset = {
      x: this.overlayOffset.x + dx,
      y: this.overlayOffset.y + dy,
    };
  }

  resetOverlay(): void {
    this.overlayOffset = { x: 0, y: 0 };
  }

  /* ── frame trace ──────────────────────────────────────────────────────── */

  /**
   * Enable/disable frame trace, atomically with its frame index.
   *
   * ⚠️ The OTHER half of the exclusivity rule lives here rather than in a
   * second reaction: enabling frame trace while the `reference-trace` tool is
   * selected must clear the tool. It is the action's own precondition, not a
   * reaction to an external change, and expressing it as a reaction would put
   * two reactions in a write cycle. `ApplicationStore` injects the tool store
   * so this can be enforced without an import.
   */
  setFrameTraceActive(active: boolean, frameIndex: number | null): void {
    this.applyFrameTrace(active, frameIndex);
  }

  private applyFrameTrace(active: boolean, frameIndex: number | null): void {
    this.frameTraceActive = active;
    this.frameTraceFrameIndex = active ? frameIndex : null;
    // Verbatim from `referenceActions.ts:68`: both branches reset the offset.
    this.frameOverlayOffset = { x: 0, y: 0 };
  }

  moveFrameOverlay(dx: number, dy: number): void {
    this.frameOverlayOffset = {
      x: this.frameOverlayOffset.x + dx,
      y: this.frameOverlayOffset.y + dy,
    };
  }

  resetFrameOverlay(): void {
    this.frameOverlayOffset = { x: 0, y: 0 };
  }

  setFrameReferenceObjectId(objectId: string | null): void {
    this.frameReferenceObjectId = objectId;
  }

  /* ── the one persisted field ──────────────────────────────────────────── */

  setTraceNudgeAmount(amount: 10 | 20 | 25 | 50 | 100): void {
    this.traceNudgeAmount = amount;
  }

  /**
   * Adopt a loaded project's `traceNudgeAmount`.
   *
   * ⚠️ ONLY that field. The other six are ephemeral session state that no
   * project has ever carried, and hydrating them would invent persistence the
   * wire format does not have.
   */
  hydrate(ui: { traceNudgeAmount?: 10 | 20 | 25 | 50 | 100 }): void {
    this.traceNudgeAmount = ui.traceNudgeAmount ?? 10;
  }

  /** Storybook/Vitest teardown. */
  dispose(): void {
    this.disposeTraceExclusivity?.();
  }
}
