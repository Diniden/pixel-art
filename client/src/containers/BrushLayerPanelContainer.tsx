/**
 * BrushLayerPanelContainer (Brush Studio plan, `docs/01-brush-studio`,
 * task 17; MASTER D6 / D16).
 *
 * The brush counterpart of `LayerPanelContainer`: projects the selected
 * frame's layers into `BrushLayerRowModel`s for the pure `BrushLayerPanel`
 * (task 12), and maps every callback onto ONE `BrushStructureStore` method
 * (task 08) — or, for selection, onto `BrushUIStore` (task 10).
 *
 * ── Every structural callback goes to `brushStructure`, verbatim ──────────
 *
 *   onAddLayer(type, source)         → brushStructure.addLayer("Layer N", type, source)
 *   onToggleVisibility(id)           → brushStructure.toggleLayerVisibility(id)
 *   onRename(id, name)               → brushStructure.renameLayer(id, name)
 *   onSetChannelType(id, type)       → brushStructure.setLayerChannelType(id, type)
 *   onSetColorSource(id, source)     → brushStructure.setLayerColorSource(id, source)
 *   onSetAppliedGroup(id, groupId)   → brushStructure.setLayerAppliedGroup(id, groupId)
 *   onCreateAppliedGroup(id, name)   → addAppliedGroup(name), then setLayerAppliedGroup(id, newId)
 *   onMoveUp(id) / onMoveDown(id)    → brushStructure.moveLayer(id, "up" | "down")
 *   onDuplicate(id)                  → brushStructure.duplicateLayer(id)
 *   onDelete(id)                     → brushStructure.deleteLayer(id)
 *   onSelect(id)                     → brushUI.selectLayer(id)
 *
 * There is far less to dispatch than in `LayerPanelContainer`: brush layers
 * are UNIFORM across frames (MASTER D6), so there is no `frame`/`allFrames`
 * scope, no squash, and no index arithmetic — the store takes ids and a
 * direction, and applies every op to every frame itself.
 *
 * ── The display order is REVERSED, and "up" means the array end ──────────
 *
 * `frame.layers` is stored bottom → top (the array end is the top of the
 * stack, the `LayerStore` convention that `BrushUIStore.adoptDocument`
 * also follows). The panel shows the top of the stack FIRST, so the
 * projection reverses. `BrushStructureStore.moveLayer(id, "up")` already
 * means "toward the array end", i.e. toward the top of the displayed list —
 * the row's up arrow maps to it directly with no inversion.
 *
 * ── Why the panel is not rendered without a document ──────────────────────
 *
 * With no brush loaded every structural op is a silent no-op, so the header's
 * "+" would be a dead button. Returning `null` — `PixelStudioPanelContainer`'s
 * `if (!domain.hasProject) return null` — is the honest state; the library
 * above it already shows the "create one to start" prompt.
 *
 * No pixel grid crosses this boundary: the row model is ids, a name, two
 * flags, a channel type and a colour source (plan 13 D1: resolved here with
 * `brushLayerColorSource`, so the row never sees the optional key).
 * `document` is `observable.ref` (D8), so the reads below track its
 * identity only.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { BrushLayerPanel } from "../ui/components/BrushLayerPanel/BrushLayerPanel";
import type { BrushLayerRowModel } from "../ui/components/BrushLayerPanel/BrushLayerRow";
import { useStores } from "../stores/context";
import { brushLayerColorSource } from "../types";

export const BrushLayerPanelContainer = observer(
  function BrushLayerPanelContainer() {
    const { brushes, brushStructure, brushUI } = useStores();

    const doc = brushes.document;
    if (!doc) return null;

    // The frame the selection names, else the first — the same fallback
    // `BrushUIStore.selectedLayerIn` applies, so the rows and the canvas
    // agree on which frame is "current".
    const frame =
      doc.frames.find((f) => f.id === brushUI.selectedFrameId) ?? doc.frames[0];
    const storedLayers = frame ? frame.layers : [];

    const appliedGroups = doc.appliedGroups;
    const groupNameById = new Map(appliedGroups.map((g) => [g.id, g.name]));

    // Reversed: top of the stack first (see the header). `slice()` first so
    // the document's own array — held by reference in history snapshots — is
    // never reversed in place.
    const rows: BrushLayerRowModel[] = storedLayers
      .slice()
      .reverse()
      .map((layer): BrushLayerRowModel => {
        const appliedGroupId = layer.appliedGroupId ?? null;
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          channelType: layer.channelType,
          colorSource: brushLayerColorSource(layer),
          appliedGroupId,
          // A group id the document no longer lists shows no badge, rather
          // than the raw id.
          appliedGroupName:
            appliedGroupId === null
              ? null
              : (groupNameById.get(appliedGroupId) ?? null),
        };
      });

    return (
      <BrushLayerPanel
        layers={rows}
        selectedLayerId={brushUI.selectedLayerId}
        appliedGroups={appliedGroups}
        // The panel picks the colour source and the channel from its menu
        // (plan 13 D3); the name follows the pixel studio's "Layer N"
        // convention, counted against frame 0 (the layer list — uniform
        // across frames, D6).
        onAddLayer={(channelType, colorSource) => {
          const count = brushes.document?.frames[0]?.layers.length ?? 0;
          brushStructure.addLayer(
            `Layer ${count + 1}`,
            channelType,
            colorSource,
          );
        }}
        onSelect={(layerId) => brushUI.selectLayer(layerId)}
        onToggleVisibility={(layerId) =>
          brushStructure.toggleLayerVisibility(layerId)
        }
        onRename={(layerId, name) => brushStructure.renameLayer(layerId, name)}
        onSetChannelType={(layerId, type) =>
          brushStructure.setLayerChannelType(layerId, type)
        }
        onSetColorSource={(layerId, source) =>
          brushStructure.setLayerColorSource(layerId, source)
        }
        onSetAppliedGroup={(layerId, groupId) =>
          brushStructure.setLayerAppliedGroup(layerId, groupId)
        }
        // Two commits, two history entries (task file, step 3). `addAppliedGroup`
        // returns `""` with no document, in which case the assignment is
        // skipped rather than sent as an unknown id.
        onCreateAppliedGroup={(layerId, name) => {
          const groupId = brushStructure.addAppliedGroup(name);
          if (groupId) brushStructure.setLayerAppliedGroup(layerId, groupId);
        }}
        onMoveUp={(layerId) => brushStructure.moveLayer(layerId, "up")}
        onMoveDown={(layerId) => brushStructure.moveLayer(layerId, "down")}
        onDuplicate={(layerId) => brushStructure.duplicateLayer(layerId)}
        // No confirm: the store refuses to delete the last layer, and the op
        // is one undoable snapshot on the brush's own history (D9).
        onDelete={(layerId) => brushStructure.deleteLayer(layerId)}
      />
    );
  },
);
