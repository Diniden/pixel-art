/**
 * `RailDismissButton` — the rail's border, doubling as a drawer handle.
 *
 * ⚠️ WHAT THIS PINS: that the handle lands on the rail's CANVAS-FACING edge
 * for every placement, and that its chevron points the way the rail will go.
 * Both are easy to get backwards — the rail named `left` can sit on the
 * right, and "which edge" is a placement question, not an identity one.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RailDismissButton } from "../RailDismissButton";

const handle = (container: HTMLElement) =>
  container.querySelector(".rail-handle")!;

describe("placement", () => {
  it("⭐ puts the handle on the edge the rail collapses toward", () => {
    // A rail placed LEFT collapses leftward, so its strip runs down its right
    // side — the seam it closes along. The CSS turns each modifier into the
    // matching offset; this pins the modifier the component chooses.
    for (const edge of ["left", "right", "bottom", "top"] as const) {
      const { container } = render(
        <RailDismissButton label="Tools" edge={edge} onDismiss={() => {}} />,
      );
      expect(handle(container).className).toContain(`rail-handle--${edge}`);
    }
  });

  it("⭐ points its chevron the way the rail is about to go", () => {
    // Toward the rail's own edge, not the canvas: the arrow shows where the
    // panel is disappearing to, which is the thing worth predicting.
    const cases = [
      ["left", "chevron-left"],
      ["right", "chevron-right"],
      ["bottom", "chevron-down"],
      ["top", "chevron-up"],
    ] as const;

    for (const [edge, icon] of cases) {
      const { container } = render(
        <RailDismissButton label="Tools" edge={edge} onDismiss={() => {}} />,
      );
      expect(
        container.querySelector(`.lucide-${icon}`),
        `${edge} should show ${icon}`,
      ).not.toBeNull();
      // ...and NOT its opposite, so one icon stuck on every edge cannot pass.
      const opposite = { left: "right", right: "left", bottom: "up", top: "down" }[edge];
      expect(
        container.querySelector(`.lucide-chevron-${opposite}`),
      ).toBeNull();
    }
  });
});

describe("behaviour", () => {
  it("dismisses on click", () => {
    const onDismiss = vi.fn();
    render(
      <RailDismissButton label="Timeline" edge="bottom" onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByLabelText("Hide Timeline"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("names the rail it hides, for the label and the tooltip", () => {
    render(
      <RailDismissButton
        label="Objects & Layers"
        edge="left"
        onDismiss={() => {}}
      />,
    );
    const btn = screen.getByLabelText("Hide Objects & Layers");
    expect(btn.getAttribute("title")).toBe("Hide Objects & Layers");
  });

  it("is a real button — reachable by keyboard, not a bare div", () => {
    // The strip is thin and mostly decorative-looking; it must still be a
    // focusable control or it is unreachable without a pointer.
    const { container } = render(
      <RailDismissButton label="Tools" edge="right" onDismiss={() => {}} />,
    );
    expect(handle(container).tagName).toBe("BUTTON");
    expect(handle(container).getAttribute("type")).toBe("button");
  });
});

/**
 * ⚠️ Stylesheet assertions, not layout ones — jsdom applies no author CSS and
 * lays nothing out, so a rendered-box check here would assert nothing. These
 * guard the declarations whose loss is SILENT.
 */
describe("the border-replacement contract", () => {
  const css = readFileSync(
    "src/ui/components/RailDismissButton/RailDismissButton.css",
    "utf8",
  );
  const shell = readFileSync(
    "src/ui/components/AppShell/AppShell.css",
    "utf8",
  );

  it("⭐ is 3px — the rail's 1px border plus the 2px asked for", () => {
    expect(css).toMatch(/width: 3px/);
    expect(css).toMatch(/height: 3px/);
  });

  it("⭐ makes the shell suppress its own border where a handle renders", () => {
    // Both together, or a 1px rule stacks against the 3px strip and reads as
    // a double border.
    expect(shell).toContain(".app__side-panel--has-handle");
    expect(shell).toContain(".app__bottom--has-handle");
  });

  it("reads as the border at rest and lights up on hover", () => {
    // The whole point of the drawer affordance: no new furniture until the
    // pointer says the user is looking for it.
    expect(css).toMatch(/\.rail-handle \{[^}]*background: var\(--border-primary\)/);
    expect(css).toMatch(/\.rail-handle:hover \{[^}]*background: var\(--accent-primary\)/);
  });

  it("⭐ shows the grip permanently where there is NO hover", () => {
    // Measured on the owner's iPad: there is no hover, so a control that only
    // appears on hover never appears at all. The strip also widens to a
    // usable touch target there.
    expect(css).toContain("@media (hover: none)");
    const coarse = css.slice(css.indexOf("@media (hover: none)"));
    expect(coarse).toContain("opacity: 1");
    expect(coarse).toMatch(/width: 10px/);
  });

  it("sits UNDER the layout-mode scrim", () => {
    // A rail must not be collapsible from beneath its own layout overlay.
    expect(css).toContain("z-index: calc(var(--z-chrome) - 1)");
  });
});
