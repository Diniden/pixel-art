/**
 * LightingUIStore — the lighting studio's 9 persisted settings (REFRESH task 27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS STORE EXISTS: IT CLOSES THE STRUCTURAL HALF OF LIVE BUG #2
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `store/lightingActions.ts` held eight trivial setters that wrote `project`
 * through a raw `set({ project: {...} })` and scheduled NO save. The module
 * did not import `services/autoSave` **at all**, so light colour, ambient
 * colour, height scale, selected normal, studio mode, height brush value,
 * edit mode and light direction were silently discarded on reload unless an
 * unrelated action happened to save first.
 *
 * W8 (task 14) fixed the BEHAVIOUR by hand: it routed all eight through
 * `updateProjectAndSave`. `store/__tests__/autoSave.test.ts` carries the
 * eight flipped assertions, plus a retained pin that none of them tracks
 * history (`trackHistory = false` is deliberate — all 33 `uiState` call sites
 * in `toolActions` use `false`, and `true` would add eight new undo entries,
 * a different behaviour change from the one being fixed).
 *
 * **This store makes the fix STRUCTURAL.** The nine fields are observables on
 * a store that `UIStore.toPersistedUIState()` enumerates, and `UIStore`'s
 * `persistedUIVersion` reaction is derived from that builder itself. So any
 * write to any of them bumps `persistedUIVersion` **by construction**, and
 * `AutoSaveController`'s trigger fires. Forgetting to save is no longer
 * something a setter author can do: there is no per-setter save call to
 * forget.
 *
 * `LightingUIStore.test.ts` asserts the bump for each of the nine
 * individually — that suite is the regression test for the original bug.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS STORE HOLDS *SETTINGS*, NEVER PIXEL CONTENT (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Normals and heights are PIXEL CONTENT — `PixelData` is `[colour, normal,
 * height]` — and `PixelStore` is their sole writer. The nine fields here are
 * the *brush* and the *viewer*: which normal the pencil will stamp, which
 * direction the preview light comes from. Nothing in this file touches a
 * grid, and `stores/ui/**` never imports `stores/domain/**`.
 *
 * ── Observable kinds ───────────────────────────────────────────────────────
 *
 * `selectedNormal`, `lightDirection`, `lightColor` and `ambientColor` are
 * `observableRef`: each is a small record replaced WHOLESALE by its setter,
 * exactly like `ToolUIStore.selectedColor`. Deep observation would buy
 * per-component granularity nobody reads and cost proxies. The remaining five
 * are scalars.
 *
 * ── Domain-typed in, packed at the boundary ────────────────────────────────
 *
 * The store holds `Normal` and `Color` OBJECTS, matching `UIState`. The
 * compact wire format wants packed ints and hex ints, and that conversion
 * happens in `UIStore.toPersistedUIState()` at the single point where the
 * payload is built — the same split `ToolUIStore.selectedColor` /
 * `rgbaToHex` already uses. Holding packed values here would put the wire
 * format inside the UI layer and force every consumer to unpack.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import type { Color, Normal, StudioMode, Tool } from "../../types";
import { DEFAULT_UI_STATE } from "../../types";

/**
 * The one write this store cannot perform itself.
 *
 * `setStudioMode` also resets `selectedTool` ("normal-pencil" entering
 * lighting mode, "pixel" leaving it) — a `ToolUIStore` field. Rather than
 * reach across, the owning store is injected. This preserves the legacy
 * two-field-in-one-commit behaviour exactly while keeping one writer per
 * field (R6).
 */
export interface LightingToolSink {
  selectedTool: Tool;
}

export interface LightingUIStoreDeps {
  /** `ToolUIStore` — see {@link LightingToolSink}. */
  tool: LightingToolSink;
}

export class LightingUIStore {
  private readonly tool: LightingToolSink;

  /* ══ THE 9 PERSISTED FIELDS ═══════════════════════════════════════════ */

  /** 1. `"pixel" | "lighting" | "brush"` — the top-level mode switch. */
  studioMode: StudioMode = DEFAULT_UI_STATE.studioMode;

  /**
   * 2. Which lighting data layer the pencil edits.
   *
   * ⚠️ Tri-state. `undefined` means "absent from the project file", and the
   * legacy spread omitted the key entirely on such projects. Readers use
   * `?? "normals"` (`LightingStudioTools.tsx:101` does exactly that). Seeding
   * `"normals"` here would ADD the key to every project that lacks it — a
   * wire-format change. `DEFAULT_UI_STATE` does carry `"normals"`, but that
   * constant describes a NEW project, not a loaded one.
   */
  lightingDataLayerEditMode: "normals" | "height" | undefined = undefined;

  /** 3. `observableRef` — the normal the pencil stamps. Packed on the wire. */
  selectedNormal: Normal = DEFAULT_UI_STATE.selectedNormal;

  /**
   * 4. `observableRef` — the preview light's direction. Packed on the wire.
   * Default `{x:-64, y:-64, z:180}` (`types/constants.ts`).
   *
   * ⚠️ INDEPENDENT of `selectedNormal`, despite `NormalPicker` driving both
   * from one widget. Wiring them to a shared field is the easy mistake here;
   * `LightingUIStore.test.ts` pins their independence in both directions.
   */
  lightDirection: Normal = DEFAULT_UI_STATE.lightDirection;

  /** 5. `observableRef` — the preview light's colour. Hex on the wire. */
  lightColor: Color = DEFAULT_UI_STATE.lightColor;

  /** 6. `observableRef` — the ambient term's colour. Hex on the wire. */
  ambientColor: Color = DEFAULT_UI_STATE.ambientColor;

  /** 7. Shadow-calculation height scale. Clamped 1..500 by its setter. */
  heightScale: number = DEFAULT_UI_STATE.heightScale;

  /**
   * 8. The height the brush paints. Clamped 0..255 and ROUNDED by its setter.
   * `0` clears height rather than painting it.
   */
  heightBrushValue: number | undefined = DEFAULT_UI_STATE.heightBrushValue;

  /**
   * 9. The normal brush's footprint.
   *
   * ⚠️ The ONE lighting field that already autosaved before W8 — its setter
   * lives in `toolActions.ts:200`, not in `lightingActions.ts`, and therefore
   * never had the missing-save defect. It joins the other eight here anyway:
   * the point of this store is that all nine are persisted by the same
   * mechanism, so nobody has to remember which ones were special.
   */
  normalBrushShape: "circle" | "square" = DEFAULT_UI_STATE.normalBrushShape;

  constructor(deps: LightingUIStoreDeps) {
    this.tool = deps.tool;

    makeObservable(this, {
      studioMode: observable,
      lightingDataLayerEditMode: observable,
      // R2 in miniature: replaced wholesale, never mutated in place.
      selectedNormal: observableRef,
      lightDirection: observableRef,
      lightColor: observableRef,
      ambientColor: observableRef,
      heightScale: observable,
      heightBrushValue: observable,
      normalBrushShape: observable,

      setStudioMode: action,
      setLightingDataLayerEditMode: action,
      setSelectedNormal: action,
      setLightDirection: action,
      setLightColor: action,
      setAmbientColor: action,
      setHeightScale: action,
      setHeightBrushValue: action,
      setNormalBrushShape: action,
      hydrate: action,
    });
  }

  /* ══ THE 9 SETTERS ════════════════════════════════════════════════════
   *
   * Ported from `store/lightingActions.ts:21-129` (eight) and
   * `store/toolActions.ts:200` (`setNormalBrushShape`). Every clamp is
   * transcribed EXACTLY — `heightBrushValue` rounds before clamping,
   * `heightScale` does not round at all, and both bounds are inclusive.
   * Task 08 pinned this arithmetic; do not "improve" it.
   *
   * ⚠️ NONE of them records history. `trackHistory = false` was deliberate in
   * the legacy actions and `autoSave.test.ts` retains the pin. There is no
   * `HistoryStore` reference in this file at all, which is the structural
   * form of that decision.
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Switch the studio mode, and reset the tool to that mode's default — both
   * in ONE commit, exactly as `lightingActions.ts:22-34` did. The tool reset
   * is not incidental: entering lighting mode with the pixel pencil selected
   * leaves the toolbar in a state no lighting tool handles.
   *
   * `"brush"` (brush studio, MASTER D1) takes the pixel branch on purpose: the
   * brush studio drives the pixel studio's tool table, so its default tool is
   * the pixel pencil. Only `"lighting"` gets the lighting default.
   */
  setStudioMode(mode: StudioMode): void {
    this.studioMode = mode;
    this.tool.selectedTool = mode === "lighting" ? "normal-pencil" : "pixel";
  }

  setLightingDataLayerEditMode(mode: "normals" | "height"): void {
    this.lightingDataLayerEditMode = mode;
  }

  setSelectedNormal(normal: Normal): void {
    this.selectedNormal = normal;
  }

  setLightDirection(normal: Normal): void {
    this.lightDirection = normal;
  }

  setLightColor(color: Color): void {
    this.lightColor = color;
  }

  setAmbientColor(color: Color): void {
    this.ambientColor = color;
  }

  /** Clamped 1..500. Ported verbatim — note there is NO rounding here. */
  setHeightScale(scale: number): void {
    this.heightScale = Math.max(1, Math.min(500, scale));
  }

  /** Rounded, THEN clamped 0..255 — the legacy order, which is observable. */
  setHeightBrushValue(value: number): void {
    this.heightBrushValue = Math.max(0, Math.min(255, Math.round(value)));
  }

  setNormalBrushShape(shape: "circle" | "square"): void {
    this.normalBrushShape = shape;
  }

  /**
   * Adopt a loaded project's lighting fields.
   *
   * `undefined` means "absent from the file" and the store keeps its default
   * — the same `?? default` migration `compactToProject` performs, so a
   * project saved before a field existed round-trips identically.
   *
   * `lightingDataLayerEditMode` and `heightBrushValue` are assigned
   * UNCONDITIONALLY: both are genuinely optional in the wire format, and an
   * absent key must stay absent rather than acquiring the store's default.
   * See the field notes above and the conditional-key half of
   * `toPersistedUIState()`.
   */
  hydrate(ui: {
    studioMode?: StudioMode;
    lightingDataLayerEditMode?: "normals" | "height";
    selectedNormal?: Normal;
    lightDirection?: Normal;
    lightColor?: Color;
    ambientColor?: Color;
    heightScale?: number;
    heightBrushValue?: number;
    normalBrushShape?: "circle" | "square";
  }): void {
    if (ui.studioMode !== undefined) this.studioMode = ui.studioMode;
    // Unconditional: absent must stay absent.
    this.lightingDataLayerEditMode = ui.lightingDataLayerEditMode;
    if (ui.selectedNormal !== undefined)
      this.selectedNormal = ui.selectedNormal;
    if (ui.lightDirection !== undefined)
      this.lightDirection = ui.lightDirection;
    if (ui.lightColor !== undefined) this.lightColor = ui.lightColor;
    if (ui.ambientColor !== undefined) this.ambientColor = ui.ambientColor;
    if (ui.heightScale !== undefined) this.heightScale = ui.heightScale;
    // Unconditional: absent must stay absent.
    this.heightBrushValue = ui.heightBrushValue;
    if (ui.normalBrushShape !== undefined) {
      this.normalBrushShape = ui.normalBrushShape;
    }
  }
}
