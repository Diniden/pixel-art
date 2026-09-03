/**
 * PoseSection stories — the four states the task calls for.
 *
 * No store provider of any kind: the section takes plain values and callbacks,
 * and `__tests__/PoseSection.dom.test.tsx` mounts every story below with
 * nothing around it, which is what proves the `ui/` boundary holds.
 *
 * | Story         | What it exercises                                        |
 * | ------------- | -------------------------------------------------------- |
 * | NoMesh        | nothing loaded: the hint, no Clear, framing disabled,     |
 * |               | Fit disabled, and the OUTLINE OFF state (`edgeWidth` 0)  |
 * | Primitive     | a cube with a thin outline: framing still disabled        |
 * |               | (MASTER D4), Clear present, Fill slot being edited        |
 * | Mannequin     | framing ENABLED, a body region selected, a THICK outline  |
 * |               | (`edgeWidth` 4) and the EDGE slot being edited            |
 * | Orthographic  | the FOV slider disabled, an orthographic preset active,   |
 * |               | zoom well past the old `max={10}` cap                     |
 *
 * Between them the four cover the states pose-refinements task 03 asks for:
 * no mesh · a primitive with the outline off (NoMesh) and with a thin one
 * (Primitive) · a thick outline (Mannequin) · a mannequin part (Mannequin).
 *
 * The decorator reproduces the `.panel` card `PixelStudioPanel` wraps the
 * section in, at the rail's real width — the section is a rail resident and
 * looks wrong reviewed full-bleed. It also proves the two orbs, the colour
 * slots and the wrapping button rows fit 240px, which is the narrow-width
 * manual check.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PoseSection } from "./PoseSection";
import { POSE_VIEWPOINT_ROTATIONS } from "../../canvas/pose/poseCamera";

/** Every callback, stubbed. Spread into each story so none is forgotten. */
const handlers = {
  onSelectMesh: fn(),
  onSelectFraming: fn(),
  onSetRotation: fn(),
  onSetLightDirection: fn(),
  onSetLightColor: fn(),
  onEditModelColor: fn(),
  onEditEdgeColor: fn(),
  onSetEdgeWidth: fn(),
  onSetProjection: fn(),
  onSelectCameraPreset: fn(),
  onSetZoom: fn(),
  onSetFov: fn(),
  onRequestFit: fn(),
  onClear: fn(),
};

/**
 * `PoseUIStore`'s defaults, transcribed — the state on first open.
 *
 * ⚠️ `modelColor` and `edgeColor` are the APP's Fill and Edge slots, not pose
 * state (MASTER E8/E9). The container reads them from
 * `ui.tool.fillColorOrSelected` and `ui.tool.selectedColor`; the values here
 * are only plausible stand-ins. `edgeWidth` defaults to 0 — no outline — so
 * the tool behaves exactly as it did before the outline existed until the
 * owner asks for one.
 */
const defaults = {
  framing: "full" as const,
  rotation: { x: 0, y: 0, z: 0 },
  lightDirection: { x: -0.5, y: 0.7, z: 1 },
  lightColor: { r: 255, g: 255, b: 255, a: 255 },
  modelColor: { r: 160, g: 160, b: 160, a: 255 },
  edgeColor: { r: 32, g: 32, b: 48, a: 255 },
  colorTarget: "fill" as const,
  edgeWidth: 0,
  projection: "perspective" as const,
  cameraPreset: "2.5d" as const,
  zoom: 1,
  fov: 50,
};

const meta = {
  title: "Components/PoseSection",
  component: PoseSection,
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <div className="panel">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Pose</span>
          </div>
          <div className="panel__body panel__body--dense">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "BEM blocks `pose-panel` and `direction-orb`. The right-rail " +
          "section shown while the Pose tool is selected: mesh buttons, " +
          "mannequin framing regions, TWO instances of the same reusable " +
          "`DirectionOrb` (model rotation and light direction), the seven " +
          "viewpoint snaps, key-light tint presets, the app's **Fill** and " +
          "**Edge** colour slots as swatches (there is no native colour " +
          "input — clicking a swatch points the app's own picker at that " +
          "slot, MASTER E8/E9/E10), the outline width (0–4 px, 0 = off), and " +
          "the camera group (projection, five presets, an **uncapped** zoom, " +
          "FOV and **Fit to canvas**). Framing is disabled for primitives and " +
          "FOV is disabled in orthographic — disabled rather than hidden, so " +
          "the layout never jumps. Camera preset and viewpoint ANGLES are " +
          "imported from `ui/canvas/pose/poseCamera.ts`, never re-declared " +
          "here. Every story mounts with **no store provider**.",
      },
    },
  },
} satisfies Meta<typeof PoseSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoMesh: Story = {
  args: { ...defaults, ...handlers, meshId: null },
};

/** A primitive with a THIN outline, and the Fill slot being edited. */
export const Primitive: Story = {
  args: { ...defaults, ...handlers, meshId: "cube", edgeWidth: 1 },
};

/** A mannequin part, a THICK outline, and the Edge slot being edited. */
export const Mannequin: Story = {
  args: {
    ...defaults,
    ...handlers,
    meshId: "mannequin",
    framing: "head",
    rotation: POSE_VIEWPOINT_ROTATIONS["three-quarter"],
    edgeWidth: 4,
    colorTarget: "edge",
  },
};

export const Orthographic: Story = {
  args: {
    ...defaults,
    ...handlers,
    meshId: "sphere",
    projection: "orthographic",
    cameraPreset: "iso",
    /* Past the old `max={10}`, which task 03 deleted: the story is the
       regression pin for the owner's "the zoom caps out" complaint. */
    zoom: 18,
    edgeWidth: 2,
  },
};
