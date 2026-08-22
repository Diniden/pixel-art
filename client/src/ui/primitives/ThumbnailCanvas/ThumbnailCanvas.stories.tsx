import { useCallback, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThumbnailCanvas } from "./ThumbnailCanvas";
import { Button } from "../Button/Button";

const meta = {
  title: "Primitives/ThumbnailCanvas",
  component: ThumbnailCanvas,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "BEM block `thumb-canvas` (primitive-local; `image-rendering: " +
          "pixelated`). Replaces the 5 measured thumbnail-canvas sites, " +
          "including FramesView's 91-LINE memo comparator: the `revision` " +
          "prop replaces content deep-diffing — the caller states when " +
          "content changed, the memo ignores `draw` identity churn.",
      },
    },
  },
  args: {
    revision: 0,
    draw: () => {},
  },
  argTypes: {
    draw: { control: false },
    size: { control: { type: "number", min: 24, max: 128 } },
  },
} satisfies Meta<typeof ThumbnailCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Deterministic pseudo-random pixel sprite, seeded by `revision`. */
function drawSprite(ctx: CanvasRenderingContext2D, size: number, seed: number) {
  const cells = 8;
  const cell = size / cells;
  let state = seed * 2654435761 + 1;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const colors = ["#00d9ff", "#8b5cf6", "#10b981", "#ff3366"];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells / 2; x++) {
      if (rand() > 0.5) continue;
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)] ?? "#fff";
      // Mirror for a sprite-like silhouette.
      ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.fillRect((cells - 1 - x) * cell, y * cell, cell, cell);
    }
  }
}

function RevisionDemo() {
  const [revision, setRevision] = useState(1);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, size: number) =>
      drawSprite(ctx, size, revision),
    [revision],
  );
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <ThumbnailCanvas
        size={96}
        revision={revision}
        draw={draw}
        label="Sprite preview"
      />
      <Button variant="primary" onClick={() => setRevision((r) => r + 1)}>
        Edit a pixel (bump revision → {revision})
      </Button>
      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
        Manual check 7: the thumbnail repaints ONLY when revision changes.
      </span>
    </div>
  );
}

/** The `revision` contract in action — manual check 7. */
export const Playground: Story = {
  render: () => <RevisionDemo />,
};

/** The measured 48px house size next to larger variants. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
      {[48, 64, 96].map((size) => (
        <ThumbnailCanvas
          key={size}
          size={size}
          revision={7}
          draw={(ctx, s) => drawSprite(ctx, s, 7)}
          label={`${size}px thumbnail`}
        />
      ))}
    </div>
  ),
};
