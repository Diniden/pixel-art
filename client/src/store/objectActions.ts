/**
 * Object actions — SIX OF SEVEN MIGRATED TO MobX (REFRESH task 23).
 *
 * `addObject`, `deleteObject`, `renameObject`, `resizeObject`,
 * `duplicateObject` and `setObjectOrigin` now live on
 * `stores/domain/ObjectStore`, which mutates `DomainStore.objects` directly.
 * The bridge replaces the Zustand entries with delegates at install time, so
 * the unmigrated consumers keep their `useEditorStore()` seam unchanged.
 *
 * ── `selectObject` deliberately STAYS ──────────────────────────────────────
 * It is pure UI state — it writes only the three `uiState` selection ids and
 * touches no domain data — so it belongs to `TimelineUIStore` (task 24), not
 * to `ObjectStore`. It is left here, working, rather than being moved twice.
 * (`setOriginColor` is likewise a tool setting and was never in this module's
 * migration set.)
 *
 * The throwing stubs mirror task 16's lifecycle stubs: an unbridged store
 * fails loudly rather than silently dropping an edit.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
import type { AnchorPosition } from "../components/AnchorGrid/AnchorGrid";
import type { StoreGet, UpdateProjectAndSave } from "./storeTypes";

function migrated(name: string): never {
  throw new Error(
    `${name} moved to ObjectStore (REFRESH task 23) and is reached through ` +
      "the Zustand bridge. This store has no bridge installed — construct an " +
      "ApplicationStore and call installBridge(), or call ObjectStore directly.",
  );
}

export function createObjectActions(
  _get: StoreGet,
  updateProjectAndSave: UpdateProjectAndSave,
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
     * UI state, NOT a domain mutation — stays on Zustand until task 24.
     * `trackHistory=false`: selection changes are deliberately not undoable.
     */
    selectObject: (id: string) => {
      updateProjectAndSave((project) => {
        const obj = project.objects.find((o) => o.id === id);
        return {
          ...project,
          uiState: {
            ...project.uiState,
            selectedObjectId: id,
            selectedFrameId: obj?.frames[0]?.id ?? null,
            selectedLayerId: obj?.frames[0]?.layers[0]?.id ?? null,
          },
        };
      }, false);
    },
  };
}
