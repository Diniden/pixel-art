/**
 * ── THE LEGACY-STORE SHIM (REFRESH task 38) ────────────────────────────────
 *
 * The Zustand store this module used to create is GONE: every action lives on
 * the MobX `ApplicationStore` tree and every consumer reads it there. What
 * remains here exists for exactly one caller — the FROZEN task-08
 * characterisation baseline in `src/store/__tests__/`, whose `*.test.ts`
 * files are byte-unmodified by design (they are the parity proof) and eight
 * lines of which read the legacy store directly:
 *
 *   - `autoSave.test.ts:43,425,435`  — `useEditorStore.getState().project`
 *   - `selection.test.ts:32,47`      — `.getState().selection`
 *   - `layers.test.ts:44,103,117`    — `.getState().layerClipboard` and
 *                                      `.setState({ layerClipboard: null })`
 *
 * This shim serves those eight lines and NOTHING else. It holds no state of
 * its own: every read is served live from the currently registered
 * `ApplicationStore` (the same "last app wired wins" discipline the retired
 * bridge's delegate table had, which is what `wireAutoSave()`-style suites
 * relied on), and the one supported write routes to the field's MobX owner.
 *
 * ⚠️ NOT FOR PRODUCTION CODE. Nothing under `src/` outside
 * `src/store/__tests__/` may import this module — the migration's completion
 * criterion is that the application no longer has a legacy store, and this
 * file is test scaffolding for the frozen baseline, not a store.
 */
import { runInAction } from "mobx";
import type { ApplicationStore } from "../stores/ApplicationStore";
import type { Project } from "../types";
import type { LayerClipboard, SelectionState } from "./storeTypes";

// Re-export types so the frozen suite's `from "@/store"` type imports resolve.
export type { EditorState } from "./storeTypes";

/* ── the registered-app stack ─────────────────────────────────────────────── */

const registered: ApplicationStore[] = [];

/**
 * Make `app` the store the shim (and the harness dispatch table) resolves.
 * Returns a disposer that restores the previously registered app — the same
 * capture-and-restore shape `installBridge` had, so `wireAutoSave()` keeps
 * its semantics: while a wired app is registered, dispatches and legacy
 * reads reach IT; on dispose they fall back to the shared harness app.
 */
export function registerHarnessApp(app: ApplicationStore): () => void {
  registered.push(app);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const index = registered.lastIndexOf(app);
    if (index !== -1) registered.splice(index, 1);
  };
}

/** The store every legacy-shaped read and dispatch currently resolves to. */
export function currentHarnessApp(): ApplicationStore {
  const app = registered[registered.length - 1];
  if (!app) {
    throw new Error(
      "legacy-store shim: no ApplicationStore is registered — the harness " +
        "must call registerHarnessApp(app) before anything reads the shim.",
    );
  }
  return app;
}

/* ── the `useEditorStore` adapter ─────────────────────────────────────────── */

/** The three legacy fields the frozen baseline still reads. */
interface LegacyStateView {
  project: Project | null;
  selection: SelectionState | null;
  layerClipboard: LayerClipboard | null;
}

export const useEditorStore = {
  /**
   * A live VIEW over the registered app — property getters, not a copy, so a
   * value read after a dispatch reflects that dispatch, exactly as
   * `getState()` on the real store did.
   */
  getState(): LegacyStateView {
    const app = currentHarnessApp();
    return {
      get project() {
        return app.domain.currentProject();
      },
      get selection() {
        return app.selectionUI.selection;
      },
      get layerClipboard() {
        return app.session.layerClipboard;
      },
    };
  },

  /**
   * The one legacy write the frozen baseline performs
   * (`layers.test.ts:117`), routed to the field's MobX owner. Any other key
   * throws: a silent partial `setState` would be a green test asserting
   * nothing.
   */
  setState(patch: Partial<LegacyStateView>): void {
    const app = currentHarnessApp();
    const keys = Object.keys(patch);
    for (const key of keys) {
      if (key !== "layerClipboard") {
        throw new Error(
          `legacy-store shim: setState({ ${key} }) is not supported — the ` +
            "legacy store is retired; write through the owning MobX store.",
        );
      }
    }
    if ("layerClipboard" in patch) {
      runInAction(() =>
        app.session.setLayerClipboard(patch.layerClipboard ?? null),
      );
    }
  },
};
