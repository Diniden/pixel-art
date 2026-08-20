/**
 * BrowseBackupsModalContainer (REFRESH task 23).
 *
 * `BrowseBackupsModal` reads 2 store members. Its direct API calls were
 * already routed through `backupApi` by task 15, so only `projectName` (a
 * Phase B field) and `restoreFromBackup` (a `DomainStore` flow) move here.
 *
 * ⚠️ `projectName` is also the modal's effect DEPENDENCY, so passing it as a
 * plain prop preserves the refetch semantics exactly.
 *
 * REFRESH task 36 (W27): the modal's remaining `backupApi.list` call moved
 * here as the `loadBackups` prop — the last thing keeping it out of `ui/`.
 * `loadBackups` is a module-level binding, NOT an inline arrow, because it is
 * one of the modal's effect dependencies; a fresh identity each render would
 * refire the list fetch and abort the in-flight request every parent render.
 *
 * The rejection contract from task 15 is preserved deliberately: this passes
 * `backupApi.list` straight through, so a server error still THROWS rather
 * than resolving to `[]`. Do not add a `.catch(() => [])` here — that
 * reintroduces the bug where a failed load rendered as "no backups" and read
 * to the user as "your backups are gone".
 */
import { observer } from "mobx-react-lite";
import { flowResult } from "mobx";
import { backupApi } from "../api";
import { BrowseBackupsModal } from "../ui/components/BrowseBackupsModal/BrowseBackupsModal";
import { useDomainStore } from "../stores/context";

interface BrowseBackupsModalContainerProps {
  onClose: () => void;
}

/** Stable identity — see the effect-dependency note above. */
const loadBackups = (projectName: string, signal: AbortSignal) =>
  backupApi.list(projectName, signal);

export const BrowseBackupsModalContainer = observer(
  function BrowseBackupsModalContainer({
    onClose,
  }: BrowseBackupsModalContainerProps) {
    const domain = useDomainStore();
    return (
      <BrowseBackupsModal
        onClose={onClose}
        loadBackups={loadBackups}
        projectName={domain.projectName}
        onRestoreFromBackup={(date, filename) =>
          flowResult(domain.restoreFromBackup(date, filename))
        }
      />
    );
  },
);
