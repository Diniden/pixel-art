/**
 * SelectionMirror — the four `uiState` selection ids, as observables (REFRESH
 * task 23).
 *
 * The 6 computeds that replace `store/helpers.ts` span BOTH halves of the
 * store: they read the domain tree (`objects`, `variants`) and the UI
 * selection (`selectedObjectId` / `selectedFrameId` / `selectedLayerId` /
 * `variantFrameIndices`). That is precisely why they live on
 * `ApplicationStore` rather than on `DomainStore` or a UI store.
 *
 * The selection ids do not move to MobX in this task — they are 4 of the 43
 * persisted UI fields inside `Project.uiState`, and the UIStore owns them
 * from task 24. But a `computed` can only recompute when its inputs are
 * observable, so the bridge mirrors them here in PHASE A (Zustand is still
 * the source of truth; this class is a read-only copy with the bridge as its
 * only writer).
 *
 * ── TASK 25 UPDATE: superseded in the app, RETAINED as a test double ──────
 *
 * `TimelineUIStore` landed and `ApplicationStore.selection` now points at it,
 * exactly as this header predicted — and the computeds did not change, which
 * was the point.
 *
 * The class is NOT deleted, deliberately. `UIStore`'s `selection` dependency
 * was widened from this class to the structural `UISelectionSource`
 * interface, so the three task-24 UI suites
 * (`persistedUIState`, `persistedUIVersion`, `serializeWithUIStore`) keep
 * constructing a bare `SelectionMirror` and were left UNTOUCHED — they test
 * the wire-format builder, not the selection store, and re-pointing them at
 * `TimelineUIStore` would drag `ViewportUIStore` and a `TimelineContext` into
 * tests that need neither.
 *
 * It has no remaining production caller. Delete it with the Zustand store
 * (task 38), or sooner if those three suites are rewritten.
 */
import { action, makeObservable, observable, observableRef } from "mobx";

export class SelectionMirror {
  selectedObjectId: string | null = null;
  selectedFrameId: string | null = null;
  selectedLayerId: string | null = null;
  /**
   * `observableRef`: replaced wholesale by the bridge on every change, so the
   * per-key granularity of a deep observable would only cost proxies.
   */
  variantFrameIndices: { [variantGroupId: string]: number } = {};

  constructor() {
    makeObservable(this, {
      selectedObjectId: observable,
      selectedFrameId: observable,
      selectedLayerId: observable,
      variantFrameIndices: observableRef,
      adopt: action,
    });
  }

  /** The bridge is the ONLY writer (Phase A). */
  adopt(next: {
    selectedObjectId: string | null;
    selectedFrameId: string | null;
    selectedLayerId: string | null;
    variantFrameIndices: { [variantGroupId: string]: number };
  }): void {
    this.selectedObjectId = next.selectedObjectId;
    this.selectedFrameId = next.selectedFrameId;
    this.selectedLayerId = next.selectedLayerId;
    this.variantFrameIndices = next.variantFrameIndices;
  }
}
