/**
 * PoseSection stories — the four states the task calls for.
 *
 * No store provider of any kind: the section takes plain values and callbacks,
 * and `__tests__/PoseSection.dom.test.tsx` mounts every story below with
 * nothing around it, which is what proves the `ui/` boundary holds.
 *
 * | Story         | What it exercises                                        |
 * | ------------- | -------------------------------------------------------- |
 * | NoMesh        | nothing loaded: the hint, no Clear, framing disabled      |
 * | Primitive     | a cube: framing still disabled (MASTER D4), Clear present |
 * | Mannequin     | framing ENABLED, a body region selected                   |
 * | Orthographic  | the FOV slider disabled, an orthographic preset active    |
 *
 * The decorator reproduces the `.panel` card `PixelStudioPanel` wraps the
 * section in, at the rail's real width — the section is a rail resident and
 * looks wrong reviewed full-bleed. It also proves the two orbs and the wrapping
 * button rows fit 240px, which is the narrow-width manual check.
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
  onSetModelColor: fn(),
  onSetProjection: fn(),
  onSelectCameraPreset: fn(),
  onSetZoom: fn(),
  onSetFov: fn(),
  onClear: fn(),
};

/** `PoseUIStore`'s defaults, transcribed — the state on first open. */
const defaults = {
  framing: "full" as const,
  rotation: { x: 0, y: 0, z: 0 },
  lightDirection: { x: -0.5, y: 0.7, z: 1 },
  lightColor: { r: 255, g: 255, b: 255, a: 255 },
  modelColor: { r: 160, g: 160, b: 160, a: 255 },
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
          "viewpoint snaps, light and model colours, and the camera group " +
          "(projection, five presets, zoom, FOV). Framing is disabled for " +
          "primitives and FOV is disabled in orthographic — disabled rather " +
          "than hidden, so the layout never jumps. Camera preset and " +
          "viewpoint ANGLES are imported from `ui/canvas/pose/poseCamera.ts`, " +
          "never re-declared here. Every story mounts with **no store " +
          "provider**.",
      },
    },
  },
} satisfies Meta<typeof PoseSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoMesh: Story = {
  args: { ...defaults, ...handlers, meshId: null },
};

export const Primitive: Story = {
  args: { ...defaults, ...handlers, meshId: "cube" },
};

export const Mannequin: Story = {
  args: {
    ...defaults,
    ...handlers,
    meshId: "mannequin",
    framing: "head",
    rotation: POSE_VIEWPOINT_ROTATIONS["three-quarter"],
  },
};

export const Orthographic: Story = {
  args: {
    ...defaults,
    ...handlers,
    meshId: "sphere",
    projection: "orthographic",
    cameraPreset: "iso",
    zoom: 2.5,
  },
};
