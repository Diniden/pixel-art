import type { Frame, PixelObject } from "@/types";
import { makeEmptyFrame, makeFrameSequence, makeStackedFrame } from "./frames";
import { GRID, makeLayerStack, makeVariantLayer } from "./layers";
import { VARIANT_A_ID, VARIANT_GROUP_ID } from "./variants";

/**
 * Object builders.
 *
 * `variantGroups` on `PixelObject` is DEPRECATED — variants live at project
 * level since 1.1.0, and `projectToCompact` no longer serializes the object-level
 * field at all. No builder here emits it; migration tests that need the
 * pre-1.1.0 shape should construct it inline so the deprecation stays visible at
 * the call site rather than hidden behind a helper.
 */

export function makeObject(
  id: string,
  name: string,
  frames: Frame[],
  origin?: { x: number; y: number },
): PixelObject {
  return {
    id,
    name,
    gridSize: { width: GRID, height: GRID },
    frames,
    ...(origin ? { origin } : {}),
  };
}

export const makeEmptyObject = (id: string, name = "Untitled"): PixelObject =>
  makeObject(id, name, [makeEmptyFrame(`${id}-frame-1`, "Frame 1")]);

/**
 * The first object in `projectTypical`: 4 frames, 3 layers each, an origin
 * anchor, and one variant layer wired to the project-level variant group.
 */
export function makeHeroObject(id = "obj-hero"): PixelObject {
  const frames = makeFrameSequence(id);
  // Attach a variant layer to frame 1 only, so both the "has a variant layer"
  // and "has none" branches are present within one object.
  frames[0] = {
    ...frames[0],
    layers: [
      ...frames[0].layers,
      makeVariantLayer(
        `${id}-frame-1-variant`,
        "Headwear",
        VARIANT_GROUP_ID,
        VARIANT_A_ID,
        { [VARIANT_A_ID]: { x: 1, y: -2 } },
      ),
    ],
  };
  return makeObject(id, "Hero", frames, { x: 8, y: 15 });
}

/** The second object in `projectTypical`: no origin, no variants, 2 frames. */
export function makePropObject(id = "obj-prop"): PixelObject {
  return makeObject(id, "Prop", [
    makeStackedFrame(`${id}-frame-1`, "Frame 1", ["prop"]),
    makeStackedFrame(`${id}-frame-2`, "Frame 2"),
  ]);
}

/**
 * An object with `frameCount` frames of `layerCount` layers each. The
 * `projectDense` building block — parameterised rather than literal, because
 * 12 x 8 hand-written layers would be unreadable and unmaintainable.
 */
export function makeBulkObject(
  id: string,
  name: string,
  frameCount: number,
  layerCount: number,
): PixelObject {
  const frames: Frame[] = Array.from({ length: frameCount }, (_f, fi) => {
    const frameId = `${id}-frame-${fi + 1}`;
    const layers = Array.from({ length: layerCount }, (_l, li) => {
      // Rebuild the stack per layer rather than spreading one shared stack:
      // a spread copies the `pixels` ARRAY REFERENCE, and every dense layer
      // would then alias the same grid. Painting into one would paint all 8.
      const base = makeLayerStack(frameId)[li % 3];
      return {
        ...base,
        id: `${frameId}-layer-${li + 1}`,
        name: `Layer ${li + 1}`,
      };
    });
    // Tag every third frame, so dense tag rendering is exercised too.
    return fi % 3 === 0
      ? { id: frameId, name: `Frame ${fi + 1}`, layers, tags: [`bulk-${fi}`] }
      : { id: frameId, name: `Frame ${fi + 1}`, layers };
  });
  return makeObject(id, name, frames);
}
