import { useEffect, useState, useCallback, useRef } from "react";
import { useEditorStore } from "./store";
import { Canvas } from "./components/Canvas/Canvas";
import { LightingCanvas } from "./components/Canvas/LightingCanvas";
import { CanvasInfo } from "./components/Canvas/CanvasInfo";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { PixelStudioPanel } from "./components/PixelStudioPanel/PixelStudioPanel";
import { LightingStudioPanel } from "./components/LightingStudioPanel/LightingStudioPanel";
import { LayerPanel } from "./components/LayerPanel/LayerPanel";
import { LayerColors } from "./components/LayerColors/LayerColors";
import { FrameTimeline } from "./components/FrameTimeline/FrameTimeline";
import { ObjectLibrary } from "./components/ObjectLibrary/ObjectLibrary";
import { Header } from "./components/Header/Header";
import {
  ReferenceImageData,
  restoreReferenceImageFromProject,
  getCurrentReferenceImageData,
  saveReferenceImageToProject,
} from "./components/ReferenceImageModal/ReferenceImageModal";
import { FrameReferencePanel } from "./components/FrameReferencePanel/FrameReferencePanel";
import { ReferenceImagePanel } from "./components/ReferenceImagePanel/ReferenceImagePanel";
import { RightSidebarTopControls } from "./components/RightSidebarTopControls/RightSidebarTopControls";
import "./App.css";

function App() {
  const {
    project,
    isLoading,
    initProject,
    setTool,
    resetReferenceOverlay,
    colorAdjustment,
    clearColorAdjustment,
    toggleFocusMode,
    setStudioMode,
  } = useEditorStore();
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

        // Clear from project
        saveReferenceImageToProject(null, null);
      }
    },
    [project?.uiState.selectedTool, setTool, resetReferenceOverlay],
  );

  useEffect(() => {
    initProject();
  }, [initProject]);

  // Restore reference image from project when project first loads
  useEffect(() => {
    // Only restore once on initial load
    if (hasRestoredReferenceRef.current || !project) return;
    hasRestoredReferenceRef.current = true;

    if (project.referenceImage) {
      restoreReferenceImageFromProject()
        .then(() => {
          // Extract the reference image data from the restored persistent state
          const refData = getCurrentReferenceImageData();
          if (refData) {
            setReferenceImage(refData);
          }
        })
        .catch((error) => {
          console.error("Failed to restore reference image:", error);
        });
    }
  }, [project]);

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

  if (isLoading || !project) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
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
      <Header />

      <div className="main-content">
        {/* Left Panel - Objects & Layers */}
        {!isFocusMode && (
          <aside className="side-panel left-panel open">
            <div className="panel-scroll">
              <ObjectLibrary />
              <LayerPanel />
            </div>
          </aside>
        )}

        {/* Center - Canvas & Toolbar */}
        <main className="canvas-area">
          <Toolbar
            onReferenceImageChange={handleReferenceImageChange}
            hasReferenceImage={referenceImage !== null}
          />
          {isLightingMode ? (
            <LightingCanvas />
          ) : (
            <>
              <Canvas
                referenceImage={referenceImage}
                onReferenceImageChange={handleReferenceImageChange}
                overlayFrameIndex={overlayFrameIndex}
              />
              {project.uiState.frameReferencePanelVisible !== false && (
                <FrameReferencePanel
                  onOverlayChange={setOverlayFrameIndex}
                  overlayFrameIndex={overlayFrameIndex}
                />
              )}
              <ReferenceImagePanel
                referenceImage={referenceImage}
                onReferenceImageChange={handleReferenceImageChange}
                isReferenceTraceActive={
                  project.uiState.selectedTool === "reference-trace"
                }
                zoom={project.uiState.zoom ?? 10}
              />
            </>
          )}
          {!isLightingMode && <CanvasInfo referenceImage={referenceImage} />}
          {!isLightingMode && <LayerColors />}
        </main>

        {/* Right Panel - Colors & Palettes (Pixel) or Normal/Light Controls (Lighting) */}
        <aside className="side-panel right-panel open">
          <div className="panel-scroll">
            <RightSidebarTopControls />
            {isLightingMode ? <LightingStudioPanel /> : <PixelStudioPanel />}
          </div>
        </aside>
      </div>

      {/* Bottom Panel - Frame Timeline */}
      {!isFocusMode && (
        <footer className="bottom-panel">
          <FrameTimeline />
        </footer>
      )}
    </div>
  );
}

export default App;
