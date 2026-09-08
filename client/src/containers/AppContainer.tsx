/**
 * AppContainer — the application root (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 `client/src/App.tsx` NO LONGER EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It was 296 lines fusing five responsibilities. Where each went:
 *
 *   the shell markup       → `ui/components/AppShell`         (pure)
 *   the two studio pages   → `ui/layouts/{Pixel,Lighting}StudioLayout` (pure)
 *   the boot/error screen  → `ui/layouts/LoadingLayout`        (pure)
 *   the window hotkeys     → `containers/GlobalHotkeys`
 *   the reference-image
 *     cache + restore      → `containers/PixelStudioContainer`
 *   the region wiring      → `containers/{Pixel,Lighting}StudioContainer`
 *   the boot lifecycle     → **this file, all four lines of it**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE LOAD-STATE BRANCH IS R5's VISIBLE HALF — THREE STATES, NOT TWO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The spec's sketch is `if (domain.isLoading || !domain.project) return
 * <LoadingLayout />`. That collapses `failed` into `loading` and would show an
 * eternal spinner after a failed load — undoing the visible half of W10's R5
 * fix, the highest-severity bug the refresh closed. `App.tsx:195-226` has TWO
 * early returns and both are preserved:
 *
 *   `failed`     → the error page, with the disk-safety reassurance and Retry.
 *                  **No project is installed**, the auto-save gate stays shut,
 *                  and nothing can be written over the owner's real file.
 *   not `loaded` → the spinner.
 *
 * `isLoading` is a computed for `loadState === "loading"` and cannot express
 * "failed"; reading `loadState` directly is what makes the third state
 * representable. Retry re-runs the full init flow.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ StrictMode DOUBLE-INVOCATION IS HARMLESS HERE — BY THE STORE, NOT BY US
 * ══════════════════════════════════════════════════════════════════════════
 *
 * React 19's StrictMode fires the mount effect twice (W2a's R11 list, site 1 —
 * the single highest-risk site in that audit, because it is the data-loss
 * path). This effect has no cleanup and no abort, exactly as `App.tsx:99-106`
 * had none, and that is correct: `DomainStore.initProject()` returns
 * synchronously when `loadState` is already `loading` or `loaded`
 * (`DomainStore.ts:507`), so the second call cannot start a racing load whose
 * `set` lands last. The guard is in the store where every caller gets it, not
 * in this component where only this caller would.
 *
 * ── `GlobalHotkeys` mounts INSIDE the loaded branch ───────────────────────
 *
 * `App.tsx` registered the keydown listener before its early returns, so the
 * hotkeys were live during loading and after a failure. They are scoped to the
 * loaded state here because all three do nothing useful without a project:
 * focus mode and studio mode shape an editor that is not on screen, and
 * `colorAdjustment` cannot be non-null before a project exists. This is a
 * deliberate, reported behaviour change — the alternative is a window listener
 * that mutates persisted UI state while the error page is showing.
 */
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { LoadingLayout } from "../ui/layouts/LoadingLayout/LoadingLayout";
import { GlobalHotkeys } from "./GlobalHotkeys";
import { PixelStudioContainer } from "./PixelStudioContainer";
import { LightingStudioContainer } from "./LightingStudioContainer";
import { useStores } from "../stores/context";
import type { StudioMode } from "../types";

/**
 * Route the studio mode to its page. EXHAUSTIVE on purpose (brush-studio
 * task 03): the previous `=== "lighting" ? … : …` ternary would have shown
 * the pixel studio for any new mode without anyone noticing. The `never`
 * guard makes a fourth mode a compile error here.
 *
 * `"brush"` renders a placeholder until task 19 lands `BrushStudioContainer`.
 * It carries a Back button so a user who lands here (or reloads into a project
 * persisted with `studioMode: "brush"`) is never stranded. Inline `style` is
 * deliberate — no CSS file for markup task 19 deletes.
 */
function renderStudio(mode: StudioMode, onBackToPixel: () => void) {
  switch (mode) {
    case "pixel":
      return <PixelStudioContainer />;
    case "lighting":
      return <LightingStudioContainer />;
    case "brush":
      return (
        <div
          className="app__placeholder"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            height: "100vh",
            color: "var(--text-primary)",
            background: "var(--bg-primary)",
          }}
        >
          <p>Brush Studio — task 19</p>
          <button type="button" onClick={onBackToPixel}>
            Back to Pixel Studio
          </button>
        </div>
      );
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export const AppContainer = observer(function AppContainer() {
  const { domain, lightingUI } = useStores();

  useEffect(() => {
    void domain.initProject();
  }, [domain]);

  if (domain.loadState === "failed") {
    return (
      <LoadingLayout
        variant="failed"
        message={
          domain.loadError?.message ??
          "The server could not be reached or the project could not be read."
        }
        detail="Nothing has been changed on disk — your project file is untouched."
        onRetry={() => void domain.initProject()}
      />
    );
  }

  // ⚠️ `hasProject`, not `!domain.project`: `DomainStore` has NO `project`
  // field. Task 23 split the tree into five observable members precisely so a
  // reader could not touch the whole thing — `currentProject()` REBUILDS it
  // from those members on every call, so calling it in render would rebuild
  // the owner's 300,249-cell tree on every re-render. `hasProject` is the
  // computed that answers this question without materialising anything.
  if (domain.loadState !== "loaded" || !domain.hasProject) {
    return <LoadingLayout />;
  }

  return (
    <>
      <GlobalHotkeys />
      {renderStudio(lightingUI.studioMode, () =>
        lightingUI.setStudioMode("pixel"),
      )}
    </>
  );
});
