/**
 * LayerPanelContainer (REFRESH task 25, split in task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE 7 → 3 CALL-SITE COLLAPSE (MASTER.md §9.5) IS DISPATCHED HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LayerPanel` read **22 store members — the highest count outside `Canvas`**.
 * Seven were the `squash*`/`move*`/`delete*` variants, wired straight into
 * seven buttons. The UI now emits three parameterised callbacks and this file
 * is the ONLY place that maps `(direction, scope)` back to a store method:
 *
 *   onMoveLayer(id, "up",   "frame")     → layers.moveLayer(i, i + 1)
 *   onMoveLayer(id, "down", "frame")     → layers.moveLayer(i, i - 1)
 *   onMoveLayer(id, dir, "allFrames")    → layers.moveLayerAcrossAllFrames(id, dir)
 *   onSquashLayer(id, "down", "frame")   → layers.squashLayerDown(id)
 *   onSquashLayer(id, "up",   "frame")   → layers.squashLayerUp(id)
 *   onSquashLayer(id, "down", "allFrames") → layers.squashLayerDownAcrossAllFrames(id)
 *   onSquashLayer(id, "up",   "allFrames") → layers.squashLayerUpAcrossAllFrames(id)
 *   onDeleteLayer(id, "frame")           → layers.deleteLayer(id)
 *   onDeleteLayer(id, "allFrames")       → layers.deleteLayerAcrossAllFrames(id)
 *
 * ── ⚠️ ALL FOUR `squash*` STORE ACTIONS SURVIVE, DISTINCT ─────────────────
 *
 * This is a call-site parameterisation, NOT a rewrite. W17 ported the four
 * `squash*` variants one-for-one because task 08 measured that they genuinely
 * disagree — inverted blend on the `Up` pair, index-vs-id matching, asymmetric
 * guards, `visible` honoured by some and ignored by others — and pinned those
 * differences as characterisation tests. The dispatch above still reaches all
 * four methods by name. Nothing about their behaviour changed, and the switch
 * being explicit is what keeps it that way.
 *
 * ── ⚠️ THE INDEX MATH THE `frame` SCOPE NEEDS ─────────────────────────────
 *
 * `moveLayer` takes INDICES while `moveLayerAcrossAllFrames` takes an id and a
 * direction, so the frame scope has to resolve the id to an index. The
 * conversion is the pre-split logic exactly: the panel displays layers
 * REVERSED (top-first), so "up" in the display is `index + 1` in the stored
 * array and "down" is `index - 1`. Getting this backwards inverts the
 * z-order — it is the reason `LayerRow` no longer computes indices at all.
 *
 * ── ⚠️ THE GLOBAL Cmd+V HANDLER MOVED HERE, VERBATIM ──────────────────────
 *
 * It was a `useEffect` inside the component. A `window` listener that fires a
 * store action is not presentation, so it lives here now, unchanged: the
 * INPUT/TEXTAREA focus guard, `preventDefault`, and
 * `pasteLayerFromClipboard(true)` — `true` meaning CURRENT FRAME ONLY, which
 * is what makes it differ from the row's copy button ("copy across all
 * frames"). `layerClipboard` is the CROSS-PROJECT buffer on `SessionStore`
 * (R14): it survives a project switch by construction and nothing here may
 * clear it.
 *
 * ── The delete confirm ────────────────────────────────────────────────────
 *
 * `window.confirm('Delete this layer across all frames?')` was inline in the
 * component. It stays a `window.confirm` — changing it to a rendered dialog is
 * a UX change this task did not license — but it now lives on this side of the
 * boundary, so the presentational half stays pure and testable.
 *
 * ── ⚠️ THE PER-ROW THUMBNAIL PAINTS THROUGH `makeCellThumbnailDraw` ───────
 *
 * The siderail shows the CURRENT frame's thumbnail for each layer, and it
 * reuses the timeline's painter rather than growing a second one — the two
 * would otherwise drift on the two documented quirks that painter preserves
 * (the single-axis divisor, and the wrapping variant-frame index).
 *
 * The projection puts a bound `draw(ctx, size)` closure on the row model, so
 * `layer.pixels` still stops at this file: R2 says a `Layer` reference may
 * not reach `ui/`, and a closure over one is not a reference the diffing
 * path can walk.
 *
 * `domain.pixelVersion` is the revision — the SAME counter
 * `TimelineCellContainer` reads, and reading it here is what makes an edit
 * repaint the siderail. It is also half the cache key, which is why the
 * siderail and the timeline share cached paints instead of duplicating them:
 * the second panel to ask for `layer@version@size` gets a blit. The key
 * carries the frame index too, because a variant layer paints a DIFFERENT
 * image per frame from the same layer id.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { LayerPanel } from "../ui/components/LayerPanel/LayerPanel";
import type { LayerRowModel } from "../ui/components/LayerPanel/LayerRow";
import type {
  LayerScope,
  MoveDirection,
} from "../ui/components/LayerPanel/layerScope";
import { VariantSelectModalContainer } from "./VariantSelectModalContainer";
import { CopyFromModalContainer } from "./CopyFromModalContainer";
import { AddVariantModalContainer } from "./AddVariantModalContainer";
import { makeCellThumbnailDraw } from "./hooks/timelineCellThumbnail";
import { thumbnailCacheKey } from "../ui/canvas/thumbnailCache";
import { LAYER_THUMB_SIZE } from "../ui/components/LayerPanel/LayerRow";
import { useStores } from "../stores/context";

export const LayerPanelContainer = observer(function LayerPanelContainer() {
  const store = useStores();
  const {
    domain,
    layers: layerStore,
    variants,
    timelineUI,
    session,
    ui,
  } = store;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [variantModalLayerId, setVariantModalLayerId] = useState<string | null>(
    null,
  );
  const [showCopyFromModal, setShowCopyFromModal] = useState(false);
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);

  const frame = store.currentFrame;
  const layerClipboard = session.layerClipboard;
  const pasteLayerFromClipboard = useCallback(
    (currentFrameOnly: boolean) =>
      layerStore.pasteLayerFromClipboard(currentFrameOnly),
    [layerStore],
  );

  // The global Cmd+V paste-layer shortcut, verbatim from the pre-split
  // component. Current frame only (`true`) — see the header.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && layerClipboard) {
        // Only paste if not focused on an input
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        pasteLayerFromClipboard(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layerClipboard, pasteLayerFromClipboard]);

  const storedLayers = frame?.layers;

  // ── The 3 collapsed callbacks ───────────────────────────────────────────

  const handleMoveLayer = useCallback(
    (layerId: string, direction: MoveDirection, scope: LayerScope) => {
      if (scope === "allFrames") {
        layerStore.moveLayerAcrossAllFrames(layerId, direction);
        return;
      }
      // Frame scope needs indices. The display is reversed, so "up" in the
      // display is a HIGHER index in the stored array.
      if (!storedLayers) return;
      const index = storedLayers.findIndex((l) => l.id === layerId);
      if (index === -1) return;
      const target = direction === "up" ? index + 1 : index - 1;
      if (target < 0 || target >= storedLayers.length) return;
      layerStore.moveLayer(index, target);
    },
    [layerStore, storedLayers],
  );

  const handleSquashLayer = useCallback(
    (layerId: string, direction: MoveDirection, scope: LayerScope) => {
      // All four store actions survive by name — see the header.
      if (scope === "allFrames") {
        if (direction === "down") {
          layerStore.squashLayerDownAcrossAllFrames(layerId);
        } else {
          layerStore.squashLayerUpAcrossAllFrames(layerId);
        }
        return;
      }
      if (direction === "down") {
        layerStore.squashLayerDown(layerId);
      } else {
        layerStore.squashLayerUp(layerId);
      }
    },
    [layerStore],
  );

  const handleDeleteLayer = useCallback(
    (layerId: string, scope: LayerScope) => {
      if (scope === "allFrames") {
        if (!storedLayers || storedLayers.length <= 1) return;
        if (confirm("Delete this layer across all frames?")) {
          layerStore.deleteLayerAcrossAllFrames(layerId);
        }
        return;
      }
      layerStore.deleteLayer(layerId);
    },
    [layerStore, storedLayers],
  );

  // ── Local editing state ─────────────────────────────────────────────────

  const handleStartRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  }, []);

  /**
   * Create the layer straight away and open its name for editing — there is no
   * "new layer name" field to fill in first. The default name is only a
   * placeholder, so `LayerRow` selects it for overtyping.
   */
  const handleAddLayer = useCallback(() => {
    const taken = new Set((storedLayers ?? []).map((l) => l.name));
    let n = (storedLayers?.length ?? 0) + 1;
    while (taken.has(`Layer ${n}`)) n++;
    const name = `Layer ${n}`;
    const id = layerStore.addLayer(name);
    handleStartRename(id, name);
  }, [storedLayers, layerStore, handleStartRename]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  const handleFinishRename = useCallback(
    (id: string) => {
      setEditingName((current) => {
        if (current.trim()) layerStore.renameLayer(id, current.trim());
        return "";
      });
      setEditingId(null);
    },
    [layerStore],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index || !storedLayers) return;

      // Display index (reversed) → actual index, verbatim from the pre-split
      // component.
      const count = storedLayers.length;
      const actualFromIndex = count - 1 - dragIndex;
      const actualToIndex = count - 1 - index;

      layerStore.moveLayer(actualFromIndex, actualToIndex);
      setDragIndex(index);
    },
    [dragIndex, storedLayers, layerStore],
  );

  if (
    !domain.currentProject ||
    !frame ||
    !store.currentObject ||
    !storedLayers
  ) {
    return null;
  }

  // ── Projection: domain nodes → flat row view-models ─────────────────────
  //
  // Reversed here (top layer first) so no downstream component converts
  // between display and stored indices. `variantGroupName` / `variantName`
  // are resolved here too, which is what keeps `project.variants` out of the
  // ui/ layer entirely.

  const selectedLayerId = timelineUI.selectedLayerId;
  const projectVariants = domain.variants;

  // The thumbnail revision and the frame index — see the header. `gridSize`
  // and `frameIndex` are what `makeCellThumbnailDraw` needs beyond the layer.
  const currentObject = store.currentObject;
  const pixelRevision = domain.pixelVersion;
  const frameIndex = currentObject.frames.findIndex((f) => f.id === frame.id);

  const rows: LayerRowModel[] = storedLayers
    .map((layer, actualIndex): LayerRowModel => {
      const variantGroup =
        layer.isVariant && layer.variantGroupId
          ? projectVariants?.find((vg) => vg.id === layer.variantGroupId)
          : null;
      const selectedVariant = variantGroup?.variants.find(
        (v) => v.id === layer.selectedVariantId,
      );

      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        isVariant: layer.isVariant ?? false,
        variantGroupName: variantGroup?.name ?? null,
        variantName: selectedVariant?.name ?? null,
        // The two guards that were an inline IIFE before the split.
        canSquashDown:
          !layer.isVariant &&
          actualIndex > 0 &&
          !storedLayers[actualIndex - 1]?.isVariant,
        canSquashUp:
          !layer.isVariant &&
          actualIndex < storedLayers.length - 1 &&
          !storedLayers[actualIndex + 1]?.isVariant,

        // The closure keeps `layer.pixels` on this side of the boundary.
        drawThumbnail: makeCellThumbnailDraw(
          layer,
          currentObject.gridSize,
          projectVariants,
          frameIndex,
        ),
        thumbnailRevision: pixelRevision,
        // A variant layer paints a different image per frame from the same
        // id, so the frame index is part of the identity, not just the id.
        thumbnailCacheKey: thumbnailCacheKey(
          `layer:${layer.id}:${frameIndex}:${layer.selectedVariantId ?? ""}`,
          pixelRevision,
          LAYER_THUMB_SIZE,
        ),
      };
    })
    .reverse();

  // ── Header enable/disable, verbatim from the pre-split component ────────

  const selectedLayerIndex = selectedLayerId
    ? storedLayers.findIndex((l) => l.id === selectedLayerId)
    : -1;
  const selectedLayer =
    selectedLayerIndex >= 0 ? storedLayers[selectedLayerIndex] : null;

  const canMoveUp =
    selectedLayerIndex >= 0 && selectedLayerIndex < storedLayers.length - 1;
  const canMoveDown = selectedLayerIndex > 0;
  const canSquashDown =
    selectedLayerIndex > 0 &&
    !selectedLayer?.isVariant &&
    !storedLayers[selectedLayerIndex - 1]?.isVariant;
  const canSquashUp =
    selectedLayerIndex >= 0 &&
    selectedLayerIndex < storedLayers.length - 1 &&
    !selectedLayer?.isVariant &&
    !storedLayers[selectedLayerIndex + 1]?.isVariant;

  // ── Modal slots — see LayerPanel's header for why these are props ───────

  const modalLayer = variantModalLayerId
    ? storedLayers.find((l) => l.id === variantModalLayerId)
    : undefined;
  const modalVariantGroup = modalLayer?.variantGroupId
    ? projectVariants?.find((vg) => vg.id === modalLayer.variantGroupId)
    : null;

  return (
    <LayerPanel
      layers={rows}
      selectedLayerId={selectedLayerId}
      allVisible={storedLayers.every((l) => l.visible)}
      hasVariants={(projectVariants?.length ?? 0) > 0}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      canSquashDown={canSquashDown}
      canSquashUp={canSquashUp}
      canDeleteLayer={storedLayers.length > 1}
      dragIndex={dragIndex}
      editingId={editingId}
      editingName={editingName}
      onAddLayer={handleAddLayer}
      onToggleAllVisibility={(visible) =>
        layerStore.toggleAllLayersVisibility(visible)
      }
      onOpenCopyFrom={() => setShowCopyFromModal(true)}
      onOpenAddVariant={() => setShowAddVariantModal(true)}
      layerFocusMode={ui.viewport.layerFocusMode}
      onLayerFocusModeChange={(mode) => ui.viewport.setLayerFocusMode(mode)}
      onSelect={(id) => timelineUI.selectLayer(id)}
      onToggleVisibility={(id) => layerStore.toggleLayerVisibility(id)}
      onStartRename={handleStartRename}
      onEditingNameChange={setEditingName}
      onFinishRename={handleFinishRename}
      onCancelRename={handleCancelRename}
      onDragStart={(index) => setDragIndex(index)}
      onDragOver={handleDragOver}
      onDragEnd={() => setDragIndex(null)}
      onMoveLayer={handleMoveLayer}
      onSquashLayer={handleSquashLayer}
      onDeleteLayer={handleDeleteLayer}
      onCopyLayer={(id) => layerStore.copyLayerToClipboard(id)}
      onMakeVariant={(id) => variants.makeVariant(id)}
      onDuplicateLayer={(id) => layerStore.duplicateLayer(id)}
      onRemoveVariantLayer={(id) => variants.removeVariantLayer(id)}
      onOpenVariantSelect={(id) => setVariantModalLayerId(id)}
      variantSelectModal={
        modalLayer && modalVariantGroup ? (
          <VariantSelectModalContainer
            layer={modalLayer}
            variantGroup={modalVariantGroup}
            onClose={() => setVariantModalLayerId(null)}
          />
        ) : null
      }
      copyFromModal={
        showCopyFromModal ? (
          <CopyFromModalContainer onClose={() => setShowCopyFromModal(false)} />
        ) : null
      }
      addVariantModal={
        showAddVariantModal ? (
          <AddVariantModalContainer
            onClose={() => setShowAddVariantModal(false)}
          />
        ) : null
      }
    />
  );
});
