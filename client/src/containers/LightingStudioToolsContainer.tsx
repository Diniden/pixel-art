/**
 * LightingStudioToolsContainer (REFRESH task 27).
 *
 * `LightingStudioTools` reads 11 store members and used to run the FULL
 * normal/height-map computation inside the component body. Task 27 moved both
 * halves out:
 *
 *  - the all-frames normal sweep is now `PixelStore.computeNormalsForAllFrames`,
 *    a MobX `flow` that yields between frames instead of blocking the main
 *    thread from a modal's confirm handler;
 *  - the height-map arithmetic is `utils/normalCompute.computeHeightMap`, a
 *    pure unit-tested function (§9.5).
 *
 * Thin by design — see `LightingStudioPanelContainer`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ CREATED BUT NOT YET WIRED — ITS RENDER SITE IS OUTSIDE THIS TASK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingStudioTools` is rendered by `components/Toolbar/Toolbar.tsx:159`.
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
import { LightingStudioTools } from "../components/Toolbar/LightingStudioTools";

export const LightingStudioToolsContainer = observer(
  function LightingStudioToolsContainer() {
    return <LightingStudioTools />;
  },
);
