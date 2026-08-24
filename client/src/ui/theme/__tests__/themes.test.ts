/**
 * Structural checks for the theme system.
 *
 * A `[data-theme]` override of a token that does not exist in `:root` is a
 * silent no-op (custom properties have no undeclared-variable error), so
 * every override must target a real token. The accent guard pins the
 * "Dark and Cozy" design intent: chrome goes grey, highlights stay colour.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, THEMES, isThemeId } from "../themes";

const tokensCss = readFileSync(
  new URL("../../../styles/tokens.css", import.meta.url),
  "utf8",
);

/** Property names declared in a `{ ... }` body. */
function propNames(block: string): string[] {
  return [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

/** The body of `:root { ... }` (the first bare-root block = default theme). */
const rootBlock = tokensCss.match(/^:root\s*\{([\s\S]*?)^\}/m)?.[1] ?? "";
const rootProps = new Set(propNames(rootBlock));

function themeBlock(id: string): string | undefined {
  return tokensCss.match(
    new RegExp(`^:root\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)^\\}`, "m"),
  )?.[1];
}

describe("theme registry ↔ tokens.css", () => {
  it("the default theme is a registered theme and needs no override block", () => {
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(rootProps.size).toBeGreaterThan(100);
  });

  for (const { id } of THEMES.filter((t) => t.id !== DEFAULT_THEME)) {
    it(`"${id}" has an override block and every override targets a :root token`, () => {
      const block = themeBlock(id);
      expect(block, `:root[data-theme="${id}"] block missing`).toBeDefined();
      for (const prop of propNames(block!)) {
        expect(rootProps.has(prop), `${prop} is not declared in :root`).toBe(
          true,
        );
      }
    });
  }

  it("dark-cozy overrides chrome only — accents/status stay pops of colour", () => {
    const block = themeBlock("dark-cozy")!;
    for (const prop of propNames(block)) {
      expect(prop).not.toMatch(/^--(accent|status|channel|tool)-/);
    }
  });
});
