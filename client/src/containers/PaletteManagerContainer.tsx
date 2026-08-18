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
 */
import { observer } from "mobx-react-lite";
import { PaletteManager } from "../components/PaletteManager/PaletteManager";
import { useStores } from "../stores/context";

export const PaletteManagerContainer = observer(
  function PaletteManagerContainer() {
    const { domain, palettes } = useStores();
    return (
      <PaletteManager
        palettes={domain.palettes}
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
