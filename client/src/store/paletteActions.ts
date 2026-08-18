/**
 * Palette actions — MIGRATED TO MobX (REFRESH task 23).
 *
 * All five actions (`addPalette`, `deletePalette`, `renamePalette`,
 * `addColorToPalette`, `removeColorFromPalette`) now live on
 * `stores/domain/PaletteStore`, which mutates `DomainStore.palettes` directly.
 * The bridge replaces the Zustand entries with delegates at install time, so
 * the 34 unmigrated consumers keep their `useEditorStore()` seam unchanged.
 *
 * The throwing stubs below are what an unbridged store gets. They throw
 * rather than silently no-op: a palette edit that vanishes without a trace is
 * far harder to diagnose than a loud failure, and the same reasoning (and
 * shape) as task 16's lifecycle stubs.
 *
 * ⚠️ All five remain NON-UNDOABLE. Every one passed `trackHistory=false`
 * here, task 17 pinned that, and `PaletteStore` preserves it exactly.
 *
 * This module is deleted outright with the Zustand store (task 38).
 */
import type { Color } from "../types";

function migrated(name: string): never {
  throw new Error(
    `${name} moved to PaletteStore (REFRESH task 23) and is reached through ` +
      "the Zustand bridge. This store has no bridge installed — construct an " +
      "ApplicationStore and call installBridge(), or call PaletteStore directly.",
  );
}

export function createPaletteActions() {
  return {
    addPalette: (_name: string): void => migrated("addPalette"),
    deletePalette: (_id: string): void => migrated("deletePalette"),
    renamePalette: (_id: string, _name: string): void =>
      migrated("renamePalette"),
    addColorToPalette: (_paletteId: string, _color: Color): void =>
      migrated("addColorToPalette"),
    removeColorFromPalette: (_paletteId: string, _colorIndex: number): void =>
      migrated("removeColorFromPalette"),
  };
}
