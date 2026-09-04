/**
 * PoseSection — every story mounts with NO store provider, and each control
 * fires the right callback with the right value (pose-tool task 07; reworked
 * by pose-refinements task 03).
 *
 * What is pinned:
 *  - each mesh button calls `onSelectMesh` with its own id, not its index.
 *  - the mannequin PART buttons (MASTER E1/E2) replace the old Framing row:
 *    they route through `onSelectMesh`, they are never disabled, and `Full`
 *    emits `"mannequin"`. Their labels and order are read from
 *    `poseMeshes.ts`'s `MANNEQUIN_PART_ORDER`, so a re-declared copy in the
 *    rail would fail here rather than drift from the geometry.
 *  - the FOV slider is disabled in orthographic and live in perspective.
 *  - each camera preset button calls `onApplyCameraPreset` with the WHOLE
 *    resolved spec (plan 08, F7) — not just its id — so the container can set
 *    every camera field and the model's rotation in one action.
 *  - each viewpoint button calls `onSetRotation` with the angles FROM
 *    `poseCamera.ts`. This is the anti-drift check: the test reads the same
 *    table the component does, so a re-declared copy in the component would
 *    fail here rather than silently disagree with the camera maths.
 *  - the two orbs are two instances of ONE component (MASTER D13), labelled
 *    Rotation and Light.
 *
 * Added by plan 08 task 07:
 *  - the rotation group now carries **five** numeric boxes: three degree
 *    fields for the model's rotation (`X`/`Y`/`Z`, F10 — degrees in, radians
 *    out) and **two** for the light (`Azimuth`/`Elevation`, F11 — a direction
 *    has two degrees of freedom, so there is deliberately no third).
 *  - the boxes and the orbs are two views of ONE value: both read the same
 *    prop, so neither can drift from the other.
 *  - the empty/partial-input guard, again at the wired-up level.
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
 *  - ⚠️ the SCALE slider's old `max={10}` is GONE — the regression pin for the
 *    owner's "the zoom is capping out" complaint. ⚠️ Renamed from Zoom AND
 *    re-meant on 2026-09-04 (plan 08, F6): it scales the MODEL about its own
 *    origin, and the camera holds still.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../PoseSection.stories";
import {
  POSE_EDGE_WIDTH_MAX,
  POSE_EDGE_WIDTH_MIN,
  POSE_SCALE_SLIDER_MAX,
} from "../PoseSection";
import {
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
} from "../../../canvas/pose/poseCamera";
import { MANNEQUIN_PART_ORDER } from "../../../canvas/pose/poseMeshes";

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
function spy(callback: unknown): {
  mock: { calls: unknown[][]; lastCall?: unknown[] };
} {
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

function buttons(
  container: HTMLElement,
  groupLabel: string,
): HTMLButtonElement[] {
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
  const el = container.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`,
  );
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
  it("exposes exactly the five stories the task requires", () => {
    // +1 (2026-09-04, plan 08 task 08): `SavedPresets` — the state in which
    // the project file gains a `posePresets` key at all. Every other story
    // has `presets: []`, and that absence is what keeps the owner's 151
    // backup snapshots byte-identical (F13).
    expect(Object.keys(composed).sort()).toEqual(
      [
        "NoMesh",
        "Primitive",
        "Mannequin",
        "Orthographic",
        "SavedPresets",
      ].sort(),
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
      "Mannequin",
      "Rotation & light",
      "Colours",
      "Outline",
      "Camera",
      // Plan 08 task 08. ⚠️ The **Camera** group is now rendered by
      // `PoseCameraGroup`, split out because this file sat at 399 of the 400
      // code-line `ui/` ERROR ceiling — this assertion is the pin that the
      // split changed no markup: the group is still here, still labelled
      // "Camera", still in the same position.
      "Scene presets",
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
  it("offers the three primitives and fires each own id", () => {
    // ⚠️ Three, not four: `"mannequin"` moved to the Mannequin row below, as
    // its **Full** button, next to the five parts it now sits with.
    const { container } = render(<composed.NoMesh />);
    const onSelectMesh = composed.NoMesh.args.onSelectMesh;
    const meshRow = buttons(container, "Model");

    expect(meshRow.map((b) => b.textContent)).toEqual([
      "Cube",
      "Sphere",
      "Cylinder",
    ]);

    const ids = ["cube", "sphere", "cylinder"];
    meshRow.forEach((button, index) => {
      fireEvent.click(button);
      expect(onSelectMesh).toHaveBeenLastCalledWith(ids[index]);
    });
  });

  it("marks the loaded mesh active and no other", () => {
    const { container } = render(<composed.Primitive />);
    const active = buttons(container, "Model").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual(["Cube"]);
  });
});

/* ── the mannequin part buttons (MASTER E1/E2) ─────────────────────────────
 *
 * These REPLACED the Framing row. The distinction the tests pin is not
 * cosmetic: framing aimed the camera at a slice of the whole figure, so it was
 * meaningless on a primitive and the row had to be DISABLED for one. A part is
 * its own geometry now, so every button is loadable from any state and they
 * all route through `onSelectMesh` — there is no `onSelectFraming` prop left.
 */
describe("PoseSection — the mannequin part buttons", () => {
  it("offers Full plus the five parts, in poseMeshes' own order", () => {
    const { container } = render(<composed.Primitive />);
    const partRow = buttons(container, "Mannequin");

    // ⚠️ The anti-drift check, the same device the viewpoint test uses: the
    // expectation is derived from the SAME table the component imports, so a
    // re-declared copy in the rail would disagree with the geometry loudly.
    expect(partRow.map((b) => b.textContent)).toEqual([
      "Full",
      ...MANNEQUIN_PART_ORDER.map(
        (id) => id.charAt(0).toUpperCase() + id.slice(1),
      ),
    ]);
    expect(partRow.map((b) => b.textContent)).toEqual([
      "Full",
      "Head",
      "Torso",
      "Arm",
      "Leg",
      "Hand",
    ]);
  });

  it("is NEVER disabled — a part is a mesh, not a crop of one", () => {
    // The old Framing row was disabled for a primitive and with no mesh at
    // all, because there was nothing to frame. This is the regression pin for
    // that behaviour being gone.
    for (const Story of [
      composed.NoMesh,
      composed.Primitive,
      composed.Orthographic,
    ]) {
      const { container } = render(<Story />);
      for (const button of buttons(container, "Mannequin")) {
        expect(button.disabled).toBe(false);
      }
    }
  });

  it("each part button loads that MESH — onSelectMesh, not a framing", () => {
    const { container } = render(<composed.Mannequin />);
    const onSelectMesh = composed.Mannequin.args.onSelectMesh;
    const partRow = buttons(container, "Mannequin");

    // ⚠️ `"mannequin"` for Full — the whole figure's mesh id. The deleted
    // framing union's `"full"` has no counterpart in `PoseMeshId`, and
    // emitting it here would be an id no loader can build.
    const ids = ["mannequin", ...MANNEQUIN_PART_ORDER];
    partRow.forEach((button, index) => {
      fireEvent.click(button);
      expect(onSelectMesh).toHaveBeenLastCalledWith(ids[index]);
    });
  });

  it("marks the loaded part active, and leaves the primitive row cold", () => {
    // The Mannequin story loads `meshId: "head"` — a part on its own.
    const { container } = render(<composed.Mannequin />);
    expect(
      buttons(container, "Mannequin")
        .filter((b) => b.className.includes("pose-panel__btn--active"))
        .map((b) => b.textContent),
    ).toEqual(["Head"]);
    expect(
      buttons(container, "Model").filter((b) =>
        b.className.includes("pose-panel__btn--active"),
      ),
    ).toHaveLength(0);
  });

  it("the rail no longer offers a framing callback at all", () => {
    // E2 — deleted, not deprecated. A prop left behind would let a caller
    // wire the old behaviour back in without a compile error.
    expect(Object.keys(composed.Primitive.args)).not.toContain(
      "onSelectFraming",
    );
    expect(Object.keys(composed.Primitive.args)).not.toContain("framing");
  });
});

describe("PoseSection — the orbs and the viewpoint snaps", () => {
  it("renders TWO instances of the one orb component", () => {
    const { container } = render(<composed.Primitive />);
    expect(
      Array.from(container.querySelectorAll(".direction-orb__sphere")).map(
        (o) => o.getAttribute("aria-label"),
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

  it("Left's tooltip says the model turns left and shows its right side (F9)", () => {
    // ⚠️ The user-facing half of F9. "Left" alone is the ambiguity that got
    // this table inverted twice; the tooltip is where the convention is stated
    // to the person pressing the button, so it is pinned like the angles are.
    const { container } = render(<composed.Primitive />);
    const snaps = row(container, "Rotation & light", 0);
    const titleOf = (label: string) =>
      snaps.find((b) => b.textContent === label)?.getAttribute("title") ?? "";

    expect(titleOf("Left")).toBe(
      "Turn the model to face left — you see its right side",
    );
    expect(titleOf("Right")).toBe(
      "Turn the model to face right — you see its left side",
    );
    // Viewer-centric, and deliberately worded differently — see F9.
    expect(titleOf("Top")).toBe("Look at the top of the model");
    expect(titleOf("Bottom")).toBe("Look at the underside of the model");
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
      group(thin.container, "Outline").querySelector(
        ".pose-panel__slider-value",
      )?.textContent,
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

  it("each preset button hands over the WHOLE preset, not just its id (F7)", () => {
    // ⚠️ The id alone is not enough any more. F7 makes a preset set every
    // camera field AND the model's rotation, so the rail emits the entry it
    // rendered — the same object from the same table the camera maths reads.
    const { container } = render(<composed.Primitive />);
    const onApplyCameraPreset = composed.Primitive.args.onApplyCameraPreset;
    const presets = row(container, "Camera", 1);

    expect(presets.map((b) => b.textContent)).toEqual(
      POSE_CAMERA_PRESETS.map((p) => p.label),
    );

    POSE_CAMERA_PRESETS.forEach((preset, index) => {
      fireEvent.click(presets[index]);
      expect(onApplyCameraPreset).toHaveBeenLastCalledWith(preset);
    });
    expect(onApplyCameraPreset).toHaveBeenCalledTimes(
      POSE_CAMERA_PRESETS.length,
    );
  });

  it("every emitted preset carries a rotation and an FOV, not only angles", () => {
    // The regression guard for "the preset table was extended but the rail
    // still emits the old three fields": read what actually reached the
    // callback rather than what the table declares.
    const { container } = render(<composed.Primitive />);
    const onApplyCameraPreset = composed.Primitive.args.onApplyCameraPreset;
    const presets = row(container, "Camera", 1);

    fireEvent.click(presets[0]);
    expect(onApplyCameraPreset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        projection: expect.any(String),
        pitch: expect.any(Number),
        yaw: expect.any(Number),
        fov: expect.any(Number),
        clipPolicy: "fit",
        rotation: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          z: expect.any(Number),
        }),
      }),
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

  it("the scale slider no longer caps at 10 — the owner's complaint", () => {
    // ⚠️ REGRESSION PIN. `max={10}` mirrored the deleted `POSE_ZOOM_MAX`; with
    // it in place the owner could not make the model bigger from the only
    // control they touch. The slider still needs finite ends to place a thumb,
    // so what is asserted is that its travel is far past the old cap AND that
    // an unbounded numeric path exists beside it (MASTER E11).
    const { container } = render(<composed.Orthographic />);
    const scale = byLabel(container, "Scale");
    expect(Number(scale.max)).toBe(POSE_SCALE_SLIDER_MAX);
    expect(Number(scale.max)).toBeGreaterThan(10);

    const box = byLabel(container, "Scale value");
    expect(box.type).toBe("number");
    expect(box.getAttribute("max")).toBeNull();
  });

  it("the scale controls are live and report a value past the old cap", () => {
    const { container } = render(<composed.Orthographic />);
    const onSetScale = composed.Orthographic.args.onSetScale;

    const scale = byLabel(container, "Scale");
    expect(scale.disabled).toBe(false);
    expect(scale.value).toBe("18");
    expect(byLabel(container, "Scale value").value).toBe("18");

    fireEvent.change(scale, { target: { value: "4" } });
    expect(onSetScale).toHaveBeenLastCalledWith(4);
  });

  it("the number box accepts a value the slider cannot reach, and ignores NaN", () => {
    const { container } = render(<composed.Orthographic />);
    const onSetScale = composed.Orthographic.args.onSetScale;
    const box = byLabel(container, "Scale value");

    fireEvent.change(box, { target: { value: "250" } });
    expect(onSetScale).toHaveBeenLastCalledWith(250);

    // ⚠️ An emptied or half-typed box must send NOTHING. A number input
    // sanitises anything unparseable to `""`, and `Number("")` is `0` — not
    // `NaN` — so a naive finite-check would collapse the camera to the store's
    // safety floor on the way to typing a new value.
    const before = spy(onSetScale).mock.calls.length;
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.change(box, { target: { value: "not a number" } });
    expect(spy(onSetScale).mock.calls.length).toBe(before);
  });

  it("clamps only the SLIDER's thumb when scale exceeds its travel", () => {
    // The store's value is untouched — the number box still shows it — but the
    // range input cannot represent it, so its thumb parks at the far end.
    const { container } = render(
      <composed.Orthographic scale={POSE_SCALE_SLIDER_MAX + 60} />,
    );
    expect(byLabel(container, "Scale").value).toBe(
      String(POSE_SCALE_SLIDER_MAX),
    );
    expect(byLabel(container, "Scale value").value).toBe(
      String(POSE_SCALE_SLIDER_MAX + 60),
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

/* ── exact angle entry (plan 08 task 07, F10/F11) ─────────────────────────── */

describe("PoseSection — exact angle entry", () => {
  it("puts THREE rotation boxes and TWO light boxes in the rotation group", () => {
    const { container } = render(<composed.Primitive />);
    const rotationGroup = group(container, "Rotation & light");
    const fields = Array.from(
      rotationGroup.querySelectorAll<HTMLInputElement>("input[type=number]"),
    );

    // ⚠️ Five, not six. The light is a unit VECTOR with two degrees of
    // freedom, so it gets Azimuth and Elevation rather than a third box the
    // owner could type into to no effect (plan 08, F11, decided 2026-09-04).
    expect(fields.map((f) => f.getAttribute("aria-label"))).toEqual([
      "Rotation X",
      "Rotation Y",
      "Rotation Z",
      "Light Azimuth",
      "Light Elevation",
    ]);
  });

  it("types DEGREES into a rotation box and emits RADIANS (F10)", () => {
    const { container } = render(<composed.Primitive />);
    fireEvent.change(byLabel(container, "Rotation Y"), {
      target: { value: "45" },
    });
    // The store is the single source of truth IN RADIANS; the conversion
    // happens at this component's edge and nowhere else.
    expect(composed.Primitive.args.onSetRotation).toHaveBeenLastCalledWith({
      x: 0,
      y: Math.PI / 4,
      z: 0,
    });
  });

  it("shows the SAME value the orb is drawn from — two views, one value", () => {
    // The Mannequin story sits at the three-quarter viewpoint, so the boxes
    // must read those exact angles converted to degrees. Both the orb and the
    // boxes take the `rotation` prop; neither holds a value of its own, which
    // is what makes dragging one move the other.
    const { container } = render(<composed.Mannequin />);
    const expected = POSE_VIEWPOINT_ROTATIONS["three-quarter"];
    const shown = (label: string) => Number(byLabel(container, label).value);

    expect(shown("Rotation X")).toBeCloseTo((expected.x * 180) / Math.PI, 1);
    expect(shown("Rotation Y")).toBeCloseTo((expected.y * 180) / Math.PI, 1);
    expect(shown("Rotation Z")).toBeCloseTo((expected.z * 180) / Math.PI, 1);
  });

  it("emits a unit direction from the light's two angles", () => {
    const { container } = render(<composed.Primitive />);
    fireEvent.change(byLabel(container, "Light Azimuth"), {
      target: { value: "90" },
    });
    const emitted = spy(composed.Primitive.args.onSetLightDirection).mock
      .lastCall?.[0] as { x: number; y: number; z: number };
    expect(Math.hypot(emitted.x, emitted.y, emitted.z)).toBeCloseTo(1, 10);
  });

  it("⚠️ sends NOTHING for an emptied box — no mid-keystroke snap to 0", () => {
    // The measured trap: `<input type="number">` sanitises garbage to `""` and
    // `Number("")` is `0`, so a naive guard would flatten the model to zero
    // degrees on the way to typing `-45`.
    const { container } = render(<composed.Primitive />);
    const before = spy(composed.Primitive.args.onSetRotation).mock.calls.length;
    fireEvent.change(byLabel(container, "Rotation X"), {
      target: { value: "" },
    });
    fireEvent.change(byLabel(container, "Rotation X"), {
      target: { value: "-" },
    });
    expect(spy(composed.Primitive.args.onSetRotation).mock.calls.length).toBe(
      before,
    );
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
    expect(spy(composed.NoMesh.args.onRequestFit).mock.calls.length).toBe(
      before,
    );
  });

  it("sits inside the camera group, which is what it re-frames", () => {
    const { container } = render(<composed.Primitive />);
    // `:last-of-type` is scoped per PARENT, so it would match the last button
    // of each row. The Fit button is the camera group's last DIRECT child.
    const direct = Array.from(group(container, "Camera").children).filter(
      (el): el is HTMLButtonElement => el.tagName === "BUTTON",
    );
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

/**
 * Saved scene presets (plan 08 task 08) — the rail half.
 *
 * ⚠️ **What a preset HOLDS is not asserted here, deliberately.** That is
 * `PoseUIStore`'s and `PersistedPosePreset`'s business, and it is pinned in
 * `stores/ui/__tests__/PoseUIStore.test.ts`. `PosePresetList` renders
 * `{id, name}` and emits ids; asserting the field list at this level would be
 * a second place to update every time the preset shape changed, in a
 * component that cannot see it.
 */
describe("PoseSection — saved scene presets", () => {
  it("shows a hint and no list when nothing is saved", () => {
    const { container } = render(<composed.Primitive />);
    expect(container.querySelector(".pose-panel__presets")).toBeNull();
    expect(container.textContent).toContain("No saved scenes yet");
  });

  it("lists every saved preset by name", () => {
    const { container } = render(<composed.SavedPresets />);
    expect(
      Array.from(
        container.querySelectorAll(".pose-panel__preset-apply"),
      ).map((el) => el.textContent),
    ).toEqual([
      "Hero 3/4",
      "Top-down for tiles",
      "Isometric, long name that must wrap",
    ]);
  });

  it("clicking a preset applies it BY ID", () => {
    const { container } = render(<composed.SavedPresets />);
    const apply = spy(composed.SavedPresets.args.onApplyPreset);
    const before = apply.mock.calls.length;
    fireEvent.click(
      container.querySelectorAll(".pose-panel__preset-apply")[1],
    );
    expect(apply.mock.calls.length).toBe(before + 1);
    expect(apply.mock.lastCall).toEqual(["pose-2"]);
  });

  it("⭐ save TRIMS the name", () => {
    const { container } = render(<composed.SavedPresets />);
    const save = spy(composed.SavedPresets.args.onSavePreset);
    const before = save.mock.calls.length;
    const box = byLabel(container, "Preset name");
    fireEvent.change(box, { target: { value: "   Padded   " } });
    fireEvent.click(byText(container, "Save"));
    expect(save.mock.calls.length).toBe(before + 1);
    expect(save.mock.lastCall).toEqual(["Padded"]);
  });

  it("⭐ the Save button is DISABLED — and emits nothing — for an empty name", () => {
    const { container } = render(<composed.SavedPresets />);
    const save = spy(composed.SavedPresets.args.onSavePreset);
    const before = save.mock.calls.length;
    const button = byText(container, "Save");
    expect(button.disabled).toBe(true);

    // And whitespace only is still empty.
    fireEvent.change(byLabel(container, "Preset name"), {
      target: { value: "   " },
    });
    expect(byText(container, "Save").disabled).toBe(true);
    fireEvent.click(byText(container, "Save"));
    expect(save.mock.calls.length).toBe(before);
  });

  it("Enter in the name box saves, so the button is not the only path", () => {
    const { container } = render(<composed.SavedPresets />);
    const save = spy(composed.SavedPresets.args.onSavePreset);
    const before = save.mock.calls.length;
    const box = byLabel(container, "Preset name");
    fireEvent.change(box, { target: { value: "Typed" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(save.mock.calls.length).toBe(before + 1);
    expect(save.mock.lastCall).toEqual(["Typed"]);
  });

  it("clears the name box after a save, so the next one is not a duplicate", () => {
    const { container } = render(<composed.SavedPresets />);
    const box = byLabel(container, "Preset name");
    fireEvent.change(box, { target: { value: "Once" } });
    fireEvent.click(byText(container, "Save"));
    expect(box.value).toBe("");
  });

  it("⭐ DELETE needs a second press — one tap cannot destroy a saved scene", () => {
    const { container } = render(<composed.SavedPresets />);
    const del = spy(composed.SavedPresets.args.onDeletePreset);
    const before = del.mock.calls.length;
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Delete Hero 3/4"]',
    );
    if (!button) throw new Error("no delete button");

    fireEvent.click(button);
    // Armed, not deleted. There is no undo for UI state (MASTER D6).
    expect(del.mock.calls.length).toBe(before);
    const armed = container.querySelector<HTMLButtonElement>(
      '[aria-label="Confirm deleting Hero 3/4"]',
    );
    if (!armed) throw new Error("delete did not arm");
    expect(armed.className).toContain("pose-panel__preset-delete--armed");

    fireEvent.click(armed);
    expect(del.mock.calls.length).toBe(before + 1);
    expect(del.mock.lastCall).toEqual(["pose-1"]);
  });

  it("an armed delete DISARMS when a preset is applied instead", () => {
    const { container } = render(<composed.SavedPresets />);
    const del = spy(composed.SavedPresets.args.onDeletePreset);
    const before = del.mock.calls.length;
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Delete Hero 3/4"]',
    );
    if (!button) throw new Error("no delete button");
    fireEvent.click(button);
    fireEvent.click(
      container.querySelectorAll(".pose-panel__preset-apply")[0],
    );
    expect(
      container.querySelector('[aria-label="Confirm deleting Hero 3/4"]'),
    ).toBeNull();
    expect(del.mock.calls.length).toBe(before);
  });
});

/**
 * The advanced camera panel, MOUNTED (task 06 shipped it standalone; task 08
 * mounts it).
 *
 * ⚠️ Its own behaviour — the drafts, the validation, the `Number("")` guard —
 * is pinned exhaustively in `CameraAdvanced.dom.test.tsx`. These cases pin
 * only that it is **actually on the rail**, inside the Camera group, showing
 * the live projection's fields, and that its save path reaches the same
 * `onSavePreset` the preset list's does.
 */
describe("PoseSection — the advanced camera panel is mounted", () => {
  it("⭐ renders inside the Camera group, collapsed by default", () => {
    const { container } = render(<composed.Primitive />);
    const camera = group(container, "Camera");
    const disclosure =
      camera.querySelector<HTMLButtonElement>(".pose-panel__disclosure");
    if (!disclosure) throw new Error("the advanced panel is not mounted");
    // Collapsed: "advanced" means not always on screen, and the rail is 240px.
    expect(camera.querySelector(".pose-panel__advanced")).toBeNull();
  });

  it("opens to the PERSPECTIVE fields for a perspective camera", () => {
    const { container } = render(<composed.Primitive />);
    const camera = group(container, "Camera");
    fireEvent.click(
      camera.querySelector<HTMLButtonElement>(".pose-panel__disclosure")!,
    );
    expect(byLabel(camera, "Near")).toBeTruthy();
    expect(byLabel(camera, "Far")).toBeTruthy();
    expect(byLabel(camera, "Aspect")).toBeTruthy();
    // ⚠️ No ortho box: showing fields a perspective camera provably ignores
    // would invite the owner to type a value that does nothing (F16).
    expect(camera.querySelector('[aria-label="Left"]')).toBeNull();
  });

  it("opens to the ORTHOGRAPHIC box for an orthographic camera", () => {
    const { container } = render(<composed.Orthographic />);
    const camera = group(container, "Camera");
    fireEvent.click(
      camera.querySelector<HTMLButtonElement>(".pose-panel__disclosure")!,
    );
    for (const field of ["Left", "Right", "Top", "Bottom", "Near", "Far"]) {
      expect(byLabel(camera, field)).toBeTruthy();
    }
    expect(camera.querySelector('[aria-label="Aspect"]')).toBeNull();
  });

  it("⭐ its save-as-preset reaches the SAME callback the preset list uses", () => {
    const { container } = render(<composed.SavedPresets />);
    const save = spy(composed.SavedPresets.args.onSavePreset);
    const before = save.mock.calls.length;
    const camera = group(container, "Camera");
    fireEvent.click(
      camera.querySelector<HTMLButtonElement>(".pose-panel__disclosure")!,
    );
    // ⚠️ Scoped to `.pose-panel__advanced`, because BOTH save buttons read
    // "Save" — the panel's and the preset list's. That they look and read the
    // same is correct: they are the same feature.
    const advanced = camera.querySelector<HTMLElement>(
      ".pose-panel__advanced",
    );
    if (!advanced) throw new Error("the advanced panel did not open");
    fireEvent.change(byLabel(advanced, "Preset name"), {
      target: { value: "  From advanced  " },
    });
    fireEvent.click(byText(advanced, "Save"));
    // ⚠️ One feature, not two: the owner asked for "save that matrix into a
    // preset" and "save ALL orientations ... to a preset" as two halves of the
    // same thing, and two save paths writing two shapes would be two kinds of
    // preset in one list.
    expect(save.mock.calls.length).toBe(before + 1);
    expect(save.mock.lastCall).toEqual(["From advanced"]);
  });

  /* ── D08-16: the other five fields now reach the camera too ──────────── */

  /** Open the advanced panel and return it. */
  function advanced(container: HTMLElement): HTMLElement {
    const camera = group(container, "Camera");
    fireEvent.click(
      camera.querySelector<HTMLButtonElement>(".pose-panel__disclosure")!,
    );
    const panel = camera.querySelector<HTMLElement>(".pose-panel__advanced");
    if (!panel) throw new Error("the advanced panel did not open");
    return panel;
  }

  it("⭐⭐ a typed NEAR reaches onAdvancedChange (task 08 dropped it)", () => {
    // ⚠️ THE D08-16 PIN AT THE RAIL'S EDGE. Between tasks 08 and 09 this
    // callback fired but the container honoured only `fov`, so typing an exact
    // near changed nothing on screen. The container half is pinned in
    // `poseCamera.test.ts`; this is the half that proves the rail still emits.
    const { container } = render(<composed.Primitive />);
    const change = spy(composed.Primitive.args.onAdvancedChange);
    const before = change.mock.calls.length;
    fireEvent.change(byLabel(advanced(container), "Near"), {
      target: { value: "0.25" },
    });
    expect(change.mock.calls.length).toBe(before + 1);
    expect(change.mock.lastCall).toEqual([{ near: 0.25 }]);
  });

  it("⭐ each ORTHOGRAPHIC box emits its own sparse patch", () => {
    // Sparse and one key at a time is why the store's setter MERGES: a
    // replacing setter would wipe the other five on every commit.
    const { container } = render(<composed.Orthographic />);
    const change = spy(composed.Orthographic.args.onAdvancedChange);
    const panel = advanced(container);
    for (const [label, value, key] of [
      ["Left", "-3", "left"],
      ["Right", "4", "right"],
      ["Top", "5", "top"],
      ["Bottom", "-6", "bottom"],
    ] as const) {
      fireEvent.change(byLabel(panel, label), { target: { value } });
      expect(change.mock.lastCall).toEqual([{ [key]: Number(value) }]);
    }
  });

  it("⭐ the ASPECT box emits, on a perspective camera", () => {
    const { container } = render(<composed.Primitive />);
    const change = spy(composed.Primitive.args.onAdvancedChange);
    fireEvent.change(byLabel(advanced(container), "Aspect"), {
      target: { value: "2.5" },
    });
    expect(change.mock.lastCall).toEqual([{ aspect: 2.5 }]);
  });

  it('⭐ "Reset to fitted" is rendered and fires onAdvancedReset', () => {
    // ⚠️ Task 06 shipped the button behind an optional prop and task 08 left
    // it unsupplied, so it did not render at all — there was nothing to reset.
    // The way back to the fitted frustum is the other half of accepting typed
    // values: without it a typed near would be permanent.
    const { container } = render(<composed.Primitive />);
    const reset = spy(composed.Primitive.args.onAdvancedReset);
    const before = reset.mock.calls.length;
    fireEvent.click(byText(advanced(container), "Reset to fitted"));
    expect(reset.mock.calls.length).toBe(before + 1);
  });
});

/**
 * ⚠️ The iPad `touch-action` fix (plan 07's confirmed defect, fixed by task 08)
 * is **NOT tested here, and cannot be.** jsdom has no layout, no compositor and
 * no touch scrolling, so nothing in this repo can observe a browser deciding to
 * scroll the rail instead of dispatching `pointermove` to a slider thumb. The
 * fix is one CSS line (`.pose-panel__slider { touch-action: none; }`) with the
 * `.direction-orb__sphere` precedent beside it, and it stays an **owed manual
 * check on a real device**. A test asserting the class name is present would
 * assert only that a string was typed, which is worse than no test because it
 * reads like coverage.
 */
