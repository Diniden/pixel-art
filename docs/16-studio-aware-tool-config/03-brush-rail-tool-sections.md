# 03 — The brush rail shows the selected tool's own section

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/containers/BrushStudioPanelContainer.tsx` · `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx`

**Effort:** M

## Objective

After this task the brush studio's right rail shows a section for **every tool that has one
and that the brush studio can honour** — not just the pencil and the eraser. Specifically:
the eyedropper gains a section explaining which delta slot a pick lands in, the shape tools
gain a section pointing at the Delta picker's Edge/Fill tabs, and the eraser/pencil sections
stay exactly as they are. The Delta picker stays at the top of the rail, always, because it
is the brush studio's colour picker.

Nothing in this task changes what the tools *do*. It closes the gap where selecting a tool
in the brush studio left the rail showing only a Delta picker with no indication that the
tool had any configuration at all.

## Context

### What the brush rail looks like today

`client/src/containers/BrushStudioPanelContainer.tsx` renders, in order:

1. `<Panel title="Delta">` wrapping `BrushDeltaPicker` — **ungated, always shown** (`:168-202`).
2. A "Pencil" size/max/shape section when `tool.selectedTool === "pixel"` (`:163`, `:204-212`).
3. An "Eraser" size/max/shape section when `tool.selectedTool === "eraser"` (`:164`, `:214-224`).

Both stroke sections are built by `renderStrokeControls` (`:94-151`) — a **render helper,
deliberately not a component**. Read its header at `:76-93` before touching this file: a
second capitalised component in this file trips
`react-refresh/only-export-components`, because that rule does not recognise the
`observer(...)` export as a component. This was measured, there is no precedent for a
disable comment anywhere in `containers/`, and the constraint still holds. **Every section
you add is another plain `renderX` function, lowercase, returning `ReactNode`.**

### The Delta picker IS the studio-aware colour picker — do not merge it into `ColorPicker`

The request asks for "the color picker can be passed the studio mode so they render with
color picking for deltas instead". That outcome already exists, achieved by composition
rather than by a mode flag, and the two pickers are **structurally incompatible** in ways
that make merging them a regression with no upside. Measured:

| | `ColorPicker` | `BrushDeltaPicker` |
| --- | --- | --- |
| Value type | `Color` = `{r,g,b,a}`, 0–255 | `BrushDelta` = 4 **signed** ints, −255..255 |
| Write granularity | whole colour: `onSetColor(color)` | one channel: `onChange(index, value)` |
| Row count | fixed: HSL 3 + RGB 3 + A 1, plus an SV square and a hue bar on `<canvas>` | dynamic: 4/4/3/1 from `BRUSH_CHANNELS[channelType]` |
| Undo | 300 ms debounce + `onSaveStateToHistory` | **none, and forbidden** — deltas are UI state (MASTER D17); the component header forbids adding one |
| History strip | recent colours | none |
| Empty state | none (container guards on `hasProject`) | `channelType === null` → "Select a layer" |
| Chrome | renders its own `panel` + header "Color" | bare div; the container supplies `Panel title="Delta"` |
| Lines | 945 | 359 |

A merged component would carry both value systems, both undo policies and both empty states
behind a flag — and `ColorPicker`'s own header (`:124-141`) documents an HSL-drift bug whose
fix depends on the current single-value-system shape. **Locked decision, MASTER §3 D1: the
two pickers stay separate.** Do not add a `studioMode` prop to `ColorPicker` in this task or
any other in this plan.

What the request actually needs — that picking a tool shows that tool's config, with colour
selection expressed in the brush studio's own delta vocabulary — is delivered by this task
plus task 02.

### Which tools need a section here, and what it says

From the measured per-tool table (evidence in task 01's Context and in
`containers/brush/brushToolContext.ts`):

| Tool | Brush-studio section | Source of truth |
| --- | --- | --- |
| `pixel` | Pencil size/max/shape — **exists, unchanged** | `:204-212` |
| `eraser` | Eraser size/max/shape — **exists, unchanged** | `:214-224` |
| `eyedropper` | **NEW.** A readout: a pick lands in the active delta slot. Shows which slot is active and nothing to configure | `BrushCanvasContainer.tsx:336-338` → `brushUI.setActiveDelta(delta)`; `brushToolContext.ts:450` |
| `line`, `rectangle`, `ellipse`, `fill-square`, `flood-fill`, `gaussian-fill` | **NEW.** One shared "Delta slots" readout naming which slot that tool paints with, so the user knows which Edge/Fill tab to edit | the per-tool table below |
| `move`, `selection` | nothing here | `move` is a gesture tool; `selection` gets its section in the Tool Options panel (tasks 02/04) |

The slot each tool paints with, measured in `containers/brush/brushToolContext.ts`:

- **edge**: `pixel` (`currentColor: DUMMY_TOOL_COLOR` `:646`), `line`
  (`shapeCommitCells` `:329` with no outline keys and `shapeMode !== "fill"`), `fill-square`
  (`squarePixelsAt` `:664-670`).
- **fill**: `flood-fill` and `gaussian-fill` (`fillAt` emits `DUMMY_FILL_COLOR` `:620`, wired
  at `:670-671`).
- **per `shapeMode`**: `rectangle`, `ellipse` — `"outline"`→edge, `"fill"`→fill,
  `"both"`→per pixel (`shapePointSlot` `:308-316`).
- **neither**: `eraser` writes `0` (`mapWritesToBrushCells` `:264`).

⚠️ **`gaussian-fill` is plain flood fill here** (`:670-671`: `gaussianFillAt: fillAt`). Its
readout must not promise smoothing or radius. Say it behaves as a flood fill on a delta grid.

### The pattern to follow

- MobX, not Zustand. `observer()` is already on the export and stays the only one in the
  file.
- Sections are composed from `ui/primitives/` — `Panel`, `SliderWithNumber`, `Field`,
  `Button`, and `EmptyState` if you need it. The reason this file composes primitives
  instead of reusing `PixelStudioPanel`'s markup is at `:26-35`: the pixel panel carries
  origin/reflection/pose sections that do not apply and its pencil/eraser markup is private.
  That reasoning covers your new sections too — **do not create a new `ui/` component** for
  them.
- Read `tool.selectedTool` once into a local, as the file already does (`:156`, `:163-164`).

### Traps

- **Never deep-observe a pixel grid** (`CLAUDE.md`). `brushes.document` is
  `observable.ref`; `brushUI.channelTypeIn(doc)` (`:161`) walks one frame's layer list for a
  channel type and touches no grid. Your new sections need `channelType`,
  `brushUI.deltaTarget` and `tool.shapeMode` — all cheap. **Do not read a layer's `cells`.**
- `tool.shapeMode` is a **shared** `ToolUIStore` field the brush canvas already reads
  (`BrushCanvasContainer.tsx:163`). Read it; do not add a brush-local copy.
- Do not gate the Delta picker on a tool. It is the studio's colour picker and is correctly
  ungated. A user needs it while any painting tool is selected, including the shape tools.
- `MAX_OPTIONS` (`:55`) and `isDeltaIndex` (`:66-68`) already exist. Reuse them.
- The existing test file's header (`:1-24`) lists four pinned behaviours (a)–(d). **Your
  edits must not weaken any of them**; add cases, do not rewrite the file.

## Steps

1. Read `BrushStudioPanelContainer.tsx` end to end, especially `:76-93` (why sections are
   render helpers) and `:26-35` (why no `ui/` component).

2. Add a module-level constant mapping each brush-studio painting tool to the slot it uses,
   with the citations from Context beside each entry. Keep it a plain frozen object at module
   scope so its identity is stable.

3. Add `renderSlotReadout({ tool, shapeMode, deltaTarget, channelType })`: a
   `Panel` (compact header, dense body) whose title names the tool and whose body states
   which slot it paints with. For `rectangle`/`ellipse`, branch on `shapeMode` and say
   "outline → Edge, interior → Fill" for `"both"`. For `gaussian-fill`, state that it
   behaves as a flood fill on a delta grid (no smoothing/radius). When `channelType === null`
   say the layer is unselected rather than naming a slot.

   Keep the copy short — one or two lines per tool. This is a readout, not documentation.

4. Add `renderEyedropperSection({ deltaTarget })`: names the slot a pick will land in and
   says it follows the Delta picker's active tab. No controls.

5. Wire them into the returned tree, AFTER the Delta panel and beside the existing pencil /
   eraser blocks, gated on `tool.selectedTool`. Order: Delta, then the selected tool's
   section. Only ever one tool section is shown, because the gates are mutually exclusive.

6. Commit: `feat(16): brush rail shows the selected tool's section`.

7. Extend `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` — add to
   it, do not restructure it. Use the existing harness verbatim (`:26-60`). Pin:
   - with `selectedTool="eyedropper"`, a section naming the **active** slot renders, and it
     changes when `brushUI.setDeltaTarget("fill")` is called;
   - with `selectedTool="flood-fill"`, the readout names **Fill**;
   - with `selectedTool="line"`, the readout names **Edge**;
   - with `selectedTool="rectangle"` and `tool.setShapeMode("both")`, the readout names both
     slots; with `"fill"` it names only Fill (⭐ the discriminating case — a readout hard-coded
     to Edge passes the `line` case and fails this one);
   - with `selectedTool="gaussian-fill"`, the readout does NOT mention smoothing or radius;
   - the Delta picker is present for **every** one of those tools (it must never be gated
     away);
   - the existing (a)–(d) assertions still pass unchanged.

8. Commit: `test(16): pin brush rail tool sections`.

## Constraints

- **Do not add a `studioMode` prop to `ColorPicker`, and do not mount `ColorPickerContainer`
  or `PaletteManagerContainer` in the brush studio.** Measured: nothing in
  `BrushCanvasContainer.tsx` or `containers/brush/*` reads `selectedColor`, `fillColor` or
  `colorTarget` — a colour picker there would edit state the brush canvas never consults.
  `PaletteManager` additionally sources every value from the pixel document
  (`domain.palettes`, `app.currentLayer`, `domain.pixelVersion`) and its currency is RGBA,
  which has no meaning as a signed delta.
- **Do not create a new file under `client/src/ui/`.** Compose primitives in this container,
  as the file already does, and as its header at `:26-35` requires.
- **Do not add a second capitalised component to this file** — `react-refresh` will reject
  it (`:76-93`). Lowercase `renderX` helpers only.
- Do not change any store. No new field, no new action. Every value your sections need
  already exists.
- Do not change what any tool does. This task is read-only with respect to behaviour.
- Do not touch `RightSidebarTopControls*` (task 02) or `BrushCanvasContainer.tsx` (task 04).
- Do not gate or move the Delta panel.

## Verification

```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx
cd client && bunx eslint src/containers/BrushStudioPanelContainer.tsx
cd client && bun scripts/check-boundaries.mjs
cd client && bunx vitest run
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

⚠️ Never pass the snapshot-update flag to vitest (`CLAUDE.md`). A differing corpus snapshot
means STOP and report.

The `react-refresh` rule is the one most likely to bite. Confirm eslint is actually checking
it for this file: the eslint command above must exit 0 **and** you must have added no
capitalised function. If you are unsure, add a throwaway `function Foo() { return null; }`,
confirm eslint FAILS, then remove it. Paste both outputs.

### Manual checks — NOT optional

`bun run dev`, Brush Studio, with a brush loaded and a layer selected:

1. Step through **pencil, eraser, eyedropper, line, rectangle, ellipse, fill-square,
   flood-fill, gaussian-fill, move, selection**. For each, say what the rail showed. The
   Delta panel must be present in all eleven.
2. **Eyedropper**: switch the Delta picker to Fill; the eyedropper readout updates to name
   Fill. Then pick a painted cell on the canvas and confirm the FILL sliders moved, not the
   edge ones.
3. **Rectangle**: set Shape to "both"; the readout names both slots. Drag a rectangle and
   confirm the outline is the edge delta and the interior the fill delta — i.e. the readout
   told the truth.
4. **No layer selected**: deselect the brush layer. The Delta picker shows "Select a layer"
   and your readouts do not name a slot or crash.
5. **Pixel studio regression**: switch to the pixel studio and confirm its rail is
   unchanged (this task touches no pixel-studio file, so any difference is a real problem).
6. **StrictMode**: switch tool → studio → tool repeatedly; no duplicated sections, no throw.

Report each individually with what you saw.

## Definition of done

- [ ] Sections exist for eyedropper and for every brush-studio painting tool; pencil and
      eraser sections unchanged.
- [ ] Every readout's slot claim matches `brushToolContext.ts`, with the citation in a
      comment.
- [ ] Delta panel still ungated and still first.
- [ ] No new `ui/` file; no new capitalised component in the container; no store change.
- [ ] `ColorPicker` and `PaletteManager` untouched and not mounted in the brush studio.
- [ ] Extended dom suite passes including the ⭐ `shapeMode` case; the original (a)–(d)
      assertions still pass.
- [ ] tsc, eslint (with the react-refresh liveness proof pasted), boundary probe, full
      vitest all green; no snapshot updated; no lockfile.
- [ ] All six manual checks performed and reported.
- [ ] Two commits (steps 6, 8).
