/**
 * BrushLibraryContainer (Brush Studio plan, `docs/01-brush-studio`, task 17;
 * MASTER D16).
 *
 * The brush counterpart of `ObjectLibraryContainer`: wires the pure
 * `BrushLibrary` (task 13) to `BrushStore` (task 07). The rail lists brush
 * FILE names; only the loaded brush is in memory, so exactly one row carries
 * a thumbnail and a `W×H` badge, and both come from `brushes.document`.
 *
 * ── The thumbnail is a `draw` closure, painted HERE ───────────────────────
 *
 * `renderBrushFrame` walks every layer grid of the selected frame, and a grid
 * may not cross into `ui/` (MASTER §8, the same rule that keeps `Layer` out
 * of `LayerRow`). `makeBrushThumbnailDraw` binds the document on this side
 * and hands `ui/` a closure; `ThumbnailCanvas` ignores the closure's identity
 * and repaints only when `thumbnailRevision` changes — which is what replaces
 * a `React.memo` comparator, and why none may be added (see
 * `ObjectLibraryContainer`'s header for the regression that rule closes).
 *
 * Task 18 builds the per-cell timeline version of this painter in
 * `containers/hooks/brushCellThumbnail.ts`; this one stays local because it
 * paints a whole composited frame, not one layer.
 *
 * ── ⚠️ The revision carries the SELECTED FRAME, not only the counters ─────
 *
 * The task file says `pixelVersion + domainVersion`. Those two say when the
 * DOCUMENT changed; the thumbnail also depends on WHICH frame is selected,
 * and `brushUI.selectFrame` bumps neither counter. With the counters alone,
 * stepping the timeline would leave the rail showing the previous frame
 * until the next edit. The frame index is therefore folded into the low
 * bits of the revision so a frame change is a content change. Loading a
 * different brush needs no term of its own: the row is keyed by name, so the
 * canvas remounts and repaints regardless.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { flowResult } from "mobx";
import { BrushLibrary } from "../ui/components/BrushLibrary/BrushLibrary";
import {
  createBrushBuffer,
  renderBrushFrame,
} from "../ui/canvas/render/renderBrushFrame";
import { useStores } from "../stores/context";
import type { BrushDocument } from "../types";

/**
 * How many frame indices the revision reserves below each version step.
 * 65,536 frames per brush is far beyond anything the timeline will hold, and
 * the product stays well inside `Number.MAX_SAFE_INTEGER` for any session.
 */
const REVISION_FRAME_SLOTS = 1 << 16;

/** The frame `frameId` names, else the first frame; `null` when none. */
function resolveFrameIndex(doc: BrushDocument, frameId: string | null): number {
  const index = doc.frames.findIndex((f) => f.id === frameId);
  return index >= 0 ? index : doc.frames.length > 0 ? 0 : -1;
}

/**
 * Builds the `draw(ctx, size)` closure for the loaded brush's thumbnail:
 * composites the selected frame through `renderBrushFrame` at 1:1, blits it
 * through an offscreen canvas, then scales it into `size × size` with
 * smoothing OFF (pixel art) and centred, `renderFramePreview`-style (the
 * smaller of the two axis ratios, so a non-square brush fits its box).
 *
 * Rebuilt on every render; that is free by design (see the header).
 */
function makeBrushThumbnailDraw(
  doc: BrushDocument,
  frameIndex: number,
): (ctx: CanvasRenderingContext2D, size: number) => void {
  return (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const frame = doc.frames[frameIndex];
    const { width, height } = doc;
    if (!frame || width < 1 || height < 1) return;

    const buffer = renderBrushFrame(createBrushBuffer(width, height), {
      layers: frame.layers,
      width,
      height,
    });

    // The house blit (`frameEncoding.ts`, `HeightMapModal`): a 1:1 offscreen
    // canvas filled by `putImageData`, then `drawImage` for the scaling.
    // `putImageData` itself cannot scale, and `imageSmoothingEnabled` is what
    // keeps the upscale crisp.
    const offscreen = document.createElement("canvas");
    offscreen.width = buffer.width;
    offscreen.height = buffer.height;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;
    const image = offCtx.createImageData(buffer.width, buffer.height);
    image.data.set(buffer.data);
    offCtx.putImageData(image, 0, 0);

    const scale = Math.min(size / width, size / height);
    const drawWidth = Math.max(1, Math.floor(width * scale));
    const drawHeight = Math.max(1, Math.floor(height * scale));
    const offsetX = Math.floor((size - drawWidth) / 2);
    const offsetY = Math.floor((size - drawHeight) / 2);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      offscreen,
      0,
      0,
      buffer.width,
      buffer.height,
      offsetX,
      offsetY,
      drawWidth,
      drawHeight,
    );
  };
}

export const BrushLibraryContainer = observer(function BrushLibraryContainer() {
  const { brushes, brushUI } = useStores();

  // `document` is `observable.ref` (MASTER D8): reading it here tracks its
  // IDENTITY only. Nothing below observes a frame, a layer or a cell.
  const doc = brushes.document;
  const frameIndex = doc ? resolveFrameIndex(doc, brushUI.selectedFrameId) : -1;

  const thumbnailDraw =
    doc && frameIndex >= 0 ? makeBrushThumbnailDraw(doc, frameIndex) : null;

  // See the header: the counters say the document changed, the low bits say
  // which frame is showing.
  const thumbnailRevision =
    (brushes.pixelVersion + brushes.domainVersion) * REVISION_FRAME_SLOTS +
    Math.max(0, frameIndex);

  return (
    <BrushLibrary
      // `brushList` is `observable.shallow`; the component wants a plain array.
      brushes={brushes.brushList.slice()}
      currentBrush={brushes.hasBrush ? brushes.brushName : null}
      currentSize={doc ? { width: doc.width, height: doc.height } : null}
      thumbnailDraw={thumbnailDraw}
      thumbnailRevision={thumbnailRevision}
      isLoading={brushes.isLoading}
      // Both are `flow`s (task 07); `flowResult` types the generator as the
      // promise it already is at runtime. The component's callbacks are
      // fire-and-forget — the store reports failure through `console.error`
      // and `loadState`, exactly as `DomainStore`'s lifecycle flows do.
      onSelectBrush={(name) => void flowResult(brushes.switchBrush(name))}
      onCreateBrush={(name, width, height) =>
        void flowResult(brushes.createBrush(name, width, height))
      }
    />
  );
});
