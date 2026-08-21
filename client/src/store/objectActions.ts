/**
 * Object actions — SIX OF SEVEN MIGRATED TO MobX (REFRESH task 23).
 *
 * `addObject`, `deleteObject`, `renameObject`, `resizeObject`,
 * `duplicateObject` and `setObjectOrigin` now live on
 * `stores/domain/ObjectStore`, which mutates `DomainStore.objects` directly.
 * The bridge replaces the Zustand entries with delegates at install time, so
 * the unmigrated consumers keep their `useEditorStore()` seam unchanged.
 *
 * ── `selectObject` MIGRATED IN W29f (task 38) ─────────────────────────────
 * It is pure UI state — it writes only the three `uiState` selection ids and
 * touches no domain data — so it belongs to `TimelineUIStore`, not to
 * `ObjectStore`, and it was left here working rather than being moved twice.
 * W29f moved it: `TimelineUIStore.selectObject` is the implementation, the
 * bridge installs the delegate, and the three ids flipped A→B in that same
 * change. This body is now a throwing stub like its six siblings.
 * (`setOriginColor` is likewise a tool setting and was never in this module's
 * migration set.)
 *
 * The throwing stubs mirror task 16's lifecycle stubs: an unbridged store
 * fails loudly rather than silently dropping an edit.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
import type { AnchorPosition } from "../utils/variantHelpers";
import type { StoreGet, UpdateProjectAndSave } from "./storeTypes";

function migrated(name: string): never {
  throw new Error(
    `${name} moved to ObjectStore (REFRESH task 23) / TimelineUIStore ` +
      "(task 38) and is reached through " +
      "the Zustand bridge. This store has no bridge installed — construct an " +
      "ApplicationStore and call installBridge(), or call ObjectStore directly.",
  );
}

export function createObjectActions(
  _get: StoreGet,
  // W29f (task 38): unused since `selectObject` — the module's last real
  // implementation — moved to `TimelineUIStore`. The parameter stays so the
  // factory's call signature in `store/index.ts` is unchanged; this whole
  // module is deleted with the Zustand store.
  _updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    addObject: (_name: string, _width: number, _height: number): void =>
      migrated("addObject"),
    deleteObject: (_id: string): void => migrated("deleteObject"),
    renameObject: (_id: string, _name: string): void => migrated("renameObject"),
    resizeObject: (
      _id: string,
      _width: number,
      _height: number,
      _anchor: AnchorPosition = "middle-center",
    ): void => migrated("resizeObject"),
    duplicateObject: (_id: string): void => migrated("duplicateObject"),
    setObjectOrigin: (
      _id: string,
      _origin: { x: number; y: number },
    ): void => migrated("setObjectOrigin"),

    /**
     * UI state, NOT a domain mutation. Migrated to `TimelineUIStore` by W29f
     * (task 38) and reached through the bridge delegate, exactly like the six
     * `ObjectStore` actions above. `trackHistory=false` — selection changes
     * are deliberately not undoable — is preserved there.
     */
    selectObject: (_id: string): void => migrated("selectObject"),
  };
}
