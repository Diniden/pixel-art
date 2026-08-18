/**
 * PaletteStore — palette CRUD (REFRESH task 23).
 *
 * One of the two trivially-extractable action modules, and the reason it goes
 * first: `store/paletteActions.ts` is 70 lines and takes **no `get`** at all —
 * only `updateProjectAndSave`. It has no cross-module dependency, so it
 * proves the sub-store pattern with minimal risk.
 *
 * ── ALL FIVE ACTIONS ARE NON-UNDOABLE — PRESERVED EXACTLY ──────────────────
 * Every one of the five passes `trackHistory=false` in the legacy module, and
 * task 17 pinned that behaviour. `undoable: false` on every `commit()` below
 * keeps it. **Do not "fix" this** — palette edits not entering the undo stack
 * is the observed, pinned product behaviour, not an oversight.
 *
 * `DomainStore` owns `palettes`; this store is a behaviour module over it
 * (see `DomainMutator`'s header). It takes `DomainStore` + `HistoryStore` by
 * constructor injection and imports nothing from `stores/ui/`.
 *
 * `palettes` is the ONE deeply-observable member of the tree — a few hundred
 * colours, so deep observation is affordable and buys `PaletteManager`
 * per-swatch granularity. That is why these actions may mutate in place.
 */
import { DEFAULT_COLOR, generateId } from "../../types";
import type { Color } from "../../types";
import type { DomainMutator } from "./DomainMutator";
import type { DomainStore } from "./DomainStore";

export interface PaletteStoreDeps {
  domain: DomainStore;
  mutator: DomainMutator;
}

export class PaletteStore {
  private readonly domain: DomainStore;
  private readonly mutator: DomainMutator;

  constructor(deps: PaletteStoreDeps) {
    this.domain = deps.domain;
    this.mutator = deps.mutator;
  }

  /** Non-undoable, like all five (see the header). */
  addPalette(name: string): void {
    this.mutator.commit("Add palette", false, () => {
      this.domain.palettes = [
        ...this.domain.palettes,
        { id: generateId(), name, colors: [DEFAULT_COLOR] },
      ];
    });
  }

  deletePalette(id: string): void {
    this.mutator.commit("Delete palette", false, () => {
      this.domain.palettes = this.domain.palettes.filter((p) => p.id !== id);
    });
  }

  renamePalette(id: string, name: string): void {
    this.mutator.commit("Rename palette", false, () => {
      this.domain.palettes = this.domain.palettes.map((p) =>
        p.id === id ? { ...p, name } : p,
      );
    });
  }

  addColorToPalette(paletteId: string, color: Color): void {
    this.mutator.commit("Add colour", false, () => {
      this.domain.palettes = this.domain.palettes.map((p) =>
        p.id === paletteId ? { ...p, colors: [...p.colors, color] } : p,
      );
    });
  }

  removeColorFromPalette(paletteId: string, colorIndex: number): void {
    this.mutator.commit("Remove colour", false, () => {
      this.domain.palettes = this.domain.palettes.map((p) =>
        p.id === paletteId
          ? { ...p, colors: p.colors.filter((_, i) => i !== colorIndex) }
          : p,
      );
    });
  }
}
