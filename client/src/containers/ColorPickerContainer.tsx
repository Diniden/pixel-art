/**
 * ColorPickerContainer (REFRESH task 36, W27).
 *
 * `ColorPicker` read 6 store members. It is now pure and lives at
 * `ui/components/ColorPicker/`; this container supplies all six.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ HYBRID ON PURPOSE — DO NOT "FINISH" THIS BY MOVING IT ALL TO MobX
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The colour-ADJUSTMENT lifecycle is still Zustand, and that is a measured
 * decision recorded on `PixelStore.adjustColor`, which is implemented and
 * tested but deliberately NOT wired:
 *
 *   1. `allFrames` mode is a MULTI-TARGET write — it recolours matching
 *      pixels across every frame and every same-named layer at once
 *      (`store/colorAdjustmentActions.ts:207-442`). Every `PixelStore` action
 *      writes exactly ONE target resolved from the current selection, so the
 *      all-frames case is a different action SHAPE, not a wiring gap.
 *   2. The legacy action also writes `uiState.selectedColor` in the same
 *      commit — a UI field `PixelStore` must not touch.
 *
 * Routing `onAdjustColor` at `PixelStore.adjustColor` would therefore compile
 * cleanly and silently break all-frames colour adjustment — the single-target
 * path would recolour only the current frame. `colorAdjustment` (the session
 * flag) has no MobX home yet either, for the same reason: the spec assigns
 * `startColorAdjustment` / `clearColorAdjustment` to the task that migrates
 * this lifecycle, which is NOT task 36.
 *
 * So: `selectedColor` and `colorHistory` come from MobX (both migrated);
 * `colorAdjustment`, `adjustColor` and `saveCurrentStateToHistory` stay on
 * Zustand until that task lands.
 *
 * ⚠️ `colorAdjustment` is projected to a BOOLEAN here. The component only ever
 * tests it for truthiness, and passing the raw object would leak a store node
 * into `ui/` — the container rule is "project to a flat view-model, never pass
 * a domain node".
 */
import { observer } from "mobx-react-lite";
import { ColorPicker } from "../ui/components/ColorPicker/ColorPicker";
import { useStores } from "../stores/context";
import { useEditorStore } from "../store";

export const ColorPickerContainer = observer(function ColorPickerContainer() {
  const { domain, session, ui } = useStores();

  // Still-Zustand half of the hybrid — see the note above.
  const colorAdjustment = useEditorStore((s) => s.colorAdjustment);
  const adjustColor = useEditorStore((s) => s.adjustColor);
  const saveCurrentStateToHistory = useEditorStore(
    (s) => s.saveCurrentStateToHistory,
  );

  // Transcribed from the component's pre-purification `if (!project) return null`.
  if (!domain.hasProject) return null;

  return (
    <ColorPicker
      selectedColor={ui.tool.selectedColor}
      colorHistory={session.colorHistory}
      colorAdjustment={Boolean(colorAdjustment)}
      onSetColor={(color) => ui.tool.setColor(color)}
      onAdjustColor={(color, trackHistory) => adjustColor(color, trackHistory)}
      onSaveStateToHistory={(label) => saveCurrentStateToHistory(label)}
    />
  );
});
