/**
 * ObjectSelectModalContainer (REFRESH task 23).
 *
 * `ObjectSelectModal` reads exactly ONE store member (`project`) — the single
 * easiest purification in the codebase. It needs two things from the tree:
 * the object list, and the currently selected object id (for the "current"
 * marker), plus `variants` for its thumbnail renderer.
 *
 * The modal's own props (`selectedObjectId`, `onSelect`, `onClose`) come from
 * its PARENT's local state, so unlike `HeaderContainer` this container takes
 * props and forwards them.
 */
import { observer } from "mobx-react-lite";
import { ObjectSelectModal } from "../ui/components/ObjectSelectModal/ObjectSelectModal";
import { useStores } from "../stores/context";

interface ObjectSelectModalContainerProps {
  selectedObjectId: string | null;
  onSelect: (objectId: string | null) => void;
  onClose: () => void;
}

export const ObjectSelectModalContainer = observer(
  function ObjectSelectModalContainer(props: ObjectSelectModalContainerProps) {
    const { domain, selection } = useStores();
    return (
      <ObjectSelectModal
        {...props}
        objects={domain.objects}
        variants={domain.variants}
        currentObjectId={selection.selectedObjectId}
      />
    );
  },
);
