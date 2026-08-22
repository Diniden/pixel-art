import { memo } from "react";
import "./AnchorGrid.css";
import type { AnchorPosition } from "../../../utils/variantHelpers";

// ── The anchor math moved OUT of this file (REFRESH task 28, MASTER.md §9.5)
//
// `AnchorPosition` and `getAnchorPadding` now live in
// `src/utils/variantHelpers.ts`. They were imported by three STORE modules
// from here, which made the store depend on a React component — the layering
// arrow backwards, and the violation W20's gate exists to close.
//
// Both names are RE-EXPORTED so every component-side importer keeps its
// existing `from '.../AnchorGrid/AnchorGrid'` path unchanged. The store side
// imports from `utils/variantHelpers` directly.
export type { AnchorPosition };
export { getAnchorPadding } from "../../../utils/variantHelpers";

interface AnchorGridProps {
  anchor: AnchorPosition;
  onChange: (anchor: AnchorPosition) => void;
  currentWidth: number;
  currentHeight: number;
  newWidth: number;
  newHeight: number;
}

// Get the arrows to display based on anchor position and size change
function getArrows(
  anchor: AnchorPosition,
  widthDiff: number,
  heightDiff: number,
): { direction: string; expanding: boolean }[] {
  const arrows: { direction: string; expanding: boolean }[] = [];

  // Only show arrows if there's a size change
  if (widthDiff === 0 && heightDiff === 0) return arrows;

  // Determine which directions to show arrows based on anchor
  // The anchor is the fixed point, arrows show where expansion/contraction happens
  const anchorRow = anchor.startsWith("top")
    ? 0
    : anchor.startsWith("middle")
      ? 1
      : 2;
  const anchorCol = anchor.includes("left")
    ? 0
    : anchor.includes("center")
      ? 1
      : 2;

  // Width changes
  if (widthDiff !== 0) {
    const expanding = widthDiff > 0;
    // Show arrows in directions where width change occurs
    if (anchorCol === 0) {
      // Anchored left - changes happen to the right
      arrows.push({ direction: "right", expanding });
    } else if (anchorCol === 2) {
      // Anchored right - changes happen to the left
      arrows.push({ direction: "left", expanding });
    } else {
      // Anchored center - changes happen both sides
      arrows.push({ direction: "left", expanding });
      arrows.push({ direction: "right", expanding });
    }
  }

  // Height changes
  if (heightDiff !== 0) {
    const expanding = heightDiff > 0;
    // Show arrows in directions where height change occurs
    if (anchorRow === 0) {
      // Anchored top - changes happen to the bottom
      arrows.push({ direction: "down", expanding });
    } else if (anchorRow === 2) {
      // Anchored bottom - changes happen to the top
      arrows.push({ direction: "up", expanding });
    } else {
      // Anchored middle - changes happen both sides
      arrows.push({ direction: "up", expanding });
      arrows.push({ direction: "down", expanding });
    }
  }

  return arrows;
}

const POSITIONS: AnchorPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const AnchorGrid = memo(function AnchorGrid({
  anchor,
  onChange,
  currentWidth,
  currentHeight,
  newWidth,
  newHeight,
}: AnchorGridProps) {
  const widthDiff = newWidth - currentWidth;
  const heightDiff = newHeight - currentHeight;
  const arrows = getArrows(anchor, widthDiff, heightDiff);

  // Get the grid cell position for the anchor
  const anchorRow = anchor.startsWith("top")
    ? 0
    : anchor.startsWith("middle")
      ? 1
      : 2;
  const anchorCol = anchor.includes("left")
    ? 0
    : anchor.includes("center")
      ? 1
      : 2;

  return (
    <div className="anchor-grid">
      <div className="anchor-grid__grid">
        {POSITIONS.map((pos) => {
          const isAnchor = pos === anchor;

          return (
            <button
              key={pos}
              className={`anchor-grid__cell ${isAnchor ? "anchor-grid__cell--active" : ""}`}
              onClick={() => onChange(pos)}
              title={pos.replace("-", " ")}
            >
              {isAnchor && <span className="anchor-grid__dot" />}
            </button>
          );
        })}

        {/* Render arrows around the anchor point */}
        {arrows.map(({ direction, expanding }, idx) => (
          <div
            key={`${direction}-${idx}`}
            className={`anchor-grid__arrow anchor-grid__arrow--${direction} ${expanding ? "anchor-grid__arrow--expanding" : "anchor-grid__arrow--shrinking"}`}
            style={
              {
                // Position arrow relative to anchor cell
                "--anchor-row": anchorRow,
                "--anchor-col": anchorCol,
              } as React.CSSProperties
            }
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              {direction === "up" && (
                <path
                  d={expanding ? "M12 5l-7 7h14l-7-7z" : "M12 12l-7-7h14l-7 7z"}
                  fill="currentColor"
                />
              )}
              {direction === "down" && (
                <path
                  d={expanding ? "M12 19l7-7H5l7 7z" : "M12 12l7 7H5l7-7z"}
                  fill="currentColor"
                />
              )}
              {direction === "left" && (
                <path
                  d={expanding ? "M5 12l7-7v14l-7-7z" : "M12 12l-7-7v14l7-7z"}
                  fill="currentColor"
                />
              )}
              {direction === "right" && (
                <path
                  d={expanding ? "M19 12l-7-7v14l7-7z" : "M12 12l7-7v14l7-7z"}
                  fill="currentColor"
                />
              )}
            </svg>
          </div>
        ))}
      </div>

      <div className="anchor-grid__info">
        {widthDiff !== 0 || heightDiff !== 0 ? (
          <span
            className={`anchor-grid__size-change ${widthDiff > 0 || heightDiff > 0 ? "anchor-grid__size-change--expanding" : "anchor-grid__size-change--shrinking"}`}
          >
            {widthDiff > 0 ? "+" : ""}
            {widthDiff}w, {heightDiff > 0 ? "+" : ""}
            {heightDiff}h
          </span>
        ) : (
          <span className="anchor-grid__no-change">No size change</span>
        )}
      </div>
    </div>
  );
});
