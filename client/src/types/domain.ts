export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Normal vector for lighting calculations
// x, y are signed bytes (-128 to 127), z is unsigned byte (0 to 255, always positive toward screen)
// All zeros (0, 0, 0) means no normal data
export interface Normal {
  x: number; // Signed byte (-128 to 127)
  y: number; // Signed byte (-128 to 127)
  z: number; // Unsigned byte (0 to 255, always positive)
}

// Complete pixel data including color, normal, and height
export interface PixelData {
  color: Pixel | 0; // RGBA color (0 = empty/transparent)
  normal: Normal | 0; // Normal map data (0 = no normal)
  height: number; // Height map (0 = no height data, 1-255 = height values)
}

export interface Layer {
  id: string;
  name: string;
  pixels: PixelData[][]; // 2D array [y][x] with full pixel data
  visible: boolean;
  // Variant-specific fields (only present if this is a variant layer)
  isVariant?: boolean;
  variantGroupId?: string; // Reference to project-level VariantGroup
  selectedVariantId?: string; // Reference to which Variant (variant type) is selected
  // Per-layer, per-variant-type offsets for positioning variant within the frame
  // Key is the variant ID (variant type), value is the offset for that variant type
  // This allows different variant types to have independent positioning when selected
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  // DEPRECATED: Single offset for backward compatibility during migration
  variantOffset?: { x: number; y: number };
}

export interface Frame {
  id: string;
  name: string;
  layers: Layer[];
  tags?: string[];
}

// ============================================
// Variant types
// ============================================

// A single frame within a variant, with its own layers
export interface VariantFrame {
  id: string;
  layers: Layer[]; // Regular layers (without variant fields)
  tags?: string[];
  // DEPRECATED: offset is now stored in Variant.baseFrameOffsets
  // Kept for backwards compatibility during migration
  offset?: { x: number; y: number };
}

// A single variant definition
export interface Variant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: VariantFrame[];
  // Offset for this variant at each base frame index
  // Key is base frame index (0, 1, 2, ...), value is the offset
  baseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } };
}

// A group of variants (all alternatives for a layer)
export interface VariantGroup {
  id: string;
  name: string; // Display name (original layer name)
  variants: Variant[];
}

export interface PixelObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: Frame[];
  // Origin anchor point (offset from top-left of object's render region)
  origin?: { x: number; y: number };
  // DEPRECATED: variantGroups now live at project level
  // Kept for backwards compatibility during migration
  variantGroups?: VariantGroup[];
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Palette {
  id: string;
  name: string;
  colors: Color[];
}

export interface Project {
  version?: string; // Matches package.json version
  objects: PixelObject[];
  palettes: Palette[];
  uiState: UIState;
  // Project-level variants (new in version 1.1.0)
  // Variants are shared across all objects - editing affects all objects using them
  variants?: VariantGroup[];
  // Reference image data (base64 encoded image and selection box)
  referenceImage?: {
    imageBase64: string; // Base64 encoded image data
    selectionBox: {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    };
  };
}

export interface UIState {
  selectedObjectId: string | null;
  selectedFrameId: string | null;
  selectedLayerId: string | null;
  selectedTool: Tool;
  selectedColor: Color;
  /**
   * The FILL colour — bucket, gaussian fill, and a shape's interior.
   *
   * ⚠️ OPTIONAL, and must stay optional: every project saved before the
   * edge/fill split (2026-09-01) has no such key. Readers fall back to
   * `selectedColor` via `ToolUIStore.fillColorOrSelected`, so those projects
   * keep their single-colour behaviour and their corpus digests.
   */
  fillColor?: Color;
  // Selection tool options
  selectionMode?: SelectionMode;
  selectionBehavior?: SelectionBehavior;
  // Focus mode: hide side/bottom panels for distraction-free editing
  focusMode?: boolean;
  /**
   * Which rails the user has dismissed (2026-08-30), by rail name.
   *
   * OPTIONAL and conditionally emitted: absent until a rail is actually
   * hidden, so an untouched project gains no key. WIDE `string[]` like the
   * rest of this file — a file may name a rail this build does not know.
   *
   * ⚠️ It does NOT replace `focusMode`, which stays in the wire format
   * unconditionally (it is part of the frozen key set). `focusMode` remains
   * true exactly when the two classic focus rails are both hidden, so an
   * older build reading a newer file still behaves sensibly.
   */
  hiddenRails?: string[];
  // Light grid mode: use a light background for the canvas grid instead of dark
  lightGridMode?: boolean;
  /**
   * Pencil-only input (2026-08-31): only an Apple Pencil may edit pixels.
   *
   * When true, a FINGER cannot draw — it can still pan, pinch and operate
   * every control, but it will not put a pixel down. That is the whole point:
   * on an iPad the hand resting on the glass is not trying to paint. When
   * false the canvas behaves as it always has and a single finger draws.
   *
   * ⚠️ OPTIONAL AND CONDITIONALLY EMITTED, exactly like `hiddenRails` above.
   * An untouched project gains no key, so existing files round-trip
   * byte-identically and the corpus snapshots do not move. `undefined` means
   * "absent from the file"; readers collapse it at the read site.
   *
   * ⚠️ The DEFAULT for a fresh value is decided in the UI layer, not here,
   * and it is device-dependent: a touch device defaults it ON, which is what
   * the owner asked for ("selected by default"). Baking a default into the
   * wire format would force it onto desktops that have no stylus at all and
   * silently disable mouse drawing there.
   */
  pencilOnly?: boolean;
  brushSize: number;
  bitDepth: BitDepth;
  shapeMode: ShapeMode;
  borderRadius: number;
  zoom: number;
  panOffset: { x: number; y: number };
  moveAllLayers: boolean;
  eraserShape: "circle" | "square";
  // Pixel pencil brush settings
  pencilBrushShape: "circle" | "square";
  pencilBrushMax: 8 | 16 | 32 | 64 | 128;
  // Trace mode nudge: how far Shift+WASD moves reference/frame trace offsets
  traceNudgeAmount: 10 | 20 | 25 | 50 | 100;
  // Variant editing state
  variantFrameIndices?: { [variantGroupId: string]: number }; // Track current frame index for each variant group
  layerSelectionCounter?: number; // Increments on every layer click (even re-selection) to detect layer clicks
  // Lighting studio state
  studioMode: StudioMode;
  // Which lighting data layer the pencil edits
  lightingDataLayerEditMode?: "normals" | "height";
  selectedNormal: Normal;
  lightDirection: Normal;
  lightColor: Color;
  ambientColor: Color;
  heightScale: number; // Height scale factor for shadow calculation (default: 100)
  // Height brush value (0 clears height, 1-255 paints height)
  heightBrushValue?: number;
  normalBrushShape: "circle" | "square"; // Shape for normal brush tool
  // Frame reference panel state (position stored as percentage of canvas area)
  frameReferencePanelPosition?: { topPercent: number; leftPercent: number };
  frameReferencePanelMinimized?: boolean;
  frameReferencePanelVisible?: boolean;
  // Reference image panel state (position stored as percentage of canvas area)
  referenceImagePanelPosition?: { topPercent: number; leftPercent: number };
  referenceImagePanelMinimized?: boolean;
  // Lighting preview panel (floating) state (position stored as percentage of canvas area)
  lightingPreviewPanelPosition?: { topPercent: number; leftPercent: number };
  lightingPreviewPanelMinimized?: boolean;
  // Canvas info panel state
  canvasInfoHidden?: boolean;
  // Object library view mode
  objectLibraryViewMode?: "normal" | "small-rows" | "grid";
  // Timeline thumbnail mode
  timelineThumbnailMode?: boolean;
  // Origin display color
  originColor?: Color;

  // Flood fill (bucket) options
  gaussianFill?: {
    smoothing: number;
    radius: number;
    radiusMax?: number;
  };

  // AI frame interpolation service URL (remote machine)
  aiServiceUrl?: string;

  // ── Shell chrome: rail layout + theme ──────────────────────────────────
  //
  // Both are OPTIONAL and, crucially, ABSENT until the user actually changes
  // something. A project that has never touched the Layout menu or the theme
  // dropdown serializes exactly the key set it always did — see
  // `UIStore.toPersistedUIState()`'s conditional half, and R3.
  //
  // `railLayouts` is keyed by DEVICE CLASS (`desktop` / `tablet` / `phone`)
  // so one project carries one arrangement per kind of screen: a laptop and
  // an iPad opening the same file each get the layout that suits them. The
  // theme is deliberately NOT keyed that way — one theme per project, on
  // every device (owner decision).
  railLayouts?: { [deviceClass: string]: PersistedRailLayout };
  /**
   * The user's OWN saved layouts, keyed by device class like `railLayouts`
   * (2026-08-30). Optional and, like the two keys above, absent until the
   * user actually saves one — an untouched project gains no key, which is
   * what keeps the corpus digests unchanged.
   *
   * Separate from `railLayouts` rather than a field inside it because the two
   * answer different questions: `railLayouts` is "where are this device's
   * rails right now", this is "which arrangements has the user kept". A
   * device can have the second with none of the first, and losing one must
   * not lose the other.
   */
  layoutPresets?: { [deviceClass: string]: PersistedLayoutPreset[] };
  theme?: string;

  /**
   * The user's saved POSE SCENE presets (plan 08 task 08, 2026-09-04 — owner
   * item 10: *"a way to save ALL orientations of camera settings and model to
   * a preset that I can reload easily"*).
   *
   * Optional and, exactly like `layoutPresets` above, **absent until the user
   * saves one**. That conditionality is not a style choice — it is the whole
   * mechanism that keeps the owner's 151 backup snapshots byte-identical
   * (plan 08 **F13**). `PoseUIStore.toPersistedPosePresets()` returns
   * `undefined` for an empty list and the builder emits it through
   * `assign()`, so an untouched project gains no key. **Never write it as
   * `posePresets: undefined`** — measured, that form changed all 11 corpus
   * digests, because "present with value undefined" is still a key.
   *
   * ⚠️ **Only the presets persist. The LIVE pose does not.** `rotation`,
   * `scale`, `pan`, `edgeWidth`, `meshId` and the light stay session-only
   * (MASTER D6) — the reference model is not part of the document until it is
   * stamped. A preset is a thing the owner deliberately named and kept, which
   * is a different claim entirely.
   */
  posePresets?: PersistedPosePreset[];

  /**
   * The canvas VIEW transform's scale (pinch/wheel), distinct from `zoom`
   * which is the pixel scale. Persisted so the view follows the project
   * across devices — `panOffset`, its other half, always has been.
   * Conditionally emitted: absent until the user zooms.
   */
  viewZoom?: number;
  /**
   * The eyedropper's post-sample behaviour. Conditionally emitted: absent
   * until the user picks a mode, so an untouched project gains no key.
   */
  eyedropperMode?: EyedropperMode;
}

/**
 * One device class's rail arrangement, as persisted.
 *
 * A structural mirror of `ui/layout/railLayout.ts`'s `RailLayout`, declared
 * here in WIDE types (`string`, not the union) on purpose: this is the wire
 * format, and a file on disk may legitimately carry a value this build does
 * not know — a layout authored by a newer version, or a hand-edited file.
 * The narrowing happens once, on hydrate, where an unknown value falls back
 * to the default instead of poisoning the store with an impossible union
 * member. `types/` must never assume the data matches the current build.
 */
export interface PersistedRailLayout {
  left: { slot: string; scale: string };
  right: { slot: string; scale: string };
  bottom: { edge: string; scale: string };
  /**
   * The canvas toolbar's edge (2026-08-28). OPTIONAL, because every layout
   * saved before that date has no such block — an older project must load
   * with the toolbar where it has always been rather than failing to narrow.
   */
  toolbar?: { edge: string; scale: string; spread?: number };
  /**
   * Other Hand Mode arrangements (2026-08-28), by section key. OPTIONAL and
   * only emitted once the user has arranged something — an untouched layout
   * carries no such key. Values are WIDE on purpose: a file may have been
   * written by a later build with more colour models; the store narrows and
   * drops what it does not recognise.
   */
  otherHand?: {
    [sectionKey: string]: {
      positions: { [widgetId: string]: { x: number; y: number } };
      colorModel?: string;
      includeAlpha?: boolean;
    };
  };
}

/**
 * One layout the user saved and named, as persisted.
 *
 * WIDE types for the same reason `PersistedRailLayout` is wide: this is the
 * wire format, and a file may carry a preset written by a newer build. The
 * narrowing happens once, on hydrate.
 *
 * ⚠️ The `layout` is a full `PersistedRailLayout`, not a diff against a
 * built-in. A preset must reproduce the same screen years later even if the
 * built-in it happened to resemble has since been re-tuned.
 */
export interface PersistedLayoutPreset {
  id: string;
  name: string;
  layout: PersistedRailLayout;
}

/**
 * One POSE SCENE the user saved and named, as persisted (plan 08, **F15**).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ EVERY FIELD IS WIDE, AND EVERY FIELD BUT `id`/`name` IS OPTIONAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Wide (`string`, not the `PoseMeshId` union; `number`, not a clamped range)
 * for the same reason `PersistedRailLayout` and `PersistedLayoutPreset` are:
 * this is the **wire format**, and a file on disk may legitimately carry a
 * value this build does not know — a preset written by a newer version with a
 * mesh id that did not exist yet, or a hand-edited file. `types/` must never
 * assume the data matches the current build. The narrowing happens exactly
 * once, in `PoseUIStore.narrowPosePresets()`, where an unknown value is
 * dropped to the field's default rather than poisoning the store with an
 * impossible union member.
 *
 * Optional beyond `id`/`name` for the forward-compatibility half of the same
 * rule: a preset written by an OLDER build has fewer fields, and an older
 * build reading a newer preset must ignore what it does not understand rather
 * than crash. `?? default` on read (F14) is what makes both directions work
 * with **no migration** — there is none, and none is needed.
 *
 * ## What a preset carries, and what it deliberately does not
 *
 * **Open question 4, decided 2026-09-04 by task 08.** The owner asked to save
 * *"ALL orientations of camera settings and model"*, so the test applied was:
 * **would the owner recognise the view this restores?**
 *
 * | Field | In? | Why |
 * | --- | --- | --- |
 * | `meshId` | ✅ | A scene without its subject is not a scene. Restoring a torso's angles onto a loaded sphere is not the picture that was saved. |
 * | `rotation` | ✅ | The literal "orientation of the model" the owner named. |
 * | `projection`, `cameraPreset`, `fov` | ✅ | The literal "camera settings" the owner named. |
 * | `scale` | ✅ | How big the model reads IS most of the picture, and unlike a camera preset (open question 1) a **scene** preset is a whole remembered view rather than a change of angle. See below. |
 * | `lightDirection`, `lightColor` | ✅ | The light is what makes a 3D reference legible; two identical geometries under different keys read as different references. |
 * | `edgeWidth` | ✅ | The outline is part of how the reference LOOKS, and it is one integer. |
 * | `pan` | ❌ | Framing, not orientation — see below. |
 *
 * ## ⚠️ `pan` is excluded, and `scale` is included — the asymmetry is deliberate
 *
 * Both were left alone by a **camera preset** (open question 1, task 05), so
 * including `scale` here needs a reason rather than an assumption.
 *
 * The two questions are genuinely different. A **camera preset** is a verb —
 * *"put me at the isometric angle"* — and it fires while the owner is working
 * at a scale and a pan they chose; taking those away would punish them for
 * changing angle. A **scene preset** is a noun — *"the setup I saved"* — and
 * the owner asked for it so they could *"reload it easily"*. Restoring
 * everything except how big the model was gives back a view they did not
 * save, which is the failure mode the feature exists to prevent.
 *
 * `pan` is excluded even so, because it is the one field whose meaning does
 * not survive the trip: it is measured in **grid cells** of whatever canvas
 * was open, so a pan saved on a 64×64 sprite lands somewhere else entirely on
 * a 32×32 one — and a pan is unbounded (MASTER E13), so a restored preset
 * could put the model completely off screen with no visible cause. Scale is
 * canvas-independent; pan is not. If the owner disagrees, the change is one
 * field here and three lines in `applyPosePreset`.
 */
export interface PersistedPosePreset {
  /** Unique within the list. Generated on save; never re-used. */
  id: string;
  /** What the owner typed. Trimmed, never empty. */
  name: string;
  /** `PoseMeshId` on the wire as a bare string — see the header. */
  meshId?: string;
  /** Model orientation, **euler radians** (the store's unit, not degrees). */
  rotation?: { x: number; y: number; z: number };
  /** `"perspective"` | `"orthographic"`, wide. */
  projection?: string;
  /** A `PoseCameraPreset` id, wide. */
  cameraPreset?: string;
  /** Field of view in DEGREES, as the store holds it. */
  fov?: number;
  /** The model's own scale multiplier about its own origin. */
  scale?: number;
  /**
   * Per-axis proportions, `0.001`..`1` each. Absent reads as `{1,1,1}` — a
   * preset saved before this field existed restores an unsquashed model,
   * which is what it was.
   */
  axisScale?: { x: number; y: number; z: number };
  /** Key-light direction. Re-normalised on apply, so drift is harmless. */
  lightDirection?: { x: number; y: number; z: number };
  /** Key-light tint, as plain 0–255 components. */
  lightColor?: { r: number; g: number; b: number; a: number };
  /** Outline thickness in whole pixels; `0` means no outline. */
  edgeWidth?: number;
}

export type Tool =
  | "pixel"
  | "fill-square"
  | "flood-fill"
  | "gaussian-fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "eraser"
  | "move"
  | "reference-trace"
  | "eyedropper"
  | "selection"
  | "origin"
  | "reflection"
  // A gesture/reference tool: it renders a 3D reference above the layers and
  // never writes pixels through the tool table. See docs/06-pose-tool/.
  | "pose"
  | "normal-pencil"
  | "auto-normal"
  | "height-map";

export type StudioMode = "pixel" | "lighting";

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What the eyedropper does once it has sampled a colour.
 *
 * `"revert"` is the historical behaviour and stays the default: sample, then
 * jump back to the tool you came from, which is what you want when you dip
 * into the eyedropper mid-stroke. `"stay"` keeps the eyedropper active, which
 * is what you want when picking several colours in a row.
 */
export type EyedropperMode = "revert" | "stay";

export type SelectionMode = "rect" | "flood" | "lasso" | "color";
export type SelectionBehavior = "movePixels" | "moveSelection" | "editMask";

export type BitDepth = 8 | 16 | 32;

export type ShapeMode = "outline" | "fill" | "both";

export interface Point {
  x: number;
  y: number;
}

/**
 * A single timestamped backup file on disk.
 *
 * REFRESH task 36 (W27): this interface used to live in
 * `src/api/resources/backupApi.ts`. `BrowseBackupsModal` moved into `ui/`,
 * where the ESLint purity boundary bans every `api` path — and it bans them for TYPE
 * imports too, since a `import type` still names the forbidden module.
 *
 * It is a plain three-string DTO with no transport concerns, so it belongs in
 * the domain layer rather than the API layer. `backupApi` re-exports it from
 * here, which keeps every existing `from "../../api"` import working unchanged.
 */
export interface BackupEntry {
  date: string;
  time: string;
  filename: string;
}

/**
 * The resolved variant context — the shape `helpers.getCurrentVariant` returned.
 *
 * REFRESH task 36 (W27): moved here from `stores/ApplicationStore.ts` so that
 * `HeightMapModal` — now pure and living in `ui/` — can name it. The `ui/`
 * purity boundary bans every `stores` path for type imports too, and this interface
 * is a pure composition of domain types with no store behaviour, so the domain
 * layer is where it belongs. `ApplicationStore` re-exports it, leaving every
 * existing importer unchanged.
 */
export interface CurrentVariant {
  variantGroup: VariantGroup;
  variant: Variant;
  variantFrame: VariantFrame;
  baseFrameIndex: number;
  offset: { x: number; y: number };
}

/**
 * Everything the frame-timeline subtree reads off the project node — and
 * nothing else (REFRESH W29i).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE SHAPE IS NOT A DESIGN CHOICE — IT IS A MEASUREMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `FrameTimelineContainer` used to read the WHOLE `Project` off Zustand and
 * thread it through `FrameTimeline` into `FramesView` (684 lines) and
 * `VariantView` (657 lines). Eight preparatory waves left it there because
 * `FrameThumbnail`'s `React.memo` comparator reads
 * `project.uiState.variantFrameIndices` BY REFERENCE, and W29c measured that
 * guard **LIVE** against the owner's real project (7 variant groups, 9
 * populated indices; `TimelineUIStore.setVariantFrameIndex` rebuilds the
 * record per write because it is `observableRef`). Narrowing what a live
 * comparator observes changes which timeline cells re-render — a behaviour
 * change neither tsc nor the suite would catch.
 *
 * W29i enumerated every `project.*` access in that whole subtree. There are
 * exactly FOUR, and this interface is that list:
 *
 * | access                             | sites                              |
 * | ---------------------------------- | ---------------------------------- |
 * | `uiState.variantFrameIndices`      | the two comparators + VariantView   |
 * | `uiState.selectedFrameId`          | FramesView:427, VariantView:176     |
 * | `uiState.zoom`                     | both `PreviewModal`s, TimelineView  |
 * | `variants`                         | thumbnails, previews, TimelineView  |
 *
 * Nothing reads `objects`, `palettes`, `referenceImage`, `version` or any
 * pixel data. In particular **no consumer needs the 300,249-cell pixel tree**,
 * which is why this can be assembled from `DomainStore`'s five observable
 * members without ever calling `currentProject()` — the method that REBUILDS
 * that tree through `treeToProject()` on every call and must never appear in
 * a render path (R2).
 *
 * ⚠️ **The identity contract that keeps the comparators honest.**
 * `FrameThumbnail`'s prop type has ALWAYS been the structural minimum
 * `{ uiState?: { variantFrameIndices?: … } }` — it never asked for a
 * `Project`, it was merely handed one. The comparator compares the
 * `variantFrameIndices` RECORD by reference, never the node that wraps it, so
 * the wrapper's own identity is not load-bearing for it. But `FrameItem` is a
 * plain `memo` with a SHALLOW prop compare, and it does receive this node —
 * so the container must keep the wrapper's identity stable whenever its four
 * fields are unchanged, or every cell re-renders on every timeline render.
 * `FrameTimelineContainer` does that with a `useMemo` keyed on the four
 * fields; `frameThumbnailMemo.dom.test.tsx` pins the resulting render counts,
 * measured against the pre-change code and reproduced exactly after.
 */
export interface TimelineProjectView {
  variants: VariantGroup[];
  uiState: {
    selectedFrameId: string | null;
    zoom: number;
    variantFrameIndices: { [variantGroupId: string]: number };
  };
}
