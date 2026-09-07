/**
 * ColorPicker — the pointer drag on the two colour surfaces (plan 09 task 03).
 *
 * The component had no test and no story before this file. What is pinned is
 * exactly the behaviour the Apple Pencil needs and mouse events could not
 * give it:
 *
 *  - a `pointerdown` on the SV square emits a colour ON THE PRESS ITSELF, one
 *    call, no second tap. This is manual check 1;
 *  - a `pointermove` after that press emits again — the drag follows;
 *  - a `pointermove` with NO preceding press emits nothing, so a Pencil merely
 *    passing over the square cannot repaint the colour;
 *  - `pointerup` closes the drag, so a later `pointermove` is inert;
 *  - the press is absorbed: `preventDefault` and `stopPropagation` are both
 *    called, which is what stops the contact reaching the drawing canvas
 *    underneath (manual check 4);
 *  - `setPointerCapture` is called on the press — the mechanism that keeps the
 *    drag alive once the Pencil leaves the swatch (manual check 3). It cannot
 *    be observed directly in jsdom, so it is installed as a spy.
 *
 * ⚠️ jsdom implements NEITHER `setPointerCapture`/`hasPointerCapture` NOR a
 * canvas 2D context, and gives every element a 0×0 `getBoundingClientRect()`.
 * All three are stubbed below. The rect stub is not cosmetic: the handlers
 * divide the pointer position by the measured width and height, so a zero-size
 * rect makes every coordinate `NaN` and nothing is assertable.
 *
 * The manual checks on the physical iPad are the real proof; this file only
 * pins the event wiring underneath them.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ColorPicker } from "../ColorPicker";
import type { Color } from "../../../../types";

/** The SV square's box during a test drag. Matches the canvas's own 180×120. */
const SV_WIDTH = 180;
const SV_HEIGHT = 120;

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };

/**
 * jsdom has no canvas 2D context — `getContext("2d")` returns `null`, which
 * `drawSVCanvas`/`drawHueCanvas` handle by bailing, so the component mounts
 * without it. It is stubbed anyway so the draw path is exercised rather than
 * short-circuited, and so a future change that stops guarding the null does
 * not fail here for an unrelated reason.
 */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () =>
      ({
        fillRect: vi.fn(),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        set fillStyle(_v: unknown) {},
      }) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement["getContext"];
});

/**
 * Give a surface a real box and a working pointer capture. jsdom implements
 * neither: `setPointerCapture` is absent entirely (the component would throw),
 * and `hasPointerCapture` is stubbed to `false` so the release path is a
 * no-op rather than a second missing-method throw.
 */
function equip(el: Element, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;

  const capture = vi.fn();
  Object.assign(el, {
    setPointerCapture: capture,
    hasPointerCapture: () => false,
    releasePointerCapture: vi.fn(),
  });
  return { capture };
}

interface Harness {
  onSetColor: ReturnType<typeof vi.fn>;
  sv: HTMLCanvasElement;
  hue: HTMLCanvasElement;
  capture: ReturnType<typeof vi.fn>;
  hex: HTMLInputElement;
  container: HTMLElement;
  onSaveStateToHistory: ReturnType<typeof vi.fn>;
}

/**
 * @param onSwapColors omitted by default — the prop is OPTIONAL and the swap
 * control renders only when a caller supplies it, which is the behaviour the
 * R8 cases below assert in both directions.
 */
function mount(onSwapColors?: () => void): Harness {
  const onSetColor = vi.fn();
  const onSaveStateToHistory = vi.fn();
  const { container } = render(
    <ColorPicker
      selectedColor={RED}
      target="edge"
      onTargetChange={vi.fn()}
      edgeColor={RED}
      fillColor={RED}
      colorHistory={[]}
      // `false` keeps the component on the `onSetColor` branch of
      // `applyColor`, which is the one these assertions read.
      colorAdjustment={false}
      onSetColor={onSetColor}
      onAdjustColor={vi.fn()}
      onSaveStateToHistory={onSaveStateToHistory}
      onSwapColors={onSwapColors}
    />,
  );

  const sv = container.querySelector(
    ".color-picker__sv-canvas",
  ) as HTMLCanvasElement;
  const hue = container.querySelector(
    ".color-picker__hue-canvas",
  ) as HTMLCanvasElement;
  const hex = container.querySelector(
    ".color-picker__hex-input",
  ) as HTMLInputElement;

  const { capture } = equip(sv, SV_WIDTH, SV_HEIGHT);
  equip(hue, SV_WIDTH, 12);

  return {
    onSetColor,
    sv,
    hue,
    capture,
    hex,
    container,
    onSaveStateToHistory,
  };
}

/** A left-button pointer event. `button: 0` clears the primary-button guard. */
function press(el: Element, clientX: number, clientY: number) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX, clientY });
}

function move(el: Element, clientX: number, clientY: number) {
  fireEvent.pointerMove(el, { pointerId: 1, clientX, clientY });
}

function release(el: Element) {
  fireEvent.pointerUp(el, { pointerId: 1 });
}

describe("ColorPicker — SV square pointer drag", () => {
  let h: Harness;
  beforeEach(() => {
    h = mount();
  });

  it("emits a colour on the press itself — no second tap", () => {
    press(h.sv, 90, 60);
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
  });

  it("captures the pointer on the press, so the drag survives leaving the square", () => {
    press(h.sv, 90, 60);
    expect(h.capture).toHaveBeenCalledWith(1);
  });

  it("absorbs the press so the Pencil cannot draw on the canvas beneath", () => {
    const e = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(e, { button: 0, pointerId: 1, clientX: 90, clientY: 60 });
    const stop = vi.spyOn(e, "stopPropagation");
    fireEvent(h.sv, e);
    expect(e.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalled();
  });

  it("keeps emitting while the pointer moves after the press", () => {
    press(h.sv, 20, 100);
    h.onSetColor.mockClear();
    move(h.sv, 150, 20);
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
    move(h.sv, 40, 90);
    expect(h.onSetColor).toHaveBeenCalledTimes(2);
  });

  it("ignores a move with no preceding press", () => {
    move(h.sv, 150, 20);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("ends the drag on pointerup, so a later move is inert", () => {
    press(h.sv, 20, 100);
    release(h.sv);
    h.onSetColor.mockClear();
    move(h.sv, 150, 20);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("ends the drag on pointercancel too", () => {
    press(h.sv, 20, 100);
    fireEvent.pointerCancel(h.sv, { pointerId: 1 });
    h.onSetColor.mockClear();
    move(h.sv, 150, 20);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("ignores a non-primary button, so a two-finger tap starts no drag", () => {
    fireEvent.pointerDown(h.sv, {
      button: 2,
      pointerId: 1,
      clientX: 90,
      clientY: 60,
    });
    expect(h.onSetColor).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });
});

describe("ColorPicker — hue bar pointer drag", () => {
  let h: Harness;
  beforeEach(() => {
    h = mount();
  });

  it("emits on the press and follows the drag", () => {
    press(h.hue, 45, 6);
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
    move(h.hue, 135, 6);
    expect(h.onSetColor).toHaveBeenCalledTimes(2);
  });

  it("ignores a move with no preceding press", () => {
    move(h.hue, 135, 6);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("ends the drag on pointerup", () => {
    press(h.hue, 45, 6);
    release(h.hue);
    h.onSetColor.mockClear();
    move(h.hue, 135, 6);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  /* ⚠️ NOT the two ends of the bar: x = 0 is hue 0 and x = width is hue 360,
     and both of those are red. The bar is a full 360° wrap, so its endpoints
     agreeing is correct. A third of the way along is unambiguous. */
  it("maps x along the bar to a different hue", () => {
    press(h.hue, 0, 6);
    const first = h.onSetColor.mock.calls[0][0] as Color;
    release(h.hue);
    press(h.hue, SV_WIDTH / 3, 6);
    const calls = h.onSetColor.mock.calls;
    const later = calls[calls.length - 1][0] as Color;
    expect(later).not.toEqual(first);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 *  THE HEX FIELD — draft while typing, commit on blur (plan 09 task 11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The last live-`onChange` input in the app. Task 02 converted every other
 * field and explicitly excluded this file (task 03 was rewriting its pointer
 * handling in the same wave); task 03 in turn excluded the commit semantics.
 *
 * ⚠️ WHAT MAKES THESE TESTS DISCRIMINATE, and what does not.
 *
 * The old code ran the SAME regex on every keystroke and simply did nothing
 * when it did not match. So "typing `#ab` emits nothing" passes against the
 * broken code too — it is a NEGATIVE CONTROL, kept because it pins the
 * invalid-draft contract, not because it catches the regression.
 *
 * The cases that genuinely discriminate are the ones where a COMPLETE value
 * is typed:
 *
 *   - typing a full `#00ff00` and NOT blurring must emit NOTHING. The old
 *     code emitted on that keystroke; this is the defect the task removes.
 *   - the same value then commits on blur, and on Enter.
 *   - Escape reverts, and the box redisplays the live colour.
 *   - a partial draft on blur reverts rather than writing garbage.
 *
 * Measured by reverting the fix — see the report.
 */
describe("ColorPicker — the hex field commits on blur", () => {
  let h: Harness;
  beforeEach(() => {
    h = mount();
  });

  /** Type a whole value into the field, one `change` (React reads `.value`). */
  function type(value: string) {
    fireEvent.change(h.hex, { target: { value } });
  }

  it("⭐ does NOT emit while a COMPLETE value is being typed", () => {
    // The discriminating case: `#00ff00` parses, and the old live-`onChange`
    // code committed it on this very keystroke.
    type("#00ff00");
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("shows the draft verbatim while typing, over the live colour", () => {
    type("#00ff0");
    // Not `#ff0000` (RED, the prop) — a half-typed value must stay on screen
    // for correction instead of snapping back under the caret.
    expect(h.hex.value).toBe("#00ff0");
  });

  it("⭐ commits a valid draft on blur", () => {
    type("#00ff00");
    fireEvent.blur(h.hex);
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
    expect(h.onSetColor.mock.calls[0][0]).toEqual({
      r: 0,
      g: 255,
      b: 0,
      a: 255,
    });
  });

  it("⭐ commits a valid draft on Enter", () => {
    type("#0000ff");
    fireEvent.keyDown(h.hex, { key: "Enter" });
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
    expect(h.onSetColor.mock.calls[0][0]).toEqual({
      r: 0,
      g: 0,
      b: 255,
      a: 255,
    });
  });

  it("Enter commits exactly ONCE, not twice via the blur it triggers", () => {
    // `handleHexKeyDown` commits and then blurs the field, and blur commits
    // too. The draft is cleared by the first, so the second is a no-op — but
    // a refactor that cleared it later would double-write.
    type("#0000ff");
    fireEvent.keyDown(h.hex, { key: "Enter" });
    fireEvent.blur(h.hex);
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
  });

  it("⭐ REVERTS a partial draft on blur rather than writing garbage", () => {
    type("#ab");
    fireEvent.blur(h.hex);
    expect(h.onSetColor).not.toHaveBeenCalled();
    // The box goes back to the live colour, so no dead value is left on screen.
    expect(h.hex.value).toBe("#ff0000");
  });

  it("reverts a draft that is hex but the wrong LENGTH", () => {
    // `#fff` is a legal CSS shorthand and NOT accepted by this field's regex —
    // pinned so a future "helpfully" widened regex is a deliberate change.
    type("#fff");
    fireEvent.blur(h.hex);
    expect(h.onSetColor).not.toHaveBeenCalled();
    expect(h.hex.value).toBe("#ff0000");
  });

  it("⭐ Escape reverts the draft and emits nothing", () => {
    type("#00ff00");
    fireEvent.keyDown(h.hex, { key: "Escape" });
    expect(h.onSetColor).not.toHaveBeenCalled();
    expect(h.hex.value).toBe("#ff0000");
  });

  it("Escape then blur still emits nothing — the draft is gone, not pending", () => {
    type("#00ff00");
    fireEvent.keyDown(h.hex, { key: "Escape" });
    fireEvent.blur(h.hex);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("blurring an untouched field emits nothing", () => {
    // Tab-through must not rewrite the colour with its own hex readout.
    fireEvent.blur(h.hex);
    expect(h.onSetColor).not.toHaveBeenCalled();
  });

  it("accepts the 8-digit form, alpha included", () => {
    type("#0102037f");
    fireEvent.blur(h.hex);
    expect(h.onSetColor.mock.calls[0][0]).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 127,
    });
  });

  it("accepts a value with no leading '#'", () => {
    type("00ff00");
    fireEvent.blur(h.hex);
    expect(h.onSetColor).toHaveBeenCalledTimes(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 *  THE SWAP CONTROL — R8 (plan 09 tasks 07 and 11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `onSwapColors` is OPTIONAL and the control renders only when a caller
 * supplies it, so the component stays pure and the button cannot half-exist
 * as a visible dead control. Task 07 shipped it that way and nothing supplied
 * the prop, so the desktop picker showed no swap button at all — task 07's
 * manual check 6 could not pass. Task 11 supplies it from
 * `ColorPickerContainer`; the container half is pinned in
 * `containers/__tests__/ColorPickerContainer.dom.test.tsx`.
 *
 * Both directions are asserted: a rendered-when-supplied case would pass
 * against a component that ALWAYS renders the button, and the absent case is
 * what pins the optionality that keeps the intermediate state honest.
 */
describe("ColorPicker — the swap control", () => {
  it("⭐ renders the swap button when a caller supplies onSwapColors", () => {
    const h = mount(vi.fn());
    expect(h.container.querySelector(".color-picker__swap")).not.toBeNull();
  });

  it("does NOT render it when the prop is omitted", () => {
    const h = mount();
    expect(h.container.querySelector(".color-picker__swap")).toBeNull();
  });

  it("calls the callback on click, and does not save history itself", () => {
    const onSwapColors = vi.fn();
    const h = mount(onSwapColors);
    fireEvent.click(
      h.container.querySelector(".color-picker__swap") as HTMLButtonElement,
    );
    expect(onSwapColors).toHaveBeenCalledTimes(1);
    // The store's `swapEdgeAndFillColors` snapshots ONCE on its own. If the
    // component ever brackets the callback with `onSaveStateToHistory`, one
    // swap costs two undos — this is the assertion that would catch it.
    expect(h.onSaveStateToHistory).not.toHaveBeenCalled();
    expect(h.onSetColor).not.toHaveBeenCalled();
  });
});
