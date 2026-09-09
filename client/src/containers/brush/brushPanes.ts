/**
 * brushPanes — the per-pane pieces of the brush split view (Brush follow-ups,
 * `docs/11-brush-studio-followups`, task 09; MASTER D5).
 *
 * `BrushStudioContainer` shows one or two `BrushCanvasContainer` panes, keyed
 * by `CanvasRenderMode`: **Full** composites every visible layer of the
 * selected frame, **Layer** shows ONLY the selected layer. What differs per
 * pane is a pure function of the mode, so it lives here rather than in the
 * container (which is at its `max-lines` budget):
 *
 * - `brushPaneControls` — Reset plus the "Open Layer view / Swap pane sides /
 *   Close" buttons for `CanvasViewControls`, built exactly as the pixel canvas
 *   does (`CanvasContainer.tsx`, "Mode button … above close … above reset")
 *   but against `app.brushViews`. The caller is the observer: it reads
 *   `views.bothOpen` through this call during render, so a change re-renders.
 * - `brushPaneScene` — what the compositor gets: the frame's layers as they
 *   are for Full; for Layer, the selected layer alone and FORCED visible (the
 *   Layer pane shows what the layer holds even when the eye is off — the pixel
 *   canvas's layer plan does the same). Others are hidden, not dimmed.
 * - `useBrushPaneRender` — the pane's compositor: the 1:1 frame canvas, the
 *   reused RGBA buffer, `renderBrushFrame` over the scene, the shape preview
 *   on top, scheduled through `useCanvasRender`. THE ONLY place a brush grid
 *   is read (`BrushCanvasContainer`'s header, "rAF-scheduled redraw"): the
 *   document is read through `source.document` at paint time, from inside the
 *   scheduled frame, never during a React render, so no grid is ever observed.
 *
 * Store-free in the sense the sibling hooks are: the views arrive as the
 * narrow `BrushPaneViews` interface and the document as a `{ document }`
 * source — both the slices of a store a pane needs, typed structurally.
 * `brushPaneScene` copies one layer object shallowly at most; its `pixels`
 * grid is the same reference, never observed, never cloned.
 */
import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import type { CanvasRenderMode } from "../../stores/ui/CanvasViewsUIStore";
import type { BrushDocument, Point } from "../../types";
import type { CanvasViewControlsProps } from "../../ui/components/CanvasViewControls/CanvasViewControls";
import { renderBrushFrame } from "../../ui/canvas/render/renderBrushFrame";
import type { BrushSceneLayer } from "../../ui/canvas/render/renderBrushFrame";
import { useCanvasRender } from "../../ui/hooks/useCanvasRender";
import { paintShapePreview } from "./brushToolContext";
import type { BrushShapeSlots, ShapeOutlineKeys } from "./brushToolContext";

/** The slice of `CanvasViewsUIStore` a pane's controls read and drive. */
export interface BrushPaneViews {
  readonly bothOpen: boolean;
  openMode(mode: CanvasRenderMode): void;
  closeMode(mode: CanvasRenderMode): void;
  swap(): void;
}

/**
 * `CanvasViewControls`' props for the pane in `renderMode`: reset, the mode
 * button (open the other pane, or swap sides when both are open) and the
 * close button (only when both are open).
 */
export function brushPaneControls(
  views: BrushPaneViews,
  renderMode: CanvasRenderMode,
  onResetView: () => void,
): CanvasViewControlsProps {
  const layerMode = renderMode === "layer";
  const otherMode: CanvasRenderMode = layerMode ? "full" : "layer";
  const modeButton = views.bothOpen
    ? {
        kind: "swap" as const,
        label: "Swap pane sides",
        onClick: () => views.swap(),
      }
    : {
        kind: "open" as const,
        label: layerMode ? "Open Full view" : "Open Layer view",
        onClick: () => views.openMode(otherMode),
      };
  const onClose = views.bothOpen
    ? {
        label: layerMode ? "Close Layer view" : "Close Full view",
        onClick: () => views.closeMode(renderMode),
      }
    : undefined;
  return { onResetView, modeButton, onClose };
}

/** A layer with an id — `BrushLayer`, or any test double shaped like one. */
export interface BrushPaneLayer extends BrushSceneLayer {
  readonly id: string;
}

/** The slice of a document the scene needs — `BrushDocument` fits. */
export interface BrushPaneDocument {
  readonly frames: ReadonlyArray<{
    readonly id: string;
    readonly layers: ReadonlyArray<BrushPaneLayer>;
  }>;
}

/**
 * The layers a pane composites, or `null` when there is nothing to draw (no
 * document, no such frame). `layerId === null` is the Full pane: the frame's
 * layers untouched (the compositor skips hidden ones). Otherwise the Layer
 * pane: the one layer with that id, visible regardless of its eye flag;
 * nothing at all if the id is not in this frame.
 */
export function brushPaneScene(
  doc: BrushPaneDocument | null,
  frameId: string | null,
  layerId: string | null,
): ReadonlyArray<BrushSceneLayer> | null {
  const frame = doc?.frames.find((f) => f.id === frameId);
  if (!frame) return null;
  if (layerId === null) return frame.layers;
  const layer = frame.layers.find((l) => l.id === layerId);
  if (!layer) return [];
  return layer.visible ? [layer] : [{ ...layer, visible: true }];
}

export interface BrushPaneRenderArgs {
  /** `brushes` — its `document` is read at paint time, never during render. */
  source: { readonly document: BrushDocument | null };
  selectedFrameId: string | null;
  /** The Layer pane's selected layer; `null` = the Full pane. */
  layerId: string | null;
  width: number;
  height: number;
  /** The open shape preview, colourised per pixel as the commit would land. */
  previewPixels: ReadonlyArray<Point>;
  outlineKeysRef: MutableRefObject<ShapeOutlineKeys | null>;
  shapeSlots: BrushShapeSlots;
  /** The redraw signals. */
  pixelVersion: number;
  domainVersion: number;
}

export interface BrushPaneRender {
  /** `CanvasSurface`'s `registerLayerCanvas`: the one frame canvas, id ignored. */
  registerLayerCanvas: (id: string, el: HTMLCanvasElement | null) => void;
}

/** The pane's compositor — see the module header. */
export function useBrushPaneRender({
  source,
  selectedFrameId,
  layerId,
  width,
  height,
  previewPixels,
  outlineKeysRef,
  shapeSlots,
  pixelVersion,
  domainVersion,
}: BrushPaneRenderArgs): BrushPaneRender {
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The `width × height` RGBA buffer, reused across frames of the same size. */
  const bufferRef = useRef<ImageData | null>(null);

  const renderFrame = useCallback(() => {
    const canvas = frameCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);

    const layers = brushPaneScene(source.document, selectedFrameId, layerId);
    if (!layers || width === 0 || height === 0) return;

    let buffer = bufferRef.current;
    if (!buffer || buffer.width !== width || buffer.height !== height) {
      buffer = ctx.createImageData(width, height);
      bufferRef.current = buffer;
    }
    // `ImageData` IS a `PixelBuffer`, structurally; the compositor clears it.
    renderBrushFrame(buffer, { layers, width, height });
    ctx.putImageData(buffer, 0, 0);

    // The shape preview, colourised per pixel as the selected layer would
    // show the commit — edge and fill from the same split as the commit.
    paintShapePreview(ctx, {
      points: previewPixels,
      outlineKeys: outlineKeysRef.current,
      slots: shapeSlots,
      width,
      height,
    });
  }, [
    source,
    selectedFrameId,
    layerId,
    width,
    height,
    previewPixels,
    outlineKeysRef,
    shapeSlots,
  ]);
  useCanvasRender(renderFrame, [renderFrame, pixelVersion, domainVersion]);

  const registerLayerCanvas = useCallback(
    (_id: string, el: HTMLCanvasElement | null) => {
      frameCanvasRef.current = el;
    },
    [],
  );

  return { registerLayerCanvas };
}
