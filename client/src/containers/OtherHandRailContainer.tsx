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
 *   - `color` — an Edge/Fill slot chooser, a Swap action, and the colour
 *               picker as three (HSL or RGB) or four (+alpha) vertical
 *               sliders. Every write goes through `app.setActiveColor`, so
 *               the rail honours the slot the same way the main picker does;
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

  /* ── The rail edits whichever slot the target names (plan 09 task 07) ────
     Read `app.activeColor`, not `ui.tool.selectedColor`: this section used to
     be edge-only, so a thumb slider dragged with the Fill tab open silently
     recoloured the pencil. `activeColor` / `setActiveColor` are the SINGLE
     branch point task 05 added; the rail must not re-derive the branch, or
     the two colour surfaces drift apart. */
  const colorTarget = ui.tool.colorTarget;
  const color = app.activeColor;
  const [hsl, setHsl] = useHslMirror(color);
  /* Colour ADJUSTMENT is an edge-slot operation only — the same reasoning as
     `ColorPickerContainer.tsx:121-130`: there is no "adjust every pixel of
     the fill colour" concept, and running it while the fill target is active
     would recolour artwork the user is not looking at. On the fill target the
     rail just sets the slot. */
  const colorAdjustment =
    colorTarget === "edge" && Boolean(ui.tool.colorAdjustment);
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
  // `setActiveColor` carries the edge/fill branch AND the history asymmetry.
  const apply = (next: Color) => {
    if (colorAdjustment) app.adjustColor(next, !draggingRef.current);
    else app.setActiveColor(next);
  };

  const widgets: ThumbWidgetSpec[] = [
    /* Edge/Fill, as the same `buttons` stack the selection tool's Mode group
       uses (`toolWidgets.ts:317-341`) — a choice is an N-button stack with
       one active. Thumb-reachable and draggable like every other widget. */
    {
      kind: "buttons",
      id: "target",
      label: "Slot",
      buttons: (
        [
          ["edge", "Edge"],
          ["fill", "Fill"],
        ] as ["edge" | "fill", string][]
      ).map(([target, label]) => ({
        id: target,
        label,
        title: `Edit the ${target} color`,
        active: colorTarget === target,
        onClick: () => ui.tool.setColorTarget(target),
      })),
    },
    /* One undo step, not two: `swapEdgeAndFillColors` snapshots BEFORE it
       mutates. Do not bracket it with another `saveStateToHistory`. */
    {
      kind: "buttons",
      id: "swap",
      label: "Colors",
      buttons: [
        {
          // No `active`: this is an ACTION, not a toggle or a choice — see
          // `thumbWidgets.ts`'s note on the three shapes one stack serves.
          id: "swap",
          label: "Swap",
          title: "Swap edge and fill colors",
          onClick: () => app.swapEdgeAndFillColors(),
        },
      ],
    },
    ...colorChannelSliders({
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
    }),
  ];

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
