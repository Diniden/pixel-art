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
 *             this bridge. (Machinery arrives with the first flipped slice,
 *             task 16.)
 *
 * Every bridge write is wrapped in `runInAction`: `enforceActions: "always"`
 * makes an unwrapped write throw, and Zustand's `subscribe` callback runs
 * outside any action.
 *
 * Values are mirrored BY REFERENCE, never cloned — the clipboards contain
 * pixel grids, and `SessionStore` annotates them `observable.ref` so MobX
 * never proxies their contents.
 */
import { runInAction } from "mobx";
import { useEditorStore } from "../../store";
import type { EditorState } from "../../store/storeTypes";
import type { ApplicationStore } from "../ApplicationStore";

/* ── Phase A: Zustand → MobX. Fields whose slice has NOT yet flipped. ────── */
export const PHASE_A_FIELDS = [
  "saveStatus", //             EditorState.saveStatus        → session.saveStatus
  "aiServiceUrl", //           project.uiState.aiServiceUrl  → session.aiServiceUrl
  "layerClipboard", //         EditorState.layerClipboard    → session.layerClipboard
  "timelineCellClipboard", //  EditorState.timelineCellClipboard → session.timelineCellClipboard
  "colorHistory", //           EditorState.colorHistory      → session.colorHistory
] as const;

/* ── Phase B: MobX → Zustand. Fields whose ownership HAS flipped. ────────── */
// Empty in task 14 — the first flip is task 16's DomainStore slice.
export const PHASE_B_FIELDS = [] as const;

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
    app.session.saveStatus = s.saveStatus;
    app.session.aiServiceUrl = s.project?.uiState.aiServiceUrl ?? null;
    app.session.layerClipboard = s.layerClipboard;
    app.session.timelineCellClipboard = s.timelineCellClipboard;
    app.session.colorHistory = s.colorHistory;
  });
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

  const disposeZ = useEditorStore.subscribe((s) => syncPhaseA(app, s));

  // Phase B (a later task): Zustand mirrors MobX for not-yet-migrated
  // consumers, e.g.
  //   const disposeM = reaction(() => app.migratedSnapshot(),
  //     (snap) => useEditorStore.setState(snap, false));

  return () => {
    disposeZ();
  };
}
