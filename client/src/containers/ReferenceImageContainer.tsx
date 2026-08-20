/**
 * ReferenceImageContainer (REFRESH task 29).
 *
 * Wires `ReferenceImageModal` — now pure presentation — to `ReferenceUIStore`
 * and `DomainStore`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS CONTAINER IS WHAT REPLACES A MODULE-LEVEL SINGLETON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The modal used to keep `image`/`imageUrl`/`selection` in a mutable object
 * declared above the component, because it returns `null` when closed and React
 * therefore discards its state on every close. The store now holds those three,
 * `observer()` here re-renders the modal when they change, and the lifetime is
 * a property of the store's scope rather than of a module global — so two
 * Storybook stories or two tests in one process no longer share an image.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { ReferenceImageModal } from "../ui/components/ReferenceImageModal/ReferenceImageModal";
import { useStores } from "../stores/context";
import type { ReferenceImageData } from "../types/referenceImage";

interface ReferenceImageContainerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReferenceImageData) => void;
}

export const ReferenceImageContainer = observer(
  function ReferenceImageContainer({
    isOpen,
    onClose,
    onConfirm,
  }: ReferenceImageContainerProps) {
    const { referenceUI, domain } = useStores();

    return (
      <ReferenceImageModal
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={onConfirm}
        image={referenceUI.image}
        imageUrl={referenceUI.imageUrl}
        selection={referenceUI.referenceImageSelection}
        onImageChange={(image, imageUrl, selection) =>
          referenceUI.setImage(image, imageUrl, selection)
        }
        onSelectionChange={(selection) => referenceUI.setSelection(selection)}
        onSave={(image, selection) => {
          void domain.saveReferenceImageToProject(image, selection);
        }}
      />
    );
  },
);
