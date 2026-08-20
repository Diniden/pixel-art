/**
 * LightingPreviewPanel — the floating lit-thumbnail panel, on the
 * `FloatingPanel` primitive.
 *
 * `LightingCanvas.tsx:713-835` was the THIRD copy of the drag + minimise +
 * %-position-persist pattern, alongside `FrameReferencePanel.tsx:32-102,272-323`
 * and `ReferenceImagePanel.tsx:32-94,130-191` — ~120 duplicated lines across the
 * three. Task 19 built the primitive; this is task 33 spending it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE THREE PANELS KEEP THREE DISTINCT PERSISTENCE KEYS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `frameReferencePanelPosition`, `referenceImagePanelPosition` and
 * `lightingPreviewPanelPosition` are separate `uiState` fields
 * (`types/domain.ts:166-175`), and unifying them is a bug the spec names
 * explicitly. This component cannot commit that bug even by accident: it is
 * pure and holds no key. It receives `position` and reports through
 * `onPositionCommit`, and `LightingPreviewPanelContainer` is the only place
 * `lightingPreview` is named.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 *
 * No store, no MobX, no API, no `useContext`. The `<canvas>` is handed out as a
 * REF and painted imperatively by the container — the thumbnail is a lit
 * composite of a 300k-cell project and may not cross this boundary as a prop
 * (R2). Imports are React types, the `FloatingPanel` primitive, `Icon`, a
 * `lucide-react` glyph and the stylesheet; all four are `ui/`-local or
 * presentational.
 *
 * ── Two visible changes from the legacy markup, both deliberate ───────────
 *
 * 1. The panel now wears `floating-panel` chrome (the primitive's surface,
 *    header and grab handle) instead of its own gradient/backdrop-blur copy.
 *    That is the point of adopting the primitive — the three panels stop
 *    disagreeing about what a floating panel looks like.
 * 2. The minimise glyph becomes the primitive's `Plus`/`Minus` rather than
 *    `ChevronUp`/`ChevronDown`. Same affordance, one implementation.
 *
 * Both are flagged for visual sign-off in the task 33 report.
 */

import { Lightbulb } from "lucide-react";
import type { RefObject } from "react";
import { FloatingPanel } from "../../primitives/FloatingPanel/FloatingPanel";
import type { PercentPosition } from "../../hooks/useFloatingPanel";
import { Icon } from "../../primitives/Icon/Icon";
import { PREVIEW_THUMB_SIZE } from "../../canvas/render/renderLightingPreview";
import "./LightingPreviewPanel.css";

export interface LightingPreviewPanelProps {
  /**
   * The thumbnail canvas. Painted imperatively by the container's
   * `renderLightingPreview` call — never a pixel prop.
   */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The element the panel floats inside — `LightingSurface`'s root. */
  containerRef: RefObject<HTMLElement | null>;
  /** Persisted percent position for the `lightingPreview` key, if any. */
  position?: PercentPosition | undefined;
  /** Receives the final percent position after each drag. */
  onPositionCommit?: ((position: PercentPosition) => void) | undefined;
  /** Controlled minimise state, persisted separately by the container. */
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
}

export function LightingPreviewPanel({
  canvasRef,
  containerRef,
  position,
  onPositionCommit,
  minimized,
  onMinimizedChange,
}: LightingPreviewPanelProps) {
  return (
    <FloatingPanel
      title={
        <>
          <Icon icon={Lightbulb} size={12} /> Lighting Preview
        </>
      }
      containerRef={containerRef}
      position={position}
      onPositionCommit={onPositionCommit}
      minimized={minimized}
      onMinimizedChange={onMinimizedChange}
      // The legacy default before any persisted position existed
      // (`LightingCanvas.tsx:561`).
      initialPosition={{ top: 20, left: 20 }}
      className="lighting-preview-panel"
    >
      <div className="lighting-preview-panel__content">
        <canvas
          ref={canvasRef}
          width={PREVIEW_THUMB_SIZE}
          height={PREVIEW_THUMB_SIZE}
        />
      </div>
    </FloatingPanel>
  );
}
