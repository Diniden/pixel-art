/**
 * SelectLayerStep — pick which layer's frames feed the interpolation
 * (REFRESH task 34, from `AIInterpolateModal.tsx:939-957`).
 *
 * PURE: React types only. Layer NAMES cross the boundary, never layers —
 * R2 forbids handing a pixel grid to a `ui/` component as a prop, and the
 * name is all this step needs.
 *
 * Base mode only; a variant has no layer choice to make.
 */
export interface SelectLayerStepProps {
  /** Non-variant layer names from the object's first frame, in order. */
  layerNames: string[];
  /** The current choice, or `null` before one is made. */
  selectedLayerName: string | null;
  onSelect: (name: string) => void;
}

export function SelectLayerStep({
  layerNames,
  selectedLayerName,
  onSelect,
}: SelectLayerStepProps) {
  return (
    <div className="ai-interpolate-modal__step-layer">
      <h3 className="ai-interpolate-modal__step-title">
        Select Layer to Interpolate
      </h3>
      <p className="ai-interpolate-modal__step-desc">
        Choose which layer&apos;s frames will be used for AI generation.
      </p>
      <div className="ai-interpolate-modal__layer-list">
        {layerNames.map((name) => (
          <button
            key={name}
            className={`ai-interpolate-modal__layer-item ${
              selectedLayerName === name
                ? "ai-interpolate-modal__layer-item--selected"
                : ""
            }`}
            onClick={() => onSelect(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {layerNames.length === 0 && (
        <p className="ai-interpolate-modal__empty">
          No non-variant layers found.
        </p>
      )}
    </div>
  );
}

export default SelectLayerStep;
