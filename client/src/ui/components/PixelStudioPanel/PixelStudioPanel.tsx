/**
 * PixelStudioPanel — PURE (REFRESH task 36, W27).
 *
 * This file used to make TWO separate legacy Zustand-hook calls — 5 members in
 * the panel and 3 more in its private `OriginColorPicker`. Task 24's container
 * note called for collapsing them into ONE container; that is now done, and
 * `OriginColorPicker` takes props like everything else.
 *
 * ⚠️ `colorPicker` and `paletteManager` are injected as ELEMENTS because both
 * are containers; a `ui/` module importing a container pulls MobX across the
 * purity boundary transitively.
 */
import type { ReactNode } from "react";
import type { Color } from "../../../types";
import { OtherHandButton } from "../OtherHand/OtherHandButton";
import { Button } from "../../primitives/Button/Button";
import {
  ReflectionLinesSection,
  type ReflectionLinesSectionProps,
} from "./ReflectionLinesSection";
import { PoseSection, type PoseSectionProps } from "../PosePanel/PoseSection";
import "./PixelStudioPanel.css";

interface OriginColorPickerProps {
  /** `uiState.originColor`, already defaulted by the container. */
  color: Color;
  /** Current object's origin, or null when unset. */
  originPos: { x: number; y: number } | null;
  onOriginColorChange: (color: Color) => void;
}

/** Simple inline color picker for the origin cross display color. */
function OriginColorPicker({
  color,
  originPos,
  onOriginColorChange,
}: OriginColorPickerProps) {
  const toHex = (c: Color) =>
    "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");

  const fromHex = (hex: string): Color => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 255,
  });

  return (
    <div className="panel pixel-studio-panel__origin-panel">
      <div className="panel__header">Origin</div>
      <div className="panel__body">
        <div className="pixel-studio-panel__origin-controls">
          <div className="pixel-studio-panel__origin-color-control">
            <label>Color</label>
            <input
              type="color"
              value={toHex(color)}
              onChange={(e) => onOriginColorChange(fromHex(e.target.value))}
              className="pixel-studio-panel__origin-color-input"
            />
          </div>
          <div className="pixel-studio-panel__origin-position">
            <label>Position</label>
            <span className="pixel-studio-panel__origin-position-value">
              {originPos ? `${originPos.x}, ${originPos.y}` : "Not set"}
            </span>
          </div>
          <p className="pixel-studio-panel__origin-hint">
            Click on the canvas to set the origin anchor point.
          </p>
        </div>
      </div>
    </div>
  );
}

/** `BrushStore.loadState`, mirrored as a plain union so `ui/` never imports the store. */
export type PixelStudioBrushLoadState =
  "idle" | "loading" | "loaded" | "failed";

/**
 * What the Brush section names: the brush project the pixel-studio brush tool
 * will stamp, and the frame/layers it stamps (pixel-brush task 04). Supplied
 * by `PixelStudioPanelContainer` (task 06) from `BrushStore` / `BrushUIStore`.
 */
export interface PixelStudioBrushInfo {
  loadState: PixelStudioBrushLoadState;
  /** Filename stem of the loaded brush project, or null when none is loaded. */
  brushName: string | null;
  width: number | null;
  height: number | null;
  frameName: string | null;
  /** 0-based; null when no frame. */
  frameIndex: number | null;
  frameCount: number;
  layerCount: number;
  onOpenBrushStudio: () => void;
}

interface PixelStudioPanelProps {
  selectedTool: string;
  brushSize: number;
  eraserShape: "circle" | "square";
  /** `uiState.pencilBrushShape`; `undefined` falls back to "square". */
  pencilBrushShape: "circle" | "square" | undefined;
  /**
   * `uiState.pencilBrushMax`; `undefined` falls back to 16.
   *
   * ⚠️ Typed as the narrow union, not `number`. `ToolUIStore.setPencilBrushMax`
   * accepts only these five values and re-clamps `brushSize` against them, and
   * the panel's own `maxOptions` list is exactly this set. Widening to
   * `number` would let a caller pass a value the store rejects at compile time
   * elsewhere but not here.
   */
  pencilBrushMax: 8 | 16 | 32 | 64 | 128 | undefined;
  /**
   * The ERASER's own size and max — its counterparts to `brushSize` and
   * `pencilBrushMax` above (plan 09, task 09).
   *
   * ⚠️ ALREADY RESOLVED BY THE CONTAINER. Both are plain values, not the
   * store's tri-state fields: the container passes `effectiveEraserSize` and
   * `effectiveEraserMax`, which have already applied the `?? brushSize` /
   * `?? pencilBrushMax ?? 16` fallbacks. This component must not know that
   * the underlying fields can be absent — that is a wire-format concern, and
   * `ui/` may not import a store.
   */
  eraserBrushSize: number;
  eraserBrushMax: 8 | 16 | 32 | 64 | 128;
  originColor: Color;
  originPos: { x: number; y: number } | null;
  onBrushSizeChange: (size: number) => void;
  onEraserShapeChange: (shape: "circle" | "square") => void;
  onPencilBrushShapeChange: (shape: "circle" | "square") => void;
  onPencilBrushMaxChange: (max: 8 | 16 | 32 | 64 | 128) => void;
  onEraserBrushSizeChange: (size: number) => void;
  onEraserBrushMaxChange: (max: 8 | 16 | 32 | 64 | 128) => void;
  onOriginColorChange: (color: Color) => void;
  /** `ColorPickerContainer` element. */
  colorPicker: ReactNode;
  /** `PaletteManagerContainer` element. */
  paletteManager: ReactNode;
  /**
   * Hands the rail to the current tool's options in Other Hand Mode. Absent
   * on devices without the mode (anything but a tablet), and then no button
   * is drawn — see `OtherHandButton`.
   */
  onOtherHand?: () => void;
  /**
   * The Reflection tool's controls, shown only while that tool is selected
   * (reflection-tool task 06).
   *
   * ⚠️ OPTIONAL, and grouped into ONE prop rather than spread as five. Every
   * existing caller and story of this panel predates the reflection tool; a
   * required prop — or five — would break all of them at compile time for a
   * section they never render. When it is absent the section is simply not
   * drawn, even with `selectedTool === "reflection"`.
   */
  reflection?: ReflectionLinesSectionProps;
  /**
   * The Pose tool's controls, shown only while that tool is selected
   * (pose-tool task 07).
   *
   * ⚠️ OPTIONAL, and grouped into ONE prop rather than spread as twenty-one.
   * Same reasoning as `reflection?` above, and more forcefully: every existing
   * caller and story of this panel predates the pose tool, and the section has
   * eleven values and ten callbacks. Required props — or twenty-one — would
   * break all of them at compile time for a section they never render. When it
   * is absent the section is simply not drawn, even with
   * `selectedTool === "pose"`.
   */
  pose?: PoseSectionProps;
  /**
   * The Brush tool's rail section, shown only while that tool is selected
   * (pixel-brush task 04).
   *
   * ⚠️ OPTIONAL, and grouped into ONE prop rather than spread as nine. Same
   * reasoning as `reflection?` / `pose?` above: every existing caller of this
   * panel predates the brush tool, and a required prop would break all of
   * them at compile time for a section they never render. When it is absent
   * the section is simply not drawn, even with `selectedTool === "brush"`.
   */
  pixelBrush?: PixelStudioBrushInfo;
}

export function PixelStudioPanel({
  selectedTool,
  brushSize,
  eraserShape,
  pencilBrushShape,
  pencilBrushMax,
  eraserBrushSize,
  eraserBrushMax,
  originColor,
  originPos,
  onBrushSizeChange,
  onEraserShapeChange,
  onPencilBrushShapeChange,
  onPencilBrushMaxChange,
  onEraserBrushSizeChange,
  onEraserBrushMaxChange,
  onOriginColorChange,
  colorPicker,
  paletteManager,
  onOtherHand,
  reflection,
  pose,
  pixelBrush,
}: PixelStudioPanelProps) {
  const showEraserControls = selectedTool === "eraser";
  const showPencilControls = selectedTool === "pixel";
  const showOriginControls = selectedTool === "origin";
  const showReflectionControls = selectedTool === "reflection" && !!reflection;
  const showPoseControls = selectedTool === "pose" && !!pose;
  const showBrushControls = selectedTool === "brush" && !!pixelBrush;
  const maxOptions = [8, 16, 32, 64, 128] as const;

  return (
    <div className="pixel-studio-panel">
      {showOriginControls && (
        <OriginColorPicker
          color={originColor}
          originPos={originPos}
          onOriginColorChange={onOriginColorChange}
        />
      )}
      {showPencilControls && (
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Pencil</span>
            {onOtherHand ? (
              <OtherHandButton onClick={onOtherHand} sectionLabel="Pencil" />
            ) : null}
          </div>
          <div className="panel__body panel__body--dense">
            <div className="pixel-studio-panel__controls">
              <div className="pixel-studio-panel__size-control">
                <label>Size</label>
                <div className="pixel-studio-panel__size-input-group">
                  <input
                    type="range"
                    min="1"
                    max={pencilBrushMax ?? 16}
                    value={Math.min(brushSize, pencilBrushMax ?? 16)}
                    onChange={(e) =>
                      onBrushSizeChange(parseInt(e.target.value))
                    }
                  />
                  <span className="pixel-studio-panel__size-value">
                    {Math.min(brushSize, pencilBrushMax ?? 16)}
                  </span>
                </div>
              </div>

              <div className="pixel-studio-panel__max-control">
                <label>Max</label>
                <div className="pixel-studio-panel__shape-buttons">
                  {maxOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`pixel-studio-panel__shape-btn ${(pencilBrushMax ?? 16) === opt ? "pixel-studio-panel__shape-btn--active" : ""}`}
                      onClick={() => onPencilBrushMaxChange(opt)}
                      title={`Set max size to ${opt}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pixel-studio-panel__shape-control">
                <label>Shape</label>
                <div className="pixel-studio-panel__shape-buttons">
                  <button
                    className={`pixel-studio-panel__shape-btn ${(pencilBrushShape ?? "square") === "circle" ? "pixel-studio-panel__shape-btn--active" : ""}`}
                    onClick={() => onPencilBrushShapeChange("circle")}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`pixel-studio-panel__shape-btn ${(pencilBrushShape ?? "square") === "square" ? "pixel-studio-panel__shape-btn--active" : ""}`}
                    onClick={() => onPencilBrushShapeChange("square")}
                    title="Square"
                  >
                    ⬜
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showEraserControls && (
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Eraser</span>
            {onOtherHand ? (
              <OtherHandButton onClick={onOtherHand} sectionLabel="Eraser" />
            ) : null}
          </div>
          <div className="panel__body panel__body--dense">
            <div className="pixel-studio-panel__controls">
              {/* ⚠️ The eraser's OWN size and max, bounded by its OWN max —
                  it used to render `brushSize` bounded by `pencilBrushMax`,
                  which is the interlacing the user reported. The displayed
                  value is clamped exactly as the Pencil section clamps its
                  own, so the two sections are symmetric in form as well as in
                  the values they read. */}
              <div className="pixel-studio-panel__size-control">
                <label>Size</label>
                <div className="pixel-studio-panel__size-input-group">
                  <input
                    type="range"
                    min="1"
                    max={eraserBrushMax}
                    value={Math.min(eraserBrushSize, eraserBrushMax)}
                    onChange={(e) =>
                      onEraserBrushSizeChange(parseInt(e.target.value))
                    }
                  />
                  <span className="pixel-studio-panel__size-value">
                    {Math.min(eraserBrushSize, eraserBrushMax)}
                  </span>
                </div>
              </div>

              <div className="pixel-studio-panel__max-control">
                <label>Max</label>
                <div className="pixel-studio-panel__shape-buttons">
                  {maxOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`pixel-studio-panel__shape-btn ${eraserBrushMax === opt ? "pixel-studio-panel__shape-btn--active" : ""}`}
                      onClick={() => onEraserBrushMaxChange(opt)}
                      title={`Set max size to ${opt}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pixel-studio-panel__shape-control">
                <label>Shape</label>
                <div className="pixel-studio-panel__shape-buttons">
                  <button
                    className={`pixel-studio-panel__shape-btn ${eraserShape === "circle" ? "pixel-studio-panel__shape-btn--active" : ""}`}
                    onClick={() => onEraserShapeChange("circle")}
                    title="Circle"
                  >
                    ⭕
                  </button>
                  <button
                    className={`pixel-studio-panel__shape-btn ${eraserShape === "square" ? "pixel-studio-panel__shape-btn--active" : ""}`}
                    onClick={() => onEraserShapeChange("square")}
                    title="Square"
                  >
                    ⬜
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showReflectionControls && reflection ? (
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Reflection</span>
            {onOtherHand ? (
              <OtherHandButton
                onClick={onOtherHand}
                sectionLabel="Reflection"
              />
            ) : null}
          </div>
          <div className="panel__body panel__body--dense">
            <ReflectionLinesSection {...reflection} />
          </div>
        </div>
      ) : null}
      {showPoseControls && pose ? (
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Pose</span>
            {onOtherHand ? (
              <OtherHandButton onClick={onOtherHand} sectionLabel="Pose" />
            ) : null}
          </div>
          <div className="panel__body panel__body--dense">
            <PoseSection {...pose} />
          </div>
        </div>
      ) : null}
      {showBrushControls && pixelBrush ? (
        <div className="panel pixel-studio-panel__section">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Brush</span>
            {onOtherHand ? (
              <OtherHandButton onClick={onOtherHand} sectionLabel="Brush" />
            ) : null}
          </div>
          <div className="panel__body panel__body--dense">
            <div className="pixel-studio-panel__brush">
              {pixelBrush.loadState === "loaded" && pixelBrush.brushName ? (
                <dl className="pixel-studio-panel__brush-rows">
                  <div className="pixel-studio-panel__brush-row">
                    <dt className="pixel-studio-panel__brush-label">Project</dt>
                    <dd className="pixel-studio-panel__brush-value">
                      {pixelBrush.brushName}
                    </dd>
                  </div>
                  <div className="pixel-studio-panel__brush-row">
                    <dt className="pixel-studio-panel__brush-label">Size</dt>
                    <dd className="pixel-studio-panel__brush-value">
                      {pixelBrush.width ?? "?"} × {pixelBrush.height ?? "?"}
                    </dd>
                  </div>
                  <div className="pixel-studio-panel__brush-row">
                    <dt className="pixel-studio-panel__brush-label">Frame</dt>
                    <dd className="pixel-studio-panel__brush-value">
                      {pixelBrush.frameName ?? "—"}
                      {pixelBrush.frameIndex !== null
                        ? ` (${pixelBrush.frameIndex + 1}/${pixelBrush.frameCount})`
                        : ""}
                    </dd>
                  </div>
                  <div className="pixel-studio-panel__brush-row">
                    <dt className="pixel-studio-panel__brush-label">Layers</dt>
                    <dd className="pixel-studio-panel__brush-value">
                      {pixelBrush.layerCount}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="pixel-studio-panel__brush-status">
                  {pixelBrush.loadState === "loading"
                    ? "Loading brush projects…"
                    : pixelBrush.loadState === "failed"
                      ? "Could not load brush projects."
                      : "No brush project loaded. Create one in the Brush Studio."}
                </p>
              )}
              <Button
                variant="neutral"
                className="pixel-studio-panel__brush-open"
                onClick={pixelBrush.onOpenBrushStudio}
              >
                Open Brush Studio
              </Button>
              <p className="pixel-studio-panel__brush-hint">
                Stamps the current frame of the open brush project with the
                selected colour.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {colorPicker}
      {paletteManager}
    </div>
  );
}
