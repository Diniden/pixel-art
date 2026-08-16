# 37 — The layouts, `AppShell`, `AppContainer`, and retiring `App.tsx`

**Wave:** W28 · **Depends on:** 36, 33, 34
**Touches:** `client/src/App.{tsx,css}` (deleted at the end) · `client/src/ui/layouts/PixelStudioLayout/` (new) + stories · `client/src/ui/layouts/LightingStudioLayout/` (new) + stories · `client/src/ui/layouts/LoadingLayout/` (new) + stories · `client/src/ui/components/AppShell/` (new) + stories · `client/src/containers/AppContainer.tsx` (new) · `client/src/containers/PixelStudioContainer.tsx` (new) · `client/src/containers/LightingStudioContainer.tsx` (new) · `client/src/containers/GlobalHotkeys.tsx` (new) · `client/src/main.tsx`
**Effort:** L

## Objective

After this task the app is assembled by joining pure UI components with the store: three layouts and an `AppShell` in `ui/`, and four containers that wire them. `App.tsx` is gone, and Storybook's story tree bubbles all the way up to full-page layouts.

## Context

### There are exactly TWO editor layouts, not four

An earlier framing proposed `PixelStudioLayout`, `LightingStudioLayout`, `ProjectSelectLayout` and `ObjectLibraryLayout`. Reading `App.tsx` (239 lines) end to end settles it: **the app has ONE shell with ONE binary branch.**

```
App.tsx:170   <div className="app">
     :171       <Header />                                    ← always
     :173       <div className="main-content">
     :175-182     {!isFocusMode && <aside className="side-panel left-panel">   ← conditional
     :178             <ObjectLibrary />
     :179             <LayerPanel />
     :185       <main className="canvas-area">
     :186         <Toolbar … />                               ← always
     :190         {isLightingMode                             ← ★ THE ONLY BRANCH
     :191           ? <LightingCanvas />
     :193-213     : <> <Canvas … /> <FrameReferencePanel? /> <ReferenceImagePanel /> </>}
     :215         {!isLightingMode && <CanvasInfo … />}
     :216         {!isLightingMode && <LayerColors />}
     :220       <aside className="side-panel right-panel">    ← always
     :222         <RightSidebarTopControls />
     :223         {isLightingMode ? <LightingStudioPanel /> : <PixelStudioPanel />}
     :229-233   {!isFocusMode && <footer className="bottom-panel"><FrameTimeline /></footer>}
```

**`ProjectSelectLayout` does not exist.** `ProjectSelectModal` is mounted from `Header.tsx`, not `App.tsx` (`grep -rl '<ProjectSelectModal' client/src` → only `Header.tsx`). There is **no routing, no entry screen and no "select a project first" gate** — the app boots straight into the editor via `initProject()` at `App.tsx:65-67`, showing only a loading screen while it resolves. Project switching happens *inside* the running editor through a modal.

**`ObjectLibraryLayout` does not exist.** `ObjectLibrary` is mounted exactly once, as the top half of the left sidebar (`App.tsx:178`). It is a **region**, not a page.

Every one of the 14 modals is mounted from a component, never from `App.tsx`: `ProjectSelectModal`/`BrowseBackupsModal`/`ExportPreviewModal` from `Header.tsx`; `AddVariantModal`/`CopyFromModal`/`VariantSelectModal` from `LayerPanel.tsx`; `AIInterpolateModal`/`FrameTagsModal`/`ResizeModal` from `FramesView.tsx` and `VariantView.tsx`; `PreviewModal` from `FramesView`/`TimelineView`/`VariantView`; `EdgeInterpolateModal`/`HeightMapModal` from `LightingStudioTools.tsx`; `ReferenceImageModal` from `PixelStudioTools.tsx`; `ObjectSelectModal` from `FrameReferencePanel.tsx`.

A third layout, **`LoadingLayout`**, is real: `App.tsx:154-164` is a genuine full-screen alternative view with its own markup and no shared chrome. It is 12 lines but it is a real page state and deserves a story.

### `AppShell` is a component, not a layout

It composes five page regions, which sounds like a layout, but it does not decide *what page this is* — **both** layouts render it. The membership rule is "is this a full page?", and `AppShell` is chrome that two pages share.

```ts
export interface AppShellProps {
  header: React.ReactNode;
  toolbar: React.ReactNode;
  /** Left sidebar. Omit (or pass null) to hide — this is focus mode. */
  leftPanel?: React.ReactNode;
  rightPanel: React.ReactNode;
  /** Bottom timeline. Omit to hide — focus mode again. */
  bottomPanel?: React.ReactNode;
  /** The centre region: canvas + its floating panels + info strip. */
  children: React.ReactNode;
  /** Ref for the canvas area — FloatingPanel needs it as its drag bounds. */
  canvasAreaRef?: React.RefObject<HTMLElement>;
}
```

BEM: `app`, `app__main`, `app__side-panel`, `app__canvas-area`, `app__bottom`; modifiers `app__side-panel--left`, `app__side-panel--right`, `app--focus`. Task 21 already converted `App.css` to this block and resolved the `.canvas-area` collision with `ReferenceImageModal.css`.

### Regions are injected as `ReactNode`, not as data

```ts
export interface PixelStudioLayoutProps {
  header: React.ReactNode;
  toolbar: React.ReactNode;
  objectLibrary: React.ReactNode;
  layerPanel: React.ReactNode;
  rightControls: React.ReactNode;
  studioPanel: React.ReactNode;
  timeline: React.ReactNode;
  canvas: React.ReactNode;
  canvasInfo: React.ReactNode;
  layerColors: React.ReactNode;
  frameReferencePanel?: React.ReactNode;
  referenceImagePanel?: React.ReactNode;

  focusMode: boolean;                     // App.tsx:167 — hides left sidebar + bottom timeline
  frameReferencePanelVisible: boolean;    // App.tsx:199 — uiState.frameReferencePanelVisible !== false
  canvasInfoHidden?: boolean;             // App.tsx:177
  canvasAreaRef?: React.RefObject<HTMLElement>;
}
```

**Why `ReactNode` and not data:** passing `project`, `layers`, `frames`, `palettes`, `selection` down through the layout would give it a ~40-prop interface and force every state change anywhere in the app to re-render the whole tree. Injecting elements keeps the layout's interface at 14 props, **preserves MobX's per-region `observer()` granularity** (each region container re-renders independently), and makes the layout story trivially composable from stubs.

The cost, stated plainly: a layout story shows **stubs**, not the real thing. That is correct — a layout story's job is to verify *arrangement* (focus mode hides two regions; the canvas area is the flex-grow child), not to re-verify every child. Full-fidelity screens are covered by the app itself and by the region stories.

### `LightingStudioLayout`'s measured asymmetries

From `App.tsx:190-216`, lighting mode renders **no** `CanvasInfo`, **no** `LayerColors`, **no** `FrameReferencePanel` and **no** `ReferenceImagePanel`. It has its own floating overlay instead: `LightingPreviewPanel` (extracted in task 33). Its props are therefore: header, toolbar, objectLibrary, layerPanel, rightControls, studioPanel, timeline, canvas, `previewPanel?`, `focusMode`, `canvasAreaRef`.

### `LoadingLayout`

```ts
export interface LoadingLayoutProps {
  title?: string;      // default "Loading Pixel Art Editor"
  message?: string;    // default "Preparing your workspace..."
}
```
BEM: `loading-screen`, `loading-screen__content`, `loading-screen__spinner`, `loading-screen__title`, `loading-screen__message`.

### `App.tsx`'s two `useEffect` blocks are NOT layout concerns

| `App.tsx` today | Goes to |
| --- | --- |
| `:65-67` `initProject()` on mount | `AppContainer` — a store call, correct tier |
| `:70-88` reference-image restore from project | **`DomainStore` action**, triggered on project load. Task 29 already moved this. |
| `:91-152` window `keydown`: Escape → `clearColorAdjustment`, `` ` `` → focus mode, ``Shift+` `` → studio mode | **`containers/GlobalHotkeys.tsx`** — a headless container. It calls three store actions, so it **must not** live in `ui/`. |
| `:45-63` `handleReferenceImageChange` | a `UIStore` action + a `DomainStore` action (task 29) |

```tsx
export const AppContainer = observer(function AppContainer() {
  const { domain, ui } = useStores();
  useEffect(() => { void domain.initProject(); }, [domain]);
  if (domain.isLoading || !domain.project) return <LoadingLayout />;
  return (
    <>
      <GlobalHotkeys />
      {ui.studioMode === "lighting"
        ? <LightingStudioContainer />
        : <PixelStudioContainer />}
    </>
  );
});
```

⚠️ **The global hotkeys interact with two other keyboard handlers**: `Canvas.tsx`'s capture-phase Escape with 3-level precedence (now `useCanvasKeyboard`, task 31) and the `Modal` primitive's Escape (task 19). The precedence matrix is in Verification.

### Layout stories

At least **three** each — *empty* (`projectEmpty`), *typical* (`projectTypical`), *dense* (`projectDense`) — each at `layout: "fullscreen"`, **with regions supplied as stub elements, not real containers.** A layout story must not need the store. Plus one *focus mode* story per layout, since it hides two regions.

## Steps

1. Create `ui/components/AppShell/` from `App.tsx:170-233`'s structure, using the `app` BEM block.
2. Create `ui/layouts/PixelStudioLayout/` and `ui/layouts/LightingStudioLayout/` with the prop interfaces above.
3. Create `ui/layouts/LoadingLayout/` from `App.tsx:154-164`.
4. Create `containers/PixelStudioContainer.tsx` and `containers/LightingStudioContainer.tsx`, each an `observer()` reading `focusMode`, `frameReferencePanelVisible` and `canvasInfoHidden`, and rendering each region's own container.
5. Create `containers/GlobalHotkeys.tsx` — headless, owning the window `keydown` handler from `App.tsx:91-152`.
6. Create `containers/AppContainer.tsx` as above.
7. Update `client/src/main.tsx` to render `<StoreProvider store={app}><AppContainer /></StoreProvider>`.
8. **Delete `client/src/App.tsx`.** Move `App.css` to `ui/components/AppShell/AppShell.css`.
9. Write the layout stories.

## Constraints

- **The layouts and `AppShell` are pure** — no store, no API, no MobX, no `useContext`. Regions arrive as `ReactNode`.
- **`GlobalHotkeys` must be a container**, not a `ui/` file — it calls store actions.
- Do not add routing, an entry screen, or a project-selection page. None exists and none is wanted.
- Do not merge the two layouts into one parameterised layout — their region sets genuinely differ.
- Keep the store constructed exactly once, in `main.tsx`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
test ! -f src/App.tsx
! grep -rn "useEditorStore\|from \"mobx\|stores/\|api/\|useContext" src/ui/layouts src/ui/components/AppShell
```

Manual checks:
1. **Both studios** render and switch correctly.
2. **Focus mode** (`` ` ``) hides the left sidebar and the bottom timeline in both studios.
3. **``Shift+` ``** cycles studio mode.
4. **Escape precedence:** with **no** modal open, Escape clears `colorAdjustment` and the canvas selection per the 3-level rule. With a modal open, Escape closes the modal and does **neither** of those.
5. The loading screen renders on a cold start and disappears once the project loads.
6. The reference and lighting floating panels appear only in their respective studios.
7. **Layout stories at empty / typical / dense each render without a store provider**, and the focus-mode story visibly hides two regions.

## Definition of done

- [ ] `client/src/App.tsx` is **deleted**; `App.css` moved to `AppShell.css`.
- [ ] `PixelStudioLayout`, `LightingStudioLayout` and `LoadingLayout` exist in `ui/layouts/`; `AppShell` in `ui/components/`; all four are pure and take regions as `ReactNode`.
- [ ] `AppContainer`, `PixelStudioContainer`, `LightingStudioContainer` and `GlobalHotkeys` exist in `containers/`.
- [ ] `main.tsx` constructs the store once and renders `<StoreProvider><AppContainer /></StoreProvider>`.
- [ ] Each layout has empty / typical / dense stories plus a focus-mode story, all rendering **without a store provider**.
- [ ] The Escape precedence matrix passes.
- [ ] No routing or entry screen was added; the two layouts were not merged.
