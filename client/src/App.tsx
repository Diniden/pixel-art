import { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from './store';
import { Canvas } from './components/Canvas/Canvas';
import { Toolbar } from './components/Toolbar/Toolbar';
import { ColorPicker } from './components/ColorPicker/ColorPicker';
import { PaletteManager } from './components/PaletteManager/PaletteManager';
import { LayerPanel } from './components/LayerPanel/LayerPanel';
import { LayerColors } from './components/LayerColors/LayerColors';
import { FrameTimeline } from './components/FrameTimeline/FrameTimeline';
import { ObjectLibrary } from './components/ObjectLibrary/ObjectLibrary';
import { Header } from './components/Header/Header';
import { ReferenceImageData } from './components/ReferenceImageModal/ReferenceImageModal';
import './App.css';

function App() {
  const { project, isLoading, initProject, setTool, resetReferenceOverlay, colorAdjustment, clearColorAdjustment } = useEditorStore();
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [referenceImage, setReferenceImage] = useState<ReferenceImageData | null>(null);

  // Handle reference image change - reset overlay and switch tool if needed
  const handleReferenceImageChange = useCallback((data: ReferenceImageData | null) => {
    setReferenceImage(data);

    if (data === null) {
      // Reset overlay offset when reference is removed
      resetReferenceOverlay();

      // If trace tool was selected, switch to pixel tool
      if (project?.uiState.selectedTool === 'reference-trace') {
        setTool('pixel');
      }
    }
  }, [project?.uiState.selectedTool, setTool, resetReferenceOverlay]);

  useEffect(() => {
    initProject();
  }, [initProject]);

  // Handle ESC key to clear color adjustment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && colorAdjustment) {
        e.preventDefault();
        clearColorAdjustment();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [colorAdjustment, clearColorAdjustment]);

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

  return (
    <div className="app">
      <Header />

      <div className="main-content">
        {/* Left Panel - Objects & Layers */}
        <aside className={`side-panel left-panel ${leftPanelOpen ? 'open' : 'collapsed'}`}>
          <button
            className="panel-toggle left-toggle"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            title={leftPanelOpen ? 'Collapse' : 'Expand'}
          >
            {leftPanelOpen ? '◀' : '▶'}
          </button>
          {leftPanelOpen && (
            <div className="panel-scroll">
              <ObjectLibrary />
              <LayerPanel />
            </div>
          )}
        </aside>

        {/* Center - Canvas & Toolbar */}
        <main className="canvas-area">
          <Toolbar
            onReferenceImageChange={handleReferenceImageChange}
            hasReferenceImage={referenceImage !== null}
          />
          <Canvas referenceImage={referenceImage} />
          <LayerColors />
        </main>

        {/* Right Panel - Colors & Palettes */}
        <aside className={`side-panel right-panel ${rightPanelOpen ? 'open' : 'collapsed'}`}>
          <button
            className="panel-toggle right-toggle"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title={rightPanelOpen ? 'Collapse' : 'Expand'}
          >
            {rightPanelOpen ? '▶' : '◀'}
          </button>
          {rightPanelOpen && (
            <div className="panel-scroll">
              <ColorPicker />
              <PaletteManager />
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Panel - Frame Timeline */}
      <footer className="bottom-panel">
        <FrameTimeline />
      </footer>
    </div>
  );
}

export default App;

