/**
 * BrushListContainer (multi-brush projects, `docs/14-multi-brush-projects`,
 * task 13; MASTER D8 / D9 / D10).
 *
 * The left rail's top section: projects the OPEN project's brushes
 * (`brushes.document.brushes`) into `BrushListRowModel`s for the pure
 * `BrushList` (task 03) and maps every callback onto ONE store method —
 * `BrushStructureStore` (task 09) for the structural ops, `BrushUIStore`
 * (task 08) for selection. It replaces the brush-file library container of
 * plan 01 (deleted by this task), which listed brush FILES; the header's
 * "Brush Projects" modal still manages those.
 *
 * ── Every callback goes to one store method, verbatim ─────────────────────
 *
 *   onSelect(id)              → brushUI.selectBrush(id, brushes.document)
 *   onAdd(name, w, h)         → brushStructure.addBrush(name, w, h)
 *   onRename(id, name)        → brushStructure.renameBrush(id, name)
 *   onDuplicate(id)           → brushStructure.duplicateBrush(id)
 *   onDelete(id)              → brushStructure.deleteBrush(id)
 *   onMoveUp(id) / onMoveDown → brushStructure.moveBrush(id, "up" | "down")
 *
 * ⚠️ `selectBrush` takes the DOCUMENT (MASTER §8, mistake 3): without it the
 * frame and layer ids stay `null` until the next document change and every
 * tool writes nowhere. Display order is array order — index 0 on top, and
 * `moveBrush("up")` moves toward index 0 — unlike the layer list, which is
 * reversed (§8, mistake 6).
 *
 * ── The row projection: no `Brush` crosses into `ui/` ─────────────────────
 *
 * A `Brush` carries frames of pixel grids, and a grid may not cross into
 * `ui/` (the rule that keeps `Layer` out of `LayerRow`). Each row is
 * `{ id, name, width, height, draw }`: the thumbnail is a `draw` closure
 * bound HERE, and `ThumbnailCanvas` ignores the closure's identity and
 * repaints only when `thumbnailRevision` changes — which is what replaces a
 * `React.memo` comparator, and why none may be added (see
 * `ObjectLibraryContainer`'s header for the regression that rule closes).
 *
 * ── Which frame each thumbnail paints (D10) ───────────────────────────────
 *
 * Every brush of the open project is in memory, so every row has a
 * thumbnail. The SELECTED brush paints its SELECTED frame
 * (`resolveFrameIndex(brush, brushUI.selectedFrameId)` — the frame the
 * timeline is showing); every OTHER brush paints its frame 0, because
 * `selectedFrameId` names a frame of the selected brush only (frame ids are
 * unique WITHIN a brush, MASTER D4) and a brush not being edited has no
 * "current" frame.
 *
 * ── ⚠️ The revision carries the SELECTED FRAME, not only the counters ─────
 *
 * `pixelVersion + domainVersion` say when the DOCUMENT changed; the selected
 * brush's thumbnail also depends on WHICH frame is selected, and
 * `brushUI.selectFrame` bumps neither counter. With the counters alone,
 * stepping the timeline would leave the rail showing the previous frame
 * until the next edit. The frame index is therefore folded into the low
 * bits of the revision so a frame change is a content change. Switching the
 * selected BRUSH needs no term of its own: `selectBrush` re-seats the frame
 * id (a different index, usually) and any structural op that follows bumps
 * `domainVersion`; the rows are keyed by brush id, so a new brush's canvas
 * mounts and paints regardless. Loading a different project replaces every
 * row for the same reason.
 *
 * ── Why the panel is not rendered without a document ──────────────────────
 *
 * With no project loaded every structural op is a silent no-op, so the
 * header's "+" would be a dead button. Returning `null` —
 * `BrushLayerPanelContainer`'s choice — is the honest state; the header's
 * "Brush Projects" button is where a project gets created.
 *
 * `document` is `observable.ref` (MASTER D8 of plan 01): reading it here
 * tracks its IDENTITY only. Nothing below observes a frame, a layer or a
 * cell; the grids are read inside `draw`, which runs from `ThumbnailCanvas`'s
 * effect, never from an observer.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import {
  BrushList,
  type BrushListRowModel,
} from "../ui/components/BrushList/BrushList";
import {
  createBrushBuffer,
  renderBrushFrame,
} from "../ui/canvas/render/renderBrushFrame";
import { useStores } from "../stores/context";
import type { Brush } from "../types";

/**
 * How many frame indices the revision reserves below each version step.
 * 65,536 frames per brush is far beyond anything the timeline will hold, and
 * the product stays well inside `Number.MAX_SAFE_INTEGER` for any session.
 */
const REVISION_FRAME_SLOTS = 1 << 16;

/** The frame `frameId` names in `brush`, else the first frame; `-1` when none. */
function resolveFrameIndex(brush: Brush, frameId: string | null): number {
  const index = brush.frames.findIndex((f) => f.id === frameId);
  return index >= 0 ? index : brush.frames.length > 0 ? 0 : -1;
}

/**
 * Builds the `draw(ctx, size)` closure for one brush's thumbnail:
 * composites frame `frameIndex` through `renderBrushFrame` at 1:1, blits it
 * through an offscreen canvas, then scales it into `size × size` with
 * smoothing OFF (pixel art) and centred, `renderFramePreview`-style (the
 * smaller of the two axis ratios, so a non-square brush fits its box).
 *
 * Rebuilt on every render; that is free by design (see the header).
 */
function makeBrushThumbnailDraw(
  brush: Brush,
  frameIndex: number,
): (ctx: CanvasRenderingContext2D, size: number) => void {
  return (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const frame = brush.frames[frameIndex];
    const { width, height } = brush;
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

export const BrushListContainer = observer(function BrushListContainer() {
  const { brushes, brushStructure, brushUI } = useStores();

  const doc = brushes.document;
  if (!doc) return null;

  // The ONE selected-brush rule (MASTER D4): `selectedBrushId`, else
  // `brushes[0]`. Its selected frame is what the timeline shows and what its
  // thumbnail paints; every other brush paints frame 0 (D10).
  const selected = brushUI.selectedBrushIn(doc);
  const selectedFrameIndex = selected
    ? resolveFrameIndex(selected, brushUI.selectedFrameId)
    : -1;

  const rows: BrushListRowModel[] = doc.brushes.map(
    (brush): BrushListRowModel => {
      const frameIndex =
        brush === selected
          ? selectedFrameIndex
          : resolveFrameIndex(brush, null);
      return {
        id: brush.id,
        name: brush.name,
        width: brush.width,
        height: brush.height,
        draw:
          frameIndex >= 0 ? makeBrushThumbnailDraw(brush, frameIndex) : null,
      };
    },
  );

  // See the header: the counters say the document changed, the low bits say
  // which frame the selected brush is showing.
  const thumbnailRevision =
    (brushes.pixelVersion + brushes.domainVersion) * REVISION_FRAME_SLOTS +
    Math.max(0, selectedFrameIndex);

  return (
    <BrushList
      brushes={rows}
      selectedBrushId={brushUI.selectedBrushId}
      thumbnailRevision={thumbnailRevision}
      // With the document — see the header (§8, mistake 3).
      onSelect={(brushId) => brushUI.selectBrush(brushId, brushes.document)}
      onAdd={(name, width, height) =>
        brushStructure.addBrush(name, width, height)
      }
      onRename={(brushId, name) => brushStructure.renameBrush(brushId, name)}
      onDuplicate={(brushId) => brushStructure.duplicateBrush(brushId)}
      // No confirm: the store refuses to delete the last brush, and the op
      // is one undoable snapshot on the project's own history (D5).
      onDelete={(brushId) => brushStructure.deleteBrush(brushId)}
      onMoveUp={(brushId) => brushStructure.moveBrush(brushId, "up")}
      onMoveDown={(brushId) => brushStructure.moveBrush(brushId, "down")}
    />
  );
});
