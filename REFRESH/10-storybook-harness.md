# 10 — Storybook 9 harness and the visual baseline

**Wave:** W6 · **Depends on:** 06, 09
**Touches:** `client/.storybook/main.ts` (new) · `client/.storybook/preview.tsx` (new) · `client/.storybook/preview-head.html` (new) · `client/.storybook/decorators/modalHost.tsx` (new) · `client/package.json` · `client/eslint.config.js` (stories override) · `.gitignore` (verify `client/storybook-static`) · `client/src/fixtures/` (new) · `client/src/ui/primitives/Button/Button.stories.tsx` (new, proof story)
**Effort:** M

## Objective

After this task Storybook builds and runs, one proof story renders **with the app's real styling and fonts**, a shared fixture module exists for both stories and tests, and a modal-host decorator exists so `position: fixed` modals can be storied later. This lands **before** the CSS token substitution so that substitution has a component-by-component visual baseline instead of memory.

## Context

### Why Storybook is scheduled here and not later

The CSS audit's open question asked task 09 of the planning phase to decide whether Storybook lands before or after the token substitution, and the component taxonomy independently recommended the same answer. **Both said: before.** The token substitution (task 11) is the highest visual-regression risk in the entire refresh — 585 colour literals, 32 radius literals, 30 transition literals — and several clusters deliberately *collapse* near-identical values, so some pixels genuinely change. The alternative to a Storybook baseline is manually screenshotting 34 components in every state.

There is a genuine ordering tension: `preview.tsx` imports `../src/index.css`, whose shape task 09 changes. This is resolved by depending on **task 09 only** (the import manifest and the `main.tsx` one-liner), not on the token substitution. That yields a working Storybook before task 11 without importing a half-converted stylesheet.

**Visual regression tooling is deliberately NOT installed.** Chromatic (hosted, per-snapshot billing, requires CI that does not exist) and `@storybook/test-runner` (Playwright, ~300 MB browser download, for a repo that had zero tests last week) were both evaluated and rejected on measured grounds. The substitutes, already in the plan, are: Storybook for human review, primitive DOM snapshot tests (task 12), and the canvas pixel-hash helper installed by task 06. This is a deliberate re-evaluation point, not a permanent no — if the primitive set grows past ~15 components with multiple variants each, `@storybook/test-runner` becomes worth its 3 hours.

### Versions

```sh
cd client
bunx storybook@9.1.20 init --builder vite --no-dev
bun add --exact -d eslint-plugin-storybook@9.1.20     # MUST match the `storybook` major
```

- **Storybook 9.1.20, not 10.5.8.** `@storybook/react-vite@9.1.20` peers `vite ^5 || ^6 || ^7`, which is exactly the Vite 7.3.6 task 03 installed. Its React peer is written `^19.0.0-beta`, which **does** satisfy 19.2.8 under semver. Storybook 10 lists a `vite-plus` peer and its `react-vite` peer set moves too.
- `@storybook/react-vite` must **exactly match** the `storybook` version.
- `eslint-plugin-storybook` must be pinned to the same major as `storybook` — the `latest` tag (10.5.8) peers `storybook ^10.5.8`.

### The 8 things `preview.tsx` must load, or stories lie

Every one of these is loaded by the app **outside** the component tree, so a story that omits it renders differently from production.

| # | Requirement | Source in the app | Why it is required |
| --- | --- | --- | --- |
| 1 | **Design tokens** (`:root` custom properties) | `client/src/styles/tokens.css` (task 09 extracted it) | **~950 `var()` references across all stylesheets.** Without it every component renders with unset colours, radii, fonts and transitions. Non-negotiable. |
| 2 | **The reset** (`* { box-sizing }`, `html, body, #root`) | `client/src/styles/reset.css` | Components assume `box-sizing: border-box` throughout. Without it every padded element is the wrong size. |
| 3 | **Global element styling** — `button`, `input`, `select`, `input[type=number]`, `input[type=range]` and its `::-webkit-slider-thumb` | `client/src/styles/reset.css` | `ColorPicker`, `LightControl`, `RightSidebarTopControls`, `Toolbar` and `PixelStudioPanel` all render `<input type="range">` whose **entire** track and thumb styling comes from here. **A `ColorPicker` story without this renders native OS sliders.** |
| 4 | **Custom scrollbars** (`::-webkit-scrollbar*`) | `client/src/styles/reset.css` | Any story with a scroll container looks wrong without it. |
| 5 | **Web fonts — `Outfit` + `JetBrains Mono`** | ⚠️ **`client/index.html:9-10`, a `<link>` tag — NOT in any CSS file** | `--font-sans` and `--font-mono` name these families and **44 declarations use `var(--font-mono)`**. Storybook does not read `client/index.html`, so fonts silently fall back to `system-ui`/`monospace`. **This is the single easiest thing to miss.** |
| 6 | **Dark background** | `body { background: var(--bg-primary) }` | The entire palette is dark-on-dark (`--bg-primary:#0a0a0f`, `--text-primary:#e8e8f0`). **On Storybook's default white canvas every component is near-invisible.** |
| 7 | **`#root` sizing** | `html, body, #root { height:100% }` | Layout-level stories assume a full-height ancestor; supply one via a decorator. |
| 8 | **App-level CSS** | `client/src/App.css` | Shell classes used by layout stories. |

Concrete `preview.tsx`:

```tsx
import "../src/index.css";   // tokens + reset, in that order (task 09 made this the manifest)
import "../src/App.css";

export const parameters = {
  backgrounds: {
    default: "app",
    values: [{ name: "app", value: "#0a0a0f" }], // === --bg-primary
  },
  layout: "fullscreen",
  a11y: { test: "todo" },   // PERMANENT — see the a11y note below
};
```

`client/.storybook/preview-head.html` — requirement 5:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### The modal-host decorator

**14 modals use `position: fixed`** and will escape the story canvas and cover the whole Storybook iframe. `client/.storybook/decorators/modalHost.tsx` supplies a local `position: relative; transform: none` element and passes it as a `container` prop. This is why the `Modal` primitive (task 12) takes `container?: HTMLElement | null` rather than hard-coding `document.body`.

Also note: current `z-index` values reach **99999**, which will sit above Storybook's own UI in some addon panels. The z-index scale (task 11) fixes this as a side effect.

### Two components will render broken in Storybook, and it is not Storybook's fault

Measured cross-component CSS dependencies that exist today:
- `RightSidebarTopControls`'s `.compact-slider` is styled almost entirely by **`ColorPicker.css`** — `RightSidebarTopControls.css` emits only `{flex:1}`.
- `PixelStudioPanel`'s `.shape-btn` is styled by **`LightingStudioPanel.css`**.

Their stories will render broken until tasks 15 and 16 convert those collision groups. **Do not chase this as a Storybook configuration problem** — write the stories later, per the story-coverage sequence, not now.

### The a11y gate

Set the a11y addon to `test: "todo"` — and **leave it there permanently**.

**OWNER DECISION (2026-08-16): the a11y addon stays advisory (`test: "todo"`) indefinitely. It is never promoted to `test: "error"`.** An earlier draft scheduled that promotion for task 19 once the primitives landed; **that promotion is cancelled.** No build in this plan fails on an accessibility violation.

The accessibility *work* is unaffected and still happens: task 19's primitives build in `role="dialog"`, `aria-modal`, focus trapping and Escape handling, which fixes 14 modals, 9 toggles and 142 tooltips as they adopt the primitives, and task 36 fixes the keyboard-inoperable `LayerColors` toggles at `LayerColors.tsx:169-180,197-208,254`. Only the build-failing **gate** is dropped — violations are reported for humans to read, not enforced.

### Fixtures

Create `client/src/fixtures/` as a **shared** module used by both stories and Vitest — not story-local literals. It must export plain-object sample data typed against the domain types, at three sizes:

- `projectEmpty` — no objects, for empty-state stories
- `projectTypical` — 2 objects, 4 frames, 3 layers, 16×16 grids, one variant group with 2 variants, some frame tags
- `projectDense` — 12 objects × 12 frames × 8 layers, for stress and virtualisation checks

**Do not use `Base Unit.json`** (1.1 MB, 300,249 pixel cells) as a Storybook fixture — that file belongs to the migration corpus (task 07), not to stories. Fixtures must contain **no** MobX imports and no store references.

The reason fixtures are shared rather than duplicated: the variant-offset 4-level fallback, `screenToPixel`'s snapping modes, and the brush mouse-vs-touch agreement tests all need the **same** fixture shapes the stories use, or the visual evidence and the unit evidence describe different data.

## Steps

1. Run `bunx storybook@9.1.20 init --builder vite --no-dev` in `client`. Install `eslint-plugin-storybook@9.1.20`.
2. Write `client/.storybook/main.ts`: stories glob covering `../src/**/*.stories.@(ts|tsx)`, framework `@storybook/react-vite`, `staticDirs` pointing at `client/public`.
3. Write `client/.storybook/preview.tsx` exactly as in Context (all 8 requirements).
4. Write `client/.storybook/preview-head.html` with the font links.
5. Write `client/.storybook/decorators/modalHost.tsx`.
6. Author `client/src/fixtures/` with the three project sizes plus the smaller building blocks (`pixels`, `layers`, `frames`, `variants`, `objects`, `palettes`, `uiState`, `selection`, `colors`) and an `index.ts` barrel.
7. Add a `*.stories.*` override block to `client/eslint.config.js` using `eslint-plugin-storybook`.
8. Add scripts: `"storybook": "storybook dev -p 6006"`, `"build-storybook": "storybook build"`. Add root passthroughs.
9. Write **one** proof story. Since no primitives exist yet, create a minimal `client/src/ui/primitives/Button/Button.tsx` + `Button.stories.tsx` — a plain styled button using the `btn` class names task 12 will formalise. Keep it small; task 12 owns the real primitive.
10. Confirm `client/storybook-static` is gitignored (task 01 added it).

## Constraints

- **No lockfiles; pin exact versions.** Standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` is deliberate and must stay, the repo has no lockfile of any kind, and every dependency is written as an exact version in `package.json`. Every `bun add` in this task uses `--exact` (plain `bun add x@1.2.3` writes `"^1.2.3"`). Never create, commit or regenerate a lockfile; `--frozen-lockfile` is meaningless here.
- **Do not install `@storybook/test-runner`, `@storybook/addon-vitest`, `@vitest/browser`, Playwright, or Chromatic.** See Context.
- **Do not install Storybook 10** or let `@storybook/react-vite` drift from the `storybook` version.
- Do not write stories for existing components in this task. Story coverage follows the tier sequence in later tasks, and two components would render broken today for reasons unrelated to Storybook.
- **Do not set the a11y addon to `"error"`, in this task or any other.** `test: "todo"` is permanent (owner decision, 2026-08-16).
- Do not modify any component under `client/src/components/`.
- `npm` and `node` are not on PATH.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx storybook build && test -d storybook-static     # exit 0, artifact produced
bunx tsc --noEmit && bunx eslint . && bunx vitest run # all still exit 0
# Fixtures are store-free:
! grep -rn "makeAutoObservable\|observable\|from \"mobx\"\|useEditorStore" src/fixtures
```

Manual checks — **all required, none automatable**:
1. `bunx storybook dev`, open the Button story, and confirm it is **styled**, not a native browser button.
2. Confirm an element using `var(--font-mono)` renders in **JetBrains Mono**, not fallback `monospace`. This is the `preview-head.html` check and the easiest thing to miss.
3. Confirm the story canvas background is `#0a0a0f`, not white.
4. Confirm `client/public` static assets resolve from a story.
5. Eyeball `projectDense` in a scratch story — 12 objects × 12 frames × 8 layers must actually be there, not silently truncated.

## Definition of done

- [ ] `bunx storybook build` exits 0 and emits `client/storybook-static/`.
- [ ] `storybook` and `@storybook/react-vite` are both 9.1.20; `eslint-plugin-storybook` matches the major.
- [ ] `preview.tsx` loads tokens, reset, global element styling, scrollbars, `App.css`, and sets the dark background.
- [ ] `preview-head.html` loads Outfit and JetBrains Mono, and a `var(--font-mono)` element was **visually confirmed** to render in JetBrains Mono.
- [ ] The modal-host decorator exists.
- [ ] `client/src/fixtures/` exports `projectEmpty`, `projectTypical` and `projectDense`, contains no store or MobX import, and does not use `Base Unit.json`.
- [ ] The a11y addon is at `test: "todo"`, with a comment recording that this is **permanent** by owner decision (2026-08-16) and that no task promotes it to `"error"`.
- [ ] Exactly one proof story exists and renders styled.
- [ ] No Playwright, test-runner, Chromatic, or browser-mode dependency was installed.
