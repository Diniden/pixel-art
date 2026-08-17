/**
 * Bridge Phase A tests (task 14).
 *
 * The bridge is the ONLY writer of the mirrored MobX fields during Phase A,
 * and its two field lists are the migration's progress ledger (R6). These
 * tests pin: the disjointness assertion, the initial adoption, live
 * mirroring, by-reference mirroring of the clipboards, R14 cross-project
 * clipboard survival THROUGH the real Zustand switch action, and disposal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api", async () =>
  (await import("@/store/__tests__/mockApi")).apiMockFactory(),
);

import * as api from "@/services/api";
import { cancelPendingSave } from "@/services/autoSave";
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

describe("the R6 ledger", () => {
  it("PHASE_A holds exactly the five session tenants in task 14", () => {
    expect([...PHASE_A_FIELDS]).toEqual([
      "saveStatus",
      "aiServiceUrl",
      "layerClipboard",
      "timelineCellClipboard",
      "colorHistory",
    ]);
  });

  it("PHASE_B is empty until the first slice flips (task 16)", () => {
    expect([...PHASE_B_FIELDS]).toEqual([]);
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

describe("Phase A mirroring", () => {
  let harness: StoreHarness;
  let app: ApplicationStore;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    cancelPendingSave();
    harness = createZustandHarness();
    harness.reset();
    harness.load(tinyProject());
    app = new ApplicationStore({ autoSaveEnabled: false });
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    cancelPendingSave();
    harness.reset();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("adopts the CURRENT Zustand state at install time (subscribe alone would miss it)", () => {
    useEditorStore.setState({ saveStatus: "saved" });
    dispose = installBridge(app);
    expect(app.session.saveStatus).toBe("saved");
  });

  it("mirrors saveStatus changes live", () => {
    dispose = installBridge(app);
    expect(app.session.saveStatus).toBe("idle");
    useEditorStore.setState({ saveStatus: "saving" });
    expect(app.session.saveStatus).toBe("saving");
    useEditorStore.setState({ saveStatus: "idle" });
    expect(app.session.saveStatus).toBe("idle");
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

  it("R14: the mirrored clipboard SURVIVES a real project switch", async () => {
    dispose = installBridge(app);
    harness.dispatch("copyLayerToClipboard", "layer-1");
    const copied = app.session.layerClipboard;
    expect(copied).not.toBeNull();

    vi.mocked(api.switchProject).mockResolvedValue(undefined);
    vi.mocked(api.loadProject).mockResolvedValue(tinyProject());
    await harness.dispatch("switchToProject", "project-B");

    // The switch replaced the project (and cleared history) but the session
    // clipboard is untouched — the cross-project lifetime is load-bearing.
    expect(app.session.layerClipboard).toBe(copied);
  });

  it("the disposer stops the mirror", () => {
    dispose = installBridge(app);
    dispose();
    dispose = null;
    useEditorStore.setState({ saveStatus: "error" });
    expect(app.session.saveStatus).toBe("idle");
  });
});
