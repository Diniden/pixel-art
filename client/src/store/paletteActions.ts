import type { Color } from "../types";
import { generateId, DEFAULT_COLOR } from "../types";
import type { UpdateProjectAndSave } from "./storeTypes";

export function createPaletteActions(
  updateProjectAndSave: UpdateProjectAndSave,
) {
  return {
    addPalette: (name: string) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          palettes: [
            ...project.palettes,
            { id: generateId(), name, colors: [DEFAULT_COLOR] },
          ],
        }),
        false,
      );
    },

    deletePalette: (id: string) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          palettes: project.palettes.filter((p) => p.id !== id),
        }),
        false,
      );
    },

    renamePalette: (id: string, name: string) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          palettes: project.palettes.map((p) =>
            p.id === id ? { ...p, name } : p,
          ),
        }),
        false,
      );
    },

    addColorToPalette: (paletteId: string, color: Color) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          palettes: project.palettes.map((p) =>
            p.id === paletteId ? { ...p, colors: [...p.colors, color] } : p,
          ),
        }),
        false,
      );
    },

    removeColorFromPalette: (paletteId: string, colorIndex: number) => {
      updateProjectAndSave(
        (project) => ({
          ...project,
          palettes: project.palettes.map((p) =>
            p.id === paletteId
              ? { ...p, colors: p.colors.filter((_, i) => i !== colorIndex) }
              : p,
          ),
        }),
        false,
      );
    },
  };
}
