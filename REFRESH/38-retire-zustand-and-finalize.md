# 38 — Retire Zustand, delete the bridge, and finalise the toolchain gates

**Wave:** W29 · **Depends on:** 37
**Touches:** `client/src/store/` (deleted — 17 files) · `client/src/stores/bridge/` (deleted) · `client/src/components/` (deleted once empty) · `client/package.json` · `client/.stylelintrc.json` · `client/eslint.config.js` · `client/scripts/check-boundaries.mjs` (new) · `client/tsconfig.json` · all remaining unformatted sources (Prettier Sweep B) · `.git-blame-ignore-revs`
**Effort:** L

## Objective

After this task nothing imports `useEditorStore`, `zustand` is uninstalled, the bridge is gone, `client/src/components/` no longer exists, stylelint enforces BEM on every stylesheet, and `bun run verify` — the composite gate that was red at the start of this plan — exits 0.

## Context

### The completion criterion

**The migration is complete when `grep -rl "useEditorStore" client/src` returns nothing.** Today (before this plan) that grep returns **34** files. Each earlier task moved a slice; this task removes the scaffolding.

`client/src/store/` is 17 files and roughly 8,050 lines. `client/src/stores/bridge/zustandBridge.ts` was always marked TEMPORARY and its two field lists were the migration's progress ledger — by now the Phase A list must be **empty**.

`zustand` has exactly one importer, `client/src/store/index.ts:1`. **Removing it before the last consumer is migrated breaks the build instantly**, which is why it waited until now.

### Prettier Sweep B — the deliberately-late half

Task 05 ran Sweep A on a scoped set (root config files, `client/src/types/**`, `client/src/services/api.ts`). Sweep B covers the remainder: `client/src/**/*.{ts,tsx,css}` and `server/src/**/*.ts`.

It waited on purpose, for two measured reasons:
1. Sweeping `client/src/components/**` early would have reformatted roughly **1,400 lines that the decomposition tasks deleted outright** as duplication.
2. It would have destroyed the `diff <(sed -n '212,232p' Canvas.tsx) <(sed -n '132,152p' LightingCanvas.tsx)`-style evidence that tasks 30 and 31 relied on to prove two blocks were byte-identical before unifying them.

Sweep B is an **enormous diff by construction** (~65 files). Mitigations: it lands as **its own commit with nothing else in it**, its SHA is appended to `.git-blame-ignore-revs`, and `bunx tsc --noEmit` must report an **unchanged** error count (0) before and after — Prettier must be behaviour-neutral.

### stylelint: turn on the BEM rule

Task 12 installed stylelint with the token, keyframe and duplicate rules on, but deliberately left `selector-class-pattern` **off** because the conversions had not happened. Tasks 20, 21 and 22 converted everything. **Now enable it**, plus the structural rules:

```json
"selector-class-pattern": [
  "^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$",
  { "message": "Class must be BEM: block, block__element, block--modifier, or block__element--modifier",
    "resolveNestedSelectors": true }
],
"selector-max-class": [2, { "message": "Max 2 class compounds. A second compound is only for a parent's state changing a child." }],
"selector-max-compound-selectors": 2,
"selector-max-id": 0,
"selector-max-type": [0, { "ignoreTypes": ["/^input$/", "/^button$/", "/^canvas$/"] }],
"declaration-no-important": true,
"no-descending-specificity": true
```

Keep the existing overrides turning these off for `src/styles/reset.css` and `src/styles/tokens.css`.

`declaration-no-important` moves from `warn` to **`error`**: task 21 removed all 15 `Toolbar.css` declarations, and the `.hue-slider` one went in task 18. **If any `!important` remains, find and fix its underlying collision rather than adding an exception.**

### The boundary CI script

`client/scripts/check-boundaries.mjs` must assert, exiting non-zero on violation:
- nothing under `client/src/ui/` imports from `stores/`, `store/`, `api/`, `services/`, `mobx` or `mobx-react-lite`, or calls `useContext`
- nothing under `client/src/ui/primitives/` imports a domain type
- `observer` is imported only under `client/src/containers/`
- nothing under `client/src/stores/domain/` imports from `client/src/stores/ui/`
- nothing under `client/src/api/` imports from `stores/` or `components/`

ESLint already enforces all of these; the script is a second, cheaper gate that runs without a full lint pass and produces a readable report.

### `max-lines` ratchet

Set `max-lines` to `warn` at 400 globally and `error` inside `ui/`. Do **not** flip it to a global `error` — a handful of files are legitimately over. Record the current finding count as a budget in the completion report so a future task can ratchet it down.

### Deferred strictness flags — do NOT enable here

Two TypeScript flags were evaluated and deliberately deferred; both are recorded as open questions.

- **`noUncheckedIndexedAccess`** — this codebase indexes `pixels[y][x]` end to end: every renderer, `drawingUtils.ts`, `previewRenderer.ts`, `lightingRenderer.ts`, `edgeInterpolate.ts`. Enabling it makes every one of those `PixelData | undefined`, producing **several hundred** new errors. It should be enabled **per directory** as its own sequence of tasks, `src/types/` and `src/stores/` first (cheap and valuable), canvas render code last. **Not here.**
- **`exactOptionalPropertyTypes`** — it interacts badly with this specific codebase. `migrateLayerVariantOffset` (`types/index.ts:843-864`) **deliberately sets `variantOffset: undefined`** as its migration signal, and `layerToCompact` relies on `if (layer.variantOffset)` dropping it. Under this flag that pattern becomes a type error and the migration must be rewritten to `delete` the key — **a behaviour-affecting change to migration code**. The `Compact*` interfaces are optional-property-heavy for the same reason. **Do not adopt during this refresh.**

Two cheap flags **are** appropriate here if not already set: `noImplicitOverride` (free — MobX store classes now exist) and `noPropertyAccessFromIndexSignature` (low cost; catches `uiState[k]` typos).

## Steps

1. Confirm the bridge's Phase A list is **empty** and every field has flipped to Phase B.
2. Delete `client/src/stores/bridge/`.
3. Delete `client/src/store/` (all 17 files).
4. `cd client && bun remove zustand`.
5. Confirm `client/src/components/` is empty and delete it.
6. Enable the stylelint BEM and structural rules; promote `declaration-no-important` to `error`; fix anything that fails **by fixing the CSS**, not by adding exceptions.
7. Write `client/scripts/check-boundaries.mjs` and add a `lint:boundaries` script.
8. Add `noImplicitOverride` and `noPropertyAccessFromIndexSignature` to `client/tsconfig.json`, fixing whatever they surface, **in their own commit**.
9. **Prettier Sweep B, as its own commit with nothing else in it.** Append its SHA to `.git-blame-ignore-revs`.
10. Set `max-lines` to `warn` at 400 globally, `error` inside `ui/`; record the finding count.
11. Run `bun run verify` and confirm it exits 0.

## Constraints

- **The Sweep B commit must contain only formatting**, and `bunx tsc --noEmit` must report 0 errors before and after.
- **Do not enable `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes`.**
- **Never enable a strictness flag in the same commit as a refactor.** Each flag gets its own commit whose entire diff is "add flag + fix the errors it produced."
- Do not add an exception to silence a remaining `!important` — fix the collision.
- Do not delete anything under `client/lib/` — it is copied verbatim into exports and is public API for generated projects.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
# THE completion criterion:
! grep -rl "useEditorStore" client/src
! grep -q '"zustand"' client/package.json
test ! -d client/src/store && test ! -d client/src/stores/bridge && test ! -d client/src/components
# Everything, in one command — this was RED at the start of the plan:
bun run verify        # = typecheck && lint && format:check && test && build
cd client
bunx stylelint "src/**/*.css"        # now with the BEM pattern ON
node scripts/check-boundaries.mjs
bunx storybook build && test -d storybook-static
test "$(grep -rn '!important' src --include='*.css' | wc -l)" -eq 0
```

Manual checks — a **full application regression pass**:
1. Create, switch, rename and delete a project.
2. The full drawing matrix: pencil, eraser, line, rect, ellipse, flood fill, gaussian fill; all 4 selection modes; all 3 selection behaviours; move tool; eyedropper revert; origin tool; both trace modes — with a mouse **and** on a touch device.
3. Both studios; focus mode; all three timeline views; drag-and-drop in each.
4. Undo and redo across at least 5 distinct edit types.
5. Layer operations in both `frame` and `all-frames` scope; copy/paste layers within and across objects; **copy in project A → switch → paste in project B**.
6. The full variant matrix.
7. Lighting: paint normals and height, flip H and V, change all 8 lighting settings and confirm they persist across a reload.
8. Export a project and open the export preview.
9. Run AI interpolation end to end against a live `ai-service`.
10. Open all 14 modals; Escape closes each; focus is trapped; the Escape precedence matrix holds. (These are the primitives' built-in accessibility behaviours from task 19. Note that **no build gate fails on an accessibility violation** — the Storybook a11y addon stays at `test: "todo"` permanently, by owner decision 2026-08-16 — so this manual pass is the only check.)
11. **Wire format:** copy `server/src/data/Base Unit.json` aside, run a full editing session, and diff. **Only the fields you edited may differ — there is no permitted format change.** `uiState.aiServiceUrl` must still be present (owner decision, 2026-08-16: it stays in the wire format permanently), so its absence is a defect, not an expected diff. **The file must still be ~1.1 MB.**
12. Stop the server, reload, and confirm an explicit error rather than a blank canvas; then confirm the real project file is untouched.

## Definition of done

- [ ] **`grep -rl "useEditorStore" client/src` returns nothing.**
- [ ] `zustand` is uninstalled; `client/src/store/`, `client/src/stores/bridge/` and `client/src/components/` are all deleted.
- [ ] stylelint enforces the BEM `selector-class-pattern` and the structural rules across `src/**/*.css`; **zero `!important` declarations remain**.
- [ ] `client/scripts/check-boundaries.mjs` exists, is wired to a `lint:boundaries` script, and passes.
- [ ] `noImplicitOverride` and `noPropertyAccessFromIndexSignature` are enabled, each in its own commit.
- [ ] **`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` were NOT enabled.**
- [ ] Prettier Sweep B landed as a formatting-only commit with its SHA in `.git-blame-ignore-revs` and an unchanged typecheck.
- [ ] `max-lines` is `warn` at 400 globally and `error` inside `ui/`; the current finding count is recorded as a budget.
- [ ] **`bun run verify` exits 0.**
- [ ] The full 12-point manual regression pass was performed and recorded, including the wire-format diff and the failed-load check.
- [ ] Nothing under `client/lib/` was deleted.
