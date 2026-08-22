/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ── THE MOBX HARNESS RUNTIME (REFRESH task 38) ─────────────────────────────
 *
 * Support code for `storeContract.ts`'s MobX harness, extracted so the
 * contract file stays readable. Two things live here, both of them direct
 * ports of machinery the Zustand retirement deleted:
 *
 *  1. **The dispatch table** — the action-name → MobX-implementation map the
 *     bridge used to install as delegates on the Zustand store. The frozen
 *     `*.test.ts` files dispatch by NAME (`dispatch("addLayer", …)`), and
 *     during the bridge era the legacy hook's `getState()[name]` lookup resolved to
 *     exactly these calls; the table preserves that resolution with the
 *     store in the middle removed. Signatures and coupled writes are
 *     transcribed from `zustandBridge.ts`'s delegate blocks (tasks 23-32)
 *     and, for the actions that never had delegates, from the legacy action
 *     bodies (`toolActions.ts`, `referenceActions.ts`, `helpers.ts`).
 *
 *     The `any`-typed argument spread mirrors the legacy dispatch exactly:
 *     `storeContract.ts` erased argument types at this boundary from day one
 *     (`(fn as (...a: unknown[]) => unknown)(...args)`), and the table's
 *     call sites are checked against the real store methods they invoke.
 *
 *  2. **The history MIRROR** — the `Project[]` view of the command stack the
 *     legacy glue re-published after every history operation.
 *     `getHistoryEntry` exists ONLY to prove clone independence
 *     (`history.test.ts:207` corrupts the live project IN PLACE and re-reads
 *     entry 0), so entries must be materialised at RECORD time, never
 *     derived at read time — a read-time rewind would faithfully reproduce
 *     the corruption. `rewindCommand`/`recomputeHistoryMirror` are the
 *     legacy `computeMirror` verbatim; the recompute triggers reproduce the
 *     glue's timing (every history operation, plus every write inside an
 *     open stroke transaction, which is when `PixelStore.syncHistory` used
 *     to fire).
 */
import { flowResult, runInAction, untracked } from "mobx";
import type { ApplicationStore } from "../../stores/ApplicationStore";
import { strokeControl } from "../../stores/history/editorHistory";
import { isPixelCommand } from "../../stores/history/commands";
import type { Command, PixelCommand } from "../../stores/history/commands";
import type { PixelData, Project } from "../../types";

/* ────────────────────────────────────────────────────────────────────────── */
/* The history mirror                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

let mirrorEntries: Project[] = [];

/** Cleared by the harness's `load()`/`reset()`, exactly as the legacy glue's
 * mirror was reset by a project install. */
export function resetHistoryMirror(): void {
  mirrorEntries = [];
}

/** Read one materialised snapshot; `null` past either end. */
export function historyMirrorEntry(index: number): Project | null {
  return mirrorEntries[index] ?? null;
}

/**
 * Undo one PixelCommand ON PAPER — legacy `store/index.ts`'s
 * `rewindPixelCommand`, verbatim. Every ROW of an affected grid is copied
 * (not only the patched ones): the result is handed out as a snapshot, and
 * the clone-independence pin mutates a row no patch touched.
 */
function rewindPixelCommand(project: Project, command: PixelCommand): Project {
  const { target, cells } = command;
  const rewriteGrid = (grid: PixelData[][]): PixelData[][] => {
    const next = grid.map((row) => [...row]);
    for (const cell of cells) {
      if (next[cell.y]) next[cell.y][cell.x] = cell.before;
    }
    return next;
  };

  if (target.variant) {
    const { variantGroupId, variantId, frameIndex } = target.variant;
    // W29h — must agree with `PixelStore.writeGridInAction` / `findLayer` or
    // the mirror reconstructs a pre-state for the wrong layer. `?? 0`
    // preserves every pre-W29h target exactly.
    const layerIndex = target.variant.layerIndex ?? 0;
    return {
      ...project,
      variants: project.variants?.map((vg) =>
        vg.id !== variantGroupId
          ? vg
          : {
              ...vg,
              variants: vg.variants.map((v) =>
                v.id !== variantId
                  ? v
                  : {
                      ...v,
                      frames: v.frames.map((f, idx) =>
                        idx !== frameIndex
                          ? f
                          : {
                              ...f,
                              layers: f.layers.map((l, li) =>
                                li === layerIndex
                                  ? { ...l, pixels: rewriteGrid(l.pixels) }
                                  : l,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    };
  }

  return {
    ...project,
    objects: project.objects.map((o) =>
      o.id !== target.objectId
        ? o
        : {
            ...o,
            frames: o.frames.map((f) =>
              f.id !== target.frameId
                ? f
                : {
                    ...f,
                    layers: f.layers.map((l) =>
                      l.id === target.layerId
                        ? { ...l, pixels: rewriteGrid(l.pixels) }
                        : l,
                    ),
                  },
            ),
          },
    ),
  };
}

/** Undo one entry ON PAPER, whatever family it belongs to. */
function rewindCommand(project: Project, command: Command): Project {
  if (isPixelCommand(command)) return rewindPixelCommand(project, command);
  const children = (command as Command & { children?: readonly Command[] })
    .children;
  if (children) {
    // A composite undoes its children in REVERSE, matching `undo()`.
    let result = project;
    for (let i = children.length - 1; i >= 0; i--) {
      result = rewindCommand(result, children[i]);
    }
    return result;
  }
  // A snapshot command's pre-state IS its `before`.
  return (command as Command & { before?: Project }).before ?? project;
}

/** Rebuild the whole mirror by rewinding from the live project — legacy
 * `computeMirror`, minus the Zustand publication. */
export function recomputeHistoryMirror(app: ApplicationStore): void {
  // `untracked`: these are deliberate non-reactive reads (the legacy glue ran
  // its rewind inside `runInAction` for the same reason) — without it the
  // strict-mode `observableRequiresReaction` meter logs every recompute.
  untracked(() => {
    const entries = app.history.entries;
    const list: Project[] = new Array(entries.length);
    const live = app.domain.currentProject();
    let state = live;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!state) break;
      state = rewindCommand(state, entries[i]);
      list[i] = state;
    }
    mirrorEntries = list.filter((entry): entry is Project => Boolean(entry));
  });
}

/** The parts of the stack whose movement means "a history operation ran".
 * ⚠️ Length and index alone are NOT enough: once the stack sits at its cap,
 * an evict+append cycle changes neither — the first/last command IDENTITIES
 * are what move (measured against the cap pins). */
interface HistoryFingerprint {
  length: number;
  index: number;
  inTransaction: boolean;
  isTransactionEmpty: boolean;
  first: Command | undefined;
  last: Command | undefined;
}

function historyFingerprint(app: ApplicationStore): HistoryFingerprint {
  return untracked(() => {
    const h = app.history;
    return {
      length: h.entries.length,
      index: h.index,
      inTransaction: h.inTransaction,
      isTransactionEmpty: h.isTransactionEmpty,
      first: h.entries[0],
      last: h.entries[h.entries.length - 1],
    };
  });
}

function sameFingerprint(
  a: HistoryFingerprint,
  b: HistoryFingerprint,
): boolean {
  return (
    a.length === b.length &&
    a.index === b.index &&
    a.inTransaction === b.inTransaction &&
    a.isTransactionEmpty === b.isTransactionEmpty &&
    a.first === b.first &&
    a.last === b.last
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* The dispatch table                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

/** The legacy `updateProjectAndSave` — the single whole-project commit path,
 * now expressed through `adoptProject`. */
function updateProjectAndSave(
  app: ApplicationStore,
  updater: (project: Project) => Project,
  trackHistory = false,
): void {
  const project = app.domain.currentProject();
  if (!project) return;
  const next = updater(project);
  // Snapshot the PRE state first, exactly as the legacy path did.
  if (trackHistory) app.saveStateToHistory("Edit");
  app.adoptProject(next);
  // The retired bridge bumped `domainVersion` once per committed legacy
  // mutation, gated exactly like this — that is what made the legacy commit
  // path schedule a save. Transcribed, not redesigned.
  runInAction(() => {
    if (
      app.domain.loadState === "loaded" &&
      !app.session.saveSuspended &&
      !app.history.isReplaying
    ) {
      app.domain.bumpDomainVersion();
    }
  });
}

type Action = (app: ApplicationStore, ...args: any[]) => unknown;

const TABLE: Record<string, Action> = {
  /* ── lifecycle (task 16 delegates) ─────────────────────────────────────── */
  initProject: (app) => flowResult(app.domain.initProject()),
  createNewProject: (app, name) => flowResult(app.domain.createProject(name)),
  switchToProject: (app, name) => flowResult(app.domain.switchProject(name)),
  renameCurrentProject: (app, newName) =>
    flowResult(app.domain.renameProject(newName)),
  deleteCurrentProject: (app) => flowResult(app.domain.deleteProject()),
  refreshProjectList: (app) => flowResult(app.domain.refreshProjectList()),
  restoreFromBackup: (app, date, filename) =>
    flowResult(app.domain.restoreFromBackup(date, filename)),

  /* ── history ───────────────────────────────────────────────────────────── */
  undo: (app) => app.undo(),
  redo: (app) => app.redo(),
  saveCurrentStateToHistory: (app, label) => app.saveStateToHistory(label),
  updateProjectAndSave: (app, updater, trackHistory) =>
    updateProjectAndSave(app, updater, trackHistory),
  beginStroke: () => strokeControl.begin(),
  endStroke: () => strokeControl.end(),

  /* ── the 6 helpers (task 23 computeds) ─────────────────────────────────── */
  getCurrentObject: (app) => app.currentObject,
  getCurrentFrame: (app) => app.currentFrame,
  getCurrentLayer: (app) => app.currentLayer,
  getCurrentVariant: (app) => app.currentVariant,
  getSelectedVariantLayer: (app) => app.selectedVariantLayer,
  isEditingVariant: (app) => app.isEditingVariant,

  /* ── domain: palettes + objects (task 23 delegates) ────────────────────── */
  addPalette: (app, name) => app.palettes.addPalette(name),
  deletePalette: (app, id) => app.palettes.deletePalette(id),
  renamePalette: (app, id, name) => app.palettes.renamePalette(id, name),
  addColorToPalette: (app, paletteId, color) =>
    app.palettes.addColorToPalette(paletteId, color),
  removeColorFromPalette: (app, paletteId, colorIndex) =>
    app.palettes.removeColorFromPalette(paletteId, colorIndex),
  addObject: (app, name, width, height) =>
    app.objects.addObject(name, width, height),
  deleteObject: (app, id) => app.objects.deleteObject(id),
  renameObject: (app, id, name) => app.objects.renameObject(id, name),
  resizeObject: (app, id, width, height, anchor) =>
    app.objects.resizeObject(id, width, height, anchor),
  duplicateObject: (app, id) => app.objects.duplicateObject(id),
  setObjectOrigin: (app, id, origin) => app.objects.setObjectOrigin(id, origin),

  /* ── frames + timeline + layers (task 25 delegates) ────────────────────── */
  addFrame: (app, name, copyPrevious) =>
    app.frames.addFrame(name, copyPrevious),
  deleteFrame: (app, id) => app.frames.deleteFrame(id),
  deleteSelectedFrame: (app) => app.frames.deleteSelectedFrame(),
  renameFrame: (app, id, name) => app.frames.renameFrame(id, name),
  duplicateFrame: (app, id) => app.frames.duplicateFrame(id),
  moveFrame: (app, id, direction) => app.frames.moveFrame(id, direction),
  reorderFrame: (app, frameId, toIndex) =>
    app.frames.reorderFrame(frameId, toIndex),
  addFrameTag: (app, frameId, tag) => app.frames.addFrameTag(frameId, tag),
  removeFrameTag: (app, frameId, tag) =>
    app.frames.removeFrameTag(frameId, tag),

  selectObject: (app, id) => app.timelineUI.selectObject(id),
  selectFrame: (app, id, syncVariants) =>
    app.timelineUI.selectFrame(id, syncVariants),
  selectLayer: (app, id) => app.timelineUI.selectLayer(id),
  setObjectLibraryViewMode: (app, mode) =>
    app.timelineUI.setObjectLibraryViewMode(mode),
  setTimelineThumbnailMode: (app, enabled) =>
    app.timelineUI.setTimelineThumbnailMode(enabled),

  addLayer: (app, name) => app.layers.addLayer(name),
  duplicateLayer: (app, id) => app.layers.duplicateLayer(id),
  deleteLayer: (app, id) => app.layers.deleteLayer(id),
  renameLayer: (app, id, name) => app.layers.renameLayer(id, name),
  toggleLayerVisibility: (app, id) => app.layers.toggleLayerVisibility(id),
  toggleAllLayersVisibility: (app, visible) =>
    app.layers.toggleAllLayersVisibility(visible),
  moveLayer: (app, from, to) => app.layers.moveLayer(from, to),
  moveLayerAcrossAllFrames: (app, layerId, direction) =>
    app.layers.moveLayerAcrossAllFrames(layerId, direction),
  deleteLayerAcrossAllFrames: (app, layerId) =>
    app.layers.deleteLayerAcrossAllFrames(layerId),
  squashLayerDown: (app, layerId) => app.layers.squashLayerDown(layerId),
  squashLayerUp: (app, layerId) => app.layers.squashLayerUp(layerId),
  squashLayerDownAcrossAllFrames: (app, layerId) =>
    app.layers.squashLayerDownAcrossAllFrames(layerId),
  squashLayerUpAcrossAllFrames: (app, layerId) =>
    app.layers.squashLayerUpAcrossAllFrames(layerId),
  moveLayerPixels: (app, dx, dy) => app.layers.moveLayerPixels(dx, dy),
  addLayerToAllFrames: (app, name) => app.layers.addLayerToAllFrames(name),
  addLayerToFrameAtPosition: (app, frameId, name, position, variantInfo) =>
    app.layers.addLayerToFrameAtPosition(frameId, name, position, variantInfo),
  deleteLayerFromFrame: (app, frameId, layerId) =>
    app.layers.deleteLayerFromFrame(frameId, layerId),
  reorderLayerInFrame: (app, frameId, layerId, newIndex) =>
    app.layers.reorderLayerInFrame(frameId, layerId, newIndex),
  copyTimelineCell: (app, frameId, layerId) =>
    app.layers.copyTimelineCell(frameId, layerId),
  pasteTimelineCell: (app, frameId, targetLayerId) =>
    app.layers.pasteTimelineCell(frameId, targetLayerId),
  copyLayerToClipboard: (app, layerId) =>
    app.layers.copyLayerToClipboard(layerId),
  pasteLayerFromClipboard: (app, currentFrameOnly) =>
    app.layers.pasteLayerFromClipboard(currentFrameOnly),
  copyLayerFromObject: (
    app,
    sourceObjectId,
    sourceLayerId,
    isVariant,
    variantGroupId,
    variantId,
  ) =>
    app.layers.copyLayerFromObject(
      sourceObjectId,
      sourceLayerId,
      isVariant,
      variantGroupId,
      variantId,
    ),

  /* ── pixels + selection (task 26 delegates) ────────────────────────────── */
  setPixel: (app, x, y, color) =>
    app.pixels.setPixel(x, y, color, app.selectionUI.writeOptions),
  setPixels: (app, pixels) =>
    app.pixels.setPixels(pixels, app.selectionUI.writeOptions),
  setSelection: (app, box) =>
    app.selectionUI.setSelection(box, app.selectionDims),
  setSelectionMask: (app, mask, dims, op) =>
    app.selectionUI.setSelectionMask(mask, dims, op),
  clearSelection: (app) => app.selectionUI.clearSelection(),
  moveSelection: (app, dx, dy) => app.selectionUI.moveSelection(dx, dy),
  expandSelection: (app, steps) => app.selectionUI.expandSelection(steps),
  shrinkSelection: (app, steps) => app.selectionUI.shrinkSelection(steps),
  selectFloodFillAt: (app, x, y) => {
    const editable = app.editableGrid;
    if (!editable) return;
    app.selectionUI.selectFloodFillAt(x, y, editable.grid, editable.dims);
  },
  selectAllByColorAt: (app, x, y) => {
    const editable = app.editableGrid;
    if (!editable) return;
    app.selectionUI.selectAllByColorAt(x, y, editable.grid, editable.dims);
  },
  selectLasso: (app, points) =>
    app.selectionUI.selectLasso(points, app.selectionDims),
  // The two that ALWAYS act on the mask — `selectionBehavior` never gated
  // them, which is why this is `maskWriteOptions` and not `writeOptions`.
  deleteSelectionPixels: (app) =>
    app.pixels.deleteSelectionPixels(app.selectionUI.maskWriteOptions),
  // ⚠️ TWO STEPS, in this order — the pixels move, then the MASK moves with
  // them (the legacy intra-module call; the bridge delegate preserved it).
  moveSelectedPixels: (app, dx, dy) => {
    app.pixels.moveSelectedPixels(dx, dy, app.selectionUI.maskWriteOptions);
    app.selectionUI.moveSelection(dx, dy);
  },

  /* ── lighting (task 27 delegates) ──────────────────────────────────────── */
  // `setStudioMode`'s coupled `selectedTool` write lives INSIDE the store
  // now (`LightingUIStore` writes the injected `ToolUIStore`), so the bridge
  // delegate's two-call branch collapses to the one-liner its comment
  // predicted it would.
  setStudioMode: (app, mode) => app.lightingUI.setStudioMode(mode),
  setLightingDataLayerEditMode: (app, mode) =>
    app.lightingUI.setLightingDataLayerEditMode(mode),
  setSelectedNormal: (app, normal) => app.lightingUI.setSelectedNormal(normal),
  setLightDirection: (app, normal) => app.lightingUI.setLightDirection(normal),
  setLightColor: (app, color) => app.lightingUI.setLightColor(color),
  setAmbientColor: (app, color) => app.lightingUI.setAmbientColor(color),
  setHeightScale: (app, scale) => app.lightingUI.setHeightScale(scale),
  setHeightBrushValue: (app, value) =>
    app.lightingUI.setHeightBrushValue(value),
  setNormalBrushShape: (app, shape) =>
    app.lightingUI.setNormalBrushShape(shape),
  setNormalPixel: (app, x, y, normal) =>
    app.pixels.setNormalPixel(x, y, normal, app.selectionUI.writeOptions),
  setNormalPixels: (app, pixels) =>
    app.pixels.setNormalPixels(pixels, app.selectionUI.writeOptions),
  setHeightPixels: (app, pixels) =>
    app.pixels.setHeightPixels(pixels, app.selectionUI.writeOptions),
  // A FLOW: fired and forgotten, preserving the legacy synchronous call shape.
  computeNormalsForAllFrames: (app, params) => {
    void flowResult(app.pixels.computeNormalsForAllFrames(params));
  },
  flipHorizontal: (app) =>
    app.pixels.flipHorizontal(app.selectionUI.writeOptions),
  flipVertical: (app) => app.pixels.flipVertical(app.selectionUI.writeOptions),

  /* ── variants (task 28 delegates) ──────────────────────────────────────── */
  makeVariant: (app, layerId) => app.variants.makeVariant(layerId),
  addVariant: (app, variantGroupId, copyFromVariantId) =>
    app.variants.addVariant(variantGroupId, copyFromVariantId),
  deleteVariant: (app, variantGroupId, variantId) =>
    app.variants.deleteVariant(variantGroupId, variantId),
  deleteVariantGroup: (app, variantGroupId) =>
    app.variants.deleteVariantGroup(variantGroupId),
  selectVariant: (app, layerId, variantId) =>
    app.variants.selectVariant(layerId, variantId),
  renameVariant: (app, variantGroupId, variantId, name) =>
    app.variants.renameVariant(variantGroupId, variantId, name),
  renameVariantGroup: (app, variantGroupId, name) =>
    app.variants.renameVariantGroup(variantGroupId, name),
  resizeVariant: (app, variantGroupId, variantId, width, height, anchor) =>
    app.variants.resizeVariant(
      variantGroupId,
      variantId,
      width,
      height,
      anchor,
    ),
  setVariantOffset: (app, dx, dy, allFrames) =>
    app.variants.setVariantOffset(dx, dy, allFrames),
  duplicateVariantFrame: (app, variantGroupId, variantId, frameId) =>
    app.variants.duplicateVariantFrame(variantGroupId, variantId, frameId),
  deleteVariantFrame: (app, variantGroupId, variantId, frameId) =>
    app.variants.deleteVariantFrame(variantGroupId, variantId, frameId),
  addVariantFrameTag: (app, variantGroupId, variantId, frameId, tag) =>
    app.variants.addVariantFrameTag(variantGroupId, variantId, frameId, tag),
  removeVariantFrameTag: (app, variantGroupId, variantId, frameId, tag) =>
    app.variants.removeVariantFrameTag(variantGroupId, variantId, frameId, tag),
  addVariantFrame: (app, variantGroupId, variantId, copyPrevious) =>
    app.variants.addVariantFrame(variantGroupId, variantId, copyPrevious),
  moveVariantFrame: (app, variantGroupId, variantId, frameId, direction) =>
    app.variants.moveVariantFrame(
      variantGroupId,
      variantId,
      frameId,
      direction,
    ),
  reorderVariantFrame: (app, variantGroupId, variantId, frameId, toIndex) =>
    app.variants.reorderVariantFrame(
      variantGroupId,
      variantId,
      frameId,
      toIndex,
    ),
  addVariantLayerFromExisting: (
    app,
    variantGroupId,
    selectedVariantId,
    addToAllFrames,
  ) =>
    app.variants.addVariantLayerFromExisting(
      variantGroupId,
      selectedVariantId,
      addToAllFrames,
    ),
  removeVariantLayer: (app, layerId) =>
    app.variants.removeVariantLayer(layerId),
  selectVariantFrame: (app, variantGroupId, frameIndex) =>
    app.timelineUI.selectVariantFrame(variantGroupId, frameIndex),
  advanceVariantFrames: (app, delta) =>
    app.timelineUI.advanceVariantFrames(delta),

  /* ── gestures (task 32 delegates) ──────────────────────────────────────── */
  // `startDrawing` is a coupled write: the legacy action also cleared any
  // active colour adjustment (`drawingActions.ts:63`, pinned by task 08).
  startDrawing: (app, point) => {
    app.canvasInteraction.startDrawing(point);
    app.clearColorAdjustment();
  },
  updateDrawing: (app, point) => app.canvasInteraction.updateDrawing(point),
  endDrawing: (app) => app.canvasInteraction.endDrawing(),
  setPreviewPixels: (app, pixels) =>
    app.canvasInteraction.setPreviewPixels(pixels),
  clearPreviewPixels: (app) => app.canvasInteraction.clearPreviewPixels(),

  /* ── colour adjustment (W29d/g/h) ──────────────────────────────────────── */
  startColorAdjustment: (app, color, allFrames) =>
    app.startColorAdjustment(color, allFrames),
  adjustColor: (app, newColor, trackHistory) =>
    app.adjustColor(newColor, trackHistory ?? false),
  clearColorAdjustment: (app) => app.clearColorAdjustment(),

  /* ── tool + viewport setters (legacy `toolActions.ts`) ─────────────────── */
  // `setTool`'s couplings: the eyedropper bookkeeping lives in
  // `ToolUIStore.setTool`; the trace-mode exclusivity is `ReferenceUIStore`'s
  // reaction on `selectedTool`; the colour-adjustment clear is the one piece
  // that stays with the caller (`toolActions.ts:98`, "Clear color adjustment
  // when switching tools").
  setTool: (app, tool) => {
    app.ui.tool.setTool(tool);
    app.ui.tool.clearColorAdjustment();
  },
  revertToPreviousTool: (app) => app.ui.tool.revertToPreviousTool(),
  setColor: (app, color) => app.ui.tool.setColor(color),
  setColorAndAddToHistory: (app, color) => app.setColorAndAddToHistory(color),
  addToColorHistory: (app, color) =>
    runInAction(() => app.session.addToColorHistory(color)),
  setBrushSize: (app, size) => app.ui.tool.setBrushSize(size),
  setEraserShape: (app, shape) => app.ui.tool.setEraserShape(shape),
  setPencilBrushShape: (app, shape) => app.ui.tool.setPencilBrushShape(shape),
  setPencilBrushMax: (app, max) => app.ui.tool.setPencilBrushMax(max),
  setBitDepth: (app, depth) => app.ui.tool.setBitDepth(depth),
  setShapeMode: (app, mode) => app.ui.tool.setShapeMode(mode),
  setBorderRadius: (app, radius) => app.ui.tool.setBorderRadius(radius),
  setMoveAllLayers: (app, moveAll) => app.ui.tool.setMoveAllLayers(moveAll),
  setSelectionMode: (app, mode) => app.ui.tool.setSelectionMode(mode),
  setSelectionBehavior: (app, behavior) =>
    app.ui.tool.setSelectionBehavior(behavior),
  setOriginColor: (app, color) => app.ui.tool.setOriginColor(color),
  setGaussianFillParams: (app, params) =>
    app.ui.tool.setGaussianFillParams(params),
  setZoom: (app, zoom) => app.ui.viewport.setZoom(zoom),
  setPanOffset: (app, offset) => app.ui.viewport.setPanOffset(offset),
  toggleFocusMode: (app) => app.ui.viewport.toggleFocusMode(),
  toggleLightGridMode: (app) => app.ui.viewport.toggleLightGridMode(),
  setCanvasInfoHidden: (app, hidden) =>
    app.ui.viewport.setCanvasInfoHidden(hidden),
  setFrameReferencePanelPosition: (app, position) =>
    app.ui.viewport.setPanel("frameReference", { position }),
  setFrameReferencePanelMinimized: (app, minimized) =>
    app.ui.viewport.setPanel("frameReference", { minimized }),
  toggleFrameReferencePanelVisible: (app) =>
    app.ui.viewport.toggleFrameReferencePanelVisible(),
  setReferenceImagePanelPosition: (app, position) =>
    app.ui.viewport.setPanel("referenceImage", { position }),
  setReferenceImagePanelMinimized: (app, minimized) =>
    app.ui.viewport.setPanel("referenceImage", { minimized }),
  setLightingPreviewPanelPosition: (app, position) =>
    app.ui.viewport.setPanel("lightingPreview", { position }),
  setLightingPreviewPanelMinimized: (app, minimized) =>
    app.ui.viewport.setPanel("lightingPreview", { minimized }),
  setTraceNudgeAmount: (app, amount) =>
    app.referenceUI.setTraceNudgeAmount(amount),
  setAiServiceUrl: (app, url) => app.setAiServiceUrl(url),

  /* ── reference / trace (legacy `referenceActions.ts`) ──────────────────── */
  setReferenceOverlayOffset: (app, offset) =>
    app.referenceUI.setOverlayOffset(offset),
  moveReferenceOverlay: (app, dx, dy) => app.referenceUI.moveOverlay(dx, dy),
  resetReferenceOverlay: (app) => app.referenceUI.resetOverlay(),
  // The legacy action committed `project.referenceImage` with
  // `trackHistory=false`; `DomainStore.setReferenceImage` is that exact
  // non-undoable write.
  setReferenceImage: (app, referenceImage) =>
    runInAction(() => app.domain.setReferenceImage(referenceImage)),
  setFrameTraceActive: (app, active, frameIndex) =>
    app.referenceUI.setFrameTraceActive(active, frameIndex),
  moveFrameOverlay: (app, dx, dy) => app.referenceUI.moveFrameOverlay(dx, dy),
  resetFrameOverlay: (app) => app.referenceUI.resetFrameOverlay(),
  setFrameReferenceObjectId: (app, objectId) =>
    app.referenceUI.setFrameReferenceObjectId(objectId),
};

/**
 * Dispatch one legacy-named action against `app`, keeping the history mirror
 * current. Throws on an unknown name — a silently-absorbed dispatch would be
 * a green test asserting nothing.
 */
export function dispatchLegacyAction(
  app: ApplicationStore,
  action: string,
  args: readonly unknown[],
): unknown {
  const impl = TABLE[action];
  if (!impl) {
    throw new Error(`dispatch("${action}"): not an action on the store.`);
  }
  const before = historyFingerprint(app);
  const result = impl(app, ...(args as any[]));
  // Recompute at the legacy glue's timing: after any history operation, and
  // after every write inside an open stroke transaction (when the retired
  // `PixelStore.syncHistory` hook used to fire).
  if (
    !sameFingerprint(historyFingerprint(app), before) ||
    app.history.inTransaction
  ) {
    recomputeHistoryMirror(app);
  }
  return result;
}
