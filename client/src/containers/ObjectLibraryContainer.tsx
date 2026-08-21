/**
 * ObjectLibraryContainer (REFRESH task 28, split in task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE STALE-THUMBNAIL REGRESSION LIVES AT THIS SEAM. READ BEFORE EDITING.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ObjectThumbnail` used to carry a **79-line hand-written `React.memo`
 * comparator** threading `project` internals. W20 found it was dead code
 * hiding a live bug: its variant-frame branch iterated `prev.variantGroups` —
 * the OBJECT-level list the v1.1.0 migration sets to `undefined` — so the
 * loop never ran and a variant-frame change never invalidated a changed
 * object's thumbnail.
 *
 * It was removed and **must not come back.** `project` is replaced by
 * reference on every pixel edit (measured, W19), so any comparator keyed on
 * it either re-runs constantly or reaches for a field that stopped existing.
 * `ObjectLibraryThumbnails.dom.test.tsx` pins the behaviour with 5 DOM tests
 * and is probe-verified — reintroducing the comparator fails 2 of them.
 *
 * ── The LIVE-vs-STATIC index rule, carried over verbatim ──────────────────
 *
 * Only the SELECTED object, on its selected FIRST frame, follows the live
 * `variantFrameIndices`. Every other object renders the static index-0 pose
 * (`{[vg.id]: 0}` for each group). Without that, scrubbing a variant frame
 * would animate every thumbnail in the library at once. Behaviour unchanged
 * from before task 28.
 *
 * ── Why the painting is a `draw` factory ──────────────────────────────────
 *
 * `renderFramePreview` walks `frame.layers[].pixels` — part of a 300,249-cell
 * grid on the owner's real project (R2) — so it may not run under `ui/`.
 * `makeThumbnailDraw(objectId)` binds it here and hands `ui/` a closure;
 * `thumbnailRevision` (`domain.pixelVersion`) says when to repaint.
 * `ThumbnailCanvas` ignores the closure's identity by design, which is what
 * replaces the comparator without reintroducing one.
 *
 * ── Store members, and where each comes from ──────────────────────────────
 *
 *   objects / variants / pixelVersion  → `DomainStore`
 *   variantFrameIndices                → `TimelineUIStore` (Phase B)
 *   selectedObjectId / selectedFrameId → `TimelineUIStore` (Phase B, W29f)
 *   objectLibraryViewMode + setter     → `TimelineUIStore`
 *   6 object CRUD actions              → `ObjectStore` (task 23)
 *   selectObject                       → `TimelineUIStore` (W29f, task 38)
 *
 * ── W29f (task 38): the last legacy seam in this file is CLOSED ───────────
 *
 * `selectObject` used to come from `useEditorStore`. It was the last writer
 * of the three `uiState` selection ids outside `TimelineUIStore`, which is
 * why the ids sat in Phase A for five waves. W29f ported the action verbatim
 * to `TimelineUIStore.selectObject`, flipped the three ids A→B and rewired
 * this call site — all in one change, as R6 requires: the store becomes the
 * single writer in the same commit the field changes direction.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import {
  ObjectLibrary,
  type ObjectRowModel,
} from "../ui/components/ObjectLibrary/ObjectLibrary";
import { makeObjectThumbnailDraw } from "./hooks/objectThumbnailDraw";
import { useStores } from "../stores/context";

export const ObjectLibraryContainer = observer(
  function ObjectLibraryContainer() {
    const { domain, objects, timelineUI } = useStores();

    const allObjects = domain.objects;
    const variants = domain.variants;
    const variantFrameIndices = timelineUI.variantFrameIndices;
    const selectedObjectId = timelineUI.selectedObjectId;
    const selectedFrameId = timelineUI.selectedFrameId;

    const makeThumbnailDraw = useCallback(
      (objectId: string) =>
        makeObjectThumbnailDraw({
          objectId,
          objects: allObjects,
          variants,
          variantFrameIndices,
          selectedObjectId,
          selectedFrameId,
        }),
      [
        allObjects,
        variants,
        variantFrameIndices,
        selectedObjectId,
        selectedFrameId,
      ],
    );

    // Flat rows — no `frames`, so no pixel grid crosses the boundary.
    const rows: ObjectRowModel[] = allObjects.map((obj) => ({
      id: obj.id,
      name: obj.name,
      width: obj.gridSize.width,
      height: obj.gridSize.height,
      frameCount: obj.frames.length,
    }));

    return (
      <ObjectLibrary
        objects={rows}
        selectedObjectId={selectedObjectId}
        viewMode={timelineUI.objectLibraryViewMode}
        makeThumbnailDraw={makeThumbnailDraw}
        thumbnailRevision={domain.pixelVersion}
        onAddObject={(name, width, height) =>
          objects.addObject(name, width, height)
        }
        onDeleteObject={(id) => objects.deleteObject(id)}
        onRenameObject={(id, name) => objects.renameObject(id, name)}
        onResizeObject={(id, width, height, anchor) =>
          objects.resizeObject(id, width, height, anchor)
        }
        onSelectObject={(id) => timelineUI.selectObject(id)}
        onDuplicateObject={(id) => objects.duplicateObject(id)}
        onSetViewMode={(mode) => timelineUI.setObjectLibraryViewMode(mode)}
      />
    );
  },
);
