/**
 * CopyFromModalContainer (REFRESH task 23).
 *
 * `CopyFromModal` reads 3 store members. `objects`/`variants` come from
 * `DomainStore` and `getCurrentObject` becomes the `currentObject` computed;
 * `copyLayerFromObject` migrated to `LayerStore` with task 25, and the bridge
 * already delegates the Zustand action to it. Task 36 (W27) therefore routes
 * the component's last store read straight at `layers.copyLayerFromObject`
 * rather than through the bridge, and the component is now pure.
 *
 * ⚠️ The component's cursor-following tooltip was deliberately NOT replaced
 * with the `Tooltip` primitive — see the note on `Tooltip` in the component
 * for the two measured reasons.
 */
import { observer } from "mobx-react-lite";
import { CopyFromModal } from "../ui/components/CopyFromModal/CopyFromModal";
import { useStores } from "../stores/context";

interface CopyFromModalContainerProps {
  onClose: () => void;
}

export const CopyFromModalContainer = observer(function CopyFromModalContainer({
  onClose,
}: CopyFromModalContainerProps) {
  const { domain, currentObject, layers } = useStores();
  return (
    <CopyFromModal
      onClose={onClose}
      objects={domain.objects}
      variants={domain.variants}
      currentObject={currentObject}
      onCopyLayerFromObject={(
        sourceObjectId,
        sourceLayerId,
        isVariant,
        variantGroupId,
        variantId,
      ) =>
        layers.copyLayerFromObject(
          sourceObjectId,
          sourceLayerId,
          isVariant,
          variantGroupId,
          variantId,
        )
      }
    />
  );
});
