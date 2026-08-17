import type { Frame, Layer } from "@/types";
import { GRID, makeEmptyLayer, makeLayerStack } from "./layers";

/**
 * Frame builders.
 *
 * `tags` is optional on `Frame` and the serializer only emits it when non-empty
 * (`...(frame.tags?.length ? { tags: frame.tags } : {})`), so fixtures cover
 * both the tagged and untagged branch deliberately.
 */

export function makeFrame(
  id: string,
  name: string,
  layers: Layer[],
  tags?: string[],
): Frame {
  return tags && tags.length > 0
    ? { id, name, layers, tags }
    : { id, name, layers };
}

export const makeEmptyFrame = (
  id: string,
  name = "Frame",
  width = GRID,
  height = GRID,
): Frame =>
  makeFrame(id, name, [
    makeEmptyLayer(`${id}-layer-1`, "Layer 1", width, height),
  ]);

/** A frame with the standard 3-layer stack. */
export const makeStackedFrame = (
  id: string,
  name: string,
  tags?: string[],
): Frame => makeFrame(id, name, makeLayerStack(id), tags);

/**
 * The 4-frame sequence `projectTypical` uses. Frames 1 and 3 carry tags, frames
 * 2 and 4 do not — so any consumer of frame tags is exercised on both branches
 * by a single fixture.
 */
export function makeFrameSequence(objectId: string): Frame[] {
  return [
    makeStackedFrame(`${objectId}-frame-1`, "Idle", ["idle", "loop"]),
    makeStackedFrame(`${objectId}-frame-2`, "Walk A"),
    makeStackedFrame(`${objectId}-frame-3`, "Walk B", ["walk"]),
    makeStackedFrame(`${objectId}-frame-4`, "Walk C"),
  ];
}
