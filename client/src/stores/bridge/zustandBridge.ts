/**
 * zustandBridge — TEMPORARY. Deleted by the final migration task (38), which
 * first confirms PHASE_A_FIELDS is empty.
 *
 * ── THE TWO FIELD LISTS BELOW ARE THE MIGRATION'S PROGRESS LEDGER (R6) ─────
 *
 * A field is mirrored in exactly ONE direction at a time and never has two
 * writers. The task that flips a field's ownership moves it from PHASE_A to
 * PHASE_B **in the same change**. `assertDisjointPhases()` fails in dev/test
 * the moment a field appears in both lists.
 *
 *   Phase A — MobX MIRRORS Zustand. Zustand is the source of truth; the only
 *             writer of the MobX copy is this bridge.
 *   Phase B — Zustand mirrors MobX for not-yet-migrated consumers. MobX is
 *             the source of truth; the only writer of the Zustand copy is
 *             this bridge. First flipped by task 16 (the DomainStore
 *             lifecycle slice + `saveStatus`).
 *
 * Every bridge write is wrapped in `runInAction`: `enforceActions: "always"`
 * makes an unwrapped write throw, and Zustand's `subscribe` callback runs
 * outside any action.
 *
 * Values are mirrored BY REFERENCE, never cloned — the clipboards contain
 * pixel grids, and `SessionStore` annotates them `observable.ref` so MobX
 * never proxies their contents.
 *
 * ── Task 16 additions ──────────────────────────────────────────────────────
 *
 *  1. The Phase B reaction: `loadState` (+ its `isLoading` computed and the
 *     `loadError` message), `projectName`, `projectList` and `saveStatus` are
 *     now MobX-owned and mirrored INTO Zustand for unmigrated consumers
 *     (`App`, `Header`, `ProjectSelectModal`, `BrowseBackupsModal`).
 *  2. The project-lifecycle DELEGATES: the Zustand actions (`initProject`,
 *     `switchToProject`, …) are replaced at install time with calls into the
 *     `DomainStore` flows, so unmigrated components keep their seam.
 *  3. The `domainVersion` bump: the subscribe callback watches the Zustand
 *     `project` REFERENCE and bumps `DomainStore.domainVersion` once per
 *     committed mutation — the auto-save reaction observes the counter, never
 *     the 300k-cell tree. Bumps are gated on `loadState === "loaded"` and
 *     `!saveSuspended`, so hydration installs and lifecycle flows never
 *     schedule a save of their own.
 *
 * ── Task 17 additions ──────────────────────────────────────────────────────
 *
 *  4. The bump is ALSO gated on `!history.isReplaying`: a project commit made
 *     by `undo()`/`redo()` replay must not bump `domainVersion` (the whole
 *     replay runs synchronously inside one MobX action, so the flag is still
 *     set when Zustand's subscribe fires). Together with the trigger guard in
 *     `AutoSaveController` this is the owner-accepted (2026-08-16) behaviour
 *     change: undo performs NO immediate save; the next real edit saves.
 *  5. `projectHistory`/`historyIndex` join Phase B: `HistoryStore` owns undo
 *     history, and the Zustand fields are mirrors. Unusually for Phase B the
 *     writer is NOT the reaction below but the history glue in
 *     `store/index.ts`, which mirrors synchronously after every history
 *     operation — the task 08 suite runs without the bridge installed and
 *     must still see the legacy fields move. External writes to the legacy
 *     fields (`zustandProjectHost`, the test harness) are ADOPTED back by the
 *     glue's `reconcile()` before the next history operation, preserving the
 *     one-field/one-direction/one-writer invariant (R6) via a pull seam.
 *
 * ── Task 23 — THE PIVOT ────────────────────────────────────────────────────
 *
 *  6. The domain TREE (`version`, `objects`, `palettes`, `variants`,
 *     `referenceImage`) moved A→B. MobX is now the source of truth for it and
 *     Zustand's `project` is a read-only mirror.
 *
 *     The spec sketches Phase B as one `reaction(() => app.migratedSnapshot(),
 *     setState)`. That shape is CORRECT for scalars but **must not** be used
 *     for the tree, and this is the one place the implementation deliberately
 *     departs from the spec's snippet:
 *
 *       - a `reaction` returning a rebuilt `{...project}` would allocate a new
 *         project object on every unrelated Phase B change (`saveStatus`
 *         flipping idle→saving→saved is 3 per save), and every one of the 34
 *         consumers reading `project` would re-render;
 *       - with `compareStructural` (which the existing Phase B reaction uses)
 *         it would DEEP-COMPARE a 300,249-cell tree on every change — the R2
 *         catastrophe arriving through the back door rather than through an
 *         annotation.
 *
 *     So the tree is published EVENT-WISE instead: a domain sub-store commits,
 *     then pushes the recombined project into Zustand by reference exactly
 *     once (`DomainMutator` step 3, via `createZustandDomainMirror`). Peak
 *     overhead is one shallow `setState` per actual change, which is what the
 *     spec's "never cloned / one shallow setState per change" requirement is
 *     really asking for. The scalar Phase B reaction below is untouched.
 *
 *  7. The ADOPTION seam (in the subscribe callback): tasks 25-29 still own
 *     ~137 `updateProjectAndSave` call sites, so legacy Zustand actions keep
 *     committing whole `project` objects. Those commits are pulled back into
 *     the MobX tree rather than being given a second writer — the same
 *     pull-based technique as item 5.
 *
 * ── Task 24 — UIStore lands; the bridge lists DO NOT MOVE (yet) ────────────
 *
 *  9. `UIStore`/`ToolUIStore`/`ViewportUIStore` exist and own the 30 UI
 *     fields as observables, and `DomainStore.serialize()` now builds its
 *     `uiState` from `UIStore.toPersistedUIState()` (R3, wire-identical and
 *     pinned against all 151 real corpus snapshots).
 *
 *     But the 30 fields stay in **Phase A**, deliberately. Flipping a field
 *     to Phase B means MobX becomes its single writer — and the ~15 legacy
 *     consumers that still call `useEditorStore().setZoom(...)` live in files
 *     this task's `Touches` list does not cover (`Canvas.tsx` → tasks 30-32,
 *     the lighting consumers → task 27, the reference-image consumers →
 *     task 29, `App.tsx` → task 37). Flipping without migrating them would
 *     give each field TWO writers, which is precisely what R6 forbids.
 *
 *     So `UIStore` MIRRORS Zustand for now (hydrated in `syncPhaseA` below),
 *     which is Phase A's definition. The A→B move happens in the same change
 *     that migrates those consumers — the ownership rule is unchanged, only
 *     its timing is later than the task spec assumed. See the task 24 report.
 *
 *  8. Four `uiState` selection ids joined Phase A (`selectedObjectId`,
 *     `selectedFrameId`, `selectedLayerId`, `variantFrameIndices`). They are
 *     UI fields owned by Zustand until task 24, but the 6 cross-store
 *     computeds cannot recompute unless their inputs are observable, so MobX
 *     keeps a read-only copy on `SelectionMirror`.
 */
import { compareStructural, flowResult, reaction, runInAction } from "mobx";
import { useEditorStore } from "../../store";
import type { EditorState } from "../../store/storeTypes";
import type { Project } from "../../types";
import { normalToPacked, rgbaToHex } from "../../types";
import type { ApplicationStore } from "../ApplicationStore";

/* ── Phase A: Zustand → MobX. Fields whose slice has NOT yet flipped. ────── */
export const PHASE_A_FIELDS = [
  "aiServiceUrl", //           project.uiState.aiServiceUrl  → session.aiServiceUrl
  "layerClipboard", //         EditorState.layerClipboard    → session.layerClipboard
  "timelineCellClipboard", //  EditorState.timelineCellClipboard → session.timelineCellClipboard
  "colorHistory", //           EditorState.colorHistory      → session.colorHistory
  // Task 23 — the 4 `uiState` selection ids the cross-store computeds read.
  // They are UI fields (4 of the 43 persisted ones) and move to
  // `TimelineUIStore` in task 24; until then Zustand owns them and MobX keeps
  // a read-only copy on `SelectionMirror` so the computeds can recompute.
  "selectedObjectId", //   project.uiState.selectedObjectId  → selection.selectedObjectId
  "selectedFrameId", //    project.uiState.selectedFrameId   → selection.selectedFrameId
  "selectedLayerId", //    project.uiState.selectedLayerId   → selection.selectedLayerId
  "variantFrameIndices", //project.uiState.variantFrameIndices → selection.variantFrameIndices
] as const;

/* ── Phase B: MobX → Zustand. Fields whose ownership HAS flipped. ────────── */
// Flipped by task 16 — the DomainStore lifecycle slice, plus `saveStatus`
// (now written only by `AutoSaveController` onto `SessionStore`).
// `loadState` mirrors as BOTH `loadState`/`loadErrorMessage` and the legacy
// `isLoading` boolean (a computed on `DomainStore`).
export const PHASE_B_FIELDS = [
  "loadState", //     domain.loadState    → EditorState.loadState (+ isLoading, loadErrorMessage)
  "projectName", //   domain.projectName  → EditorState.projectName
  "projectList", //   domain.projectList  → EditorState.projectList
  "saveStatus", //    session.saveStatus  → EditorState.saveStatus
  // Task 17 — mirrored by the history glue in store/index.ts, NOT by the
  // reaction below (see item 5 in the module header):
  "projectHistory", // history.entries    → EditorState.projectHistory (before-snapshots)
  "historyIndex", //   history.index      → EditorState.historyIndex
  // ── Task 23: THE PIVOT. The domain TREE is now MobX-owned. ──────────────
  // Zustand's `project` is a read-only mirror for the 34 unmigrated
  // consumers; these five members are written into it, by reference, by the
  // domain sub-stores' `publish()` (see `DomainMutator`). The legacy
  // `updateProjectAndSave` actions that still write `project` are ADOPTED
  // back into the tree by the subscribe callback below — a pull seam, exactly
  // like task 17's `reconcile()`, so there is still ONE writer per field.
  "version", //         domain.version        → project.version
  "objects", //         domain.objects        → project.objects
  "palettes", //        domain.palettes       → project.palettes
  "variants", //        domain.variants       → project.variants
  "referenceImage", //  domain.referenceImage → project.referenceImage
] as const;

/**
 * R6 dev-mode assertion: one field, one direction, one writer. Exported so
 * the store tests pin it too.
 */
export function assertDisjointPhases(
  phaseA: readonly string[] = PHASE_A_FIELDS,
  phaseB: readonly string[] = PHASE_B_FIELDS,
): void {
  const dual = phaseA.filter((field) => phaseB.includes(field));
  if (dual.length > 0) {
    throw new Error(
      `zustandBridge: field(s) mirrored in BOTH phases — two writers (R6): ${dual.join(", ")}. ` +
        "The task that flips a field's ownership must MOVE it between lists, not copy it.",
    );
  }
}

/**
 * Mirror every Phase A field from a Zustand snapshot into the MobX tree.
 * The single writer of these MobX fields during Phase A.
 */
function syncPhaseA(app: ApplicationStore, s: EditorState): void {
  runInAction(() => {
    app.session.aiServiceUrl = s.project?.uiState.aiServiceUrl ?? null;
    // ── Task 24: keep `UIStore` hydrated from the authoritative `uiState` ──
    //
    // The 30 migrated fields are still written through the legacy Zustand
    // setters by consumers tasks 25-29 own, so Zustand remains the source of
    // truth for them and `UIStore` mirrors it (Phase A). This is what makes
    // `DomainStore.serialize()` — which now builds its `uiState` from
    // `UIStore` — emit the user's real settings rather than store defaults.
    //
    // ⚠️ Without this the save payload would be wire-shaped but WRONG: every
    // save would overwrite the project's UI state with the constructor
    // defaults. `persistedUIState.test.ts` pins the shape; this keeps the
    // VALUES right.
    if (s.project) {
      app.ui.hydrate(s.project.uiState);
      app.ui.lighting = {
        studioMode: s.project.uiState.studioMode,
        lightingDataLayerEditMode: s.project.uiState.lightingDataLayerEditMode,
        selectedNormal: normalToPacked(s.project.uiState.selectedNormal),
        lightDirection: normalToPacked(s.project.uiState.lightDirection),
        lightColor: rgbaToHex(s.project.uiState.lightColor),
        ambientColor: rgbaToHex(s.project.uiState.ambientColor),
        heightScale: s.project.uiState.heightScale,
        heightBrushValue: s.project.uiState.heightBrushValue,
        normalBrushShape: s.project.uiState.normalBrushShape,
      };
    }
    app.session.layerClipboard = s.layerClipboard;
    app.session.timelineCellClipboard = s.timelineCellClipboard;
    app.session.colorHistory = s.colorHistory;
    // Task 23: the 4 selection ids the cross-store computeds depend on.
    const uiState = s.project?.uiState;
    app.selection.adopt({
      selectedObjectId: uiState?.selectedObjectId ?? null,
      selectedFrameId: uiState?.selectedFrameId ?? null,
      selectedLayerId: uiState?.selectedLayerId ?? null,
      variantFrameIndices: uiState?.variantFrameIndices ?? {},
    });
  });
}

/** The Phase B snapshot Zustand receives. */
function phaseBSnapshot(app: ApplicationStore): Partial<EditorState> {
  return {
    loadState: app.domain.loadState,
    loadErrorMessage: app.domain.loadError?.message ?? null,
    isLoading: app.domain.isLoading,
    projectName: app.domain.projectName,
    projectList: app.domain.projectList.slice(),
    saveStatus: app.session.saveStatus,
  };
}

/**
 * Install the bridge. Call once, from `main.tsx`, right after constructing
 * the `ApplicationStore`. Returns a disposer.
 */
export function installBridge(app: ApplicationStore): () => void {
  if (!import.meta.env.PROD) {
    assertDisjointPhases();
  }

  // Zustand's `subscribe` fires only on CHANGES; adopt the current state
  // immediately so the MobX tree never starts stale.
  syncPhaseA(app, useEditorStore.getState());

  // The `domainVersion` bump — see item 3 in the module header.
  let lastProject = useEditorStore.getState().project;

  const disposeZ = useEditorStore.subscribe((s) => {
    syncPhaseA(app, s);
    if (s.project !== lastProject) {
      lastProject = s.project;

      // ── Task 23: ADOPT a legacy commit back into the MobX tree ──────────
      //
      // Tasks 25-29 still own ~137 `updateProjectAndSave` call sites, so
      // Zustand actions keep committing whole `project` objects. Rather than
      // give those five fields a second writer (which R6 forbids), the tree
      // PULLS the commit back in — the same adoption seam task 17 used for
      // `projectHistory`. `adoptTree` assigns by reference, so no grid is
      // cloned and no grid is proxied.
      //
      // A publish made BY a domain sub-store re-enters here with a tree that
      // is already reference-identical, so adoption is a no-op for it.
      if (s.project) {
        runInAction(() => app.domain.adoptTree(s.project as Project));
      }

      runInAction(() => {
        if (
          s.project !== null &&
          app.domain.loadState === "loaded" &&
          !app.session.saveSuspended &&
          // Task 17: replay commits never count as edits (item 4, header).
          !app.history.isReplaying
        ) {
          app.domain.bumpDomainVersion();
        }
      });
    }
  });

  // Phase B: Zustand mirrors MobX for not-yet-migrated consumers. MobX's
  // `reaction` is already an action-safe context; the Zustand write is plain.
  const disposeB = reaction(
    () => phaseBSnapshot(app),
    (snap) => useEditorStore.setState(snap),
    { equals: compareStructural },
  );

  // The lifecycle DELEGATES — see item 2 in the module header. The previous
  // (throwing-stub) actions are captured and restored on dispose so tests can
  // wire and unwire repeatedly.
  const previousActions = {
    initProject: useEditorStore.getState().initProject,
    createNewProject: useEditorStore.getState().createNewProject,
    switchToProject: useEditorStore.getState().switchToProject,
    renameCurrentProject: useEditorStore.getState().renameCurrentProject,
    deleteCurrentProject: useEditorStore.getState().deleteCurrentProject,
    refreshProjectList: useEditorStore.getState().refreshProjectList,
    restoreFromBackup: useEditorStore.getState().restoreFromBackup,
  };
  // Task 23: the 11 migrated domain actions. `PaletteStore`/`ObjectStore`
  // mutate the MobX tree and publish the result back into Zustand, so the
  // unmigrated consumers keep calling `useEditorStore().addPalette(...)` and
  // see the same observable behaviour they always did.
  const previousDomainActions = {
    addPalette: useEditorStore.getState().addPalette,
    deletePalette: useEditorStore.getState().deletePalette,
    renamePalette: useEditorStore.getState().renamePalette,
    addColorToPalette: useEditorStore.getState().addColorToPalette,
    removeColorFromPalette: useEditorStore.getState().removeColorFromPalette,
    addObject: useEditorStore.getState().addObject,
    deleteObject: useEditorStore.getState().deleteObject,
    renameObject: useEditorStore.getState().renameObject,
    resizeObject: useEditorStore.getState().resizeObject,
    duplicateObject: useEditorStore.getState().duplicateObject,
    setObjectOrigin: useEditorStore.getState().setObjectOrigin,
  };
  useEditorStore.setState({
    addPalette: (name) => app.palettes.addPalette(name),
    deletePalette: (id) => app.palettes.deletePalette(id),
    renamePalette: (id, name) => app.palettes.renamePalette(id, name),
    addColorToPalette: (paletteId, color) =>
      app.palettes.addColorToPalette(paletteId, color),
    removeColorFromPalette: (paletteId, colorIndex) =>
      app.palettes.removeColorFromPalette(paletteId, colorIndex),
    addObject: (name, width, height) =>
      app.objects.addObject(name, width, height),
    deleteObject: (id) => app.objects.deleteObject(id),
    renameObject: (id, name) => app.objects.renameObject(id, name),
    resizeObject: (id, width, height, anchor) =>
      app.objects.resizeObject(id, width, height, anchor),
    duplicateObject: (id) => app.objects.duplicateObject(id),
    setObjectOrigin: (id, origin) => app.objects.setObjectOrigin(id, origin),
  });

  useEditorStore.setState({
    initProject: () => flowResult(app.domain.initProject()),
    createNewProject: (name) => flowResult(app.domain.createProject(name)),
    switchToProject: (name) => flowResult(app.domain.switchProject(name)),
    renameCurrentProject: (newName) =>
      flowResult(app.domain.renameProject(newName)),
    deleteCurrentProject: () => flowResult(app.domain.deleteProject()),
    refreshProjectList: () => flowResult(app.domain.refreshProjectList()),
    restoreFromBackup: (date, filename) =>
      flowResult(app.domain.restoreFromBackup(date, filename)),
  });

  return () => {
    disposeZ();
    disposeB();
    useEditorStore.setState(previousActions);
    useEditorStore.setState(previousDomainActions);
  };
}
