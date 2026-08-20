/**
 * The segmented-control option lists for `BrushControls` (REFRESH task 35).
 *
 * They live in their own module rather than beside the component because
 * `react-refresh/only-export-components` — at full `error` strength under
 * `src/ui/` — rejects a component file that also exports non-component
 * values. Exporting them matters: the story file asserts against the same
 * arrays the component renders, so a story cannot drift from the real
 * options.
 *
 * Every value is copied verbatim from the pre-split `RightSidebarTopControls`
 * and the tuple types line up with the store setters' literal unions
 * (`setPencilBrushMax`, `setTraceNudgeAmount`), which is what stops a
 * plausible-looking edit here from silently widening them to `number`.
 */
export const GAUSSIAN_RADIUS_MAX_OPTIONS = [8, 16, 32, 64, 128] as const;
export const TRACE_MAX_OPTIONS = [8, 16, 32, 64, 128] as const;
export const TRACE_NUDGE_OPTIONS = [10, 20, 25, 50, 100] as const;
