// index.css MUST stay the first import: it emits the design tokens and the
// global reset, which must land BEFORE any component's rules in the bundle.
// Importing it after the app tree reverses that order (task 09).
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// ⚠️ REFRESH task 37: `App.tsx` is DELETED. Its boot lifecycle is
// `AppContainer` — an observer that owns `initProject()`, the three load
// states, and the studio branch. The shell markup it used to hold is now
// `ui/components/AppShell` plus three pure layouts in `ui/layouts/`.
import { AppContainer } from "./containers/AppContainer";
import { ApplicationStore } from "./stores/ApplicationStore";
import { StoreProvider } from "./stores/context";
import { initTheme } from "./ui/theme/themes";

// Apply the stored theme preference (localStorage, a DEVICE preference —
// never part of the project's frozen uiState) before the first paint.
initTheme();

// The ONE ApplicationStore of the app, constructed here and passed in — never
// a module-level singleton (task 14). Tests and Storybook build their own.
// The Zustand bridge that used to be installed here retired with the legacy
// store (task 38): the ApplicationStore is self-hosting now.
const store = new ApplicationStore({ autoSaveEnabled: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <AppContainer />
    </StoreProvider>
  </StrictMode>,
);
