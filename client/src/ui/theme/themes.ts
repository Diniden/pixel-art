/**
 * Theme registry + switching.
 *
 * A theme is a named set of custom-property overrides in
 * `styles/tokens.css`: bare `:root` IS the default theme
 * ("Dark and Spacious" — the measured palette the refresh tokenised), and
 * every other theme is a `:root[data-theme="<id>"]` block overriding a
 * subset of tokens. Switching = flipping `data-theme` on <html>; because
 * the whole UI reads tokens, nothing else has to know.
 *
 * The preference is a DEVICE preference, stored in localStorage. It must
 * NEVER move into the project's `uiState` — that wire format's key set is
 * frozen (UIStore R3) and the owner's real backups depend on it.
 *
 * Scope note: colours painted into <canvas> come from `canvasTokens.ts`,
 * which mirrors the DEFAULT theme's values. Canvas chrome (checkerboard,
 * selection cyan, sphere shading) deliberately does not re-theme — every
 * theme today is dark, the differences there are sub-perceptual, and the
 * hot render path stays lookup-free. Revisit if a light theme ever lands.
 *
 * `ui/` boundary: no store, API, or MobX imports — DOM + localStorage only.
 */

export const THEMES = [
  { id: "dark-spacious", label: "Dark and Spacious" },
  { id: "dark-cozy", label: "Dark and Cozy" },
  { id: "light-spacious", label: "Light and Spacious" },
  { id: "light-cozy", label: "Light and Cozy" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "dark-spacious";

/** localStorage key. Device preference — deliberately not project state. */
export const THEME_STORAGE_KEY = "pixel-art.theme";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** The stored preference, or the default when absent/unreadable/unknown. */
export function loadStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Storage can throw (privacy modes); the default theme is always safe.
    return DEFAULT_THEME;
  }
}

/** Applies `id` to <html data-theme> and persists it. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Non-persistent storage still gets the in-session theme.
  }
}

/** Boot hook: apply the stored preference before first paint (main.tsx). */
export function initTheme(): ThemeId {
  const theme = loadStoredTheme();
  applyTheme(theme);
  return theme;
}
