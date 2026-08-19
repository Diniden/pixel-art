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
import { strokeControl, useEditorStore } from "../../store";
import type { EditorState } from "../../store/storeTypes";
import type { PixelData, Project } from "../../types";
import { normalToPacked, rgbaToHex } from "../../types";
import type { ApplicationStore } from "../ApplicationStore";

/* ── Phase A: Zustand → MobX. Fields whose slice has NOT yet flipped. ────── */
export const PHASE_A_FIELDS = [
  "aiServiceUrl", //           project.uiState.aiServiceUrl  → session.aiServiceUrl
  "colorHistory", //           EditorState.colorHistory      → session.colorHistory
  // ── The 4 selection ids. STILL PHASE A after task 25 — deliberately. ────
  //
  // `TimelineUIStore` now exists and owns `selectFrame`/`selectLayer`, but
  // these four fields still have OTHER writers in files task 25 does not own:
  // `store/objectActions.ts:58` (`selectObject`) writes all three ids, and
  // `store/variantActions.ts` writes `variantFrameIndices` at 8 sites plus
  // the ids at `:851-853`. Flipping them would give each field two writers,
  // which R6 forbids. They flip with the task that migrates those two files.
  //
  // Meanwhile there is still exactly ONE writer of the MobX copy: the bridge.
  // `TimelineUIStore`'s own selection writes go to ZUSTAND (through
  // `createZustandTimelineContext`) and are read straight back by
  // `syncPhaseA` — a round trip, not a second writer.
  "selectedObjectId", //   project.uiState.selectedObjectId  → timelineUI.selectedObjectId
  "selectedFrameId", //    project.uiState.selectedFrameId   → timelineUI.selectedFrameId
  "selectedLayerId", //    project.uiState.selectedLayerId   → timelineUI.selectedLayerId
  "variantFrameIndices", //project.uiState.variantFrameIndices → timelineUI.variantFrameIndices
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
  // ── Task 25: the three timeline/layer UI fields that DO have one writer ─
  //
  // Every writer of these three now routes into MobX: `selectLayer` is a
  // `TimelineUIStore` action, and `setObjectLibraryViewMode` /
  // `setTimelineThumbnailMode` are bridge-installed delegates into it (the
  // legacy `toolActions` implementations are dead once the delegate is
  // installed). Their consumers — `LayerPanel`, `FrameTimeline`,
  // `TimelineView`, `ObjectLibrary` — read them off `project.uiState`, which
  // the Phase B reaction below keeps in sync.
  // ── Task 25: BOTH CLIPBOARDS FLIP A→B (R6, and R14 stays intact) ───────
  //
  // `LayerStore` is now the only writer of either buffer — the three legacy
  // `layerClipboardActions` and the two `timelineActions` clipboard actions
  // are throwing stubs behind bridge delegates. So Zustand can no longer be
  // the source of truth, and leaving them in Phase A would mean a MobX write
  // never reached the two consumers that read them (`LayerPanel`,
  // `TimelineView` — both migrated by this same task, per §9.8).
  //
  // ⚠️ THE FLIP DOES NOT WEAKEN R14. The buffers still live on
  // `SessionStore`, which is tab-scoped and has no reset/clear/switch hook by
  // construction, and the Phase B reaction below mirrors them BY REFERENCE
  // (never cloned — they hold pixel grids). A project switch touches neither
  // store, so the two task-08 cross-project tests stay green.
  "layerClipboard", //        session.layerClipboard        → EditorState.layerClipboard
  "timelineCellClipboard", // session.timelineCellClipboard → EditorState.timelineCellClipboard
  // ── Task 26: the pixel SELECTION flips A→B (R6) ────────────────────────
  //
  // `SelectionUIStore` is now the only writer of the mask — the 9 legacy
  // `selectionActions` are throwing stubs behind bridge delegates — so
  // Zustand can no longer be the source of truth. Unusually for Phase B the
  // writer is not the scalar reaction below but
  // `createZustandSelectionPublisher`, called by the store on every selection
  // change; `EditorState.selection` is a TOP-LEVEL field, not part of
  // `project.uiState`, so it cannot ride the `uiState` reaction either.
  //
  // ⚠️ Mirrored BY REFERENCE. `SelectionState.mask` is a raw `Set<number>`
  // that reaches 300,249 entries on a select-all over the owner's real
  // project; it is `observableRef` on the store and must never be cloned or
  // deep-compared here.
  //
  // NOT persisted — the selection is transient session state, so this flip
  // has no wire-format consequence. `selectionMode`/`selectionBehavior`, which
  // ARE persisted, stay on `ToolUIStore` (task 24) and are untouched.
  "selection", //        selectionUI.selection → EditorState.selection
  "layerSelectionCounter", // viewport.layerSelectionCounter → uiState.layerSelectionCounter
  "objectLibraryViewMode", // viewport.objectLibraryViewMode → uiState.objectLibraryViewMode
  "timelineThumbnailMode", // viewport.timelineThumbnailMode → uiState.timelineThumbnailMode
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
    // Task 25: the two clipboards moved to Phase B — MobX owns them now and
    // the reaction below mirrors them OUT. Reading them back in here would
    // make Zustand a second writer (R6) and would clobber a fresh copy with
    // the stale mirror on the very next unrelated Zustand change.
    app.session.colorHistory = s.colorHistory;
    // Task 23: the 4 selection ids the cross-store computeds depend on.
    const uiState = s.project?.uiState;
    app.timelineUI.adopt({
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
    // Task 25 — mirrored BY REFERENCE. These carry `PixelData[][]` grids and
    // `SessionStore` annotates them `observableRef`, so MobX never sees
    // inside one. `compareStructural` on the snapshot below compares them by
    // reference for the same reason: a deep compare of a pasted 300k-cell
    // grid is the R2 catastrophe arriving through the back door.
    layerClipboard: app.session.layerClipboard,
    timelineCellClipboard: app.session.timelineCellClipboard,
  };
}

/**
 * Shallow equality for {@link phaseBSnapshot}. See the note at its use site
 * for why this replaced `compareStructural` in task 25.
 */
function phaseBEquals(
  a: Partial<EditorState>,
  b: Partial<EditorState>,
): boolean {
  if (a === b) return true;
  const aList = a.projectList ?? [];
  const bList = b.projectList ?? [];
  return (
    a.loadState === b.loadState &&
    a.loadErrorMessage === b.loadErrorMessage &&
    a.isLoading === b.isLoading &&
    a.projectName === b.projectName &&
    a.saveStatus === b.saveStatus &&
    // By REFERENCE — never a deep compare, these hold pixel grids.
    a.layerClipboard === b.layerClipboard &&
    a.timelineCellClipboard === b.timelineCellClipboard &&
    aList.length === bList.length &&
    aList.every((name, i) => name === bList[i])
  );
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

  // ── Task 25: adopt the TREE eagerly too ─────────────────────────────────
  //
  // A latent gap, found by this task rather than introduced by it. Phase A
  // was adopted on install, but the tree was adopted only inside the
  // subscribe callback — i.e. only on the next `project` REFERENCE change.
  // A bridge installed while a project is ALREADY loaded therefore started
  // with an empty `DomainStore.objects` until something happened to replace
  // the project.
  //
  // `PaletteStore` and `ObjectStore` never noticed: `addPalette`/`addObject`
  // append unconditionally and never READ the tree first. Task 25's stores
  // do — `FrameStore` and `LayerStore` both resolve `currentObject()` before
  // mutating — so on a stale tree they silently bailed out and scheduled no
  // save. Measured directly in `autoSave.test.ts` ("addLayer schedules
  // exactly one save"), where the suite installs a SECOND ApplicationStore
  // after the project is loaded.
  //
  // `adoptTree` assigns by reference, so this clones nothing and proxies no
  // grid. It is a no-op when there is no project.
  const initialProject = useEditorStore.getState().project;
  if (initialProject) {
    runInAction(() => app.domain.adoptTree(initialProject));
  }

  // The `domainVersion` bump — see item 3 in the module header.
  let lastProject = initialProject;

  // Task 25: the last clipboard values THIS bridge published, so an external
  // Zustand write can be told apart from the mirror's own echo. See
  // `adoptClipboards` below.
  let mirroredLayerClipboard = app.session.layerClipboard;
  let mirroredTimelineCellClipboard = app.session.timelineCellClipboard;

  /**
   * ── The clipboard ADOPTION seam (R6) ──────────────────────────────────
   *
   * The two clipboards are Phase B — `LayerStore` owns them — but external
   * writes to the legacy Zustand fields still exist during the bridge era,
   * exactly as they did for `projectHistory` (task 17) and the tree (task
   * 23). The task 08 harness clears `layerClipboard` in its `afterEach`, and
   * a second `ApplicationStore` installed over the same Zustand store
   * publishes its own empty buffers.
   *
   * Rather than give the fields a second writer, the value is PULLED back:
   * when Zustand's value differs from what this bridge last published, the
   * external write wins and is adopted into `SessionStore`. One field, one
   * direction, one writer — with a pull seam, the same technique task 17
   * used for `reconcile()`.
   *
   * ⚠️ Assigns BY REFERENCE. These hold pixel grids and `SessionStore`
   * annotates them `observableRef`; nothing here is cloned or proxied.
   *
   * ⚠️ R14 is untouched: this adopts what Zustand HAS, it never clears
   * anything on a project switch. `projectActions` writes neither field, so a
   * switch leaves both buffers exactly where they were.
   */
  const adoptClipboards = (s: EditorState): void => {
    if (s.layerClipboard !== mirroredLayerClipboard) {
      mirroredLayerClipboard = s.layerClipboard;
      app.session.layerClipboard = s.layerClipboard;
    }
    if (s.timelineCellClipboard !== mirroredTimelineCellClipboard) {
      mirroredTimelineCellClipboard = s.timelineCellClipboard;
      app.session.timelineCellClipboard = s.timelineCellClipboard;
    }
  };

  const disposeZ = useEditorStore.subscribe((s) => {
    syncPhaseA(app, s);
    runInAction(() => adoptClipboards(s));
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
    (snap) => {
      // Record what we published so `adoptClipboards` can distinguish this
      // echo from a genuine external write.
      mirroredLayerClipboard = snap.layerClipboard ?? null;
      mirroredTimelineCellClipboard = snap.timelineCellClipboard ?? null;
      useEditorStore.setState(snap);
    },
    // ⚠️ NOT `compareStructural` since task 25: the snapshot now carries the
    // two clipboards, which hold `PixelData[][]` grids. A structural compare
    // of a pasted 300k-cell grid on every unrelated Phase B change is exactly
    // the R2 catastrophe the tree publication path was designed to avoid
    // (module header, item 6) — arriving through the back door.
    //
    // The scalars are compared with `===` and the two clipboards by
    // REFERENCE, which is correct for both: `SessionStore` replaces each
    // buffer wholesale (`observableRef`), so a new copy is always a new
    // object. `projectList` is the one array and is compared element-wise.
    { equals: phaseBEquals },
  );

  // ── Task 25: the three `uiState` fields that flipped A→B ────────────────
  //
  // A SEPARATE reaction, because these three live INSIDE `project.uiState`
  // rather than at the top level of `EditorState`, so they cannot ride the
  // scalar snapshot above.
  //
  // ⚠️ It rebuilds `project` — but only when one of the three actually
  // changes (`compareStructural` over a 3-key tuple), which is a user click,
  // not a save-status flicker. It must NOT be folded into the tree
  // publication path: that would deep-compare a 300k-cell tree (see item 6).
  //
  // The write is a no-op when the value is already correct, which is what
  // keeps the round trip through `syncPhaseA` from oscillating: a value the
  // legacy setter wrote first is simply re-written identically.
  const disposeUIB = reaction(
    () => ({
      layerSelectionCounter: app.timelineUI.layerSelectionCounter,
      objectLibraryViewMode: app.timelineUI.objectLibraryViewMode,
      timelineThumbnailMode: app.timelineUI.timelineThumbnailMode,
    }),
    (snap) => {
      const { project } = useEditorStore.getState();
      if (!project) return;
      const ui = project.uiState;
      if (
        ui.layerSelectionCounter === snap.layerSelectionCounter &&
        ui.objectLibraryViewMode === snap.objectLibraryViewMode &&
        ui.timelineThumbnailMode === snap.timelineThumbnailMode
      ) {
        return;
      }
      useEditorStore.setState({
        project: { ...project, uiState: { ...ui, ...snap } },
      });
    },
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

  // ── Task 25: the 26 migrated timeline/frame/layer actions ──────────────
  //
  // Same DELEGATE technique task 23 used for the 11 domain actions, and the
  // reason this task can migrate the STORE without editing `Canvas.tsx`,
  // `LightingCanvas.tsx`, `CopyFromModal.tsx`, `ObjectLibrary.tsx` or
  // `variantActions.ts` — five consumers owned by later tasks (30-32, 33-34,
  // 35/36, and 28). Those files keep calling `useEditorStore().selectFrame(…)`
  // and land in `TimelineUIStore` / `FrameStore` / `LayerStore`.
  //
  // This is what makes the migration honest rather than partial: there is now
  // exactly ONE implementation of each action, so no consumer can observe
  // divergent behaviour depending on which path it took. The legacy bodies in
  // `store/{frame,layer,timeline,layerClipboard}Actions.ts` are replaced with
  // throwing stubs (`migrated()`), exactly as `paletteActions`/`objectActions`
  // were in task 23.
  const previousTimelineActions = {
    // FrameStore (9)
    addFrame: useEditorStore.getState().addFrame,
    deleteFrame: useEditorStore.getState().deleteFrame,
    deleteSelectedFrame: useEditorStore.getState().deleteSelectedFrame,
    renameFrame: useEditorStore.getState().renameFrame,
    duplicateFrame: useEditorStore.getState().duplicateFrame,
    moveFrame: useEditorStore.getState().moveFrame,
    reorderFrame: useEditorStore.getState().reorderFrame,
    addFrameTag: useEditorStore.getState().addFrameTag,
    removeFrameTag: useEditorStore.getState().removeFrameTag,
    // TimelineUIStore (2 + 2)
    selectFrame: useEditorStore.getState().selectFrame,
    selectLayer: useEditorStore.getState().selectLayer,
    setObjectLibraryViewMode: useEditorStore.getState().setObjectLibraryViewMode,
    setTimelineThumbnailMode: useEditorStore.getState().setTimelineThumbnailMode,
    // LayerStore (14 + 4 + 2 + 3)
    addLayer: useEditorStore.getState().addLayer,
    duplicateLayer: useEditorStore.getState().duplicateLayer,
    deleteLayer: useEditorStore.getState().deleteLayer,
    renameLayer: useEditorStore.getState().renameLayer,
    toggleLayerVisibility: useEditorStore.getState().toggleLayerVisibility,
    toggleAllLayersVisibility: useEditorStore.getState().toggleAllLayersVisibility,
    moveLayer: useEditorStore.getState().moveLayer,
    moveLayerAcrossAllFrames: useEditorStore.getState().moveLayerAcrossAllFrames,
    deleteLayerAcrossAllFrames: useEditorStore.getState().deleteLayerAcrossAllFrames,
    squashLayerDown: useEditorStore.getState().squashLayerDown,
    squashLayerUp: useEditorStore.getState().squashLayerUp,
    squashLayerDownAcrossAllFrames:
      useEditorStore.getState().squashLayerDownAcrossAllFrames,
    squashLayerUpAcrossAllFrames:
      useEditorStore.getState().squashLayerUpAcrossAllFrames,
    moveLayerPixels: useEditorStore.getState().moveLayerPixels,
    addLayerToAllFrames: useEditorStore.getState().addLayerToAllFrames,
    addLayerToFrameAtPosition: useEditorStore.getState().addLayerToFrameAtPosition,
    deleteLayerFromFrame: useEditorStore.getState().deleteLayerFromFrame,
    reorderLayerInFrame: useEditorStore.getState().reorderLayerInFrame,
    copyTimelineCell: useEditorStore.getState().copyTimelineCell,
    pasteTimelineCell: useEditorStore.getState().pasteTimelineCell,
    copyLayerToClipboard: useEditorStore.getState().copyLayerToClipboard,
    pasteLayerFromClipboard: useEditorStore.getState().pasteLayerFromClipboard,
    copyLayerFromObject: useEditorStore.getState().copyLayerFromObject,
  };
  useEditorStore.setState({
    addFrame: (name, copyPrevious) => app.frames.addFrame(name, copyPrevious),
    deleteFrame: (id) => app.frames.deleteFrame(id),
    deleteSelectedFrame: () => app.frames.deleteSelectedFrame(),
    renameFrame: (id, name) => app.frames.renameFrame(id, name),
    duplicateFrame: (id) => app.frames.duplicateFrame(id),
    moveFrame: (id, direction) => app.frames.moveFrame(id, direction),
    reorderFrame: (frameId, toIndex) => app.frames.reorderFrame(frameId, toIndex),
    addFrameTag: (frameId, tag) => app.frames.addFrameTag(frameId, tag),
    removeFrameTag: (frameId, tag) => app.frames.removeFrameTag(frameId, tag),

    selectFrame: (id, syncVariants) => app.timelineUI.selectFrame(id, syncVariants),
    selectLayer: (id) => app.timelineUI.selectLayer(id),
    setObjectLibraryViewMode: (mode) =>
      app.timelineUI.setObjectLibraryViewMode(mode),
    setTimelineThumbnailMode: (enabled) =>
      app.timelineUI.setTimelineThumbnailMode(enabled),

    addLayer: (name) => app.layers.addLayer(name),
    duplicateLayer: (id) => app.layers.duplicateLayer(id),
    deleteLayer: (id) => app.layers.deleteLayer(id),
    renameLayer: (id, name) => app.layers.renameLayer(id, name),
    toggleLayerVisibility: (id) => app.layers.toggleLayerVisibility(id),
    toggleAllLayersVisibility: (visible) =>
      app.layers.toggleAllLayersVisibility(visible),
    moveLayer: (from, to) => app.layers.moveLayer(from, to),
    moveLayerAcrossAllFrames: (layerId, direction) =>
      app.layers.moveLayerAcrossAllFrames(layerId, direction),
    deleteLayerAcrossAllFrames: (layerId) =>
      app.layers.deleteLayerAcrossAllFrames(layerId),
    squashLayerDown: (layerId) => app.layers.squashLayerDown(layerId),
    squashLayerUp: (layerId) => app.layers.squashLayerUp(layerId),
    squashLayerDownAcrossAllFrames: (layerId) =>
      app.layers.squashLayerDownAcrossAllFrames(layerId),
    squashLayerUpAcrossAllFrames: (layerId) =>
      app.layers.squashLayerUpAcrossAllFrames(layerId),
    moveLayerPixels: (dx, dy) => app.layers.moveLayerPixels(dx, dy),
    addLayerToAllFrames: (name) => app.layers.addLayerToAllFrames(name),
    addLayerToFrameAtPosition: (frameId, name, position, variantInfo) =>
      app.layers.addLayerToFrameAtPosition(frameId, name, position, variantInfo),
    deleteLayerFromFrame: (frameId, layerId) =>
      app.layers.deleteLayerFromFrame(frameId, layerId),
    reorderLayerInFrame: (frameId, layerId, newIndex) =>
      app.layers.reorderLayerInFrame(frameId, layerId, newIndex),
    copyTimelineCell: (frameId, layerId) =>
      app.layers.copyTimelineCell(frameId, layerId),
    pasteTimelineCell: (frameId, targetLayerId) =>
      app.layers.pasteTimelineCell(frameId, targetLayerId),
    copyLayerToClipboard: (layerId) => app.layers.copyLayerToClipboard(layerId),
    pasteLayerFromClipboard: (currentFrameOnly) =>
      app.layers.pasteLayerFromClipboard(currentFrameOnly),
    copyLayerFromObject: (
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
  });

  // ── Task 26: the 15 migrated pixel + selection actions ─────────────────
  //
  // Same delegate technique tasks 23 and 25 used, and the reason this task
  // migrates THE HOT PATH without editing `Canvas.tsx` (3,062 lines, owned by
  // tasks 30-32). Canvas keeps calling `useEditorStore().setPixel(...)` and
  // lands in `PixelStore`.
  //
  // ⚠️ THIS IS WHERE THE ONE-DIRECTIONAL BOUNDARY IS ENFORCED IN CODE.
  // `PixelStore` never reads a UI store; the mask, the behaviour and the
  // variant frame index are read HERE, on the UI side, and passed DOWN as
  // arguments. `app.selectionUI.writeOptions` is that bundle.
  const pixelWriteOptions = () => app.selectionUI.writeOptions;

  /**
   * The options `moveSelectedPixels` / `deleteSelectionPixels` need. Unlike a
   * draw, these two ALWAYS act on the mask — `selectionBehavior` does not gate
   * them (the legacy code never consulted it in either action), so the
   * behaviour field is deliberately omitted here.
   */
  const selectionWriteOptions = () => {
    const selection = app.selectionUI.selection;
    return {
      mask: selection?.mask,
      maskSize: selection
        ? { width: selection.width, height: selection.height }
        : undefined,
    };
  };

  // The grid + dimensions the three pixel-sampling selects need. Read on the
  // UI side and passed IN, so `SelectionUIStore` holds no domain reference
  // and — critically — never keeps a 300k-cell grid alive.
  const editableGrid = (): {
    grid: PixelData[][];
    dims: { width: number; height: number };
  } | null => {
    const layer = app.currentLayer;
    const object = app.currentObject;
    if (!layer || !object) return null;
    if (layer.isVariant) {
      const variant = app.currentVariant;
      const variantLayer = app.selectedVariantLayer;
      if (!variant || !variantLayer) return null;
      return {
        grid: variantLayer.pixels,
        dims: {
          width: variant.variant.gridSize.width,
          height: variant.variant.gridSize.height,
        },
      };
    }
    return { grid: layer.pixels, dims: object.gridSize };
  };

  /** The grid dimensions a selection is expressed against. */
  const selectionDims = () =>
    editableGrid()?.dims ?? { width: 32, height: 32 };

  const previousPixelActions = {
    beginStroke: useEditorStore.getState().beginStroke,
    endStroke: useEditorStore.getState().endStroke,
    setPixel: useEditorStore.getState().setPixel,
    setPixels: useEditorStore.getState().setPixels,
    setSelection: useEditorStore.getState().setSelection,
    setSelectionMask: useEditorStore.getState().setSelectionMask,
    clearSelection: useEditorStore.getState().clearSelection,
    moveSelection: useEditorStore.getState().moveSelection,
    expandSelection: useEditorStore.getState().expandSelection,
    shrinkSelection: useEditorStore.getState().shrinkSelection,
    selectFloodFillAt: useEditorStore.getState().selectFloodFillAt,
    selectAllByColorAt: useEditorStore.getState().selectAllByColorAt,
    selectLasso: useEditorStore.getState().selectLasso,
    deleteSelectionPixels: useEditorStore.getState().deleteSelectionPixels,
    moveSelectedPixels: useEditorStore.getState().moveSelectedPixels,
  };
  useEditorStore.setState({
    // Stroke batching runs the `store/index.ts` closure, which wraps the
    // transaction in the mirror bookkeeping the Phase B `projectHistory`
    // field needs. One drag stays exactly one undo entry.
    beginStroke: () => strokeControl.begin(),
    endStroke: () => strokeControl.end(),

    setPixel: (x, y, color) =>
      app.pixels.setPixel(x, y, color, pixelWriteOptions()),
    setPixels: (pixels) => app.pixels.setPixels(pixels, pixelWriteOptions()),

    setSelection: (box) => app.selectionUI.setSelection(box, selectionDims()),
    setSelectionMask: (mask, dims, op) =>
      app.selectionUI.setSelectionMask(mask, dims, op),
    clearSelection: () => app.selectionUI.clearSelection(),
    moveSelection: (dx, dy) => app.selectionUI.moveSelection(dx, dy),
    expandSelection: (steps) => app.selectionUI.expandSelection(steps),
    shrinkSelection: (steps) => app.selectionUI.shrinkSelection(steps),

    selectFloodFillAt: (x, y) => {
      const editable = editableGrid();
      if (!editable) return;
      app.selectionUI.selectFloodFillAt(x, y, editable.grid, editable.dims);
    },
    selectAllByColorAt: (x, y) => {
      const editable = editableGrid();
      if (!editable) return;
      app.selectionUI.selectAllByColorAt(x, y, editable.grid, editable.dims);
    },
    selectLasso: (points) =>
      app.selectionUI.selectLasso(points, selectionDims()),

    deleteSelectionPixels: () =>
      app.pixels.deleteSelectionPixels(selectionWriteOptions()),

    // ⚠️ TWO STEPS, in this order — the legacy intra-module call at
    // `selectionActions.ts:577,648`. The pixels move, then the MASK moves
    // with them; without the second step the selection outline detaches from
    // the art it describes.
    moveSelectedPixels: (dx, dy) => {
      app.pixels.moveSelectedPixels(dx, dy, selectionWriteOptions());
      app.selectionUI.moveSelection(dx, dy);
    },
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
    disposeUIB();
    useEditorStore.setState(previousActions);
    useEditorStore.setState(previousDomainActions);
    useEditorStore.setState(previousTimelineActions);
    useEditorStore.setState(previousPixelActions);
  };
}
