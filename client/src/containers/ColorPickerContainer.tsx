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
 *    `useEditorStore.setState({ colorAdjustment: null })`, i.e. MobX reaching
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
import { useEditorStore } from "../store";

export const ColorPickerContainer = observer(function ColorPickerContainer() {
  const { domain, session, ui } = useStores();

  // ⚠️ STILL ZUSTAND. W29d built the two seams this needed —
  // `PixelStore.resolveTargetFor(frameId, layerId)` and the
  // transaction-wrapped `PixelStore.adjustColorAcross`, which produces ONE
  // history entry across N layers — and they are tested. The blocker that
  // remains is NARROWER and is about the VARIANT path:
  //
  //   `adjustColorAcross` deliberately refuses variant layers. The legacy
  //   variant all-frames path keys its Map by the SYNTHETIC string
  //   `variant-frame-<index>`, which matches no `frame.id` anywhere in the
  //   tree, and replays ONE flat `affectedPixels` list into every variant
  //   frame — a different addressing model, not a special case of the
  //   per-frame Map.
  //
  // ⚠️ AND IT IS UNPINNED. `store/__tests__/colorAdjustment.test.ts` has 34
  // pins and NOT ONE of them exercises a variant. Routing `onAdjustColor` at
  // MobX today would move unpinned behaviour on the owner's real artwork,
  // which §10 rule 10 forbids. The variant path needs characterising FIRST.
  //
  // ⚠️ SEPARATELY — a live pre-existing defect, see the header note.
  //    `onSetColor` below calls `ui.tool.setColor` directly, and W29d MEASURED
  //    that a MobX-only `selectedColor` write is reverted by the next
  //    unrelated Zustand change (`zustandBridge.ts:334` re-hydrates the ~30 UI
  //    fields from `project.uiState` on EVERY change). Use
  //    `app.setColorAndAddToHistory` — which writes the source — when this
  //    container is next touched.
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
