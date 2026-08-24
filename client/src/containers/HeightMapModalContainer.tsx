/**
 * HeightMapModalContainer (REFRESH task 23).
 *
 * `HeightMapModal` is read-only against the store: it calls 4 getters and
 * returns its results through `onConfirm`. All four are now computeds, so the
 * container resolves them and passes plain values down.
 *
 * ⚠️ The modal's early `if (!isOpen) return null` sits AFTER its hooks and
 * after the store reads, so the container must supply these values even while
 * closed — it is rendered unconditionally by `LightingStudioTools` and
 * controlled by the `isOpen` prop.
 */
import { observer } from "mobx-react-lite";
import {
  HeightMapModal,
  type ChannelType,
} from "../ui/components/HeightMapModal/HeightMapModal";
import { useStores } from "../stores/context";

interface HeightMapModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    channel: ChannelType;
    min: number;
    max: number;
    applyToAllFrames: boolean;
  }) => void;
}

export const HeightMapModalContainer = observer(
  function HeightMapModalContainer(props: HeightMapModalContainerProps) {
    const app = useStores();
    return (
      <HeightMapModal
        {...props}
        layer={app.currentLayer}
        object={app.currentObject}
        editingVariant={app.isEditingVariant}
        variantData={app.currentVariant}
      />
    );
  },
);
