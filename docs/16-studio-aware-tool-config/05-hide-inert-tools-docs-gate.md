# 05 — Hide the inert tools, document the seam, final gate

**Wave:** W4 · **Depends on:** 02, 03, 04
**Touches:** `client/src/containers/PixelStudioToolsContainer.tsx` · `client/src/containers/__tests__/brushHiddenTools.dom.test.tsx` (new) · `ARCHITECTURE.md` · `docs/16-studio-aware-tool-config/HANDOFF.md`

**Effort:** S

## Objective

After this task the brush studio's toolbar no longer offers tools that do nothing there, the
new per-studio tool-config seam is documented in `ARCHITECTURE.md` so the next agent finds it
without archaeology, and the full gate has been run and its real output recorded.

## Context

### The reflection tool, and why hiding beats a section

The request names the reflection tool as one that "should still show its unique tool
configurations". In the pixel studio it does, and this plan does not change that: its section
lives in `PixelStudioPanel` (`PixelStudioPanel.tsx:357-372`, gated
`selectedTool === "reflection" && !!reflection`), fed by
`PixelStudioPanelContainer`. Untouched by this plan.

In the **brush** studio reflection is inert, measured:
`containers/brush/brushToolContext.ts:202-212` lists `"reflection"` in `BRUSH_INERT_TOOLS`,
and `:189-196` explains why — it has no handler body, so letting it through
`useCanvasPointer` would open a drawing gesture nothing closes. The brush canvas draws no
mirror lines and `ReflectionStore` is the pixel project's.

So in the brush studio the choice is between a section that lies and no tool at all. The
locked decision (MASTER §3 D6) is **no tool**: hide it, exactly as `origin`,
`reference-trace` and `brush` are already hidden there. A hidden tool cannot be selected, so
the "what does its rail show?" question never arises. Giving it a rail section would be
strictly worse than the bug this plan fixes.

`PixelStudioToolsContainer.tsx:30-35` is the existing mechanism — a module-level
`ReadonlySet<Tool>` passed as `hiddenTools` only in brush mode (`:94`):

```ts
const BRUSH_HIDDEN_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
  "origin",
  "reference-trace",
  // a brush cannot stamp itself (docs/12-pixel-brush-tool task 01)
  "brush",
]);
```

Add `"reflection"` and `"pose"` with a comment citing `BRUSH_INERT_TOOLS`.

⚠️ **`pose` too, and check it before you add it.** `pose` is also in `BRUSH_INERT_TOOLS`
(`:206`) and its rail section is likewise `PixelStudioPanel`'s. Confirm the pixel studio's
Pose tool is unaffected (it is a different code path) and say so in your report.

⚠️ **Do NOT hide the other five inert tools.** `normal-pencil`, `auto-normal` and
`height-map` are in `BRUSH_INERT_TOOLS` but are **not in the pixel tool table at all** —
they live in `LightingStudioTools.tsx:27-36`, which the brush studio never renders
(`Toolbar.tsx:107-124` returns `pixelStudioTools` for `"brush"`). Adding them to
`BRUSH_HIDDEN_TOOLS` would be dead configuration. Verify with
`grep -n 'normal-pencil' client/src/ui/components/Toolbar/PixelStudioTools.tsx` (expect no
match) and paste it.

### Hotkeys

`GlobalHotkeys.tsx` binds tool hotkeys. **Both tools you are hiding have one**, measured in
`PixelStudioTools.tsx:100-140`: `reflection` is **`R`** (`:120-125`) and `pose` is **`P`** (`:139`).

`hiddenTools` filters the *visible buttons* — `PixelStudioTools.tsx:334-337` (`visibleTools` at `:334`)
(`visibleTools = hiddenTools ? tools.filter(...) : tools`) — and nothing in that filter
touches hotkey dispatch. So after this task `R` and `P` may still select an inert tool in the
brush studio, which would leave the rail showing nothing for a tool the toolbar does not
offer.

**Check both keys in the brush studio and report what you find** (manual check 3). This is a
pre-existing property of the mechanism — it already applies to `origin` and `brush`, hidden
since earlier plans — so whatever you find is not a regression this task introduced.

**Do not fix it in this task.** Record the finding in `HANDOFF.md`'s Deviations section as a
follow-up. Changing hotkey routing touches `GlobalHotkeys.tsx`, which is outside your
`Touches`, affects all three studios, and needs its own manual-check pass.

### The `ARCHITECTURE.md` entry

The brush-documents section begins at `ARCHITECTURE.md:123` ("### Brush documents"). Add a
short subsection covering the seam this plan built. It must state:

- Tool options are gated per **studio capability**, not per studio wholesale
  (`ui/components/RightSidebarTopControls/toolConfigStudio.ts`), and **why**: the brush studio
  honours `shapeMode`, `borderRadius` and `fill-square` size but not gaussian params
  (gaussian ≡ flood on a delta grid), not `moveAllLayers`, and not selection modes/expand
  (its mask is rectangle-only).
- **`BrushDeltaPicker` is the brush studio's colour picker**, and the two pickers stay
  separate — with the incompatibility list from task 03's Context in one sentence, so nobody
  re-proposes the merge.
- The brush selection's summary crosses containers through `BrushUIStore`, as three numbers
  and a clear callback, published by the keyboard-owning pane only — never the mask.
- Reflection and Pose are hidden in the brush studio because they are in `BRUSH_INERT_TOOLS`.

Match the file's existing voice: dense, cites paths, explains the *why* and names the trap.
Do not write a changelog; write the map.

### Traps

- `BRUSH_HIDDEN_TOOLS` is typed `ReadonlySet<Tool>`, so a typo fails at compile time. Good —
  but it also means adding a string that is not a `Tool` member won't build. Use the exact
  union spellings from `types/domain.ts:458-481`.
- There is no existing test for the hidden-tools behaviour. The file in `Touches` is new.
- `ARCHITECTURE.md` is checked into the repo and read by every future agent. Get it right or
  leave it out and say why — a wrong map is worse than none.

## Steps

1. `PixelStudioToolsContainer.tsx`: add `"reflection"` and `"pose"` to `BRUSH_HIDDEN_TOOLS`
   with a comment citing `BRUSH_INERT_TOOLS` in `containers/brush/brushToolContext.ts` and
   naming the reason (inert on a brush canvas; their rail sections belong to
   `PixelStudioPanel`).

2. New `client/src/containers/__tests__/brushHiddenTools.dom.test.tsx`, over the real
   `ApplicationStore` (harness as in `BrushStudioPanelContainer.dom.test.tsx:26-60`). Pin:
   - in brush mode, no Reflection, Pose, Origin, Reference-trace or Brush tool button
     renders;
   - in brush mode, Pencil, Eraser, Eyedropper, Line, Rectangle, Ellipse, Flood fill,
     Gaussian fill, Move and Selection **do** render (⭐ the discriminating case — a
     too-broad hidden set passes the first assertion and fails this one);
   - in pixel mode, all of Reflection, Pose, Origin and Brush render.

   Remember `setStudioMode` also writes `selectedTool` (`LightingUIStore.ts:193-196`).

3. Commit: `feat(16): hide inert tools in the brush studio`.

4. `ARCHITECTURE.md`: add the subsection described in Context, inside or immediately after
   the "Brush documents" section at `:123`.

5. Commit: `docs(16): document the per-studio tool-config seam`.

6. Run the full gate and paste the **real output** of each command (`CLAUDE.md`: "It passes"
   is not a report):

   ```sh
   bun run typecheck
   bun run lint
   bun run format:check
   bun run test
   bun run build
   ```

   `bun run verify` runs all five in that order; run it and paste its output, then re-run
   any that failed individually so the failure is legible.

   Then:

   ```sh
   find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
   cd client && bun scripts/check-boundaries.mjs
   ```

7. Update `docs/16-studio-aware-tool-config/HANDOFF.md`: every wave's row filled with status,
   date, commit SHA and the gate's real exit status; the hotkey finding from Context recorded
   under **Deviations**; any manual check not performed named explicitly under **Notes**.

8. Commit: `docs(16): PLAN COMPLETE — final gate and QA ledger`.

## Constraints

- **Do not add `normal-pencil`, `auto-normal` or `height-map` to `BRUSH_HIDDEN_TOOLS`** —
  they are not in the pixel tool table (see Context; verify and paste the grep).
- **Do not change hotkey routing.** Record the finding; do not act on it.
- Do not change `PixelStudioPanel.tsx` or `PixelStudioPanelContainer.tsx`. The pixel studio's
  reflection and pose sections are correct and out of scope.
- Do not remove `reflection` or `pose` from `BRUSH_INERT_TOOLS` — hiding the button and
  keeping the tool inert are independent safety nets, and the inert list also defends against
  hotkey selection.
- Do not run `vitest` with the snapshot-update flag, ever (`CLAUDE.md`).
- Do not use `--frozen-lockfile` (meaningless here; a hook blocks it).

## Verification

Covered by step 6. In addition:

```sh
cd client && bunx vitest run src/containers/__tests__/brushHiddenTools.dom.test.tsx
cd client && bunx eslint src/containers/PixelStudioToolsContainer.tsx
grep -n 'normal-pencil' client/src/ui/components/Toolbar/PixelStudioTools.tsx   # expect no match
```

⚠️ The corpus and migration snapshots must be **unchanged** — this plan touched no wire
format. If `bun run test` reports any snapshot difference, STOP and report it; do not update
it. Confirm explicitly in your report that no snapshot was updated.

### Manual checks — NOT optional

`bun run dev`:

1. **Brush studio toolbar.** Count the tool buttons; Reflection and Pose are gone. Every
   remaining button selects a tool that visibly does something on the brush canvas.
2. **Pixel studio toolbar.** Reflection and Pose are present. Select Reflection → its rail
   section appears with the preset/line controls. Select Pose → its rail section appears.
   This is the check that proves the pixel studio was not collateral damage.
3. **Hotkey probe.** In the brush studio press **`R`** (reflection) and then **`P`** (pose).
   For each, report whether the tool becomes selected and, if so, what the rail shows.
   Record both answers in `HANDOFF.md` either way — this is the finding Context asks for, not
   a pass/fail.
4. **End-to-end, the request's own words.** In the brush studio, select in turn Pencil,
   Eraser, Eyedropper, Line, Rectangle, Ellipse, Fill-square, Flood fill, Gaussian fill,
   Move, Selection. For each, write one line saying what the rail showed. Confirm the Delta
   picker was present throughout and that the Edge/Fill tabs edited deltas, not RGBA.
5. **Full pixel-studio sweep.** Step through every pixel-studio tool and confirm its rail is
   exactly as it was before this plan. Any difference is a regression — report it.

Report each individually.

## Definition of done

- [ ] `BRUSH_HIDDEN_TOOLS` contains exactly `origin`, `reference-trace`, `brush`,
      `reflection`, `pose` — and the three lighting tools are absent, with the grep pasted.
- [ ] New hidden-tools dom suite passes, including the ⭐ case.
- [ ] `ARCHITECTURE.md` documents the capability table, the two-pickers decision, the brush
      selection seam, and the hidden tools.
- [ ] `bun run verify` output pasted in full; every stage exits 0.
- [ ] No snapshot updated; corpus snapshots unchanged; stated explicitly.
- [ ] No lockfile; boundary probe green.
- [ ] `HANDOFF.md` complete: every wave row filled, the hotkey finding under Deviations, any
      skipped manual check named.
- [ ] All five manual checks performed and reported individually.
- [ ] Three commits (steps 3, 5, 8).
