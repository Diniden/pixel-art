# 06 — Every color selection honours edge vs fill

**Wave:** W3 · **Depends on:** 05
**Touches:** `client/src/containers/PaletteManagerContainer.tsx` · `client/src/containers/ColorPickerContainer.tsx` · `client/src/containers/__tests__/PaletteManagerContainer.dom.test.tsx` (new or extended)
**Effort:** M

## Objective

After this task, clicking a swatch in the Palette Manager or the Current Palette sets the
**fill** color when the Fill tab is active and the **edge** color when the Edge tab is,
instead of always writing edge. "Add current color to palette" adds whichever slot is
active. `ColorPickerContainer` routes through the single store method added in task 05
rather than branching locally.

## Context

### The bug, exactly

**`client/src/containers/PaletteManagerContainer.tsx:177`**:
```ts
onSelectColor={(color) => ui.tool.setColor(color)}
```
`ui.tool.setColor` writes `selectedColor` — the **edge** slot — unconditionally. This one
callback is used by **both** consumer paths:
- the real palette swatches: `ui/components/PaletteManager/PaletteManager.tsx:236`
  → `onClick={() => onSelectColor(color)}`
- the pinned Current Palette row: `PaletteManager.tsx:172` →
  `ui/components/PaletteManager/CurrentPalette.tsx:157` (`handleSwatchClick`, deferred
  250 ms behind the double-tap timer at `CurrentPalette.tsx:56`).

So clicking any palette swatch always writes the edge slot, ignoring the Fill tab. It
also bypasses `setColorAndAddToHistory`, so palette picks never enter `colorHistory`.

**`PaletteManagerContainer.tsx:176`** — the "add current color to palette" prop is passed
`ui.tool.selectedColor`, so `PaletteManager.tsx:141-143`'s `handleAddCurrentColor` always
adds the **edge** color even on the Fill tab.

### What task 05 gave you

- `app.setActiveColor(color)` — branches on `colorTarget`, preserves the history
  asymmetry (edge adds to `colorHistory`, fill does not).
- `app.activeColor` — the getter for the currently-targeted slot.
- `app.swapEdgeAndFillColors()` — used by task 07, not here.

### The container conventions

`observer()` appears **only** under `client/src/containers/` — that is where these two
files live, and both are already observers. Containers wire stores to `ui/` components;
the `ui/` components themselves take props and callbacks and must not learn about
`colorTarget`. **Do not add a `colorTarget` prop to `PaletteManager.tsx`** — the container
resolves the target and the component stays ignorant.

### Traps

- `PaletteManagerContainer.tsx` also owns a pixel scan: a `useMemo` at lines 119–144 keyed
  on `domain.pixelVersion` (line 118), gated by `expanded` (108, 188), sorted at 162–168.
  **Do not disturb it** — it is the "colors used in this layer" list and it is
  `pixelVersion`-keyed precisely so it does not deep-observe the grid.
- `CurrentPalette.tsx` distinguishes single tap from double tap with a 250 ms timer
  (lines 26–46, 153–170); a double tap toggles color-adjustment mode. **You are not
  changing that component** — only what the container's `onSelectColor` does with the
  color it receives.
- `ColorPickerContainer.tsx:115` gates `colorAdjustment` to edge only:
  `ui.tool.colorTarget === "edge" && Boolean(colorAdjustment)`. **Leave that gate as it
  is** unless task 07's other-hand work requires otherwise — it is existing intended
  behaviour, not a bug in scope here.

## Steps

1. **`PaletteManagerContainer.tsx:177`** — replace
   `onSelectColor={(color) => ui.tool.setColor(color)}` with
   `onSelectColor={(color) => app.setActiveColor(color)}`. Add a short comment noting
   that this now honours `colorTarget` and that the fix covers both the palette grid and
   the pinned Current Palette row, since they share this one callback.

2. **`PaletteManagerContainer.tsx:176`** — change the "current color" value passed to
   `PaletteManager` from `ui.tool.selectedColor` to `app.activeColor`, so
   `handleAddCurrentColor` adds the active slot. Check the prop's name and type at
   `PaletteManager.tsx:141-143` before changing it; the type is `Color` either way.

3. **`ColorPickerContainer.tsx:116-120`** — replace the local branch in `onSetColor` with
   a call to `app.setActiveColor(color)`. Behaviour must be identical; this is
   deduplication so there is exactly one branch point in the app.
   ⚠️ Leave `onAdjustColor` (121–130) alone — it has a genuinely different fill path
   (`setFillColor` without the adjust pipeline) and collapsing it is a behaviour change
   this task does not own.

4. **Commit** ("fix(color): palette selection honours the edge/fill target").

5. **Test.** Check whether `client/src/containers/__tests__/PaletteManagerContainer.dom.test.tsx`
   exists; extend it if so, create it if not, following the conventions of the sibling
   suites in `client/src/containers/__tests__/`. Cover:
   - with `colorTarget === "edge"`, invoking `onSelectColor` writes `selectedColor` and
     appends to `colorHistory`;
   - with `colorTarget === "fill"`, it writes `fillColor` and leaves `selectedColor` and
     `colorHistory` untouched;
   - the "add current color" value follows `colorTarget`.

6. **Commit** ("test(color): palette selection respects the color target").

## Constraints

- Do not modify anything under `client/src/ui/` — `PaletteManager.tsx` and
  `CurrentPalette.tsx` stay exactly as they are. Their props and behaviour are unchanged;
  only the container's wiring changes.
- Do not touch `OtherHandRailContainer.tsx` or `CanvasContainer.tsx` — task 07 owns both.
- Do not disturb the `pixelVersion`-keyed pixel scan in `PaletteManagerContainer.tsx:118-144`.
- Do not change `onAdjustColor` or the `colorAdjustment` edge-only gate.
- `observer()` stays confined to `containers/`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures
bun run build
```

Prove no hardcoded edge write remains in this file:
```sh
cd client && grep -n "setColor(" src/containers/PaletteManagerContainer.tsx
```
Expect no `ui.tool.setColor(` call.

**Manual checks:**

1. Select the **Fill** tab in the color picker. Click a swatch in the Palette Manager →
   the **fill** color changes and the edge color does not.
2. Same on the pinned Current Palette row → fill changes, edge does not.
3. Switch to the **Edge** tab, click a palette swatch → the edge color changes **and the
   color appears in the recent-colors history strip** (this is new — palette picks
   previously bypassed history).
4. Double-tap a Current Palette swatch → color-adjustment mode still toggles, unchanged.
5. With the Fill tab active, use "add current color to palette" → the **fill** color is
   added.
6. Draw with the pencil and with a fill tool → both still use the colors you expect.

## Definition of done

- [ ] `PaletteManagerContainer.tsx` no longer calls `ui.tool.setColor`.
- [ ] Palette and Current Palette swatch clicks honour `colorTarget`.
- [ ] "Add current color to palette" uses `app.activeColor`.
- [ ] `ColorPickerContainer.onSetColor` delegates to `app.setActiveColor`.
- [ ] No file under `client/src/ui/` is in the diff.
- [ ] Container tests cover both targets.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All six manual checks performed and recorded.
