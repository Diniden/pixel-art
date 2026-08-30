/**
 * CanvasSplit — the pure side-by-side pane container for the canvas region.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ PANE IDENTITY IS THE `key` — A SWAP REORDERS, IT NEVER REMOUNTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * One pane fills the region exactly as a lone `CanvasSurface` does today; two
 * panes split it 50/50 with a 1px divider (stacked in portrait). Each pane is
 * an overflow-hidden flex column, so a `CanvasSurface` inside it gets its own
 * `.canvas__viewport` and therefore its own containing block for its floating
 * controls.
 *
 * Order follows the array; identity follows `pane.key`. The caller swaps sides
 * by reversing the array with the SAME keys — React then moves the existing
 * DOM nodes instead of destroying them, which keeps each canvas's offscreen
 * caches and native gesture listeners alive. Nothing else that could change a
 * pane's identity is rendered here. No draggable divider, no ratio state, no
 * persistence.
 *
 * `ui/` boundary: React types, `classNames`, its own CSS.
 */
import type { ReactNode } from "react";
import { classNames } from "../../classNames";
import "./CanvasSplit.css";

export interface CanvasSplitPane {
  /** Stable identity — the caller's mode string. */
  key: string;
  node: ReactNode;
}

export interface CanvasSplitProps {
  /** 1 or 2 panes, in left→right order. */
  panes: ReadonlyArray<CanvasSplitPane>;
}

export function CanvasSplit({ panes }: CanvasSplitProps) {
  return (
    <div
      className={classNames(
        "canvas-split",
        panes.length > 1 && "canvas-split--dual",
      )}
    >
      {panes.map((pane) => (
        <div className="canvas-split__pane" data-pane={pane.key} key={pane.key}>
          {pane.node}
        </div>
      ))}
    </div>
  );
}
