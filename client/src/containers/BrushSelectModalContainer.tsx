/**
 * BrushSelectModalContainer (Brush Studio plan, `docs/01-brush-studio`,
 * task 17; MASTER D21).
 *
 * The brush counterpart of `ProjectSelectModalContainer`, and shaped exactly
 * like it: the five lifecycle `flow`s of `BrushStore` (task 07) are exposed
 * to the pure `BrushSelectModal` (task 13) as promise-returning callbacks via
 * `flowResult`, so the component's `await onSwitchBrush(...)` sites see the
 * boolean each flow resolves to. `true` closes the modal; `false` keeps it
 * open with an error, and the store has already `console.error`ed why.
 *
 * `onRenameBrush` and `onDeleteBrush` act on the CURRENT brush — the store's
 * flows take no name for the same reason (`renameBrush(newName)`,
 * `deleteBrush()`), so nothing is resolved here.
 *
 * `HeaderContainer` mounts this as the Header's `projectModal` in brush mode
 * (task 19). The component's `container?` portal target is left at its
 * `document.body` default: that prop exists for the Storybook `modalHost`
 * decorator and the jsdom suites, not for the app.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { flowResult } from "mobx";
import { BrushSelectModal } from "../ui/components/BrushSelectModal/BrushSelectModal";
import { useStores } from "../stores/context";

interface BrushSelectModalContainerProps {
  onClose: () => void;
}

export const BrushSelectModalContainer = observer(
  function BrushSelectModalContainer({
    onClose,
  }: BrushSelectModalContainerProps) {
    const { brushes } = useStores();
    return (
      <BrushSelectModal
        onClose={onClose}
        // `brushName` is `""` until a brush is loaded; the modal wants `null`
        // for "none", which is what gates its Rename row and Delete button.
        brushName={brushes.hasBrush ? brushes.brushName : null}
        // `brushList` is `observable.shallow`; hand over a plain array.
        brushList={brushes.brushList.slice()}
        onSwitchBrush={(name) => flowResult(brushes.switchBrush(name))}
        onCreateBrush={(name, width, height) =>
          flowResult(brushes.createBrush(name, width, height))
        }
        onRenameBrush={(newName) => flowResult(brushes.renameBrush(newName))}
        onDeleteBrush={() => flowResult(brushes.deleteBrush())}
        onRefreshBrushList={() => flowResult(brushes.refreshList())}
      />
    );
  },
);
