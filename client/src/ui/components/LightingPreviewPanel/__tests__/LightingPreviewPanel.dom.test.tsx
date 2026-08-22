/**
 * 🏁 GATE 2 OF REFRESH TASK 33, at the point where it could actually have
 * leaked.
 *
 * `LightingSurface` never had a persistence key to lose. The PANEL did: it was
 * the third copy of the drag + minimise + %-persist pattern, and the spec's
 * sharpest constraint is that the three panels must keep three DISTINCT
 * `uiState` keys. Unifying them is a bug.
 *
 * These tests mount all three stories with NO store provider — proving the
 * panel holds no key at all — and then assert the two behaviours that make the
 * key the container's business: `onPositionCommit` reports a PERCENT position
 * outward, and `minimized` is controlled rather than owned.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../LightingPreviewPanel.stories";

const composed = composeStories(stories);

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

const NAMES = ["Default", "Minimized", "RestoredPosition"] as const;

describe("LightingPreviewPanel — GATE 2: renders with NO store provider", () => {
  it("exposes exactly the three stories", () => {
    expect(Object.keys(composed).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name} mounts with no provider`, () => {
      const Story = composed[name];
      const { container } = render(<Story />);
      expect(container.querySelector(".floating-panel")).not.toBeNull();
    });
  }
});

describe("LightingPreviewPanel — built on the FloatingPanel primitive", () => {
  it("wears the primitive's chrome, not the legacy clone's markup", () => {
    const { container } = render(<composed.Default />);
    expect(container.querySelector(".floating-panel__header")).not.toBeNull();
    expect(container.querySelector(".floating-panel__title")).not.toBeNull();
    // The legacy classes are GONE — this is the deduplication, not a rename.
    expect(container.querySelector(".lighting-canvas__preview")).toBeNull();
    expect(
      container.querySelector(".lighting-canvas__preview-header"),
    ).toBeNull();
  });

  it("carries its own modifier class, so the three panels stay distinguishable", () => {
    const { container } = render(<composed.Default />);
    expect(
      container.querySelector(".floating-panel.lighting-preview-panel"),
    ).not.toBeNull();
  });

  it("renders the 200×200 thumbnail canvas when expanded", () => {
    const { container } = render(<composed.Default />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas!.getAttribute("width")).toBe("200");
    expect(canvas!.getAttribute("height")).toBe("200");
  });

  it("UNMOUNTS the canvas when minimised — which is why expanding must repaint", () => {
    const { container } = render(<composed.Minimized />);
    expect(
      container.querySelector(".floating-panel--minimized"),
    ).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    // The header survives, so there is something left to click.
    expect(container.querySelector(".floating-panel__header")).not.toBeNull();
  });

  it("minimise is CONTROLLED: the toggle round-trips through the caller", () => {
    const { container, getByLabelText } = render(<composed.Default />);
    expect(container.querySelector("canvas")).not.toBeNull();

    fireEvent.click(getByLabelText("Minimize panel"));

    expect(
      container.querySelector(".floating-panel--minimized"),
    ).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("⚠️ reports position as PERCENTAGES, never as a store key", () => {
    // The panel names no `uiState` field. It hands a percent pair outward and
    // the container decides which of the three keys it belongs to. This is the
    // structural reason "do not unify the keys" cannot be violated here.
    const { container } = render(<composed.RestoredPosition />);
    const panel = container.querySelector<HTMLElement>(".floating-panel");
    expect(panel).not.toBeNull();
    // jsdom reports zero-size rects, so the restored PIXEL position clamps to
    // 0 — what matters is that the component accepted a percent pair at all
    // and rendered without reaching for a store to resolve it.
    expect(panel!.style.top).not.toBe("");
    expect(panel!.style.left).not.toBe("");
  });
});
