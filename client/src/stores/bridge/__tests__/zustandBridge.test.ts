/**
 * Bridge tests (tasks 14 + 16).
 *
 * The bridge is the ONLY writer of the mirrored fields — MobX-side during
 * Phase A, Zustand-side during Phase B — and its two field lists are the
 * migration's progress ledger (R6). These tests pin: the disjointness
 * assertion, both lists AS FLIPPED BY TASK 16, live mirroring in BOTH
 * directions, by-reference mirroring of the clipboards, R14 cross-project
 * clipboard survival THROUGH the real switch flow, the `domainVersion` bump
 * (with its gates), the lifecycle delegates, and disposal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInAction } from "mobx";

import { projectApi } from "@/api";
import { useEditorStore } from "@/store";
import {
  createZustandHarness,
  tinyProject,
  type StoreHarness,
} from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import {
  PHASE_A_FIELDS,
  PHASE_B_FIELDS,
  assertDisjointPhases,
  installBridge,
} from "@/stores/bridge/zustandBridge";
import { projectToCompact } from "@/types";

describe("the R6 ledger", () => {
  it("PHASE_A holds the four still-Zustand-owned session tenants", () => {
    // `saveStatus` moved OUT in task 16 — `AutoSaveController` writes it on
    // SessionStore now, and the bridge mirrors it back to Zustand (Phase B).
    expect([...PHASE_A_FIELDS]).toEqual([
      "aiServiceUrl",
      "layerClipboard",
      "timelineCellClipboard",
      "colorHistory",
    ]);
  });

  it("PHASE_B holds the lifecycle slice + saveStatus (task 16) + the history mirror (task 17)", () => {
    // `projectHistory`/`historyIndex` flipped in task 17: `HistoryStore` owns
    // undo history; the Zustand fields are mirrors written by the history glue
    // in store/index.ts (synchronously, bridge-independent — see the bridge
    // module header, item 5).
    expect([...PHASE_B_FIELDS]).toEqual([
      "loadState",
      "projectName",
      "projectList",
      "saveStatus",
      "projectHistory",
      "historyIndex",
    ]);
  });

  it("the shipped lists are disjoint", () => {
    expect(() => assertDisjointPhases()).not.toThrow();
  });

  it("a field in BOTH lists fails the dev assertion (two writers)", () => {
    expect(() =>
      assertDisjointPhases(["saveStatus", "zoom"], ["zoom"]),
    ).toThrow(/BOTH phases.*zoom|zoom.*BOTH/is);
  });
});

describe("bridge mirroring", () => {
  let harness: StoreHarness;
  let app: ApplicationStore;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = createZustandHarness();
    harness.reset();
    harness.load(tinyProject());
    app = new ApplicationStore({ autoSaveEnabled: false });
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    app.dispose();
    harness.reset();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* ── Phase A: Zustand → MobX ─────────────────────────────────────────── */

  it("adopts the CURRENT Zustand state at install time (subscribe alone would miss it)", () => {
    harness.dispatch("setAiServiceUrl", "http://localhost:1234");
    dispose = installBridge(app);
    expect(app.session.aiServiceUrl).toBe("http://localhost:1234");
  });

  it("mirrors aiServiceUrl out of project.uiState — SessionStore is the read source", () => {
    dispose = installBridge(app);
    expect(app.session.aiServiceUrl).toBeNull();
    harness.dispatch("setAiServiceUrl", "http://localhost:9999");
    expect(app.session.aiServiceUrl).toBe("http://localhost:9999");
  });

  it("mirrors the clipboards BY REFERENCE — never cloned", () => {
    dispose = installBridge(app);
    harness.dispatch("copyLayerToClipboard", "layer-1");
    const zustandClipboard = useEditorStore.getState().layerClipboard;
    expect(zustandClipboard).not.toBeNull();
    expect(app.session.layerClipboard).toBe(zustandClipboard);
  });

  it("mirrors colorHistory", () => {
    dispose = installBridge(app);
    harness.dispatch("addToColorHistory", { r: 9, g: 8, b: 7, a: 255 });
    expect(app.session.colorHistory.map((c) => c.r)).toEqual([9]);
  });

  /* ── Phase B: MobX → Zustand (task 16) ───────────────────────────────── */

  it("mirrors saveStatus MobX → Zustand — the direction FLIPPED in task 16", () => {
    dispose = installBridge(app);
    expect(useEditorStore.getState().saveStatus).toBe("idle");
    app.session.setSaveStatus("saving");
    expect(useEditorStore.getState().saveStatus).toBe("saving");
    app.session.setSaveStatus("idle");
    expect(useEditorStore.getState().saveStatus).toBe("idle");
  });

  it("mirrors loadState / loadErrorMessage / isLoading and the name/list", () => {
    dispose = installBridge(app);
    runInAction(() => {
      app.domain.loadState = "loading";
    });
    expect(useEditorStore.getState().loadState).toBe("loading");
    expect(useEditorStore.getState().isLoading).toBe(true);

    runInAction(() => {
      app.domain.loadState = "loaded";
      app.domain.projectName = "Base Unit";
      app.domain.projectList = ["Base Unit", "Test Blend"];
    });
    const s = useEditorStore.getState();
    expect(s.loadState).toBe("loaded");
    expect(s.isLoading).toBe(false);
    expect(s.projectName).toBe("Base Unit");
    expect(s.projectList).toEqual(["Base Unit", "Test Blend"]);
    expect(s.loadErrorMessage).toBeNull();
  });

  /* ── the domainVersion bump and its gates (task 16) ──────────────────── */

  it("bumps domainVersion once per committed project reference while loaded", () => {
    dispose = installBridge(app);
    runInAction(() => {
      app.domain.loadState = "loaded";
    });
    const before = app.domain.domainVersion;
    harness.dispatch("setPixel", 0, 0, { r: 1, g: 2, b: 3, a: 255 });
    expect(app.domain.domainVersion).toBe(before + 1);
    // A non-project commit does not bump.
    harness.dispatch("saveCurrentStateToHistory");
    expect(app.domain.domainVersion).toBe(before + 1);
  });

  it("does NOT bump while the load state is not 'loaded' (hydration guard)", () => {
    dispose = installBridge(app);
    // loadState is "idle" here — an install/hydration write, not an edit.
    harness.load(tinyProject());
    expect(app.domain.domainVersion).toBe(0);
  });

  it("does NOT bump while saveSuspended (lifecycle-flow guard)", () => {
    dispose = installBridge(app);
    runInAction(() => {
      app.domain.loadState = "loaded";
    });
    app.session.setSaveSuspended(true);
    harness.dispatch("setPixel", 0, 0, { r: 1, g: 2, b: 3, a: 255 });
    expect(app.domain.domainVersion).toBe(0);
  });

  /* ── the lifecycle delegates (task 16) ───────────────────────────────── */

  it("without the bridge, the lifecycle stubs throw LOUDLY", () => {
    expect(() => useEditorStore.getState().initProject()).toThrow(
      /installBridge/,
    );
  });

  it("with the bridge, lifecycle actions delegate into the DomainStore flows", async () => {
    dispose = installBridge(app);
    vi.spyOn(projectApi, "list").mockResolvedValue(["a", "b"]);
    await useEditorStore.getState().refreshProjectList();
    expect(app.domain.projectList).toEqual(["a", "b"]);
    // …and the Phase B mirror pushed it back into Zustand for old consumers.
    expect(useEditorStore.getState().projectList).toEqual(["a", "b"]);
  });

  it("R14: the mirrored clipboard SURVIVES a real project switch", async () => {
    dispose = installBridge(app);
    harness.dispatch("copyLayerToClipboard", "layer-1");
    const copied = app.session.layerClipboard;
    expect(copied).not.toBeNull();

    vi.spyOn(projectApi, "switchTo").mockResolvedValue(undefined);
    vi.spyOn(projectApi, "get").mockResolvedValue(
      projectToCompact(tinyProject()),
    );
    await harness.dispatch("switchToProject", "project-B");

    // The switch replaced the project (and cleared history) but the session
    // clipboard is untouched — the cross-project lifetime is load-bearing.
    expect(app.session.layerClipboard).toBe(copied);
    expect(app.domain.projectName).toBe("project-B");
    expect(app.domain.loadState).toBe("loaded");
  });

  it("the disposer stops both mirrors and restores the throwing stubs", () => {
    dispose = installBridge(app);
    dispose();
    dispose = null;
    // Phase A stopped:
    harness.dispatch("setAiServiceUrl", "http://gone");
    expect(app.session.aiServiceUrl).toBeNull();
    // Phase B stopped:
    app.session.setSaveStatus("error");
    expect(useEditorStore.getState().saveStatus).toBe("idle");
    // Delegates removed:
    expect(() => useEditorStore.getState().initProject()).toThrow(
      /installBridge/,
    );
  });
});
