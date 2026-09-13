# 05 — `PixelStudioBrushApplication` UI + section prop

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/PixelStudioPanel/PixelStudioBrushApplication.tsx` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioBrushApplication.css` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioBrushApplication.stories.tsx` (new) · `client/src/ui/components/PixelStudioPanel/brushApplicationValue.ts` (new) · `client/src/ui/components/PixelStudioPanel/__tests__/PixelStudioBrushApplication.dom.test.tsx` (new) · `client/src/ui/components/PixelStudioPanel/__tests__/brushApplicationValue.test.ts` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioBrushSection.tsx` · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/ui/components/PixelStudioPanel/__tests__/PixelStudioBrushSection.dom.test.tsx`
**Effort:** L

## Objective
A pure, store-free **Application** block exists for the rail's Brush section: a scope switch ("This
object" / "Brush defaults"), one dropdown row per brush layer, one delta-list row per brush frame, with
stories and dom tests; `PixelStudioBrushInfo` gains an optional `application` member that
`PixelStudioBrushSection` renders after the size controls. No container feeds it yet (task 11).

## Context
- Folder `client/src/ui/components/PixelStudioPanel/`: `PixelStudioBrushSection.tsx` (322 raw lines;
  `PixelStudioBrushSizeControls :52-71`, `PixelStudioBrushInfo :78-92` with `size? :92`, component `:249`,
  `loaded :253`, `{loaded && pixelBrush.size ? <BrushSizeControls …/> : null}` `:304-305`, hint `:314`),
  `PixelStudioPanel.tsx` (396; re-exports the section types `:84-89`), `PixelStudioPanel.css` (`.pixel-studio-panel__brush-*`),
  and `ReflectionLinesSection.{tsx,css,stories.tsx}` + `__tests__/ReflectionLinesSection.dom.test.tsx` —
  the **own block, own CSS file** precedent to copy for file layout, story shape and test rig.
  Plan 14 (task 04) will have added a "Brush" dropdown row and `brushes?/selectedBrushId?/onSelectBrush?`
  to `PixelStudioBrushInfo`; keep them.
- `max-lines` is an **error** under `src/ui/**` at 400 code lines (comments/blanks skipped). The section
  is already at 322 raw — the new block must be its own component; if the component itself nears the
  limit, split the rows into `PixelStudioBrushApplicationRows.tsx` (add it to your report as a Touches
  deviation only if needed — prefer keeping it under the limit).
- Primitives (`client/src/ui/primitives/`): `Dropdown<T extends string>` (`options: DropdownOption<T>[]`
  with `disabled?` per option — the separator idiom `SCALE_SEPARATOR` in the section; `value`, `onChange`,
  `label?`, `triggerLabel?`, `className?`), `Button`, `IconButton` (see the ratio-lock button for
  `aria-pressed` usage), `Field`, `Badge`. lucide icon for reset: `RotateCcw`.
- The `ui/` boundary: no store, no api, no mobx imports. Types from `@/types` are fine but this component
  does not need any — it receives strings and numbers.
- Stylelint budget: 0 errors (2 pre-existing in `OtherHand.css`), warnings budgeted; run it.
- Tests: dom lane (`*.dom.test.tsx`, jsdom) with `@testing-library/react`; unit lane for the pure helper.

## Steps
1. `brushApplicationValue.ts` (pure, exported helpers — MASTER D9):
   `BRUSH_APPLY_DEFAULT = "default"`, `encodeDeltaTarget(n)` → `` `d:${n}` ``, `encodeLayerTarget(id)` →
   `` `l:${id}` ``, `decodeBrushApplyValue(v): { kind: "default" } | { kind: "delta"; delta: number } | { kind: "layer"; layerId: string }`
   (unknown → `{ kind: "default" }`), `formatDeltaList(list)` → `"0, +1, +2"` (`"—"` for empty; negative
   as `-1`), `parseDeltaList(text): number[] | null` — split on commas and whitespace, every token must
   match `/^[+-]?\d+$/`, dedupe, sort ascending; `""`/whitespace → `[]`; any bad token → `null`.
   Unit tests in `__tests__/brushApplicationValue.test.ts` for each (include `"0,+1 , 2"` → `[0,1,2]`,
   `"a"` → `null`, `"1 1"` → `[1]`, `"-3"` → `[-3]`, `"—"` → `null`).
   Commit: `brush-apply(05): brushApplicationValue helpers`.
2. `PixelStudioBrushApplication.tsx` — props exactly as MASTER §3 (`PixelStudioBrushApplyScope`,
   `PixelStudioBrushLayerMapping`, `PixelStudioBrushFrameMapping`, `PixelStudioBrushApplication`), component
   `PixelStudioBrushApplication({ application })`. Structure (BEM block `brush-application`):
   - `brush-application` root; `__header` with title "Application"; `__scope` holding two `Button`s
     ("This object", "Brush defaults") with `aria-pressed`, `__scope-button--active` modifier, calling
     `onScopeChange`.
   - `__group` "Layers": `__row` per layer — `__name` (layer name) + `Dropdown` (`className="brush-application__target"`,
     `label={layer.name}`, `options={layerOptions}`, `value={layer.value}`, `onChange={(v) => onLayerTargetChange(layer.id, v)}`).
   - `__group` "Frames": `__row` per frame — `__name` + text `<input className="brush-application__deltas">`
     (`aria-label={`${frame.name} frames`}`) whose local draft initialises from `formatDeltaList(deltas)`
     and re-syncs when `deltas` changes; **commit on Enter or blur**: `parseDeltaList(draft)` → array →
     `onFrameDeltasChange(frame.id, list)`; `null` → revert the draft, no callback; Escape reverts.
     Plus `IconButton` (`RotateCcw`, `aria-label={`Reset ${frame.name} frames`}`, `disabled={frame.isDefault}`)
     → `onFrameDeltasChange(frame.id, null)`.
   - A one-line `__hint` under the frames: "Deltas are relative to the current frame; targets outside the
     object are skipped." In brush scope the hint reads "Brush defaults travel with the brush. Deltas only."
     (choose by `scope`).
   Keep the component under the line limit; no store imports.
3. `PixelStudioBrushApplication.css`: layout matching the section's dense rows (`panel__body--dense`
   spacing variables already used in `PixelStudioPanel.css` — reuse the same custom properties; no new
   colours). Stylelint clean.
4. `PixelStudioBrushApplication.stories.tsx`: stories `ObjectScope` (3 layers with mixed default/delta/
   layer values, 2 frames with one non-default), `BrushScope` (deltas only), `SingleLayerSingleFrame`,
   `ManyFrames` (6 frames). Interactive state via `useState` in a story wrapper (the `ReflectionLinesSection`
   stories show the pattern).
   Commit: `brush-apply(05): PixelStudioBrushApplication component, CSS, stories`.
5. `PixelStudioBrushSection.tsx`: add `application?: PixelStudioBrushApplication` to `PixelStudioBrushInfo`
   (after `size?`), import the component and render `{loaded && pixelBrush.application ? <PixelStudioBrushApplication application={pixelBrush.application} /> : null}`
   directly after the size block. Update the hint string to MASTER D9's copy. `PixelStudioPanel.tsx`:
   re-export the four new types beside the existing section re-exports.
6. Tests:
   - `__tests__/PixelStudioBrushApplication.dom.test.tsx`: renders one row per layer and frame in the given
     order; scope buttons reflect `aria-pressed` and call `onScopeChange`; changing a dropdown calls
     `onLayerTargetChange(id, value)`; typing `"0, 1"` + Enter calls `onFrameDeltasChange(id, [0, 1])`;
     typing `"x"` + blur calls nothing and the field shows the previous value; typing `""` + Enter calls
     with `[]`; reset button disabled when `isDefault`, otherwise calls with `null`; an external `deltas`
     change re-syncs the field.
   - `__tests__/PixelStudioBrushSection.dom.test.tsx`: renders the block when `loaded && application`,
     not when `application` is absent, not when `loadState !== "loaded"`.
   Commit: `brush-apply(05): section renders the Application block; dom tests`.

## Constraints
- Only files under `client/src/ui/components/PixelStudioPanel/`. No container, no store, no `types/**`.
- `application` stays **optional** — the container that feeds it lands in W3; a required prop would break
  `PixelStudioPanelContainer`'s build this wave.
- Do not change any existing prop or class name; do not touch `PixelStudioPanel.css` except if a shared
  variable must be referenced (prefer not).
- No `max-lines` error under `src/ui/**`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/PixelStudioPanel        # 0 errors, no new warnings
cd client && bunx vitest run src/ui/components/PixelStudioPanel    # green
cd client && bunx stylelint "src/**/*.css"                          # no new errors (baseline 2 in OtherHand.css)
cd client && bunx storybook build                                   # exit 0
cd client && bun run lint:boundaries                                # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules         # prints nothing
```
**Manual (required):** `bunx storybook dev` → open the `ObjectScope` story: rows align with the size
controls' density; the dropdown opens above/below without clipping inside a 260 px-wide rail; the frames
field commits on Enter and blur; keyboard: Tab order is scope → layers → frames → reset. Record what you
saw.

## Definition of done
- [ ] Helpers + unit tests; component + CSS + 4 stories; section prop and render; re-exports.
- [ ] Dom tests listed above green; section tests green.
- [ ] eslint 0 errors and no `max-lines` error; stylelint no new errors; storybook builds; boundaries 5/5.
- [ ] Manual story check performed and described in the report.
- [ ] Three commits `brush-apply(05):`; no lockfile.
