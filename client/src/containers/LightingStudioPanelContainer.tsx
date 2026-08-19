/**
 * LightingStudioPanelContainer (REFRESH task 27).
 *
 * `LightingStudioPanel` reads 4 store members (`project`, `setBrushSize`,
 * `setNormalBrushShape`, `setHeightBrushValue`) and composes `NormalPicker` +
 * `LightControl`.
 *
 * Deliberately thin, exactly like the task-24/25/26 containers: this task
 * migrates the STORE slice and establishes the `observer()` seam. Making the
 * component pure — props in, callbacks out, no `useEditorStore` — is task
 * 35/36's job, and doing it here would edit these files twice (§9.8).
 *
 * What the `observer()` buys today is real even so: the panel now re-renders
 * from a MobX read rather than from the whole-store Zustand subscription, and
 * `dev`'s `observableRequiresReaction` stops warning for this subtree.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ CREATED BUT NOT YET WIRED — ITS RENDER SITE IS OUTSIDE THIS TASK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingStudioPanel` is rendered by `App.tsx:254`.
 * That file is NOT in task 27's `Touches` list, and §10 rule 6 says to stop
 * rather than widen scope — the collision matrix is only valid if `Touches`
 * is accurate. The container is therefore complete and ready; the one-line
 * import swap belongs to the task that owns the render site.
 *
 * ⚠️ Nothing is broken by the delay. The component still renders and still
 * works — it reads Zustand, whose lighting fields the bridge keeps mirrored
 * from MobX (Phase B). What is deferred is only the `observer()` boundary,
 * i.e. the render-granularity win, not correctness.
 */
import { observer } from "mobx-react-lite";
import { LightingStudioPanel } from "../components/LightingStudioPanel/LightingStudioPanel";

export const LightingStudioPanelContainer = observer(
  function LightingStudioPanelContainer() {
    return <LightingStudioPanel />;
  },
);
