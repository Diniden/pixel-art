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
 * ⚠️ **THE THEME MOVED INTO THE PROJECT (owner decision, 2026-08-25).**
 * This file used to say the preference must NEVER join `uiState`. That was
 * the decision in force at the time; the owner has since reversed it. The
 * theme is now `uiState.theme` — one per project, on every device — owned by
 * `LayoutUIStore` and persisted by `UIStore.toPersistedUIState()`.
 *
 * The wire format's key set is still protected, and the rule that made the
 * addition safe holds: `theme` is emitted ONLY once the user has picked one,
 * so an untouched project's key set — and its corpus digest — is unchanged.
 *
 * `localStorage` still exists here, and its role is now narrow and precise:
 * it is a SEED for a project that has no theme saved yet, and it keeps
 * working as the pre-first-paint value in `main.tsx`. It is NOT a second
 * source of truth — `HeaderContainer` resolves the project's theme first and
 * falls back to this only when the project has none.
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

/** localStorage key. The device SEED — see the header; the project wins. */
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
