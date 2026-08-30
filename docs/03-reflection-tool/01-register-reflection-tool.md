# 01 — Register the `reflection` tool

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/domain.ts` · `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `client/src/ui/components/Toolbar/PixelStudioTools.tsx`
**Effort:** S

## Objective
`"reflection"` is a member of the `Tool` union, the tool dispatch table is exhaustive
again, hotkey `R` selects it, and a "Reflection" button with a lucide icon sits in the
pixel-studio toolbar after "Ellipse". Selecting it does nothing on the canvas yet (task 07).

## Context
- The union lives at `client/src/types/domain.ts:261-277` (16 members). Adding a 17th
  fails `tsc` on purpose at `client/src/ui/canvas/tools/toolHandlers.ts:286`
  (`TOOLS_ARE_EXHAUSTIVE`). Add an **empty** entry `reflection: {}` in the table next to
  the "handled ahead of the table" group (`move`, `selection`, `eyedropper`, `origin`,
  around line 246) — the reflection gesture is arbitrated by `CanvasContainer`, not by
  the table, exactly like `origin`. Do not add `onDown`/`onMove`.
- Hotkeys: `HotkeyTool` union at `useCanvasKeyboard.ts:46-58` and `TOOL_HOTKEYS` at
  `:65-80`. `r`/`R` are free (verified). Add both cases, like `g`/`G`. The dom test
  `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` asserts the map — update its
  expectation (read it first; do not weaken any other assertion).
- Toolbar: the `tools` array at `ui/components/Toolbar/PixelStudioTools.tsx:90-118`.
  Insert `{ id: "reflection", icon: FlipHorizontal, label: "Reflection (mirror across lines)", hotkey: "R" }`
  after the `ellipse` entry. `FlipHorizontal` exists in lucide-react 0.575.0 (verified in
  `node_modules/lucide-react/dist/esm/icons/flip-horizontal.js`); `FlipHorizontal2` is
  already used for the flip action — do not reuse it. Import it in the existing lucide
  import block at `:20-40`.
- `selectedTool` is one of the persisted `uiState` keys (`stores/ui/UIStore.ts:379`). A
  new string value in an existing key does **not** change the wire format for any
  existing project; no persistence work is required. `types/` is nonetheless touched, so
  the corpus/roundtrip suites must be shown passing unchanged.
- `containers/otherHand/toolWidgets.ts:24-41` `TOOL_TITLES` is `Partial<…>`; leaving it
  alone is correct (the thumb rail degrades to an empty section). Out of scope.

## Steps
1. Add `| "reflection"` to `Tool` in `types/domain.ts` (after `"origin"`).
2. Add `reflection: {},` to `toolHandlers` with a one-line comment "arbitrated by
   `CanvasContainer`, like `origin` — see docs/03-reflection-tool/07".
3. Add `"reflection"` to `HotkeyTool`; add `r: "reflection", R: "reflection"` to
   `TOOL_HOTKEYS`; update the keyboard dom test's map expectation.
4. Add the toolbar entry and icon import.
5. Run verification. Commit: `feat(tool): register the reflection tool (type, dispatch entry, hotkey R, toolbar button)`.

## Constraints
- No behaviour on the canvas. Do not touch `CanvasContainer.tsx`, `coords.ts`, any store.
- Do not add the tool to `isGestureTool` (that is task 07's file).
- Never run `vitest -u`.

## Verification
```sh
cd client && bunx tsc --noEmit                      # exit 0
cd client && bunx eslint . 2>&1 | tail -3           # 0 errors (64 warnings baseline)
cd client && bunx vitest run 2>&1 | tail -6         # 117 files / 1984 tests pass baseline → all pass, count may grow
cd client && bun run lint:boundaries                # "all 5 boundary rules hold"
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # empty
```
Manual: `bun run dev:client`, open a project, press `R` → the Reflection button is
highlighted; click it → same; the cursor stays a crosshair; clicking the canvas does
nothing.

## Definition of done
- [ ] `Tool` has 17 members and `tsc` exits 0.
- [ ] `TOOLS_ARE_EXHAUSTIVE` still typechecks with an empty `reflection` entry.
- [ ] `R` and `r` select the tool; keyboard test updated and green.
- [ ] Toolbar shows the button after Ellipse with the `FlipHorizontal` icon.
- [ ] Full vitest run green with no snapshot updates; no lockfile.
