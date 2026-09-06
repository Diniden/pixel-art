import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "../NumberInput";

describe("NumberInput", () => {
  it("renders the slider__input styling", () => {
    const { container } = render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={() => {}}
        label="FPS"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the boxed variant", () => {
    const { container } = render(
      <NumberInput
        value={5}
        min={0}
        max={10}
        boxed
        onChange={() => {}}
        label="Radius"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("clamps on Enter — the duplicated FPS clamp, centralised", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "999{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(60);
  });

  it("clamps on blur", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  /* The task-02 contract: keystrokes are a draft and nothing else. The
     regression these guard is a field with min={1} snapping to 1 after the
     first character of "10". */

  it("does not call onChange while typing", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "24");
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(24);
  });

  it("lets an in-range value be typed without committing per keystroke", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={5}
        min={1}
        max={64}
        onChange={onChange}
        label="Width"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "Width" });
    await userEvent.clear(input);
    // "1" alone is in range and would have committed live under the old code.
    await userEvent.type(input, "10");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("can be cleared while focused without writing a value", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(null);
  });

  it("⚠️ clearing and LEAVING writes nothing — it restores the value", async () => {
    // ⚠️ REGRESSION PIN. The sibling test above only clears while FOCUSED, so
    // it passed while this did not: `commit` parsed the empty draft, and
    // `Number("")` is `0` — NOT `NaN` — so a cleared box committed
    // `clamp(0, min, max)`, i.e. `min`. That is the "clearing a field writes a
    // value" bug in the objective, and it hides completely in any field whose
    // minimum is 0. Found by migrating the Pose rail's scale box, whose store
    // floor is 1e-3: clearing it collapsed the model to a sliver.
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    // The field re-reads the value it was given, rather than sitting empty.
    expect(input).toHaveValue(12);
  });

  it("⚠️ commits nothing for a whitespace-only draft either", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    // `Number("   ")` is also 0, so the trim has to happen before the parse.
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits on blur", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "30");
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("commits on Enter", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "30{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("reverts on Escape without calling onChange", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "45{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(12);
  });

  it("resyncs the draft when the value prop changes externally", async () => {
    const { rerender } = render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={() => {}}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "45");
    expect(input).toHaveValue(45);

    // An undo, a store update or a preset load arriving from outside.
    rerender(
      <NumberInput
        value={30}
        min={1}
        max={60}
        onChange={() => {}}
        label="FPS"
      />,
    );
    expect(input).toHaveValue(30);
  });
});
