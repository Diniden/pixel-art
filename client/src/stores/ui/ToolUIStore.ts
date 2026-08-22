/**
 * ToolUIStore — the drawing-tool half of the UI slice (REFRESH task 24).
 *
 * Owns the tool selection, the active colour, brush geometry and the shape /
 * fill options: the fields a stroke consults but the DOMAIN must never read
 * across the boundary.
 *
 * ── The one-directional boundary rule (spec §"the rule") ───────────────────
 * `moveAllLayers` gates a domain write (`moveLayerPixels`). It is passed as
 * an ARGUMENT to that action and is never read from a domain store — the same
 * rule that `selection.mask`, `selectionBehavior` and `variantFrameIndices`
 * follow when they migrate. `stores/domain/**` may not import
 * `stores/ui/**` at all (ESLint, task 05), so a violation fails lint rather
 * than being discovered as a cycle at runtime.
 *
 * ── Observable kinds ───────────────────────────────────────────────────────
 * Everything replaced WHOLESALE is `observableRef`: `selectedColor`,
 * `originColor`, `gaussianFill`, `panOffset` (on the viewport store) and
 * `colorAdjustment`. Deep observation of those buys per-key granularity
 * nobody reads and costs proxies — `colorAdjustment` in particular holds a
 * `Map<string, Map<string, {x,y}[]>>` (`storeTypes.ts:32`) that MobX must
 * stay out of entirely.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import type {
  BitDepth,
  Color,
  SelectionBehavior,
  SelectionMode,
  ShapeMode,
  Tool,
} from "../../types";
import type { ColorAdjustmentState } from "../../store/storeTypes";
import { DEFAULT_UI_STATE } from "../../types";

/** The gaussian (bucket) fill options, replaced wholesale. */
export interface GaussianFill {
  smoothing: number;
  radius: number;
  radiusMax?: number;
}

export class ToolUIStore {
  /* ── persisted (14 of the 43) ─────────────────────────────────────────── */

  selectedTool: Tool = DEFAULT_UI_STATE.selectedTool;
  /** `observableRef`: a colour is always replaced, never mutated in place. */
  selectedColor: Color = DEFAULT_UI_STATE.selectedColor;
  brushSize: number = DEFAULT_UI_STATE.brushSize;

  /**
   * @deprecated Written by `setBitDepth`, read by NOBODY in the app.
   *
   * ⚠️ It is nonetheless part of the persisted wire format, so the field and
   * its setter are retained deliberately (spec constraint: "Do not delete
   * `bitDepth`"). Removing it would drop a key from every saved project.
   */
  bitDepth: BitDepth = DEFAULT_UI_STATE.bitDepth;

  shapeMode: ShapeMode = DEFAULT_UI_STATE.shapeMode;
  /**
   * ⚠️ Tri-state: `undefined` means "absent from the project file". Measured
   * against the real corpus, only 26 of 151 snapshots carry a `borderRadius`
   * key — `compactToProject` has no `?? default` for it, so the legacy spread
   * simply omits it on the other 125. Seeding `0` here would add the key to
   * all of them. Readers use `borderRadius ?? 0`.
   */
  borderRadius: number | undefined = undefined;
  eraserShape: "circle" | "square" = "circle";
  pencilBrushShape: "circle" | "square" = "square";
  pencilBrushMax: 8 | 16 | 32 | 64 | 128 = 16;
  /** Gates `moveLayerPixels` — passed as an ARGUMENT, never read across. */
  moveAllLayers: boolean = DEFAULT_UI_STATE.moveAllLayers;
  selectionMode: SelectionMode = "rect";
  selectionBehavior: SelectionBehavior = "movePixels";
  /** `observableRef`: hex-or-undefined in the compact form. */
  originColor: Color | undefined = undefined;
  /**
   * `observableRef`: replaced wholesale by `setGaussianFillParams`.
   *
   * ⚠️ Defaults to `undefined`, NOT to `DEFAULT_UI_STATE.gaussianFill`.
   * Measured against the real corpus: projects saved before the bucket
   * options existed have no `gaussianFill` key, and the legacy
   * `...project.uiState` spread does not invent one. Seeding a default here
   * would ADD the key to every one of those files — wire-format drift of
   * exactly the kind R3 exists to prevent. `setGaussianFillParams` still
   * falls back to `radiusMax: 16` when it first writes the field.
   */
  gaussianFill: GaussianFill | undefined = undefined;

  /* ── NOT persisted (session-lifetime only) ────────────────────────────── */

  /**
   * The eyedropper's revert target. An `EditorState` field today, NOT a
   * `uiState` one — so it is deliberately absent from
   * `toPersistedUIState()`.
   */
  previousTool: Tool | null = null;
  /**
   * `observableRef`: holds a `Map<string, Map<string, {x,y}[]>>`. Keeping it
   * a ref keeps MobX out of the Map entirely. Not persisted.
   */
  colorAdjustment: ColorAdjustmentState | null = null;

  constructor() {
    makeObservable(this, {
      selectedTool: observable,
      selectedColor: observableRef,
      brushSize: observable,
      bitDepth: observable,
      shapeMode: observable,
      borderRadius: observable,
      eraserShape: observable,
      pencilBrushShape: observable,
      pencilBrushMax: observable,
      moveAllLayers: observable,
      selectionMode: observable,
      selectionBehavior: observable,
      originColor: observableRef,
      gaussianFill: observableRef,
      previousTool: observableRef,
      colorAdjustment: observableRef,

      setTool: action,
      revertToPreviousTool: action,
      setColor: action,
      setBrushSize: action,
      setBitDepth: action,
      setShapeMode: action,
      setBorderRadius: action,
      setEraserShape: action,
      setPencilBrushShape: action,
      setPencilBrushMax: action,
      setMoveAllLayers: action,
      setSelectionMode: action,
      setSelectionBehavior: action,
      clearColorAdjustment: action,
      setOriginColor: action,
      setGaussianFillParams: action,
      setColorAdjustment: action,
      hydrate: action,
    });
  }

  /* ── actions (behaviour transcribed from `store/toolActions.ts`) ──────── */

  /**
   * Mirrors `toolActions.setTool`'s eyedropper bookkeeping exactly: entering
   * the eyedropper remembers the outgoing tool; leaving it manually clears
   * the memory. The trace-mode reset and the `colorAdjustment` clear stay
   * with the caller during the bridge era (they are `EditorState` fields
   * outside this store's ownership).
   */
  setTool(tool: Tool): void {
    const current = this.selectedTool;
    if (tool === "eyedropper" && current && current !== "eyedropper") {
      this.previousTool = current;
    } else if (current === "eyedropper" && tool !== "eyedropper") {
      this.previousTool = null;
    }
    this.selectedTool = tool;
  }

  /** No-op unless the eyedropper is active — verbatim from the legacy action. */
  revertToPreviousTool(): void {
    if (this.previousTool && this.selectedTool === "eyedropper") {
      this.selectedTool = this.previousTool;
      this.previousTool = null;
    }
  }

  setColor(color: Color): void {
    this.selectedColor = color;
  }

  setBrushSize(size: number): void {
    this.brushSize = size;
  }

  /** @deprecated See the `bitDepth` field note — kept for wire compatibility. */
  setBitDepth(depth: BitDepth): void {
    this.bitDepth = depth;
  }

  setShapeMode(mode: ShapeMode): void {
    this.shapeMode = mode;
  }

  /** Legacy clamp: `Math.max(0, radius)`. */
  setBorderRadius(radius: number): void {
    this.borderRadius = Math.max(0, radius);
  }

  /** The `?? 0` fallback every reader applies to the tri-state field. */
  get borderRadiusOrZero(): number {
    return this.borderRadius ?? 0;
  }

  setEraserShape(shape: "circle" | "square"): void {
    this.eraserShape = shape;
  }

  setPencilBrushShape(shape: "circle" | "square"): void {
    this.pencilBrushShape = shape;
  }

  /** Legacy behaviour: raising/lowering the max re-clamps the current size. */
  setPencilBrushMax(max: 8 | 16 | 32 | 64 | 128): void {
    this.pencilBrushMax = max;
    this.brushSize = Math.min(this.brushSize, max);
  }

  setMoveAllLayers(moveAll: boolean): void {
    this.moveAllLayers = moveAll;
  }

  setSelectionMode(mode: SelectionMode): void {
    this.selectionMode = mode;
  }

  setSelectionBehavior(behavior: SelectionBehavior): void {
    this.selectionBehavior = behavior;
  }

  setOriginColor(color: Color): void {
    this.originColor = color;
  }

  /**
   * Legacy clamps, transcribed verbatim from `toolActions`:
   * `radiusMax` defaults to the previous value (or 16), `smoothing` is
   * clamped to 0.1..5.0 and `radius` to 0.5..`radiusMax`.
   */
  setGaussianFillParams(params: {
    smoothing: number;
    radius: number;
    radiusMax?: number;
  }): void {
    const prevMax = this.gaussianFill?.radiusMax ?? 16;
    const radiusMax = params.radiusMax ?? prevMax;
    this.gaussianFill = {
      smoothing: Math.max(0.1, Math.min(5.0, params.smoothing)),
      radius: Math.max(0.5, Math.min(radiusMax, params.radius)),
      radiusMax,
    };
  }

  /**
   * W29d: TYPED. This held `unknown` while the only writer was Zustand's
   * `set({ colorAdjustment })` and the only reader was a `Boolean(...)`
   * projection in a container. Now that `ApplicationStore.startColorAdjustment`
   * builds the value, the tagged union is the honest type — and it is what
   * makes `allFrames`/`affectedPixelsByFrame` reachable without a cast.
   *
   * ⚠️ Still `observableRef` (see the header): the value carries a
   * `Map<string, Map<string, {x,y}[]>>` whose leaf arrays can hold one entry
   * per matching pixel across every frame. MobX must stay out of it entirely.
   */
  setColorAdjustment(value: ColorAdjustmentState | null): void {
    this.colorAdjustment = value;
  }

  /**
   * Clear any pending colour adjustment — W29d.
   *
   * A named action rather than `setColorAdjustment(null)` at each call site,
   * because it has a REAL HOME requirement: `TimelineUIStore` needs to drop
   * the adjustment when the layer changes (`layerActions.ts:210`), and it
   * reached that behaviour through an injected `clearColorAdjustment`
   * callback which `zustandProjectHost.ts:150` implemented as
   * a legacy-hook `setState({ colorAdjustment: null })` — MobX reaching back
   * into Zustand for a field MobX already owns. This is that callback's MobX
   * implementation.
   */
  clearColorAdjustment(): void {
    this.colorAdjustment = null;
  }

  /**
   * Adopt a loaded project's UI fields. `undefined` means "absent from the
   * file", and each field then keeps the store's default — the same
   * `?? default` migration `compactToProject` performs, so a project saved
   * before a field existed still round-trips identically.
   */
  hydrate(ui: {
    selectedTool?: Tool;
    selectedColor?: Color;
    brushSize?: number;
    bitDepth?: BitDepth;
    shapeMode?: ShapeMode;
    borderRadius?: number;
    eraserShape?: "circle" | "square";
    pencilBrushShape?: "circle" | "square";
    pencilBrushMax?: 8 | 16 | 32 | 64 | 128;
    moveAllLayers?: boolean;
    selectionMode?: SelectionMode;
    selectionBehavior?: SelectionBehavior;
    originColor?: Color;
    gaussianFill?: GaussianFill;
  }): void {
    if (ui.selectedTool !== undefined) this.selectedTool = ui.selectedTool;
    if (ui.selectedColor !== undefined) this.selectedColor = ui.selectedColor;
    if (ui.brushSize !== undefined) this.brushSize = ui.brushSize;
    if (ui.bitDepth !== undefined) this.bitDepth = ui.bitDepth;
    if (ui.shapeMode !== undefined) this.shapeMode = ui.shapeMode;
    // Assigned unconditionally: absent must stay absent (see the field note).
    this.borderRadius = ui.borderRadius;
    if (ui.eraserShape !== undefined) this.eraserShape = ui.eraserShape;
    if (ui.pencilBrushShape !== undefined) {
      this.pencilBrushShape = ui.pencilBrushShape;
    }
    if (ui.pencilBrushMax !== undefined) {
      this.pencilBrushMax = ui.pencilBrushMax;
    }
    if (ui.moveAllLayers !== undefined) this.moveAllLayers = ui.moveAllLayers;
    if (ui.selectionMode !== undefined) this.selectionMode = ui.selectionMode;
    if (ui.selectionBehavior !== undefined) {
      this.selectionBehavior = ui.selectionBehavior;
    }
    // `originColor` is legitimately `undefined` in the wire format, so it is
    // assigned unconditionally — see the R1 note in `UIStore`.
    this.originColor = ui.originColor;
    // Assigned unconditionally: absent must stay absent (see the field note).
    this.gaussianFill = ui.gaussianFill;
  }
}
