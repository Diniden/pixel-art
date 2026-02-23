import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  parsePixelProject,
  createObjectInstance,
  loadTextures,
} from "../../../lib/parse-pixel-project";
import type {
  ParsedProject,
  ObjectInstance,
  ExportedObject,
  ExportedVariantLayer,
  ExportedVariant,
} from "../../../lib/parse-pixel-project";
import "./ExportPreviewModal.css";

interface ExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kebab-cased project folder name, e.g. "base-unit" */
  kebabName: string;
}

/** Data loaded from the exported project. */
interface LoadedExport {
  project: ParsedProject;
  textures: Map<string, HTMLImageElement>;
}

/** Describes a variant layer used by an object, with its available variants. */
interface ObjectVariantInfo {
  layer: ExportedVariantLayer;
  /** The variant IDs actually used by this object (from selectedVariantId + variantOffsets). */
  usedVariantIds: Set<string>;
  /** The default-selected variant id for this object. */
  defaultVariantId: string | undefined;
}

/** Discover which variant layers & variants an object uses. */
function getObjectVariantInfos(
  obj: ExportedObject,
  project: ParsedProject,
): ObjectVariantInfo[] {
  const layerMap = new Map<
    string,
    { usedIds: Set<string>; defaultId: string | undefined }
  >();

  for (const frame of obj.frames) {
    for (const layer of frame.layers) {
      if (!layer.isVariant || !layer.variantLayerId) continue;

      let entry = layerMap.get(layer.variantLayerId);
      if (!entry) {
        entry = { usedIds: new Set(), defaultId: undefined };
        layerMap.set(layer.variantLayerId, entry);
      }

      if (layer.selectedVariantId) {
        entry.usedIds.add(layer.selectedVariantId);
        if (entry.defaultId === undefined)
          entry.defaultId = layer.selectedVariantId;
      }
      if (layer.variantOffsets) {
        for (const vid of Object.keys(layer.variantOffsets)) {
          entry.usedIds.add(vid);
        }
      }
    }
  }

  const result: ObjectVariantInfo[] = [];
  for (const [layerId, entry] of layerMap) {
    const vl = project.variantLayerById.get(layerId);
    if (!vl) continue;
    result.push({
      layer: vl,
      usedVariantIds: entry.usedIds,
      defaultVariantId: entry.defaultId,
    });
  }
  return result;
}

// ─── VariantThumbnail ─────────────────────────────────────────────────────────

const THUMB_SIZE = 44;

interface VariantThumbnailProps {
  variant: ExportedVariant;
  textures: Map<string, HTMLImageElement>;
  isSelected: boolean;
  onClick: () => void;
}

/** Renders a 44x44 thumbnail of the first frame of a variant. */
function VariantThumbnail({
  variant,
  textures,
  isSelected,
  onClick,
}: VariantThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width: vw, height: vh } = variant.gridSize;
    const scale = Math.min(THUMB_SIZE / vw, THUMB_SIZE / vh);
    const dw = Math.round(vw * scale);
    const dh = Math.round(vh * scale);
    const ox = Math.round((THUMB_SIZE - dw) / 2);
    const oy = Math.round((THUMB_SIZE - dh) / 2);

    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);

    // Draw first frame's layers
    const frame0 = variant.frames[0];
    if (frame0) {
      for (const vLayer of frame0.layers) {
        if (!vLayer.colorTexture) continue;
        const img = textures.get(vLayer.colorTexture);
        if (img) {
          ctx.drawImage(img, ox, oy, dw, dh);
        }
      }
    }
  }, [variant, textures]);

  return (
    <button
      className={`variant-thumb ${isSelected ? "variant-thumb-selected" : ""}`}
      onClick={onClick}
      title={variant.name}
    >
      <canvas ref={canvasRef} width={THUMB_SIZE} height={THUMB_SIZE} />
    </button>
  );
}

// ─── ObjectPreviewRow ─────────────────────────────────────────────────────────

interface ObjectPreviewRowProps {
  project: ParsedProject;
  textures: Map<string, HTMLImageElement>;
  obj: ExportedObject;
  fps: number;
}

function ObjectPreviewRow({
  project,
  textures,
  obj,
  fps,
}: ObjectPreviewRowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<ObjectInstance | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const [tick, setTick] = useState(0);
  // Track selected variant id per layer id so thumbnails highlight correctly
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});

  const variantInfos = useMemo(
    () => getObjectVariantInfos(obj, project),
    [obj, project],
  );

  // Create instance once
  useEffect(() => {
    const inst = createObjectInstance(project, obj.id);
    instanceRef.current = inst;
    // Initialize selectedVariants from defaults
    const defaults: Record<string, string> = {};
    for (const vi of variantInfos) {
      if (vi.defaultVariantId) defaults[vi.layer.id] = vi.defaultVariantId;
    }
    setSelectedVariants(defaults);
    setTick(0);
  }, [project, obj.id, variantInfos]);

  // Animation loop
  const animate = useCallback(
    (timestamp: number) => {
      const instance = instanceRef.current;
      if (!instance) return;

      const interval = 1000 / fps;
      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= interval) {
        instance.nextFrame();
        setTick((t) => t + 1);
        lastFrameTimeRef.current = timestamp - (elapsed % interval);
      }

      animationRef.current = requestAnimationFrame(animate);
    },
    [fps],
  );

  useEffect(() => {
    if (!instanceRef.current) return;
    lastFrameTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animate]);

  // Draw current frame to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const instance = instanceRef.current;
    if (!canvas || !instance) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width: gw, height: gh } = instance.gridSize;
    const maxDim = Math.max(gw, gh);
    const zoom = Math.max(1, Math.floor(160 / maxDim));
    const cw = gw * zoom;
    const ch = gh * zoom;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cw, ch);

    // Checkerboard
    const checkSize = Math.max(zoom, 4);
    for (let y = 0; y < ch; y += checkSize) {
      for (let x = 0; x < cw; x += checkSize) {
        const light = ((x / checkSize + y / checkSize) | 0) % 2 === 0;
        ctx.fillStyle = light ? "#2a2a3a" : "#222230";
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    const layers = instance.getRenderLayers();
    for (const rl of layers) {
      if (!rl.visible || !rl.colorTexture) continue;
      const img = textures.get(rl.colorTexture);
      if (!img) continue;
      ctx.drawImage(
        img,
        rl.x * zoom,
        rl.y * zoom,
        rl.width * zoom,
        rl.height * zoom,
      );
    }

    // Draw origin cross if the object has one
    const origin = instance.origin;
    if (origin) {
      const ox = origin.x * zoom;
      const oy = origin.y * zoom;
      const crossSize = 10; // Fixed screen-space size
      const lineWidth = 2;

      ctx.save();
      ctx.strokeStyle = "#ff3232";
      ctx.lineWidth = lineWidth;
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 2;

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(ox - crossSize, oy);
      ctx.lineTo(ox + crossSize, oy);
      ctx.stroke();

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(ox, oy - crossSize);
      ctx.lineTo(ox, oy + crossSize);
      ctx.stroke();

      // Small circle at center
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, textures]);

  const handleSelectVariant = useCallback(
    (layerId: string, variantId: string) => {
      const instance = instanceRef.current;
      if (!instance) return;
      instance.selectVariant(layerId, variantId);
      instance.reset();
      setSelectedVariants((prev) => ({ ...prev, [layerId]: variantId }));
      setTick(0);
      lastFrameTimeRef.current = performance.now();
    },
    [],
  );

  const instance = instanceRef.current;
  const frameCount = instance?.frameCount ?? 0;
  const currentFrame = instance?.frameIndex ?? 0;
  const gridSize = instance?.gridSize ?? { width: 0, height: 0 };

  return (
    <div className="export-object-row">
      {/* Left: animated canvas */}
      <div className="export-object-row-left">
        <div className="export-object-canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
        <div className="export-object-info">
          <span className="export-object-name" title={obj.name}>
            {obj.name}
          </span>
          <span className="export-object-meta">
            <span>
              {gridSize.width}x{gridSize.height}
            </span>
            <span>{frameCount} frames</span>
          </span>
          <span className="export-object-frame-counter">
            Frame {currentFrame + 1} / {frameCount}
          </span>
          {obj.origin && (
            <span className="export-object-origin">
              Origin: ({obj.origin.x}, {obj.origin.y})
            </span>
          )}
          {obj.maxCanvas && (
            <span className="export-object-max-canvas">
              MaxCanvas: {obj.maxCanvas.width}x{obj.maxCanvas.height} +(
              {obj.maxCanvas.offset.x}, {obj.maxCanvas.offset.y})
            </span>
          )}
        </div>
      </div>

      {/* Right: variant picker */}
      {variantInfos.length > 0 && (
        <div className="export-variant-panel">
          {variantInfos.map((vi) => (
            <div key={vi.layer.id} className="export-variant-row">
              <span className="export-variant-layer-name">{vi.layer.name}</span>
              <div className="export-variant-thumbs">
                {vi.layer.variants.map((v: ExportedVariant) => (
                  <VariantThumbnail
                    key={v.id}
                    variant={v}
                    textures={textures}
                    isSelected={selectedVariants[vi.layer.id] === v.id}
                    onClick={() => handleSelectVariant(vi.layer.id, v.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ExportPreviewModal ───────────────────────────────────────────────────────

export function ExportPreviewModal({
  isOpen,
  onClose,
  kebabName,
}: ExportPreviewModalProps) {
  const [loaded, setLoaded] = useState<LoadedExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(8);

  // Fetch & parse the exported project on open
  useEffect(() => {
    if (!isOpen) {
      setLoaded(null);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const basePath = `/exports/${kebabName}`;
        const res = await fetch(`${basePath}/frames.json`);
        if (!res.ok)
          throw new Error(`Failed to fetch frames.json (${res.status})`);
        const raw = await res.json();

        const projectData = parsePixelProject(raw);
        const tex = await loadTextures(projectData, basePath);

        if (!cancelled) {
          setLoaded({ project: projectData, textures: tex });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, kebabName]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const objects = loaded?.project.data.objects ?? [];
  const textureCount = loaded?.textures.size ?? 0;

  return createPortal(
    <div className="export-preview-overlay" onClick={onClose}>
      <div
        className="export-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="export-preview-header">
          <div className="export-preview-header-left">
            <h3 className="export-preview-title">Export Preview</h3>
            <span className="export-preview-subtitle">{kebabName}/</span>
          </div>
          <button className="export-preview-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Body */}
        {error ? (
          <div className="export-preview-error">
            <span className="export-preview-error-icon">!</span>
            <span className="export-preview-error-msg">{error}</span>
          </div>
        ) : !loaded ? (
          <div className="export-preview-loading">
            <div className="export-preview-spinner" />
            <span>Loading exported project...</span>
          </div>
        ) : (
          <div className="export-preview-content">
            <div className="export-preview-list">
              {objects.map((obj) => (
                <ObjectPreviewRow
                  key={obj.id}
                  project={loaded.project}
                  textures={loaded.textures}
                  obj={obj}
                  fps={fps}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer Controls */}
        {loaded && (
          <div className="export-preview-controls">
            <div className="export-preview-fps">
              <label className="export-preview-fps-label">FPS:</label>
              <input
                type="range"
                min="1"
                max="30"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="export-preview-fps-slider"
              />
              <input
                type="number"
                min="1"
                max="60"
                value={fps}
                onChange={(e) =>
                  setFps(Math.max(1, Math.min(60, Number(e.target.value) || 1)))
                }
                className="export-preview-fps-value"
              />
            </div>
            <div className="export-preview-stats">
              <span className="export-preview-stat">
                Objects:{" "}
                <span className="export-preview-stat-value">
                  {objects.length}
                </span>
              </span>
              <span className="export-preview-stat">
                Textures:{" "}
                <span className="export-preview-stat-value">
                  {textureCount}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
