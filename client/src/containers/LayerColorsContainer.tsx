/**
 * LayerColorsContainer (REFRESH task 36, W27).
 *
 * `LayerColors` read 9 store members and did a full pixel scan inline. It is
 * now pure; this container owns both the store reads and the scan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ INVALIDATION — READ THIS BEFORE TOUCHING THE `useMemo` BELOW
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The component's original memo keyed on `[layer, obj, allFramesMode,
 * editingVariant, variantData, variantLayer]` — object identities. That is
 * NOT sufficient once the scan lives behind an `observer()`:
 *
 *   - Grids are `observable.ref`, ALWAYS (never deep-observed: the real
 *     project has 300,249 cells and deep observation would create ~1M
 *     proxies). So MobX does not track reads of individual cells here.
 *   - A paint replaces `layer.pixels` without necessarily producing a new
 *     `layer` NODE, so the identity-keyed memo would not re-run.
 *
 * `domain.pixelVersion` is the signal that a pixel write committed, so it is
 * read here and included in the dependency list. Drop it and the swatch strip
 * silently goes stale — the user paints a new colour and it never appears.
 * That is the spec's manual check 2, and it is the failure mode the task
 * warned about ("watch the invalidation: wrong invalidation gives stale
 * swatches").
 *
 * ⚠️ The scan is deliberately NOT a MobX `computed`. A computed would cache
 * against tracked observables, and the cells are not tracked — it would be
 * wrong in exactly the way described above. A `useMemo` with an explicit
 * version dependency is honest about what actually invalidates it.
 *
 * ── Hybrid, like ColorPickerContainer ─────────────────────────────────────
 *
 * `startColorAdjustment` / `clearColorAdjustment` are the colour-adjustment
 * LIFECYCLE, which is still Zustand — see `ColorPickerContainer` for the
 * measured reason (`PixelStore.adjustColor` is implemented but deliberately
 * unwired because `allFrames` is a multi-target write). Everything else comes
 * from MobX.
 *
 * W29c re-verified this and left it: neither function has a MobX
 * implementation, and `startColorAdjustment` in particular is a ~190-line
 * multi-frame/multi-layer SCAN (`store/colorAdjustmentActions.ts:10`) that
 * builds the `affectedPixelsByFrame` Map the all-frames write consumes.
 * Re-deriving it here would be a second implementation of the exact thing the
 * migration exists to remove. See `ColorPickerContainer`'s W29c note.
 */
import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { LayerColors } from "../ui/components/LayerColors/LayerColors";
import { extractLayerColors } from "./hooks/layerColorExtraction";
import { useStores } from "../stores/context";
import { useEditorStore } from "../store";

export const LayerColorsContainer = observer(function LayerColorsContainer() {
  const app = useStores();
  const { domain, ui } = app;

  // Still-Zustand half — the colour-adjustment lifecycle.
  const colorAdjustment = useEditorStore((s) => s.colorAdjustment);
  const startColorAdjustment = useEditorStore((s) => s.startColorAdjustment);
  const clearColorAdjustment = useEditorStore((s) => s.clearColorAdjustment);

  // `allFramesMode` was local `useState` in the component. It stays local view
  // state, but lives HERE because the scan below is keyed on it.
  const [allFramesMode, setAllFramesMode] = useState(false);

  const layer = app.currentLayer;
  const obj = app.currentObject;
  const editingVariant = app.isEditingVariant;
  const variantData = editingVariant ? app.currentVariant : null;
  const variantLayer = editingVariant ? app.selectedVariantLayer : null;

  // ⚠️ `pixelVersion` is load-bearing in this dependency list — see above.
  const pixelVersion = domain.pixelVersion;
  const uniqueColorsData = useMemo(
    () =>
      extractLayerColors(
        layer,
        obj,
        allFramesMode,
        editingVariant,
        variantData,
        variantLayer,
      ),
    [
      layer,
      obj,
      allFramesMode,
      editingVariant,
      variantData,
      variantLayer,
      pixelVersion,
    ],
  );

  return (
    <LayerColors
      hasLayer={layer != null}
      uniqueColorsData={uniqueColorsData}
      currentPickerColor={ui.tool.selectedColor}
      colorAdjustment={Boolean(colorAdjustment)}
      colorAdjustmentAllFrames={Boolean(colorAdjustment?.allFrames)}
      allFramesMode={allFramesMode}
      onAllFramesModeChange={setAllFramesMode}
      onStartColorAdjustment={(color, allFrames) =>
        startColorAdjustment(color, allFrames)
      }
      onClearColorAdjustment={() => clearColorAdjustment()}
    />
  );
});
