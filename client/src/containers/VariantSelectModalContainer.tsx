/**
 * VariantSelectModalContainer (REFRESH task 28).
 *
 * The easiest of the four variant consumers: `VariantSelectModal` had 5 store
 * members, all ACTIONS, and ZERO state coupling — `layer` and `variantGroup`
 * already arrived as props. So this container injects five callbacks and the
 * component now touches no store at all.
 *
 * All five are `VariantStore` domain actions. `selectVariant` is one of them
 * despite the task spec listing it as a `TimelineUIStore` move: it rewrites
 * `layer.selectedVariantId` across the objects tree, which is domain data.
 * See `VariantStore`'s header.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import type { Layer, VariantGroup } from "../types";
import { VariantSelectModal } from "../components/VariantSelectModal/VariantSelectModal";
import { useStores } from "../stores/context";

interface VariantSelectModalContainerProps {
  layer: Layer;
  variantGroup: VariantGroup;
  onClose: () => void;
}

export const VariantSelectModalContainer = observer(
  function VariantSelectModalContainer(
    props: VariantSelectModalContainerProps,
  ) {
    const { variants } = useStores();
    return (
      <VariantSelectModal
        {...props}
        onSelectVariant={(layerId, variantId) =>
          variants.selectVariant(layerId, variantId)
        }
        onAddVariant={(groupId, copyFromVariantId) =>
          variants.addVariant(groupId, copyFromVariantId)
        }
        onDeleteVariant={(groupId, variantId) =>
          variants.deleteVariant(groupId, variantId)
        }
        onRenameVariant={(groupId, variantId, name) =>
          variants.renameVariant(groupId, variantId, name)
        }
        onResizeVariant={(groupId, variantId, width, height, anchor) =>
          variants.resizeVariant(groupId, variantId, width, height, anchor)
        }
      />
    );
  },
);
