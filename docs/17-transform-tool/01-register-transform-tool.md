# 01 — Register the `"transform"` tool

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/domain.ts` · `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `client/src/ui/components/Toolbar/PixelStudioTools.tsx` · `client/src/ui/components/Toolbar/__tests__/PixelStudioTools.dom.test.tsx` · `client/src/containers/PixelStudioToolsContainer.tsx` · `client/src/containers/brush/brushToolContext.ts` · `client/src/containers/brush/__tests__/brushToolContext.test.ts` · `client/src/containers/otherHand/toolWidgets.ts`
**Effort:** S

## Objective
`"transform"` is a member of the pixel studio's `Tool` union with a toolbar button after Selection
(lucide `Scaling`, hotkey `T`), a keyboard binding, an empty handler entry so the exhaustiveness
gate compiles, an Other-Hand title, and it is hidden and inert inside the Brush Studio. Selecting
it does nothing on the canvas yet (task 10). Every corpus snapshot is byte-identical.

## Context
- The exact analogue is `docs/12-pixel-brush-tool/01-register-brush-tool.md` (the `"brush"` tool);
  this task's file list is that list. Read that task file first.
- `types/domain.ts` `Tool` union `:458-481` (`"brush"` last). Add `| "transform"` after it with a
  two-line comment ("Scales / rotates / moves the pixels under the selection; degrades to the
  Selection tool when nothing is selected. See docs/17-transform-tool/."). `selectedTool` persists as
  a bare string, so the union edit changes no snapshot.
- `toolHandlers.ts`: gesture tools have empty entries (`selection: {}` `:281`, `pose: {}` `:287`) and
  `TOOLS_ARE_EXHAUSTIVE` (`:367`) fails `tsc` without one. Add `transform: {},` beside `selection`.
- `useCanvasKeyboard.ts`: `HotkeyTool` union `:46-60` (14 members), `TOOL_HOTKEYS` `:74-94` — `t`/`T`
  are free (verified). The hotkey branch `:221-230` clears the selection when switching **away from
  `"selection"`**; extend the condition so leaving `"transform"` clears it too (D1). Test
  `__tests__/useCanvasKeyboard.dom.test.ts` pins the count at `:353-380` (14 → 15) and the per-entry
  loop; add `t`/`T` assertions and one for the clear-on-leave parity.
- `PixelStudioTools.tsx` `tools[]` `:100-140`; the Selection row `:127-132` (`BoxSelect`, hotkey `"0"`).
  Insert the Transform row **directly after** it. `hiddenTools` filter `:334-337`. Dom test counts
  buttons — recount.
- `PixelStudioToolsContainer.tsx` `BRUSH_HIDDEN_TOOLS :30-35`; `brushToolContext.ts` `BRUSH_INERT_TOOLS
  :202-212` (+ its test only if it enumerates the set); `toolWidgets.ts` `TOOL_TITLES :24-41`.
- Pattern: pure `ui/` files for the toolbar and hooks; containers for the two sets; no store change.

## Steps
1. `types/domain.ts`: add the union member. `toolHandlers.ts`: add `transform: {}` with a one-line
   comment ("arbitrated in `CanvasContainer` ahead of the table, like `selection`"). `tsc` clean.
2. `useCanvasKeyboard.ts`: `"transform"` in `HotkeyTool`; `t: "transform", T: "transform"`; update
   the doc-comment count; extend the clear-on-leave condition. Update the dom test (15 tools; `t`/`T`;
   leaving `"transform"` with a selection calls `clearSelection`).
3. `PixelStudioTools.tsx`: import `Scaling`; insert
   `{ id: "transform", icon: Scaling, label: "Transform (scale / rotate the selection)", hotkey: "T" }`
   after the Selection row; update the dom test (count; a button with the Transform label exists and
   is absent when `hiddenTools` contains `"transform"`).
4. `PixelStudioToolsContainer.tsx`: add `"transform"` to `BRUSH_HIDDEN_TOOLS` (comment: "the brush
   studio has its own selection model"). `brushToolContext.ts`: add to `BRUSH_INERT_TOOLS` with the
   same comment; extend its test only if it enumerates the set. `toolWidgets.ts`: `transform: "Transform"`.
5. Run Verification. Commit: `transform(01): register the "transform" tool — union, hotkey T, toolbar row, hidden in brush studio`.

## Constraints
- No canvas behaviour, no `ToolContext` field, no `isGestureTool` edit (task 10), no footprint class.
- Do not touch `ToolUIStore`, `UIStore`, `SelectionUIStore`, any codec, any snapshot.
- Do not extend `isBrushTool` (`toolFootprint.ts`) or `MOUSE_ONLY_TOOLS` (`useCanvasPointer.ts`).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/types src/ui/canvas/tools src/ui/hooks src/ui/components/Toolbar src/containers   # 0 errors, warnings ≤ 66 overall
cd client && bunx vitest run src/ui/hooks src/ui/components/Toolbar src/containers/brush src/containers/otherHand src/types
cd client && bunx vitest run                    # whole suite once — corpus digests untouched
cd client && bun run lint:boundaries
cd client && bunx storybook build
git status --porcelain | grep __snapshots__     # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (`bun run dev`, pixel mode): a Transform button sits after Selection with the scaling icon and
"T" printed; pressing `T` selects it (crosshair, nothing happens on the canvas yet); in the Brush
Studio the button is absent and `T` does nothing visible.

## Definition of done
- [ ] Union, handler entry, hotkey, toolbar row, hidden/inert sets, Other-Hand title all present.
- [ ] Dom tests updated (15 tools; toolbar count; hidden case; clear-on-leave parity) and green.
- [ ] Full client suite green with no snapshot change; storybook builds; boundaries 5/5.
- [ ] Manual check performed and recorded.
- [ ] One commit `transform(01):`; no lockfile.
