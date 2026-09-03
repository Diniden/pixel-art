# 01 — Register the `pose` tool

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/domain.ts` · `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `client/src/ui/components/Toolbar/PixelStudioTools.tsx`
**Effort:** S

## Objective

`"pose"` exists as an 18th member of the `Tool` union, is selectable from the pixel-studio
toolbar and by pressing `P`, and passes the compile-time exhaustiveness gate. Selecting it
changes nothing visible yet beyond the button's active state — no overlay, no rail section.
This task is purely the registration surface every later task depends on.

## Context

The refresh is **complete**: everything you touch is already in the target architecture.
Nothing under `client/src/ui/` may import a store, the API, `services/`, MobX, or call
`useContext` — type-only imports included.

There are exactly **five registration gates**, and missing any one of them either fails
`tsc` or leaves the tool unreachable:

1. **`client/src/types/domain.ts:333-350`** — the `Tool` union. 17 members today. It is a
   plain string union, not an enum.

2. **`client/src/ui/canvas/tools/toolHandlers.ts:186-265`** — the dispatch table,
   `Record<Tool, ToolHandler>`. Pose is a **gesture tool**: it never writes pixels through
   the tool table (its drag pans the model, its double-click stamps via a different path in
   task 08). It therefore gets an **empty entry**, `pose: {}`, exactly like `reflection` at
   `:256`. The file header at `:29-37` documents this "tools with no entry body" category —
   `reference-trace`, `normal-pencil`, `auto-normal`, `height-map` and `reflection` are all
   already in it.

3. **`client/src/ui/canvas/tools/toolHandlers.ts:289`** —
   `export const TOOLS_ARE_EXHAUSTIVE: AssertSame<HandledTool, DomainTool> = true;`
   This is a compile-time gate: adding a union member without a table entry is a **`tsc`
   failure**, not a silent gap. Do not weaken it.

4. **`client/src/ui/hooks/useCanvasKeyboard.ts`** — `HotkeyTool` at `:44-57` and
   `TOOL_HOTKEYS` at `:70-86`. **`p`/`P` is free** — the map is
   `1,2,3,5,6,7,8,9,0,g,G,o,O,r,R` (verified 2026-09-02). ⚠️ **Both cases** must be added
   (`p` and `P`): the lookup is by raw `e.key`, which is case-sensitive, and the existing
   `g`/`o`/`r` entries are each listed twice for exactly this reason. ⚠️ Two doc comments
   there carry **counts that go stale**: `HotkeyTool` is described as "A subset of the
   17-member `Tool` union" and `TOOL_HOTKEYS` as "The 12 tool hotkeys". Update both.

5. **`client/src/ui/components/Toolbar/PixelStudioTools.tsx:90-123`** — the `tools[]`
   array, typed `{ id: Tool; icon: LucideIcon; label: string; hotkey: string }[]`, 12
   entries today. Reflection's entry at `:104-109` is the template:

   ```ts
   { id: "reflection", icon: FlipHorizontal, label: "Reflection (mirror across lines)", hotkey: "R" },
   ```

   Each entry is rendered by the `ToolButton` sub-component (`:137-273`), which already
   supplies the tooltip and the active/alternate classes — you add data, not markup.

**Locked decisions (MASTER D1):** id `"pose"`, hotkey `P`, lucide icon **`Box`**, label
`"Pose (3D reference)"`, positioned **after `origin`**, last in the array.

⚠️ **The worktree is dirty.** An unrelated edge/fill-colour split has uncommitted changes in
**`types/domain.ts` and `PixelStudioTools.tsx`** — two of your five files. Stage only your
own hunks with `git add -p`. Never revert or commit someone else's work.

⚠️ Do **not** add pose to `client/src/containers/otherHand/toolWidgets.ts`. Reflection is
not there either and falls through to `default`; pose does the same. It is explicitly out of
scope.

## Steps

1. Add `| "pose"` to the `Tool` union in `client/src/types/domain.ts`, after `"origin"`.
   Keep the existing comment style; a one-line comment noting it is a gesture/reference tool
   is appropriate.
2. Add the empty entry `pose: {},` to the `toolHandlers` table in
   `client/src/ui/canvas/tools/toolHandlers.ts`, next to `reflection`. Extend the file
   header's "Tools with no entry body" paragraph to name `pose` and say why (it is a
   reference overlay; its gestures are arbitrated in the container ahead of the table).
3. Run `bunx tsc --noEmit` from `client/`. It must pass — this proves the exhaustiveness
   gate accepted the pair. If it fails, you have missed the table entry.
4. Add `p`/`P` → `"pose"` to `HotkeyTool` and `TOOL_HOTKEYS` in
   `client/src/ui/hooks/useCanvasKeyboard.ts`.
5. Extend `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` with a case
   asserting `p` selects `"pose"`, matching the existing cases' style.
6. Add the toolbar entry to `tools[]` in
   `client/src/ui/components/Toolbar/PixelStudioTools.tsx`, importing `Box` from
   `lucide-react`. Place it **last**, after `origin`.
7. Run the full verification below. **Commit after step 7**, staging only your own hunks:
   `feat(pose): register the pose tool — union, handler table, hotkey P, toolbar button`.

## Constraints

- Do **not** implement any behaviour. No overlay, no rail section, no store, no gesture
  handling. Selecting pose must be inert and must not throw.
- Do **not** modify `AssertSame` or `TOOLS_ARE_EXHAUSTIVE` to make the build pass — if they
  complain, your table entry is missing.
- Do **not** add pose to `toolWidgets.ts` (Other Hand Mode) — out of scope.
- Do **not** touch `toPersistedUIState()`. `selectedTool` is already persisted and its type
  widens automatically; **no new key is added and no wire-format change occurs.**
- Do **not** reuse an icon already in the array (`Box` is unused — verify before committing).
- Stay inside the `Touches` list. `CanvasContainer.tsx` belongs to task 08.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors (warnings ok)
bunx vitest run                                     # all pass, incl. your new hotkey case
bun run lint:boundaries                             # OK, 5 rules
bunx stylelint "src/**/*.css"                       # exactly 2 errors (pre-existing baseline)
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # must print nothing
```

**Manual checks (not optional):**

1. `bun run dev` starts. The pixel-studio toolbar shows a **Box** icon as the last tool
   button, with the tooltip "Pose (3D reference)".
2. Clicking it makes it the active tool (active styling applies) and **nothing throws** —
   check the browser console is clean.
3. Pressing `P` selects it; pressing another tool's hotkey moves off it.
4. With pose selected, clicking and dragging on the canvas **does not draw anything** and
   does not throw. (It does nothing at all yet — that is correct for this task.)
5. Undo/redo still work normally after selecting pose.

## Definition of done

- [ ] `"pose"` is a member of the `Tool` union in `types/domain.ts`.
- [ ] `toolHandlers` has a `pose: {}` entry and the file header explains why it is empty.
- [ ] `bunx tsc --noEmit` exits 0, proving `TOOLS_ARE_EXHAUSTIVE` is satisfied unmodified.
- [ ] `p` and `P` select the tool via `TOOL_HOTKEYS`, with a passing test case.
- [ ] The toolbar renders a `Box` button last, labelled "Pose (3D reference)".
- [ ] `bunx eslint .` 0 errors; `bun run lint:boundaries` OK; stylelint still exactly 2 errors.
- [ ] No lockfile exists.
- [ ] All 5 manual checks performed and their results recorded in `HANDOFF.md`.
- [ ] One commit, containing **only** this task's hunks (no edge/fill-colour work).
