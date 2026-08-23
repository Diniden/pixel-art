/**
 * Parity: canvasTokens' CSS_MIRROR must byte-match styles/tokens.css.
 *
 * Canvas code cannot read custom properties, so mirrored literals are the
 * only option — this test is what makes tokens.css stay the single source
 * of truth. It fails if a mirrored token is renamed, removed, or its value
 * edited on either side.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { backgroundTheme } from "../../canvas/render/canvasBackground";
import { CSS_MIRROR } from "../canvasTokens";

const tokensCss = readFileSync(
  new URL("../../../styles/tokens.css", import.meta.url),
  "utf8",
);

/** `--name: value;` declarations, whitespace-normalised. */
function cssTokenValue(name: string): string | undefined {
  const match = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`, ""));
  return match?.[1].replace(/\s+/g, " ").trim();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

describe("canvasTokens ↔ tokens.css parity", () => {
  for (const [name, value] of Object.entries(CSS_MIRROR)) {
    it(`${name} matches its tokens.css value`, () => {
      expect(cssTokenValue(name)).toBe(value);
    });
  }

  it("the dark canvas checkerboard mirrors --bg-tertiary/--bg-hover/--canvas-checker-b", () => {
    const dark = backgroundTheme(false);
    expect(dark.base).toEqual(hexToRgb(CSS_MIRROR["--bg-tertiary"]));
    expect(dark.color1).toEqual(hexToRgb(CSS_MIRROR["--bg-hover"]));
    expect(dark.color2).toEqual(hexToRgb(CSS_MIRROR["--canvas-checker-b"]));
  });
});
