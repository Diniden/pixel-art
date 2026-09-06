import { useState, useEffect, useRef, useCallback } from "react";
/**
 * ColorPicker — PURE (REFRESH task 36, W27).
 *
 * ⚠️ THE 300ms DEBOUNCE IS UNCHANGED, and must stay that way — the spec calls
 * it out explicitly because it drives UNDO HISTORY, not just rendering. The
 * whole timer, its `hasSavedInitialStateRef` latch and its cleanup live
 * entirely inside this component and touch no store directly; purification
 * only renamed the store CALLS they make into props
 * (`saveCurrentStateToHistory` → `onSaveStateToHistory`). Nothing about
 * *when* they fire moved.
 *
 * The store contract preserved verbatim:
 *   - `onSaveStateToHistory()` with NO label on drag START (the pre-image),
 *   - `onSaveStateToHistory("Adjust color")` 300ms after drag END,
 *   - `onAdjustColor(color, trackHistory)` while a colour ADJUSTMENT is
 *     active, `onSetColor(color)` otherwise.
 *
 * That "write on release, not on every mousemove" behaviour is manual check 3.
 *
 * ── Pointer events, not mouse events (plan 09 task 03, 2026-09-06) ─────────
 *
 * The SV square and the hue bar were the LAST interactive colour surfaces in
 * the app still bound to `onMouseDown/Move/Up/Leave`. On an iPad the Apple
 * Pencil never produced a `mousedown` until the browser had decided the touch
 * was not a scroll, so the picker needed a second tap and then dropped the
 * drag the moment it left the swatch. They now use the house pattern —
 * `onPointerDown/Move/Up/Cancel` + `setPointerCapture` — copied from
 * `OtherHand/ThumbSlider.tsx:60-82`.
 *
 * ⚠️ THE FIX IS TWO-PART AND BOTH HALVES ARE REQUIRED. The handlers here are
 * one half; `touch-action: none` on the canvases, the range inputs and the
 * picker root in `ColorPicker.css` is the other. With only the handlers,
 * iPadOS hands the first movement to the rail's scroll and the drag is never
 * delivered; with only the CSS, a mouse-event picker still cannot see a
 * Pencil press. Neither alone works on iOS.
 *
 * ⚠️ `setPointerCapture` is why there is NO `onMouseLeave`/`onPointerLeave`
 * drag-end handler any more. Capture routes every subsequent move to the
 * captured element even when the pointer is outside its bounds — that is the
 * point, and it is what makes "drag off the edge of the square and back"
 * keep tracking. A leave handler would kill exactly the drag capture exists
 * to preserve.
 *
 * The presses also `preventDefault()` and `stopPropagation()`, and the root
 * container absorbs `pointerdown` as well: a Pencil contact anywhere in the
 * picker must never fall through to the canvas beneath and draw.
 */
import { Color } from "../../../types";
// Task 36: the HSL ⇄ RGB maths was module-private here; it now lives in
// `ui/utils/colorMath.ts` (extracted verbatim — see that file's note on why
// `prevHsl` must not be "simplified" away).
import { hslToRgb, rgbToHsl } from "../../utils/colorMath";
// ⚠️ The fix for the 2026-08-31 HSL drift/stuck report — see the comment
// on `hsl` below, and the hook's own header for the measurements.
import { useHslMirror } from "../../hooks/useHslMirror";
import { OtherHandButton } from "../OtherHand/OtherHandButton";
import "./ColorPicker.css";

/** Which of the two global colour slots the picker is editing. */
export type ColorTarget = "edge" | "fill";

interface ColorPickerProps {
  /** The colour the picker reflects — whichever slot `target` names. */
  selectedColor: Color;
  /**
   * The slot being edited (2026-09-01). `"edge"` is `selectedColor` — pencil,
   * line, and a shape's outline; `"fill"` is `fillColor` — the bucket, the
   * gaussian fill, and a shape's interior.
   */
  target: ColorTarget;
  onTargetChange: (target: ColorTarget) => void;
  /** The OTHER slot's colour, for the swatch on the inactive tab. */
  edgeColor: Color;
  fillColor: Color;
  /** Recently used colours, newest first. */
  colorHistory: Color[];
  /** Truthy while a colour-adjustment session is active. */
  colorAdjustment: boolean;
  onSetColor: (color: Color) => void;
  onAdjustColor: (color: Color, trackHistory: boolean) => void;
  /** Label omitted on drag start, `"Adjust color"` on the debounced save. */
  onSaveStateToHistory: (label?: string) => void;
  /** Hands the rail to the colour sliders in Other Hand Mode (tablets only). */
  onOtherHand?: () => void;
}

export function ColorPicker({
  selectedColor,
  target,
  onTargetChange,
  edgeColor,
  fillColor,
  colorHistory,
  colorAdjustment,
  onSetColor,
  onAdjustColor,
  onSaveStateToHistory,
  onOtherHand,
}: ColorPickerProps) {
  const [localColor, setLocalColor] = useState<Color>({
    r: 0,
    g: 0,
    b: 0,
    a: 255,
  });
  /* ⚠️ HSL IS AUTHORITATIVE WHILE THE USER IS IN IT — see `useHslMirror`.
     DO NOT re-derive `hsl` from `selectedColor` or from `localColor`.

     Reported 2026-08-31: "I can slide an HSL metric back and forth and watch
     the other values in H and L drift or move around. Things get really weird
     if I zero out any of the values then it gets kind of stuck."

     That was a `useEffect([selectedColor])` here which recomputed HSL from
     RGB on EVERY store echo. Measured: dragging S at H=200 walked the hue
     200 → 199 → 198 → 196, because at low saturation the RGB cube cannot
     encode 360 distinct hues and each lossy echo fed the next. At S = 0 every
     triple is a grey, a grey has no hue, and the blue came back as red —
     unrecoverable, which is the "stuck".

     The mirror keeps HSL as the source of truth and RGB as its OUTPUT, and
     recognises the store's echo of its own colour so it never round-trips
     through it. Other Hand Mode has always used this hook, which is exactly
     why the owner reported those sliders "work great". */
  const [hsl, setHsl] = useHslMirror(selectedColor ?? localColor);
  /* Refs, not state: the drag flags are never rendered, so a `useState` here
     bought a re-render of the whole picker on every pointer move and nothing
     else. `ThumbSlider` uses a ref for the same reason. */
  const isDraggingSVRef = useRef(false);
  const isDraggingHueRef = useRef(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const historySaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSavedInitialStateRef = useRef<boolean>(false);

  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);

  // `localColor` mirrors the store's colour for the RGB/hex readouts. The HSL
  // half is NOT recomputed here — `useHslMirror` owns it, and re-deriving it
  // from this echo is precisely the drift described above.
  useEffect(() => {
    if (selectedColor) setLocalColor(selectedColor);
  }, [selectedColor]);

  // Draw the saturation/value gradient
  const drawSVCanvas = useCallback(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create the hue background
    const hueColor = hslToRgb(hsl.h, 100, 50);
    ctx.fillStyle = `rgb(${hueColor.r}, ${hueColor.g}, ${hueColor.b})`;
    ctx.fillRect(0, 0, width, height);

    // White gradient from left
    const whiteGradient = ctx.createLinearGradient(0, 0, width, 0);
    whiteGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    whiteGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = whiteGradient;
    ctx.fillRect(0, 0, width, height);

    // Black gradient from bottom
    const blackGradient = ctx.createLinearGradient(0, 0, 0, height);
    blackGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    blackGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = blackGradient;
    ctx.fillRect(0, 0, width, height);
  }, [hsl.h]);

  // Draw the hue strip
  const drawHueCanvas = useCallback(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    for (let i = 0; i <= 360; i += 60) {
      const rgb = hslToRgb(i, 100, 50);
      gradient.addColorStop(i / 360, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);

  useEffect(() => {
    drawSVCanvas();
  }, [drawSVCanvas]);

  useEffect(() => {
    drawHueCanvas();
  }, [drawHueCanvas]);

  // Use adjustColor when in color adjustment mode, otherwise use setColor
  const applyColor = (color: Color, trackHistory: boolean = false) => {
    if (colorAdjustment) {
      onAdjustColor(color, trackHistory);
    } else {
      onSetColor(color);
    }
  };

  // Save initial state to history when starting to drag
  const saveInitialStateToHistory = useCallback(() => {
    if (colorAdjustment && !hasSavedInitialStateRef.current) {
      // Save current state to history before making any changes
      onSaveStateToHistory();
      hasSavedInitialStateRef.current = true;
    }
  }, [colorAdjustment, onSaveStateToHistory]);

  // Debounced history save - saves final state to history after mouse release
  const saveFinalStateToHistory = useCallback(() => {
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
    }
    historySaveTimeoutRef.current = setTimeout(() => {
      if (colorAdjustment && hasSavedInitialStateRef.current) {
        // Save the final state to history
        // This ensures we can redo after undoing
        onSaveStateToHistory("Adjust color");
        hasSavedInitialStateRef.current = false;
        historySaveTimeoutRef.current = null;
      }
    }, 300); // 300ms debounce
  }, [colorAdjustment, onSaveStateToHistory]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (historySaveTimeoutRef.current) {
        clearTimeout(historySaveTimeoutRef.current);
      }
    };
  }, []);

  /* Handle a global release to save the final state if dragging.
     `pointerup` is listened for alongside `mouseup` (plan 09 task 03): a
     Pencil release on an `<input type="range">` fires `pointerup`, and the
     synthetic `mouseup` iPadOS may or may not follow it with is not something
     the 300 ms undo-grouping contract can depend on. Both are harmless
     together — the handler is idempotent once `isDraggingSlider` is false. */
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (
        isDraggingSlider &&
        colorAdjustment &&
        hasSavedInitialStateRef.current
      ) {
        setIsDraggingSlider(false);
        saveFinalStateToHistory();
      }
    };

    if (isDraggingSlider) {
      window.addEventListener("mouseup", handleGlobalPointerUp);
      window.addEventListener("pointerup", handleGlobalPointerUp);
      window.addEventListener("pointercancel", handleGlobalPointerUp);
      return () => {
        window.removeEventListener("mouseup", handleGlobalPointerUp);
        window.removeEventListener("pointerup", handleGlobalPointerUp);
        window.removeEventListener("pointercancel", handleGlobalPointerUp);
      };
    }
  }, [isDraggingSlider, colorAdjustment, localColor, saveFinalStateToHistory]);

  /* Handle a slider press — start tracking the drag.
     Bound to BOTH `onMouseDown` and `onPointerDown` on every range input
     (plan 09 task 03). The range input keeps its own native drag; all these
     do is open and close the one-entry-per-drag undo group, and a Pencil
     only ever produces the pointer half. Firing twice on a desktop mouse is
     harmless: the body is idempotent. */
  const handleSliderMouseDown = useCallback(() => {
    setIsDraggingSlider(true);
    hasSavedInitialStateRef.current = false;
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
      historySaveTimeoutRef.current = null;
    }
    // Save initial state to history before making changes
    saveInitialStateToHistory();
  }, [saveInitialStateToHistory]);

  // Handle slider mouse up - save final state with debounce
  const handleSliderMouseUp = useCallback(() => {
    setIsDraggingSlider(false);
    if (colorAdjustment && hasSavedInitialStateRef.current) {
      // Save final state to history with debounce
      saveFinalStateToHistory();
    }
  }, [colorAdjustment, localColor, saveFinalStateToHistory]);

  /* ── The undo-grouping contract, shared by both colour surfaces ──────────
     One drag = ONE history entry. `beginSurfaceDrag` saves the pre-image
     exactly once (the `hasSavedInitialStateRef` latch) and cancels any
     pending debounced save from a previous drag; `endSurfaceDrag` schedules
     the 300 ms debounced post-image. Identical to what the SV and hue
     `onMouseDown`/`onMouseUp` handlers each did inline before — factored out
     so the pointer rewrite could not drift the two copies apart. */
  const beginSurfaceDrag = useCallback(() => {
    setIsDraggingSlider(true);
    hasSavedInitialStateRef.current = false;
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
      historySaveTimeoutRef.current = null;
    }
    saveInitialStateToHistory();
  }, [saveInitialStateToHistory]);

  const endSurfaceDrag = useCallback(() => {
    setIsDraggingSlider(false);
    if (colorAdjustment && hasSavedInitialStateRef.current) {
      saveFinalStateToHistory();
    }
  }, [colorAdjustment, saveFinalStateToHistory]);

  /* The HSL the user asked for is used VERBATIM.

     ⚠️ The old `lastValidHsRef` dance that used to live here — restoring H and
     S from a remembered pair whenever L hit 0 or 100 — is GONE, and must not
     come back. It was a patch over the resync that no longer exists: because
     the mirror never re-derives HSL from RGB, H and S simply are not lost at
     the singularities any more, and there is nothing to restore. It also only
     ever covered L = 0/100, never S = 0, which is why zeroing saturation
     trapped the hue at red. */
  const updateColorFromHSL = (newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    // Only track history if not dragging a slider (for direct input changes)
    applyColor(newColor, !isDraggingSlider);
  };

  const updateColorFromRGB = (channel: keyof Color, value: number) => {
    const clamped = Math.max(0, Math.min(255, Math.floor(value)));
    const newColor = { ...localColor, [channel]: clamped };
    setLocalColor(newColor);
    // Only track history if not dragging a slider (for direct input changes)
    applyColor(newColor, !isDraggingSlider);
    if (channel !== "a") {
      // The user is editing RGB directly, so HSL follows it — with the current
      // HSL as `prevHsl` so black and white keep their hue. This direction is
      // not lossy in the same way: RGB is the input the user actually chose.
      setHsl(rgbToHsl(newColor.r, newColor.g, newColor.b, hsl));
    }
  };

  const handleSVCanvasInteraction = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Convert x,y to saturation and lightness
    // x = saturation (0 to 100)
    // y = value/brightness (100 to 0), which affects lightness
    const s = x * 100;
    const v = (1 - y) * 100;
    // Convert HSV to HSL
    const l = (v / 100) * (1 - s / 100 / 2);
    const sHSL = l === 0 || l === 1 ? 0 : (v / 100 - l) / Math.min(l, 1 - l);

    const lPercent = Math.round(l * 100);

    /* ⚠️ AT THE SQUARE'S TOP AND BOTTOM EDGES, SATURATION IS HELD.
       Hue already survives — it is never recomputed from RGB here, it is
       carried straight through from `hsl.h`.

       Saturation is different, and this is deliberate rather than an
       oversight: at L = 0 (the black edge) and L = 100 (the white edge) the
       HSV→HSL conversion above drives `sHSL` to 0 for EVERY x, so a drag along
       either edge would silently reset the saturation the user had, and the
       cursor would snap to the left of the square on the way back. Holding the
       current S across those two rows keeps the cursor where the finger is.

       This replaces a `lastValidHsRef` that remembered the last good H and S
       pair. The ref is gone: with `useHslMirror` owning HSL, `hsl` IS the last
       good value — nothing has overwritten it in between. */
    const atExtreme = lPercent === 0 || lPercent === 100;
    const finalHsl = {
      h: hsl.h,
      s: atExtreme ? hsl.s : Math.round(sHSL * 100),
      l: lPercent,
    };

    setHsl(finalHsl);
    const rgb = hslToRgb(finalHsl.h, finalHsl.s, finalHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    // Don't track history while dragging
    applyColor(newColor, false);
  };

  const handleHueCanvasInteraction = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newHue = Math.round(x * 360);

    const newHsl = { ...hsl, h: newHue };
    setHsl(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    // Don't track history while dragging
    applyColor(newColor, false);
  };

  /* ── The pointer handlers for the two colour surfaces ────────────────────
     Shape copied verbatim from `OtherHand/ThumbSlider.tsx:60-82`:
       down   → primary-button guard, absorb, capture, flag, act IMMEDIATELY
       move   → act while the flag is set (capture delivers moves outside the
                element, which is why there is no leave handler)
       end    → clear the flag, release the capture, close the undo group

     `preventDefault()` on the press stops the browser synthesising the
     mouse/scroll/selection gestures that were eating the Pencil's first
     contact; `stopPropagation()` stops that contact reaching the drawing
     canvas underneath. Acting on the press itself is what makes the colour
     change on contact rather than on a second tap. */
  const handleSVPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // The primary button only: a two-finger tap must not start a drag.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingSVRef.current = true;
    beginSurfaceDrag();
    handleSVCanvasInteraction(e);
  };

  const handleSVPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingSVRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    handleSVCanvasInteraction(e);
  };

  const handleSVPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingSVRef.current) return;
    isDraggingSVRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endSurfaceDrag();
  };

  const handleHuePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingHueRef.current = true;
    beginSurfaceDrag();
    handleHueCanvasInteraction(e);
  };

  const handleHuePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingHueRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    handleHueCanvasInteraction(e);
  };

  const handleHuePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingHueRef.current) return;
    isDraggingHueRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endSurfaceDrag();
  };

  const handleHexChange = (hex: string) => {
    const match = hex.match(
      /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i,
    );
    if (match) {
      const r = parseInt(match[1], 16);
      const g = parseInt(match[2], 16);
      const b = parseInt(match[3], 16);
      const a = match[4] ? parseInt(match[4], 16) : 255;
      const newColor = { r, g, b, a };
      setLocalColor(newColor);
      applyColor(newColor);
      setHsl(rgbToHsl(r, g, b, hsl));
    }
  };

  const getHexColor = (): string => {
    const r = localColor.r.toString(16).padStart(2, "0");
    const g = localColor.g.toString(16).padStart(2, "0");
    const b = localColor.b.toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  };

  const getDisplayColor = (): string => {
    return `rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, ${localColor.a / 255})`;
  };

  // Calculate SV picker position from current HSL
  const getSVPosition = () => {
    const l = hsl.l / 100;
    const s = hsl.s / 100;
    // Convert HSL back to HSV for positioning
    const v = l + s * Math.min(l, 1 - l);
    const sHSV = v === 0 ? 0 : 2 * (1 - l / v);
    return {
      x: sHSV * 100,
      y: (1 - v) * 100,
    };
  };

  const svPos = getSVPosition();

  const handleHistoryColorClick = (color: Color) => {
    setLocalColor(color);
    applyColor(color);
    setHsl(rgbToHsl(color.r, color.g, color.b, hsl));
  };

  /* The root absorbs the press so a Pencil contact ANYWHERE in the picker —
     the gaps between sliders, the section labels, the preview swatch — cannot
     bubble out to the drawing canvas beneath and paint a pixel. It only stops
     propagation; it does NOT `preventDefault`, because the buttons, the range
     inputs and the hex field all need their own default behaviour. */
  const handleRootPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <div className="panel color-picker" onPointerDown={handleRootPointerDown}>
      <div className="panel__header">
        <span className="panel__title">Color</span>
        {onOtherHand ? (
          <OtherHandButton onClick={onOtherHand} sectionLabel="Color" />
        ) : null}
      </div>
      <div className="panel__body">
        {/* ── Which slot is being edited ───────────────────────────────────
            Two GLOBAL colours, not a shape-tool option: the pencil and the
            line draw with the edge colour, the bucket and the gaussian fill
            use the fill colour, and a rectangle/ellipse in "both" mode uses
            each for the part it names. The swatch on each tab is that slot's
            current colour, so the pair is readable without switching. */}
        <div className="color-picker__targets" role="tablist">
          {(
            [
              ["edge", "Edge", edgeColor],
              ["fill", "Fill", fillColor],
            ] as const
          ).map(([id, label, swatch]) => (
            <button
              key={id}
              role="tab"
              aria-selected={target === id}
              className={`color-picker__target${
                target === id ? " color-picker__target--active" : ""
              }`}
              onClick={() => onTargetChange(id)}
            >
              <span
                className="color-picker__target-swatch"
                style={{
                  backgroundColor: `rgba(${swatch.r}, ${swatch.g}, ${swatch.b}, ${swatch.a / 255})`,
                }}
              />
              {label}
            </button>
          ))}
        </div>

        {/* Color History */}
        {colorHistory.length > 0 && (
          <div className="color-picker__history">
            {colorHistory.map((color, index) => (
              <button
                key={`${color.r}-${color.g}-${color.b}-${color.a}-${index}`}
                className="color-picker__history-swatch"
                style={{
                  backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`,
                }}
                onClick={() => handleHistoryColorClick(color)}
                title={`#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`}
              />
            ))}
          </div>
        )}

        {/* Rainbow picker area */}
        <div className="color-picker__area">
          <div className="color-picker__sv-picker">
            <canvas
              ref={svCanvasRef}
              width={180}
              height={120}
              className="color-picker__sv-canvas"
              onPointerDown={handleSVPointerDown}
              onPointerMove={handleSVPointerMove}
              onPointerUp={handleSVPointerEnd}
              onPointerCancel={handleSVPointerEnd}
            />
            <div
              className="color-picker__sv-handle"
              style={{ left: `${svPos.x}%`, top: `${svPos.y}%` }}
            />
          </div>

          <div className="color-picker__hue-picker">
            <canvas
              ref={hueCanvasRef}
              width={180}
              height={12}
              className="color-picker__hue-canvas"
              onPointerDown={handleHuePointerDown}
              onPointerMove={handleHuePointerMove}
              onPointerUp={handleHuePointerEnd}
              onPointerCancel={handleHuePointerEnd}
            />
            <div
              className="color-picker__hue-handle"
              style={{ left: `${(hsl.h / 360) * 100}%` }}
            />
          </div>
        </div>

        {/* Color preview and hex */}
        <div className="color-picker__preview-row">
          <div
            className="color-picker__preview"
            style={{ backgroundColor: getDisplayColor() }}
          >
            <div className="color-picker__transparency-grid"></div>
          </div>
          <input
            type="text"
            className="color-picker__hex-input"
            value={getHexColor()}
            onChange={(e) => handleHexChange(e.target.value)}
            placeholder="#000000"
          />
        </div>

        {/* HSL Sliders */}
        <div className="color-picker__section">
          <div className="color-picker__section-label">HSL</div>
          <div className="slider__row">
            <label className="slider__label color-picker__label--h">H</label>
            <input
              type="range"
              className="slider slider__hue"
              min="0"
              max="360"
              value={hsl.h}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onPointerDown={handleSliderMouseDown}
              onPointerUp={handleSliderMouseUp}
              onPointerCancel={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, h: parseInt(e.target.value) })
              }
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, h: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div className="slider__row">
            <label className="slider__label color-picker__label--s">S</label>
            <input
              type="range"
              className="slider color-picker__slider--sat"
              min="0"
              max="100"
              value={hsl.s}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onPointerDown={handleSliderMouseDown}
              onPointerUp={handleSliderMouseUp}
              onPointerCancel={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, s: parseInt(e.target.value) })
              }
              style={{
                background: `linear-gradient(to right,
                  hsl(${hsl.h}, 0%, ${hsl.l}%),
                  hsl(${hsl.h}, 100%, ${hsl.l}%))`,
              }}
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="100"
              value={hsl.s}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, s: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div className="slider__row">
            <label className="slider__label color-picker__label--l">L</label>
            <input
              type="range"
              className="slider color-picker__slider--light"
              min="0"
              max="100"
              value={hsl.l}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onPointerDown={handleSliderMouseDown}
              onPointerUp={handleSliderMouseUp}
              onPointerCancel={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, l: parseInt(e.target.value) })
              }
              style={{
                background: `linear-gradient(to right,
                  hsl(${hsl.h}, ${hsl.s}%, 0%),
                  hsl(${hsl.h}, ${hsl.s}%, 50%),
                  hsl(${hsl.h}, ${hsl.s}%, 100%))`,
              }}
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="100"
              value={hsl.l}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, l: parseInt(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        {/* RGB Sliders */}
        <div className="color-picker__section">
          <div className="color-picker__section-label">RGB</div>
          {(["r", "g", "b"] as const).map((channel) => (
            <div key={channel} className="slider__row">
              <label
                className={`slider__label color-picker__label--${channel}`}
              >
                {channel.toUpperCase()}
              </label>
              <input
                type="range"
                className={`slider color-picker__slider--${channel}`}
                min="0"
                max="255"
                value={localColor[channel]}
                onMouseDown={handleSliderMouseDown}
                onMouseUp={handleSliderMouseUp}
                onPointerDown={handleSliderMouseDown}
                onPointerUp={handleSliderMouseUp}
                onPointerCancel={handleSliderMouseUp}
                onChange={(e) =>
                  updateColorFromRGB(channel, parseInt(e.target.value))
                }
              />
              <input
                type="number"
                className="slider__input"
                min="0"
                max="255"
                value={localColor[channel]}
                onChange={(e) =>
                  updateColorFromRGB(channel, parseInt(e.target.value) || 0)
                }
              />
            </div>
          ))}
        </div>

        {/* Alpha Slider */}
        <div className="color-picker__section">
          <div className="slider__row">
            <label className="slider__label color-picker__label--a">A</label>
            <input
              type="range"
              className="slider color-picker__slider--alpha"
              min="0"
              max="255"
              value={localColor.a}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onPointerDown={handleSliderMouseDown}
              onPointerUp={handleSliderMouseUp}
              onPointerCancel={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromRGB("a", parseInt(e.target.value))
              }
              style={{
                background: `linear-gradient(to right,
                  rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, 0),
                  rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, 1))`,
              }}
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="255"
              value={localColor.a}
              onChange={(e) =>
                updateColorFromRGB("a", parseInt(e.target.value) || 0)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
