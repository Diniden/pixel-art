# 02 — Every input commits on blur, never on keystroke

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/primitives/NumberInput/NumberInput.tsx` · `client/src/ui/primitives/NumberInput/__tests__/NumberInput.dom.test.tsx` · `client/src/ui/components/ResizeModal/ResizeModal.tsx` · `client/src/ui/components/PreviewModal/PreviewModal.tsx` · `client/src/ui/components/ExportPreviewModal/ExportPreviewModal.tsx` · `client/src/ui/components/VariantSelectModal/VariantSelectModal.tsx` · `client/src/ui/components/LightingStudioPanel/LightControl.tsx` · `client/src/ui/components/PosePanel/PoseCameraGroup.tsx` · `client/src/ui/components/PosePanel/EulerInput.tsx` · `client/src/ui/components/AIInterpolate/steps/ReviewStep.tsx` · `client/src/ui/components/AIInterpolate/steps/ConfigureStep.tsx` · `client/src/ui/components/ObjectLibrary/dialogs/ObjectResizeDialog.tsx` · `client/src/ui/components/ObjectLibrary/dialogs/ObjectCreateDialog.tsx` · `client/src/ui/components/AiConfigPopover/AiConfigPopover.tsx` · `client/src/ui/components/ProjectSelectModal/ProjectSelectModal.tsx` · `client/src/ui/components/FrameTagsModal/FrameTagsModal.tsx` · `client/src/ui/components/PosePanel/PosePresetList.tsx`
**Effort:** L

## Objective

After this task, no text or number field in the application updates application state on
keystroke. Every one of them keeps a local draft while typing and commits **on blur, on
Enter, and only then**. Escape reverts the draft. Typing `10` into a field whose minimum
is `1` no longer snaps to `1` after the first character, and clearing a field no longer
writes a value.

## Context

### The measured baseline (2026-09-06)

There **is** a shared primitive and it has **zero adoption**.

**`client/src/ui/primitives/NumberInput/NumberInput.tsx`** — props at lines 23–37:
```ts
export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className" | "onChange" | "value" | "min" | "max" | "step"
> {
  value: number; min?: number; max?: number; step?: number;
  onChange: (value: number) => void;
  boxed?: boolean; label?: string; className?: string;
}
```
Its current commit semantics are **hybrid**, and that hybrid is itself part of the bug:
- lines 60–65 hold a local `draft` string, re-synced from `value` during render;
- lines 77–89 (`handleChange`) commit **live** when the typed value parses finite *and*
  is already in range: `if (next === parsed && next !== value) onChange(next);`
- lines 67–75 (`commit`) clamp and are called from blur and Enter (lines 104–111).

So in-range keystrokes still fire `onChange`. **That live branch must go.**

`NumberInput` is imported by exactly one file: `SliderWithNumber.tsx:80`. `Slider`
(`ui/primitives/Slider/Slider.tsx`) is imported only by `SliderWithNumber.tsx:70`.
`SliderWithNumber` and `Field` have **zero production usages**.

Three components carry comments explaining why they were deliberately not migrated —
`LightControl.tsx:80-107` ("⚠️ `SliderWithNumber` DELIBERATELY NOT ADOPTED FOR THESE 3
ROWS", about row wrapper / `style` forwarding) and `BrushControls.tsx:17` ("task 36 owns
wholesale primitive adoption"). Task 36 never ran. **This task does not do wholesale
adoption** — it adopts `NumberInput` for `type="number"` fields only, and leaves layout,
sliders and `Field` alone.

### The 21 `type="number"` sites, all committing live with an inline clamp

| File | Lines |
|---|---|
| `ResizeModal.tsx` | 69, 87 |
| `PreviewModal.tsx` | 504 |
| `ExportPreviewModal.tsx` | 536 |
| `VariantSelectModal.tsx` | 323, 334 |
| `LightControl.tsx` | 125, 152, 180, 262 |
| `PoseCameraGroup.tsx` | 194 |
| `EulerInput.tsx` | 261, 362 |
| `ReviewStep.tsx` | 84 |
| `ConfigureStep.tsx` | 306 |
| `ObjectResizeDialog.tsx` | 61, 72 |
| `ObjectCreateDialog.tsx` | 56, 67 |

`ColorPicker.tsx:583, 613, 644, 679, 714` are also in this list **but are owned by task
03** — do not touch `ColorPicker.tsx`.

The canonical broken pattern (`ResizeModal.tsx:69-83`):
```tsx
<input type="number" value={width}
  onChange={(e) => setWidth(Math.max(1, Math.min(maxSize, parseInt(e.target.value) || 1)))}
  min={1} max={maxSize} />
```
This is precisely the "can't clear the field / can't type 10 because it snaps to 1" bug.

### The 7 live `type="text"` sites

`AiConfigPopover.tsx:138`, `ProjectSelectModal.tsx:167`, `FrameTagsModal.tsx:144`,
`PosePresetList.tsx:108`, `CameraAdvanced.tsx:401`. (`ColorPicker.tsx:557` — task 03.)

### The correct hand-rolled analogue already in the repo

`client/src/ui/components/PosePanel/CameraAdvanced.tsx:258-269` — `NumberField`:
```tsx
onChange={(e) => onDraft(name, e.target.value)}
onBlur={() => onBlur(name)}
```
Draft in, commit on blur. That is the shape. Also see `Header.tsx:282` and
`PaletteManager.tsx:195` for the text equivalent with Enter/Escape.

### Traps

- **`type="range"` sliders are NOT in scope.** A slider that only updated on release
  would be unusable. Leave all 27 range inputs alone.
- **Checkbox, color and file inputs are not in scope.**
- **Do not change any layout or CSS.** `NumberInput` renders a bare `<input
  className="number-input …">`; several call sites wrap their input in a labelled row.
  Keep the wrapper markup, swap only the `<input>` element. If a site's CSS targets
  `input[type="number"]` directly it still matches — `NumberInput` renders
  `type="number"`.
- **Global spinner suppression already exists** at `styles/reset.css:140-150`. Do not
  re-add per-component spinner CSS.
- **`ui/` boundary**: every file here is under `ui/` and may not import a store, the API,
  or MobX.
- **Controlled-value resync**: when the parent's `value` prop changes from outside
  (undo, a store update, a preset load) the draft must follow. `NumberInput` already does
  this at lines 60–65 — preserve that behaviour when you remove the live branch.

## Steps

1. **Fix the primitive first.** In `NumberInput.tsx`, delete the live-commit branch in
   `handleChange` (lines 77–89) so `handleChange` **only** updates the local draft.
   Keep `commit()` (67–75) and its blur/Enter wiring (104–111). Add Escape handling:
   revert the draft to `String(value)` and blur the element. Update the module header to
   state the contract in one sentence: *"Commits on blur and Enter only. Keystrokes
   update a local draft and never call `onChange`."*

2. **Update `NumberInput`'s existing test.**
   `client/src/ui/primitives/NumberInput/__tests__/NumberInput.dom.test.tsx` already
   exists and has a `__snapshots__/` folder beside it. **Read it first** — it may
   currently *assert* the live-commit behaviour you are removing, in which case the
   correct move is to rewrite that assertion, not to work around it.
   ⚠️ If a snapshot changes, read the diff and confirm by eye that the change is the
   intended one. These are component snapshots, not the corpus — but the house rule
   stands: **never run `vitest -u`.** Update a snapshot only by deliberate edit.
   Add assertions: typing does **not** call `onChange`; blur commits the clamped value;
   Enter commits; Escape reverts without calling `onChange`; an external `value` change
   updates the displayed draft. Run `cd client && bunx vitest run
   src/ui/primitives/NumberInput` and paste the output.

3. **Commit** ("fix(ui): NumberInput commits on blur and Enter only").

4. **Migrate the 21 `type="number"` sites** listed above, file by file. For each:
   replace the raw `<input type="number" … onChange={inline clamp} />` with
   `<NumberInput value={…} min={…} max={…} step={…} onChange={…} />`, moving the clamp
   bounds from the inline expression into the `min`/`max` props and deleting the inline
   `Math.max(…Math.min(…))`. Keep every surrounding element, class name and label.
   Commit per file or in small related groups — **not one giant commit.**

5. **Migrate the 7 live `type="text"` sites.** These stay raw `<input>` (there is no text
   primitive and creating one is out of scope). For each, add a local draft
   `useState<string>`, set `value` from the draft, `onChange` updates only the draft,
   `onBlur` commits, `onKeyDown` commits on Enter and reverts on Escape, and a
   `useEffect` resyncs the draft when the incoming prop changes. Copy the shape from
   `CameraAdvanced.tsx:258-269` and `Header.tsx:282`.
   ⚠️ `ProjectSelectModal.tsx:167` and `FrameTagsModal.tsx:144` may drive a live filter
   or an as-you-type list. **Read each call site before changing it** — if the field is a
   *search/filter* box whose whole purpose is live narrowing, leave it live and record
   that exception in `HANDOFF.md` under Deviations with one line of reasoning.

6. **Commit** the text-field batch.

7. Run the full gate and paste real output.

## Constraints

- Do not touch `client/src/ui/components/ColorPicker/ColorPicker.tsx` — task 03 owns it.
- Do not touch any `type="range"`, `type="checkbox"`, `type="color"` or `type="file"` input.
- Do not adopt `Field`, `Slider` or `SliderWithNumber`; do not rewrite any component's
  layout. This is a commit-semantics change, not the deferred task-36 adoption sweep.
- Do not change the `styles/reset.css` input rules.
- Do not change any component's props signature. The change is internal to each file.
- Nothing under `client/src/ui/` may import a store, the API, or MobX.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warning count must not exceed 65
bun run test             # 0 failures
bun run build
```

Then prove the sweep is complete — this must return **only** range/checkbox/color/file
inputs, the text fields you deliberately left live, and `ColorPicker.tsx`:
```sh
cd client && grep -rn 'type="number"' src/ui src/components
```

**Manual checks (iPad + desktop):**

1. In the Resize modal, clear the width field entirely → it stays empty while focused and
   does not snap to `1`. Type `128`, tab away → the value commits as `128`.
2. Type `999` into a field capped at `64`, blur → it commits clamped to `64`.
3. Type a value, press **Escape** → the field reverts and nothing changed.
4. Type a value, press **Enter** → it commits.
5. On the iPad, tap into a number field, type with the on-screen keyboard, and tap
   elsewhere → the value commits once, not per keystroke.
6. Undo/redo still updates the displayed values in the Pose and Lighting panels.

## Definition of done

- [ ] `NumberInput.handleChange` no longer calls `onChange`; blur/Enter/Escape behave as specified.
- [ ] `NumberInput` has a test covering draft-only typing, blur commit, Enter commit, Escape revert, and external resync.
- [ ] All 21 `type="number"` sites outside `ColorPicker.tsx` use `NumberInput`.
- [ ] Every live `type="text"` site either commits on blur or is recorded as a deliberate search-field exception in `HANDOFF.md`.
- [ ] The `grep` above shows no remaining raw `type="number"` outside `ColorPicker.tsx`.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, with real output pasted into `HANDOFF.md`.
- [ ] All six manual checks performed and recorded.
