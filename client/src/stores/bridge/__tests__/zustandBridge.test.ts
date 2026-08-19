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
  it("PHASE_A holds the still-Zustand-owned session tenants + the selection ids", () => {
    // `saveStatus` moved OUT in task 16 — `AutoSaveController` writes it on
    // SessionStore now, and the bridge mirrors it back to Zustand (Phase B).
    //
    // Task 23 ADDED the four `uiState` selection ids. They are UI fields that
    // Zustand still owns, but the 6 cross-store computeds cannot recompute
    // unless their inputs are observable, so MobX keeps a read-only copy —
    // on `TimelineUIStore` since task 25 (it replaced `SelectionMirror`).
    //
    // ⚠️ TASK 25 did NOT flip the four ids, deliberately. `TimelineUIStore`
    // now owns `selectFrame`/`selectLayer`, but `store/objectActions.ts:58`
    // (`selectObject`) still writes all three ids and `store/variantActions.ts`
    // writes `variantFrameIndices` at 8 sites — both files belong to later
    // tasks. Flipping would give each field two writers, which R6 forbids.
    //
    // Task 25 DID flip both clipboards out of this list: `LayerStore` is now
    // their only writer, and their two readers (`LayerPanel`, `TimelineView`)
    // are migrated by the same task per §9.8.
    expect([...PHASE_A_FIELDS]).toEqual([
      "aiServiceUrl",
      "colorHistory",
      "selectedObjectId",
      "selectedFrameId",
      "selectedLayerId",
      "variantFrameIndices",
    ]);
  });

  it("PHASE_B holds the lifecycle slice, the history mirror, and the domain TREE (task 23)", () => {
    // `projectHistory`/`historyIndex` flipped in task 17: `HistoryStore` owns
    // undo history; the Zustand fields are mirrors written by the history glue
    // in store/index.ts (synchronously, bridge-independent — see the bridge
    // module header, item 5).
    //
    // Task 23 is THE PIVOT: the five domain-tree members flipped A→B, so MobX
    // is now the source of truth for the project tree and Zustand's `project`
    // is a read-only mirror.
    expect([...PHASE_B_FIELDS]).toEqual([
      "loadState",
      "projectName",
      "projectList",
      "saveStatus",
      "projectHistory",
      "historyIndex",
      "version",
      "objects",
      "palettes",
      "variants",
      "referenceImage",
      // ── Task 25 ────────────────────────────────────────────────────────
      // Both clipboards: `LayerStore` is their single writer, and they stay
      // on `SessionStore` (tab-scoped, no reset hook) so R14's cross-project
      // survival is unchanged — pinned by the two CROSS-PROJECT tests in
      // `src/store/__tests__/layers.test.ts`.
      "layerClipboard",
      "timelineCellClipboard",
      // The three timeline/layer `uiState` fields with a single writer: every
      // writer now routes into `TimelineUIStore` (`selectLayer` directly, the
      // two view-mode setters as bridge delegates).
      //
      // ── Task 26 ────────────────────────────────────────────────────────
      // The pixel SELECTION. `SelectionUIStore` is the only writer of the
      // mask (the 9 legacy `selectionActions` are throwing stubs behind
      // bridge delegates), so Zustand cannot be its source of truth. It is a
      // TOP-LEVEL `EditorState` field and is NOT persisted, so the flip has
      // no wire-format consequence — `selectionMode`/`selectionBehavior`,
      // which ARE persisted, stay on `ToolUIStore` from task 24.
      "selection",
      "layerSelectionCounter",
      "objectLibraryViewMode",
      "timelineThumbnailMode",
      // ── Task 27: the 9 lighting settings ────────────────────────────────
      //
      // `LightingUIStore` is now their only writer — the eight legacy
      // `lightingActions` setters and `toolActions.setNormalBrushShape` are
      // bridge-installed delegates — and their five consumers are migrated by
      // the same task, per §9.8. This flip is the STRUCTURAL half of live bug
      // #2: eight of the nine never scheduled a save at all before W8 patched
      // them by hand, and on a store whose fields feed `toPersistedUIState()`
      // the save is scheduled by construction.
      "studioMode",
      "lightingDataLayerEditMode",
      "selectedNormal",
      "lightDirection",
      "lightColor",
      "ambientColor",
      "heightScale",
      "heightBrushValue",
      "normalBrushShape",
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
    harness = createZustandHarness({ bridge: false });
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
