/**
 * W29e — THE RE-HYDRATION CLOBBER.
 *
 * `syncPhaseA` calls `app.ui.hydrate(s.project.uiState)` on EVERY Zustand
 * change, not just on load. That re-reads ~30 UI fields off the stale
 * `project.uiState` mirror and writes them over whatever MobX currently
 * holds — so a MobX-owned UI edit survives only until the next unrelated
 * Zustand change.
 *
 * These tests set a MobX field, trigger an UNRELATED Zustand change, and
 * assert the field survived. They FAIL against the pre-fix bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store";
import {
  createZustandHarness,
  tinyProject,
  type StoreHarness,
} from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { installBridge } from "@/stores/bridge/zustandBridge";

const RED = { r: 255, g: 0, b: 0, a: 255 };

describe("W29e: a MobX UI edit survives an unrelated Zustand change", () => {
  let harness: StoreHarness;
  let app: ApplicationStore;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = createZustandHarness({ bridge: false });
    harness.reset();
    harness.load(tinyProject());
    app = new ApplicationStore({ autoSaveEnabled: false });
    dispose = installBridge(app);
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

  /** An unrelated Zustand write — touches no UI field this test reads. */
  const unrelatedZustandChange = (): void => {
    useEditorStore.setState({ saveStatus: "saving" });
  };

  it("selectedColor survives (the W29d repro)", () => {
    app.ui.tool.setColor(RED);
    expect(app.ui.tool.selectedColor).toEqual(RED);

    unrelatedZustandChange();

    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("selectedTool survives", () => {
    app.ui.tool.setTool("eraser");
    expect(app.ui.tool.selectedTool).toBe("eraser");

    unrelatedZustandChange();

    expect(app.ui.tool.selectedTool).toBe("eraser");
  });

  it("brushSize survives", () => {
    app.ui.tool.setBrushSize(7);
    expect(app.ui.tool.brushSize).toBe(7);

    unrelatedZustandChange();

    expect(app.ui.tool.brushSize).toBe(7);
  });

  it("zoom survives", () => {
    app.ui.viewport.setZoom(12);
    expect(app.ui.viewport.zoom).toBe(12);

    unrelatedZustandChange();

    expect(app.ui.viewport.zoom).toBe(12);
  });

  /* ── The OTHER half: the seam must still ADOPT a genuine external write ── */

  it("still hydrates on a project LOAD — the seam is a gate, not a mute", () => {
    app.ui.tool.setBrushSize(7);
    expect(app.ui.tool.brushSize).toBe(7);

    // A LOAD installs a whole new `uiState` — a genuine external write, which
    // differs from what MobX holds and must therefore be adopted.
    const loaded = tinyProject();
    loaded.uiState = { ...loaded.uiState, brushSize: 4, zoom: 20 };
    harness.load(loaded);

    expect(app.ui.tool.brushSize).toBe(4);
    expect(app.ui.viewport.zoom).toBe(20);
  });

  /* ── The four actions that blocked CanvasContainer (W29d's list) ─────── */

  it("setTool + revertToPreviousTool survive — the eyedropper round trip", () => {
    app.ui.tool.setTool("pixel");
    app.ui.tool.setTool("eyedropper");
    unrelatedZustandChange();
    expect(app.ui.tool.selectedTool).toBe("eyedropper");

    app.ui.tool.revertToPreviousTool();
    expect(app.ui.tool.selectedTool).toBe("pixel");

    unrelatedZustandChange();
    // Pre-fix this reverted to the stale `uiState` tool.
    expect(app.ui.tool.selectedTool).toBe("pixel");
  });

  it("setBorderRadius survives", () => {
    app.ui.tool.setBorderRadius(5);
    unrelatedZustandChange();
    expect(app.ui.tool.borderRadius).toBe(5);
  });

  it("a pure-MobX setColor survives WITHOUT writing the Zustand source", () => {
    // W29d had to make `setColorAndAddToHistory` write the Zustand SOURCE to
    // work around the clobber. That workaround stays (Zustand is still a real
    // Phase A writer), but the MobX-only write it was compensating for now
    // survives on its own — which is what unblocks a container that sets a
    // UI field through the store rather than through a legacy action.
    app.ui.tool.setColor(RED);
    unrelatedZustandChange();
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  /* ── W29e's SECOND finding: the frame-trace split brain ──────────────── */

  it("the frame-trace fields are UNBRIDGED — a legacy write never reaches MobX", () => {
    // NOT a clobber victim: `frameTraceActive`/`frameTraceFrameIndex`/
    // `frameOverlayOffset`/`referenceOverlayOffset` are TOP-LEVEL
    // `EditorState` fields, not members of `project.uiState`, so `hydrate()`
    // never touched them. W29d's note grouped `setFrameTraceActive` with the
    // three genuine clobber victims; it is a different defect.
    //
    // They are in NEITHER phase list, so the bridge carries them in neither
    // direction. This pins that: a legacy dispatch moves only the Zustand
    // copy, which is why `CanvasContainer` — which READS `referenceUI` — now
    // calls the MobX setter instead.
    harness.dispatch("setFrameTraceActive", true, 2);
    expect(app.referenceUI.frameTraceActive).toBe(false);

    // The MobX owner is what the migrated containers read and write.
    app.referenceUI.setFrameTraceActive(true, 2);
    expect(app.referenceUI.frameTraceActive).toBe(true);
    expect(app.referenceUI.frameTraceFrameIndex).toBe(2);
  });

  it("trace exclusivity survives the fix — the MobX reaction still fires", () => {
    // The exclusivity rule is duplicated: `toolActions.setTool` enforces it on
    // the Zustand copy, and `ReferenceUIStore`'s reaction enforces it on the
    // MobX one. The MobX half fires on `ToolUIStore.selectedTool`, so it must
    // still fire when the tool arrives through the ADOPTION path — i.e. when
    // the echo check decides an incoming `uiState` is a genuine change.
    app.referenceUI.setFrameTraceActive(true, 1);
    expect(app.referenceUI.frameTraceActive).toBe(true);

    // A LEGACY dispatch: Zustand writes `uiState.selectedTool`, the echo check
    // sees it differ, hydrate adopts it, and the reaction clears frame trace.
    harness.dispatch("setTool", "reference-trace");
    expect(app.ui.tool.selectedTool).toBe("reference-trace");
    expect(app.referenceUI.frameTraceActive).toBe(false);
  });

  it("a MobX setTool also triggers exclusivity", () => {
    app.referenceUI.setFrameTraceActive(true, 1);
    app.ui.tool.setTool("reference-trace");
    expect(app.referenceUI.frameTraceActive).toBe(false);

    unrelatedZustandChange();
    expect(app.ui.tool.selectedTool).toBe("reference-trace");
  });

  it("still adopts a LEGACY Zustand UI setter (an unmigrated consumer)", () => {
    // `toolActions.setBrushSize` is a live `updateProjectAndSave`
    // implementation, not a delegate — Zustand is genuinely still a writer of
    // these fields (Phase A), so its writes must reach MobX.
    harness.dispatch("setBrushSize", 6);
    expect(app.ui.tool.brushSize).toBe(6);

    harness.dispatch("setZoom", 15);
    expect(app.ui.viewport.zoom).toBe(15);
  });
});

/**
 * W29f (task 38) — THE SELECTION-IDS OWNERSHIP FLIP.
 *
 * `selectedObjectId`/`selectedFrameId`/`selectedLayerId` moved A→B in the
 * same change that ported `store/objectActions.ts`'s `selectObject` — their
 * last writer outside `TimelineUIStore` — onto the store.
 *
 * These pin the two halves the flip depends on: MobX writes now PUBLISH into
 * Zustand and survive an unrelated change (they used to be re-read off the
 * stale mirror by `syncPhaseA` on every tick), and a genuinely EXTERNAL
 * write — a load, a null project — is still ADOPTED.
 */
describe("W29f: the three selection ids are MobX-owned (Phase B)", () => {
  let harness: StoreHarness;
  let app: ApplicationStore;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = createZustandHarness({ bridge: false });
    harness.reset();
    harness.load(tinyProject());
    app = new ApplicationStore({ autoSaveEnabled: false });
    dispose = installBridge(app);
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

  const unrelatedZustandChange = (): void => {
    useEditorStore.setState({ saveStatus: "saving" });
  };

  it("selectObject is a bridge DELEGATE — the legacy body is a throwing stub", () => {
    // The legacy `objectActions.selectObject` now throws `migrated(...)`; with
    // the bridge installed the delegate reaches `TimelineUIStore` instead.
    const objectId = app.domain.objects[0].id;
    harness.dispatch("selectObject", objectId);
    expect(app.timelineUI.selectedObjectId).toBe(objectId);
  });

  it("a MobX selectObject PUBLISHES into Zustand", () => {
    const objectId = app.domain.objects[0].id;
    app.timelineUI.selectObject(objectId);

    const ui = useEditorStore.getState().project!.uiState;
    expect(ui.selectedObjectId).toBe(objectId);
    expect(ui.selectedFrameId).toBe(app.timelineUI.selectedFrameId);
    expect(ui.selectedLayerId).toBe(app.timelineUI.selectedLayerId);
  });

  it("a MobX selection SURVIVES an unrelated Zustand change", () => {
    // The Phase A failure mode: `syncPhaseA` used to re-read all three off
    // `project.uiState` on EVERY change, reverting a fresh selection.
    const objectId = app.domain.objects[0].id;
    app.timelineUI.selectObject(objectId);

    unrelatedZustandChange();
    expect(app.timelineUI.selectedObjectId).toBe(objectId);
  });

  it("OBSERVED: an unknown id still selects, and nulls the frame/layer ids", () => {
    // Verbatim from `objectActions.ts:58-71` — `objects.find()` misses and the
    // `?? null` fallbacks apply. There is no guard and none may be added.
    app.timelineUI.selectObject("no-such-object");
    expect(app.timelineUI.selectedObjectId).toBe("no-such-object");
    expect(app.timelineUI.selectedFrameId).toBeNull();
    expect(app.timelineUI.selectedLayerId).toBeNull();
  });

  it("an EXTERNAL write is still adopted — the seam is a gate, not a mute", () => {
    const project = useEditorStore.getState().project!;
    const objectId = project.objects[0].id;
    useEditorStore.setState({
      project: {
        ...project,
        uiState: { ...project.uiState, selectedObjectId: objectId },
      },
    });
    expect(app.timelineUI.selectedObjectId).toBe(objectId);
  });

  it("a NULL project CLEARS the ids rather than early-returning", () => {
    // Not symmetry with `adoptVariantFrameIndices` — found by a failing pin.
    // `selection.test.ts`'s 32x32 fallback depends on the ids going null when
    // the project does, because the tree-adoption seam keeps `domain.objects`.
    app.timelineUI.selectObject(app.domain.objects[0].id);
    useEditorStore.setState({ project: null });
    expect(app.timelineUI.selectedObjectId).toBeNull();
    expect(app.timelineUI.selectedFrameId).toBeNull();
    expect(app.timelineUI.selectedLayerId).toBeNull();
  });
});

/**
 * W29f — the six actions `CanvasContainer` stopped routing through Zustand.
 *
 * The container now calls `app.ui.tool.*` / `app.setColorAndAddToHistory` /
 * `app.session.addToColorHistory` / `app.undo()`. These pin that each write
 * lands AND survives, which is the property that made the switch safe.
 */
describe("W29f: CanvasContainer's six actions on their MobX owners", () => {
  let harness: StoreHarness;
  let app: ApplicationStore;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = createZustandHarness({ bridge: false });
    harness.reset();
    harness.load(tinyProject());
    app = new ApplicationStore({ autoSaveEnabled: false });
    dispose = installBridge(app);
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

  const unrelatedZustandChange = (): void => {
    useEditorStore.setState({ saveStatus: "saving" });
  };

  it("the eyedropper round trip: setTool then revertToPreviousTool", () => {
    app.ui.tool.setTool("pixel");
    app.ui.tool.setTool("eyedropper");
    expect(app.ui.tool.selectedTool).toBe("eyedropper");

    unrelatedZustandChange();
    expect(app.ui.tool.selectedTool).toBe("eyedropper");

    app.ui.tool.revertToPreviousTool();
    expect(app.ui.tool.selectedTool).toBe("pixel");

    unrelatedZustandChange();
    expect(app.ui.tool.selectedTool).toBe("pixel");
  });

  it("setBorderRadius survives, and keeps the legacy Math.max(0) clamp", () => {
    app.ui.tool.setBorderRadius(5);
    unrelatedZustandChange();
    expect(app.ui.tool.borderRadius).toBe(5);

    app.ui.tool.setBorderRadius(-3);
    expect(app.ui.tool.borderRadius).toBe(0);
  });

  it("setColorAndAddToHistory writes BOTH stores and survives", () => {
    // `colorHistory` is a genuine PHASE_A field, so this writes the Zustand
    // SOURCE and lets the mirror carry it back — Phase A's direction.
    app.setColorAndAddToHistory(RED);
    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.session.colorHistory[0]).toEqual(RED);

    unrelatedZustandChange();
    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.session.colorHistory[0]).toEqual(RED);
  });
});
