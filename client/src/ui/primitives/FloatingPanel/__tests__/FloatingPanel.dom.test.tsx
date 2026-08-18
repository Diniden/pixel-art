import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingPanel } from "../FloatingPanel";

function renderInContainer(ui: (ref: React.RefObject<HTMLDivElement | null>) => React.ReactElement) {
  const containerRef = createRef<HTMLDivElement>();
  return render(
    <div ref={containerRef} style={{ position: "relative" }}>
      {ui(containerRef)}
    </div>,
  );
}

describe("FloatingPanel", () => {
  it("renders header + body", () => {
    const { container } = renderInContainer((ref) => (
      <FloatingPanel
        title="Preview"
        containerRef={ref}
        minimized={false}
        onMinimizedChange={() => {}}
      >
        content
      </FloatingPanel>
    ));
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders minimized (no body)", () => {
    const { container } = renderInContainer((ref) => (
      <FloatingPanel
        title="Preview"
        containerRef={ref}
        minimized
        onMinimizedChange={() => {}}
      >
        content
      </FloatingPanel>
    ));
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders without a minimize affordance when uncontrolled", () => {
    const { container } = renderInContainer((ref) => (
      <FloatingPanel title="Reference" containerRef={ref}>
        content
      </FloatingPanel>
    ));
    expect(container.firstChild).toMatchSnapshot();
  });

  it("minimize button toggles without starting a drag", async () => {
    const onMinimizedChange = vi.fn();
    renderInContainer((ref) => (
      <FloatingPanel
        title="Preview"
        containerRef={ref}
        minimized={false}
        onMinimizedChange={onMinimizedChange}
      >
        content
      </FloatingPanel>
    ));
    await userEvent.click(
      screen.getByRole("button", { name: "Minimize panel" }),
    );
    expect(onMinimizedChange).toHaveBeenCalledWith(true);
  });
});
