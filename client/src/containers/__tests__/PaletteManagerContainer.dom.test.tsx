/**
 * Palette selection honours the colour target (plan 09, task 06).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PINS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The user's report was "selecting from the palettes only sets the edge
 * colour". The cause was one line: `onSelectColor={(color) =>
 * ui.tool.setColor(color)}`, and `ui.tool.setColor` writes `selectedColor` —
 * the EDGE slot — unconditionally, whatever `colorTarget` says.
 *
 * That one callback is handed to BOTH consumer paths by `PaletteManager`: the
 * real palette swatches and the pinned Current Palette row. So the single
 * fix covers both surfaces, and the single regression would break both.
 *
 * ⚠️ `colorTarget` is UNPERSISTED and nothing in the wire format changed for
 * this task. If a snapshot ever moves because of this file, something is
 * wrong — do not update it.
 *
 * ── Why the WIRING is the subject, not the rendered swatches ──────────────
 *
 * The defect lives entirely in what `PaletteManagerContainer` passes down.
 * `PaletteManager` and `CurrentPalette` are unchanged by this task and stay
 * ignorant of `colorTarget` — that is the `ui/` boundary, and asserting on
 * their DOM would test their markup rather than the container's decision.
 * Worse, `CurrentPalette` defers a swatch click 250 ms behind a double-tap
 * timer, so a DOM-driven test of the pinned row would be measuring that timer.
 *
 * So `PaletteManager` is stubbed with a prop recorder, and the two props the
 * task changed are exercised directly:
 *
 *   - `onSelectColor` — invoked exactly as both real surfaces invoke it;
 *   - `selectedColor`  — the value `handleAddCurrentColor` writes into a
 *                        palette ("add current colour to palette").
 *
 * ── The negative controls ─────────────────────────────────────────────────
 *
 * Two assertions here would still pass against the BROKEN code, and are kept
 * only as controls: the edge-target slot write, and the edge-target "add
 * current colour" value. The four that actually discriminate are the
 * fill-target cases and the `colorHistory` assertions — the old path bypassed
 * `setColorAndAddToHistory` entirely, so palette picks never reached the
 * recent-colours strip on EITHER target.
 *
 * ⚠️ THE `selectedColor` ASSERTIONS MUST DRIVE THE STORE INSIDE `act()`. The
 * recorder captures the prop at RENDER time, and a MobX write made outside
 * `act()` does not flush the `observer`'s re-render before the next line runs
 * — so the recorded value is still the container's FIRST render. Measured:
 * all three of those cases failed reporting the initial black default,
 * whatever the store actually held. They would have failed identically
 * against correct and broken code, which is the one thing a test must not do.
 * The `onSelectColor` cases above assert on the STORE, not on a prop, so they
 * are unaffected.
 *
 * The harness is transcribed from `stores/ui/__tests__/colorTarget.test.ts`:
 * an `ApplicationStore` with no Zustand attached.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { runInAction } from "mobx";

import type { Color } from "@/types";
import type { Project } from "@/types";

/* The subject is the container's wiring — see the header. */
const recorded: {
  selectedColor?: Color;
  onSelectColor?: (color: Color) => void;
} = {};

vi.mock("@/ui/components/PaletteManager/PaletteManager", () => ({
  PaletteManager: (props: {
    selectedColor: Color;
    onSelectColor: (color: Color) => void;
  }) => {
    recorded.selectedColor = props.selectedColor;
    recorded.onSelectColor = props.onSelectColor;
    return <div data-testid="palette-manager" />;
  },
}));

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { PaletteManagerContainer } from "@/containers/PaletteManagerContainer";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { BLUE, GREEN, RED, tinyProject } from "@/store/__tests__/storeContract";

function makeApp(): ApplicationStore {
  const project: Project = tinyProject();
  let current: Project | null = project;
  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
    },
    snapshot: () => {},
  };
  const selectionSink: SelectionSink = {
    selectObjectTree: (ids) => {
      if (!current) return;
      current = { ...current, uiState: { ...current.uiState, ...ids } };
    },
  };
  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink,
  });
  runInAction(() => app.domain.adoptTree(project));
  return app;
}

/** Mount the container and hand back the store it is wired to. */
function mount(): ApplicationStore {
  const app = makeApp();
  render(
    <StoreProvider store={app}>
      <PaletteManagerContainer />
    </StoreProvider>,
  );
  // The container returns null without a project; if this fires, the fixture
  // is wrong and every assertion below would be vacuous.
  expect(recorded.onSelectColor).toBeTypeOf("function");
  return app;
}

describe("PaletteManagerContainer — swatch clicks honour colorTarget", () => {
  it("on the EDGE target writes selectedColor and appends to colorHistory", () => {
    const app = mount();
    const before = app.session.colorHistory.length;

    expect(app.ui.tool.colorTarget).toBe("edge");
    recorded.onSelectColor!(RED);

    expect(app.ui.tool.selectedColor).toEqual(RED);
    // NEW with task 06: the old `ui.tool.setColor` path bypassed
    // `setColorAndAddToHistory`, so a palette pick never reached the strip.
    expect(app.session.colorHistory.length).toBe(before + 1);
    expect(app.session.colorHistory[0]).toEqual(RED);
  });

  it("⭐ on the FILL target writes fillColor and leaves selectedColor and colorHistory alone", () => {
    const app = mount();

    // Establish a distinct edge colour first, so "untouched" is provable
    // rather than coincidentally equal to the default.
    recorded.onSelectColor!(RED);
    const historyAfterEdge = app.session.colorHistory.length;

    runInAction(() => app.ui.tool.setColorTarget("fill"));
    recorded.onSelectColor!(BLUE);

    expect(app.ui.tool.fillColor).toEqual(BLUE);
    // The whole defect: this used to be BLUE.
    expect(app.ui.tool.selectedColor).toEqual(RED);
    // The deliberate asymmetry — the fill slot is not a drawing colour.
    expect(app.session.colorHistory.length).toBe(historyAfterEdge);
    expect(app.session.colorHistory[0]).toEqual(RED);
  });

  it("follows the target when it changes mid-session", () => {
    const app = mount();

    recorded.onSelectColor!(RED);
    runInAction(() => app.ui.tool.setColorTarget("fill"));
    recorded.onSelectColor!(BLUE);
    runInAction(() => app.ui.tool.setColorTarget("edge"));
    recorded.onSelectColor!(GREEN);

    expect(app.ui.tool.selectedColor).toEqual(GREEN);
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });

  it("does NOT re-derive the branch — it delegates to ApplicationStore.setActiveColor", () => {
    const app = makeApp();
    const setActiveColor = vi.spyOn(app, "setActiveColor");
    render(
      <StoreProvider store={app}>
        <PaletteManagerContainer />
      </StoreProvider>,
    );

    recorded.onSelectColor!(RED);

    // One branch point in the app, not five. If a future edit re-inlines the
    // `colorTarget === "fill" ? … : …` ternary here, the slot assertions above
    // would still pass and this is the only thing that would catch it.
    expect(setActiveColor).toHaveBeenCalledWith(RED);
  });
});

describe("PaletteManagerContainer — 'add current colour to palette'", () => {
  /**
   * `PaletteManager.handleAddCurrentColor` writes the `selectedColor` PROP
   * into the palette. The prop is now `app.activeColor`, so it follows the
   * target.
   *
   * ⚠️ THE TWO SLOTS ARE SEEDED THROUGH THE STORE, NOT THROUGH
   * `onSelectColor`. Driving them with the callback makes this group
   * WORTHLESS as a regression test, and that is measured, not theorised: with
   * the container reverted to the broken `ui.tool.setColor` +
   * `ui.tool.selectedColor` pair, a fill-target `onSelectColor(BLUE)` writes
   * BLUE into the EDGE slot — so the stale `selectedColor` prop reads BLUE and
   * the assertion passes for entirely the wrong reason. The two defects mask
   * each other exactly. Seeding the slots directly, to DIFFERENT colours,
   * isolates the one prop under test; the reverted container then reports RED
   * where BLUE is expected, which is the failure this group exists to produce.
   */
  it("offers the EDGE colour while the edge target is active", () => {
    const app = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setFillColor(BLUE);
      }),
    );

    expect(app.ui.tool.colorTarget).toBe("edge");
    expect(recorded.selectedColor).toEqual(RED);
    expect(recorded.selectedColor).toEqual(app.activeColor);
  });

  it("⭐ offers the FILL colour once the fill target is active", () => {
    const app = mount();
    act(() =>
      runInAction(() => {
        app.ui.tool.setColor(RED);
        app.ui.tool.setFillColor(BLUE);
      }),
    );

    act(() => runInAction(() => app.ui.tool.setColorTarget("fill")));

    // This used to be RED — the edge colour — on the Fill tab.
    expect(recorded.selectedColor).toEqual(BLUE);
    expect(recorded.selectedColor).toEqual(app.activeColor);
  });

  it("falls back to the edge colour when fillColor has never been set", () => {
    const app = mount();
    act(() => runInAction(() => app.ui.tool.setColor(RED)));

    // A project predating the edge/fill split: `fillColor` is `undefined`.
    expect(app.ui.tool.fillColor).toBeUndefined();
    act(() => runInAction(() => app.ui.tool.setColorTarget("fill")));

    // `activeColor` reads through `fillColorOrSelected`, so the row shows a
    // real colour rather than blanking out.
    expect(recorded.selectedColor).toEqual(RED);
  });
});
