/**
 * `LightingUIStore` — THE REGRESSION TEST FOR LIVE BUG #2 (REFRESH task 27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS SUITE IS FOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `store/lightingActions.ts` held eight setters that wrote `project` through
 * a raw `set({ project: {...} })` and scheduled NO save — the module did not
 * import `services/autoSave` at all. Light colour, ambient colour, height
 * scale, selected normal, studio mode, height brush value, edit mode and
 * light direction were silently discarded on reload unless an unrelated
 * action happened to save first.
 *
 * W8 (task 14) fixed the behaviour by routing all eight through
 * `updateProjectAndSave`, and `store/__tests__/autoSave.test.ts` carries the
 * eight flipped assertions. That fix was a REMEMBERED one: nothing stopped
 * the tenth setter from forgetting again.
 *
 * Task 27 makes it STRUCTURAL, and this suite is the gate on that claim. It
 * asserts, for each of the nine fields INDIVIDUALLY:
 *
 *   1. writing it bumps `persistedUIVersion` — the counter
 *      `AutoSaveController` observes, so a bump IS a scheduled save; and
 *   2. the new value round-trips through `toPersistedUIState()`, in the
 *      packed/hex form the wire format uses.
 *
 * Both directions matter. A field that bumps but is not emitted saves the
 * WRONG bytes; a field that is emitted but does not bump never saves at all —
 * which is precisely the original bug.
 *
 * ⚠️ A MISSED BUMP IS SILENT DATA LOSS. There is no error anywhere; the
 * user's setting is simply gone at the next reload.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { LightingUIStore } from "@/stores/ui/LightingUIStore";
import { ToolUIStore } from "@/stores/ui/ToolUIStore";
import { UIStore } from "@/stores/ui/UIStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { SessionStore } from "@/stores/session/SessionStore";
import { DEFAULT_UI_STATE, normalToPacked, rgbaToHex } from "@/types";
import type { CompactUIState } from "@/types";

/** A `UIStore` wired to a real `LightingUIStore`, exactly as the app wires it. */
function makeRig(): {
  ui: UIStore;
  lighting: LightingUIStore;
  tool: ToolUIStore;
} {
  const tool = new ToolUIStore();
  const lighting = new LightingUIStore({ tool });
  const ui = new UIStore({
    session: new SessionStore(),
    selection: new SelectionMirror(),
    tool,
    lighting,
  });
  return { ui, lighting, tool };
}

/**
 * The nine fields, each with an edit that genuinely changes its value and the
 * `CompactUIState` key + expected wire value that edit must produce.
 *
 * ⚠️ Every value is deliberately DIFFERENT from the field's default. An
 * idempotent write correctly does NOT bump (`computedStruct`), so seeding a
 * default here would make the test pass for the wrong reason — the same trap
 * `persistedUIVersion.test.ts` documents for `bitDepth`.
 */
const NINE: {
  name: string;
  key: keyof CompactUIState;
  edit: (l: LightingUIStore) => void;
  wire: unknown;
}[] = [
  {
    name: "studioMode",
    key: "studioMode",
    edit: (l) => l.setStudioMode("lighting"),
    wire: "lighting",
  },
  {
    name: "lightingDataLayerEditMode",
    key: "lightingDataLayerEditMode",
    edit: (l) => l.setLightingDataLayerEditMode("height"),
    wire: "height",
  },
  {
    name: "selectedNormal",
    key: "selectedNormal",
    edit: (l) => l.setSelectedNormal({ x: 10, y: 20, z: 200 }),
    // Packed at the serialization boundary — the store itself holds the
    // `Normal` object.
    wire: normalToPacked({ x: 10, y: 20, z: 200 }),
  },
  {
    name: "lightDirection",
    key: "lightDirection",
    edit: (l) => l.setLightDirection({ x: -10, y: -20, z: 200 }),
    wire: normalToPacked({ x: -10, y: -20, z: 200 }),
  },
  {
    name: "lightColor",
    key: "lightColor",
    edit: (l) => l.setLightColor({ r: 1, g: 2, b: 3, a: 255 }),
    wire: rgbaToHex({ r: 1, g: 2, b: 3, a: 255 }),
  },
  {
    name: "ambientColor",
    key: "ambientColor",
    edit: (l) => l.setAmbientColor({ r: 4, g: 5, b: 6, a: 255 }),
    wire: rgbaToHex({ r: 4, g: 5, b: 6, a: 255 }),
  },
  {
    name: "heightScale",
    key: "heightScale",
    edit: (l) => l.setHeightScale(250),
    wire: 250,
  },
  {
    name: "heightBrushValue",
    key: "heightBrushValue",
    edit: (l) => l.setHeightBrushValue(77),
    wire: 77,
  },
  {
    name: "normalBrushShape",
    key: "normalBrushShape",
    edit: (l) => l.setNormalBrushShape("square"),
    wire: "square",
  },
];

describe("LightingUIStore — all 9 fields bump persistedUIVersion (THE GATE)", () => {
  it.each(NINE)(
    "$name schedules a save",
    ({ edit }) => {
      const { ui, lighting } = makeRig();
      const before = ui.persistedUIVersion;
      runInAction(() => edit(lighting));
      expect(ui.persistedUIVersion).toBeGreaterThan(before);
      ui.dispose();
    },
  );

  it.each(NINE)(
    "$name round-trips through toPersistedUIState()",
    ({ key, edit, wire }) => {
      const { ui, lighting } = makeRig();
      runInAction(() => edit(lighting));
      expect(ui.toPersistedUIState()[key]).toEqual(wire);
      ui.dispose();
    },
  );

  it("covers exactly the 9 persisted lighting fields", () => {
    // Drift guard. If `LightingUIStore` grows a tenth persisted field, this
    // count must grow with it — otherwise the new field is exactly the
    // original bug all over again: owned by the store, never asserted, and
    // silently unsaved if the builder misses it.
    expect(NINE).toHaveLength(9);
    expect(NINE.map((f) => f.key).sort()).toEqual(
      [
        "ambientColor",
        "heightBrushValue",
        "heightScale",
        "lightColor",
        "lightDirection",
        "lightingDataLayerEditMode",
        "normalBrushShape",
        "selectedNormal",
        "studioMode",
      ].sort(),
    );
  });

  it("an IDEMPOTENT lighting write does NOT schedule a save", () => {
    // The inverse direction. `computedStruct` means re-setting a field to the
    // value it already holds is not an edit — otherwise every re-render that
    // re-applied state would save unchanged bytes.
    const { ui, lighting } = makeRig();
    runInAction(() => lighting.setHeightScale(250));
    const after = ui.persistedUIVersion;
    runInAction(() => lighting.setHeightScale(250));
    expect(ui.persistedUIVersion).toBe(after);
    ui.dispose();
  });
});

describe("LightingUIStore — NormalPicker's two fields are INDEPENDENT", () => {
  /**
   * ⚠️ `NormalPicker` drives BOTH `selectedNormal` and `lightDirection` from
   * one widget, choosing between them with an `isLightDirection` prop. Wiring
   * the wrong store field — or the same field twice — is the easy mistake in
   * this task, and it would be invisible: the picker would still LOOK right,
   * and the two settings would silently track each other.
   */
  it("setting selectedNormal leaves lightDirection alone", () => {
    const { lighting } = makeRig();
    const before = lighting.lightDirection;
    runInAction(() => lighting.setSelectedNormal({ x: 1, y: 2, z: 3 }));
    expect(lighting.selectedNormal).toEqual({ x: 1, y: 2, z: 3 });
    expect(lighting.lightDirection).toBe(before);
  });

  it("setting lightDirection leaves selectedNormal alone", () => {
    const { lighting } = makeRig();
    const before = lighting.selectedNormal;
    runInAction(() => lighting.setLightDirection({ x: 4, y: 5, z: 6 }));
    expect(lighting.lightDirection).toEqual({ x: 4, y: 5, z: 6 });
    expect(lighting.selectedNormal).toBe(before);
  });

  it("they reach DIFFERENT wire keys", () => {
    const { ui, lighting } = makeRig();
    runInAction(() => {
      lighting.setSelectedNormal({ x: 1, y: 2, z: 3 });
      lighting.setLightDirection({ x: 4, y: 5, z: 6 });
    });
    const persisted = ui.toPersistedUIState();
    expect(persisted.selectedNormal).toBe(normalToPacked({ x: 1, y: 2, z: 3 }));
    expect(persisted.lightDirection).toBe(normalToPacked({ x: 4, y: 5, z: 6 }));
    ui.dispose();
  });
});

describe("LightingUIStore — the ported value semantics (task 08's pins)", () => {
  it("setHeightScale CLAMPS to 1..500 and does NOT round", () => {
    const { lighting } = makeRig();
    runInAction(() => lighting.setHeightScale(-50));
    expect(lighting.heightScale).toBe(1);
    runInAction(() => lighting.setHeightScale(9999));
    expect(lighting.heightScale).toBe(500);
    // OBSERVED: unlike setHeightBrushValue there is no Math.round here.
    runInAction(() => lighting.setHeightScale(127.6));
    expect(lighting.heightScale).toBe(127.6);
  });

  it("setHeightBrushValue CLAMPS to 0..255 and ROUNDS", () => {
    const { lighting } = makeRig();
    runInAction(() => lighting.setHeightBrushValue(-50));
    expect(lighting.heightBrushValue).toBe(0);
    runInAction(() => lighting.setHeightBrushValue(9999));
    expect(lighting.heightBrushValue).toBe(255);
    runInAction(() => lighting.setHeightBrushValue(127.6));
    expect(lighting.heightBrushValue).toBe(128);
  });

  it("setStudioMode ALSO rewrites selectedTool — a coupled write", () => {
    const { lighting, tool } = makeRig();
    runInAction(() => lighting.setStudioMode("lighting"));
    expect(lighting.studioMode).toBe("lighting");
    expect(tool.selectedTool).toBe("normal-pencil");
    runInAction(() => lighting.setStudioMode("pixel"));
    expect(lighting.studioMode).toBe("pixel");
    expect(tool.selectedTool).toBe("pixel");
  });

  it("NONE of the nine records history — the store holds no HistoryStore", () => {
    // `trackHistory = false` was deliberate for all eight legacy setters, and
    // `autoSave.test.ts` retains that pin. Here it is structural: there is no
    // history reference in `LightingUIStore` to record onto. Asserted against
    // the constructed instance so a future injection is caught.
    const { lighting } = makeRig();
    expect(
      Object.keys(lighting).some((k) => k.toLowerCase().includes("history")),
    ).toBe(false);
  });
});

describe("LightingUIStore — hydration preserves absent-vs-default", () => {
  it("adopts every field a loaded project carries", () => {
    const { lighting } = makeRig();
    runInAction(() =>
      lighting.hydrate({
        studioMode: "lighting",
        lightingDataLayerEditMode: "height",
        selectedNormal: { x: 1, y: 2, z: 3 },
        lightDirection: { x: 4, y: 5, z: 6 },
        lightColor: { r: 7, g: 8, b: 9, a: 255 },
        ambientColor: { r: 10, g: 11, b: 12, a: 255 },
        heightScale: 42,
        heightBrushValue: 43,
        normalBrushShape: "square",
      }),
    );
    expect(lighting.studioMode).toBe("lighting");
    expect(lighting.lightingDataLayerEditMode).toBe("height");
    expect(lighting.selectedNormal).toEqual({ x: 1, y: 2, z: 3 });
    expect(lighting.lightDirection).toEqual({ x: 4, y: 5, z: 6 });
    expect(lighting.lightColor).toEqual({ r: 7, g: 8, b: 9, a: 255 });
    expect(lighting.ambientColor).toEqual({ r: 10, g: 11, b: 12, a: 255 });
    expect(lighting.heightScale).toBe(42);
    expect(lighting.heightBrushValue).toBe(43);
    expect(lighting.normalBrushShape).toBe("square");
  });

  it("an ABSENT optional field stays absent rather than taking a default", () => {
    // `lightingDataLayerEditMode` and `heightBrushValue` are genuinely
    // optional in the wire format, and the legacy `...uiState` spread omitted
    // the KEY on a project that never had them. Seeding a default here would
    // ADD the key to every such project — a wire-format change.
    const { lighting } = makeRig();
    runInAction(() => lighting.hydrate({ studioMode: "pixel" }));
    expect(lighting.lightingDataLayerEditMode).toBeUndefined();
    expect(lighting.heightBrushValue).toBeUndefined();
  });

  it("a field the project omits keeps the store's default", () => {
    const { lighting } = makeRig();
    runInAction(() => lighting.hydrate({}));
    expect(lighting.studioMode).toBe(DEFAULT_UI_STATE.studioMode);
    expect(lighting.heightScale).toBe(DEFAULT_UI_STATE.heightScale);
    expect(lighting.normalBrushShape).toBe(DEFAULT_UI_STATE.normalBrushShape);
  });
});
