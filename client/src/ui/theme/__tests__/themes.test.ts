/**
 * Structural checks for the theme system.
 *
 * A `[data-theme]` override of a token that does not exist in `:root` is a
 * silent no-op (custom properties have no undeclared-variable error), so
 * every override must target a real token. The accent guard pins the design
 * intent shared by every theme: chrome re-colours, highlights stay pops of
 * colour. Blocks may group themes (`[data-theme="a"], [data-theme="b"]`);
 * a theme's overrides are the union of every block that names it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, THEMES, isThemeId } from "../themes";

const tokensCss = readFileSync(
  new URL("../../../styles/tokens.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments before any parsing

/** Property names declared in a `{ ... }` body. */
function propNames(block: string): string[] {
  return [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

/** Every `selector { body }` pair in the sheet. */
const blocks = [...tokensCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  selector: m[1].trim(),
  body: m[2],
}));

/** The bare `:root` block = the default theme. */
const rootProps = new Set(
  propNames(blocks.find((b) => b.selector === ":root")?.body ?? ""),
);

/** Union of overrides across every block naming this theme. */
function themeProps(id: string): string[] {
  return blocks
    .filter((b) => b.selector.includes(`[data-theme="${id}"]`))
    .flatMap((b) => propNames(b.body));
}

describe("theme registry ↔ tokens.css", () => {
  it("the default theme is registered and is the bare :root block", () => {
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(rootProps.size).toBeGreaterThan(100);
    expect(themeProps(DEFAULT_THEME)).toHaveLength(0);
  });

  for (const { id } of THEMES.filter((t) => t.id !== DEFAULT_THEME)) {
    const props = themeProps(id);

    it(`"${id}" has overrides and every one targets a :root token`, () => {
      expect(
        props.length,
        `no [data-theme="${id}"] overrides found`,
      ).toBeGreaterThan(0);
      for (const prop of props) {
        expect(rootProps.has(prop), `${prop} is not declared in :root`).toBe(
          true,
        );
      }
    });

    it(`"${id}" overrides chrome only — accents/status stay pops of colour`, () => {
      for (const prop of props) {
        expect(prop).not.toMatch(/^--(accent|status|channel|tool)-/);
      }
    });
  }

  it("both cozy themes halve the default section chrome", () => {
    for (const id of ["dark-cozy", "light-cozy"]) {
      const props = themeProps(id);
      for (const token of [
        "--layout-pad",
        "--layout-gap",
        "--layout-pad-bottom",
        "--panel-header-pad",
        "--panel-body-pad",
      ]) {
        expect(props, `${id} must override ${token}`).toContain(token);
      }
    }
  });
});
