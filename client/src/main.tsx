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
import { bindBrowserZoomSuppression } from "./ui/hooks/useSuppressBrowserZoom";

// Apply the stored theme preference (localStorage, a DEVICE preference —
// never part of the project's frozen uiState) before the first paint.
initTheme();

// Kill iOS page zoom for the whole document, before the first touch can land.
// Bound here rather than inside a component so it also holds during the boot
// and error states — which is exactly where a stuck user taps hardest. This is
// HALF the fix; `styles/reset.css`'s `touch-action: none` under
// `@media (pointer: coarse)` is the other half, and neither works alone on
// iOS. Never unbound: its lifetime is the document's.
bindBrowserZoomSuppression();

// The ONE ApplicationStore of the app, constructed here and passed in — never
// a module-level singleton (task 14). Tests and Storybook build their own.
// The Zustand bridge that used to be installed here retired with the legacy
// store (task 38): the ApplicationStore is self-hosting now.
// `syncEnabled` opens the cross-instance websocket: when another tab saves,
// this one reloads from the server. Only the real app opts in — tests and
// Storybook must not acquire a socket implicitly.
const store = new ApplicationStore({
  autoSaveEnabled: true,
  syncEnabled: true,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <AppContainer />
    </StoreProvider>
  </StrictMode>,
);
