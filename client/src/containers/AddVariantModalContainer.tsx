/**
 * AddVariantModalContainer (REFRESH task 28).
 *
 * `AddVariantModal` had 4 store members: three actions and ONE state read —
 * `project?.variants`, the only read among the four variant consumers that
 * was not already prop-driven. It becomes the `variants` prop, sourced from
 * `DomainStore.variants`.
 *
 * ⚠️ Project-level `variants` ONLY. Object-level `variantGroups` is the
 * pre-migration form and is set to `undefined` on load; nothing in the
 * migrated path reads it.
 *
 * The modal's 6 `useState` calls are its own dialog state and stay put — the
 * spec assigns inline-dialog extraction to a later task.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { AddVariantModal } from "../ui/components/AddVariantModal/AddVariantModal";
import { useStores } from "../stores/context";

interface AddVariantModalContainerProps {
  onClose: () => void;
}

export const AddVariantModalContainer = observer(
  function AddVariantModalContainer(props: AddVariantModalContainerProps) {
    const { domain, variants } = useStores();
    return (
      <AddVariantModal
        {...props}
        variants={domain.variants}
        onAddVariantLayerFromExisting={(
          groupId,
          selectedVariantId,
          addToAllFrames,
        ) =>
          variants.addVariantLayerFromExisting(
            groupId,
            selectedVariantId,
            addToAllFrames,
          )
        }
        onDeleteVariantGroup={(groupId) => variants.deleteVariantGroup(groupId)}
        onRenameVariantGroup={(groupId, name) =>
          variants.renameVariantGroup(groupId, name)
        }
      />
    );
  },
);
