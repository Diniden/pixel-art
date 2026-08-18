/**
 * BrowseBackupsModalContainer (REFRESH task 23).
 *
 * `BrowseBackupsModal` reads 2 store members. Its direct API calls were
 * already routed through `backupApi` by task 15, so only `projectName` (a
 * Phase B field) and `restoreFromBackup` (a `DomainStore` flow) move here.
 *
 * ⚠️ `projectName` is also the modal's effect DEPENDENCY, so passing it as a
 * plain prop preserves the refetch semantics exactly.
 */
import { observer } from "mobx-react-lite";
import { flowResult } from "mobx";
import { BrowseBackupsModal } from "../components/BrowseBackupsModal/BrowseBackupsModal";
import { useDomainStore } from "../stores/context";

interface BrowseBackupsModalContainerProps {
  onClose: () => void;
}

export const BrowseBackupsModalContainer = observer(
  function BrowseBackupsModalContainer({
    onClose,
  }: BrowseBackupsModalContainerProps) {
    const domain = useDomainStore();
    return (
      <BrowseBackupsModal
        onClose={onClose}
        projectName={domain.projectName}
        onRestoreFromBackup={(date, filename) =>
          flowResult(domain.restoreFromBackup(date, filename))
        }
      />
    );
  },
);
