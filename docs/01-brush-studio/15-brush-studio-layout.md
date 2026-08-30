# 15 — BrushStudioLayout

**Wave:** W2 · **Depends on:** none
**Touches:** `client/src/ui/layouts/BrushStudioLayout/BrushStudioLayout.tsx` (new) · `BrushStudioLayout.stories.tsx` (new)
**Effort:** S

## Objective
A third layout component with exactly the slots the brush studio has — so a missing region is a
type error, not a runtime branch (the reasoning at `LightingStudioLayout.tsx:11-31`).

## Context
- Copy `client/src/ui/layouts/LightingStudioLayout/LightingStudioLayout.tsx` (117 lines) and its
  story. Slot mapping goes through `AppShell` (`ui/components/AppShell/AppShell.tsx:34-81`):
  `leftPanel`/`rightPanel`/`bottomPanel` are content names, focus mode is expressed by omission.
- `PixelStudioLayout.tsx:117-146` shows `leftPanel = <>{objectLibrary}{layerPanel}</>`.
- `layout?: AppShellProps["layout"]`, `railOverlays?`, `canvasAreaRef?` are passed through
  unchanged (the rail-layout system, `ui/layout/railLayout.ts`, is mode-agnostic).

## Steps
1. Create the component:
   ```ts
   export interface BrushStudioLayoutProps {
     header: ReactNode; toolbar: ReactNode;
     brushLibrary: ReactNode; layerPanel: ReactNode;
     rightControls: ReactNode; studioPanel: ReactNode;
     timeline: ReactNode; canvas: ReactNode; canvasInfo?: ReactNode;
     layout?: AppShellProps["layout"]; railOverlays?: AppShellProps["railOverlays"];
     focusMode: boolean; canvasAreaRef?: RefObject<HTMLElement | null>;
   }
   ```
   `leftPanel = <>{brushLibrary}{layerPanel}</>`, `rightPanel = <>{rightControls}{studioPanel}</>`,
   `bottomPanel = timeline`, both suppressed in focus mode; children = `canvas` + `canvasInfo`.
   No CSS file (AppShell owns the chrome) unless the lighting layout has one — mirror it.
2. Story (`title: "Layouts/BrushStudioLayout"`) with placeholder boxes per slot, plus a
   focus-mode variant.
3. Commit: `brush-studio(15): BrushStudioLayout`.

## Constraints
- No new slots beyond the list; no mode prop; no store imports.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/layouts
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] Component + story; focus mode drops left/bottom panels.
- [ ] Gate green; one commit, only the new directory staged.
