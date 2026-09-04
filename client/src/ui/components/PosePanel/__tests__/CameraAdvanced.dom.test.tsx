/**
 * CameraAdvanced — every story mounts with NO store provider, and each control
 * behaves per the component's documented emit rule (plan 08 task 06).
 *
 * What is pinned:
 *  - ⚠️ **F16 is stated ON SCREEN.** The owner asked for a projection matrix
 *    and got frustum fields; the reason is rendered, not just commented, and
 *    this test fails if that sentence disappears.
 *  - only the CURRENT projection's fields render: `near`/`far` always, the
 *    four ortho planes only in orthographic, `fov`/`aspect` only in
 *    perspective. A `fov` box under an orthographic camera would invite a
 *    value `applyCameraParams` provably ignores.
 *  - typing a legal value emits exactly that field, unclamped.
 *  - ⚠️ **an EMPTY box emits NOTHING** — the measured `Number("") === 0` trap
 *    copied from `PoseSection`'s scale box. This is the case that silently
 *    breaks, so it is asserted for its own sake and again for garbage input.
 *  - an ILLEGAL entry (`far < near`, `near <= 0` in perspective, `left >=
 *    right`, `bottom >= top`) marks the field `aria-invalid`, shows a reason,
 *    and emits nothing. It is never clamped.
 *  - the DRAFT survives rejection, so an illegal intermediate state can be
 *    typed through (`near 0.1/far 100` → `near 200/far 500` must pass through
 *    `near 200/far 100`).
 *  - save-as-preset trims and no-ops on empty, and stores nothing itself.
 *  - the disclosure collapses and expands, and is COLLAPSED by default.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../CameraAdvanced.stories";
import { CameraAdvanced, MATRIX_NOTE } from "../CameraAdvanced";
import type { CameraAdvancedProps } from "../CameraAdvanced";

const composed = composeStories(stories);

/**
 * A fresh component with fresh spies.
 *
 * ⚠️ Deliberately NOT `composeStories` for the behavioural cases: the four
 * stories share one `handlers` object, so every `fn()` spy is the SAME spy
 * across all of them and accumulates calls file-wide (measured in
 * `PoseSection.dom.test.tsx`, where `vi.clearAllMocks()` does not reach
 * Storybook's registry). The stories are still mounted below, for the render
 * assertions where accumulated calls do not matter.
 */
function mount(overrides: Partial<CameraAdvancedProps> = {}) {
  const onChange = vi.fn();
  const onSaveAsPreset = vi.fn();
  const onReset = vi.fn();
  const utils = render(
    <CameraAdvanced
      projection="perspective"
      near={0.1}
      far={100}
      perspective={{ fov: 50, aspect: 1 }}
      defaultOpen
      onChange={onChange}
      onSaveAsPreset={onSaveAsPreset}
      onReset={onReset}
      {...overrides}
    />,
  );
  return { ...utils, onChange, onSaveAsPreset, onReset };
}

function box(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("CameraAdvanced — the stories mount with no provider", () => {
  it("renders every story without a store, a container or MobX", () => {
    for (const Story of Object.values(composed)) {
      const { unmount } = render(<Story />);
      unmount();
    }
  });

  it("is COLLAPSED by default — advanced mode is not always on screen", () => {
    const { container } = render(<composed.Collapsed />);
    const toggle = container.querySelector(".pose-panel__disclosure");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".pose-panel__advanced")).toBeNull();
    /* No fields at all while collapsed — not merely hidden ones. */
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("expands and collapses again on click", () => {
    const { container } = render(<composed.Collapsed />);
    const toggle = container.querySelector(".pose-panel__disclosure");
    if (!toggle) throw new Error("no disclosure button");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".pose-panel__advanced")).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".pose-panel__advanced")).toBeNull();
  });
});

/* ⚠️ THE F16 CHECK. The owner asked for "exact values for the camera's
   projection matrix"; these fields ARE that matrix, and the component must say
   so where the owner can read it. A comment would not discharge that. */
describe("CameraAdvanced — F16 is explained ON SCREEN", () => {
  it("renders the caveat text, not just a code comment", () => {
    const { container } = mount();
    expect(container.textContent).toContain(MATRIX_NOTE);
  });

  it("the caveat names updateProjectionMatrix as the reason", () => {
    /* The mechanism, not just the conclusion: a reader who is about to "add
       the missing 4x4 input" needs to know WHY it cannot work. */
    expect(MATRIX_NOTE).toContain("updateProjectionMatrix");
    expect(MATRIX_NOTE).toContain("overwritten");
  });

  it("offers NO 16-float matrix input anywhere", () => {
    const { container } = mount();
    const labels = Array.from(container.querySelectorAll("input")).map((i) =>
      i.getAttribute("aria-label"),
    );
    expect(labels).not.toContain("Matrix");
    /* Six boxes is the fields' count in perspective (near, far, fov, aspect)
       plus the preset name — never sixteen. */
    expect(container.querySelectorAll('input[type="number"]').length).toBeLessThan(16);
  });
});

describe("CameraAdvanced — only the current projection's fields", () => {
  it("orthographic shows near/far and the four side planes, and NO fov", () => {
    mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    for (const label of ["Near", "Far", "Left", "Right", "Top", "Bottom"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.queryByLabelText("FOV°")).toBeNull();
    expect(screen.queryByLabelText("Aspect")).toBeNull();
  });

  it("perspective shows near/far and fov/aspect, and NO ortho planes", () => {
    mount();
    for (const label of ["Near", "Far", "FOV°", "Aspect"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    for (const label of ["Left", "Right", "Top", "Bottom"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("shows the values it was given, exactly", () => {
    mount({ near: 0.25, far: 512, perspective: { fov: 37.5, aspect: 1.5 } });
    expect(box("Near").value).toBe("0.25");
    expect(box("Far").value).toBe("512");
    expect(box("FOV°").value).toBe("37.5");
    expect(box("Aspect").value).toBe("1.5");
  });
});

describe("CameraAdvanced — typing emits the right patch", () => {
  it("emits exactly the edited field, unclamped", () => {
    const { onChange } = mount();
    fireEvent.change(box("FOV°"), { target: { value: "12.5" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ fov: 12.5 });
  });

  it("emits a far value with no upper limit", () => {
    const { onChange } = mount();
    fireEvent.change(box("Far"), { target: { value: "1e6" } });
    expect(onChange).toHaveBeenCalledWith({ far: 1000000 });
  });

  it("emits negative orthographic planes without complaint", () => {
    const { onChange } = mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    fireEvent.change(box("Left"), { target: { value: "-4.75" } });
    expect(onChange).toHaveBeenCalledWith({ left: -4.75 });
  });
});

/* ⚠️ THE ONE THAT SILENTLY BREAKS. `Number("")` is 0, not NaN, so a bare
   `Number.isFinite` guard sends a zero to the store for every keystroke a
   number input cannot parse. */
describe("CameraAdvanced — an empty box emits NOTHING, never 0", () => {
  it("emits nothing when the box is cleared", () => {
    const { onChange } = mount();
    fireEvent.change(box("Near"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits nothing for whitespace", () => {
    const { onChange } = mount();
    fireEvent.change(box("Far"), { target: { value: "   " } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits nothing for unparseable text", () => {
    const { onChange } = mount();
    fireEvent.change(box("Aspect"), { target: { value: "abc" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("documents the trap itself, and still emits a REAL typed zero", () => {
    /* ⚠️ The trap, asserted where a reader will meet it: `Number("")` is 0.
       That is why the guard tests the empty string BEFORE parsing. */
    expect(Number("")).toBe(0);
    /* A deliberately typed `0` is a legal orthographic plane and must still
       reach the container — the guard rejects EMPTY, not zero. */
    const { onChange } = mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    fireEvent.change(box("Left"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith({ left: 0 });
  });

  it("keeps the cleared draft on screen instead of snapping back", () => {
    mount();
    fireEvent.change(box("Near"), { target: { value: "" } });
    expect(box("Near").value).toBe("");
  });
});

describe("CameraAdvanced — an illegal value is rejected, never clamped", () => {
  it("far below near: marked invalid, reason shown, nothing emitted", () => {
    const { onChange, container } = mount();
    fireEvent.change(box("Far"), { target: { value: "0.05" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(box("Far").getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".pose-panel__error")?.textContent).toContain(
      "Far must be greater than near",
    );
    /* NOT clamped to `near + epsilon` — the typed value stands. */
    expect(box("Far").value).toBe("0.05");
  });

  it("a perspective near of 0 is rejected (three requires near > 0)", () => {
    const { onChange, container } = mount();
    fireEvent.change(box("Near"), { target: { value: "0" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("perspective camera needs near > 0");
  });

  it("left >= right is rejected in orthographic", () => {
    const { onChange, container } = mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    /* The degenerate frustum the task names explicitly: left === right. */
    fireEvent.change(box("Left"), { target: { value: "1" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Left must be less than right");
  });

  it("bottom >= top is rejected in orthographic", () => {
    const { onChange, container } = mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    fireEvent.change(box("Bottom"), { target: { value: "2" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Bottom must be less than top");
  });

  it("a fov outside (0, 180) is rejected", () => {
    const { onChange } = mount();
    fireEvent.change(box("FOV°"), { target: { value: "180" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(box("FOV°"), { target: { value: "0" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("an aspect of 0 or below is rejected", () => {
    const { onChange } = mount();
    fireEvent.change(box("Aspect"), { target: { value: "0" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("recovers: correcting the value emits it", () => {
    const { onChange } = mount();
    fireEvent.change(box("Far"), { target: { value: "0.05" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(box("Far"), { target: { value: "500" } });
    expect(onChange).toHaveBeenCalledWith({ far: 500 });
  });

  it("blur drops the draft and re-syncs the box with the props", () => {
    mount();
    fireEvent.change(box("Far"), { target: { value: "0.05" } });
    expect(box("Far").value).toBe("0.05");
    fireEvent.blur(box("Far"));
    expect(box("Far").value).toBe("100");
    expect(box("Far").getAttribute("aria-invalid")).toBe("false");
  });
});

/* ⚠️ Why the draft exists at all: an illegal INTERMEDIATE state is on the only
   path between two legal ones. The rules are pinned through the rendered
   component rather than by importing the predicate, because exporting a
   non-component from this module is an eslint error under `PosePanel/`. */
describe("CameraAdvanced — the rules, exercised through the component", () => {
  it("a legal perspective frustum shows no error at all", () => {
    const { container } = mount();
    fireEvent.change(box("Near"), { target: { value: "0.5" } });
    expect(container.querySelector(".pose-panel__error")).toBeNull();
  });

  it("a legal orthographic frustum shows no error at all", () => {
    const { container } = mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    fireEvent.change(box("Right"), { target: { value: "4" } });
    expect(container.querySelector(".pose-panel__error")).toBeNull();
  });

  it("allows a non-positive near in ORTHOGRAPHIC, which three permits", () => {
    /* An orthographic camera has no perspective divide, so a near at or below
       zero is legal there and forbidding it would be inventing a rule the
       renderer does not have. */
    const { onChange } = mount({
      projection: "orthographic",
      orthographic: { left: -1, right: 1, top: 1, bottom: -1 },
      perspective: undefined,
    });
    fireEvent.change(box("Near"), { target: { value: "-5" } });
    expect(onChange).toHaveBeenCalledWith({ near: -5 });
  });

  it("rejects far === near — a frustum with no depth", () => {
    const { onChange, container } = mount({ near: 1, far: 100 });
    fireEvent.change(box("Far"), { target: { value: "1" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Far must be greater than near");
  });

  it("the DRAFT lets an illegal intermediate state be typed THROUGH", () => {
    /* near 0.1 / far 100  →  near 200 / far 500 has to pass through
       near 200 / far 100, which is illegal. Without the draft the first edit
       would be discarded and the second could never be reached. */
    const { onChange, rerender } = mount({ near: 0.1, far: 100 });
    fireEvent.change(box("Near"), { target: { value: "200" } });
    expect(onChange).not.toHaveBeenCalled();
    /* The rejected value SURVIVES on screen rather than snapping back. */
    expect(box("Near").value).toBe("200");
    fireEvent.change(box("Far"), { target: { value: "500" } });
    expect(onChange).toHaveBeenCalledWith({ far: 500 });
    /* The container accepts far, hands it back, and near is then legal. */
    rerender(
      <CameraAdvanced
        projection="perspective"
        near={0.1}
        far={500}
        perspective={{ fov: 50, aspect: 1 }}
        defaultOpen
        onChange={onChange}
        onSaveAsPreset={() => {}}
      />,
    );
    /* ⚠️ The near draft is still `"200"` on screen and STILL un-emitted — it
       was rejected, and nothing re-submits a draft behind the owner's back.
       Re-entering it now succeeds, because `far` is 500. A distinct value is
       typed because React fires no change event for an identical one, which
       is itself the reason the field must be re-touched rather than silently
       re-sent. */
    expect(box("Near").value).toBe("200");
    fireEvent.change(box("Near"), { target: { value: "200.5" } });
    expect(onChange).toHaveBeenCalledWith({ near: 200.5 });
  });
});

describe("CameraAdvanced — save as preset (storage is task 08's)", () => {
  it("trims the name before handing it over", () => {
    const { onSaveAsPreset } = mount();
    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "  Wide lens  " },
    });
    fireEvent.click(screen.getByTitle("Save these projection values as a named preset"));
    expect(onSaveAsPreset).toHaveBeenCalledWith("Wide lens");
  });

  it("no-ops on an empty or whitespace name", () => {
    const { onSaveAsPreset } = mount();
    const button = screen.getByTitle(
      "Save these projection values as a named preset",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "   " },
    });
    fireEvent.click(button);
    expect(onSaveAsPreset).not.toHaveBeenCalled();
  });

  it("saves on Enter in the name box", () => {
    const { onSaveAsPreset } = mount();
    const name = screen.getByLabelText("Preset name");
    fireEvent.change(name, { target: { value: "Iso tight" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onSaveAsPreset).toHaveBeenCalledWith("Iso tight");
  });

  it("clears the name after a save, so the next one starts empty", () => {
    mount();
    const name = screen.getByLabelText("Preset name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Wide" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(name.value).toBe("");
  });
});

describe("CameraAdvanced — reset", () => {
  it("fires onReset when the button is pressed", () => {
    const { onReset } = mount();
    fireEvent.click(screen.getByTitle(/return to the fitted frustum/));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("hides the reset button entirely when no handler is given", () => {
    mount({ onReset: undefined });
    expect(screen.queryByTitle(/return to the fitted frustum/)).toBeNull();
  });
});
