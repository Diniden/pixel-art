/**
 * LoadingLayout — the full-screen boot page (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 GATE 2: THIS RENDERS WITH NO STORE PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Import list: React types, its own CSS. That is the whole file's dependency
 * surface — the same bar `CanvasSurface`, `LightingSurface` and `ZoomControls`
 * set in W24–W26.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ SPEC CORRECTION: THIS PAGE HAS TWO STATES, NOT ONE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The task 37 spec describes `LoadingLayout` as `App.tsx:154-164` — a spinner,
 * a title and a message, with a two-prop interface. Reading `App.tsx` at HEAD
 * shows **two** early returns sharing the `app__loading` block, not one:
 *
 *   - `:195-214` `loadState === "failed"` → **no spinner**, a heading, the
 *     error message, the "nothing has been changed on disk" reassurance, and a
 *     **Retry button**.
 *   - `:216-226` not-yet-loaded → the spinner, "Loading Pixel Art Editor",
 *     "Preparing your workspace...".
 *
 * The failed branch is W10's R5 fix — the highest-severity bug the refresh
 * closed. A failed load must render an ERROR, never an empty editor, because
 * the legacy code installed `createDefaultProject()` in its catch and then
 * auto-saved it over the owner's real 1.1 MB file. **Dropping that branch to
 * match the spec's two-prop interface would delete the visible half of R5's
 * fix** and leave a failed load showing an eternal spinner.
 *
 * So the interface carries the spec's `title`/`message` (with the spec's exact
 * defaults) and adds `variant`, `detail` and `onRetry`. The spec's shape is a
 * strict subset: `<LoadingLayout />` with no props renders exactly the markup
 * at `App.tsx:216-226`, character for character.
 *
 * ── No class was renamed ──────────────────────────────────────────────────
 *
 * `app__loading`, `app__loading-content` and `app__loading-spinner` are
 * task 21's BEM names, transcribed unchanged. ⚠️ They live in `AppShell.css`
 * (the moved `App.css`) because they belong to the `app` block, even though
 * the shell component never renders them — a block's sheet, not a component's.
 * `LoadingLayout` therefore imports that sheet directly rather than owning a
 * duplicate; splitting the rules out would rename them, and the class-name
 * audit is a gate this wave must not move.
 *
 * The spec's `loading-screen*` BEM names were NOT adopted, for that reason:
 * they would be five renames, and `AppShell.css` is where task 21 already put
 * these rules under the `app` block.
 */
import type { ReactNode } from "react";
import "../../components/AppShell/AppShell.css";

export interface LoadingLayoutProps {
  /** `"loading"` shows the spinner; `"failed"` shows the retry affordance. */
  variant?: "loading" | "failed";
  title?: string;
  message?: ReactNode;
  /** Second paragraph. Used by the failed state for the data-safety note. */
  detail?: ReactNode;
  /** Rendered as a Retry button when supplied. */
  onRetry?: () => void;
}

const DEFAULT_TITLE = "Loading Pixel Art Editor";
const DEFAULT_MESSAGE = "Preparing your workspace...";

export function LoadingLayout({
  variant = "loading",
  title,
  message,
  detail,
  onRetry,
}: LoadingLayoutProps) {
  const isFailed = variant === "failed";
  const resolvedTitle =
    title ?? (isFailed ? "Project failed to load" : DEFAULT_TITLE);
  const resolvedMessage =
    message ??
    (isFailed
      ? "The server could not be reached or the project could not be read."
      : DEFAULT_MESSAGE);

  return (
    <div className="app__loading">
      <div className="app__loading-content">
        {isFailed ? null : <div className="app__loading-spinner"></div>}
        <h2>{resolvedTitle}</h2>
        <p>{resolvedMessage}</p>
        {detail ? <p>{detail}</p> : null}
        {onRetry ? <button onClick={onRetry}>Retry</button> : null}
      </div>
    </div>
  );
}
