/**
 * PaletteManagerContainer (REFRESH task 23).
 *
 * `PaletteManager` reads 7 store members, all confined to the palette slice.
 * This container supplies the 6 that moved to MobX — `palettes` from
 * `DomainStore` and the 5 `PaletteStore` actions — as plain props.
 *
 * ⚠️ All 5 palette actions remain NON-UNDOABLE (task 17, pinned).
 *
 * `observer()` may only be imported under `src/containers/` — task 05's
 * ESLint boundary enforces it, and the boundary probe is re-run whenever the
 * config changes.
 *
 * ── REFRESH task 36 (W27) ─────────────────────────────────────────────────
 *
 * The component's last two Zustand reads (`uiState.selectedColor`, `setColor`)
 * became the `selectedColor` prop and the `onSelectColor` callback, and the
 * component moved to `ui/components/PaletteManager/`.
 *
 * ⚠️ The `if (!project) return null` guard MOVED HERE from the component.
 * That is not cosmetic: without it the panel would render its "add palette"
 * form against a project that does not exist yet. `hasProject` is the MobX
 * equivalent of the old `project` truthiness test.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS CONTAINER ABSORBED `LayerColorsContainer`, WHICH IS DELETED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The "Layer Colors" strip under the workspace is retired; its swatches are
 * now the pinned "Current Palette" row at the top of this list. The pixel
 * scan, its invalidation rule and the colour-adjustment lifecycle all moved
 * here verbatim — the notes below are the ones that travelled with them,
 * because every trap they describe is still live.
 *
 * ── ⚠️ INVALIDATION — READ THIS BEFORE TOUCHING THE `useMemo` BELOW ───────
 *
 * The scan's original memo keyed on `[layer, obj, allFramesMode,
 * editingVariant, variantData, variantLayer]` — object identities. That is
 * NOT sufficient behind an `observer()`:
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
 *
 * ⚠️ The scan is deliberately NOT a MobX `computed`. A computed would cache
 * against tracked observables, and the cells are not tracked — it would be
 * wrong in exactly the way described above. A `useMemo` with an explicit
 * version dependency is honest about what actually invalidates it.
 *
 * ⚠️ THE SCAN RUNS ONLY WHILE THE ROW IS EXPANDED. `PaletteManager` owns the
 * expansion state, so this container cannot read it; the row reports it up
 * through `onExpandedChange` and the memo short-circuits to `NO_COLORS` while
 * closed.
 *
 * That is a real behaviour change from the old strip, and a deliberate one.
 * The strip was always visible and therefore always scanning ONE layer. This
 * row can be asked for `allFrames` AND `allLayers` at once, where a full pass
 * is O(frames × layers × w × h) — on the owner's real project, every layer of
 * every frame on every paint. Paying that for a collapsed row nobody is
 * looking at is exactly the modelling error R2 exists to prevent, and it
 * would present as "painting got slow" rather than as a scan that should not
 * have run.
 *
 * ⚠️ `expanded` gates the SCAN, not the colour-adjustment mode. An adjustment
 * opened from this row survives collapsing it, and `GlobalHotkeys`' Escape
 * still clears it — the mode lives in `ToolUIStore`, not in this component.
 */
import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { PaletteManager } from "../ui/components/PaletteManager/PaletteManager";
import { extractLayerColors } from "./hooks/layerColorExtraction";
import { useStores } from "../stores/context";
import type { Color } from "../types";
import {
  sortPaletteColors,
  type LayerColorsData,
} from "../ui/utils/layerColors";

/** What the scan returns when the row is collapsed — see the header. */
const NO_COLORS: LayerColorsData = { colors: [], count: 0 };

export const PaletteManagerContainer = observer(
  function PaletteManagerContainer() {
    const app = useStores();
    const { domain, palettes, session, ui } = app;

    // ✅ MIGRATED — W29h, together with `ColorPickerContainer`. They HAD to
    // move as a pair: `colorAdjustment` is in neither `PHASE_A_FIELDS` nor
    // `PHASE_B_FIELDS`, so Zustand's copy and `ToolUIStore`'s are two
    // INDEPENDENT storage locations. Migrating only one would have left the
    // live `adjustColor` replaying an empty Zustand snapshot — the mode would
    // open and then do nothing.
    const colorAdjustment = ui.tool.colorAdjustment;

    // The two scope toggles. Local view state, but they live HERE because the
    // scan below is keyed on them.
    const [allFramesMode, setAllFramesMode] = useState(false);
    const [allLayersMode, setAllLayersMode] = useState(false);

    // Mirrors the row's expansion, reported up by `PaletteManager`. See the
    // header: this is what keeps the scan off the paint path when closed.
    const [expanded, setExpanded] = useState(false);

    const layer = app.currentLayer;
    const obj = app.currentObject;
    const currentFrame = app.currentFrame;
    const editingVariant = app.isEditingVariant;
    const variantData = editingVariant ? app.currentVariant : null;
    const variantLayer = editingVariant ? app.selectedVariantLayer : null;

    // ⚠️ `pixelVersion` is load-bearing in this dependency list — see above.
    const pixelVersion = domain.pixelVersion;
    const uniqueColorsData = useMemo(
      () =>
        !expanded
          ? NO_COLORS
          : extractLayerColors(
              layer,
              obj,
              currentFrame,
              { allFrames: allFramesMode, allLayers: allLayersMode },
              editingVariant,
              variantData,
              variantLayer,
            ),
      [
        expanded,
        layer,
        obj,
        currentFrame,
        allFramesMode,
        allLayersMode,
        editingVariant,
        variantData,
        variantLayer,
        pixelVersion,
      ],
    );

    /**
     * Display order: the 10 most recently used colours first, then the rest by
     * hue and darkest-to-lightest within each hue.
     *
     * ⚠️ A SEPARATE memo from the scan, and deliberately so. `colorHistory`
     * changes on every stroke, and the scan is the expensive half
     * (O(frames × layers × w × h)); folding the trail into the scan's
     * dependency list would re-walk every pixel each time the user paints with
     * a colour they had already used. Sorting a few hundred colours is cheap;
     * re-scanning the object is not.
     *
     * `session.colorHistory` is `observable.shallow`, so this tracks the array
     * identity — and `addToColorHistory` replaces the array wholesale rather
     * than mutating it, which is exactly the signal wanted here.
     */
    const colorHistory = session.colorHistory;
    const orderedColorsData = useMemo(
      () => ({
        colors: sortPaletteColors(uniqueColorsData.colors, colorHistory),
        count: uniqueColorsData.count,
      }),
      [uniqueColorsData, colorHistory],
    );

    // Transcribed from the component's pre-move `if (!project) return null`.
    if (!domain.hasProject) return null;

    return (
      <PaletteManager
        palettes={domain.palettes}
        /* ⚠️ `app.activeColor`, NOT `ui.tool.selectedColor` (plan 09, task 06).
           This prop is what `PaletteManager.handleAddCurrentColor` writes into
           a palette, so on the Fill tab it must be the FILL colour. Reading
           `selectedColor` here meant "add current colour to palette" always
           added the edge slot, whichever tab was open. */
        selectedColor={app.activeColor}
        /* ⚠️ `app.setActiveColor` honours `colorTarget`; the old
           `ui.tool.setColor` wrote the EDGE slot unconditionally (plan 09,
           task 06). The branch lives in the store — do NOT re-derive it here.

           This ONE callback serves BOTH consumer paths, so fixing it here
           fixes both: the real palette swatches (`PaletteManager.tsx`'s
           `onClick={() => onSelectColor(color)}`) and the pinned Current
           Palette row, which `PaletteManager` hands the same function.

           Side effect, and an intended one: the edge path now runs through
           `setColorAndAddToHistory`, so a palette pick finally lands in the
           recent-colours strip. It previously bypassed `colorHistory`
           entirely. The fill path deliberately still does not — see
           `ApplicationStore.setActiveColor`'s note on the asymmetry. */
        onSelectColor={(color) => app.setActiveColor(color)}
        onAddPalette={(name) => palettes.addPalette(name)}
        onDeletePalette={(id) => palettes.deletePalette(id)}
        onRenamePalette={(id, name) => palettes.renamePalette(id, name)}
        onAddColorToPalette={(id, color) =>
          palettes.addColorToPalette(id, color)
        }
        onRemoveColorFromPalette={(id, index) =>
          palettes.removeColorFromPalette(id, index)
        }
        currentPalette={{
          onExpandedChange: setExpanded,
          hasLayer: layer != null,
          uniqueColorsData: orderedColorsData,
          /* ⚠️ DELIBERATELY still `selectedColor`, not `app.activeColor`
             (plan 09, task 06). `CurrentPalette` uses this only to draw the ✎
             colour-ADJUSTMENT marker on the swatch that matches it, and
             adjustment is an edge-slot operation — `ColorPickerContainer`
             gates `colorAdjustment` to `colorTarget === "edge"` for the same
             reason. Following the target here would put the marker on a
             swatch no adjustment could ever act on. */
          currentPickerColor: ui.tool.selectedColor,
          colorAdjustment: Boolean(colorAdjustment),
          colorAdjustmentAllFrames: Boolean(colorAdjustment?.allFrames),
          colorAdjustmentAllLayers: Boolean(colorAdjustment?.allLayers),
          allFramesMode,
          onAllFramesModeChange: setAllFramesMode,
          allLayersMode,
          onAllLayersModeChange: setAllLayersMode,
          onStartColorAdjustment: (color, allFrames, allLayers) =>
            app.startColorAdjustment(color, allFrames, allLayers),
          onClearColorAdjustment: () => app.clearColorAdjustment(),
          onSaveAsPalette: (colors) => saveAsPalette(colors),
        }}
      />
    );

    /**
     * Freeze the live swatches into a real, permanent palette.
     *
     * ⚠️ Built from `addPalette` + N × `addColorToPalette` rather than a new
     * store action. `addPalette` seeds the palette with `DEFAULT_COLOR`
     * (`PaletteStore.addPalette`), so that seed is removed first — otherwise
     * every saved palette would carry a stray black swatch the user never
     * picked. Each call is its own non-undoable commit, which matches how the
     * five existing palette actions already behave (task 17, pinned).
     */
    function saveAsPalette(colors: Color[]) {
      if (colors.length === 0) return;
      const id = palettes.addPalette(`Palette ${domain.palettes.length + 1}`);
      // Drop the `DEFAULT_COLOR` seed — index 0, before anything is appended.
      palettes.removeColorFromPalette(id, 0);
      for (const color of colors) {
        palettes.addColorToPalette(id, color);
      }
    }
  },
);
