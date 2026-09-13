# 01 — Register the `"brush"` tool

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/domain.ts` · `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `client/src/ui/components/Toolbar/PixelStudioTools.tsx` · `client/src/ui/components/Toolbar/__tests__/PixelStudioTools.dom.test.tsx` · `client/src/containers/PixelStudioToolsContainer.tsx` · `client/src/containers/brush/brushToolContext.ts` (+ `client/src/containers/brush/__tests__/brushToolContext.test.ts` only if it pins the inert set) · `client/src/containers/otherHand/toolWidgets.ts`
**Effort:** S

## Objective
`"brush"` is a member of the pixel studio's `Tool` union with a toolbar button (after the Eraser,
lucide `Paintbrush`, hotkey `B`), a keyboard binding, a placeholder handler entry so the
exhaustiveness gate compiles, an Other-Hand title, and it is hidden and inert inside the Brush
Studio. Nothing draws yet (task 05). Every corpus snapshot is byte-identical.

## Context
- The union: `client/src/types/domain.ts:458-476` (18 members, `"pixel"` is the pencil). `StudioMode`
  at `:480` also contains the string `"brush"` — a different type; do not confuse the two.
- **Exhaustiveness gate:** `client/src/ui/canvas/tools/toolHandlers.ts:293-301`
  `TOOLS_ARE_EXHAUSTIVE: AssertSame<HandledTool, DomainTool> = true` — adding a `Tool` member without
  a table entry fails `tsc`. The table is `:196-278`; inert tools use `{}` (e.g. `move: {}`). Add
  `brush: {}` with a comment "placeholder — docs/12-pixel-brush-tool task 05 fills it".
- Hotkeys: `client/src/ui/hooks/useCanvasKeyboard.ts` — `HotkeyTool` union `:45-59` (13 members),
  `TOOL_HOTKEYS` `:74-91` (`"1"…"0"`, `g/G`, `o/O`, `r/R`, `p/P`; `"4"` deliberately vacant). Test
  `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts:353-380` — `it("maps all 13 tools")`,
  `expect(tools.size).toBe(13)`, `expect(TOOL_HOTKEYS["4"]).toBeUndefined()`, a per-entry loop at `:379`.
  `b`/`B` are free (taken: digits, g, o, r, p, x, backtick, w/a/s/d, arrows).
- Toolbar: `client/src/ui/components/Toolbar/PixelStudioTools.tsx` — `tools` registry `:96-133`
  (`{ id, icon, label, hotkey }`, 13 rows; pencil `"1"`, eraser `"2"`, eyedropper `"3"` …), lucide
  imports `:22-42`, `hiddenTools` filter `:325-330`. `Paintbrush` exists in the installed lucide
  (`node_modules/lucide-react/dist/esm/icons/paintbrush.js`). Test
  `client/src/ui/components/Toolbar/__tests__/PixelStudioTools.dom.test.tsx:53,66,82` hard-codes
  counts `13`, `12`, `12` — read each test to see what it counts (visible rows, brush-mode rows…) and
  **recount** rather than assume.
- Brush studio hides tools that are meaningless there:
  `client/src/containers/PixelStudioToolsContainer.tsx:30` `BRUSH_HIDDEN_TOOLS` (`origin`,
  `reference-trace`), passed at `:92`. The brush studio's handler classification:
  `client/src/containers/brush/brushToolContext.ts:200` `BRUSH_INERT_TOOLS` (`origin`, `reference-trace`,
  `reflection`, `pose`, `normal-pencil`, `auto-normal`, `height-map`), `isBrushInertTool :210`. Check
  `client/src/containers/brush/__tests__/brushToolContext.test.ts` for a test enumerating that set;
  if one exists, extend it minimally and flag it.
- Other-Hand rail: `client/src/containers/otherHand/toolWidgets.ts:24-41` `TOOL_TITLES:
  Partial<Record<Tool, string>>` — add `brush: "Brush"`; the `switch (tool.selectedTool)` at `:214`
  needs no case (unknown tools yield an empty widget list and the rail's empty message).
- Other tool switches compile as-is (they compare strings): `CanvasInfo.tsx:161-183`,
  `RightSidebarTopControls.tsx:111-128`, `ReferenceUIStore.ts:223`, `ToolUIStore.ts:247,305,329,502,626`.
- `selectedTool` is persisted as a string (`UIStore.ts:423`); the codec layer never enumerates tools,
  so the union edit must not change any snapshot. `client/src/types/__tests__/roundtrip.test.ts` and
  `migrations.test.ts` pin 151 corpus digests — run them and check `git status` shows no
  `__snapshots__` change.

## Steps
1. `types/domain.ts`: add `| "brush"` at the end of the `Tool` union with a two-line comment
   ("Stamps the brush document open in the Brush Studio onto the pixel canvas. See
   docs/12-pixel-brush-tool/."). Do not touch `StudioMode`.
2. `toolHandlers.ts`: add `brush: {}` to the table (placeholder comment as above). `tsc` must be
   clean after this step.
3. `useCanvasKeyboard.ts`: add `"brush"` to `HotkeyTool`; add `b: "brush", B: "brush"` to
   `TOOL_HOTKEYS`; update the "13" in the doc comment. Update the test: 14 tools, `"4"` still
   undefined, `TOOL_HOTKEYS.b === "brush"` and `TOOL_HOTKEYS.B === "brush"`; make sure the
   per-entry loop at `:379` covers the new key.
4. `PixelStudioTools.tsx`: import `Paintbrush` from `lucide-react`; insert
   `{ id: "brush", icon: Paintbrush, label: "Brush (stamps the open brush project)", hotkey: "B" }`
   **directly after the eraser row**. Update the dom test counts (recount) and add one assertion
   that a button with the Brush label exists and is absent when `hiddenTools` contains `"brush"`.
5. `PixelStudioToolsContainer.tsx`: add `"brush"` to `BRUSH_HIDDEN_TOOLS` with a comment ("a brush
   cannot stamp itself"). `brushToolContext.ts`: add `"brush"` to `BRUSH_INERT_TOOLS` with the same
   comment; extend its test only if it enumerates the set.
6. `toolWidgets.ts`: `brush: "Brush"` in `TOOL_TITLES`.
7. Run Verification. Commit: `pixel-brush(01): register the "brush" tool — union, hotkey B, toolbar row, hidden in brush studio`.

## Constraints
- Do not add drawing behaviour, a `ToolContext` field, or a footprint class (task 05).
- Do not edit `LightingUIStore.setStudioMode`, `ToolUIStore`, `UIStore`, any codec, any snapshot.
- Do not extend `isBrushTool` (`toolFootprint.ts`).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/types src/ui/canvas/tools src/ui/hooks src/ui/components/Toolbar src/containers
cd client && bunx vitest run src/ui/hooks src/ui/components/Toolbar src/containers/brush src/containers/otherHand src/types
cd client && bunx vitest run                    # whole suite once — the 151-digest corpus must be untouched
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && git status --short                    # must list NO __snapshots__ file
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, `bun run dev`, pixel mode): a Brush button sits after the Eraser with a paintbrush
icon and "B" printed; pressing `B` selects it (crosshair cursor, nothing paints yet); in the Brush
Studio the button is absent and `B` does nothing visible.

## Definition of done
- [ ] `"brush"` in `Tool` and `HotkeyTool`; `b`/`B` bound; toolbar row after the eraser; placeholder handler.
- [ ] Hidden in `BRUSH_HIDDEN_TOOLS`, inert in `BRUSH_INERT_TOOLS`; `TOOL_TITLES.brush` set.
- [ ] All counts recounted in tests; full suite green; no snapshot changed; one commit with only Touches files.
