/**
 * FrameTagsModal — PURE (REFRESH task 36, W27).
 *
 * Task 25 called this "the reference example": it was already using
 * selector-style subscriptions rather than destructuring the whole store, so
 * it was the cheapest of the six to purify.
 *
 * ⚠️ BOTH `useMemo` tree-walks moved to the CONTAINER, not just the store
 * reads. `currentTags` and `projectTagSections` scanned `project.objects` and
 * `project.variants` — every object, every frame, every variant — from inside
 * the component. Per R2 that work cannot live in `ui/`, and the container is
 * where task 36's precedent (and W26's) puts it. They are now `computed`s
 * behind an `observer()`, so they re-run when the tags actually change rather
 * than on every render of this modal.
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../primitives/Icon/Icon";
import { X } from "lucide-react";
import "./FrameTagsModal.css";

export type FrameTagsContext =
  | { type: "object"; frameId: string; frameName?: string }
  | {
      type: "variant";
      variantGroupId: string;
      variantId: string;
      frameId: string;
      frameIndex: number;
    };

// Exported for timeline dot indicator (consistent tag color)
export function tagColorForTag(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h << 5) - h + tag.charCodeAt(i);
    h |= 0;
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 42%)`;
}

/** One grouped section of the "tags used elsewhere in this project" list. */
export interface ProjectTagSection {
  key: string;
  label: string;
  items: { tag: string; label?: string }[];
}

interface FrameTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: FrameTagsContext;
  /** Tags on the frame identified by `context`. */
  currentTags: string[];
  /** Tags used elsewhere in the project, grouped for the picker. */
  projectTagSections: ProjectTagSection[];
  /** Adds a tag to the frame in `context`. Already trimmed and lower-cased. */
  onAddTag: (tag: string) => void;
  /** Removes a tag from the frame in `context`. */
  onRemoveTag: (tag: string) => void;
}

export function FrameTagsModal({
  isOpen,
  onClose,
  context,
  currentTags,
  projectTagSections,
  onAddTag,
  onRemoveTag,
}: FrameTagsModalProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    // The context branch (object vs variant frame) moved to the container,
    // which owns the two different store actions.
    onAddTag(t);
  };

  const removeTag = (tag: string) => {
    onRemoveTag(tag);
  };

  const handleSubmit = () => {
    addTag(inputValue);
    setInputValue("");
  };

  useEffect(() => {
    if (!isOpen) setInputValue("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const title =
    context.type === "object"
      ? `Frame tags${context.frameName ? `: ${context.frameName}` : ""}`
      : `Variant frame tags · #${context.frameIndex + 1}`;

  return createPortal(
    <div className="frame-tags-modal__backdrop" onClick={handleBackdropClick}>
      <div className="frame-tags-modal" onClick={(e) => e.stopPropagation()}>
        <div className="frame-tags-modal__header">
          <h4>{title}</h4>
          <button
            type="button"
            className="frame-tags-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon icon={X} size={14} />
          </button>
        </div>

        <div className="frame-tags-modal__content">
          <div className="frame-tags-modal__pills">
            {currentTags.map((tag) => (
              <span
                key={tag}
                className="frame-tags-modal__pill"
                style={{ backgroundColor: tagColorForTag(tag) }}
              >
                {tag}
                <button
                  type="button"
                  className="frame-tags-modal__pill-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  <Icon icon={X} size={10} />
                </button>
              </span>
            ))}
          </div>

          <div className="frame-tags-modal__input-row">
            <input
              type="text"
              className="frame-tags-modal__input"
              placeholder="Add tag..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button
              type="button"
              className="frame-tags-modal__add-btn"
              onClick={handleSubmit}
            >
              Add
            </button>
          </div>

          <div className="frame-tags-modal__project-section">
            <div className="frame-tags-modal__project-title">
              Tags in project (click to add to this frame)
            </div>
            <div className="frame-tags-modal__project-list">
              {projectTagSections.length === 0 ? (
                <div className="frame-tags-modal__project-empty">
                  No tags in project yet. Add tags above to frames.
                </div>
              ) : (
                projectTagSections.map((section) => (
                  <div
                    key={section.key}
                    className="frame-tags-modal__project-group"
                  >
                    <div className="frame-tags-modal__project-group-label">
                      {section.label}
                    </div>
                    <div className="frame-tags-modal__project-group-pills">
                      {section.items.map((item, i) => (
                        <button
                          key={`${item.tag}-${i}`}
                          type="button"
                          className="frame-tags-modal__pill frame-tags-modal__pill--clickable"
                          style={{ backgroundColor: tagColorForTag(item.tag) }}
                          onClick={() => addTag(item.tag)}
                          title={item.label}
                        >
                          {item.tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
