/**
 * NormalPicker's TWO containers (REFRESH task 27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ ONE COMPONENT, TWO INDEPENDENT STORE FIELDS — AND TWO CONTAINERS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `NormalPicker` is a normal-sphere widget that drives EITHER
 * `selectedNormal` (the normal the pencil stamps) OR `lightDirection` (where
 * the preview light comes from), selected by its `isLightDirection` prop. The
 * two are unrelated settings that happen to share a picker.
 *
 * The task spec flags this as the easy mistake in the whole task: wiring the
 * wrong field — or, worse, wiring both containers to the SAME field — is
 * invisible. The picker still looks and behaves correctly; the two settings
 * simply start tracking each other, and the user discovers it when moving the
 * light also rotates every normal they are about to paint.
 *
 * So each field gets its OWN named container, and the choice is made here,
 * once, rather than at each of the call sites. The independence itself is
 * pinned in `LightingUIStore.test.ts` ("NormalPicker's two fields are
 * INDEPENDENT"), in both directions and at the wire-format level.
 *
 * ── REFRESH task 36 (W27) ─────────────────────────────────────────────────
 *
 * The component no longer chooses the field. It used to read
 * `project.uiState[isLightDirection ? "lightDirection" : "selectedNormal"]`
 * ITSELF and pick between two setters; now each container passes the `normal`
 * and the `onNormalChange` callback directly.
 *
 * That upgrades task 27's warning from a tested invariant to a STRUCTURAL
 * one: the component cannot reach the wrong field any more, because it can no
 * longer reach any field. `isLightDirection` survives as presentation only —
 * header label and indicator colour.
 */
import { observer } from "mobx-react-lite";
import { NormalPicker } from "../ui/components/LightingStudioPanel/NormalPicker";
import { useStores } from "../stores/context";

interface NormalPickerContainerProps {
  /** Mouse-wheel adjusts the normal's z. Off by default, as in the component. */
  enableScrollControl?: boolean;
}

/**
 * Drives **`selectedNormal`** — the normal the lighting pencil stamps.
 * `isLightDirection` is pinned `false` here; do not make it a prop.
 */
export const SelectedNormalPickerContainer = observer(
  function SelectedNormalPickerContainer({
    enableScrollControl,
  }: NormalPickerContainerProps) {
    const { lightingUI } = useStores();
    return (
      <NormalPicker
        isLightDirection={false}
        enableScrollControl={enableScrollControl}
        normal={lightingUI.selectedNormal}
        onNormalChange={(normal) => lightingUI.setSelectedNormal(normal)}
      />
    );
  },
);

/**
 * Drives **`lightDirection`** — where the preview light comes from.
 * `isLightDirection` is pinned `true` here; do not make it a prop.
 */
export const LightDirectionPickerContainer = observer(
  function LightDirectionPickerContainer({
    enableScrollControl,
  }: NormalPickerContainerProps) {
    const { lightingUI } = useStores();
    return (
      <NormalPicker
        isLightDirection
        enableScrollControl={enableScrollControl}
        normal={lightingUI.lightDirection}
        onNormalChange={(normal) => lightingUI.setLightDirection(normal)}
      />
    );
  },
);
