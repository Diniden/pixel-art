/**
 * OtherHandRailContainer — the rail while Other Hand Mode is on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE CONTAINER, EVERY SECTION — because a section is just a widget list
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LayoutUIStore.otherHandSection` names which section has the rail; this
 * container turns that section's store state into a list of `ThumbWidgetSpec`
 * and hands it to the pure `OtherHandSurface`. Three sections exist:
 *
 *   - `tool`  — the CURRENT tool's options. Which widgets appear follows
 *               `selectedTool` (and, in the lighting studio, the edit mode),
 *               so the pencil's "Size / Shape / Max" becomes the eraser's
 *               "Size / Shape" the moment the Pencil double-taps. Positions
 *               are stored per TOOL (`tool:pixel`, `tool:eraser`, …) so each
 *               tool keeps the arrangement its thumb learned;
 *   - `color` — the colour picker as three (HSL or RGB) or four (+alpha)
 *               vertical sliders;
 *   - `light` — the lighting studio's light direction sphere, light /
 *               ambient colours and scale.
 *
 * The tool widgets are planned in `otherHand/toolWidgets.ts`, the colour maths
 * and undo lifecycle live in `otherHand/colorSliders.ts`, and the section
 * keys in `otherHand/otherHandSections.ts`.
 */
import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { OtherHandSurface } from "../ui/components/OtherHand/OtherHandSurface";
import { ColorModelExtras } from "../ui/components/OtherHand/ColorModelExtras";
import { ColorPreview } from "../ui/components/OtherHand/ColorPreview";
import type { ThumbWidgetSpec } from "../ui/components/OtherHand/thumbWidgets";
import { hslToRgb } from "../ui/utils/colorMath";
import { useStores } from "../stores/context";
import type { Color } from "../types";
import { OTHER_HAND_SECTIONS } from "./otherHand/otherHandSections";
import { planToolSection } from "./otherHand/toolWidgets";
import {
  colorChannelSliders,
  useColorSliderHistory,
  useHslMirror,
} from "./otherHand/colorSliders";

const ToolSection = observer(function ToolSection() {
  const app = useStores();
  const layout = app.ui.layout;
  const { sectionKey, title, widgets } = planToolSection(app);
  const arrangement = layout.otherHandLayoutFor(sectionKey);

  return (
    <OtherHandSurface
      title={title}
      widgets={widgets}
      positions={arrangement.positions}
      onPositionChange={(id, pos) =>
        layout.setOtherHandWidgetPosition(sectionKey, id, pos)
      }
      onResetPositions={() => layout.resetOtherHandPositions(sectionKey)}
      onExit={() => layout.exitOtherHand()}
      emptyMessage={`${title} has no thumb controls. Pick another tool, or leave Other Hand Mode.`}
    />
  );
});

const ColorSection = observer(function ColorSection() {
  const app = useStores();
  const { ui } = app;
  const layout = ui.layout;
  const sectionKey = OTHER_HAND_SECTIONS.color;
  const arrangement = layout.otherHandLayoutFor(sectionKey);
  const model = arrangement.colorModel ?? "hsl";
  const includeAlpha = arrangement.includeAlpha ?? false;

  const color = ui.tool.selectedColor;
  const [hsl, setHsl] = useHslMirror(color);
  const colorAdjustment = Boolean(ui.tool.colorAdjustment);
  const saveStateToHistory = useCallback(
    (label?: string) => app.saveStateToHistory(label),
    [app],
  );
  const { onDragStart, onDragEnd, draggingRef } = useColorSliderHistory(
    colorAdjustment,
    saveStateToHistory,
  );

  // `ColorPicker.applyColor`, verbatim in intent: adjust while an adjustment
  // is live (history tracked only when NOT dragging), else set + history.
  const apply = (next: Color) => {
    if (colorAdjustment) app.adjustColor(next, !draggingRef.current);
    else app.setColorAndAddToHistory(next);
  };

  const widgets = colorChannelSliders({
    idPrefix: "",
    color,
    hsl,
    model,
    includeAlpha,
    onHsl: (next) => {
      setHsl(next);
      apply({ ...hslToRgb(next.h, next.s, next.l), a: color.a });
    },
    onRgb: apply,
    onDragStart,
    onDragEnd,
  });

  return (
    <OtherHandSurface
      title="Color"
      widgets={widgets}
      positions={arrangement.positions}
      onPositionChange={(id, pos) =>
        layout.setOtherHandWidgetPosition(sectionKey, id, pos)
      }
      onResetPositions={() => layout.resetOtherHandPositions(sectionKey)}
      onExit={() => layout.exitOtherHand()}
      extras={
        <>
          {/* The composed colour, at the top of the rail. `color` is the
              store's live selected colour — the same value `apply()` writes
              — so the square tracks the sliders through both the plain and
              the colour-ADJUSTMENT paths without re-deriving anything.
              Alpha is passed only when the section is showing an alpha
              slider; otherwise the preview would render the stored alpha of
              a colour the user cannot currently change. */}
          <ColorPreview
            colors={[
              {
                r: color.r,
                g: color.g,
                b: color.b,
                a: includeAlpha ? color.a : 255,
              },
            ]}
          />
          <ColorModelExtras
            model={model}
            onModel={(m) => layout.setOtherHandColorModel(sectionKey, m)}
            includeAlpha={includeAlpha}
            onIncludeAlpha={(on) =>
              layout.setOtherHandIncludeAlpha(sectionKey, on)
            }
          />
        </>
      }
    />
  );
});

const LightSection = observer(function LightSection() {
  const { ui, lightingUI } = useStores();
  const layout = ui.layout;
  const sectionKey = OTHER_HAND_SECTIONS.light;
  const arrangement = layout.otherHandLayoutFor(sectionKey);
  const model = arrangement.colorModel ?? "hsl";

  const [lightHsl, setLightHsl] = useHslMirror(lightingUI.lightColor);
  const [ambientHsl, setAmbientHsl] = useHslMirror(lightingUI.ambientColor);

  const widgets: ThumbWidgetSpec[] = [
    {
      // `lightDirection`, NOT `selectedNormal` — see `NormalPickerContainer`.
      kind: "normal",
      id: "direction",
      label: "Direction",
      normal: lightingUI.lightDirection,
      onChange: (n) => lightingUI.setLightDirection(n),
      isLightDirection: true,
    },
    ...colorChannelSliders({
      idPrefix: "light-",
      labelPrefix: "Light ",
      color: lightingUI.lightColor,
      hsl: lightHsl,
      model,
      includeAlpha: false,
      onHsl: (next) => {
        setLightHsl(next);
        lightingUI.setLightColor({
          ...hslToRgb(next.h, next.s, next.l),
          a: 255,
        });
      },
      onRgb: (c) => lightingUI.setLightColor(c),
    }),
    ...colorChannelSliders({
      idPrefix: "ambient-",
      labelPrefix: "Amb ",
      color: lightingUI.ambientColor,
      hsl: ambientHsl,
      model,
      includeAlpha: false,
      onHsl: (next) => {
        setAmbientHsl(next);
        lightingUI.setAmbientColor({
          ...hslToRgb(next.h, next.s, next.l),
          a: 255,
        });
      },
      onRgb: (c) => lightingUI.setAmbientColor(c),
    }),
    {
      kind: "slider",
      id: "scale",
      label: "Scale",
      value: lightingUI.heightScale,
      min: 1,
      max: 500,
      onChange: (v) => lightingUI.setHeightScale(v),
    },
  ];

  return (
    <OtherHandSurface
      title="Light Settings"
      widgets={widgets}
      positions={arrangement.positions}
      onPositionChange={(id, pos) =>
        layout.setOtherHandWidgetPosition(sectionKey, id, pos)
      }
      onResetPositions={() => layout.resetOtherHandPositions(sectionKey)}
      onExit={() => layout.exitOtherHand()}
      extras={
        <>
          {/* TWO squares here, labelled: this section's sliders drive the
              light colour AND the ambient colour, and an unlabelled pair
              would be a guess. Order matches the sliders below. Neither
              colour carries a meaningful alpha (both are set with a: 255),
              so both previews are opaque. */}
          <ColorPreview
            colors={[
              {
                r: lightingUI.lightColor.r,
                g: lightingUI.lightColor.g,
                b: lightingUI.lightColor.b,
                label: "Light",
              },
              {
                r: lightingUI.ambientColor.r,
                g: lightingUI.ambientColor.g,
                b: lightingUI.ambientColor.b,
                label: "Amb",
              },
            ]}
          />
          <ColorModelExtras
            model={model}
            onModel={(m) => layout.setOtherHandColorModel(sectionKey, m)}
          />
        </>
      }
    />
  );
});

export const OtherHandRailContainer = observer(
  function OtherHandRailContainer() {
    const { ui } = useStores();
    switch (ui.layout.otherHandSection) {
      case OTHER_HAND_SECTIONS.color:
        return <ColorSection />;
      case OTHER_HAND_SECTIONS.light:
        return <LightSection />;
      case OTHER_HAND_SECTIONS.tool:
        return <ToolSection />;
      default:
        return null;
    }
  },
);
