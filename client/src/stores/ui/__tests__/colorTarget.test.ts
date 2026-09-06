/**
 * The ONE target-aware colour entry point, and the edge/fill swap (plan 09,
 * task 05).
 *
 * ## What this pins and why it is worth pinning
 *
 * Before `setActiveColor`, FIVE colour surfaces each decided for themselves
 * which slot "set the colour" meant, and four of the five hardcoded the edge.
 * That is the defect the user reported as "selecting from the palettes only
 * sets the edge colour". `ApplicationStore.setActiveColor` is the single
 * branch point that replaces those five decisions, and these tests are what
 * stop a later refactor from quietly flattening the branch back out.
 *
 * Three properties are load-bearing and each has a test here:
 *
 * 1. **The history asymmetry.** The EDGE path appends to `colorHistory`; the
 *    FILL path does NOT. `colorHistory` is the recent-colours strip and the
 *    owner expects it to track the colour that is DRAWING. This is not an
 *    oversight being preserved — it is the behaviour
 *    `ColorPickerContainer.tsx:116-120` already had, generalised.
 *
 * 2. **The tri-state swap.** `fillColor` is `undefined` on every project that
 *    predates the edge/fill split, while `selectedColor` is a NON-OPTIONAL
 *    `Color`. A naive exchange writes `undefined` into `selectedColor`. The
 *    swap therefore reads the EFFECTIVE fill, and the `undefined` case is a
 *    no-op value-wise while still MATERIALISING `fillColor` — see
 *    `ToolUIStore.swapColors`'s header.
 *
 * 3. **One undo step.** A swap is one user gesture, so it snapshots once.
 *
 * ⚠️ This task adds NO persisted key. `colorTarget` stays unpersisted (that
 * claim is pinned against the wire format itself in `fillColor.test.ts`) and
 * `toPersistedUIState()` is untouched, so the owner's 151 corpus snapshots are
 * byte-identical. Nothing here should ever need a snapshot update.
 *
 * The harness is transcribed from `stores/__tests__/w29dSeams.test.ts` — an
 * `ApplicationStore` with no Zustand and no React attached.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { BLUE, GREEN, RED, tinyProject } from "@/store/__tests__/storeContract";
import type { Project } from "@/types";

/* ── an ApplicationStore with no Zustand and no React attached ───────────── */

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
  // The swap writes history; start from a clean stack so the single-entry
  // assertion is unambiguous.
  runInAction(() => app.history.clear());
  return app;
}

describe("setActiveColor — the single target-aware entry point", () => {
  it("⭐ on the EDGE target writes selectedColor AND appends to colorHistory", () => {
    const app = makeApp();
    const before = app.session.colorHistory.length;

    expect(app.ui.tool.colorTarget).toBe("edge");
    app.setActiveColor(RED);

    expect(app.ui.tool.selectedColor).toEqual(RED);
    // The recent-colours strip tracks the DRAWING colour — see the header.
    expect(app.session.colorHistory.length).toBe(before + 1);
    expect(app.session.colorHistory[0]).toEqual(RED);
  });

  it("⭐ on the FILL target writes fillColor and touches NEITHER colorHistory NOR selectedColor", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    const historyAfterEdge = app.session.colorHistory.length;

    runInAction(() => app.ui.tool.setColorTarget("fill"));
    app.setActiveColor(BLUE);

    expect(app.ui.tool.fillColor).toEqual(BLUE);
    // The asymmetry that this whole test file exists to protect.
    expect(app.session.colorHistory.length).toBe(historyAfterEdge);
    expect(app.session.colorHistory[0]).toEqual(RED);
    // The other slot is untouched.
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("routes to whichever slot the target names, switching mid-session", () => {
    const app = makeApp();

    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setColorTarget("fill"));
    app.setActiveColor(BLUE);
    runInAction(() => app.ui.tool.setColorTarget("edge"));
    app.setActiveColor(GREEN);

    expect(app.ui.tool.selectedColor).toEqual(GREEN);
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });
});

describe("activeColor — the matching read accessor", () => {
  it("returns the edge slot on the edge target", () => {
    const app = makeApp();
    app.setActiveColor(RED);

    expect(app.activeColor).toEqual(RED);
  });

  it("returns the fill slot on the fill target", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setColorTarget("fill"));
    app.setActiveColor(BLUE);

    expect(app.activeColor).toEqual(BLUE);
  });

  it("⭐ falls back to the edge colour on the fill target of a pre-split project", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setColorTarget("fill"));

    // No fill colour has ever been picked, so the field is still absent and
    // the accessor must report the one colour the project has — never
    // `undefined`.
    expect(app.ui.tool.fillColor).toBeUndefined();
    expect(app.activeColor).toEqual(RED);
  });
});

describe("swapColors — exchanging the two slots", () => {
  it("exchanges them when both are set", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setFillColor(BLUE));

    runInAction(() => app.ui.tool.swapColors());

    expect(app.ui.tool.selectedColor).toEqual(BLUE);
    expect(app.ui.tool.fillColor).toEqual(RED);
  });

  it("⭐ with an undefined fill: never writes undefined into selectedColor, and MATERIALISES the fill", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    expect(app.ui.tool.fillColor).toBeUndefined();

    runInAction(() => app.ui.tool.swapColors());

    // The whole trap: `selectedColor` is a non-optional `Color`. A naive
    // exchange would have put `undefined` here.
    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.ui.tool.selectedColor).not.toBeUndefined();
    // Value-wise a no-op — but the fill is now MATERIALISED, which is the
    // point of the operation in this case: the two slots are independently
    // editable from here on instead of the fill tracking the edge.
    expect(app.ui.tool.fillColor).toEqual(RED);
  });

  it("the materialised fill is then independently editable", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.swapColors());

    runInAction(() => app.ui.tool.setColor(GREEN));

    // Before the swap materialised it, `fillColorOrSelected` would have
    // followed the edge to GREEN.
    expect(app.ui.tool.fillColorOrSelected).toEqual(RED);
    expect(app.ui.tool.selectedColor).toEqual(GREEN);
  });

  it("is its own inverse when both slots are set", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setFillColor(BLUE));

    runInAction(() => app.ui.tool.swapColors());
    runInAction(() => app.ui.tool.swapColors());

    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });
});

describe("swapEdgeAndFillColors — the undoable wrapper", () => {
  it("⭐ produces exactly ONE history entry", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setFillColor(BLUE));
    runInAction(() => app.history.clear());

    app.swapEdgeAndFillColors();

    // One gesture, one undo step — not two colour writes.
    expect(app.history.entries).toHaveLength(1);
  });

  it("performs the swap it brackets", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setFillColor(BLUE));

    app.swapEdgeAndFillColors();

    expect(app.ui.tool.selectedColor).toEqual(BLUE);
    expect(app.ui.tool.fillColor).toEqual(RED);
  });

  it("does NOT add to colorHistory — it reorders colours, it does not pick one", () => {
    const app = makeApp();
    app.setActiveColor(RED);
    runInAction(() => app.ui.tool.setFillColor(BLUE));
    const before = app.session.colorHistory.length;

    app.swapEdgeAndFillColors();

    expect(app.session.colorHistory.length).toBe(before);
  });
});
