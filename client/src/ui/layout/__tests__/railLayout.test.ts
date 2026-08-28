/**
 * The rail-arrangement model — the pure half of the Layout feature.
 *
 * These assertions are written against the BEHAVIOUR THE OWNER DESCRIBED,
 * quoted where it matters: "the left rail will have a right arrow, click it
 * once the left rail will now be up against the right rail's left side, click
 * it again, the left rail now is the right most rail."
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RAIL_LAYOUT,
  RAIL_SCALES,
  SIDE_SLOTS,
  canScaleRail,
  canStepRail,
  flipBottomEdge,
  railsOnSide,
  scaleRail,
  setToolbarEdge,
  stepToolbarSpread,
  canStepToolbarSpread,
  slotSide,
  stepRail,
  TOOLBAR_EDGES,
  isToolbarVertical,
  type RailLayout,
} from "../railLayout";

describe("stepRail — the two-click journey the owner described", () => {
  it("⭐ click once: the left rail parks against the right rail's left side", () => {
    const once = stepRail(DEFAULT_RAIL_LAYOUT, "left", 1);

    // "up against the right rail's left side" — both rails are now on the
    // right half, with the left rail INSIDE the right one.
    expect(once.left.slot).toBe("rightInner");
    expect(once.right.slot).toBe("rightOuter");
    expect(railsOnSide(once, "left")).toEqual([]);
    expect(railsOnSide(once, "right")).toEqual(["left", "right"]);
  });

  it("⭐ click again: the left rail is now the right-MOST rail", () => {
    const twice = stepRail(stepRail(DEFAULT_RAIL_LAYOUT, "left", 1), "left", 1);

    expect(twice.left.slot).toBe("rightOuter");
    // The right rail was displaced INWARD — it took the mover's old slot.
    expect(twice.right.slot).toBe("rightInner");
    expect(railsOnSide(twice, "right")).toEqual(["right", "left"]);
  });

  it("is symmetric for the right rail moving left", () => {
    // The exact mirror: one click crosses the canvas and parks against the
    // left rail's right side. `rightInner` is SKIPPED because sitting there
    // with `rightOuter` empty looks identical to where it started.
    const once = stepRail(DEFAULT_RAIL_LAYOUT, "right", -1);
    expect(once.right.slot).toBe("leftInner");
    expect(once.left.slot).toBe("leftOuter");
    expect(railsOnSide(once, "left")).toEqual(["left", "right"]);
    expect(railsOnSide(once, "right")).toEqual([]);

    // A second click swaps it past the left rail, making it left-MOST.
    const twice = stepRail(once, "right", -1);
    expect(twice.right.slot).toBe("leftOuter");
    expect(twice.left.slot).toBe("leftInner");
    expect(railsOnSide(twice, "left")).toEqual(["right", "left"]);

    // And there is nowhere further to go.
    expect(canStepRail(twice, "right", -1)).toBe(false);
  });

  it("CLAMPS at both ends and never wraps (owner decision)", () => {
    // Already at the left end.
    expect(canStepRail(DEFAULT_RAIL_LAYOUT, "left", -1)).toBe(false);
    expect(stepRail(DEFAULT_RAIL_LAYOUT, "left", -1)).toBe(
      DEFAULT_RAIL_LAYOUT,
    );

    // Walk the left rail to the far end, then try to keep going. Two visible
    // steps is the whole journey — see `nextVisibleSlot`.
    let layout: RailLayout = DEFAULT_RAIL_LAYOUT;
    for (let i = 0; i < SIDE_SLOTS.length; i += 1) {
      layout = stepRail(layout, "left", 1);
    }
    expect(layout.left.slot).toBe("rightOuter");
    expect(canStepRail(layout, "left", 1)).toBe(false);
    expect(stepRail(layout, "left", 1)).toBe(layout);
  });

  it("never lets both rails occupy the same slot", () => {
    // Every reachable arrangement from a long random-ish walk stays legal.
    let layout: RailLayout = DEFAULT_RAIL_LAYOUT;
    const moves: Array<["left" | "right", -1 | 1]> = [
      ["left", 1],
      ["left", 1],
      ["right", -1],
      ["right", -1],
      ["left", -1],
      ["right", 1],
      ["left", 1],
      ["right", -1],
    ];
    for (const [rail, dir] of moves) {
      layout = stepRail(layout, rail, dir);
      expect(layout.left.slot).not.toBe(layout.right.slot);
    }
  });

  it("leaves scale untouched when only the slot moves", () => {
    const scaled = scaleRail(DEFAULT_RAIL_LAYOUT, "left", 1);
    const moved = stepRail(scaled, "left", 1);
    expect(moved.left.scale).toBe("large");
  });
});

describe("railsOnSide — screen order, so the shell needs no ordering logic", () => {
  it("returns each half sorted by slot index", () => {
    expect(railsOnSide(DEFAULT_RAIL_LAYOUT, "left")).toEqual(["left"]);
    expect(railsOnSide(DEFAULT_RAIL_LAYOUT, "right")).toEqual(["right"]);
  });

  it("puts the outer rail first on the left, and last on the right", () => {
    // Both on the left: leftOuter comes before leftInner in screen order.
    const bothLeft: RailLayout = {
      ...DEFAULT_RAIL_LAYOUT,
      left: { slot: "leftInner", scale: "regular" },
      right: { slot: "leftOuter", scale: "regular" },
    };
    expect(railsOnSide(bothLeft, "left")).toEqual(["right", "left"]);
    expect(railsOnSide(bothLeft, "right")).toEqual([]);
  });
});

describe("slotSide", () => {
  it("maps each slot to the half of the shell it belongs to", () => {
    expect(slotSide("leftOuter")).toBe("left");
    expect(slotSide("leftInner")).toBe("left");
    expect(slotSide("rightInner")).toBe("right");
    expect(slotSide("rightOuter")).toBe("right");
  });
});

describe("scaleRail — four settings, clamped", () => {
  it("exposes exactly four steps, with `regular` as the historical size", () => {
    expect(RAIL_SCALES).toHaveLength(4);
    expect(DEFAULT_RAIL_LAYOUT.left.scale).toBe("regular");
    expect(DEFAULT_RAIL_LAYOUT.right.scale).toBe("regular");
    expect(DEFAULT_RAIL_LAYOUT.bottom.scale).toBe("regular");
  });

  it("steps up and down, and stops at both ends", () => {
    let layout = DEFAULT_RAIL_LAYOUT;
    expect(canScaleRail(layout, "left", -1)).toBe(true);
    layout = scaleRail(layout, "left", -1);
    expect(layout.left.scale).toBe("compact");
    expect(canScaleRail(layout, "left", -1)).toBe(false);
    expect(scaleRail(layout, "left", -1)).toBe(layout);

    layout = scaleRail(scaleRail(scaleRail(layout, "left", 1), "left", 1), "left", 1);
    expect(layout.left.scale).toBe("huge");
    expect(canScaleRail(layout, "left", 1)).toBe(false);
    expect(scaleRail(layout, "left", 1)).toBe(layout);
  });

  it("scales each rail independently — including the bottom", () => {
    const layout = scaleRail(scaleRail(DEFAULT_RAIL_LAYOUT, "bottom", 1), "right", -1);
    expect(layout.bottom.scale).toBe("large");
    expect(layout.right.scale).toBe("compact");
    expect(layout.left.scale).toBe("regular");
  });
});

describe("the canvas toolbar — four edges, no ordering", () => {
  it("defaults to the top, where the toolbar has always been", () => {
    expect(DEFAULT_RAIL_LAYOUT.toolbar.edge).toBe("top");
    expect(DEFAULT_RAIL_LAYOUT.toolbar.scale).toBe("regular");
  });

  it("⭐ locks directly to any of the four edges", () => {
    // Unlike the side rails there is no track to step along: each arrow
    // names its destination, so every edge is one click away from any other.
    let layout = DEFAULT_RAIL_LAYOUT;
    for (const edge of TOOLBAR_EDGES) {
      layout = setToolbarEdge(layout, edge);
      expect(layout.toolbar.edge).toBe(edge);
    }
    // ...and back to the start in ONE move, not three.
    expect(setToolbarEdge(layout, "top").toolbar.edge).toBe("top");
  });

  it("is a no-op when it already holds that edge", () => {
    const layout = setToolbarEdge(DEFAULT_RAIL_LAYOUT, "left");
    expect(setToolbarEdge(layout, "left")).toBe(layout);
  });

  it("does not disturb the three panel rails", () => {
    const moved = setToolbarEdge(DEFAULT_RAIL_LAYOUT, "right");
    expect(moved.left).toEqual(DEFAULT_RAIL_LAYOUT.left);
    expect(moved.right).toEqual(DEFAULT_RAIL_LAYOUT.right);
    expect(moved.bottom).toEqual(DEFAULT_RAIL_LAYOUT.bottom);
  });

  it("keeps its own scale across an edge change", () => {
    const scaled = scaleRail(DEFAULT_RAIL_LAYOUT, "toolbar", 1);
    expect(setToolbarEdge(scaled, "bottom").toolbar.scale).toBe("large");
  });

  it("⭐ left and right are VERTICAL; top and bottom are not", () => {
    // The distinction drives a re-flow of the toolbar itself, not just its
    // position — see `Toolbar.css`.
    expect(isToolbarVertical("left")).toBe(true);
    expect(isToolbarVertical("right")).toBe(true);
    expect(isToolbarVertical("top")).toBe(false);
    expect(isToolbarVertical("bottom")).toBe(false);
  });
});

describe("toolbar spread — more rows when the tools do not fit", () => {
  it("defaults to a single line, as the toolbar has always been", () => {
    expect(DEFAULT_RAIL_LAYOUT.toolbar.spread).toBe(1);
  });

  it("⭐ steps up and down, clamped at both ends", () => {
    let layout = DEFAULT_RAIL_LAYOUT;
    expect(canStepToolbarSpread(layout, -1)).toBe(false);
    expect(stepToolbarSpread(layout, -1)).toBe(layout);

    layout = stepToolbarSpread(layout, 1);
    expect(layout.toolbar.spread).toBe(2);
    layout = stepToolbarSpread(layout, 1);
    expect(layout.toolbar.spread).toBe(3);

    expect(canStepToolbarSpread(layout, 1)).toBe(false);
    expect(stepToolbarSpread(layout, 1)).toBe(layout);
  });

  it("is independent of the edge — spread survives a re-dock", () => {
    const spread = stepToolbarSpread(DEFAULT_RAIL_LAYOUT, 1);
    expect(setToolbarEdge(spread, "left").toolbar.spread).toBe(2);
  });

  it("does not disturb the three panel rails", () => {
    const spread = stepToolbarSpread(DEFAULT_RAIL_LAYOUT, 1);
    expect(spread.left).toEqual(DEFAULT_RAIL_LAYOUT.left);
    expect(spread.right).toEqual(DEFAULT_RAIL_LAYOUT.right);
    expect(spread.bottom).toEqual(DEFAULT_RAIL_LAYOUT.bottom);
  });
});

describe("flipBottomEdge", () => {
  it("toggles between the bottom and the top edge", () => {
    const up = flipBottomEdge(DEFAULT_RAIL_LAYOUT);
    expect(up.bottom.edge).toBe("top");
    expect(flipBottomEdge(up).bottom.edge).toBe("bottom");
  });

  it("does not disturb the side rails", () => {
    const up = flipBottomEdge(DEFAULT_RAIL_LAYOUT);
    expect(up.left).toEqual(DEFAULT_RAIL_LAYOUT.left);
    expect(up.right).toEqual(DEFAULT_RAIL_LAYOUT.right);
  });
});
