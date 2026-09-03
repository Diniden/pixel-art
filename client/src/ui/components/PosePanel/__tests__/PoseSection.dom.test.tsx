/**
 * PoseSection — every story mounts with NO store provider, and each control
 * fires the right callback with the right value (pose-tool task 07; reworked
 * by pose-refinements task 03).
 *
 * What is pinned:
 *  - each mesh button calls `onSelectMesh` with its own id, not its index.
 *  - framing is DISABLED for a primitive and ENABLED for the mannequin —
 *    MASTER D4, and the reason it is disabled rather than hidden is that the
 *    row must not vanish and shuffle the rail.
 *  - the FOV slider is disabled in orthographic and live in perspective.
 *  - each camera preset button calls `onSelectCameraPreset` with its id.
 *  - each viewpoint button calls `onSetRotation` with the angles FROM
 *    `poseCamera.ts`. This is the anti-drift check: the test reads the same
 *    table the component does, so a re-declared copy in the component would
 *    fail here rather than silently disagree with the camera maths.
 *  - the two orbs are two instances of ONE component (MASTER D13), labelled
 *    Rotation and Light.
 *
 * Added by task 03:
 *  - **NO `<input type="color">` survives anywhere in the rail.** This is the
 *    owner's actual complaint ("some form of native color picker") and the
 *    first line of the definition of done, so it is asserted directly.
 *  - the Model/Outline swatches show the colours passed in (the app's Fill and
 *    Edge slots — E8/E9) and clicking one asks the container to point the main
 *    picker at that slot (E10). They SET nothing themselves.
 *  - the outline width slider is integer-only over 0–4, and reads 0 as "Off".
 *  - `Fit to canvas` fires `onRequestFit`, and is disabled with no mesh.
 *  - ⚠️ the zoom slider's old `max={10}` is GONE — the regression pin for the
 *    owner's "the zoom is capping out" complaint.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../PoseSection.stories";
import {
  POSE_EDGE_WIDTH_MAX,
  POSE_EDGE_WIDTH_MIN,
  POSE_ZOOM_SLIDER_MAX,
} from "../PoseSection";
import {
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
} from "../../../canvas/pose/poseCamera";

const composed = composeStories(stories);

/* ⚠️ The four stories SHARE one `handlers` object (it is spread into each), so
   every `fn()` spy is the SAME spy across all four and accumulates calls for
   the whole file. `vi.clearAllMocks()` does NOT reach Storybook's own `fn()`
   registry — measured — so any "was not called" assertion here compares call
   counts before and after instead. See the Fit test. */

/**
 * `composeStories` types a story's args as the component's PROPS, so a
 * callback arrives typed as its plain signature even though the story supplied
 * a `fn()` spy. `expect(...)` accepts it as-is; reading `.mock` does not. This
 * is the one narrowing for those reads.
 */
function spy(callback: unknown): { mock: { calls: unknown[][]; lastCall?: unknown[] } } {
  return callback as { mock: { calls: unknown[][]; lastCall?: unknown[] } };
}

function group(container: HTMLElement, groupLabel: string): HTMLElement {
  const found = Array.from(
    container.querySelectorAll<HTMLElement>(".pose-panel__group"),
  ).find(
    (g) =>
      g.querySelector(".pose-panel__group-label")?.textContent === groupLabel,
  );
  if (!found) throw new Error(`no group labelled ${groupLabel}`);
  return found;
}

function buttons(container: HTMLElement, groupLabel: string): HTMLButtonElement[] {
  return Array.from(
    group(container, groupLabel).querySelectorAll<HTMLButtonElement>(
      ".pose-panel__btn",
    ),
  );
}

/**
 * The buttons of ONE `.pose-panel__buttons` row inside a group. The rotation
 * group now holds two rows (viewpoint snaps, then light tints) and the camera
 * group holds two plus a loose Fit button, so a per-row accessor is needed
 * where the old flat one silently spanned them.
 */
function row(
  container: HTMLElement,
  groupLabel: string,
  index: number,
): HTMLButtonElement[] {
  const rows = group(container, groupLabel).querySelectorAll(
    ".pose-panel__buttons",
  );
  const found = rows[index];
  if (!found) throw new Error(`no row ${index} in group ${groupLabel}`);
  return Array.from(found.querySelectorAll<HTMLButtonElement>("button"));
}

function byLabel(container: HTMLElement, label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no control labelled ${label}`);
  return el;
}

function byText(container: HTMLElement, text: string): HTMLButtonElement {
  const el = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );
  if (!el) throw new Error(`no button reading ${text}`);
  return el as HTMLButtonElement;
}

describe("PoseSection — mounts every story with no provider", () => {
  it("exposes exactly the four stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual(
      ["NoMesh", "Primitive", "Mannequin", "Orthographic"].sort(),
    );
  });

  it("renders all seven control groups", () => {
    const { container } = render(<composed.Primitive />);
    expect(
      Array.from(container.querySelectorAll(".pose-panel__group-label")).map(
        (el) => el.textContent,
      ),
    ).toEqual([
      "Model",
      "Framing",
      "Rotation & light",
      "Colours",
      "Outline",
      "Camera",
    ]);
  });

  it("shows the hint and no Clear with no mesh, and the reverse with one", () => {
    const empty = render(<composed.NoMesh />);
    expect(
      Array.from(empty.container.querySelectorAll("button")).map(
        (b) => b.textContent,
      ),
    ).not.toContain("Clear pose");

    const loaded = render(<composed.Primitive />);
    expect(
      Array.from(loaded.container.querySelectorAll("button")).map(
        (b) => b.textContent,
      ),
    ).toContain("Clear pose");
  });
});

describe("PoseSection — the mesh buttons", () => {
  it("offers the four reference solids and fires each own id", () => {
    const { container } = render(<composed.NoMesh />);
    const onSelectMesh = composed.NoMesh.args.onSelectMesh;
    const meshRow = buttons(container, "Model");

    expect(meshRow.map((b) => b.textContent)).toEqual([
      "Cube",
      "Sphere",
      "Cylinder",
      "Mannequin",
    ]);

    const ids = ["cube", "sphere", "cylinder", "mannequin"];
    meshRow.forEach((button, index) => {
      fireEvent.click(button);
      expect(onSelectMesh).toHaveBeenLastCalledWith(ids[index]);
    });
    expect(onSelectMesh).toHaveBeenCalledTimes(4);
  });

  it("marks the loaded mesh active and no other", () => {
    const { container } = render(<composed.Primitive />);
    const active = buttons(container, "Model").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual(["Cube"]);
  });
});

describe("PoseSection — framing is mannequin-only (MASTER D4)", () => {
  it("disables every framing button for a primitive, without hiding them", () => {
    const { container } = render(<composed.Primitive />);
    const framingRow = buttons(container, "Framing");

    expect(framingRow.map((b) => b.textContent)).toEqual([
      "Full",
      "Head",
      "Torso",
      "Arm",
      "Leg",
      "Hand",
    ]);
    for (const button of framingRow) expect(button.disabled).toBe(true);
  });

  it("disables them with no mesh at all", () => {
    const { container } = render(<composed.NoMesh />);
    for (const button of buttons(container, "Framing")) {
      expect(button.disabled).toBe(true);
    }
  });

  it("enables them for the mannequin and fires each own id", () => {
    const { container } = render(<composed.Mannequin />);
    const onSelectFraming = composed.Mannequin.args.onSelectFraming;
    const framingRow = buttons(container, "Framing");

    for (const button of framingRow) expect(button.disabled).toBe(false);

    const ids = ["full", "head", "torso", "arm", "leg", "hand"];
    framingRow.forEach((button, index) => {
      fireEvent.click(button);
      expect(onSelectFraming).toHaveBeenLastCalledWith(ids[index]);
    });
  });

  it("marks the selected region active", () => {
    const { container } = render(<composed.Mannequin />);
    const active = buttons(container, "Framing").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual(["Head"]);
  });
});

describe("PoseSection — the orbs and the viewpoint snaps", () => {
  it("renders TWO instances of the one orb component", () => {
    const { container } = render(<composed.Primitive />);
    expect(
      Array.from(container.querySelectorAll(".direction-orb__sphere")).map((o) =>
        o.getAttribute("aria-label"),
      ),
    ).toEqual(["Rotation", "Light"]);
  });

  it("each viewpoint button fires onSetRotation with poseCamera's angles", () => {
    // ⚠️ The anti-drift check: the expectation is read from the SAME table the
    // component imports. A component that re-declared the angles would pass a
    // hand-written expectation and quietly disagree with the camera maths.
    const { container } = render(<composed.Primitive />);
    const onSetRotation = composed.Primitive.args.onSetRotation;
    const snaps = row(container, "Rotation & light", 0);

    expect(snaps).toHaveLength(POSE_VIEWPOINT_ORDER.length);
    expect(snaps.map((b) => b.textContent)).toEqual([
      "Front",
      "Back",
      "Left",
      "Right",
      "Top",
      "Bottom",
      "3/4",
    ]);

    POSE_VIEWPOINT_ORDER.forEach((id, index) => {
      fireEvent.click(snaps[index]);
      expect(onSetRotation).toHaveBeenLastCalledWith(
        POSE_VIEWPOINT_ROTATIONS[id],
      );
    });
  });

  it("the rotation orb's handle reflects the incoming rotation prop", () => {
    // Mannequin's rotation is the 3/4 viewpoint: yaw 45°, so the handle sits
    // right of centre rather than at it. This is the controlled contract the
    // viewpoint buttons rely on.
    const three = render(<composed.Mannequin />);
    const front = render(<composed.Primitive />);

    const cx = (c: HTMLElement) =>
      Number(c.querySelector(".direction-orb__handle")?.getAttribute("cx"));

    expect(cx(front.container)).toBeCloseTo(50, 6);
    expect(cx(three.container)).toBeGreaterThan(50);
  });
});

/* ── the light tint presets ────────────────────────────────────────────────
 *
 * Task 03's documented decision: the key light's tint is NOT a Fill/Edge
 * concept, so it keeps a control of its own rather than being folded behind
 * the app's picker (which would need a third slot, and E10 forbids one) or
 * dropped. It is a preset row rather than a native swatch — see the
 * component's header.
 */
describe("PoseSection — the light tint presets", () => {
  it("offers five tints and emits a fully opaque colour for each", () => {
    const { container } = render(<composed.Primitive />);
    const onSetLightColor = composed.Primitive.args.onSetLightColor;
    const tints = row(container, "Rotation & light", 1);

    expect(tints.map((b) => b.textContent)).toEqual([
      "Neutral",
      "Warm",
      "Cool",
      "Amber",
      "Moon",
    ]);

    for (const button of tints) {
      fireEvent.click(button);
      const [color] = spy(onSetLightColor).mock.lastCall as [
        { r: number; g: number; b: number; a: number },
      ];
      expect(color.a).toBe(255);
      for (const channel of [color.r, color.g, color.b]) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
    expect(onSetLightColor).toHaveBeenCalledTimes(5);
  });

  it("marks the tint matching the current light colour, and only it", () => {
    // The stories' default light colour is pure white — "Neutral".
    const { container } = render(<composed.Primitive />);
    const active = row(container, "Rotation & light", 1).filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual(["Neutral"]);
  });
});

/* ── the app's colour slots (MASTER E8/E9/E10) ────────────────────────────── */

describe("PoseSection — the Fill/Edge colour slots", () => {
  it("renders NO native colour input anywhere — the owner's complaint", () => {
    for (const Story of [
      composed.NoMesh,
      composed.Primitive,
      composed.Mannequin,
      composed.Orthographic,
    ]) {
      const { container } = render(<Story />);
      expect(container.querySelectorAll('input[type="color"]')).toHaveLength(0);
    }
  });

  it("shows the passed Fill and Edge colours as swatches", () => {
    const { container } = render(<composed.Primitive />);
    const { modelColor, edgeColor } = {
      ...composed.Primitive.args,
    } as Required<typeof composed.Primitive.args>;

    const swatches = Array.from(
      container.querySelectorAll<HTMLElement>(".pose-panel__slot-swatch"),
    );
    expect(swatches).toHaveLength(2);
    // ⚠️ jsdom re-serialises a fully-opaque `rgba(r, g, b, 1)` as `rgb(r, g, b)`,
    // so the assertion is on the CHANNELS, not on the literal string the
    // component writes. Both stories' colours are opaque.
    expect(swatches[0].style.backgroundColor).toBe(
      `rgb(${modelColor.r}, ${modelColor.g}, ${modelColor.b})`,
    );
    expect(swatches[1].style.backgroundColor).toBe(
      `rgb(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b})`,
    );
  });

  it("clicking a swatch asks to EDIT that slot, and sets no colour itself", () => {
    const { container } = render(<composed.Primitive />);
    const args = composed.Primitive.args;

    fireEvent.click(byLabel(container, "Model colour"));
    expect(args.onEditModelColor).toHaveBeenCalledTimes(1);
    expect(args.onEditEdgeColor).not.toHaveBeenCalled();

    fireEvent.click(byLabel(container, "Outline colour"));
    expect(args.onEditEdgeColor).toHaveBeenCalledTimes(1);

    // ⚠️ The rail does NOT own these colours — the app's picker does. There is
    // no `onSetModelColor` prop at all, and the section must never behave as
    // if it could write the slot.
    expect(Object.keys(args)).not.toContain("onSetModelColor");
    expect(Object.keys(args)).not.toContain("onSetEdgeColor");
  });

  it("marks the slot the main picker is currently editing", () => {
    // `colorTarget: "fill"` in Primitive, `"edge"` in Mannequin.
    const fill = render(<composed.Primitive />);
    expect(byLabel(fill.container, "Model colour").className).toContain(
      "pose-panel__slot--active",
    );
    expect(byLabel(fill.container, "Outline colour").className).not.toContain(
      "pose-panel__slot--active",
    );
    expect(
      byLabel(fill.container, "Model colour").getAttribute("aria-pressed"),
    ).toBe("true");

    const edge = render(<composed.Mannequin />);
    expect(byLabel(edge.container, "Outline colour").className).toContain(
      "pose-panel__slot--active",
    );
    expect(byLabel(edge.container, "Model colour").className).not.toContain(
      "pose-panel__slot--active",
    );
  });
});

/* ── the outline width slider (MASTER E4) ─────────────────────────────────── */

describe("PoseSection — the outline width slider", () => {
  it("is an integer slider over 0–4, with 0 the documented off state", () => {
    const { container } = render(<composed.Primitive />);
    const slider = byLabel(container, "Outline width");

    expect(slider.type).toBe("range");
    expect(slider.min).toBe(String(POSE_EDGE_WIDTH_MIN));
    expect(slider.max).toBe(String(POSE_EDGE_WIDTH_MAX));
    expect(slider.step).toBe("1");
    expect(POSE_EDGE_WIDTH_MIN).toBe(0);
    expect(POSE_EDGE_WIDTH_MAX).toBe(4);
  });

  it("reads 0 as Off and any other width in pixels", () => {
    const off = render(<composed.NoMesh />); // edgeWidth 0
    expect(
      group(off.container, "Outline").querySelector(".pose-panel__slider-value")
        ?.textContent,
    ).toBe("Off");

    const thin = render(<composed.Primitive />); // edgeWidth 1
    expect(
      group(thin.container, "Outline").querySelector(".pose-panel__slider-value")
        ?.textContent,
    ).toBe("1 px");

    const thick = render(<composed.Mannequin />); // edgeWidth 4
    expect(
      group(thick.container, "Outline").querySelector(
        ".pose-panel__slider-value",
      )?.textContent,
    ).toBe("4 px");
  });

  it("emits whole pixels only, even from a fractional input value", () => {
    const { container } = render(<composed.Primitive />);
    const slider = byLabel(container, "Outline width");
    const onSetEdgeWidth = composed.Primitive.args.onSetEdgeWidth;

    for (const value of ["0", "2", "4"]) {
      fireEvent.change(slider, { target: { value } });
      expect(onSetEdgeWidth).toHaveBeenLastCalledWith(Number(value));
    }

    // The DOM step clamps a drag, but a programmatic 2.6 must still round —
    // the outline dilates by whole pixels and has no fractional state.
    fireEvent.change(slider, { target: { value: "2.6" } });
    expect(onSetEdgeWidth).toHaveBeenLastCalledWith(3);
    for (const call of spy(onSetEdgeWidth).mock.calls) {
      expect(Number.isInteger(call[0])).toBe(true);
    }
  });

  it("renders a fractional incoming width as a whole pixel", () => {
    const { container } = render(<composed.Primitive edgeWidth={2.4} />);
    expect(byLabel(container, "Outline width").value).toBe("2");
    expect(
      group(container, "Outline").querySelector(".pose-panel__slider-value")
        ?.textContent,
    ).toBe("2 px");
  });
});

describe("PoseSection — the camera group", () => {
  it("offers both projections and fires each own id", () => {
    const { container } = render(<composed.Primitive />);
    const onSetProjection = composed.Primitive.args.onSetProjection;
    const projections = row(container, "Camera", 0);

    expect(projections.map((b) => b.textContent)).toEqual([
      "Perspective",
      "Orthographic",
    ]);
    expect(projections[0].className).toContain("pose-panel__btn--active");

    fireEvent.click(projections[1]);
    expect(onSetProjection).toHaveBeenLastCalledWith("orthographic");
    fireEvent.click(projections[0]);
    expect(onSetProjection).toHaveBeenLastCalledWith("perspective");
  });

  it("each preset button fires onSelectCameraPreset with poseCamera's id", () => {
    const { container } = render(<composed.Primitive />);
    const onSelectCameraPreset = composed.Primitive.args.onSelectCameraPreset;
    const presets = row(container, "Camera", 1);

    expect(presets.map((b) => b.textContent)).toEqual(
      POSE_CAMERA_PRESETS.map((p) => p.label),
    );

    POSE_CAMERA_PRESETS.forEach((preset, index) => {
      fireEvent.click(presets[index]);
      expect(onSelectCameraPreset).toHaveBeenLastCalledWith(preset.id);
    });
    expect(onSelectCameraPreset).toHaveBeenCalledTimes(
      POSE_CAMERA_PRESETS.length,
    );
  });

  it("marks the active preset, from the imported table", () => {
    const { container } = render(<composed.Orthographic />);
    const active = buttons(container, "Camera").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual([
      "Orthographic",
      "Isometric",
    ]);
  });

  it("the zoom slider no longer caps at 10 — the owner's complaint", () => {
    // ⚠️ REGRESSION PIN. `max={10}` mirrored the deleted `POSE_ZOOM_MAX`; with
    // it in place the owner could not make the model bigger from the only
    // control they touch. The slider still needs finite ends to place a thumb,
    // so what is asserted is that its travel is far past the old cap AND that
    // an unbounded numeric path exists beside it (MASTER E11).
    const { container } = render(<composed.Orthographic />);
    const zoom = byLabel(container, "Zoom");
    expect(Number(zoom.max)).toBe(POSE_ZOOM_SLIDER_MAX);
    expect(Number(zoom.max)).toBeGreaterThan(10);

    const box = byLabel(container, "Zoom value");
    expect(box.type).toBe("number");
    expect(box.getAttribute("max")).toBeNull();
  });

  it("the zoom controls are live and report a value past the old cap", () => {
    const { container } = render(<composed.Orthographic />);
    const onSetZoom = composed.Orthographic.args.onSetZoom;

    const zoom = byLabel(container, "Zoom");
    expect(zoom.disabled).toBe(false);
    expect(zoom.value).toBe("18");
    expect(byLabel(container, "Zoom value").value).toBe("18");

    fireEvent.change(zoom, { target: { value: "4" } });
    expect(onSetZoom).toHaveBeenLastCalledWith(4);
  });

  it("the number box accepts a value the slider cannot reach, and ignores NaN", () => {
    const { container } = render(<composed.Orthographic />);
    const onSetZoom = composed.Orthographic.args.onSetZoom;
    const box = byLabel(container, "Zoom value");

    fireEvent.change(box, { target: { value: "250" } });
    expect(onSetZoom).toHaveBeenLastCalledWith(250);

    // ⚠️ An emptied or half-typed box must send NOTHING. A number input
    // sanitises anything unparseable to `""`, and `Number("")` is `0` — not
    // `NaN` — so a naive finite-check would collapse the camera to the store's
    // safety floor on the way to typing a new value.
    const before = spy(onSetZoom).mock.calls.length;
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.change(box, { target: { value: "not a number" } });
    expect(spy(onSetZoom).mock.calls.length).toBe(before);
  });

  it("clamps only the SLIDER's thumb when zoom exceeds its travel", () => {
    // The store's value is untouched — the number box still shows it — but the
    // range input cannot represent it, so its thumb parks at the far end.
    const { container } = render(
      <composed.Orthographic zoom={POSE_ZOOM_SLIDER_MAX + 60} />,
    );
    expect(byLabel(container, "Zoom").value).toBe(String(POSE_ZOOM_SLIDER_MAX));
    expect(byLabel(container, "Zoom value").value).toBe(
      String(POSE_ZOOM_SLIDER_MAX + 60),
    );
  });

  it("disables the FOV slider in orthographic and enables it in perspective", () => {
    const ortho = render(<composed.Orthographic />);
    expect(byLabel(ortho.container, "Field of view").disabled).toBe(true);

    const persp = render(<composed.Primitive />);
    const fov = byLabel(persp.container, "Field of view");
    expect(fov.disabled).toBe(false);
    expect(fov.value).toBe("50");

    fireEvent.change(fov, { target: { value: "75" } });
    expect(composed.Primitive.args.onSetFov).toHaveBeenCalledWith(75);
  });
});

/* ── Fit to canvas (MASTER E14/E15) ───────────────────────────────────────── */

describe("PoseSection — Fit to canvas", () => {
  it("fires onRequestFit, once per press", () => {
    const { container } = render(<composed.Primitive />);
    const fit = byText(container, "Fit to canvas");

    expect(fit.disabled).toBe(false);
    fireEvent.click(fit);
    fireEvent.click(fit);
    // ⚠️ A COUNTER, not a boolean (E14): two presses must be two events, and
    // the rail must not swallow the second because "nothing changed".
    expect(composed.Primitive.args.onRequestFit).toHaveBeenCalledTimes(2);
  });

  it("is present but disabled with no mesh to fit", () => {
    const { container } = render(<composed.NoMesh />);
    const fit = byText(container, "Fit to canvas");
    expect(fit.disabled).toBe(true);

    // ⚠️ Counted rather than `not.toHaveBeenCalled()` — see the note at the
    // top of the file: the spy is shared with the other three stories.
    const before = spy(composed.NoMesh.args.onRequestFit).mock.calls.length;
    fireEvent.click(fit);
    expect(spy(composed.NoMesh.args.onRequestFit).mock.calls.length).toBe(before);
  });

  it("sits inside the camera group, which is what it re-frames", () => {
    const { container } = render(<composed.Primitive />);
    // `:last-of-type` is scoped per PARENT, so it would match the last button
    // of each row. The Fit button is the camera group's last DIRECT child.
    const direct = Array.from(
      group(container, "Camera").children,
    ).filter((el): el is HTMLButtonElement => el.tagName === "BUTTON");
    expect(direct.map((b) => b.textContent)).toEqual(["Fit to canvas"]);
  });
});

describe("PoseSection — clear", () => {
  it("Clear pose fires onClear", () => {
    const { container } = render(<composed.Primitive />);
    fireEvent.click(byText(container, "Clear pose"));
    expect(composed.Primitive.args.onClear).toHaveBeenCalledTimes(1);
  });
});
