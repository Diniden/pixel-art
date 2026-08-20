/**
 * PaletteManagerContainer (REFRESH task 23).
 *
 * `PaletteManager` reads 7 store members, all confined to the palette slice.
 * This container supplies the 6 that moved to MobX — `palettes` from
 * `DomainStore` and the 5 `PaletteStore` actions — as plain props.
 * `setColor` is a tool setting and stays on Zustand until the UIStore task.
 *
 * ⚠️ All 5 palette actions remain NON-UNDOABLE (task 17, pinned).
 *
 * `observer()` may only be imported under `src/containers/` — task 05's
 * ESLint boundary enforces it, and the boundary probe is re-run whenever the
 * config changes.
 *
 * ── REFRESH task 36 (W27) ─────────────────────────────────────────────────
 *
 * The component's last two Zustand reads (`uiState.selectedColor`, `setColor`)
 * became the `selectedColor` prop and the `onSelectColor` callback, and the
 * component moved to `ui/components/PaletteManager/`.
 *
 * ⚠️ The `if (!project) return null` guard MOVED HERE from the component.
 * That is not cosmetic: without it the panel would render its "add palette"
 * form against a project that does not exist yet. `hasProject` is the MobX
 * equivalent of the old `project` truthiness test.
 */
import { observer } from "mobx-react-lite";
import { PaletteManager } from "../ui/components/PaletteManager/PaletteManager";
import { useStores } from "../stores/context";

export const PaletteManagerContainer = observer(
  function PaletteManagerContainer() {
    const { domain, palettes, ui } = useStores();

    // Transcribed from the component's pre-move `if (!project) return null`.
    if (!domain.hasProject) return null;

    return (
      <PaletteManager
        palettes={domain.palettes}
        selectedColor={ui.tool.selectedColor}
        onSelectColor={(color) => ui.tool.setColor(color)}
        onAddPalette={(name) => palettes.addPalette(name)}
        onDeletePalette={(id) => palettes.deletePalette(id)}
        onRenamePalette={(id, name) => palettes.renamePalette(id, name)}
        onAddColorToPalette={(id, color) =>
          palettes.addColorToPalette(id, color)
        }
        onRemoveColorFromPalette={(id, index) =>
          palettes.removeColorFromPalette(id, index)
        }
      />
    );
  },
);
