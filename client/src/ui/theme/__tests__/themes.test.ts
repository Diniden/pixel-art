/**
 * Structural checks for the theme system.
 *
 * A `[data-theme]` override of a token that does not exist in `:root` is a
 * silent no-op (custom properties have no undeclared-variable error), so
 * every override must target a real token. Blocks may group themes
 * (`[data-theme="a"], [data-theme="b"]`); a theme's overrides are the union
 * of every block that names it, applied in document order.
 *
 * Two design intents are pinned:
 *  - DARK themes never override accents — highlights stay the brand pops.
 *  - LIGHT themes re-tune the blue/purple accents and muted grey for
 *    contrast; the WCAG suite below computes real ratios so a palette edit
 *    that regresses legibility fails the build (measured 2026-08-24: the
 *    dark values sat at 1.5-3.7:1 on light ground).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, THEMES, isThemeId } from "../themes";

const tokensCss = readFileSync(
  new URL("../../../styles/tokens.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments before any parsing

/** `--name: value` pairs declared in a `{ ... }` body. */
function decls(block: string): Array<[string, string]> {
  return [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2].replace(/\s+/g, " ").trim(),
  ]);
}

/** Every `selector { body }` pair in the sheet, in document order. */
const blocks = [...tokensCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  selector: m[1].trim(),
  body: m[2],
}));

const rootBlock = blocks.find((b) => b.selector === ":root")?.body ?? "";
const rootProps = new Set(decls(rootBlock).map(([name]) => name));

function themeBlocks(id: string) {
  return blocks.filter((b) => b.selector.includes(`[data-theme="${id}"]`));
}

/** Overridden property names for a theme (union across its blocks). */
function themeProps(id: string): string[] {
  return themeBlocks(id).flatMap((b) => decls(b.body).map(([name]) => name));
}

/** Effective token values for a theme: :root, then its blocks in order. */
function effective(id: string): Map<string, string> {
  const map = new Map(decls(rootBlock));
  for (const b of themeBlocks(id))
    for (const [name, value] of decls(b.body)) map.set(name, value);
  return map;
}

/* ── WCAG 2.1 relative luminance / contrast ratio ─────────────────── */
function luminance(hex: string): number {
  const h = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, "$&$&") : hex;
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme registry ↔ tokens.css", () => {
  it("the default theme is registered and is the bare :root block", () => {
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(rootProps.size).toBeGreaterThan(100);
    expect(themeProps(DEFAULT_THEME)).toHaveLength(0);
  });

  for (const { id } of THEMES.filter((t) => t.id !== DEFAULT_THEME)) {
    it(`"${id}" has overrides and every one targets a :root token`, () => {
      const props = themeProps(id);
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
  }

  it("dark themes never override accents — highlights stay the brand pops", () => {
    for (const prop of themeProps("dark-cozy")) {
      expect(prop).not.toMatch(/^--(accent|status|channel|tool)-/);
    }
  });

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

describe("light themes clear WCAG contrast on their own ground", () => {
  /** Token → minimum ratio against the theme's --bg-secondary (panel
   *  ground). 4.5 = AA normal text; --text-tertiary also carries small
   *  labels, so it holds the same bar. */
  const TEXT_MINIMUMS: Array<[string, number]> = [
    ["--text-primary", 7],
    ["--text-secondary", 4.5],
    ["--text-tertiary", 4.5],
    ["--text-muted", 4.4],
    ["--accent-primary", 4.5],
    ["--accent-secondary", 4.5],
    ["--accent-tertiary", 4.5],
    ["--accent-variant", 4.5],
    ["--accent-variant-light", 4.4],
    ["--accent-info-light", 4.4],
    ["--accent-hover", 4.5],
  ];

  for (const id of ["light-spacious", "light-cozy"]) {
    const tokens = effective(id);
    const ground = tokens.get("--bg-secondary")!;

    for (const [token, min] of TEXT_MINIMUMS) {
      it(`${id}: ${token} ≥ ${min}:1 on --bg-secondary`, () => {
        const value = tokens.get(token)!;
        expect(value, `${token} must be a hex literal`).toMatch(
          /^#[0-9a-f]+$/i,
        );
        expect(contrast(value, ground)).toBeGreaterThanOrEqual(min);
      });
    }

    it(`${id}: --text-on-accent reads on the accent ground`, () => {
      expect(
        contrast(
          tokens.get("--text-on-accent")!,
          tokens.get("--accent-primary")!,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
