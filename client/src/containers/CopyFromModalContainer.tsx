/**
 * CopyFromModalContainer (REFRESH task 23).
 *
 * `CopyFromModal` reads 3 store members. `objects`/`variants` come from
 * `DomainStore` and `getCurrentObject` becomes the `currentObject` computed;
 * `copyLayerFromObject` is a layer-clipboard action that migrates with
 * `LayerStore` (task 25), so it stays on Zustand for now and the component
 * keeps reading it.
 */
import { observer } from "mobx-react-lite";
import { CopyFromModal } from "../components/CopyFromModal/CopyFromModal";
import { useStores } from "../stores/context";

interface CopyFromModalContainerProps {
  onClose: () => void;
}

export const CopyFromModalContainer = observer(
  function CopyFromModalContainer({ onClose }: CopyFromModalContainerProps) {
    const { domain, currentObject } = useStores();
    return (
      <CopyFromModal
        onClose={onClose}
        objects={domain.objects}
        variants={domain.variants}
        currentObject={currentObject}
      />
    );
  },
);
