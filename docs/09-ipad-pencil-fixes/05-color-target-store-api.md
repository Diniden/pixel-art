# 05 — One color-target-aware setter, plus edge/fill swap

**Wave:** W2 · **Depends on:** none (but W2 so 06/07 can build on it)
**Touches:** `client/src/stores/ui/ToolUIStore.ts` · `client/src/stores/ApplicationStore.ts` · `client/src/stores/ui/__tests__/colorTarget.test.ts` (new)
**Effort:** M

## Objective

After this task the application store exposes a **single** way to set "the current
color" that honours `colorTarget`, and a swap action that exchanges the edge and fill
colors. Nothing in the UI has changed yet — tasks 06 and 07 rewire the call sites onto
these methods. This task is the API those tasks consume.

## Context

### The state, as it exists today (2026-09-06)

All three fields live in **`client/src/stores/ui/ToolUIStore.ts`**:

| Field | Line | Notes |
|---|---|---|
| `selectedColor: Color` | 59 | This is the **EDGE** color. The name is legacy wire format — lines 52–58 explain why it is not renamed. **Do not rename it.** |
| `fillColor: Color \| undefined` | 72 | Tri-state; `undefined` means "key absent from the project file" |
| `colorTarget: "edge" \| "fill"` | 137 | Defaults `"edge"`. **Not persisted** — deliberate, see lines 131–136 |

Setters: `setColor` (303–305), `setFillColor` (307–309), `setColorTarget` (311–313).
Accessor: `get fillColorOrSelected()` (324–326) → `this.fillColor ?? this.selectedColor`.
Observability at 154–171: `selectedColor` and `fillColor` are `observableRef`,
`colorTarget` is `observable`. Hydration at 484–485.

`ApplicationStore.ts` has `setColorAndAddToHistory` (1760–1766) and `adjustColor`
(which calls `ui.tool.setColor` at 1623–1625). **Both are edge-only by construction**,
and `ApplicationStore` has **no `setFillColor` wrapper at all**.

### Who already branches correctly (the pattern to lift)

`client/src/containers/ColorPickerContainer.tsx:116-120` is the only correct branch in
the codebase:
```ts
onSetColor: (color) => {
  if (ui.tool.colorTarget === "fill") ui.tool.setFillColor(color);
  else app.setColorAndAddToHistory(color);
}
```
Note the asymmetry it encodes: **only the edge path adds to `colorHistory`.** Preserve
that — `colorHistory` is the edge/recent-colors strip and the owner expects it to track
the drawing color. Record the decision in the new method's doc comment.

### Traps

- **Wire format.** `colorTarget` must stay unpersisted. `fillColor` stays a tri-state
  conditional key (slot 32a in `UIStore.toPersistedUIState()`). **This task adds no new
  persisted field**, so the 151 corpus snapshots are untouched — keep it that way.
- **Swap with an undefined fill.** `fillColor` is tri-state. Swapping when
  `fillColor === undefined` must not write `undefined` into `selectedColor` (which is a
  non-optional `Color`). Define the semantics explicitly: when `fillColor` is
  `undefined`, treat the effective fill as `fillColorOrSelected` (i.e. the edge color),
  which makes the swap a no-op *value-wise* but must still **materialise** `fillColor` so
  the two slots become independently editable afterwards. Write this reasoning into the
  method's doc comment — it is the subtle part.
- **History.** A swap is a user-visible state change. Wire it through
  `app.saveStateToHistory(label)` the way `ColorPickerContainer.tsx:131` does, so it is
  undoable as one step.
- `ToolUIStore` is a store, so MobX applies: register any new action in the existing
  `makeObservable`-style block alongside the current setters (see lines 154–171) and
  match the file's conventions exactly.

## Steps

1. **`ToolUIStore.ts`** — add `swapColors(): void` next to the existing setters (after
   `setColorTarget`, ~line 313). It exchanges `selectedColor` and the effective fill:
   read `const nextEdge = this.fillColorOrSelected; const nextFill = this.selectedColor;`
   then assign both. Because both fields are `observableRef` and are replaced wholesale,
   a plain assignment inside an action is correct. Register it in the observability block
   as an `action`, matching the surrounding style.

2. Give `swapColors` a doc comment covering the `undefined` case per the trap above.

3. **`ApplicationStore.ts`** — add two methods beside `setColorAndAddToHistory` (~1766):
   - `setActiveColor(color: Color): void` — the single target-aware setter. Branches on
     `this.ui.tool.colorTarget`: `"fill"` → `this.ui.tool.setFillColor(color)`;
     otherwise → `this.setColorAndAddToHistory(color)`. Doc-comment the history
     asymmetry (edge adds to `colorHistory`, fill does not) and cite
     `ColorPickerContainer.tsx:116-120` as the behaviour being generalised.
   - `swapEdgeAndFillColors(): void` — calls `this.saveStateToHistory("Swap colors")`
     then `this.ui.tool.swapColors()`. Check how `saveStateToHistory` is called elsewhere
     in `ApplicationStore` and match the label convention you find.
   - Also add `get activeColor(): Color` returning
     `colorTarget === "fill" ? fillColorOrSelected : selectedColor`, so read sites in
     tasks 06/07 have one accessor instead of re-deriving the branch.

4. **Commit** ("feat(color): target-aware setter and edge/fill swap on the store").

5. **New test `client/src/stores/ui/__tests__/colorTarget.test.ts`.** Follow the setup
   conventions of the existing `client/src/stores/ui/__tests__/fillColor.test.ts` — read
   it first; it is the sibling suite that already pins this area. Cover:
   - `setActiveColor` with `colorTarget === "edge"` writes `selectedColor` **and** appends
     to `colorHistory`;
   - `setActiveColor` with `colorTarget === "fill"` writes `fillColor` and does **not**
     touch `colorHistory` or `selectedColor`;
   - `activeColor` returns the right slot in both modes;
   - `swapColors` with both slots set exchanges them;
   - `swapColors` with `fillColor === undefined` leaves `selectedColor` unchanged in
     value, materialises `fillColor`, and never assigns `undefined` to `selectedColor`;
   - `swapEdgeAndFillColors` produces exactly one history entry.

6. **Commit** ("test(color): pin target-aware set and swap").

## Constraints

- **Do not rename `selectedColor`.** It is the wire-format name (`ToolUIStore.ts:52-58`).
- Do not persist `colorTarget`.
- Do not add any new key to `toPersistedUIState()`. This task must leave the wire format
  byte-identical.
- Do not modify any container or `ui/` file — tasks 06 and 07 own those.
- Do not remove `setColorAndAddToHistory`; existing callers keep working until 06/07
  rewire them.
- Do not deep-observe a pixel grid.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures — the corpus suite MUST pass unchanged
bun run build
```

⚠️ `ApplicationStore.ts` and `stores/ui/` are inside the data-safety perimeter. Confirm
the corpus snapshots pass **unchanged** and never run `vitest -u`.

**Manual check:**

1. Start the app (`bun run dev`), open the color picker, switch between the Edge and Fill
   tabs and pick colors → behaviour is exactly as before this task. This task adds API
   without changing any wiring, so **no behaviour should change at all**. If something
   changes visibly, you have wired a call site that belongs to task 06 or 07.

## Definition of done

- [ ] `ToolUIStore.swapColors()` exists, is a registered MobX action, and documents the `undefined`-fill case.
- [ ] `ApplicationStore.setActiveColor()`, `.swapEdgeAndFillColors()` and `.activeColor` exist.
- [ ] `setActiveColor` preserves the history asymmetry (edge adds to `colorHistory`, fill does not).
- [ ] No new persisted key; `toPersistedUIState()` is unchanged.
- [ ] `colorTarget.test.ts` covers all six cases listed in step 5.
- [ ] The corpus suite passes unchanged; no `vitest -u` was run.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] The manual check confirms **no** visible behaviour change.
