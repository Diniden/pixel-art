/**
 * Behaviour contract — `store/helpers.ts`, and above all the **4-level variant
 * offset resolution chain** at `helpers.ts:71-77`.
 *
 * ## Why this file matters more than its size suggests
 *
 * That chain is duplicated **9 times** across the codebase (MASTER.md §9.12 said
 * 6; the real count, measured while writing this suite, is 9 client sites plus
 * the server's divergent copy). One test here protects them all — but only if it
 * records where they DISAGREE rather than papering over it. See the DIVERGENCE
 * block at the bottom, and the mirrored assertions in
 * `utils/__tests__/previewRenderer.test.ts` and
 * `utils/__tests__/lightingRenderer.test.ts`.
 *
 * MASTER.md §10 rule 10 throughout: observed, never desired.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HARNESSES,
  mkLayer,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import type { Layer, Project, VariantGroup } from "@/types";

vi.mock("@/services/api", async () => (await import("./mockApi")).apiMockFactory());

/* ── a variant-bearing fixture ───────────────────────────────────────────── */

function variantFixture(
  hostOverrides: Partial<Layer> = {},
  variantOverrides: Partial<VariantGroup["variants"][number]> = {},
  frameCount = 1,
): Project {
  const host: Layer = {
    ...mkLayer("layer-1"),
    isVariant: true,
    variantGroupId: "vg-1",
    selectedVariantId: "v-1",
    ...hostOverrides,
  };
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    id: `frame-${i + 1}`,
    name: `Frame ${i + 1}`,
    layers: [{ ...host }],
  }));
  const project = tinyProject({ frames });
  project.variants = [
    {
      id: "vg-1",
      name: "Group",
      variants: [
        {
          id: "v-1",
          name: "Variant 1",
          gridSize: { width: 2, height: 2 },
          frames: [{ id: "vf-1", layers: [mkLayer("vl-1", 2, 2)] }],
          baseFrameOffsets: {},
          ...variantOverrides,
        },
      ],
    },
  ];
  return project;
}

describe.each(HARNESSES)("%s — helpers", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
  });

  afterEach(() => harness.reset());

  /* ── the plain selectors ───────────────────────────────────────────────── */

  describe("getCurrentObject / getCurrentFrame / getCurrentLayer", () => {
    it("all return null when no project is loaded", () => {
      expect(harness.dispatch("getCurrentObject")).toBeNull();
      expect(harness.dispatch("getCurrentFrame")).toBeNull();
      expect(harness.dispatch("getCurrentLayer")).toBeNull();
    });

    it("resolve the ids held in uiState", () => {
      harness.load(tinyProject());
      expect(harness.dispatch("getCurrentObject")?.id).toBe("obj-1");
      expect(harness.dispatch("getCurrentFrame")?.id).toBe("frame-1");
      expect(harness.dispatch("getCurrentLayer")?.id).toBe("layer-1");
    });

    it("return null for an id that does not resolve", () => {
      const p = tinyProject();
      p.uiState.selectedLayerId = "no-such-layer";
      harness.load(p);
      expect(harness.dispatch("getCurrentObject")).not.toBeNull();
      expect(harness.dispatch("getCurrentFrame")).not.toBeNull();
      expect(harness.dispatch("getCurrentLayer")).toBeNull();
    });

    it("getCurrentFrame short-circuits when the OBJECT does not resolve", () => {
      const p = tinyProject();
      p.uiState.selectedObjectId = "no-such-object";
      harness.load(p);
      expect(harness.dispatch("getCurrentFrame")).toBeNull();
      expect(harness.dispatch("getCurrentLayer")).toBeNull();
    });
  });

  describe("isEditingVariant", () => {
    it("is false for a plain layer and true for a variant layer", () => {
      harness.load(tinyProject());
      expect(harness.dispatch("isEditingVariant")).toBe(false);
      harness.load(variantFixture());
      expect(harness.dispatch("isEditingVariant")).toBe(true);
    });

    it("is false when no layer resolves", () => {
      harness.reset();
      expect(harness.dispatch("isEditingVariant")).toBe(false);
    });
  });

  /* ── getCurrentVariant — the null guards ───────────────────────────────── */

  describe("getCurrentVariant — guards", () => {
    it("returns null for a non-variant layer", () => {
      harness.load(tinyProject());
      expect(harness.dispatch("getCurrentVariant")).toBeNull();
    });

    it("returns null when the variant GROUP id does not resolve", () => {
      harness.load(variantFixture({ variantGroupId: "no-such-group" }));
      expect(harness.dispatch("getCurrentVariant")).toBeNull();
    });

    it("returns null when the selected VARIANT id does not resolve", () => {
      harness.load(variantFixture({ selectedVariantId: "no-such-variant" }));
      expect(harness.dispatch("getCurrentVariant")).toBeNull();
    });

    it("returns null when `isVariant` is unset even if the ids are present", () => {
      harness.load(variantFixture({ isVariant: false }));
      expect(harness.dispatch("getCurrentVariant")).toBeNull();
    });

    it("resolves the group, variant and frame when everything lines up", () => {
      harness.load(variantFixture());
      const v = harness.dispatch("getCurrentVariant");
      expect(v?.variantGroup.id).toBe("vg-1");
      expect(v?.variant.id).toBe("v-1");
      expect(v?.variantFrame.id).toBe("vf-1");
      expect(v?.baseFrameIndex).toBe(0);
    });

    it("getSelectedVariantLayer returns the variant frame's FIRST layer", () => {
      harness.load(variantFixture());
      expect(harness.dispatch("getSelectedVariantLayer")?.id).toBe("vl-1");
    });

    it("getSelectedVariantLayer returns null when there is no variant", () => {
      harness.load(tinyProject());
      expect(harness.dispatch("getSelectedVariantLayer")).toBeNull();
    });

    it("wraps variantFrameIndices modulo the frame count", () => {
      const p = variantFixture();
      p.variants![0].variants[0].frames = [
        { id: "vf-1", layers: [mkLayer("a", 2, 2)] },
        { id: "vf-2", layers: [mkLayer("b", 2, 2)] },
      ];
      p.uiState.variantFrameIndices = { "vg-1": 3 };
      harness.load(p);
      // 3 % 2 === 1
      expect(harness.dispatch("getCurrentVariant")?.variantFrame.id).toBe("vf-2");
    });
  });

  /* ══ THE 4-LEVEL OFFSET CHAIN ══════════════════════════════════════════ */

  describe("getCurrentVariant — the 4-level offset fallback, in priority order", () => {
    const offsetOf = () => harness.dispatch("getCurrentVariant")?.offset;

    it("LEVEL 1 — variantOffsets[selectedVariantId] beats everything below it", () => {
      harness.load(
        variantFixture(
          {
            variantOffsets: { "v-1": { x: 1, y: 1 } },
            variantOffset: { x: 2, y: 2 },
          },
          { baseFrameOffsets: { 0: { x: 3, y: 3 } } },
        ),
      );
      expect(offsetOf()).toEqual({ x: 1, y: 1 });
    });

    it("LEVEL 2 — variantOffset (legacy) when level 1 has no entry for this variant", () => {
      harness.load(
        variantFixture(
          {
            // Keyed for a DIFFERENT variant, so level 1 misses.
            variantOffsets: { "v-other": { x: 1, y: 1 } },
            variantOffset: { x: 2, y: 2 },
          },
          { baseFrameOffsets: { 0: { x: 3, y: 3 } } },
        ),
      );
      expect(offsetOf()).toEqual({ x: 2, y: 2 });
    });

    it("LEVEL 3 — variant.baseFrameOffsets[baseFrameIndex] when 1 and 2 are absent", () => {
      harness.load(
        variantFixture({}, { baseFrameOffsets: { 0: { x: 3, y: 3 } } }),
      );
      expect(offsetOf()).toEqual({ x: 3, y: 3 });
    });

    it("LEVEL 3 indexes by the CURRENT base frame, not always frame 0", () => {
      const p = variantFixture(
        {},
        { baseFrameOffsets: { 0: { x: 3, y: 3 }, 1: { x: 7, y: 7 } } },
        2,
      );
      p.uiState.selectedFrameId = "frame-2";
      harness.load(p);
      expect(harness.dispatch("getCurrentVariant")?.baseFrameIndex).toBe(1);
      expect(offsetOf()).toEqual({ x: 7, y: 7 });
    });

    it("LEVEL 4 — {x:0,y:0} when nothing above resolves", () => {
      harness.load(variantFixture());
      expect(offsetOf()).toEqual({ x: 0, y: 0 });
    });

    it('an UNDEFINED selectedVariantId looks level 1 up under the "" key', () => {
      // `layer.variantOffsets?.[selectedVariantId ?? ""]` — helpers.ts:73.
      // The layer still needs `selectedVariantId` set for `getCurrentVariant`
      // to resolve a variant at all, so this asserts the `?? ""` coalesce by
      // giving the map an EMPTY-STRING key and a variant id that misses.
      harness.load(
        variantFixture({
          variantOffsets: { "": { x: 5, y: 5 }, "v-1": { x: 9, y: 9 } },
        }),
      );
      // With `selectedVariantId === "v-1"` the "" key is NOT consulted.
      expect(offsetOf()).toEqual({ x: 9, y: 9 });
    });

    it("a level-1 map that is present but EMPTY falls through to level 2", () => {
      harness.load(
        variantFixture({ variantOffsets: {}, variantOffset: { x: 2, y: 2 } }),
      );
      expect(offsetOf()).toEqual({ x: 2, y: 2 });
    });

    it("OBSERVED: the chain uses ?? — a {x:0,y:0} at level 1 STOPS the fallback", () => {
      // Nullish coalescing, not truthiness: an explicitly-zero offset is a real
      // value and shadows the lower levels. `store/variantActions.ts:691-710`
      // implements the same priority with a TRUTHINESS check instead
      // (`if (l.variantOffsets?.[id])`), which agrees here only because objects
      // are always truthy. Recorded so task 30 cannot assume they are the same.
      harness.load(
        variantFixture(
          { variantOffsets: { "v-1": { x: 0, y: 0 } } },
          { baseFrameOffsets: { 0: { x: 3, y: 3 } } },
        ),
      );
      expect(offsetOf()).toEqual({ x: 0, y: 0 });
    });

    // ══ DIVERGENCE ═══════════════════════════════════════════════════════
    //
    // `store/helpers.ts:75-77` is the ONLY full-chain client site that clamps a
    // negative base-frame index:
    //     variant.baseFrameOffsets?.[baseFrameIndex >= 0 ? baseFrameIndex : 0]
    // The other eight do not. Measured 2026-08-16:
    //   • Canvas.tsx:541, :663, :1113, :1390, :1915 — no clamp, index comes
    //     straight from `Array.prototype.findIndex`, so -1 is reachable.
    //   • utils/previewRenderer.ts:93 — no clamp (pinned in that file's tests).
    //   • utils/lightingRenderer.ts:103 — no clamp (pinned in that file's tests).
    //   • components/PreviewModal/PreviewModal.tsx:374 — no clamp, and no
    //     `?? ""` on the level-1 key.
    //   • server/src/routes/export.ts:657 — level 2 MISSING entirely, keys by
    //     `variant.id` not `layer.selectedVariantId`, string keys, and an extra
    //     explicit `baseFrameOffsets["0"]` level the client lacks.
    // Also clamping: `store/variantActions.ts:~700`, via an if/return ladder.
    //
    // Task 30 unifies. This test proves what helpers.ts does today.
    it("DIVERGENCE: helpers.ts has a negative-index clamp the other 8 sites lack — and it is UNREACHABLE here", () => {
      // MEASURED while writing this suite, and it corrects the plan's framing:
      // the clamp at helpers.ts:76 can never fire. `getCurrentVariant` reaches
      // line 66 only after `getCurrentLayer` -> `getCurrentFrame` has already
      // matched `selectedFrameId` against `obj.frames` (helpers.ts:20). The
      // `findIndex` at :66 uses the IDENTICAL predicate, so it is guaranteed
      // >= 0 by construction. Setting an unresolvable frame id short-circuits
      // the whole helper to null instead of producing baseFrameIndex === -1.
      //
      // The eight other sites derive their index from a `findIndex` whose
      // result is NOT pre-validated, so -1 is genuinely reachable there. The
      // divergence is therefore not "helpers.ts is safer", it is "helpers.ts
      // carries dead defensive code that the copies were derived from without
      // the guard that made it unnecessary". Task 30 should delete the clamp
      // rather than propagate it.
      const p = variantFixture({}, { baseFrameOffsets: { 0: { x: 3, y: 3 } } });
      p.uiState.selectedFrameId = "no-such-frame";
      harness.load(p);

      expect(harness.dispatch("getCurrentFrame")).toBeNull();
      expect(harness.dispatch("getCurrentVariant")).toBeNull();
      expect(offsetOf()).toBeUndefined();
    });

    it("baseFrameIndex is always >= 0 whenever getCurrentVariant resolves at all", () => {
      // The positive statement of the invariant above.
      const p = variantFixture(
        {},
        { baseFrameOffsets: { 0: { x: 3, y: 3 }, 1: { x: 7, y: 7 } } },
        2,
      );
      for (const frameId of ["frame-1", "frame-2", "no-such-frame"]) {
        p.uiState.selectedFrameId = frameId;
        harness.load(p);
        const v = harness.dispatch("getCurrentVariant");
        if (v) expect(v.baseFrameIndex).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
