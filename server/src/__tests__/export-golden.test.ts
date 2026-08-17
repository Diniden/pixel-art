// Unit tests for the pure functions extracted from the old 927-line
// `src/routes/export.ts` (REFRESH task 11).
//
// ⚠️ These are CHARACTERISATION tests. They assert what the exporter OBSERVABLY
// does, not what it ideally should. The export output is a PUBLISHED format
// consumed by external game code (OPEN-QUESTIONS.md Q33) and is covered by a
// byte-identity gate, so a surprising assertion here is a pin, not a bug to be
// tidied away.
//
// The M7 / M8 migrations are pinned separately in `normalizePixel.test.ts`.

import { describe, expect, it } from "vitest";

import type {
  ExportedObject,
  ExportedVariantLayerDef,
} from "../export/exportTypes.js";
import { applyMaxCanvas, resolveVariantOffset } from "../export/maxCanvas.js";
import { toKebabCase, toPascalCase } from "../export/naming.js";
import { isValidProjectName } from "../validation.js";

// ===========================================================================
// naming — decides the on-disk export folder and the generated class name
// ===========================================================================
describe("toKebabCase", () => {
  it("lowercases and hyphenates a spaced name", () => {
    // The real project: "Base Unit" → "base-unit", the folder actually on disk.
    expect(toKebabCase("Base Unit")).toBe("base-unit");
  });

  it("splits camelCase boundaries before hyphenating", () => {
    expect(toKebabCase("baseUnit")).toBe("base-unit");
    expect(toKebabCase("myCoolProject")).toBe("my-cool-project");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(toKebabCase("a   b")).toBe("a-b");
    expect(toKebabCase("a___b")).toBe("a-b");
    expect(toKebabCase("a - b")).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    expect(toKebabCase("  Base Unit  ")).toBe("base-unit");
    expect(toKebabCase("---Base---")).toBe("base");
  });

  it("OBSERVED: a digit before a capital does NOT create a boundary", () => {
    // The camelCase regex is /([a-z])([A-Z])/ — it requires a LOWERCASE letter
    // on the left, so "1A" in "v1Alpha" does not split and the capital is
    // merely lowercased. Pinned as observed; changing it would rename export
    // folders for any project whose name has a digit before a capital.
    expect(toKebabCase("Unit2")).toBe("unit2");
    expect(toKebabCase("v1Alpha")).toBe("v1alpha");
    // Contrast: a lowercase letter before the capital DOES split.
    expect(toKebabCase("vOneAlpha")).toBe("v-one-alpha");
  });

  it("returns an empty string when nothing alphanumeric survives", () => {
    // OBSERVED: this would produce `join(exportBase, "")` — the export base
    // itself. `isValidProjectName` now rejects such names at the route before
    // they can reach here.
    expect(toKebabCase("!!!")).toBe("");
    expect(toKebabCase("")).toBe("");
  });
});

describe("toPascalCase", () => {
  it("builds the generated class-name stem", () => {
    // "Base Unit" → "BaseUnit" → class `BaseUnitPixels` in the generated index.ts.
    expect(toPascalCase("Base Unit")).toBe("BaseUnit");
  });

  it("lowercases the tail of each word", () => {
    // OBSERVED: `.slice(1).toLowerCase()` flattens interior capitals, so
    // acronyms are NOT preserved.
    expect(toPascalCase("BASE UNIT")).toBe("BaseUnit");
    expect(toPascalCase("baseUnit")).toBe("Baseunit");
  });

  it("treats any non-alphanumeric run as a word separator", () => {
    expect(toPascalCase("base-unit")).toBe("BaseUnit");
    expect(toPascalCase("base_unit_two")).toBe("BaseUnitTwo");
  });

  it("keeps digits attached to their word", () => {
    expect(toPascalCase("unit 2 alpha")).toBe("Unit2Alpha");
  });
});

// ===========================================================================
// The 4-level variant-offset fallback
//
// ⚠️ 1 of 6 copies of this rule — the other 5 are in Canvas.tsx (541, 663,
// 1113, 1390, 1915). The exporter's maxCanvas must agree with what the runtime
// renders or sprites clip. Tested here in strict priority order.
// ===========================================================================
describe("resolveVariantOffset — the 4-level fallback, in priority order", () => {
  const variant = {
    id: "v1",
    baseFrameOffsets: {
      "0": { x: 30, y: 30 },
      "2": { x: 20, y: 20 },
    },
  };

  it("level 1 — per-frame variantOffsets for this variant wins over everything", () => {
    expect(
      resolveVariantOffset(
        { variantOffsets: { v1: { x: 1, y: 2 } } },
        variant,
        2,
      ),
    ).toEqual({ x: 1, y: 2 });
  });

  it("level 2 — falls back to baseFrameOffsets for THIS frame index", () => {
    expect(resolveVariantOffset({ variantOffsets: {} }, variant, 2)).toEqual({
      x: 20,
      y: 20,
    });
  });

  it("level 3 — falls back to baseFrameOffsets frame 0", () => {
    // Frame 5 has no entry, so frame "0" is used as the default pose.
    expect(resolveVariantOffset({}, variant, 5)).toEqual({ x: 30, y: 30 });
  });

  it("level 4 — falls back to the origin", () => {
    expect(
      resolveVariantOffset({}, { id: "v1", baseFrameOffsets: {} }, 3),
    ).toEqual({ x: 0, y: 0 });
  });

  it("keys variantOffsets by VARIANT id, not by frame", () => {
    // An offset recorded for a different variant must not leak onto this one.
    expect(
      resolveVariantOffset(
        { variantOffsets: { other: { x: 9, y: 9 } } },
        variant,
        2,
      ),
    ).toEqual({ x: 20, y: 20 });
  });

  it("OBSERVED: a zero-valued offset is honoured, not treated as absent", () => {
    // `??` not `||`, so {x:0,y:0} at level 1 correctly suppresses levels 2-4.
    expect(
      resolveVariantOffset(
        { variantOffsets: { v1: { x: 0, y: 0 } } },
        variant,
        2,
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});

// ===========================================================================
// maxCanvas
// ===========================================================================
function makeObject(): ExportedObject {
  return {
    id: "o1",
    name: "Obj",
    gridSize: { width: 32, height: 32 },
    frames: [
      {
        id: "f0",
        name: "Frame 0",
        layers: [
          {
            id: "l1",
            name: "Hair",
            visible: true,
            colorTexture: null,
            normalTexture: null,
            isVariant: true,
            variantLayerId: "vl1",
          },
        ],
      },
    ],
  };
}

function makeVariantLayer(
  baseFrameOffsets: { [k: string]: { x: number; y: number } },
  gridSize = { width: 32, height: 32 },
): ExportedVariantLayerDef {
  return {
    id: "vl1",
    name: "Hair",
    variants: [
      { id: "v1", name: "Yellow", gridSize, frames: [], baseFrameOffsets },
    ],
  };
}

describe("applyMaxCanvas", () => {
  it("omits maxCanvas entirely when the variant fits the base grid", () => {
    // Key to the wire format: no `maxCanvas` means no `mc` entry in frames.json.
    const objects = [makeObject()];
    applyMaxCanvas(objects, [makeVariantLayer({ "0": { x: 0, y: 0 } })]);
    expect(objects[0].maxCanvas).toBeUndefined();
  });

  it("grows the canvas right/down for a positive offset", () => {
    const objects = [makeObject()];
    applyMaxCanvas(objects, [makeVariantLayer({ "0": { x: 8, y: 4 } })]);
    // maxX = 8+32 = 40, maxY = 4+32 = 36.
    // ⚠️ OBSERVED: the offset is NEGATIVE ZERO, because it is computed as
    // `-minX` and `minX` is 0. `toEqual` distinguishes -0 from 0, so this is
    // asserted with `toStrictEqual`-compatible literals below. It does NOT
    // reach the wire format: `JSON.stringify(-0)` emits "0", which is why the
    // byte-identity gate is unaffected. Pinned so a future refactor that
    // "tidies" the sign is caught here rather than in the export bytes.
    expect(objects[0].maxCanvas).toEqual({
      width: 40,
      height: 36,
      offset: { x: -0, y: -0 },
    });
    expect(JSON.stringify(objects[0].maxCanvas!.offset)).toBe('{"x":0,"y":0}');
  });

  it("grows left/up for a negative offset and reports a compensating offset", () => {
    const objects = [makeObject()];
    applyMaxCanvas(objects, [makeVariantLayer({ "0": { x: -8, y: -4 } })]);
    // minX = -8 so width = 32 - (-8) = 40 and offset.x = 8.
    expect(objects[0].maxCanvas).toEqual({
      width: 40,
      height: 36,
      offset: { x: 8, y: 4 },
    });
  });

  it("takes the union across ALL variants, since any could be selected at runtime", () => {
    const objects = [makeObject()];
    const vl = makeVariantLayer({ "0": { x: -6, y: 0 } });
    vl.variants.push({
      id: "v2",
      name: "Red",
      gridSize: { width: 32, height: 32 },
      frames: [],
      baseFrameOffsets: { "0": { x: 10, y: 0 } },
    });
    applyMaxCanvas(objects, [vl]);
    // Spans -6 .. 42 → width 48, offset.x 6. offset.y is -0 (see above).
    expect(objects[0].maxCanvas).toEqual({
      width: 48,
      height: 32,
      offset: { x: 6, y: -0 },
    });
  });

  it("accounts for a variant whose own gridSize is larger than the base", () => {
    const objects = [makeObject()];
    applyMaxCanvas(objects, [
      makeVariantLayer({ "0": { x: 0, y: 0 } }, { width: 48, height: 40 }),
    ]);
    expect(objects[0].maxCanvas).toEqual({
      width: 48,
      height: 40,
      offset: { x: -0, y: -0 },
    });
  });

  it("ignores a layer whose variantLayerId resolves to nothing", () => {
    const objects = [makeObject()];
    applyMaxCanvas(objects, []); // no matching definition
    expect(objects[0].maxCanvas).toBeUndefined();
  });

  it("ignores non-variant layers", () => {
    const objects = [makeObject()];
    objects[0].frames[0].layers[0].isVariant = false;
    applyMaxCanvas(objects, [makeVariantLayer({ "0": { x: 100, y: 100 } })]);
    expect(objects[0].maxCanvas).toBeUndefined();
  });

  it("mutates in place — the caller relies on this", () => {
    const objects = [makeObject()];
    const same = objects[0];
    applyMaxCanvas(objects, [makeVariantLayer({ "0": { x: 8, y: 0 } })]);
    expect(same.maxCanvas).toBeDefined();
  });
});

// ===========================================================================
// isValidProjectName — now shared, and now actually called by the export route
// ===========================================================================
describe("isValidProjectName", () => {
  it("accepts the real project name", () => {
    expect(isValidProjectName("Base Unit")).toBe(true);
  });

  it("accepts alphanumerics, spaces, hyphens and underscores", () => {
    expect(isValidProjectName("proj-1_a B")).toBe(true);
  });

  it("rejects empty and over-long names", () => {
    expect(isValidProjectName("")).toBe(false);
    expect(isValidProjectName("a".repeat(101))).toBe(false);
    expect(isValidProjectName("a".repeat(100))).toBe(true);
  });

  it("rejects path traversal — the reason the export route now calls this", () => {
    // Before task 11 these reached `join(exportBase, toKebabCase(name))`.
    expect(isValidProjectName("../etc/passwd")).toBe(false);
    expect(isValidProjectName("..")).toBe(false);
    expect(isValidProjectName("a/b")).toBe(false);
    expect(isValidProjectName("a\\b")).toBe(false);
  });

  it("rejects the reserved config name and dotfiles", () => {
    expect(isValidProjectName("config")).toBe(false);
    expect(isValidProjectName(".hidden")).toBe(false);
  });

  it("rejects non-string input defensively", () => {
    expect(isValidProjectName(undefined as unknown as string)).toBe(false);
    expect(isValidProjectName(null as unknown as string)).toBe(false);
  });
});
