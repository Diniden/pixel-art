/**
 * Characterisation tests for `getAnchorPadding` (`AnchorGrid.tsx:160`).
 *
 * This helper is exported from a React component module but is imported by
 * `client/src/store/variantActions.ts:14` — a store → UI-component import and a
 * layering violation that a later task removes. It is tested HERE, before it
 * moves, so the move can be proven behaviour-preserving.
 *
 * Note the import pulls in `AnchorGrid.tsx` (which imports `react` and
 * `./AnchorGrid.css`). Vite resolves the CSS to an empty module and React is
 * never rendered, so this runs fine in the fast `unit` (node) project — no
 * jsdom needed.
 *
 * Coverage: all 9 anchors × grow/shrink × even/odd deltas, plus the invariants.
 */
import { describe, expect, it } from "vitest";
import {
  getAnchorPadding,
  type AnchorPosition,
} from "@/components/AnchorGrid/AnchorGrid";

const ANCHORS: AnchorPosition[] = [
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

describe("getAnchorPadding", () => {
  it("covers all 9 anchor positions with an EVEN growth of +4×+4", () => {
    // Rows: top -> all padding to the bottom; middle -> split; bottom -> to top.
    // Cols: left -> all to the right; center -> split; right -> all to the left.
    expect(
      Object.fromEntries(
        ANCHORS.map((a) => [a, getAnchorPadding(a, 4, 4)]),
      ),
    ).toEqual({
      "top-left": { left: 0, top: 0, right: 4, bottom: 4 },
      "top-center": { left: 2, top: 0, right: 2, bottom: 4 },
      "top-right": { left: 4, top: 0, right: 0, bottom: 4 },
      "middle-left": { left: 0, top: 2, right: 4, bottom: 2 },
      "middle-center": { left: 2, top: 2, right: 2, bottom: 2 },
      "middle-right": { left: 4, top: 2, right: 0, bottom: 2 },
      "bottom-left": { left: 0, top: 4, right: 4, bottom: 0 },
      "bottom-center": { left: 2, top: 4, right: 2, bottom: 0 },
      "bottom-right": { left: 4, top: 4, right: 0, bottom: 0 },
    });
  });

  it("covers all 9 anchor positions with an ODD growth of +3×+3", () => {
    // The centred cases use Math.floor, so the EXTRA pixel goes right/bottom.
    expect(
      Object.fromEntries(
        ANCHORS.map((a) => [a, getAnchorPadding(a, 3, 3)]),
      ),
    ).toEqual({
      "top-left": { left: 0, top: 0, right: 3, bottom: 3 },
      "top-center": { left: 1, top: 0, right: 2, bottom: 3 },
      "top-right": { left: 3, top: 0, right: 0, bottom: 3 },
      "middle-left": { left: 0, top: 1, right: 3, bottom: 2 },
      "middle-center": { left: 1, top: 1, right: 2, bottom: 2 },
      "middle-right": { left: 3, top: 1, right: 0, bottom: 2 },
      "bottom-left": { left: 0, top: 3, right: 3, bottom: 0 },
      "bottom-center": { left: 1, top: 3, right: 2, bottom: 0 },
      "bottom-right": { left: 3, top: 3, right: 0, bottom: 0 },
    });
  });

  it("covers all 9 anchor positions with an EVEN shrink of -4×-4", () => {
    expect(
      Object.fromEntries(
        ANCHORS.map((a) => [a, getAnchorPadding(a, -4, -4)]),
      ),
    ).toEqual({
      "top-left": { left: 0, top: 0, right: -4, bottom: -4 },
      "top-center": { left: -2, top: 0, right: -2, bottom: -4 },
      "top-right": { left: -4, top: 0, right: 0, bottom: -4 },
      "middle-left": { left: 0, top: -2, right: -4, bottom: -2 },
      "middle-center": { left: -2, top: -2, right: -2, bottom: -2 },
      "middle-right": { left: -4, top: -2, right: 0, bottom: -2 },
      "bottom-left": { left: 0, top: -4, right: -4, bottom: 0 },
      "bottom-center": { left: -2, top: -4, right: -2, bottom: 0 },
      "bottom-right": { left: -4, top: -4, right: 0, bottom: 0 },
    });
  });

  it("OBSERVED: an ODD shrink of -3 floors toward NEGATIVE infinity, not toward zero", () => {
    // `Math.floor(-3 / 2)` is -2, not -1. So on a shrink the centred anchors
    // take TWO off the left/top and ONE off the right/bottom — the mirror image
    // of the growth case, not a symmetric one. Recorded, not fixed: any later
    // "fix" to Math.trunc or Math.round silently repositions existing art.
    expect(
      Object.fromEntries(
        ANCHORS.map((a) => [a, getAnchorPadding(a, -3, -3)]),
      ),
    ).toEqual({
      "top-left": { left: 0, top: 0, right: -3, bottom: -3 },
      "top-center": { left: -2, top: 0, right: -1, bottom: -3 },
      "top-right": { left: -3, top: 0, right: 0, bottom: -3 },
      "middle-left": { left: 0, top: -2, right: -3, bottom: -1 },
      "middle-center": { left: -2, top: -2, right: -1, bottom: -1 },
      "middle-right": { left: -3, top: -2, right: 0, bottom: -1 },
      "bottom-left": { left: 0, top: -3, right: -3, bottom: 0 },
      "bottom-center": { left: -2, top: -3, right: -1, bottom: 0 },
      "bottom-right": { left: -3, top: -3, right: 0, bottom: 0 },
    });
  });

  it("handles a MIXED delta (grow wide, shrink tall) independently per axis", () => {
    expect(getAnchorPadding("middle-center", 5, -5)).toEqual({
      left: 2,
      top: -3,
      right: 3,
      bottom: -2,
    });
    expect(getAnchorPadding("top-right", 5, -5)).toEqual({
      left: 5,
      top: 0,
      right: 0,
      bottom: -5,
    });
  });

  it("returns all zeros for a zero delta, for every anchor", () => {
    for (const a of ANCHORS) {
      expect(getAnchorPadding(a, 0, 0)).toEqual({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      });
    }
  });

  // ── invariants ─────────────────────────────────────────────────────────

  it("INVARIANT: left + right === widthDiff and top + bottom === heightDiff", () => {
    for (const a of ANCHORS) {
      for (const w of [-7, -4, -3, -1, 0, 1, 3, 4, 7]) {
        for (const h of [-7, -4, -3, -1, 0, 1, 3, 4, 7]) {
          const p = getAnchorPadding(a, w, h);
          expect(p.left + p.right).toBe(w);
          expect(p.top + p.bottom).toBe(h);
        }
      }
    }
  });

  it("INVARIANT: the horizontal result depends only on the anchor's COLUMN", () => {
    for (const w of [-5, -2, 0, 2, 5]) {
      const byCol = (col: "left" | "center" | "right") =>
        (["top", "middle", "bottom"] as const).map((row) => {
          const p = getAnchorPadding(`${row}-${col}` as AnchorPosition, w, 99);
          return [p.left, p.right];
        });
      for (const col of ["left", "center", "right"] as const) {
        const [a, b, c] = byCol(col);
        expect(b).toEqual(a);
        expect(c).toEqual(a);
      }
    }
  });

  it("INVARIANT: the vertical result depends only on the anchor's ROW", () => {
    for (const h of [-5, -2, 0, 2, 5]) {
      const byRow = (row: "top" | "middle" | "bottom") =>
        (["left", "center", "right"] as const).map((col) => {
          const p = getAnchorPadding(`${row}-${col}` as AnchorPosition, 99, h);
          return [p.top, p.bottom];
        });
      for (const row of ["top", "middle", "bottom"] as const) {
        const [a, b, c] = byRow(row);
        expect(b).toEqual(a);
        expect(c).toEqual(a);
      }
    }
  });

  it("INVARIANT: `*-left` never pads left and `top-*` never pads top", () => {
    for (const d of [-6, -1, 1, 6]) {
      for (const row of ["top", "middle", "bottom"] as const) {
        expect(getAnchorPadding(`${row}-left` as AnchorPosition, d, d).left).toBe(
          0,
        );
      }
      for (const col of ["left", "center", "right"] as const) {
        expect(getAnchorPadding(`top-${col}` as AnchorPosition, d, d).top).toBe(
          0,
        );
      }
    }
  });

  it("INVARIANT: `*-right` absorbs the whole delta on the left, `bottom-*` on the top", () => {
    for (const d of [-6, -1, 1, 6]) {
      for (const row of ["top", "middle", "bottom"] as const) {
        const p = getAnchorPadding(`${row}-right` as AnchorPosition, d, d);
        expect(p.left).toBe(d);
        expect(p.right).toBe(0);
      }
      for (const col of ["left", "center", "right"] as const) {
        const p = getAnchorPadding(`bottom-${col}` as AnchorPosition, d, d);
        expect(p.top).toBe(d);
        expect(p.bottom).toBe(0);
      }
    }
  });

  it("OBSERVED: the row/column parse is prefix/substring based, so an unknown anchor falls through to middle-right", () => {
    // `startsWith("top") || startsWith("middle") ? … : 2` and
    // `includes("left") || includes("center") ? … : 2`. Anything unrecognised
    // therefore reads as row 2 (bottom) and column 2 (right). The type forbids
    // it, but the store passes this value through a JSON round-trip, so the
    // untyped fall-through is worth pinning.
    expect(
      getAnchorPadding("nonsense" as unknown as AnchorPosition, 4, 4),
    ).toEqual({ left: 4, top: 4, right: 0, bottom: 0 });
  });
});
