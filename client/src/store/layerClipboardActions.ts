/**
 * Layer clipboard actions — ALL MIGRATED TO MobX (REFRESH task 25).
 *
 * All three (`copyLayerToClipboard`, `pasteLayerFromClipboard`,
 * `copyLayerFromObject`) live on `stores/domain/LayerStore`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  R14 — THE CLIPBOARD OUTLIVES THE PROJECT. DO NOT "FIX" THIS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `layerClipboard` was `EditorState` state, NOT `Project` state, and nothing
 * in `store/projectActions.ts` cleared it on a project switch (verified: the
 * `set()` calls at `:67`, `:95` and `:150` touch only `project`,
 * `projectName`, `projectList`, `projectHistory`, `historyIndex`). Copy in
 * project A → switch → paste in project B works, and `copyLayerFromObject`
 * exists precisely to move layers between objects and projects.
 *
 * The migration preserves that exactly: the buffer now lives on
 * `SessionStore`, whose lifetime is the browser TAB and which has no
 * `reset()` / `clear()` / project-switch hook by construction. `UIStore` is
 * project-scoped, which is precisely why the clipboards are NOT there.
 *
 * Task 08 pinned it with two tests in `src/store/__tests__/layers.test.ts`
 * that must stay green unchanged:
 *
 *     "CROSS-PROJECT: copy in A, switch project, paste in B still works"
 *     "CROSS-PROJECT: createNewProject also leaves the clipboard intact"
 *
 * The bridge replaces every entry below with a delegate at install time, so
 * `CopyFromModal.tsx` (task 35/36's file) keeps its `useEditorStore()` seam.
 * There is exactly ONE implementation of each action.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
function migrated(name: string): never {
  throw new Error(
    `${name} moved to LayerStore (REFRESH task 25) and is reached through ` +
      "the Zustand bridge. This store has no bridge installed — construct an " +
      "ApplicationStore and call installBridge(), or call LayerStore directly.",
  );
}

export function createLayerClipboardActions() {
  return {
    copyLayerToClipboard: (_layerId: string): void =>
      migrated("copyLayerToClipboard"),
    pasteLayerFromClipboard: (_currentFrameOnly: boolean = false): void =>
      migrated("pasteLayerFromClipboard"),
    copyLayerFromObject: (
      _sourceObjectId: string,
      _sourceLayerId: string,
      _isVariant: boolean,
      _variantGroupId?: string,
      _variantId?: string,
    ): void => migrated("copyLayerFromObject"),
  };
}
