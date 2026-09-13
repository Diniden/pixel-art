/**
 * `LayoutPresetPicker` — the layout-mode overlay over the canvas.
 *
 * ⚠️ WHAT THIS PINS, beyond "the cards render": that a thumbnail is DERIVED
 * from its preset's layout rather than drawn per-preset, that only the user's
 * own layouts can be deleted, and that saving is a two-step (press, then
 * name) rather than a press that silently creates "Untitled".
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayoutPresetPicker } from "../LayoutPresetPicker";
import { presetsForDevice, type LayoutPreset } from "../../../layout/layoutPresets";
import { DEFAULT_RAIL_LAYOUT } from "../../../layout/railLayout";

const builtIns = presetsForDevice("desktop");

const custom: LayoutPreset = {
  id: "custom-1",
  name: "Sunday Sprites",
  description: "Your saved layout.",
  custom: true,
  layout: DEFAULT_RAIL_LAYOUT,
};

/**
 * Render, then open the grid.
 *
 * ⚠️ The picker starts COLLAPSED (owner, 2026-08-30), so every assertion
 * about the cards has to expand it first. The collapsed default is itself
 * pinned by the first describe block below — this helper is for the tests
 * whose subject is the grid, not the disclosure.
 */
const openGrid = (ui: React.ReactElement) => {
  const result = render(ui);
  fireEvent.click(screen.getByText("Layout Presets"));
  return result;
};

const base = {
  presets: builtIns,
  current: DEFAULT_RAIL_LAYOUT,
  activeId: "classic" as string | null,
  deviceLabel: "Desktop layouts",
  onApply: () => {},
  onSaveCurrent: () => {},
  onDeletePreset: () => {},
};

describe("the collapsed default", () => {
  it("⭐ shows ONE small button, not the grid, until asked", () => {
    // Layout mode's primary job is the per-rail controls. A wall of cards
    // over the canvas buries them, so the picker opens closed.
    const { container } = render(<LayoutPresetPicker {...base} />);

    expect(screen.getByText("Layout Presets")).toBeTruthy();
    expect(container.querySelectorAll(".layout-presets__card")).toHaveLength(0);
    expect(container.querySelector(".layout-presets__panel")).toBeNull();
  });

  it("⭐ does NOT dim the canvas while collapsed", () => {
    // The scrim arrives with the grid and leaves with it. Dimming behind a
    // single button would make the rail controls read as unavailable when
    // they are the whole point of the mode.
    const { container } = render(<LayoutPresetPicker {...base} />);
    expect(
      container.querySelector(".layout-presets--collapsed"),
    ).not.toBeNull();
  });

  it("opens the grid when the button is pressed, and closes it again", () => {
    const { container } = render(<LayoutPresetPicker {...base} />);

    fireEvent.click(screen.getByText("Layout Presets"));
    expect(
      container.querySelectorAll(".layout-presets__card").length,
    ).toBeGreaterThan(0);
    expect(container.querySelector(".layout-presets--collapsed")).toBeNull();

    fireEvent.click(screen.getByLabelText("Hide the layouts"));
    expect(container.querySelectorAll(".layout-presets__card")).toHaveLength(0);
    expect(screen.getByText("Layout Presets")).toBeTruthy();
  });
});

describe("the card grid", () => {
  it("renders one card per preset, plus the save card", () => {
    const { container } = openGrid(<LayoutPresetPicker {...base} />);
    expect(container.querySelectorAll(".layout-presets__card")).toHaveLength(
      builtIns.length + 1,
    );
    expect(screen.getByText("Save current")).toBeTruthy();
  });

  it("⭐ draws each thumbnail FROM the preset's own layout", () => {
    // The design claim in one assertion. `wide-canvas` puts both rails on the
    // right, so its thumbnail's right half must hold two rail boxes and its
    // left half none — with no per-preset artwork anywhere.
    const wide = builtIns.find((p) => p.id === "wide-canvas")!;
    const { container } = openGrid(
      <LayoutPresetPicker {...base} presets={[wide]} />,
    );
    const main = container.querySelector(".layout-thumb__main")!;
    const kids = [...main.children].map((el) => el.className);

    // [canvas-area][rail][rail] — the canvas area comes first because both
    // rails sit to its right, exactly as `AppShell` would order them.
    expect(kids[0]).toContain("layout-thumb__canvas-area");
    expect(kids[1]).toContain("layout-thumb__rail");
    expect(kids[2]).toContain("layout-thumb__rail");
    // ...and its toolbar is on the right too — "Right Stack" means EVERYTHING
    // stacks on that side (owner, 2026-08-30), which the thumbnail must show
    // or the card misrepresents what applying it does.
    expect(
      container.querySelector(".layout-thumb__canvas-area--toolbar-right"),
    ).not.toBeNull();
  });

  it("⭐ moves the toolbar strip with the preset's toolbar edge", () => {
    // The thumbnail uses the same flex-direction trick `AppShell.css` does,
    // so the modifier is the whole proof that the two agree.
    const left = {
      ...custom,
      layout: {
        ...DEFAULT_RAIL_LAYOUT,
        toolbar: { edge: "left", scale: "regular", spread: 1 },
      },
    } as LayoutPreset;
    const { container } = openGrid(
      <LayoutPresetPicker {...base} presets={[left]} />,
    );
    expect(
      container.querySelector(".layout-thumb__canvas-area--toolbar-left"),
    ).not.toBeNull();
  });

  it("applies a preset when its card is pressed", () => {
    const onApply = vi.fn();
    openGrid(<LayoutPresetPicker {...base} onApply={onApply} />);
    fireEvent.click(screen.getByText(builtIns[1].name));
    expect(onApply).toHaveBeenCalledWith(builtIns[1]);
  });

  it("marks the active preset, and only it", () => {
    const { container } = openGrid(
      <LayoutPresetPicker {...base} activeId="classic" />,
    );
    expect(
      container.querySelectorAll(".layout-presets__card--active"),
    ).toHaveLength(1);
  });

  it("⭐ shows NO description text on a card — thumbnail and name only", () => {
    // A card is ~140px wide; the thumbnail and name already fill it. The
    // description survives as the card's tooltip, so it is not dead data.
    const withDesc = builtIns.find((p) => p.description)!;
    const { container } = openGrid(
      <LayoutPresetPicker {...base} presets={[withDesc]} />,
    );

    expect(container.textContent).not.toContain(withDesc.description);
    expect(container.querySelector(".layout-presets__desc")).toBeNull();
    // ...but it is still reachable as the tooltip.
    expect(
      container
        .querySelector(".layout-presets__card-btn")!
        .getAttribute("title"),
    ).toBe(withDesc.description);
  });

  it("names the device the shortlist belongs to", () => {
    // So it is never a mystery that an iPad's layouts are not a laptop's.
    openGrid(<LayoutPresetPicker {...base} deviceLabel="Tablet layouts" />);
    expect(screen.getByText("Tablet layouts")).toBeTruthy();
  });
});

/**
 * ⚠️ THE SIZING CONTRACT, asserted against the STYLESHEET rather than against
 * a rendered box.
 *
 * jsdom applies no author stylesheet and lays nothing out — every element has
 * a zero-sized box — so `getBoundingClientRect` here would assert nothing. A
 * real layout assertion needs a browser. What CAN be pinned without one is
 * that the declarations the layout depends on are still present, and these
 * are exactly the ones whose loss is SILENT: the panel collapsed to a single
 * narrow column for want of `flex: none`, and nothing failed.
 *
 * These are regression guards for specific measured bugs, not a substitute
 * for looking at the thing. The real check is the manual one, in a browser.
 */
describe("the sizing declarations the layout depends on", () => {
  const css = readFileSync(
    "src/ui/components/LayoutPresetPicker/LayoutPresetPicker.css",
    "utf8",
  );
  /**
   * One rule's body, by EXACT selector.
   *
   * Anchored to a line start and matched against the selector alone, so
   * `.layout-thumb` returns the base block and not `.layout-thumb--fill` —
   * a substring match would make the "base block carries no ratio" assertion
   * below read the wrong rule and pass for the wrong reason.
   */
  const rule = (selector: string) => {
    const escaped = selector.replace(/\./g, "\\.");
    const m = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
    expect(m, `no rule for ${selector}`).not.toBeNull();
    return m![1];
  };

  it("⭐ keeps the panel from shrink-wrapping — the single-column bug", () => {
    // THE BUG: the scrim is a flex container, so the panel is a flex item and
    // defaults to shrink-wrapping its content. The grid's width then resolved
    // against that shrunk box and only ever fitted one column. `flex: none`
    // plus an explicit width is what stops it.
    const panel = rule(".layout-presets__panel");
    expect(panel).toContain("flex: none");
    expect(panel).toContain("width: 60%");
  });

  it("caps the panel at 90% of the region's height", () => {
    // A cap, not a fixed height: a two-card list must not leave most of the
    // panel empty.
    const panel = rule(".layout-presets__panel");
    expect(panel).toContain("max-height: 90%");
    // ⚠️ Matched as a whole declaration, not a substring — `max-height: 90%`
    // CONTAINS "height: 90%", so a plain `not.toContain` fails against the
    // very rule it is meant to approve.
    expect(panel).not.toMatch(/^\s*height:/m);
  });

  it("⭐ wraps the cards rather than laying them out in grid tracks", () => {
    // `auto-fill` needs a definite track width and silently falls back to one
    // column without it — which is how this collapsed. Flex wrap cannot.
    const grid = rule(".layout-presets__grid");
    expect(grid).toContain("flex-wrap: wrap");
    expect(grid).not.toContain("grid-template-columns");
  });

  it("⭐ scrolls the GRID vertically, and never horizontally", () => {
    const grid = rule(".layout-presets__grid");
    expect(grid).toContain("overflow-y: auto");
    expect(grid).toContain("overflow-x: hidden");
    // `min-height: 0` is what lets it shrink so the panel's cap is honoured;
    // without it the rows run off the region instead of scrolling.
    expect(grid).toContain("min-height: 0");
    // ...and the SCRIM must not scroll — that would drag the panel out of
    // the region it is pinned to.
    expect(rule(".layout-presets")).toContain("overflow: hidden");
  });

  it("⭐ gives every card the 4-high-to-5-wide ratio", () => {
    const card = rule(".layout-presets__card");
    expect(card).toContain("aspect-ratio: 5 / 4");
    expect(card).toContain("flex: 1 1 var(--card-w)");
  });

  it("⭐ lets the in-card thumbnail fill, so it cannot fight the card's ratio", () => {
    // Two competing ratios means one of them overflows. The card owns the
    // shape; the thumbnail fills what the name leaves.
    expect(rule(".layout-thumb--fill")).toContain("flex: 1");
    expect(rule(".layout-thumb--standalone")).toContain("aspect-ratio: 5 / 4");
    // The base block must NOT carry one, or every in-card thumbnail fights.
    expect(rule(".layout-thumb")).not.toContain("aspect-ratio");
  });
});

describe("deleting", () => {
  it("⭐ offers a bin for a SAVED layout only — built-ins have none", () => {
    // Absent rather than disabled: a disabled bin on every card would read as
    // "protected" instead of "this one is code".
    const { container } = openGrid(
      <LayoutPresetPicker {...base} presets={[...builtIns, custom]} />,
    );
    expect(
      container.querySelectorAll(".layout-presets__delete"),
    ).toHaveLength(1);
  });

  it("deletes the preset whose bin was pressed", () => {
    const onDeletePreset = vi.fn();
    openGrid(
      <LayoutPresetPicker
        {...base}
        presets={[...builtIns, custom]}
        onDeletePreset={onDeletePreset}
      />,
    );
    fireEvent.click(screen.getByLabelText("Delete the Sunday Sprites layout"));
    expect(onDeletePreset).toHaveBeenCalledWith(custom);
  });
});

describe("saving the current layout", () => {
  it("⭐ asks for a name rather than saving on the first press", () => {
    const onSaveCurrent = vi.fn();
    openGrid(<LayoutPresetPicker {...base} onSaveCurrent={onSaveCurrent} />);

    fireEvent.click(screen.getByText("Save current"));
    expect(onSaveCurrent).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name for the saved layout")).toBeTruthy();
  });

  it("saves the typed name once confirmed", () => {
    const onSaveCurrent = vi.fn();
    openGrid(<LayoutPresetPicker {...base} onSaveCurrent={onSaveCurrent} />);

    fireEvent.click(screen.getByText("Save current"));
    fireEvent.change(screen.getByLabelText("Name for the saved layout"), {
      target: { value: "Thumb grip" },
    });
    fireEvent.click(screen.getByLabelText("Save this layout"));
    expect(onSaveCurrent).toHaveBeenCalledWith("Thumb grip");
  });

  it("saves on Enter and cancels on Escape", () => {
    const onSaveCurrent = vi.fn();
    const { rerender } = openGrid(
      <LayoutPresetPicker {...base} onSaveCurrent={onSaveCurrent} />,
    );

    fireEvent.click(screen.getByText("Save current"));
    const field = screen.getByLabelText("Name for the saved layout");
    fireEvent.change(field, { target: { value: "Enter grip" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSaveCurrent).toHaveBeenCalledWith("Enter grip");

    rerender(<LayoutPresetPicker {...base} onSaveCurrent={onSaveCurrent} />);
    fireEvent.click(screen.getByText("Save current"));
    fireEvent.keyDown(screen.getByLabelText("Name for the saved layout"), {
      key: "Escape",
    });
    expect(screen.getByText("Save current")).toBeTruthy();
  });

  it("⭐ refuses a blank name — an unnamed card is unidentifiable", () => {
    const onSaveCurrent = vi.fn();
    openGrid(<LayoutPresetPicker {...base} onSaveCurrent={onSaveCurrent} />);

    fireEvent.click(screen.getByText("Save current"));
    const field = screen.getByLabelText("Name for the saved layout");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(onSaveCurrent).not.toHaveBeenCalled();
    // Enter on a blank field means "never mind" — the form closes.
    expect(screen.getByText("Save current")).toBeTruthy();
  });

  it("previews the CURRENT arrangement on the save card", () => {
    // The card shows the shape being captured, which is what makes the
    // action legible without explanation.
    const { container } = openGrid(
      <LayoutPresetPicker
        {...base}
        presets={[]}
        current={{
          ...DEFAULT_RAIL_LAYOUT,
          bottom: { edge: "top", scale: "regular" },
        }}
      />,
    );
    // Timeline above the main row — one thumbnail, and it is the save card's.
    const thumb = container.querySelector(".layout-thumb")!;
    const kids = [...thumb.children].map((el) => el.className);
    expect(kids[1]).toContain("layout-thumb__bottom");
  });
});
