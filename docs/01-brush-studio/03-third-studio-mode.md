# 03 — Third studio mode "brush"

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/domain.ts` · `client/src/stores/ui/LightingUIStore.ts` · `client/src/stores/ui/__tests__/LightingUIStore.test.ts` · `client/src/ui/components/Toolbar/Toolbar.tsx` · `client/src/ui/components/Toolbar/Toolbar.css` · `client/src/ui/components/Toolbar/Toolbar.stories.tsx` · `client/src/containers/ToolbarContainer.tsx` · `client/src/containers/AppContainer.tsx` · `client/src/containers/GlobalHotkeys.tsx` · `client/src/containers/RightSidebarTopControlsContainer.tsx` · `client/src/containers/otherHand/toolWidgets.ts` · `client/src/fixtures/uiState.ts`
**Effort:** M

## Objective
`StudioMode` is a three-member union; the toolbar shows a third studio button (brush icon)
beside Pixel and Lighting; clicking it sets `studioMode = "brush"` and the app renders a clearly
labelled placeholder screen (replaced by task 19). Every site that treated the mode as a boolean
is rewritten so `"brush"` is never silently treated as pixel or lighting. The 151-snapshot corpus
digests are unchanged.

## Context
- `client/src/types/domain.ts:279` — `export type StudioMode = "pixel" | "lighting";`. Widen to
  add `"brush"`. **This is the only edit to that file.** `studioMode` is a persisted wire field
  (`types/codecs/compactTypes.ts:108`, `codecs/deserialize.ts:189` defaults `?? "pixel"`);
  widening a union changes no bytes — verify via the corpus suite anyway.
- `stores/ui/LightingUIStore.ts:189-192`:
  ```ts
  setStudioMode(mode: StudioMode): void {
    this.studioMode = mode;
    this.tool.selectedTool = mode === "lighting" ? "normal-pencil" : "pixel";
  }
  ```
  Keep this behaviour; `"brush"` → `"pixel"`. The pinned test is
  `stores/ui/__tests__/LightingUIStore.test.ts:248-254` — add a case for `"brush"`.
- `ui/components/Toolbar/Toolbar.tsx:39-69` props: `isLightingMode: boolean` and
  `onSetStudioMode: (mode: "pixel" | "lighting") => void`. Replace `isLightingMode` with
  `studioMode: StudioMode` (import the type from `../../../types` — `ui/components` may import
  `types/`) and widen `onSetStudioMode` to `(mode: StudioMode) => void`. Studio buttons are at
  `:151-177`: a `toolbar__studio-mode-toggle` row with two `toolbar__studio-mode-btn`s wrapped
  in `<Tooltip>`. Add a third, `aria-label="Brush Studio"`, icon `Brush` from `lucide-react`
  (via the `Icon` primitive as the siblings do).
- `Toolbar.css:387-394`: the active/lighting styling keys off `[aria-label="Lighting Studio"]`.
  Add the analogous rule for `[aria-label="Brush Studio"]` **or** (preferred) introduce a
  modifier class `toolbar__studio-mode-btn--active` set from `studioMode === id` and drop the
  attribute selectors; either way stylelint must stay clean (BEM pattern, tokens only).
- `Toolbar.stories.tsx:51` passes `isLightingMode` — update to `studioMode`.
- `containers/ToolbarContainer.tsx:50,54` — pass `studioMode={lightingUI.studioMode}`.
- `containers/AppContainer.tsx:103-107`:
  ```tsx
  {lightingUI.studioMode === "lighting" ? (<LightingStudioContainer />) : (<PixelStudioContainer />)}
  ```
  Replace with an exhaustive `switch (lightingUI.studioMode)` with `case "pixel"`, `case "lighting"`,
  `case "brush"`, and a `default: { const _exhaustive: never = mode; return null; }` guard. For
  `"brush"` render an inline placeholder `<div className="app__placeholder">Brush Studio — task 19</div>`
  **with a Pixel-Studio "Back" button** (`lightingUI.setStudioMode("pixel")`) so the user is
  never stranded. (No CSS file for it; inline `style` is acceptable for a placeholder that
  task 19 deletes.)
- `containers/GlobalHotkeys.tsx:100-101` toggles `studioMode === "lighting" ? "pixel" : "lighting"`.
  Per MASTER D22 the hotkey stays pixel⇄lighting; make it `mode === "pixel" ? "lighting" : "pixel"`
  so that from brush mode the hotkey goes to pixel (never lighting by accident). Update the
  comment.
- `containers/RightSidebarTopControlsContainer.tsx:74` `isPixelMode={studioMode !== "lighting"}`
  → `=== "pixel"`. `containers/otherHand/toolWidgets.ts:60` `isLighting = … === "lighting"` is
  already exact — leave it but add a one-line comment that `"brush"` intentionally takes the
  pixel branch there (same tool set).
- `fixtures/uiState.ts:46,77,84` — add a `uiStateBrushMode` fixture beside the lighting one.

## Steps
1. Widen the union in `types/domain.ts`. Run `cd client && bunx vitest run src/types` — must be
   green with **no snapshot diff**. Commit: `brush-studio(03): widen StudioMode to include "brush"`.
2. `LightingUIStore.setStudioMode` + test. Commit: `brush-studio(03): setStudioMode handles brush`.
3. Toolbar props/button/CSS/story + `ToolbarContainer`. Commit: `brush-studio(03): brush studio toolbar button`.
4. `AppContainer` exhaustive switch + placeholder; `GlobalHotkeys`; `RightSidebarTopControlsContainer`;
   `toolWidgets.ts` comment; `fixtures/uiState.ts`. Commit: `brush-studio(03): exhaustive studio-mode routing`.
5. Grep to prove nothing was missed: `grep -rn 'studioMode' client/src --include=*.ts --include=*.tsx | grep -v __tests__`
   and paste the list with a one-word verdict per line (exact / widened / n-a).

## Constraints
- Do not touch `types/codecs/**`, `services/**`, `UIStore.ts`, `ApplicationStore.ts`.
- Do not change what `"pixel"` and `"lighting"` do anywhere.
- No new store, no brush UI beyond the placeholder.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint .                          # 0 errors
cd client && bunx vitest run                        # all pass; NO snapshot diffs
cd client && bun run lint:boundaries
cd client && bunx stylelint "src/**/*.css"          # no NEW errors (baseline: 2 in OtherHand.css)
cd client && bunx storybook build                   # Toolbar story compiles
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (`bun run dev`, open the app):
- Three studio buttons render, stacked when the toolbar is vertical; active state shows on the current one.
- Click Brush → placeholder with a working Back button; click Back → pixel studio, project intact.
- Hotkey toggle from pixel goes to lighting and back; from brush goes to pixel.
- Reload while in brush mode: the app boots into the placeholder (the mode persisted via the project's uiState) and Back still works.
- iPad/touch: the new button is tappable (no hover-only affordance).

## Definition of done
- [ ] `StudioMode` has three members; `grep` audit pasted with every site accounted for.
- [ ] Third toolbar button with tooltip, icon, active style; story updated.
- [ ] `AppContainer` switch is exhaustive (a `never` guard compiles).
- [ ] Placeholder with Back button works; manual checks done and reported.
- [ ] Full client gate green, **zero snapshot diffs**, stylelint no new errors, storybook builds.
- [ ] Four commits, only Touches files staged.
