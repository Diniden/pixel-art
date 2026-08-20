import { useEffect, useState, useCallback, useRef } from "react";
import { useEditorStore } from "./store";
// ⚠️ REFRESH task 32: `components/Canvas/Canvas.tsx` is DELETED. The canvas
// is now `containers/CanvasContainer` (the observer) rendering
// `ui/components/CanvasSurface` (pure). This import swap is a REQUIRED
// consequence of the deletion, not a scope expansion — see the task 32
// report. `App.tsx` itself is decomposed by task 37.
import { CanvasContainer } from "./containers/CanvasContainer";
// ⚠️ REFRESH task 33: `components/Canvas/LightingCanvas.tsx` is DELETED too.
// Same shape as task 32's swap above, and the same justification — the gate is
// the deletion, so the one-line import change is a required consequence.
import { LightingCanvasContainer } from "./containers/LightingCanvasContainer";
import { CanvasInfoContainer } from "./containers/CanvasInfoContainer";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { PixelStudioPanel } from "./components/PixelStudioPanel/PixelStudioPanel";
import { LightingStudioPanel } from "./components/LightingStudioPanel/LightingStudioPanel";
import { LayerPanelContainer } from "./containers/LayerPanelContainer";
import { LayerColors } from "./components/LayerColors/LayerColors";
import { FrameTimelineContainer } from "./containers/FrameTimelineContainer";
import { ObjectLibraryContainer } from "./containers/ObjectLibraryContainer";
// Task 14: Header is rendered through its observer container, which feeds it
// `saveStatus` + `aiServiceUrl` from SessionStore.
import { HeaderContainer } from "./containers/HeaderContainer";
// ⚠️ TASK 29 — GATE 1: this file imports NOTHING from the reference-image
// modal's directory, and the gate is a literal grep, so that component's name
// must not appear anywhere in this file — including in a comment.
//
// It used to import FOUR symbols from that modal — a type plus three functions
// that read and wrote the modal's module-level `persistentState` singleton.
// `App` called the restore function to hydrate that global and then the getter
// to read it straight back out, i.e. the application ROOT used a leaf modal's
// global as a data-transfer object. That inverted import direction is what this
// task exists to remove.
//
// The type now comes from `types/`; the behaviour is `ApplicationStore
// .restoreReferenceImage()`, which composes `DomainStore` (owns the persisted
// base64) and `ReferenceUIStore` (owns the live image), neither importing the
// other.
import type { ReferenceImageData } from "./types/referenceImage";
import { FrameReferencePanelContainer } from "./containers/FrameReferencePanelContainer";
import { ReferenceImagePanelContainer } from "./containers/ReferenceImagePanelContainer";
import { useStores } from "./stores/context";
import { RightSidebarTopControlsContainer } from "./containers/RightSidebarTopControlsContainer";
import "./App.css";

function App() {
  const {
    project,
    // Phase B mirrors of DomainStore.loadState/loadError (task 16): App is not
    // a container, so it reads the mirrored copies the bridge maintains.
    loadState,
    loadErrorMessage,
    initProject,
    setTool,
    resetReferenceOverlay,
    colorAdjustment,
    clearColorAdjustment,
    toggleFocusMode,
    setStudioMode,
  } = useEditorStore();
  // Task 29: the MobX tree, for the reference-image restore/clear paths below.
  const appStore = useStores();
  // ⚠️ NOT the deleted mirror. Task 29 deletes `App`'s duplicate of
  // `referenceImage` — the copy that was SEEDED FROM THE MODAL'S SINGLETON.
  // This `useState` holds the EXTRACTED PIXELS (`ReferenceImageData`), which
  // are a canvas read-back derived from the store's image + crop box, not a
  // copy of any store field. Extraction is a pull, so the pulled result is
  // cached here and invalidated by the handler below. The singleton it used to
  // be seeded from is gone.
  const [referenceImage, setReferenceImage] =
    useState<ReferenceImageData | null>(null);
  const [overlayFrameIndex, setOverlayFrameIndex] = useState<number | null>(
    null,
  );
  const hasRestoredReferenceRef = useRef(false);

  // Handle reference image change - reset overlay and switch tool if needed
  const handleReferenceImageChange = useCallback(
    (data: ReferenceImageData | null) => {
      setReferenceImage(data);

      if (data === null) {
        // Reset overlay offset when reference is removed
        resetReferenceOverlay();

        // If trace tool was selected, switch to pixel tool
        if (project?.uiState.selectedTool === "reference-trace") {
          setTool("pixel");
        }

        // Clear from project (task 29: a DomainStore action, not a modal's
        // module-level function reaching into the store via getState()).
        void appStore.domain.saveReferenceImageToProject(null, null);
      }
    },
    [project?.uiState.selectedTool, setTool, resetReferenceOverlay],
  );

  useEffect(() => {
    // React 19 StrictMode fires this twice (W2a R11, site 1). The DomainStore
    // load-state machine makes that harmless: a second initProject() while
    // `loading` (or after `loaded`) is a synchronous no-op, so there is no
    // second racing load — and a FAILED load renders the error state below
    // instead of installing a blank default (R5).
    initProject();
  }, [initProject]);

  // Restore reference image from project when project first loads.
  //
  // Task 29: the two-step "hydrate the modal's singleton, then read it back"
  // dance is replaced by one store call that returns the extracted pixels.
  useEffect(() => {
    // Only restore once on initial load
    if (hasRestoredReferenceRef.current || !project) return;
    hasRestoredReferenceRef.current = true;

    if (project.referenceImage) {
      appStore
        .restoreReferenceImage()
        .then((refData) => {
          if (refData) {
            setReferenceImage(refData);
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to restore reference image:", error);
        });
    }
  }, [project, appStore]);

  // Handle ESC key to clear color adjustment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && colorAdjustment) {
        e.preventDefault();
        clearColorAdjustment();
      }

      // Shift + ` to cycle studio modes
      if (
        e.code === "Backquote" &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        // Ignore if user is typing in an input/textarea/contenteditable
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return;
        }

        e.preventDefault();
        setStudioMode(
          project?.uiState.studioMode === "lighting" ? "pixel" : "lighting",
        );
        return;
      }

      // ` to toggle focus mode (hide left + bottom panels)
      if (
        (e.code === "Backquote" || e.key === "`") &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        // Ignore if user is typing in an input/textarea/contenteditable
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return;
        }

        e.preventDefault();
        toggleFocusMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    colorAdjustment,
    clearColorAdjustment,
    toggleFocusMode,
    setStudioMode,
    project?.uiState.studioMode,
  ]);

  if (loadState === "failed") {
    // R5: a failed load is an ERROR, never an empty editor. No project is
    // installed, the auto-save gate stays shut, and nothing can be written
    // over the real file. Retry re-runs the full init flow.
    return (
      <div className="app__loading">
        <div className="app__loading-content">
          <h2>Project failed to load</h2>
          <p>
            {loadErrorMessage ??
              "The server could not be reached or the project could not be read."}
          </p>
          <p>
            Nothing has been changed on disk — your project file is untouched.
          </p>
          <button onClick={() => initProject()}>Retry</button>
        </div>
      </div>
    );
  }

  if (loadState !== "loaded" || !project) {
    return (
      <div className="app__loading">
        <div className="app__loading-content">
          <div className="app__loading-spinner"></div>
          <h2>Loading Pixel Art Editor</h2>
          <p>Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  const isLightingMode = project.uiState.studioMode === "lighting";
  const isFocusMode = project.uiState.focusMode ?? false;

  return (
    <div className="app">
      <HeaderContainer />

      <div className="app__main">
        {/* Left Panel - Objects & Layers */}
        {!isFocusMode && (
          <aside className="app__side-panel app__side-panel--left app__side-panel--open">
            <div className="app__panel-scroll">
              <ObjectLibraryContainer />
              <LayerPanelContainer />
            </div>
          </aside>
        )}

        {/* Center - Canvas & Toolbar */}
        <main className="app__canvas-area canvas-area">
          <Toolbar
            onReferenceImageChange={handleReferenceImageChange}
            hasReferenceImage={referenceImage !== null}
          />
          {isLightingMode ? (
            <LightingCanvasContainer />
          ) : (
            <>
              <CanvasContainer
                referenceImage={referenceImage}
                onReferenceImageChange={handleReferenceImageChange}
                overlayFrameIndex={overlayFrameIndex}
              />
              {project.uiState.frameReferencePanelVisible !== false && (
                <FrameReferencePanelContainer
                  onOverlayChange={setOverlayFrameIndex}
                  overlayFrameIndex={overlayFrameIndex}
                />
              )}
              <ReferenceImagePanelContainer
                referenceImage={referenceImage}
                onReferenceImageChange={handleReferenceImageChange}
              />
            </>
          )}
          {!isLightingMode && <CanvasInfoContainer referenceImage={referenceImage} />}
          {!isLightingMode && <LayerColors />}
        </main>

        {/* Right Panel - Colors & Palettes (Pixel) or Normal/Light Controls (Lighting) */}
        <aside className="app__side-panel app__side-panel--right app__side-panel--open">
          <div className="app__panel-scroll">
            <RightSidebarTopControlsContainer />
            {isLightingMode ? <LightingStudioPanel /> : <PixelStudioPanel />}
          </div>
        </aside>
      </div>

      {/* Bottom Panel - Frame Timeline */}
      {!isFocusMode && (
        <footer className="app__bottom">
          <FrameTimelineContainer />
        </footer>
      )}
    </div>
  );
}

export default App;
