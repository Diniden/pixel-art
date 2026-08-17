// DO NOT run `vitest -u` on this file. Every diff here is a change to real user data.
//
// Characterisation tests for the two SERVER-SIDE migrations (REFRESH task 07):
//
//   M7 — `normalizePixel` (`src/routes/export.ts:412-418`): legacy scalar pixel
//        → `[c,n,h]` tuple. This is the ARRAY-SAFE reference implementation that
//        the client's `migrateLegacyPixel` should have been.
//   M8 — export-time `variantOffset` → `variantOffsets`
//        (`src/routes/export.ts:576-580`), which keys on
//        `layer.selectedVariantId ?? ""`.
//
// ⚠️ Both functions are module-private inside `export.ts`, and task 07 may not
// modify production source to export them. They are therefore TRANSCRIBED
// below, and a source-fidelity guard at the bottom of this file re-reads
// `export.ts` and fails if the original text no longer matches the
// transcription. That guard is what keeps these tests honest — without it a
// change to `export.ts` would leave these passing against a stale copy.
//
// ⚠️ Assertions are OBSERVED behaviour. M8's empty-string key is a real defect,
// pinned deliberately.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type CompactPixelData = [number, number, number] | 0;

const exportSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "export.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Transcribed verbatim from `src/routes/export.ts:412-418`.
// ---------------------------------------------------------------------------
function normalizePixel(pixel: unknown): CompactPixelData {
  if (pixel === 0 || pixel === null || pixel === undefined) return 0;
  if (Array.isArray(pixel) && pixel.length >= 3)
    return pixel as CompactPixelData;
  if (typeof pixel === "number") return [pixel, 0, 1]; // legacy: color only
  return 0;
}

// ---------------------------------------------------------------------------
// Transcribed verbatim from `src/routes/export.ts:576-580`.
// ---------------------------------------------------------------------------
interface VariantLayerLike {
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  variantOffset?: { x: number; y: number };
  selectedVariantId?: string;
}

function exportVariantOffsets(
  layer: VariantLayerLike,
): { [variantId: string]: { x: number; y: number } } | undefined {
  return (
    layer.variantOffsets ??
    (layer.variantOffset
      ? { [layer.selectedVariantId ?? ""]: layer.variantOffset }
      : undefined)
  );
}

// ===========================================================================
// M7
// ===========================================================================
describe("M7 — normalizePixel", () => {
  it("maps the scalar 0 to 0", () => {
    expect(normalizePixel(0)).toBe(0);
  });

  it("maps null and undefined to 0", () => {
    // Defensive branches the client-side equivalent does not have.
    expect(normalizePixel(null)).toBe(0);
    expect(normalizePixel(undefined)).toBe(0);
  });

  it("maps a legacy scalar colour hex to [n, 0, 1] — height 1, matching the client", () => {
    expect(normalizePixel(0xff_00_00_ff)).toEqual([0xff_00_00_ff, 0, 1]);
    expect(normalizePixel(255)).toEqual([255, 0, 1]);
    expect(normalizePixel(1)).toEqual([1, 0, 1]);
  });

  it("returns an already-migrated [c,n,h] tuple UNCHANGED — it IS array-safe", () => {
    // This is the correct behaviour, and the direct contrast with the client's
    // `migrateLegacyPixel` (types/index.ts:1061-1069), which given the same
    // input returns the nested `[[c,n,h], 0, 1]` and corrupts the data.
    // `export.ts:414` guards with `Array.isArray(pixel) && pixel.length >= 3`
    // before the number branch; the client has no such guard.
    const tuple: CompactPixelData = [0xff_00_00_ff, 0x80_80_ff, 7];
    expect(normalizePixel(tuple)).toEqual([0xff_00_00_ff, 0x80_80_ff, 7]);
    expect(normalizePixel(tuple)).toBe(tuple); // returned by reference, not copied
  });

  it("is idempotent — the property the client-side M2 lacks", () => {
    const once = normalizePixel(0xab_cd_ef_12);
    const twice = normalizePixel(once);
    const thrice = normalizePixel(twice);
    expect(twice).toEqual(once);
    expect(thrice).toEqual(once);
    expect(once).toEqual([0xab_cd_ef_12, 0, 1]);
  });

  it("maps an array SHORTER than 3 to 0 rather than padding it", () => {
    // OBSERVED: the `length >= 3` guard fails, the `typeof === "number"` guard
    // fails, so control reaches the final `return 0` and the partial data is
    // discarded silently.
    expect(normalizePixel([1, 2])).toBe(0);
    expect(normalizePixel([1])).toBe(0);
    expect(normalizePixel([])).toBe(0);
  });

  it("preserves arrays LONGER than 3 as-is", () => {
    // OBSERVED: no truncation — the extra elements survive into the export.
    expect(normalizePixel([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it("maps any other type to 0", () => {
    expect(normalizePixel("255")).toBe(0);
    expect(normalizePixel({})).toBe(0);
    expect(normalizePixel(true)).toBe(0);
  });

  it("passes NaN through the number branch", () => {
    // OBSERVED: `typeof NaN === "number"` is true, so NaN becomes the colour
    // hex of a tuple. Downstream `compactPixelToRgba` bit-shifts it to 0.
    expect(normalizePixel(Number.NaN)).toEqual([Number.NaN, 0, 1]);
  });
});

// ===========================================================================
// M8
// ===========================================================================
describe("M8 — export-time variantOffset → variantOffsets", () => {
  it("prefers an existing variantOffsets map", () => {
    expect(
      exportVariantOffsets({
        variantOffsets: { v1: { x: 1, y: 2 } },
        variantOffset: { x: 9, y: 9 },
        selectedVariantId: "v1",
      }),
    ).toEqual({ v1: { x: 1, y: 2 } });
  });

  it("converts a legacy variantOffset using selectedVariantId as the key", () => {
    expect(
      exportVariantOffsets({
        variantOffset: { x: 3, y: 4 },
        selectedVariantId: "v1",
      }),
    ).toEqual({ v1: { x: 3, y: 4 } });
  });

  it('emits an EMPTY-STRING key when selectedVariantId is absent', () => {
    // BUG: `export.ts:579` keys the new map on `layer.selectedVariantId ?? ""`.
    // A layer carrying a `variantOffset` but no `selectedVariantId` therefore
    // exports as `{"": {x, y}}` — an entry no consumer can ever look up, since
    // no variant has the id "". The offset is present in the exported JSON but
    // unreachable, and `server/exports/lib/` is consumed by external game code
    // (OPEN-QUESTIONS.md Q33), so the malformed key reaches that consumer.
    //
    // Note this is the SAME input the client's M5 refuses to migrate
    // (types/index.ts:846-851 requires a truthy `selectedVariantId`). The two
    // sides disagree: the client silently keeps the legacy field, the exporter
    // silently emits an unusable key.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off — and, because it changes the published export format,
    // a coordinated version bump per Q33.
    expect(exportVariantOffsets({ variantOffset: { x: 3, y: 4 } })).toEqual({
      "": { x: 3, y: 4 },
    });
  });

  it("returns undefined when there is no offset of either kind", () => {
    expect(exportVariantOffsets({})).toBeUndefined();
    expect(exportVariantOffsets({ selectedVariantId: "v1" })).toBeUndefined();
  });

  it("an EMPTY variantOffsets map wins over a legacy variantOffset", () => {
    // OBSERVED: `??` only falls through on null/undefined, and `{}` is neither,
    // so an empty map suppresses the legacy conversion entirely and the offset
    // is dropped from the export.
    expect(
      exportVariantOffsets({
        variantOffsets: {},
        variantOffset: { x: 3, y: 4 },
        selectedVariantId: "v1",
      }),
    ).toEqual({});
  });
});

// ===========================================================================
// Source-fidelity guard
//
// The two functions above are transcriptions of module-private code. If
// `export.ts` changes and these copies do not, the tests above would keep
// passing while testing nothing real. These assertions fail in that case.
// ===========================================================================
describe("source fidelity — the transcriptions still match export.ts", () => {
  it("normalizePixel is unchanged in export.ts", () => {
    const expected = [
      "function normalizePixel(pixel: unknown): CompactPixelData {",
      '  if (pixel === 0 || pixel === null || pixel === undefined) return 0;',
      "  if (Array.isArray(pixel) && pixel.length >= 3)",
      "    return pixel as CompactPixelData;",
      "  if (typeof pixel === \"number\") return [pixel, 0, 1]; // legacy: color only",
      "  return 0;",
      "}",
    ].join("\n");
    expect(exportSource).toContain(expected);
  });

  it("the M8 variantOffsets expression is unchanged in export.ts", () => {
    const expected = [
      "              variantOffsets:",
      "                layer.variantOffsets ??",
      "                (layer.variantOffset",
      '                  ? { [layer.selectedVariantId ?? ""]: layer.variantOffset }',
      "                  : undefined),",
    ].join("\n");
    expect(exportSource).toContain(expected);
  });

  it("normalizePixel is still module-private (not exported)", () => {
    // If a later task exports it, these tests should import the real function
    // instead of transcribing it. This assertion is the reminder.
    expect(exportSource).not.toContain("export function normalizePixel");
  });
});
