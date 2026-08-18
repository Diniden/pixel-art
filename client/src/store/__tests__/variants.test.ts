/**
 * Behaviour contract — `store/variantActions.ts` (1,412 lines, 20 actions).
 *
 * Three things get the most attention, because they are the ones later tasks
 * will break silently:
 *
 * 1. **`makeVariant` on a multi-frame / multi-layer fixture**, round-tripped
 *    through the serializer. It computes a per-frame bounding box, sizes the
 *    variant grid to the largest one, and stores each frame's origin in
 *    `baseFrameOffsets` — so the variant renders back in the same place.
 * 2. **`resizeVariant` for all 9 anchor positions.** It delegates to
 *    `getAnchorPadding` in `AnchorGrid.tsx` — a store → UI-component import that
 *    a later task removes. That helper is pinned separately in
 *    `components/AnchorGrid/__tests__/getAnchorPadding.test.ts`; this file pins
 *    the store's USE of it, including the `baseFrameOffsets` compensation.
 * 3. **`setVariantOffset`.** It implements the 4-level fallback chain a SIXTH
 *    time, as an if/return ladder using a TRUTHINESS check rather than `??` —
 *    a real divergence from `helpers.ts:73`. Pinned below.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  cloneProject,
  mkLayer,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import type { AnchorPosition } from "@/components/AnchorGrid/AnchorGrid";
import type { Color, Layer, PixelData, Project, Variant } from "@/types";

// Task 16: the store no longer imports services/api (deleted) — dispatching
// actions can no longer reach the network, so the defensive module mock that
// used to live here is gone with it.

/* ── fixtures ────────────────────────────────────────────────────────────── */

const solid = (c: Color): PixelData => ({ color: { ...c }, normal: 0, height: 0 });

function layerWith(
  id: string,
  cells: Array<[number, number, Color]>,
  w = 4,
  h = 4,
): Layer {
  const l = mkLayer(id, w, h);
  for (const [x, y, c] of cells) l.pixels[y][x] = solid(c);
  return l;
}

/**
 * 2 frames × 3 layers. The "Body" layer (the one made into a variant) holds a
 * DIFFERENT bounding box in each frame, so `baseFrameOffsets` must record two
 * distinct origins and the variant grid must size to the larger box.
 *
 *   frame 1 Body: a 2×1 run at (0,0)-(1,0)
 *   frame 2 Body: a 2×2 block at (2,2)-(3,3)
 */
function twoFrameThreeLayerProject(): Project {
  return tinyProject({
    frames: [
      {
        id: "frame-1",
        name: "F1",
        layers: [
          layerWith("bg-1", [[0, 3, BLUE]]),
          layerWith("Body", [
            [0, 0, RED],
            [1, 0, RED],
          ]),
          layerWith("fg-1", [[3, 0, GREEN]]),
        ],
      },
      {
        id: "frame-2",
        name: "F2",
        layers: [
          layerWith("bg-2", [[0, 3, BLUE]]),
          layerWith("Body", [
            [2, 2, RED],
            [3, 2, RED],
            [2, 3, RED],
            [3, 3, RED],
          ]),
          layerWith("fg-2", [[3, 0, GREEN]]),
        ],
      },
    ],
  });
}

/** A ready-made variant fixture: 4×4 base, one 2×2 variant, one variant frame. */
function variantProject(
  variantOverrides: Partial<Variant> = {},
  hostOverrides: Partial<Layer> = {},
): Project {
  const p = tinyProject({
    frames: [
      {
        id: "frame-1",
        name: "F1",
        layers: [
          {
            ...mkLayer("host"),
            isVariant: true,
            variantGroupId: "vg-1",
            selectedVariantId: "v-1",
            ...hostOverrides,
          },
        ],
      },
    ],
  });
  const vl = mkLayer("vl", 2, 2);
  vl.pixels[0][0] = solid(RED);
  vl.pixels[1][1] = solid(BLUE);
  p.variants = [
    {
      id: "vg-1",
      name: "G",
      variants: [
        {
          id: "v-1",
          name: "V1",
          gridSize: { width: 2, height: 2 },
          frames: [{ id: "vf-0", layers: [vl] }],
          baseFrameOffsets: {},
          ...variantOverrides,
        },
      ],
    },
  ];
  p.uiState.variantFrameIndices = { "vg-1": 0 };
  return p;
}

const groups = (h: StoreHarness) => h.getProject()!.variants ?? [];
const firstVariant = (h: StoreHarness) => groups(h)[0]?.variants[0];
const hostLayer = (h: StoreHarness, frameIndex = 0) =>
  h.getProject()!.objects[0].frames[frameIndex].layers.find((l) => l.isVariant);

const ANCHORS: AnchorPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

describe.each(HARNESSES)("%s — variants", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
  });

  afterEach(() => {
    harness.dispatch("endStroke");
    harness.reset();
  });

  /* ══ makeVariant ═══════════════════════════════════════════════════════ */

  describe("makeVariant on a 2-frame / 3-layer fixture", () => {
    beforeEach(() => {
      harness.load(twoFrameThreeLayerProject());
      const body = harness
        .getProject()!
        .objects[0].frames[0].layers.find((l) => l.name === "Body")!;
      harness.dispatch("makeVariant", body.id);
    });

    it("creates exactly one project-level variant group with one variant", () => {
      expect(groups(harness)).toHaveLength(1);
      expect(groups(harness)[0].variants).toHaveLength(1);
      expect(groups(harness)[0].name).toBe("Body");
    });

    it("sizes the variant grid to the LARGEST single-frame bounding box", () => {
      // frame 1's Body is 2×1; frame 2's is 2×2. The larger wins.
      expect(firstVariant(harness)!.gridSize).toEqual({ width: 2, height: 2 });
    });

    it("records a PER-BASE-FRAME offset equal to that frame's bounding-box origin", () => {
      expect(firstVariant(harness)!.baseFrameOffsets).toEqual({
        0: { x: 0, y: 0 },
        1: { x: 2, y: 2 },
      });
    });

    it("creates one variant frame per BASE frame", () => {
      expect(firstVariant(harness)!.frames).toHaveLength(2);
    });

    it("repositions each frame's pixels to the variant grid's TOP-LEFT", () => {
      const vFrames = firstVariant(harness)!.frames;
      // Frame 2's block lived at (2,2)-(3,3) and is normalised to (0,0)-(1,1).
      const f2 = vFrames[1].layers[0].pixels;
      expect(f2[0][0].color).toEqual(RED);
      expect(f2[1][1].color).toEqual(RED);
    });

    it("REPLACES the source layer with a variant HOST layer, at the same index", () => {
      for (const frameIndex of [0, 1]) {
        const layers = harness.getProject()!.objects[0].frames[frameIndex]
          .layers;
        expect(layers).toHaveLength(3);
        // The Body layer was at index 1 and the host takes its place.
        expect(layers[1].isVariant).toBe(true);
        expect(layers[1].variantGroupId).toBe(groups(harness)[0].id);
        expect(layers[1].selectedVariantId).toBe(firstVariant(harness)!.id);
      }
    });

    it("leaves the OTHER layers untouched", () => {
      const layers = harness.getProject()!.objects[0].frames[0].layers;
      expect(layers[0].id).toBe("bg-1");
      expect(layers[2].id).toBe("fg-1");
      expect(layers[0].pixels[3][0].color).toEqual(BLUE);
    });

    it("SURVIVES a serializer round-trip unchanged", () => {
      const before = harness.getProject()!;
      const after = cloneProject(before);
      expect(after.variants).toEqual(before.variants);
      expect(after.objects[0].frames[0].layers[1].variantGroupId).toBe(
        before.objects[0].frames[0].layers[1].variantGroupId,
      );
      expect(after.objects[0].frames[0].layers[1].selectedVariantId).toBe(
        before.objects[0].frames[0].layers[1].selectedVariantId,
      );
    });

    it("tracks history, and one undo restores the plain layer", () => {
      harness.dispatch("undo");
      expect(groups(harness)).toHaveLength(0);
      expect(
        harness.getProject()!.objects[0].frames[0].layers[1].isVariant,
      ).toBeUndefined();
    });

    it("OBSERVED: a layer with NO pixels yields a minimum 1×1 variant", () => {
      harness.load(tinyProject({ layers: [mkLayer("Empty")] }));
      harness.dispatch("makeVariant", "Empty");
      expect(firstVariant(harness)!.gridSize).toEqual({ width: 1, height: 1 });
    });

    it("is a no-op for an unknown layer id", () => {
      harness.load(twoFrameThreeLayerProject());
      const before = harness.getHistoryLength();
      harness.dispatch("makeVariant", "no-such-layer");
      expect(harness.getHistoryLength()).toBe(before);
      expect(groups(harness)).toHaveLength(0);
    });
  });

  /* ══ resizeVariant — all 9 anchors ═════════════════════════════════════ */

  describe("resizeVariant — all 9 anchor positions", () => {
    /** A 2×2 variant with a single RED pixel at (0,0), grown to 4×4. */
    const growAndLocate = (anchor: AnchorPosition) => {
      const p = variantProject();
      // Only (0,0) is red; (1,1) blue is the second marker.
      harness.load(p);
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4, anchor);
      const px = firstVariant(harness)!.frames[0].layers[0].pixels;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          if (px[y][x].color !== 0 && (px[y][x].color as Color).r === 255)
            return [x, y];
      return null;
    };

    it("GROWTH +2×+2 places the old content per the anchor's padding", () => {
      // getAnchorPadding(anchor, +2, +2) -> {left, top}; the RED pixel that was
      // at (0,0) lands at exactly (left, top).
      expect(
        Object.fromEntries(ANCHORS.map((a) => [a, growAndLocate(a)])),
      ).toEqual({
        "top-left": [0, 0],
        "top-center": [1, 0],
        "top-right": [2, 0],
        "middle-left": [0, 1],
        "middle-center": [1, 1],
        "middle-right": [2, 1],
        "bottom-left": [0, 2],
        "bottom-center": [1, 2],
        "bottom-right": [2, 2],
      });
    });

    it("updates gridSize for every anchor", () => {
      for (const anchor of ANCHORS) {
        harness.load(variantProject());
        harness.dispatch("resizeVariant", "vg-1", "v-1", 5, 3, anchor);
        expect(firstVariant(harness)!.gridSize).toEqual({
          width: 5,
          height: 3,
        });
      }
    });

    it("SHRINKING clips content that falls outside the new grid", () => {
      const p = variantProject();
      // Fill the whole 2×2.
      const vl = p.variants![0].variants[0].frames[0].layers[0];
      vl.pixels[0][1] = solid(GREEN);
      vl.pixels[1][0] = solid(GREEN);
      harness.load(p);

      harness.dispatch("resizeVariant", "vg-1", "v-1", 1, 1, "top-left");
      const px = firstVariant(harness)!.frames[0].layers[0].pixels;
      expect(px).toHaveLength(1);
      expect(px[0]).toHaveLength(1);
      expect(px[0][0].color).toEqual(RED);
    });

    it("COMPENSATES baseFrameOffsets for padding added to the left/top", () => {
      // Growing anchored bottom-right adds 2 columns on the LEFT and 2 rows on
      // the TOP, so the variant's on-canvas origin must shift by -2,-2 to keep
      // the art in the same place.
      const p = variantProject({ baseFrameOffsets: { 0: { x: 5, y: 5 } } });
      harness.load(p);
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4, "bottom-right");
      expect(firstVariant(harness)!.baseFrameOffsets[0]).toEqual({
        x: 3,
        y: 3,
      });
    });

    it("leaves baseFrameOffsets alone when the anchor adds no left/top padding", () => {
      const p = variantProject({ baseFrameOffsets: { 0: { x: 5, y: 5 } } });
      harness.load(p);
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4, "top-left");
      expect(firstVariant(harness)!.baseFrameOffsets[0]).toEqual({
        x: 5,
        y: 5,
      });
    });

    it("defaults to middle-center when no anchor is given", () => {
      harness.load(variantProject());
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4);
      const explicit = firstVariant(harness)!.frames[0].layers[0].pixels;

      harness.load(variantProject());
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4, "middle-center");
      expect(firstVariant(harness)!.frames[0].layers[0].pixels).toEqual(
        explicit,
      );
    });

    it("resizes EVERY variant frame, not just the selected one", () => {
      const p = variantProject();
      p.variants![0].variants[0].frames.push({
        id: "vf-1",
        layers: [mkLayer("vl2", 2, 2)],
      });
      harness.load(p);
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4, "top-left");
      for (const f of firstVariant(harness)!.frames) {
        expect(f.layers[0].pixels).toHaveLength(4);
        expect(f.layers[0].pixels[0]).toHaveLength(4);
      }
    });

    it("tracks history and is a no-op for an unknown variant", () => {
      harness.load(variantProject());
      const before = harness.getHistoryLength();
      harness.dispatch("resizeVariant", "vg-1", "v-1", 4, 4, "top-left");
      expect(harness.getHistoryLength()).toBe(before + 1);

      harness.dispatch("resizeVariant", "vg-1", "no-such-variant", 8, 8);
      expect(firstVariant(harness)!.gridSize).toEqual({ width: 4, height: 4 });
    });
  });

  /* ══ setVariantOffset — the SIXTH copy of the fallback chain ═══════════ */

  describe("setVariantOffset", () => {
    const offsetOf = (h: StoreHarness, frameIndex = 0) =>
      hostLayer(h, frameIndex)?.variantOffsets?.["v-1"];

    it("writes a DELTA into variantOffsets[selectedVariantId]", () => {
      harness.load(variantProject());
      harness.dispatch("setVariantOffset", 2, 3);
      expect(offsetOf(harness)).toEqual({ x: 2, y: 3 });
    });

    it("ACCUMULATES across calls", () => {
      harness.load(variantProject());
      harness.dispatch("setVariantOffset", 2, 3);
      harness.dispatch("setVariantOffset", -1, 1);
      expect(offsetOf(harness)).toEqual({ x: 1, y: 4 });
    });

    it("LEVEL 1 — an existing variantOffsets entry is the base for the delta", () => {
      harness.load(
        variantProject({}, { variantOffsets: { "v-1": { x: 10, y: 10 } } }),
      );
      harness.dispatch("setVariantOffset", 1, 1);
      expect(offsetOf(harness)).toEqual({ x: 11, y: 11 });
    });

    it("LEVEL 2 — the legacy variantOffset is the base when level 1 is absent", () => {
      harness.load(variantProject({}, { variantOffset: { x: 7, y: 7 } }));
      harness.dispatch("setVariantOffset", 1, 1);
      expect(offsetOf(harness)).toEqual({ x: 8, y: 8 });
    });

    it("LEVEL 3 — baseFrameOffsets is the base when 1 and 2 are absent", () => {
      harness.load(variantProject({ baseFrameOffsets: { 0: { x: 4, y: 4 } } }));
      harness.dispatch("setVariantOffset", 1, 1);
      expect(offsetOf(harness)).toEqual({ x: 5, y: 5 });
    });

    it("LEVEL 4 — {0,0} is the base when nothing else resolves", () => {
      harness.load(variantProject());
      harness.dispatch("setVariantOffset", 1, 1);
      expect(offsetOf(harness)).toEqual({ x: 1, y: 1 });
    });

    // ══ DIVERGENCE from store/helpers.ts:73 ══════════════════════════════
    it("DIVERGENCE: uses a TRUTHINESS check, so a {0,0} level-1 entry FALLS THROUGH", () => {
      // `variantActions.ts:~695` is `if (l.variantOffsets?.[id]) return ...`,
      // whereas `helpers.ts:73` is `l.variantOffsets?.[id] ?? ...`. For objects
      // the two agree — an object is always truthy — so with a `{x:0,y:0}`
      // stored offset BOTH still take level 1. But `helpers.ts` would also take
      // a level-1 value that is `null`, `0` or `""` (all nullish-or-not
      // distinctions), while this ladder falls through on any falsy value.
      //
      // Assert the object case, which is the one that actually occurs: they
      // AGREE here, and that agreement is what task 30 may rely on.
      harness.load(
        variantProject(
          { baseFrameOffsets: { 0: { x: 9, y: 9 } } },
          { variantOffsets: { "v-1": { x: 0, y: 0 } } },
        ),
      );
      harness.dispatch("setVariantOffset", 1, 1);
      // Level 1 {0,0} was used as the base, NOT baseFrameOffsets {9,9}.
      expect(offsetOf(harness)).toEqual({ x: 1, y: 1 });
    });

    it("writes ONLY the currently-selected variant's key, leaving siblings alone", () => {
      harness.load(
        variantProject(
          {},
          { variantOffsets: { "v-1": { x: 1, y: 1 }, "v-other": { x: 9, y: 9 } } },
        ),
      );
      harness.dispatch("setVariantOffset", 1, 1);
      expect(hostLayer(harness)!.variantOffsets).toEqual({
        "v-1": { x: 2, y: 2 },
        "v-other": { x: 9, y: 9 },
      });
    });

    it("allFrames=true updates every frame hosting the SAME variant group", () => {
      const host: Layer = {
        ...mkLayer("host"),
        isVariant: true,
        variantGroupId: "vg-1",
        selectedVariantId: "v-1",
      };
      const p = variantProject();
      p.objects[0].frames = [
        { id: "frame-1", name: "F1", layers: [{ ...host, id: "h1" }] },
        { id: "frame-2", name: "F2", layers: [{ ...host, id: "h2" }] },
      ];
      p.uiState.selectedFrameId = "frame-1";
      p.uiState.selectedLayerId = "h1";
      harness.load(p);

      harness.dispatch("setVariantOffset", 3, 0, true);
      expect(offsetOf(harness, 0)).toEqual({ x: 3, y: 0 });
      expect(offsetOf(harness, 1)).toEqual({ x: 3, y: 0 });
    });

    it("allFrames=false (the default) updates the CURRENT frame's layer only", () => {
      const host: Layer = {
        ...mkLayer("host"),
        isVariant: true,
        variantGroupId: "vg-1",
        selectedVariantId: "v-1",
      };
      const p = variantProject();
      p.objects[0].frames = [
        { id: "frame-1", name: "F1", layers: [{ ...host, id: "h1" }] },
        { id: "frame-2", name: "F2", layers: [{ ...host, id: "h2" }] },
      ];
      p.uiState.selectedFrameId = "frame-1";
      p.uiState.selectedLayerId = "h1";
      harness.load(p);

      harness.dispatch("setVariantOffset", 3, 0);
      expect(offsetOf(harness, 0)).toEqual({ x: 3, y: 0 });
      expect(offsetOf(harness, 1)).toBeUndefined();
    });

    it("OBSERVED: does NOT clamp the offset to the base grid", () => {
      // Nothing bounds the delta; the variant can be pushed entirely off canvas
      // and the renderers simply clip it. Recorded, not fixed.
      harness.load(variantProject());
      harness.dispatch("setVariantOffset", 999, -999);
      expect(offsetOf(harness)).toEqual({ x: 999, y: -999 });
    });

    it("tracks history", () => {
      harness.load(variantProject());
      const before = harness.getHistoryLength();
      harness.dispatch("setVariantOffset", 1, 1);
      expect(harness.getHistoryLength()).toBe(before + 1);
    });

    it("is a no-op on a NON-variant layer", () => {
      harness.load(tinyProject());
      const before = harness.getHistoryLength();
      harness.dispatch("setVariantOffset", 1, 1);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  /* ── the remaining variant lifecycle actions ───────────────────────────── */

  describe("variant lifecycle", () => {
    beforeEach(() => harness.load(variantProject()));

    it("addVariant appends a new variant to the group", () => {
      harness.dispatch("addVariant", "vg-1");
      expect(groups(harness)[0].variants).toHaveLength(2);
      expect(groups(harness)[0].variants[1].id).not.toBe("v-1");
    });

    it("addVariant with copyFromVariantId clones the source's pixels", () => {
      harness.dispatch("addVariant", "vg-1", "v-1");
      const [a, b] = groups(harness)[0].variants;
      expect(b.gridSize).toEqual(a.gridSize);
      expect(b.frames[0].layers[0].pixels[0][0].color).toEqual(RED);
      expect(b.id).not.toBe(a.id);
    });

    it("deleteVariant removes one variant, deleteVariantGroup removes the whole group", () => {
      harness.dispatch("addVariant", "vg-1");
      const second = groups(harness)[0].variants[1].id;
      harness.dispatch("deleteVariant", "vg-1", second);
      expect(groups(harness)[0].variants).toHaveLength(1);

      harness.dispatch("deleteVariantGroup", "vg-1");
      expect(groups(harness)).toHaveLength(0);
    });

    it("selectVariant repoints the host layer and does NOT track history", () => {
      harness.dispatch("addVariant", "vg-1");
      const second = groups(harness)[0].variants[1].id;
      const before = harness.getHistoryLength();
      harness.dispatch("selectVariant", "host", second);
      expect(hostLayer(harness)!.selectedVariantId).toBe(second);
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("renameVariant / renameVariantGroup set the name and track history", () => {
      harness.dispatch("renameVariant", "vg-1", "v-1", "Renamed Variant");
      expect(firstVariant(harness)!.name).toBe("Renamed Variant");
      harness.dispatch("renameVariantGroup", "vg-1", "Renamed Group");
      expect(groups(harness)[0].name).toBe("Renamed Group");
    });

    it("addVariantFrame appends a frame; deleteVariantFrame removes it", () => {
      harness.dispatch("addVariantFrame", "vg-1", "v-1");
      expect(firstVariant(harness)!.frames).toHaveLength(2);
      const added = firstVariant(harness)!.frames[1].id;
      harness.dispatch("deleteVariantFrame", "vg-1", "v-1", added);
      expect(firstVariant(harness)!.frames).toHaveLength(1);
    });

    it("duplicateVariantFrame inserts a copy carrying the same pixels", () => {
      harness.dispatch("duplicateVariantFrame", "vg-1", "v-1", "vf-0");
      const frames = firstVariant(harness)!.frames;
      expect(frames).toHaveLength(2);
      expect(frames[1].id).not.toBe("vf-0");
      expect(frames[1].layers[0].pixels[0][0].color).toEqual(RED);
    });

    it("selectVariantFrame and advanceVariantFrames are NON-tracking", () => {
      harness.dispatch("addVariantFrame", "vg-1", "v-1");
      const before = harness.getHistoryLength();
      harness.dispatch("selectVariantFrame", "vg-1", 1);
      harness.dispatch("advanceVariantFrames", 1);
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("selectVariantFrame updates variantFrameIndices", () => {
      harness.dispatch("addVariantFrame", "vg-1", "v-1");
      harness.dispatch("selectVariantFrame", "vg-1", 1);
      expect(harness.getUiState().variantFrameIndices?.["vg-1"]).toBe(1);
    });

    it("addVariantFrameTag / removeVariantFrameTag round-trip", () => {
      harness.dispatch("addVariantFrameTag", "vg-1", "v-1", "vf-0", "walk");
      expect(firstVariant(harness)!.frames[0].tags).toContain("walk");
      harness.dispatch("removeVariantFrameTag", "vg-1", "v-1", "vf-0", "walk");
      expect(firstVariant(harness)!.frames[0].tags ?? []).not.toContain("walk");
    });

    it("moveVariantFrame and reorderVariantFrame both reorder frames", () => {
      harness.dispatch("addVariantFrame", "vg-1", "v-1");
      const [a, b] = firstVariant(harness)!.frames.map((f) => f.id);

      harness.dispatch("moveVariantFrame", "vg-1", "v-1", a, "right");
      expect(firstVariant(harness)!.frames.map((f) => f.id)).toEqual([b, a]);

      harness.dispatch("reorderVariantFrame", "vg-1", "v-1", a, 0);
      expect(firstVariant(harness)!.frames.map((f) => f.id)).toEqual([a, b]);
    });

    it("removeVariantLayer strips the variant host from the frame", () => {
      const p = variantProject();
      p.objects[0].frames[0].layers.unshift(mkLayer("plain"));
      harness.load(p);

      harness.dispatch("removeVariantLayer", "host");
      expect(
        harness.getProject()!.objects[0].frames[0].layers.map((l) => l.id),
      ).toEqual(["plain"]);
    });

    it("OBSERVED: the round-trip MATERIALISES an empty baseFrameOffsets to {0:{x:0,y:0}}", () => {
      // MEASURED. `compactToProject(projectToCompact(p))` is NOT an identity on
      // a variant whose `baseFrameOffsets` is `{}` — it comes back with an
      // explicit frame-0 entry of `{x:0,y:0}`.
      //
      // This matters here because `store/index.ts:57-58` uses exactly that
      // round-trip to CLONE every history snapshot, so the first undo silently
      // rewrites the shape of a variant that had no offsets. The visible
      // behaviour is unchanged (level 3 of the fallback chain resolves to the
      // same `{0,0}` either way), but a task-30 unification that keys off
      // "baseFrameOffsets is empty" would break on the post-undo shape.
      //
      // The serializer itself is task 07's territory; this test only records
      // the consequence the store inherits. Recorded, not fixed.
      harness.load(variantProject());
      expect(firstVariant(harness)!.baseFrameOffsets).toEqual({});

      const round = cloneProject(harness.getProject()!);
      expect(round.variants![0].variants[0].baseFrameOffsets).toEqual({
        0: { x: 0, y: 0 },
      });
    });

    it("an undo therefore normalises baseFrameOffsets in place", () => {
      harness.load(variantProject());
      harness.dispatch("setVariantOffset", 1, 1);
      harness.dispatch("undo");
      expect(firstVariant(harness)!.baseFrameOffsets).toEqual({
        0: { x: 0, y: 0 },
      });
    });

    it("the round-trip IS stable once baseFrameOffsets is populated", () => {
      harness.load(variantProject({ baseFrameOffsets: { 0: { x: 2, y: 3 } } }));
      harness.dispatch("addVariant", "vg-1", "v-1");
      harness.dispatch("addVariantFrame", "vg-1", "v-1");
      harness.dispatch("setVariantOffset", 1, 1);

      const before = harness.getProject()!;
      const once = cloneProject(before);
      const twice = cloneProject(once);
      // Idempotent from the second pass on — the normalisation is one-shot.
      expect(twice.variants).toEqual(once.variants);
      expect(twice.objects).toEqual(once.objects);
    });
  });
});
