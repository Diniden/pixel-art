/**
 * `Toast` — a brief announcement over the workspace.
 *
 * ⚠️ THE PROPERTY THAT MATTERS MOST: it cannot be clicked. The toast is
 * centred over the canvas, which is the one region where a stray click costs
 * the user real work — a dropped stroke, a mis-placed fill.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toast } from "../Toast";

describe("Toast", () => {
  it("renders its message", () => {
    render(<Toast>Entered focus mode.</Toast>);
    expect(screen.getByText("Entered focus mode.")).toBeTruthy();
  });

  it("⭐ announces politely rather than interrupting", () => {
    // `status`/`polite`, not `alert`: this is advisory, and an alert cuts a
    // screen-reader user off mid-sentence for something that can wait.
    const { container } = render(<Toast>hi</Toast>);
    const toast = container.querySelector(".toast")!;
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.getAttribute("aria-live")).toBe("polite");
  });

  it("⭐ offers NOTHING to click — it announces, it does not ask", () => {
    // No dismiss button, no action link. A toast that can be interacted with
    // is a dialog with a timer attached.
    const { container } = render(<Toast>hi</Toast>);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("sits at the bottom by default, and can go to the top", () => {
    // The top of this app is header and toolbar; a toast there covers the
    // very controls a message is most likely to be about.
    const { container: def } = render(<Toast>hi</Toast>);
    expect(def.querySelector(".toast--bottom")).not.toBeNull();

    const { container: top } = render(<Toast position="top">hi</Toast>);
    expect(top.querySelector(".toast--top")).not.toBeNull();
  });

  it("holds no timer of its own — it shows whenever it is mounted", () => {
    // The caller owns the clock (`useTransientMessage`), which is what lets a
    // story show one indefinitely and a test render it without fake timers.
    const src = readFileSync("src/ui/components/Toast/Toast.tsx", "utf8");
    expect(src).not.toContain("setTimeout");
    expect(src).not.toContain("useEffect");
  });

  it("⭐ is click-through, so it cannot swallow a canvas click", () => {
    // jsdom applies no author CSS, so this is asserted against the sheet.
    const css = readFileSync("src/ui/components/Toast/Toast.css", "utf8");
    expect(css).toMatch(/\.toast \{[^}]*pointer-events: none/);
  });
});
