/**
 * PosePresetList — the saved-scene presets in the Pose rail (plan 08 task 08,
 * 2026-09-04; owner item 10).
 *
 * PURE. Like every module under `ui/` this imports no store, no MobX, no API
 * and no `services/` — not even as a type. The list arrives as props, and
 * saving, applying and deleting all leave as callbacks.
 * `PixelStudioPanelContainer` is the one `observer()` that reads
 * `app.pose.posePresets` and calls the store's actions.
 *
 * ## The owner's words
 *
 * *"I want a way to save ALL orientations of camera settings and model to a
 * preset that I can reload easily."* So: a name box, a Save button, and a
 * list where one tap restores the scene and a second control forgets it.
 *
 * ## ⚠️ What a preset holds is NOT this component's business
 *
 * It renders `{id, name}` and nothing else. The contents — mesh, rotation,
 * projection, camera preset, FOV, scale, light direction, light tint and
 * outline width, with `pan` deliberately excluded — are decided in
 * `types/domain.ts`'s `PersistedPosePreset` (open question 4) and snapshotted
 * by `PoseUIStore.saveCurrentAsPosePreset`. A `ui/` component that knew the
 * field list would be a second place to update every time one changed, and it
 * has no use for the values: it neither displays nor edits them.
 *
 * ## The empty name is a NO-OP, not an error
 *
 * The `saveCurrentAsPreset` precedent (`LayoutUIStore.ts:500-513`) trims and
 * silently declines an empty name, and the store still does — but a control
 * that accepts a click and does nothing visible is a bug report waiting to
 * happen, so the button is **disabled** while the trimmed name is empty. The
 * store's own no-op stays as the guarantee; this is the affordance. Both
 * exist for the reason `PoseSection`'s outline slider gives: the store is the
 * guarantee, the rail is only the affordance.
 *
 * ## ⚠️ Delete is guarded, and Apply is not
 *
 * Applying the wrong preset costs one tap of the right one. Deleting the
 * wrong one costs a scene the owner set up by hand and cannot recover — there
 * is no undo for UI state (the pose is not in history, MASTER D6). The delete
 * button therefore arms on first press and commits on the second, with the
 * armed state visible and abandoned the moment anything else is touched. A
 * `window.confirm` was not used: it cannot be styled, it is hostile on the
 * iPad the owner works on, and `ui/` components here do not reach for globals.
 */
import { useState } from "react";

import "./PosePanel.css";

/**
 * One saved scene, as the rail sees it.
 *
 * ⚠️ **Structurally the `id`/`name` half of `types/domain.ts`'s
 * `PersistedPosePreset`, declared here rather than imported** — `ui/` may not
 * import `types/domain.ts` at all, type-only included. The same reason
 * `PoseColor` and the pose unions are duplicated in
 * `ui/canvas/pose/poseTypes.ts`. The wider persisted type is assignable to
 * this narrower one, so the container needs no cast at the seam.
 */
export interface PosePresetEntry {
  id: string;
  name: string;
}

export interface PosePresetListProps {
  /** Every saved scene, in save order. Empty until the owner saves one. */
  presets: readonly PosePresetEntry[];
  /**
   * Save the current scene under this name. Already trimmed and never empty —
   * the button is disabled otherwise. ⚠️ **The store decides what "the current
   * scene" contains**, not this component.
   */
  onSave: (name: string) => void;
  /** Restore one saved scene, by id. */
  onApply: (id: string) => void;
  /** Forget one saved scene, by id. Confirmed by a second press first. */
  onDelete: (id: string) => void;
}

export function PosePresetList({
  presets,
  onSave,
  onApply,
  onDelete,
}: PosePresetListProps) {
  const [name, setName] = useState("");
  /** The preset whose delete button is armed, or `null`. See the header. */
  const [armed, setArmed] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSave = trimmed !== "";

  const save = () => {
    if (!canSave) return;
    onSave(trimmed);
    /* Cleared so the next save does not silently reuse the last name — two
       presets with the same label are indistinguishable in the list. */
    setName("");
    setArmed(null);
  };

  return (
    <div className="pose-panel__group">
      <span className="pose-panel__group-label">Scene presets</span>

      <div className="pose-panel__preset-save">
        <input
          type="text"
          className="pose-panel__preset-name"
          aria-label="Preset name"
          placeholder="Name this scene"
          value={name}
          onChange={(e) => setName(e.target.value)}
          /* Enter saves, because a name box with a button beside it that
             ignored Enter would be the surprising one. */
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
        />
        <button
          type="button"
          className="pose-panel__btn"
          onClick={save}
          disabled={!canSave}
          title={
            canSave
              ? "Save the camera, the model's orientation, the light and the outline under this name"
              : "Type a name first"
          }
        >
          Save
        </button>
      </div>

      {presets.length === 0 ? (
        <p className="pose-panel__hint">
          No saved scenes yet. Set the camera and the model up, then name and
          save it — it is kept with the project and comes back on reload.
        </p>
      ) : (
        <ul className="pose-panel__presets">
          {presets.map((preset) => {
            const isArmed = armed === preset.id;
            return (
              <li key={preset.id} className="pose-panel__preset">
                <button
                  type="button"
                  className="pose-panel__preset-apply"
                  onClick={() => {
                    onApply(preset.id);
                    /* Any other interaction disarms a pending delete — see
                       the header. */
                    setArmed(null);
                  }}
                  title={`Restore "${preset.name}" — the camera, the model's orientation, the light and the outline`}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className={`pose-panel__preset-delete${
                    isArmed ? " pose-panel__preset-delete--armed" : ""
                  }`}
                  aria-label={
                    isArmed
                      ? `Confirm deleting ${preset.name}`
                      : `Delete ${preset.name}`
                  }
                  onClick={() => {
                    if (isArmed) {
                      onDelete(preset.id);
                      setArmed(null);
                    } else {
                      setArmed(preset.id);
                    }
                  }}
                  title={
                    isArmed
                      ? "Press again to delete this scene — it cannot be undone"
                      : "Delete this saved scene"
                  }
                >
                  {isArmed ? "Sure?" : "×"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
