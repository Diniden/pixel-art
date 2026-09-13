# 02 — "Brush Projects" wording for the header button, modal and rail

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/BrushSelectModal/BrushSelectModal.tsx` · `BrushSelectModal.css` · `BrushSelectModal.stories.tsx` · `__tests__/BrushSelectModal.dom.test.tsx` (all under `client/src/ui/components/BrushSelectModal/`) · `client/src/ui/components/BrushLibrary/BrushLibrary.tsx` · `client/src/ui/components/BrushLibrary/__tests__/BrushLibrary.dom.test.tsx` · `client/src/containers/HeaderContainer.tsx` · `client/src/containers/__tests__/BrushStudioContainer.dom.test.tsx`
**Effort:** S

## Objective
Every surface that lists brush files calls them **brush projects**: the header button reads
"Brush Projects", the modal is titled "Brush Projects" with a one-line explanation that each
entry is a file holding a whole brush (layers + frames), the empty state / create / rename /
delete copy says "brush project", and the left rail's header agrees. Nothing changes in the
pixel studio.

## Context
- Header button: `ui/components/Header/Header.tsx:424-437` renders `projectButtonLabel`
  (`:91`, default `"Projects"` at `:163`) with `title={`Switch ${projectButtonLabel}`}`. The
  container passes it: `containers/HeaderContainer.tsx:237`
  `projectButtonLabel={isBrushMode ? "Brushes" : undefined}`; the title fallback is `:225`
  `documentName={isBrushMode ? brushes.brushName || "No brush" : undefined}`. **`Header.tsx`
  itself needs no edit** — only the strings the container passes.
- Modal strings (`BrushSelectModal.tsx`): title `"Brushes"` `:181`; `"Delete Current Brush"`
  `:196`; label `"Current brush"` `:209`; empty state `"No brushes yet. Create one to start."`
  `:240`; placeholder `"Enter brush name..."` `:296`; `"New Brush"` `:362`; confirm title
  `"Delete Brush"` `:371`, warning `"This permanently deletes the brush file. It cannot be undone."`
  `:379`; error banners `:120,136,159,172`. The mismatch the owner sees: the nouns are plural
  ("Brushes") but every verb/qualifier is singular-document ("Current brush", "Create one") —
  it reads like editing one brush, not managing files.
- Comparison: `ProjectSelectModal.tsx:131` titles itself `"Switch Project"`.
- Rail: `ui/components/BrushLibrary/BrushLibrary.tsx:103` header `Brushes`; `:117-118` `+`
  button `title`/`aria-label` `"New Brush"`; `:137` placeholder `"Brush name..."`; `:211` the
  same empty-state string as the modal.
- Tests pinning strings: `BrushSelectModal.dom.test.tsx` (`"New Brush"` :66,124,135,144,158;
  `"Delete Current Brush"` :77,90,101,111; `/No brushes yet/` :103; `"Current brush"` :198,209);
  `BrushLibrary.dom.test.tsx` (`/No brushes yet/` :57; `"New Brush"` :67-127);
  `containers/__tests__/BrushStudioContainer.dom.test.tsx:130` `toBe("Brushes")`, `:136`
  `toBe("No brush")`, `:142` pins the BEM block `.brush-select-modal` (keep the block name).
- Validator strings in `BrushLibrary/brushName.ts:28-33` ("Brush name cannot be empty" …) stay
  as they are — a "brush project name" is still a brush name on disk.
- `ui/` purity: strings only; no new imports in `ui/` files.

## Steps
1. `HeaderContainer.tsx`: `"Brushes"` → `"Brush Projects"`; `"No brush"` → `"No brush project"`.
2. `BrushSelectModal.tsx`: title `"Brush Projects"`; add an intro line directly under the
   header inside the modal body, `<p className="brush-select-modal__intro">` with the text
   `Each brush project is one file holding a whole brush — its layers and frames. Switch, create, rename or delete brush project files here.`;
   `"Delete Current Brush"` → `"Delete Current Brush Project"`; label `"Current brush project"`;
   empty state `"No brush projects yet. Create one to start."`; placeholder
   `"Enter brush project name..."`; `"New Brush"` → `"New Brush Project"`; confirm title
   `"Delete Brush Project"`, warning `"This permanently deletes the brush project file. It cannot be undone."`;
   error banners `"Failed to … brush project"`.
3. `BrushSelectModal.css`: add `.brush-select-modal__intro` (tokens only: `--text-secondary`,
   `--font-size-sm` or the nearest existing token, `margin: 0 0 var(--space-3)`), placed in DOM
   order among the elements.
4. `BrushLibrary.tsx`: header `Brush Projects`; `+` button `title`/`aria-label`
   `"New Brush Project"`; empty state `"No brush projects yet. Create one to start."`;
   placeholder `"Brush project name..."`.
5. Update the four test files to the new strings (exact-equality pins in
   `BrushStudioContainer.dom.test.tsx:130,136` included). Update story prose in
   `BrushSelectModal.stories.tsx:50` if it quotes the old label.
6. Commit: `brush-followups(02): name brush files "brush projects" in header, modal and rail`.

## Constraints
- Do not rename BEM blocks, component files, props, or the `brushName.ts` validator messages.
- Do not touch `Header.tsx`, `ProjectSelectModal/**`, or any store.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/BrushSelectModal src/ui/components/BrushLibrary src/containers/HeaderContainer.tsx
cd client && bunx stylelint "src/ui/components/BrushSelectModal/*.css"     # 0 errors
cd client && bunx vitest run src/ui/components/BrushSelectModal src/ui/components/BrushLibrary src/containers/__tests__/BrushStudioContainer.dom.test.tsx
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner): in brush mode the header button reads "Brush Projects"; opening it shows the
title, the intro line, and the renamed actions; pixel mode still says "Projects" / "Switch Project".

## Definition of done
- [ ] All strings listed above changed; intro line styled with tokens.
- [ ] Tests updated and green; storybook builds.
- [ ] Pixel studio strings untouched; one commit with only Touches files.
