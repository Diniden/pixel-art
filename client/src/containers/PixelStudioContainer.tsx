/**
 * PixelStudioContainer — wires `PixelStudioLayout` to the store (task 37).
 *
 * Transcribed from `App.tsx:231-293`'s pixel-mode branch. Everything this file
 * does that is not "render a region container" is one of the three pieces of
 * ephemeral state `App` was holding, and each is kept here for a measured
 * reason.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `referenceImage` STAYS A `useState` CACHE — DO NOT MAKE IT A COMPUTED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ReferenceUIStore.currentReferenceImageData` looks like the obvious
 * replacement for this `useState`, and it is a trap. It is
 * `extractPixelsFromSelection(image, selection)` — **a canvas read-back**,
 * i.e. a `drawImage` plus a `getImageData` over the whole crop box, executed
 * on every access. As a computed read inside an `observer()` it would run on
 * every re-render of this container, which re-renders on every tool change,
 * every focus-mode toggle and every studio switch.
 *
 * The extraction is deliberately PULL-based (`ReferenceUIStore.shiftSelection`
 * returns the pixels rather than publishing them, and 16 call sites in
 * `ReferenceImagePanel` thread the result back through
 * `onReferenceImageChange`). This `useState` is that pull's cache, invalidated
 * by the handler below. `App.tsx:70-71`'s comment makes the same point; the
 * state is transcribed, not redesigned.
 *
 * ⚠️ It is NOT the deleted mirror task 29 removed. That was a copy of a store
 * field seeded from a modal's module singleton. This is a derived read-back.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE RESTORE EFFECT IS HERE, NOT IN `AppContainer`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `App.tsx:112-129` restored the reference image once the project loaded. It
 * belongs with the `useState` it seeds, and the `useState` belongs here — the
 * reference image is a pixel-studio concept and does not exist in lighting
 * mode. Hoisting the effect to `AppContainer` would mean hoisting the cache
 * too, and then threading it through a layout that has no prop for it.
 *
 * ⚠️ `hasRestoredReferenceRef` is transcribed WITH its known StrictMode
 * weakness (W2a's R11 list, site 2: it is set `true` before the async restore
 * and never reset on unmount, so a double-mount can skip the restore). Fixing
 * it is a behaviour change to the reference-image path and is **not** in this
 * task's scope; it is reported as an open item rather than silently altered.
 *
 * ── Region containers are rendered HERE, one per region ────────────────────
 *
 * Each stays its own `observer()` seam, exactly as tasks 27–36 built them.
 * This container re-renders on the three layout-shaping fields it reads
 * (`focusMode`, `frameReferencePanelVisible`, `canvasInfoHidden`) plus its own
 * two `useState`s — not on a palette change, not on a pixel edit.
 *
 * ── The canvas region is a `CanvasSplit` of `CanvasContainer`s ─────────────
 *
 * `app.canvasViews.openModes` (left→right) is the fourth thing this container
 * reads; it changes only on open / close / swap. One `CanvasContainer` is
 * rendered per open mode, and the pane `key` IS the mode string: a swap is
 * an array reorder with the same keys, so React moves the existing DOM nodes
 * and neither canvas remounts (offscreen caches, native gesture listeners and
 * each pane's camera all survive). Both panes get the same `referenceImage` /
 * `overlayFrameIndex` props — the Layer pane ignores the overlays, but a
 * uniform map is simpler than a branch. The split state itself is
 * session-only (D3): nothing here is persisted, so a reload comes back to a
 * single Full pane.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { PixelStudioLayout } from "../ui/layouts/PixelStudioLayout/PixelStudioLayout";
import { HeaderContainer } from "./HeaderContainer";
import { ToolbarContainer } from "./ToolbarContainer";
import { ObjectLibraryContainer } from "./ObjectLibraryContainer";
import { LayerPanelContainer } from "./LayerPanelContainer";
import { RightSidebarTopControlsContainer } from "./RightSidebarTopControlsContainer";
import { PixelStudioPanelContainer } from "./PixelStudioPanelContainer";
import { FrameTimelineContainer } from "./FrameTimelineContainer";
import { CanvasContainer } from "./CanvasContainer";
import { CanvasSplit } from "../ui/components/CanvasSplit/CanvasSplit";
import { CanvasInfoContainer } from "./CanvasInfoContainer";
import { FrameReferencePanelContainer } from "./FrameReferencePanelContainer";
import { ReferenceImagePanelContainer } from "./ReferenceImagePanelContainer";
import { useStores } from "../stores/context";
import { OtherHandRailContainer } from "./OtherHandRailContainer";
import { useRailLayout } from "./hooks/useRailLayout";
import type { ReferenceImageData } from "../types/referenceImage";

export const PixelStudioContainer = observer(function PixelStudioContainer() {
  const app = useStores();
  const railLayout = useRailLayout();
  const { ui, domain, referenceUI } = app;
  const { viewport, tool } = ui;

  const [referenceImage, setReferenceImage] =
    useState<ReferenceImageData | null>(null);
  const [overlayFrameIndex, setOverlayFrameIndex] = useState<number | null>(
    null,
  );
  const hasRestoredReferenceRef = useRef(false);

  // Handle reference image change - reset overlay and switch tool if needed.
  // Transcribed from `App.tsx:78-97`, with the two store reads repointed off
  // the bridge onto their MobX owners.
  const handleReferenceImageChange = useCallback(
    (data: ReferenceImageData | null) => {
      setReferenceImage(data);

      if (data === null) {
        // Reset overlay offset when reference is removed
        referenceUI.resetOverlay();

        // If trace tool was selected, switch to pixel tool
        if (tool.selectedTool === "reference-trace") {
          tool.setTool("pixel");
        }

        // Clear from project (task 29: a DomainStore action).
        void domain.saveReferenceImageToProject(null, null);
      }
    },
    [referenceUI, tool, domain],
  );

  // Restore the reference image from the project on first load.
  // `App.tsx:112-129`, with the same ref guard and the same once-only
  // semantics.
  //
  // ⚠️ The dependency is `loadGeneration`, not a `project` object.
  // `DomainStore` has no `project` field — task 23 split the tree into five
  // observable members, and `currentProject()` REBUILDS the whole thing on
  // every call, so depending on it would rebuild a 300,249-cell tree on every
  // render. `loadGeneration` is the counter the store bumps once per tree
  // install, which is exactly the "the project changed wholesale" signal
  // `App.tsx`'s `project` identity was standing in for.
  const loadGeneration = domain.loadGeneration;
  const hasProject = domain.hasProject;
  const hasStoredReference = domain.referenceImage !== undefined;
  useEffect(() => {
    if (hasRestoredReferenceRef.current || !hasProject) return;
    hasRestoredReferenceRef.current = true;

    if (hasStoredReference) {
      app
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
  }, [loadGeneration, hasProject, hasStoredReference, app]);

  // One pane per open render mode; key = mode (see the header block).
  const panes = app.canvasViews.openModes.map((mode) => ({
    key: mode,
    node: (
      <CanvasContainer
        renderMode={mode}
        referenceImage={referenceImage}
        onReferenceImageChange={handleReferenceImageChange}
        overlayFrameIndex={overlayFrameIndex}
      />
    ),
  }));

  // ⚠️ `toast` is pulled OUT of the spread and rendered as a sibling, not
  // passed to the layout. It is `position: fixed` over the whole window and
  // belongs to neither studio's arrangement — threading it through would put
  // a piece of transient chrome into the layout's prop surface, and both
  // layouts would have to carry a prop they only forward.
  const { toast, ...layoutProps } = railLayout;

  return (
    <>
    <PixelStudioLayout
      {...layoutProps}
      // `!== false` — the panel is visible when the key is absent
      // (`App.tsx:261`). The default is resolved here so the layout takes a
      // plain boolean.
      frameReferencePanelVisible={
        viewport.panels.frameReference.visible !== false
      }
      canvasInfoHidden={viewport.canvasInfoHidden}
      header={<HeaderContainer />}
      toolbar={
        <ToolbarContainer
          onReferenceImageChange={handleReferenceImageChange}
          hasReferenceImage={referenceImage !== null}
        />
      }
      objectLibrary={<ObjectLibraryContainer />}
      layerPanel={<LayerPanelContainer />}
      // Other Hand Mode: ONE section takes the whole rail, so the top
      // controls go and the studio panel becomes the thumb surface. Both
      // come back the moment the mode exits — nothing is unmounted for good.
      rightControls={
        ui.layout.otherHandActive ? null : <RightSidebarTopControlsContainer />
      }
      studioPanel={
        ui.layout.otherHandActive ? (
          <OtherHandRailContainer />
        ) : (
          <PixelStudioPanelContainer />
        )
      }
      timeline={<FrameTimelineContainer />}
      canvas={<CanvasSplit panes={panes} />}
      frameReferencePanel={
        <FrameReferencePanelContainer
          onOverlayChange={setOverlayFrameIndex}
          overlayFrameIndex={overlayFrameIndex}
        />
      }
      referenceImagePanel={
        <ReferenceImagePanelContainer
          referenceImage={referenceImage}
          onReferenceImageChange={handleReferenceImageChange}
        />
      }
      canvasInfo={<CanvasInfoContainer referenceImage={referenceImage} />}
    />
    {toast}
    </>
  );
});
