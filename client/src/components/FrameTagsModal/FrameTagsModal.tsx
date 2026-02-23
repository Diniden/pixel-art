import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useEditorStore } from "../../store";
import type { Project, PixelObject, VariantGroup } from "../../types";
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

interface FrameTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: FrameTagsContext;
}

export function FrameTagsModal({
  isOpen,
  onClose,
  context,
}: FrameTagsModalProps) {
  const project = useEditorStore((s) => s.project);
  const addFrameTag = useEditorStore((s) => s.addFrameTag);
  const removeFrameTag = useEditorStore((s) => s.removeFrameTag);
  const addVariantFrameTag = useEditorStore((s) => s.addVariantFrameTag);
  const removeVariantFrameTag = useEditorStore((s) => s.removeVariantFrameTag);

  const [inputValue, setInputValue] = useState("");

  const currentTags = useMemo(() => {
    if (!project) return [];
    if (context.type === "object") {
      const obj = project.objects.find((o) =>
        o.frames.some((f) => f.id === context.frameId),
      );
      const frame = obj?.frames.find((f) => f.id === context.frameId);
      return frame?.tags ?? [];
    } else {
      const vg = project.variants?.find(
        (vg) => vg.id === context.variantGroupId,
      );
      const v = vg?.variants.find((v) => v.id === context.variantId);
      const frame = v?.frames.find((f) => f.id === context.frameId);
      return frame?.tags ?? [];
    }
  }, [project, context]);

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    if (context.type === "object") {
      addFrameTag(context.frameId, t);
    } else {
      addVariantFrameTag(
        context.variantGroupId,
        context.variantId,
        context.frameId,
        t,
      );
    }
  };

  const removeTag = (tag: string) => {
    if (context.type === "object") {
      removeFrameTag(context.frameId, tag);
    } else {
      removeVariantFrameTag(
        context.variantGroupId,
        context.variantId,
        context.frameId,
        tag,
      );
    }
  };

  const handleSubmit = () => {
    addTag(inputValue);
    setInputValue("");
  };

  useEffect(() => {
    if (!isOpen) setInputValue("");
  }, [isOpen]);

  const projectTagSections = useMemo(() => {
    if (!project) return [];
    const sections: {
      key: string;
      label: string;
      items: { tag: string; label?: string }[];
    }[] = [];

    for (const obj of project.objects) {
      const seen = new Set<string>();
      const items: { tag: string; label?: string }[] = [];
      obj.frames.forEach((f, idx) => {
        (f.tags ?? []).forEach((tag) => {
          if (!seen.has(tag)) {
            seen.add(tag);
            items.push({ tag, label: `${obj.name} · #${idx + 1} ${f.name}` });
          }
        });
      });
      if (items.length > 0) {
        sections.push({ key: `obj-${obj.id}`, label: obj.name, items });
      }
    }

    if (project.variants) {
      for (const vg of project.variants) {
        for (const v of vg.variants) {
          const seen = new Set<string>();
          const items: { tag: string; label?: string }[] = [];
          v.frames.forEach((f, idx) => {
            (f.tags ?? []).forEach((tag) => {
              if (!seen.has(tag)) {
                seen.add(tag);
                items.push({
                  tag,
                  label: `${vg.name} › ${v.name} · #${idx + 1}`,
                });
              }
            });
          });
          if (items.length > 0) {
            sections.push({
              key: `v-${vg.id}-${v.id}`,
              label: `${vg.name} › ${v.name}`,
              items,
            });
          }
        }
      }
    }
    return sections;
  }, [project]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const title =
    context.type === "object"
      ? `Frame tags${context.frameName ? `: ${context.frameName}` : ""}`
      : `Variant frame tags · #${context.frameIndex + 1}`;

  return createPortal(
    <div className="frame-tags-modal-backdrop" onClick={handleBackdropClick}>
      <div className="frame-tags-modal" onClick={(e) => e.stopPropagation()}>
        <div className="frame-tags-modal-header">
          <h4>{title}</h4>
          <button
            type="button"
            className="frame-tags-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="frame-tags-modal-content">
          <div className="frame-tags-pills">
            {currentTags.map((tag) => (
              <span
                key={tag}
                className="frame-tag-pill"
                style={{ backgroundColor: tagColorForTag(tag) }}
              >
                {tag}
                <button
                  type="button"
                  className="frame-tag-pill-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="frame-tags-input-row">
            <input
              type="text"
              className="frame-tags-input"
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
              className="frame-tags-add-btn"
              onClick={handleSubmit}
            >
              Add
            </button>
          </div>

          <div className="frame-tags-project-section">
            <div className="frame-tags-project-title">
              Tags in project (click to add to this frame)
            </div>
            <div className="frame-tags-project-list">
              {projectTagSections.length === 0 ? (
                <div className="frame-tags-project-empty">
                  No tags in project yet. Add tags above to frames.
                </div>
              ) : (
                projectTagSections.map((section) => (
                  <div key={section.key} className="frame-tags-project-group">
                    <div className="frame-tags-project-group-label">
                      {section.label}
                    </div>
                    <div className="frame-tags-project-group-pills">
                      {section.items.map((item, i) => (
                        <button
                          key={`${item.tag}-${i}`}
                          type="button"
                          className="frame-tag-pill clickable"
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
