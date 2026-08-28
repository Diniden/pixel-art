/**
 * `SaveStatusDot` — persistence health as one coloured dot.
 *
 * ⚠️ THE MAPPING THIS PINS: `idle` and `saved` are BOTH green. The user is
 * asking "is my work safe", and both answer yes — giving `idle` its own
 * colour would make the dot change twice per save and mean nothing. Orange
 * covers `pending` AND `saving`, so orange always means exactly one thing:
 * not on disk yet.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaveStatusDot } from "../SaveStatusDot";

const dot = (container: HTMLElement) =>
  container.querySelector(".save-status-dot__dot")!;

describe("the colour mapping", () => {
  it("⭐ idle and saved are BOTH green — 'nothing outstanding'", () => {
    for (const status of ["idle", "saved"] as const) {
      const { container } = render(<SaveStatusDot status={status} />);
      expect(dot(container).className).toContain("save-status-dot__dot--ok");
    }
  });

  it("⭐ pending and saving are BOTH orange — 'not on disk yet'", () => {
    for (const status of ["pending", "saving"] as const) {
      const { container } = render(<SaveStatusDot status={status} />);
      expect(dot(container).className).toContain("save-status-dot__dot--busy");
    }
  });

  it("error is red", () => {
    const { container } = render(<SaveStatusDot status="error" />);
    expect(dot(container).className).toContain("save-status-dot__dot--error");
  });

  it("only the busy state pulses — a resting header stays still", () => {
    const { container: busy } = render(<SaveStatusDot status="pending" />);
    expect(dot(busy).className).toContain("--pulsing");

    for (const status of ["idle", "saved", "error"] as const) {
      const { container } = render(<SaveStatusDot status={status} />);
      expect(dot(container).className).not.toContain("--pulsing");
    }
  });

  it("is ALWAYS rendered, including when idle", () => {
    // The pill it replaced hid itself when idle, so the user had nothing to
    // consult to confirm their work was safe.
    const { container } = render(<SaveStatusDot status="idle" />);
    expect(dot(container)).not.toBeNull();
  });
});

describe("the detail popover", () => {
  it("⭐ opens on CLICK, not hover — hover is unreachable on an iPad", () => {
    const { container } = render(<SaveStatusDot status="pending" />);
    expect(container.querySelector(".save-status-dot__popover")).toBeNull();

    fireEvent.click(dot(container));
    expect(container.querySelector(".save-status-dot__popover")).not.toBeNull();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("toggles closed on a second click, and on Escape", () => {
    const { container } = render(<SaveStatusDot status="saved" />);
    fireEvent.click(dot(container));
    expect(container.querySelector(".save-status-dot__popover")).not.toBeNull();

    fireEvent.click(dot(container));
    expect(container.querySelector(".save-status-dot__popover")).toBeNull();

    fireEvent.click(dot(container));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".save-status-dot__popover")).toBeNull();
  });

  it("closes on a click outside", () => {
    const { container } = render(<SaveStatusDot status="saved" />);
    fireEvent.click(dot(container));
    fireEvent.mouseDown(document.body);
    expect(container.querySelector(".save-status-dot__popover")).toBeNull();
  });

  it("⭐ surfaces the failure detail, so red is actionable", () => {
    const { container } = render(
      <SaveStatusDot status="error" errorDetail="Server returned 500." />,
    );
    fireEvent.click(dot(container));

    expect(screen.getByText("Save failed")).toBeTruthy();
    const body = container.querySelector(".save-status-dot__body")!.textContent;
    expect(body).toContain("Server returned 500.");
    // The reassurance matters as much as the error: the work is not lost.
    expect(body).toContain("still here in the editor");
  });

  it("reads sensibly with an error but no detail", () => {
    const { container } = render(<SaveStatusDot status="error" />);
    fireEvent.click(dot(container));
    expect(
      container.querySelector(".save-status-dot__body")!.textContent,
    ).toContain("did not complete");
  });

  it("⭐ explains a SUSPENDED save, which otherwise looks stuck", () => {
    const { container } = render(
      <SaveStatusDot status="pending" suspended />,
    );
    fireEvent.click(dot(container));
    expect(screen.getByText("Saving paused")).toBeTruthy();
    expect(
      container.querySelector(".save-status-dot__body")!.textContent,
    ).toContain("resumes automatically");
  });

  it("names the state in the button's accessible label", () => {
    render(<SaveStatusDot status="saving" />);
    expect(screen.getByLabelText("Save status: Saving…")).toBeTruthy();
  });
});
