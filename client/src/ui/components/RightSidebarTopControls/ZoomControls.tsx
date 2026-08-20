/**
 * ZoomControls — the zoom stepper panel (REFRESH task 35).
 *
 * The first of the four control groups extracted from
 * `RightSidebarTopControls`'s 403 lines. It owns exactly one concern: the
 * `−  Nx  +` row, and it takes **two** props to do it.
 *
 * That is the point of the split. The parent read 16 store members; each
 * group needs 3-5, so splitting genuinely REDUCES the total prop surface
 * rather than moving it around. A single purified `RightSidebarTopControls`
 * would have carried ~18 props and been a purification in name only.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: this file's own stylesheet, and nothing else. No React import is
 * needed (the automatic JSX runtime), no domain type, no store. Same bar as
 * W24's `CanvasSurface` and W25's `LightingSurface`.
 *
 * The step and the bounds are the pre-split behaviour verbatim: `Math.round`
 * before the ±2, disabled at `<= 2` and `>= 50`. The clamping itself stays in
 * the store action — this component only decides when the buttons are dead.
 */
import "./RightSidebarTopControls.css";

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 50;
export const ZOOM_STEP = 2;

export interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function ZoomControls({ zoom, onZoomChange }: ZoomControlsProps) {
  return (
    <div className="panel right-sidebar-top-controls__panel">
      <div className="panel__header panel__header--compact">Zoom</div>
      <div className="panel__body right-sidebar-top-controls__body">
        <div className="right-sidebar-top-controls__row">
          <button
            className="right-sidebar-top-controls__btn"
            onClick={() => onZoomChange(Math.round(zoom) - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            title="Zoom out"
          >
            −
          </button>
          <span
            className="right-sidebar-top-controls__value"
            title="Current zoom"
          >
            {Math.round(zoom)}x
          </span>
          <button
            className="right-sidebar-top-controls__btn"
            onClick={() => onZoomChange(Math.round(zoom) + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
