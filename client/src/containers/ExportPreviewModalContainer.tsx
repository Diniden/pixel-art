/**
 * ExportPreviewModalContainer (REFRESH task 36, W27).
 *
 * `ExportPreviewModal` was the only "already pure" component in task 36's list
 * that was NOT actually pure: it imported `exportApi` and called
 * `fetchFramesJson` inside its own effect. That single import is what kept a
 * 537-line component out of `ui/`.
 *
 * The fix is injection, not relocation of the lifecycle: the component still
 * owns *when* the fetch happens (its open/abort effect is byte-for-byte the
 * same shape it has had since task 15), and this container owns *how*. The
 * modal now takes a `loadExport(kebabName, signal)` prop.
 *
 * ⚠️ `loadExport` is in the modal's effect dependency array — it has to be,
 * or the exhaustive-deps rule fails and a stale closure becomes possible.
 * That makes its REFERENTIAL IDENTITY load-bearing: an inline arrow here would
 * be a new function every render, refiring the fetch effect on every parent
 * render and aborting the in-flight request each time. `exportApi.fetchFramesJson`
 * is a stable module-level method, so it is passed as a bound module reference
 * rather than wrapped. Do not "tidy" this into an arrow.
 *
 * No `observer()` and no `useStores()`: this container reads nothing from any
 * store. It exists purely as the API seam, which is the intended cost of the
 * uniform rule (spec: "about 6 are trivial pass-throughs that exist purely so
 * the `ui/` element never sees a store").
 */
import { exportApi } from "../api";
import { ExportPreviewModal } from "../ui/components/ExportPreviewModal/ExportPreviewModal";

interface ExportPreviewModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kebab-cased project folder name, e.g. "base-unit" */
  kebabName: string;
}

/**
 * Stable module-level binding — see the referential-identity note above.
 * `fetchFramesJson` does not read `this`, so a plain reference is safe.
 */
const loadExport = (kebabName: string, signal: AbortSignal): Promise<unknown> =>
  exportApi.fetchFramesJson(kebabName, signal);

export function ExportPreviewModalContainer(
  props: ExportPreviewModalContainerProps,
) {
  return <ExportPreviewModal {...props} loadExport={loadExport} />;
}
