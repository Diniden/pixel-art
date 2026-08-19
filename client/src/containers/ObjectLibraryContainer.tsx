/**
 * ObjectLibraryContainer (REFRESH task 28).
 *
 * The most invasive of the four variant consumers. `ObjectLibrary` had **no
 * props at all** — it read `project` plus seven actions straight off
 * `useEditorStore()` — so this container had to give it a props interface
 * before it could be wired.
 *
 * ══ ⚠️ THE MEMO-COMPARATOR REGRESSION THIS FIXES ═══════════════════════════
 *
 * `ObjectThumbnail` carried a 79-line hand-written `React.memo` comparator
 * that threaded `project` internals, and its variant-frame branch iterated
 * `prev.variantGroups` — the OBJECT-level list the v1.1.0 migration sets to
 * `undefined`. The loop never ran, so a variant-frame change never
 * invalidated a changed object's thumbnail. Both comparators are gone (see
 * `ObjectLibrary.tsx`'s note), and the thumbnails now receive `variants` and
 * `variantFrameIndices` as direct props off the MobX stores, with `observer()`
 * here providing invalidation at the granularity of the observables actually
 * read.
 *
 * ── Store members, and where each now comes from ──────────────────────────
 *
 *   objects / variants                 → `DomainStore`
 *   variantFrameIndices                → `TimelineUIStore` (Phase B as of
 *                                        this task)
 *   selectedObjectId / selectedFrameId → `TimelineUIStore` (still Phase A)
 *   objectLibraryViewMode + setter     → `TimelineUIStore`
 *   6 object CRUD actions              → `ObjectStore` (task 23)
 *
 * ⚠️ `selectObject` is the ONE member still routed through the legacy Zustand
 * action. It is the last writer of the three `uiState` selection ids and lives
 * in `store/objectActions.ts`, which is outside this task's `Touches` — see
 * the Phase A note in `zustandBridge.ts` for why the ids therefore could not
 * flip A→B here. Routing it through MobX without migrating that action would
 * give each id two writers, which R6 forbids.
 *
 * The component's 15 `useState` calls (5 inline dialogs) are NOT extracted —
 * the spec assigns that to the purification task.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { ObjectLibrary } from "../components/ObjectLibrary/ObjectLibrary";
import { useEditorStore } from "../store";
import { useStores } from "../stores/context";

export const ObjectLibraryContainer = observer(
  function ObjectLibraryContainer() {
    const { domain, objects, timelineUI } = useStores();
    // See the header: the last legacy seam, and deliberately so.
    const selectObject = useEditorStore((s) => s.selectObject);

    return (
      <ObjectLibrary
        objects={domain.objects}
        variants={domain.variants}
        variantFrameIndices={timelineUI.variantFrameIndices}
        selectedObjectId={timelineUI.selectedObjectId}
        selectedFrameId={timelineUI.selectedFrameId}
        objectLibraryViewMode={timelineUI.objectLibraryViewMode}
        onAddObject={(name, width, height) =>
          objects.addObject(name, width, height)
        }
        onDeleteObject={(id) => objects.deleteObject(id)}
        onRenameObject={(id, name) => objects.renameObject(id, name)}
        onResizeObject={(id, width, height, anchor) =>
          objects.resizeObject(id, width, height, anchor)
        }
        onSelectObject={(id) => selectObject(id)}
        onDuplicateObject={(id) => objects.duplicateObject(id)}
        onSetObjectLibraryViewMode={(mode) =>
          timelineUI.setObjectLibraryViewMode(mode)
        }
      />
    );
  },
);
