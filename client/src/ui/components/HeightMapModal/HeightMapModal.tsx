import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Layer, PixelObject } from "../../../types";
import type { CurrentVariant } from "../../../types";
import {
  computeHeightMap,
  isNormalAxis,
  type ColorChannel,
  type HeightChannel,
  type NormalAxis,
} from "../../../utils/normalCompute";
import { Icon } from "../../primitives/Icon/Icon";
import { Mountain, X } from "lucide-react";
import "./HeightMapModal.css";

export type ChannelType = HeightChannel;

const COLOR_CHANNELS: ColorChannel[] = ["R", "G", "B", "H", "S", "L"];
const NORMAL_AXES: NormalAxis[] = ["NX", "NY", "NZ"];

interface HeightMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolved computeds, from HeightMapModalContainer (REFRESH task 23). */
  layer: Layer | null;
  object: PixelObject | null;
  editingVariant: boolean;
  variantData: CurrentVariant | null;
  onConfirm: (params: {
    channel: ChannelType;
    min: number;
    max: number;
    applyToAllFrames: boolean;
  }) => void;
}

export function HeightMapModal({
  isOpen,
  onClose,
  onConfirm,
  layer,
  object: obj,
  editingVariant,
  variantData,
}: HeightMapModalProps) {
  const [channel, setChannel] = useState<ChannelType>("L");
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(255);
  const [applyToAllFrames, setApplyToAllFrames] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Determine target layer and dimensions
  let targetLayer = layer;
  let gridWidth = 0;
  let gridHeight = 0;

  if (editingVariant && variantData) {
    targetLayer = variantData.variantFrame.layers[0];
    gridWidth = variantData.variant.gridSize.width;
    gridHeight = variantData.variant.gridSize.height;
  } else if (obj && layer) {
    gridWidth = obj.gridSize.width;
    gridHeight = obj.gridSize.height;
  }

  // Render grayscale preview by running the SAME algorithm Apply runs
  // (`computeHeightMap`), so the preview is exactly the height data that
  // would be written. Untouched cells (no colour, or no normal for the N*
  // channels) render black.
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !targetLayer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = gridWidth;
    canvas.height = gridHeight;

    const writes = computeHeightMap(targetLayer, gridWidth, gridHeight, {
      channel,
      min,
      max,
    });

    const imageData = ctx.createImageData(gridWidth, gridHeight);
    for (let i = 3; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255; // opaque black everywhere the map is silent
    }
    for (const write of writes) {
      const idx = (write.y * gridWidth + write.x) * 4;
      imageData.data[idx] = write.height;
      imageData.data[idx + 1] = write.height;
      imageData.data[idx + 2] = write.height;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [isOpen, channel, min, max, targetLayer, gridWidth, gridHeight]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({ channel, min, max, applyToAllFrames });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="height-map-modal__backdrop" onClick={handleBackdropClick}>
      <div className="height-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="height-map-modal__header">
          <h3>
            <Icon icon={Mountain} size={16} /> Height Map Generator
          </h3>
          <button className="modal__close" onClick={onClose}>
            <Icon icon={X} size={14} />
          </button>
        </div>

        <div className="height-map-modal__content">
          {/* Preview Canvas */}
          <div className="height-map-modal__preview">
            <canvas
              ref={canvasRef}
              style={{
                imageRendering: "pixelated",
                width: "100%",
                height: "auto",
                maxWidth: "400px",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-sm)",
              }}
            />
          </div>

          {/* Channel Selection */}
          <div className="height-map-modal__control">
            <label className="height-map-modal__label">
              <span className="height-map-modal__label-text">Source</span>
            </label>
            <div className="height-map-modal__channel-group">
              <span className="height-map-modal__channel-group-label">
                Color
              </span>
              <div className="height-map-modal__channel-buttons">
                {COLOR_CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    className={`height-map-modal__channel-btn ${channel === ch ? "height-map-modal__channel-btn--active" : ""}`}
                    onClick={() => setChannel(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            <div className="height-map-modal__channel-group">
              <span className="height-map-modal__channel-group-label">
                Normal
              </span>
              <div className="height-map-modal__channel-buttons">
                {NORMAL_AXES.map((ch) => (
                  <button
                    key={ch}
                    className={`height-map-modal__channel-btn ${channel === ch ? "height-map-modal__channel-btn--active" : ""}`}
                    onClick={() => setChannel(ch)}
                  >
                    {ch.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="height-map-modal__description">
              {isNormalAxis(channel)
                ? channel === "NZ"
                  ? "Height comes from the normal map's Z axis — the more a normal points toward the screen, the higher the pixel. Pixels without normal data keep their current height."
                  : `Height comes from the normal map's ${channel.slice(1)} axis magnitude — the harder a normal leans along that axis, the higher the pixel. Pixels without normal data keep their current height.`
                : "Height comes from a color channel of the artwork. R, G, B are RGB channels; H, S, L are HSL channels."}
            </div>
          </div>

          {/* Min Slider */}
          <div className="height-map-modal__control">
            <label className="height-map-modal__label">
              <span className="height-map-modal__label-text">Min Value</span>
              <span className="height-map-modal__label-value">
                0x{min.toString(16).toUpperCase().padStart(2, "0")} ({min})
              </span>
            </label>
            <div className="height-map-modal__slider-group">
              <input
                type="range"
                min="0"
                max="255"
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
                className="height-map-modal__slider"
              />
            </div>
            <div className="height-map-modal__description">
              Minimum value for grayscale normalization. Can be greater than max
              to invert.
            </div>
          </div>

          {/* Max Slider */}
          <div className="height-map-modal__control">
            <label className="height-map-modal__label">
              <span className="height-map-modal__label-text">Max Value</span>
              <span className="height-map-modal__label-value">
                0x{max.toString(16).toUpperCase().padStart(2, "0")} ({max})
              </span>
            </label>
            <div className="height-map-modal__slider-group">
              <input
                type="range"
                min="0"
                max="255"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="height-map-modal__slider"
              />
            </div>
            <div className="height-map-modal__description">
              Maximum value for grayscale normalization. Can be less than min to
              invert.
            </div>
          </div>
        </div>

        <div className="height-map-modal__actions">
          <label
            className="height-map-modal__checkbox-label"
            title={
              editingVariant
                ? "Apply the same channel and range to every frame of this variant"
                : "Apply the same channel and range to every frame that contains this layer"
            }
          >
            <input
              type="checkbox"
              checked={applyToAllFrames}
              onChange={(e) => setApplyToAllFrames(e.target.checked)}
              className="height-map-modal__checkbox"
            />
            <span className="height-map-modal__checkbox-text">All frames</span>
          </label>
          <button
            className="height-map-modal__btn height-map-modal__btn--neutral"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="height-map-modal__btn height-map-modal__btn--primary"
            onClick={handleConfirm}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
