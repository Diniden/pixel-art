/**
 * SaveStatusDot — persistence health as a single coloured dot.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT REPLACES A TEXT PILL, AND THE COLOUR IS THE WHOLE MESSAGE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The header used to show a "Saving… / Saved / Save failed" pill beside the
 * project name, appearing and disappearing as the status changed. Text that
 * comes and goes next to a title is a layout jitter and an interruption; a
 * dot that is always present and only changes colour is neither.
 *
 *   🟢 green   — saved. Everything is on disk.
 *   🟠 orange  — out of sync: edits are waiting out the debounce, or a save
 *                is in flight. **Orange always means "not on disk yet".**
 *   🔴 red     — the save FAILED. This one needs the user to act.
 *
 * ⚠️ `idle` and `saved` are both GREEN, deliberately. `idle` is the state a
 * freshly-loaded project sits in and the state a save returns to two seconds
 * after succeeding — in both cases there is nothing unsaved, which is what
 * the user is asking when they glance at the dot. Giving `idle` its own
 * colour would make the dot change twice for one save and mean nothing.
 *
 * ── The detail lives behind a click, not a hover ───────────────────────────
 *
 * A `title` attribute is unreachable on a touch device, and this dot has to
 * work on the iPad. So the detail is a real popover opened by click/tap, with
 * Escape and click-outside to dismiss. Hover shows nothing: a tooltip that
 * appears on hover and ALSO on tap ends up fighting itself on hybrid devices.
 *
 * `ui/` boundary: React, `classNames`, its own CSS. No store, no MobX.
 */
import { useEffect, useRef, useState } from "react";
import { classNames } from "../../classNames";
import "./SaveStatusDot.css";

/** Mirrors `SaveStatus` without importing the store's type. */
export type SaveStatusKind =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export interface SaveStatusDotProps {
  status: SaveStatusKind;
  /** The failure detail, when there is one. Shown in the popover. */
  errorDetail?: string | null;
  /**
   * Saving is suspended during a rename / project switch / delete. Worth
   * saying out loud, because it explains an orange dot that is not moving.
   */
  suspended?: boolean;
}

/** The three colours, and what each is called in the popover's heading. */
function toneOf(status: SaveStatusKind): "ok" | "busy" | "error" {
  switch (status) {
    case "error":
      return "error";
    case "pending":
    case "saving":
      return "busy";
    // `idle` and `saved` are both "nothing outstanding" — see the header.
    default:
      return "ok";
  }
}

function headingOf(status: SaveStatusKind, suspended: boolean): string {
  if (status === "error") return "Save failed";
  if (suspended) return "Saving paused";
  switch (status) {
    case "pending":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    default:
      return "All changes saved";
  }
}

function bodyOf(
  status: SaveStatusKind,
  suspended: boolean,
  errorDetail?: string | null,
): string {
  if (status === "error") {
    return errorDetail
      ? `The last save did not complete: ${errorDetail} Your work is still here in the editor — it has not been written to disk. Make another edit to retry.`
      : "The last save did not complete. Your work is still here in the editor — it has not been written to disk. Make another edit to retry.";
  }
  if (suspended) {
    return "Saving is paused while the project is being renamed, switched or deleted. It resumes automatically.";
  }
  switch (status) {
    case "pending":
      return "Your recent edits have not been written to disk yet. A save is scheduled and runs automatically a moment after you stop editing.";
    case "saving":
      return "Writing your changes to disk now.";
    default:
      return "Everything is written to disk. Edits save automatically a moment after you stop.";
  }
}

export function SaveStatusDot({
  status,
  errorDetail,
  suspended = false,
}: SaveStatusDotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside and Escape both dismiss. `mousedown` rather than `click` so
  // the popover closes before a click lands on whatever is underneath.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const tone = toneOf(status);
  const heading = headingOf(status, suspended);

  // Only the busy tone pulses. A steady dot that suddenly animates is how the
  // eye is drawn to a change in progress; animating the resting state would
  // make the header restless for no reason.
  //
  // ⚠️ The predicate is computed HERE rather than inline in `classNames()`
  // below. `check-classes.mjs` treats every string literal inside that call
  // as a class name, so an inline `tone === "busy"` is reported as a missing
  // `.busy` class — a false positive that would sit in the audit forever.
  const pulses = tone === "busy";

  return (
    <div className="save-status-dot" ref={rootRef}>
      <button
        type="button"
        className={classNames(
          "save-status-dot__dot",
          `save-status-dot__dot--${tone}`,
          pulses && "save-status-dot__dot--pulsing",
        )}
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label={`Save status: ${heading}`}
      />

      {isOpen && (
        <div className="save-status-dot__popover" role="status">
          <div className="save-status-dot__heading">{heading}</div>
          <p className="save-status-dot__body">
            {bodyOf(status, suspended, errorDetail)}
          </p>
        </div>
      )}
    </div>
  );
}
