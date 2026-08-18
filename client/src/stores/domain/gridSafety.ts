/**
 * R2 grid-safety assertions (REFRESH task 23).
 *
 * The single largest performance risk in this refresh is deep-observing the
 * pixel grid: the owner's real project holds **300,249 `PixelData` cells**,
 * each `{color: Pixel|0, normal: Normal|0, height: number}`. MobX's default
 * `observable` is DEEP, so one wrong annotation on `DomainStore.objects`
 * builds ~1M proxies — and the symptom is "MobX is slow", not "someone
 * annotated a field wrong".
 *
 * These helpers make that failure LOUD instead of silent. They walk the tree
 * and assert that every `PixelData[][]` is still a raw JS array — i.e. that
 * MobX never saw inside it.
 *
 * Used by `DomainStore`'s tests and available to a dev build. They are
 * deliberately cheap on the array level (they check the grid CONTAINER and
 * its rows, not all 300k cells) so they can run on a real project.
 */
import { isObservable, isObservableArray } from "mobx";
import type { Layer, PixelObject, VariantGroup } from "../../types";

/** Every grid found in a tree, with a path for the error message. */
export interface GridRef {
  path: string;
  grid: Layer["pixels"];
}

/** Collect every `layer.pixels` reachable from `objects` + `variants`. */
export function collectGrids(
  objects: readonly PixelObject[],
  variants: readonly VariantGroup[] = [],
): GridRef[] {
  const grids: GridRef[] = [];
  objects.forEach((obj, oi) => {
    obj.frames.forEach((frame, fi) => {
      frame.layers.forEach((layer, li) => {
        grids.push({
          path: `objects[${oi}].frames[${fi}].layers[${li}].pixels`,
          grid: layer.pixels,
        });
      });
    });
  });
  variants.forEach((group, gi) => {
    group.variants.forEach((variant, vi) => {
      variant.frames.forEach((vframe, fi) => {
        vframe.layers.forEach((layer, li) => {
          grids.push({
            path: `variants[${gi}].variants[${vi}].frames[${fi}].layers[${li}].pixels`,
            grid: layer.pixels,
          });
        });
      });
    });
  });
  return grids;
}

/**
 * THROW if any pixel grid has been made observable. Checks the grid array,
 * its first row, and its first cell — a deep `observable` proxies all three,
 * so any one of them catches the mistake.
 */
export function assertGridsAreRaw(
  objects: readonly PixelObject[],
  variants: readonly VariantGroup[] = [],
): void {
  const offenders: string[] = [];
  for (const { path, grid } of collectGrids(objects, variants)) {
    if (isObservableArray(grid as unknown as unknown[])) {
      offenders.push(`${path} (the grid itself is an observable array)`);
      continue;
    }
    const row = grid[0];
    if (row && isObservableArray(row as unknown as unknown[])) {
      offenders.push(`${path}[0] (a grid ROW is an observable array)`);
      continue;
    }
    const cell = row?.[0];
    if (cell && isObservable(cell)) {
      offenders.push(`${path}[0][0] (a PixelData CELL is observable)`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      "R2 VIOLATION — a pixel grid was made observable. `layer.pixels` is " +
        "`observableRef`, ALWAYS; deep-observing it creates ~1M proxies on " +
        "the owner's real project and presents as 'MobX is slow'.\n  " +
        offenders.slice(0, 10).join("\n  ") +
        (offenders.length > 10
          ? `\n  ...and ${offenders.length - 10} more`
          : ""),
    );
  }
}
