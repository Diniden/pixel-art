/**
 * useBrushHover — the brush canvas's hover marker (Brush Studio plan,
 * `docs/01-brush-studio`, task 21 lift; the code is task 16's).
 *
 * Lifted VERBATIM out of `BrushCanvasContainer` when task 21's selection
 * wiring pushed it past `max-lines`. The marker's FILL is painted 1:1 into
 * the hover canvas (`paintHoverCells`, magnified by the CSS scale); its
 * OUTLINE is SVG chrome (`hoverOutlineOverlay`) — the D5/D6 split
 * `CanvasSurface`'s header describes. Both are computed from one footprint
 * (`toolFootprint`) so they can never disagree.
 *
 * Store-free: no MobX, no store instance, no API. React, `ui/` painters and
 * the shape generators from `components/Canvas/drawingUtils` only.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Point } from "../../types";
import {
  getCirclePixels,
  getSquarePixels,
} from "../../components/Canvas/drawingUtils";
import { paintHoverCells } from "../../ui/canvas/render/renderHoverMarker";
import { toolFootprint } from "../../ui/canvas/tools/toolFootprint";
import type { BrushShape } from "../../ui/canvas/tools/toolFootprint";
import type { StampPoint } from "../../ui/canvas/tools/brushStamp";
import { hoverOutlineOverlay } from "../../ui/canvas/svg/chromeOverlay";
import type { SvgPathSpec } from "../../ui/canvas/svg/chromeOverlay";
import { useCanvasRender } from "../../ui/hooks/useCanvasRender";

/** Every painter here is 1:1 with the cells — see the container's header. */
const CELL_SCALE = 1;

export interface BrushHoverArgs {
  width: number;
  height: number;
  tool: string;
  /** The ACTIVE tool's diameter (`tool.activeToolBrushSize`). */
  brushSize: number;
  pencilShape: BrushShape;
  eraserShape: BrushShape;
}

export interface BrushHover {
  /** `CanvasSurface`'s hover canvas — the marker's fill surface. */
  hoverCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** De-duplicating setter: an equal cell keeps the previous object. */
  setHoverPixel: (p: Point | null) => void;
  /** The marker's outline for the SVG chrome; `null` with nothing to show. */
  hoverOutline: SvgPathSpec | null;
}

export function useBrushHover({
  width,
  height,
  tool,
  brushSize,
  pencilShape,
  eraserShape,
}: BrushHoverArgs): BrushHover {
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverPixel, setHoverPixelState] = useState<Point | null>(null);
  const setHoverPixel = useCallback((p: Point | null) => {
    setHoverPixelState((prev) =>
      prev === p || (prev && p && prev.x === p.x && prev.y === p.y) ? prev : p,
    );
  }, []);

  const resolveHoverCells = useCallback(
    (center: Point): StampPoint[] =>
      toolFootprint(center, {
        tool,
        brushSize,
        pencilShape,
        eraserShape,
        circle: getCirclePixels,
        square: getSquarePixels,
        gridWidth: width,
        gridHeight: height,
      }),
    [tool, brushSize, pencilShape, eraserShape, width, height],
  );

  const renderHover = useCallback(() => {
    const canvas = hoverCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!hoverPixel || width === 0 || height === 0) return;
    const cells = resolveHoverCells(hoverPixel);
    if (cells.length === 0) return;
    const buffer = ctx.createImageData(width, height);
    paintHoverCells(buffer, cells, CELL_SCALE);
    ctx.putImageData(buffer, 0, 0);
  }, [width, height, hoverPixel, resolveHoverCells]);
  useCanvasRender(renderHover, [renderHover]);

  const hoverOutline = useMemo(() => {
    if (!hoverPixel) return null;
    const cells = resolveHoverCells(hoverPixel);
    return cells.length > 0 ? hoverOutlineOverlay(cells) : null;
  }, [hoverPixel, resolveHoverCells]);

  return { hoverCanvasRef, setHoverPixel, hoverOutline };
}
