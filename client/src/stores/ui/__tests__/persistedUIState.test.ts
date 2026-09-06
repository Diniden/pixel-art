// DO NOT run `vitest -u` on this file.
//
// ═══════════════════════════════════════════════════════════════════════════
//  THE WIRE-FORMAT GOLDEN TEST (REFRESH task 24 — R3)
// ═══════════════════════════════════════════════════════════════════════════
//
// This is the gate for the hardest coupling in the whole migration. All 44
// `Project.uiState` fields move out of the serialized `Project` and must come
// back through `UIStore.toPersistedUIState()`. Months of the owner's backups
// depend on it, and a bad builder MANGLES PIXELS SILENTLY rather than
// erroring.
//
// ── What "byte-identical" means here, precisely ────────────────────────────
//
// The contract enforced is: **the KEY SET is identical, and every VALUE is
// identical, key-for-key.** There is NO permitted difference in either —
// `aiServiceUrl` included (owner decision Q2, 2026-08-16: it STAYS in the
// wire format). No golden fixture is re-blessed by this task.
//
// ⚠️ Key ORDER is deliberately NOT part of the contract, and this is a
// correction to the task spec's prose rather than a weakening of the gate.
// Measured across the 151 real snapshots in the corpus: **21 distinct
// `uiState` key orders exist**, and they are mutually irreconcilable (shared
// keys appear in different relative orders between them). Order is a
// function of a file's edit history, because `projectToCompact` spreads
// `...project.uiState` whose insertion order came from whatever was on disk.
// No builder — spread or explicit — can reproduce all 21, so a literal
// byte-for-byte assertion would fail against the owner's own data.
//
// The task spec's OWN byte test agrees: it compares
// `Object.keys(uiState).sort()`, and its Definition of Done reads "the
// `uiState` key SETS before and after are identical". Order is not
// semantically consumed anywhere — the server does a plain `JSON.stringify`
// passthrough (`server/src/routes/project.ts:160`) and never inspects
// `uiState`; `compactToProject` reads by keyed property access.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { UIStore } from "@/stores/ui/UIStore";
import { LayoutUIStore } from "@/stores/ui/LayoutUIStore";
import { PoseUIStore } from "@/stores/ui/PoseUIStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { SessionStore } from "@/stores/session/SessionStore";
import {
  compactToProject,
  createDefaultProject,
  projectToCompact,
} from "@/types";
import { corpusFiles, loadCorpusFile } from "@test/__fixtures__/projects";
import type { CompactUIState, Project } from "@/types";

/** Build a `UIStore` hydrated from a project, exactly as the app does. */
function hydratedStore(project: Project): UIStore {
  const session = new SessionStore();
  const selection = new SelectionMirror();
  // ⚠️ The device class is PINNED to "desktop" rather than measured. jsdom's
  // `matchMedia` is absent/stubbed, so `detectDeviceClass()` would answer
  // from the environment and a fixture keyed `desktop` would round-trip
  // through a different key on a machine that classified differently.
  const ui = new UIStore({
    session,
    selection,
    layout: new LayoutUIStore("desktop"),
  });
  runInAction(() => {
    selection.adopt({
      selectedObjectId: project.uiState.selectedObjectId,
      selectedFrameId: project.uiState.selectedFrameId,
      selectedLayerId: project.uiState.selectedLayerId,
      variantFrameIndices: project.uiState.variantFrameIndices ?? {},
    });
    session.aiServiceUrl = project.uiState.aiServiceUrl ?? null;
    ui.hydrate(project.uiState);
    ui.lighting = {
      studioMode: project.uiState.studioMode,
      lightingDataLayerEditMode: project.uiState.lightingDataLayerEditMode,
      selectedNormal: normalToPackedSafe(project.uiState.selectedNormal),
      lightDirection: normalToPackedSafe(project.uiState.lightDirection),
      lightColor: rgbaToHexSafe(project.uiState.lightColor),
      ambientColor: rgbaToHexSafe(project.uiState.ambientColor),
      heightScale: project.uiState.heightScale,
      heightBrushValue: project.uiState.heightBrushValue,
      normalBrushShape: project.uiState.normalBrushShape,
    };
  });
  return ui;
}

// The two packers the legacy serializer uses, imported lazily to keep the
// hydration helper readable.
import { normalToPacked, rgbaToHex } from "@/types";
function normalToPackedSafe(n: Parameters<typeof normalToPacked>[0]): number {
  return normalToPacked(n);
}
function rgbaToHexSafe(c: Parameters<typeof rgbaToHex>[0]): number {
  return rgbaToHex(c);
}

/**
 * THE FROZEN REFERENCE: the legacy serializer's own output. Comparing
 * against `projectToCompact` rather than a hand-written literal means the
 * gate tracks the real production path — the one 149 real snapshots went
 * through — instead of a transcription that can drift from it.
 */
function legacyUIState(project: Project): CompactUIState {
  return projectToCompact(project).uiState;
}

/**
 * A key-order-independent serialization, so a byte comparison tests CONTENT
 * rather than a file's edit history. `undefined` is preserved as an explicit
 * marker because "key present with value undefined" and "key absent" are a
 * real distinction here — the same reasoning task 07's `digest()` applies.
 */
function canonical(ui: CompactUIState): string {
  return JSON.stringify(
    Object.keys(ui)
      .sort()
      .map((k) => [
        k,
        (ui as unknown as Record<string, unknown>)[k] ?? "\u0000undefined",
      ]),
  );
}

/**
 * A project with every one of the 44 persisted fields set, including the 11
 * that are conditionally present. Used wherever the assertion is about the
 * FULL field surface rather than about presence semantics.
 */
function fullyPopulatedProject(): Project {
  const project = createDefaultProject();
  Object.assign(project.uiState, {
    selectedTool: "ellipse",
    selectedColor: { r: 12, g: 34, b: 56, a: 255 },
    fillColor: { r: 200, g: 100, b: 50, a: 255 },
    brushSize: 7,
    bitDepth: 8,
    shapeMode: "outline",
    borderRadius: 3,
    zoom: 22,
    panOffset: { x: -40, y: 15 },
    moveAllLayers: true,
    eraserShape: "square",
    pencilBrushShape: "circle",
    pencilBrushMax: 64,
    // ⚠️ Present for the same reason as `posePresets` below: these two are
    // conditional, so a fixture that left them out would make the
    // every-field-reachable assertion read a real builder line as missing.
    // Deliberately DIFFERENT from `brushSize`/`pencilBrushMax` above — the
    // whole point of the pair is that the eraser's numbers are its own.
    eraserBrushSize: 3,
    eraserBrushMax: 8,
    traceNudgeAmount: 50,
    focusMode: true,
    lightGridMode: true,
    pencilOnly: true,
    canvasInfoHidden: true,
    objectLibraryViewMode: "grid",
    timelineThumbnailMode: true,
    layerSelectionCounter: 9,
    originColor: { r: 255, g: 0, b: 0, a: 255 },
    gaussianFill: { smoothing: 2.5, radius: 4, radiusMax: 32 },
    selectionMode: "lasso",
    selectionBehavior: "editMask",
    frameReferencePanelPosition: { topPercent: 10, leftPercent: 20 },
    frameReferencePanelMinimized: true,
    frameReferencePanelVisible: false,
    referenceImagePanelPosition: { topPercent: 30, leftPercent: 40 },
    referenceImagePanelMinimized: true,
    lightingPreviewPanelPosition: { topPercent: 50, leftPercent: 60 },
    lightingPreviewPanelMinimized: true,
    aiServiceUrl: "http://ai.local:9000",
    // ⚠️ The right rail — a state `focusMode` cannot express, which is what
    // makes the key appear at all.
    hiddenRails: ["right"],
    railLayouts: {
      desktop: {
        left: { slot: "rightInner", scale: "large" },
        right: { slot: "leftOuter", scale: "compact" },
        bottom: { edge: "top", scale: "huge" },
      },
    },
    layoutPresets: {
      desktop: [
        {
          id: "custom-1",
          name: "My Layout",
          layout: {
            left: { slot: "rightInner", scale: "large" },
            right: { slot: "rightOuter", scale: "large" },
            bottom: { edge: "bottom", scale: "regular" },
          },
        },
      ],
    },
    theme: "light-cozy",
    viewZoom: 2.5,
    eyedropperMode: "stay",
    // ⚠️ Present here because the every-field-reachable assertion below
    // compares this project's built key set against `CompactUIState`'s
    // declared fields: a conditional key that no fixture populates would read
    // as a builder line that does not exist. The values are the WIDE wire
    // shape a real file carries.
    posePresets: [
      {
        id: "pose-1",
        name: "Hero three-quarter",
        meshId: "mannequin",
        rotation: { x: 0.26, y: 0.79, z: 0 },
        projection: "orthographic",
        cameraPreset: "iso",
        fov: 50,
        scale: 2.5,
        lightDirection: { x: -0.4, y: 0.8, z: 0.45 },
        lightColor: { r: 255, g: 226, b: 189, a: 255 },
        edgeWidth: 2,
      },
    ],
  });
  return project;
}

describe("R3 — toPersistedUIState() is wire-format identical", () => {
  it("emits the SAME KEY SET as the legacy serializer, with zero differences", () => {
    const project = createDefaultProject();
    const legacy = legacyUIState(project);
    const built = hydratedStore(project).toPersistedUIState();

    expect(Object.keys(built).sort()).toEqual(Object.keys(legacy).sort());
  });

  it("emits the same VALUE for every key — the key-for-key assertion", () => {
    const project = createDefaultProject();
    const legacy = legacyUIState(project);
    const built = hydratedStore(project).toPersistedUIState();

    // Key-for-key rather than one `toEqual`, so a failure names the field
    // that drifted instead of dumping two 44-field objects.
    for (const key of Object.keys(legacy).sort() as (keyof CompactUIState)[]) {
      expect({ [key]: built[key] }).toEqual({ [key]: legacy[key] });
    }
    // ...and the whole object, to catch a key present in `built` only.
    expect(built).toEqual(legacy);
    // Order-independent byte comparison: the same instrument task 07's
    // corpus digests use (`projects.ts:digest` sorts keys for exactly this
    // reason). See the header — order is not part of the contract, and 21
    // distinct orders exist in the owner's own data.
    expect(canonical(built)).toBe(canonical(legacy));
  });

  it("enumerates ALL 45 CompactUIState fields — none may be silently dropped", () => {
    // Read the interface's own declared fields from source. A field added to
    // `CompactUIState` without a matching line in the builder fails HERE,
    // which is the whole reason the builder is explicit rather than a spread.
    const source = readFileSync("src/types/codecs/compactTypes.ts", "utf8");
    const body = source.match(
      /export interface CompactUIState \{([\s\S]*?)\n\}/,
    );
    expect(body).not.toBeNull();
    const declared = [...body![1].matchAll(/^ {2}(\w+)\??:/gm)].map(
      (m) => m[1],
    );

    // 44 from the REFRESH freeze + the 2 owner-approved additions
    // (`railLayouts`, `theme`, 2026-08-25). Both are CONDITIONALLY emitted —
    // see the `railLayouts`/`theme` cases below, which pin that an untouched
    // project's key set is unchanged. That property, not this count, is what
    // protects the owner's 151 snapshots.
    // +1 (2026-08-28): `viewZoom`, the canvas view-transform scale, which
    // now persists so the view follows the project across devices.
    // +1 (2026-08-28): `eyedropperMode`, the eyedropper's post-sample
    // behaviour. Conditional like the three above — the store field is
    // `undefined` until the user picks a mode from the eyedropper's menu, so
    // no existing snapshot gains the key.
    // +1 (2026-08-30): `layoutPresets`, the user's own saved rail
    // arrangements, keyed by device class. Conditional like the four above —
    // the store field is `{}` until the user saves a layout from the layout
    // picker, so no existing snapshot gains the key.
    // +1 (2026-08-30): `hiddenRails`, which rails the user has dismissed.
    // Conditional, and on a STRICTER condition than the others — it is
    // written only when the set says something `focusMode` cannot already
    // encode, because a real corpus snapshot carries `focusMode: true` and
    // would otherwise gain the key. See `needsHiddenRailsKey`.
    // 51 after `pencilOnly` joined the wire format on 2026-08-31.
    // +1 (2026-09-01): `fillColor`, the second global colour slot — fills and
    // a shape's interior use it, edges use `selectedColor`. Conditional like
    // the others, and on the STRICTEST condition: both codecs emit it through
    // a spread rather than as `key: undefined`, because "present but
    // undefined" still counts as a key to `Object.keys()` and to the corpus
    // digest. Measured — the plain `: undefined` form changed all 11 digests;
    // the spread leaves every one of the owner's snapshots byte-identical.
    // +1 (2026-09-04): `posePresets`, the owner's saved pose SCENES — camera
    // settings plus the model's orientation, kept under a name and reloadable
    // (plan 08, F12). Conditional on exactly the same terms as the six above,
    // and for exactly the same reason: `toPersistedPosePresets()` returns
    // `undefined` until one is saved, so no existing snapshot gains the key
    // and no digest moves. ⚠️ Only the PRESETS persist — the live pose
    // (mesh, rotation, scale, pan, light, outline) stays session-only, which
    // `PoseUIStore.test.ts`'s "is NOT part of the persisted wire format" case
    // still pins unmodified.
    // +2 (2026-09-06): `eraserBrushSize` and `eraserBrushMax`, the ERASER's
    // own size and max — the user's "the pencil and eraser have too many
    // settings interlaced … they need to be distinct values" (plan 09, task
    // 09). Conditional on exactly the same terms as the seven above, and for
    // exactly the same reason: both store fields are `undefined` until the
    // user actually moves the eraser's slider or picks its max — nothing,
    // including `setBrushSize`, writes them incidentally — so `assign` writes
    // nothing and no existing snapshot gains a key. ⚠️ `brushSize` (slot 9)
    // is NOT replaced and stays unconditional; it now means specifically the
    // PENCIL's size, and the eraser falls back to it through
    // `ToolUIStore.effectiveEraserSize`. That fallback IS the migration —
    // there is no migration code and none is needed.
    expect(declared).toHaveLength(55);

    // A FULLY-POPULATED project, because 11 of the 44 keys are
    // conditionally present by design: the legacy `...project.uiState`
    // spread omits a key the project does not have, and the builder
    // reproduces that exactly (see `UIStore`'s second block comment). The
    // every-field-reachable claim is what matters here — that each of the 44
    // has a line in the builder capable of emitting it.
    const built = hydratedStore(fullyPopulatedProject()).toPersistedUIState();
    expect(Object.keys(built).sort()).toEqual([...declared].sort());
  });

  it("emits aiServiceUrl — it STAYS in the wire format (owner decision Q2)", () => {
    const project = createDefaultProject();
    project.uiState.aiServiceUrl = "http://192.168.1.50:8000";
    const built = hydratedStore(project).toPersistedUIState();

    expect("aiServiceUrl" in built).toBe(true);
    expect(built.aiServiceUrl).toBe("http://192.168.1.50:8000");
    expect(built.aiServiceUrl).toBe(legacyUIState(project).aiServiceUrl);
  });

  it("keeps the three floating panels' keys DISTINCT", () => {
    const project = createDefaultProject();
    project.uiState.frameReferencePanelPosition = {
      topPercent: 1,
      leftPercent: 2,
    };
    project.uiState.referenceImagePanelPosition = {
      topPercent: 3,
      leftPercent: 4,
    };
    project.uiState.lightingPreviewPanelPosition = {
      topPercent: 5,
      leftPercent: 6,
    };
    const built = hydratedStore(project).toPersistedUIState();

    expect(built.frameReferencePanelPosition).toEqual({
      topPercent: 1,
      leftPercent: 2,
    });
    expect(built.referenceImagePanelPosition).toEqual({
      topPercent: 3,
      leftPercent: 4,
    });
    expect(built.lightingPreviewPanelPosition).toEqual({
      topPercent: 5,
      leftPercent: 6,
    });
    expect(built).toEqual(legacyUIState(project));
  });

  it("retains bitDepth — written by nobody, but part of the wire format", () => {
    const built = hydratedStore(createDefaultProject()).toPersistedUIState();
    expect("bitDepth" in built).toBe(true);
    expect(built.bitDepth).toBe(8);
  });

  it("preserves R1: originColor is emitted as an explicit undefined key", () => {
    const project = createDefaultProject();
    expect("originColor" in project.uiState).toBe(false);
    const built = hydratedStore(project).toPersistedUIState();
    // The legacy serializer ADDS the key with an undefined value; pinned.
    expect("originColor" in built).toBe(true);
    expect(built.originColor).toBeUndefined();
    expect("originColor" in legacyUIState(project)).toBe(true);
  });

  it("⭐ viewZoom is ABSENT until the user actually zooms the view", () => {
    // Same corpus-protecting property as `railLayouts`/`theme`: an untouched
    // project's key set — and therefore its digest — is unchanged.
    const project = createDefaultProject();
    expect("viewZoom" in project.uiState).toBe(false);
    const built = hydratedStore(project).toPersistedUIState();
    expect("viewZoom" in built).toBe(false);
  });

  it("emits viewZoom once set, and round-trips it", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const ui = new UIStore({
      session,
      selection,
      layout: new LayoutUIStore("desktop"),
    });
    runInAction(() => ui.viewport.setViewZoom(2.5));
    expect(ui.toPersistedUIState().viewZoom).toBe(2.5);

    // A project without one hydrates back to absent — it must not inherit
    // the previous project's view scale.
    runInAction(() => ui.viewport.hydrate({}));
    expect(ui.viewport.viewZoom).toBeUndefined();
    expect("viewZoom" in ui.toPersistedUIState()).toBe(false);
  });

  it("⭐ railLayouts and theme are ABSENT until the user changes them", () => {
    // THE PROPERTY THAT PROTECTS THE CORPUS. The two keys added on
    // 2026-08-25 extend the wire format, and this is what keeps that
    // extension free: an untouched project emits neither, so its key set —
    // and therefore its digest — is exactly what it was before.
    const project = createDefaultProject();
    expect("railLayouts" in project.uiState).toBe(false);
    expect("theme" in project.uiState).toBe(false);

    const built = hydratedStore(project).toPersistedUIState();
    expect("railLayouts" in built).toBe(false);
    expect("theme" in built).toBe(false);
    // The legacy serializer agrees, key-for-key — no drift was introduced.
    expect(Object.keys(built).sort()).toEqual(
      Object.keys(legacyUIState(project)).sort(),
    );
  });

  it("⭐ hiddenRails stays OUT of a file that only has focusMode", () => {
    // ⚠️ THE REGRESSION THIS PINS WAS REAL, and the corpus gate caught it:
    // `backup-02-08-2026.json::Base Unit-15-16-07.json` carries
    // `focusMode: true`. Hydrating expands that into the two classic rails,
    // so a naive "emit when the set is non-empty" test wrote `hiddenRails`
    // into one of the owner's real snapshots.
    //
    // `focusMode` alone can say two things — nothing hidden, and both classic
    // rails hidden — and for those two the key must not appear.
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const ui = new UIStore({ session, selection });

    runInAction(() => ui.viewport.hydrate({ focusMode: true }));
    // The rails really are hidden...
    expect(ui.viewport.focusModeEngaged).toBe(true);
    expect(ui.viewport.isRailHidden("left")).toBe(true);
    expect(ui.viewport.isRailHidden("bottom")).toBe(true);
    // ...but the file gains no key, because slot 8 already says it.
    expect("hiddenRails" in ui.toPersistedUIState()).toBe(false);

    // Same for the empty set.
    runInAction(() => ui.viewport.hydrate({ focusMode: false }));
    expect("hiddenRails" in ui.toPersistedUIState()).toBe(false);
  });

  it("emits hiddenRails once a rail focusMode cannot express is hidden", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const ui = new UIStore({ session, selection });

    // The right rail — classic focus mode never touched it.
    runInAction(() => ui.viewport.setRailHidden("right", true));
    const built = ui.toPersistedUIState();
    expect(built.hiddenRails).toEqual(["right"]);
    // ...and `focusMode` stays false, because the classic pair is not hidden.
    expect(built.focusMode).toBe(false);
  });

  it("emits hiddenRails for ONE classic rail — a state the boolean loses", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const ui = new UIStore({ session, selection });

    runInAction(() => ui.viewport.setRailHidden("bottom", true));
    const built = ui.toPersistedUIState();
    expect(built.hiddenRails).toEqual(["bottom"]);
    expect(built.focusMode).toBe(false);
  });

  it("round-trips a dismissed set through hydrate", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const ui = new UIStore({ session, selection });

    runInAction(() =>
      ui.viewport.hydrate({ focusMode: false, hiddenRails: ["right", "bottom"] }),
    );
    expect(ui.toPersistedUIState().hiddenRails).toEqual(["right", "bottom"]);

    // ⚠️ A file's explicit list WINS over the boolean it derives — a newer
    // save is more specific than the flag it is compatible with.
    runInAction(() =>
      ui.viewport.hydrate({ focusMode: true, hiddenRails: ["right"] }),
    );
    expect(ui.viewport.isRailHidden("left")).toBe(false);
    expect(ui.viewport.isRailHidden("right")).toBe(true);
  });

  it("⭐ layoutPresets is ABSENT until the user saves a layout", () => {
    // The same corpus-protecting property, for the key added on 2026-08-30.
    // A project whose owner has never pressed "Save current" in the layout
    // picker emits no such key, so its digest is exactly what it was.
    const project = createDefaultProject();
    expect("layoutPresets" in project.uiState).toBe(false);

    const built = hydratedStore(project).toPersistedUIState();
    expect("layoutPresets" in built).toBe(false);
    expect(Object.keys(built).sort()).toEqual(
      Object.keys(legacyUIState(project)).sort(),
    );
  });

  it("emits layoutPresets once one is saved, keyed by device class", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const layout = new LayoutUIStore("tablet");
    const ui = new UIStore({ session, selection, layout });

    runInAction(() => layout.saveCurrentAsPreset("Thumb grip"));
    const built = ui.toPersistedUIState();

    expect("layoutPresets" in built).toBe(true);
    expect(built.layoutPresets?.tablet).toHaveLength(1);
    expect(built.layoutPresets?.tablet[0].name).toBe("Thumb grip");
    // Only THIS device's entry — an iPad's saved layouts are not a laptop's.
    expect(Object.keys(built.layoutPresets!)).toEqual(["tablet"]);
  });

  it("preserves ANOTHER device's saved layouts when this device saves one", () => {
    // Same reasoning as the `railLayouts` case below: a desktop session must
    // not drop the presets an iPad saved into the same project.
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const layout = new LayoutUIStore("desktop");
    const ui = new UIStore({ session, selection, layout });

    runInAction(() => {
      layout.hydrate({
        layoutPresets: {
          tablet: [
            {
              id: "custom-1",
              name: "Left hand",
              layout: {
                left: { slot: "leftOuter", scale: "huge" },
                right: { slot: "leftInner", scale: "huge" },
                bottom: { edge: "bottom", scale: "large" },
              },
            },
          ],
        },
      });
      layout.saveCurrentAsPreset("Desk");
    });

    const built = ui.toPersistedUIState();
    expect(Object.keys(built.layoutPresets!).sort()).toEqual([
      "desktop",
      "tablet",
    ]);
    expect(built.layoutPresets?.tablet[0].name).toBe("Left hand");
    expect(built.layoutPresets?.desktop[0].name).toBe("Desk");
  });

  it("emits railLayouts once a rail actually moves, keyed by device class", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const layout = new LayoutUIStore("tablet");
    const ui = new UIStore({ session, selection, layout });

    runInAction(() => layout.stepRail("left", 1));
    const built = ui.toPersistedUIState();

    expect("railLayouts" in built).toBe(true);
    // One step crosses the canvas — `leftInner` is skipped because sitting
    // there would look identical. See `nextVisibleSlot` in `railLayout.ts`.
    expect(built.railLayouts?.tablet.left.slot).toBe("rightInner");
    // Only THIS device's entry is written — no other class is invented.
    expect(Object.keys(built.railLayouts!)).toEqual(["tablet"]);
  });

  it("preserves ANOTHER device's layout when this device saves", () => {
    // The whole point of keying by device class: a desktop session must not
    // drop the layout an iPad saved into the same project.
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const layout = new LayoutUIStore("desktop");
    const ui = new UIStore({ session, selection, layout });

    runInAction(() => {
      layout.hydrate({
        railLayouts: {
          tablet: {
            left: { slot: "rightOuter", scale: "huge" },
            right: { slot: "leftOuter", scale: "compact" },
            bottom: { edge: "top", scale: "large" },
          },
        },
      });
      layout.scaleRail("bottom", 1);
    });

    const built = ui.toPersistedUIState();
    expect(Object.keys(built.railLayouts!).sort()).toEqual([
      "desktop",
      "tablet",
    ]);
    expect(built.railLayouts?.tablet.left.slot).toBe("rightOuter");
    expect(built.railLayouts?.tablet.bottom.scale).toBe("large");
  });

  it("emits theme once set, and hydrates it back", () => {
    const session = new SessionStore();
    const selection = new SelectionMirror();
    const layout = new LayoutUIStore("desktop");
    const ui = new UIStore({ session, selection, layout });

    runInAction(() => layout.setTheme("light-spacious"));
    expect(ui.toPersistedUIState().theme).toBe("light-spacious");

    // A project with no theme hydrates back to null — it must NOT inherit
    // the previous project's theme when the user switches projects.
    runInAction(() => layout.hydrate({}));
    expect(layout.theme).toBeNull();
    expect("theme" in ui.toPersistedUIState()).toBe(false);
  });

  it("round-trips a fully-populated uiState with zero differences", () => {
    const project = fullyPopulatedProject();

    const legacy = legacyUIState(project);
    const built = hydratedStore(project).toPersistedUIState();

    expect(Object.keys(built).sort()).toEqual(Object.keys(legacy).sort());
    for (const key of Object.keys(legacy).sort() as (keyof CompactUIState)[]) {
      expect({ [key]: built[key] }).toEqual({ [key]: legacy[key] });
    }
    expect(built).toEqual(legacy);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE REAL-DATA GATE — the builder against the owner's own 151 snapshots.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The synthetic cases above pin the semantics; THIS pins the outcome on the
 * actual files. Every snapshot in the corpus is loaded through the real
 * production path (`compactToProject`), hydrated into a `UIStore`, rebuilt by
 * `toPersistedUIState()`, and compared against what `projectToCompact` would
 * have written — key set and every value, with zero permitted differences.
 *
 * This is what makes the 21-distinct-key-orders finding safe rather than
 * merely acknowledged: whatever order a file happens to carry, the key SET
 * and the VALUES come back unchanged.
 *
 * ⚠️ `corpusFiles()` THROWS when the corpus is absent rather than returning
 * `[]` — without that guard this suite would iterate zero files and report
 * PASS, a green gate verifying nothing. A fresh clone must regenerate the
 * corpus first (`src/test/__fixtures__/corpus/README.md`).
 */
describe("R3 — the builder against the real corpus", () => {
  const files = corpusFiles();

  it.each(files)(
    "%s: every snapshot's uiState rebuilds with zero differences",
    (file) => {
      const snapshots = loadCorpusFile(file);
      expect(snapshots.length).toBeGreaterThan(0);

      for (const { key, data } of snapshots) {
        const project = compactToProject(data);
        const legacy = projectToCompact(project).uiState;
        const built = hydratedStore(project).toPersistedUIState();

        expect(
          { snapshot: key, keys: Object.keys(built).sort() },
          `${file}::${key} — uiState KEY SET drifted`,
        ).toEqual({ snapshot: key, keys: Object.keys(legacy).sort() });

        for (const field of Object.keys(
          legacy,
        ).sort() as (keyof CompactUIState)[]) {
          expect(
            { [field]: built[field] },
            `${file}::${key} — uiState.${field} VALUE drifted`,
          ).toEqual({ [field]: legacy[field] });
        }
      }
    },
  );
});

/**
 * Pencil-only input (2026-08-31) — the wire-format half.
 *
 * ⚠️ THE POINT OF THESE IS THE OWNER'S DATA. `pencilOnly` is tri-state so a
 * project that has never used the toggle round-trips byte-identically; a plain
 * `boolean` would add the key to all 149 real snapshots on their next save.
 */
describe("pencilOnly — absent stays absent", () => {
  /** A bare store, built the way the other cases here build one. */
  const bare = () =>
    new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: new LayoutUIStore("desktop"),
    });

  it("⭐ is NOT emitted by a store that has never set it", () => {
    const ui = bare();
    expect("pencilOnly" in ui.toPersistedUIState()).toBe(false);
  });

  it("is emitted once set, in both directions", () => {
    const ui = bare();

    ui.viewport.setPencilOnly(true);
    expect(ui.toPersistedUIState().pencilOnly).toBe(true);

    ui.viewport.setPencilOnly(false);
    // ⚠️ FALSE MUST STILL BE EMITTED. It is a real choice — "I turned this off
    // on my iPad" — and dropping it would let the device default silently turn
    // the mode back on at the next load.
    expect(ui.toPersistedUIState().pencilOnly).toBe(false);
  });

  it("⭐ round-trips absence through a load", () => {
    const ui = bare();
    ui.viewport.hydrate({});
    expect("pencilOnly" in ui.toPersistedUIState()).toBe(false);
  });

  it("round-trips a stored value through a load", () => {
    for (const stored of [true, false]) {
      const ui = bare();
      ui.viewport.hydrate({ pencilOnly: stored });
      expect(ui.toPersistedUIState().pencilOnly).toBe(stored);
    }
  });
});

/**
 * Saved pose scene presets (2026-09-04, plan 08 task 08) — the wire-format
 * half.
 *
 * ⚠️ **THE POINT OF THESE IS THE OWNER'S DATA.** `posePresets` is the only
 * wire-format change in plan 08, and the mechanism that makes it safe is that
 * the key is **absent** until a preset exists (F13). An unconditional key —
 * or the `posePresets: undefined` form, which measurably added the key and
 * changed all 11 corpus digests when `fillColor` was written that way — would
 * fail `R3 — the builder against the real corpus` above on all 151 snapshots.
 *
 * The cases below pin that absence at both ends: from a store nobody has
 * touched, and from a project that carried no such key through a full
 * hydrate → build round trip.
 */
describe("posePresets — absent stays absent (plan 08, F13)", () => {
  /** A bare store WITH a pose store, since that is where the field lives. */
  const bare = () => {
    const pose = new PoseUIStore();
    const ui = new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: new LayoutUIStore("desktop"),
      pose,
    });
    return { ui, pose };
  };

  it("⭐ is NOT emitted by a store in which no preset has been saved", () => {
    const { ui } = bare();
    expect("posePresets" in ui.toPersistedUIState()).toBe(false);
  });

  it("⭐ is NOT emitted merely because the LIVE pose has been used", () => {
    const { ui, pose } = bare();
    runInAction(() => {
      pose.setMesh("mannequin");
      pose.setRotation({ x: 1, y: 2, z: 3 });
      pose.setScale(12);
      pose.setEdgeWidth(4);
      pose.setCameraPreset("iso");
    });
    // MASTER D6: only the PRESETS persist. Tumbling the model, scaling it and
    // turning the outline on must leave the project file untouched.
    expect("posePresets" in ui.toPersistedUIState()).toBe(false);
  });

  it("⭐ a project with no such key round-trips WITHOUT gaining one", () => {
    const { ui } = bare();
    const project = createDefaultProject();
    expect("posePresets" in project.uiState).toBe(false);
    runInAction(() => ui.hydrate(project.uiState));
    const built = ui.toPersistedUIState();
    expect("posePresets" in built).toBe(false);
    // And the legacy serializer agrees — which is the property the 151-snapshot
    // corpus case above generalises.
    expect("posePresets" in legacyUIState(project)).toBe(false);
  });

  it("appears once a preset is saved, and round-trips through hydrate", () => {
    const { ui, pose } = bare();
    runInAction(() => {
      pose.setMesh("head");
      pose.setScale(4);
      pose.saveCurrentAsPosePreset("  Hero 3/4  ");
    });

    const built = ui.toPersistedUIState();
    expect(built.posePresets).toHaveLength(1);
    expect(built.posePresets?.[0].name).toBe("Hero 3/4");
    expect(built.posePresets?.[0].meshId).toBe("head");
    expect(built.posePresets?.[0].scale).toBe(4);

    // Through a real JSON trip, into a DIFFERENT store.
    const wire = JSON.parse(JSON.stringify(built)) as CompactUIState;
    const second = bare();
    runInAction(() =>
      second.ui.hydrate({
        ...createDefaultProject().uiState,
        posePresets: wire.posePresets,
      }),
    );
    expect(second.pose.posePresets).toEqual(pose.posePresets);
    expect(second.ui.toPersistedUIState().posePresets).toEqual(
      built.posePresets,
    );
  });

  it("⭐ goes back to being ABSENT when the last preset is deleted", () => {
    const { ui, pose } = bare();
    runInAction(() => pose.saveCurrentAsPosePreset("only"));
    expect("posePresets" in ui.toPersistedUIState()).toBe(true);
    runInAction(() => pose.deletePosePreset(pose.posePresets[0].id));
    // Not `posePresets: []` — no key at all, which is what
    // `toPersistedPosePresets()` returning `undefined` buys.
    expect("posePresets" in ui.toPersistedUIState()).toBe(false);
  });

  it("⭐ hydrating a project WITHOUT the key clears a previous project's presets", () => {
    const { ui, pose } = bare();
    runInAction(() => pose.saveCurrentAsPosePreset("project A"));
    runInAction(() => ui.hydrate(createDefaultProject().uiState));
    // Otherwise the next autosave would write project A's presets into
    // project B's file.
    expect(pose.posePresets).toEqual([]);
    expect("posePresets" in ui.toPersistedUIState()).toBe(false);
  });

  it("bumps persistedUIVersion, so a saved preset actually schedules a save", () => {
    const { ui, pose } = bare();
    const before = ui.persistedUIVersion;
    runInAction(() => pose.saveCurrentAsPosePreset("wake the autosave"));
    // A missed bump here is SILENT DATA LOSS: the preset would live only in
    // memory and vanish on reload, which is the one thing the feature exists
    // to prevent.
    expect(ui.persistedUIVersion).toBeGreaterThan(before);
    ui.dispose();
  });
});
