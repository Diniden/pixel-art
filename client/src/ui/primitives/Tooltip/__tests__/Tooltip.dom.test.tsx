import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "../Tooltip";

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe("Tooltip", () => {
  it("renders only the trigger while hidden", () => {
    const { container } = render(
      <Tooltip content="Focus Mode (`)" container={host}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchSnapshot();
    expect(host.firstChild).toBeNull();
  });

  it("shows the bubble on hover and snapshots it", async () => {
    render(
      <Tooltip content="Focus Mode (`)" container={host}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Focus Mode (`)");
    expect(host.firstChild).toMatchSnapshot();
  });

  it("shows on keyboard focus and hides on Escape (manual check 6 / WCAG 1.4.13)", async () => {
    render(
      <Tooltip content="Delete layer" container={host}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Trigger" });
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

/**
 * Touch behaviour (2026-08-31).
 *
 * Reported: "Long hold on ipad should make them show up and release should
 * immediately dismiss. Getting weird feedback with lingering tooltips and they
 * show up at the wrong times."
 *
 * jsdom has no real pointer stack, so these fire PointerEvents directly at the
 * trigger. That is exactly the surface the component listens on.
 */
describe("touch: long-press to show, release to dismiss", () => {
  const LONG_PRESS_MS = 500;

  function down(el: Element, pointerType = "touch", x = 0, y = 0) {
    fireEvent.pointerDown(el, { pointerType, clientX: x, clientY: y });
  }

  it("⭐ a long hold SHOWS the bubble", () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Pencil (B)" container={host}>
          <button type="button">Pencil</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Pencil" });
      down(btn);
      expect(screen.queryByRole("tooltip")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.getByRole("tooltip")).toHaveTextContent("Pencil (B)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("⭐ release DISMISSES it immediately", () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Pencil (B)" container={host}>
          <button type="button">Pencil</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Pencil" });
      down(btn);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();

      fireEvent.pointerUp(btn, { pointerType: "touch" });
      // No timer advance: dismissal must not be deferred.
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("⭐ an ordinary TAP shows nothing at all", () => {
    // The "shows up at the wrong times" half of the report: a quick tap must
    // never raise a bubble.
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Pencil (B)" container={host}>
          <button type="button">Pencil</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Pencil" });
      down(btn);
      act(() => {
        vi.advanceTimersByTime(120);
      });
      fireEvent.pointerUp(btn, { pointerType: "touch" });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("⭐ a synthetic mouseenter from a touch does NOT show it — the LINGERING bug", () => {
    // iOS fires `mouseenter` after a tap and never sends `mouseleave`, so the
    // bubble used to appear unasked and then stay forever. The component now
    // ignores hover once a non-mouse pointer has been seen.
    render(
      <Tooltip content="Pencil (B)" container={host}>
        <button type="button">Pencil</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "Pencil" });
    fireEvent.pointerDown(btn, { pointerType: "touch", clientX: 0, clientY: 0 });
    fireEvent.pointerUp(btn, { pointerType: "touch" });
    fireEvent.mouseEnter(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a press that DRAGS away is abandoned, so scrolling raises nothing", () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Pencil (B)" container={host}>
          <button type="button">Pencil</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Pencil" });
      down(btn, "touch", 0, 0);
      fireEvent.pointerMove(btn, { pointerType: "touch", clientX: 0, clientY: 40 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointercancel dismisses, so an interrupted gesture cannot strand a bubble", () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Pencil (B)" container={host}>
          <button type="button">Pencil</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Pencil" });
      down(btn);
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();
      fireEvent.pointerCancel(btn, { pointerType: "touch" });
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a PEN long-press works too — the Apple Pencil is not a finger", () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Pencil (B)" container={host}>
          <button type="button">Pencil</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Pencil" });
      down(btn, "pen");
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the MOUSE path is untouched — hover still shows instantly", () => {
    render(
      <Tooltip content="Pencil (B)" container={host}>
        <button type="button">Pencil</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "Pencil" });
    fireEvent.pointerDown(btn, { pointerType: "mouse", clientX: 0, clientY: 0 });
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
