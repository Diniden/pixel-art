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
 *
 * ── W29c RE-VERIFIED this and left all three on Zustand ───────────────────
 *
 * W29c migrated the other Zustand consumers and stopped here, confirming the
 * above by direct measurement rather than inheriting it:
 *
 *  - `adjustColor` has NO bridge delegate at all (unlike the four other pixel
 *    actions, which `zustandBridge.ts` replaces at install time). Nothing in
 *    `stores/` implements it. `PixelStore.adjustColor` is single-target only.
 *  - `startColorAdjustment` / `clearColorAdjustment` have no MobX
 *    implementation either. The `clearColorAdjustment` found in `stores/` is
 *    NOT one — `zustandProjectHost.ts:150` is a callback that writes
 *    a legacy-hook `setState({ colorAdjustment: null })`, i.e. MobX reaching
 *    BACK into Zustand. The state itself lives only in Zustand.
 *  - `saveCurrentStateToHistory` wraps `HistoryStore.snapshot`, but the
 *    `store/index.ts:355` closure also runs `reconcile()` and
 *    `set(computeMirror())` — the Phase B mirror bookkeeping that keeps
 *    `projectHistory`/`historyIndex` correct while the bridge exists.
 *    Calling `history.snapshot()` directly would skip it.
 *
 * The unblocking work is W29b's stated remainder: a
 * `resolveTargetFor(frameId, layerId)` seam plus a transaction wrapper, and a
 * UI-store home for the lifecycle flag. That is a store-building task, not a
 * call-site change, so it was correctly out of W29c's scope.
 */
import { observer } from "mobx-react-lite";
import { ColorPicker } from "../ui/components/ColorPicker/ColorPicker";
import { useStores } from "../stores/context";
import { OTHER_HAND_SECTIONS } from "./otherHand/otherHandSections";

export const ColorPickerContainer = observer(function ColorPickerContainer() {
  const app = useStores();
  const { domain, session, ui } = app;

  // ✅ MIGRATED — W29h. The blocker recorded above and in the header was the
  // VARIANT path, and it was structural: `PixelStore.writeGridInAction` was
  // hard-wired to variant `layers[0]`, so W29g's pin ("all-frames variant
  // adjustment recolours EVERY layer of every variant frame") could not be
  // performed by the MobX engine at all. W29h added
  // `PixelTarget.variant.layerIndex`, `PixelStore.adjustVariantColorAcross`
  // and `ApplicationStore.adjustColor`, which dispatches over the four cases.
  //
  // ⚠️ AND THE VARIANT PATH IS NOW PINNED — W29g added 38 assertions on both
  // harness rows, which is what §10 rule 10 required before this could move.
  //
  // ⚠️ `adjustColor` writes `uiState.selectedColor` through the ZUSTAND
  // SOURCE (`publishSelectedColor`), not MobX-only. W29d measured that a
  // MobX-only `selectedColor` write is reverted by the next unrelated Zustand
  // change — `zustandBridge.ts:334` re-hydrates the ~30 UI fields from
  // `project.uiState` on EVERY change.
  //
  // ⚠️ `onSetColor` uses `setColorAndAddToHistory` for the same reason — the
  // live pre-existing defect the header notes, fixed here rather than left.
  // Unlike `adjustColor` it DOES prepend to `colorHistory`, which is
  // `toolActions.ts:111`'s behaviour for picking a colour.
  const colorAdjustment = ui.tool.colorAdjustment;

  // Transcribed from the component's pre-purification `if (!project) return null`.
  if (!domain.hasProject) return null;

  return (
    <ColorPicker
      /* ⚠️ The picker edits ONE slot at a time, and the two are written by
         DIFFERENT paths. `selectedColor` must go through the Zustand bridge
         (`setColorAndAddToHistory` / `adjustColor`) or the next unrelated
         Zustand change re-hydrates it away — see the note above. `fillColor`
         is MobX-only, has no legacy mirror, and is written directly. */
      target={ui.tool.colorTarget}
      onTargetChange={(target) => ui.tool.setColorTarget(target)}
      edgeColor={ui.tool.selectedColor}
      fillColor={ui.tool.fillColorOrSelected}
      selectedColor={
        ui.tool.colorTarget === "fill"
          ? ui.tool.fillColorOrSelected
          : ui.tool.selectedColor
      }
      colorHistory={session.colorHistory}
      colorAdjustment={ui.tool.colorTarget === "edge" && Boolean(colorAdjustment)}
      onSetColor={(color) =>
        ui.tool.colorTarget === "fill"
          ? ui.tool.setFillColor(color)
          : app.setColorAndAddToHistory(color)
      }
      onAdjustColor={(color, trackHistory) =>
        /* Colour ADJUSTMENT recolours existing pixels and is an edge-slot
           operation only: there is no "adjust every pixel of the fill colour"
           concept, and running it while the fill tab is open would silently
           recolour artwork the user was not looking at. On the fill tab the
           picker just sets the slot. */
        ui.tool.colorTarget === "fill"
          ? ui.tool.setFillColor(color)
          : app.adjustColor(color, trackHistory)
      }
      onSaveStateToHistory={(label) => app.saveStateToHistory(label)}
      onOtherHand={
        ui.layout.otherHandAvailable
          ? () => ui.layout.enterOtherHand(OTHER_HAND_SECTIONS.color)
          : undefined
      }
    />
  );
});
