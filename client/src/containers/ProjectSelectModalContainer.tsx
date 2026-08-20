/**
 * ProjectSelectModalContainer (REFRESH task 23).
 *
 * `ProjectSelectModal` reads 6 store members; 4 of them are the async
 * project-lifecycle actions that became `flow`s on `DomainStore` in task 16,
 * and `projectName`/`projectList` are Phase B fields it already owns.
 *
 * The flows are exposed as promise-returning callbacks (`flowResult`), so the
 * component's existing `await switchToProject(...)` call sites keep working
 * with no change in shape.
 */
import { observer } from "mobx-react-lite";
import { flowResult } from "mobx";
import { ProjectSelectModal } from "../ui/components/ProjectSelectModal/ProjectSelectModal";
import { useDomainStore } from "../stores/context";

interface ProjectSelectModalContainerProps {
  onClose: () => void;
}

export const ProjectSelectModalContainer = observer(
  function ProjectSelectModalContainer({
    onClose,
  }: ProjectSelectModalContainerProps) {
    const domain = useDomainStore();
    return (
      <ProjectSelectModal
        onClose={onClose}
        projectName={domain.projectName}
        projectList={domain.projectList.slice()}
        onSwitchProject={(name) => flowResult(domain.switchProject(name))}
        onCreateProject={(name) => flowResult(domain.createProject(name))}
        onDeleteProject={() => flowResult(domain.deleteProject())}
        onRefreshProjectList={() => flowResult(domain.refreshProjectList())}
      />
    );
  },
);
