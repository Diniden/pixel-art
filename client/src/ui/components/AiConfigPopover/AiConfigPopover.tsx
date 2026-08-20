import { useRef, useEffect } from "react";
import { Icon } from "../../primitives/Icon/Icon";
import { Wand2 } from "lucide-react";

/**
 * AiConfigPopover — the AI-service settings button and its popover
 * (REFRESH task 36, W27).
 *
 * Extracted from `Header.tsx`, which the spec required before purifying it:
 * the header carried 14 `useState` calls and roughly half belonged to this
 * one control.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NO STYLESHEET OF ITS OWN — THE CLASSES STAY IN THE `header` BLOCK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every class here is `header__ai-*`, and they are declared in `Header.css`.
 * They are NOT renamed to an `ai-config-popover` block, and this component
 * does not import a stylesheet.
 *
 * That is deliberate. All BEM renaming finished in W13/W14 and the names are
 * final; renaming them here would be a W13 change smuggled into a relocation
 * task. Splitting a component is not a reason to re-cut the CSS — the markup
 * is still, visually and structurally, a part of the header.
 *
 * ⚠️ `header__ai-btn` takes its modifier from `aiHealthStatus`, which is one
 * of the two runtime-concatenated class families the spec flags in this file
 * (`--error` / `--configured` / none). The concatenation is preserved exactly
 * as it was; `check-classes.mjs` cannot see through interpolation, so these
 * names must be grepped by hand rather than trusted to the audit.
 *
 * Pure: every value is a prop, every effect is a callback. The 15-second
 * health poll and the two API calls that feed `aiHealthStatus` stay with the
 * container — this component only renders what it is told.
 */

export type AiHealthStatus = "unknown" | "ok" | "error";

export interface AiConfigPopoverProps {
  /** Whether the popover is open. */
  isOpen: boolean;
  /** Opens/closes the popover. */
  onOpenChange: (open: boolean) => void;
  /** Health of the configured AI service; drives the button modifier. */
  aiHealthStatus: AiHealthStatus;
  /** Human-readable failure detail, shown in the alert strip. */
  aiHealthDetail: string | null;
  /** The user-configured URL, or null when relying on the server default. */
  aiServiceUrl: string | null;
  /**
   * The server's effective default URL, or null when UNKNOWN.
   *
   * ⚠️ `null` means "we could not ask the server", NOT "there is no default".
   * The placeholder and hint both say so rather than inventing a URL — a
   * fabricated `http://localhost:8100` presented as "the server default" is
   * the exact bug the header's comment warns about.
   */
  serverDefaultUrl: string | null;
  /** Draft URL in the text field. */
  urlInput: string;
  onUrlInputChange: (value: string) => void;
  /** Commits `urlInput`. The container trims and re-polls health. */
  onSave: () => void;
}

export function AiConfigPopover({
  isOpen,
  onOpenChange,
  aiHealthStatus,
  aiHealthDetail,
  aiServiceUrl,
  serverDefaultUrl,
  urlInput,
  onUrlInputChange,
  onSave,
}: AiConfigPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on an outside click OR on Escape. Transcribed from Header's effect,
  // including the "only while open" guard — permanently-registered listeners
  // here would fire for every click and keypress in the app.
  //
  // ⚠️ BOTH listeners are required. The Escape handler is a DOCUMENT-level one
  // and is separate from the input's own `onKeyDown` Escape branch: the latter
  // only fires while the text field has focus, so dropping this one would make
  // Escape stop closing the popover whenever focus sat on the Save button.
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onOpenChange]);

  const buttonModifier =
    aiHealthStatus === "error"
      ? "header__ai-btn--error"
      : aiHealthStatus === "ok"
        ? "header__ai-btn--configured"
        : "";

  return (
    <div className="header__ai-config" ref={rootRef}>
      <button
        className={`header__ai-btn ${buttonModifier}`}
        onClick={() => onOpenChange(!isOpen)}
        title={
          aiHealthStatus === "error"
            ? `AI Error: ${aiHealthDetail}`
            : "AI Service Settings"
        }
      >
        <span className="header__ai-icon">
          <Icon icon={Wand2} size={14} />
        </span>
        AI
      </button>
      {isOpen && (
        <div className="header__ai-popover">
          {aiHealthStatus === "error" && aiHealthDetail && (
            <div className="header__ai-alert">{aiHealthDetail}</div>
          )}
          <label className="header__ai-label">AI Service URL</label>
          <div className="header__ai-row">
            <input
              type="text"
              className="header__ai-input"
              value={urlInput}
              onChange={(e) => onUrlInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSave();
                } else if (e.key === "Escape") {
                  onOpenChange(false);
                }
              }}
              placeholder={serverDefaultUrl ?? "Server default unavailable"}
              autoFocus
            />
            <button className="header__ai-save-btn" onClick={onSave}>
              Save
            </button>
          </div>
          <span className="header__ai-hint">
            {aiHealthStatus === "ok"
              ? `Connected to ${aiServiceUrl || serverDefaultUrl}`
              : aiHealthStatus === "error"
                ? "Service has errors"
                : aiServiceUrl ||
                  (serverDefaultUrl
                    ? `Using default: ${serverDefaultUrl}`
                    : "Server default unknown — is the server running?")}
          </span>
        </div>
      )}
    </div>
  );
}
