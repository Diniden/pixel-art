/**
 * HeaderContainer — the first observer-driven consumer of the MobX tree
 * (task 14).
 *
 * Reads the two SESSION fields `Header` needs — `saveStatus` (Header is its
 * sole reader) and `aiServiceUrl` — from `SessionStore` and passes them down
 * as plain props. Everything else in `Header` stays on Zustand for now; the
 * full Header purification is a later task.
 *
 * `observer()` may only be imported under `src/containers/` — task 05's
 * ESLint boundary enforces it.
 */
import { observer } from "mobx-react-lite";
import { Header } from "../components/Header/Header";
import { useSessionStore } from "../stores/context";

export const HeaderContainer = observer(function HeaderContainer() {
  const session = useSessionStore();
  return (
    <Header
      saveStatus={session.saveStatus}
      aiServiceUrl={session.aiServiceUrl}
    />
  );
});
