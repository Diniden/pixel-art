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
 * Thin by design — see `LightingStudioPanelContainer`.
 */
import { observer } from "mobx-react-lite";
import { NormalPicker } from "../components/LightingStudioPanel/NormalPicker";

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
    return (
      <NormalPicker
        isLightDirection={false}
        enableScrollControl={enableScrollControl}
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
    return (
      <NormalPicker
        isLightDirection
        enableScrollControl={enableScrollControl}
      />
    );
  },
);
