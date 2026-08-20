/**
 * applyInterpolation — the 182-line `handleAccept` from `AIInterpolateModal`,
 * relocated to the domain layer (REFRESH task 34).
 *
 * It splices AI-generated frames into an object's timeline or into a variant's
 * frame list, which is a DOMAIN MUTATION and therefore belongs behind the same
 * `DomainMutator.commit` seam every other write uses — not in a component,
 * where it hand-rolled its own project clone and history entry.
 *
 * ── What it does ──────────────────────────────────────────────────────────
 *
 * Given sorted keyframe indices `[k0, k1, … kn]` and one list of generated
 * grids per consecutive PAIR, the new timeline is
 *
 *     frames[0 … k0)  ++  k0 ++ gen(0) ++ k1 ++ gen(1) ++ … ++ kn
 *                     ++  [loop frames]  ++  frames(kn … end]
 *
 * The frames BETWEEN keyframes are dropped — they are what the generated ones
 * replace. When `loopBack` is set, one extra pair (kn → k0) is appended and
 * everything after the last keyframe is dropped instead of preserved. Both
 * behaviours are ported verbatim from the modal.
 *
 * ── ⚠️ PRESERVED FINDINGS — do not "fix" these ────────────────────────────
 *
 *  - **W1 / task 02, the array rank.** `pairs` is RANK 4:
 *    `pair → frame → row → cell`. W1 found the modal's annotation claimed
 *    rank 3 while the VALUES were always rank 4, and corrected the annotation
 *    only. `PairPixelData` names the shape so it cannot silently drift, and
 *    `__tests__/applyInterpolation.test.ts` asserts a written layer's `pixels`
 *    is `PixelData[][]` — the assertion the task 34 spec requires.
 *  - **W8 / task 14, the commit path.** This goes through `mutator.commit`.
 *    It must NEVER call `useEditorStore.setState()` or `scheduleAutoSave()`
 *    directly again: those bypassed the `MAX_HISTORY` cap and the normal save.
 *  - **ONE undo entry.** `mutator.commit` snapshots exactly once, so accepting
 *    an interpolation — however many frames it adds — is a single undoable
 *    step. It is a SNAPSHOT-family command (the whole timeline is rewritten;
 *    an inverse patch would be larger than the snapshot), which is what
 *    `mirror.snapshot()` records.
 *
 * ── Purity of the caller ──────────────────────────────────────────────────
 * The base64 → `PixelData` decode happens in the CONTAINER (it needs `Image`
 * and a canvas), so this module takes already-decoded grids and imports no
 * DOM. That keeps it runnable in the `unit` lane.
 */
import { generateId } from "../../types";
import type {
  Frame,
  Layer,
  PixelData,
  VariantFrame,
} from "../../types";
import type { DomainStore } from "./DomainStore";
import type { DomainMutator } from "./DomainMutator";

/**
 * Generated pixel grids, grouped by keyframe pair.
 *
 * ⚠️ RANK 4 — `pairs[pairIdx][frameIdx][y][x]`. See the module header: the
 * rank was already audited in W1 and is correct as written.
 */
export type PairPixelData = PixelData[][][][];

export interface ApplyInterpolationBase {
  /** Sorted, ascending, at least two entries. */
  sortedKeyframes: number[];
  /** One entry per pair; `loopBack` adds a trailing (last → first) pair. */
  pairs: PairPixelData;
  /** Replace frames after the last keyframe with a wrap-around pair. */
  loopBack: boolean;
}

export interface ApplyInterpolationToObject extends ApplyInterpolationBase {
  mode: "base";
  objectId: string;
  /** Which layer receives the generated grid; others are copied from the template. */
  selectedLayerName: string | null;
}

export interface ApplyInterpolationToVariant extends ApplyInterpolationBase {
  mode: "variant";
  variantGroupId: string;
  variantId: string;
}

export type ApplyInterpolationInput =
  | ApplyInterpolationToObject
  | ApplyInterpolationToVariant;

export interface ApplyInterpolationDeps {
  domain: DomainStore;
  mutator: DomainMutator;
}

/** The history label; one entry per accepted interpolation. */
export const APPLY_INTERPOLATION_LABEL = "AI interpolation";

/**
 * Splice generated frames into the project. Returns `true` when a mutation was
 * committed, `false` when the input was rejected (bad ranges, missing target)
 * — the modal's silent-return guards, made observable.
 */
export function applyInterpolation(
  deps: ApplyInterpolationDeps,
  input: ApplyInterpolationInput,
): boolean {
  const { domain, mutator } = deps;
  const { sortedKeyframes, pairs, loopBack } = input;

  // Verbatim guard: fewer than two keyframes is not an interpolation.
  if (sortedKeyframes.length < 2 || pairs.length === 0) return false;

  const firstKeyIdx = sortedKeyframes[0];
  const lastKeyIdx = sortedKeyframes[sortedKeyframes.length - 1];

  if (input.mode === "variant") {
    const group = domain.variants.find((g) => g.id === input.variantGroupId);
    if (!group) return false;
    const variant = group.variants.find((v) => v.id === input.variantId);
    if (!variant) return false;

    const oldFrames = variant.frames;
    if (lastKeyIdx >= oldFrames.length) return false;

    const newFrames = spliceFrames<VariantFrame>({
      oldFrames,
      sortedKeyframes,
      loopBack,
      pairs,
      makeFrames: (grids) =>
        grids.map((pixels) => ({
          id: generateId(),
          layers: [
            {
              id: generateId(),
              name: "Layer 1",
              pixels,
              visible: true,
            },
          ],
        })),
    });

    mutator.commit(APPLY_INTERPOLATION_LABEL, true, () => {
      domain.variants = domain.variants.map((g) =>
        g.id !== group.id
          ? g
          : {
              ...g,
              variants: g.variants.map((v) =>
                v.id !== variant.id ? v : { ...v, frames: newFrames },
              ),
            },
      );
    });
    return true;
  }

  const obj = domain.objects.find((o) => o.id === input.objectId);
  if (!obj) return false;

  const oldFrames = obj.frames;
  if (lastKeyIdx >= oldFrames.length) return false;

  // The template supplies every layer the generated grid does NOT replace.
  const templateFrame = oldFrames[firstKeyIdx];
  const { selectedLayerName } = input;

  /** Build one frame's layers: the selected layer gets `pixels`, the rest are copied. */
  const buildLayers = (pixels: PixelData[][]): Layer[] =>
    templateFrame.layers.map((srcLayer) => {
      if (srcLayer.name === selectedLayerName && !srcLayer.isVariant) {
        return {
          id: generateId(),
          name: srcLayer.name,
          pixels,
          visible: srcLayer.visible,
        };
      }
      return {
        ...srcLayer,
        id: generateId(),
        // A NEW grid — a `ref` replacement, never an in-place write (R2).
        pixels: srcLayer.pixels.map((row) => [...row]),
      };
    });

  const newFrames = spliceFrames<Frame>({
    oldFrames,
    sortedKeyframes,
    loopBack,
    pairs,
    makeFrames: (grids, pairIdx, isLoop) =>
      grids.map((pixels, j) => ({
        id: generateId(),
        // Names ported verbatim — `Interp <pair>.<n>` and `Loop <n>`.
        name: isLoop ? `Loop ${j + 1}` : `Interp ${pairIdx + 1}.${j + 1}`,
        layers: buildLayers(pixels),
      })),
  });

  mutator.commit(APPLY_INTERPOLATION_LABEL, true, () => {
    domain.objects = domain.objects.map((o) =>
      o.id === obj.id ? { ...o, frames: newFrames } : o,
    );
  });
  return true;
}

interface SpliceOptions<F> {
  oldFrames: readonly F[];
  sortedKeyframes: number[];
  loopBack: boolean;
  pairs: PairPixelData;
  /** Build the generated frames for one pair. */
  makeFrames: (
    grids: PixelData[][][],
    pairIdx: number,
    isLoop: boolean,
  ) => F[];
}

/**
 * The timeline rewrite, shared by both modes — the ONE place the ordering
 * lives. The base and variant branches of the original `handleAccept` were the
 * same walk with different frame constructors, duplicated in full.
 */
function spliceFrames<F>(options: SpliceOptions<F>): F[] {
  const { oldFrames, sortedKeyframes, loopBack, pairs, makeFrames } = options;
  const firstKeyIdx = sortedKeyframes[0];
  const lastKeyIdx = sortedKeyframes[sortedKeyframes.length - 1];

  const before = oldFrames.slice(0, firstKeyIdx);
  // ⚠️ Verbatim: looping DROPS everything after the last keyframe.
  const after = loopBack ? [] : oldFrames.slice(lastKeyIdx + 1);

  const middle: F[] = [];
  for (let i = 0; i < sortedKeyframes.length; i++) {
    middle.push(oldFrames[sortedKeyframes[i]]);
    if (i < sortedKeyframes.length - 1) {
      const grids = pairs[i];
      if (grids) middle.push(...makeFrames(grids, i, false));
    }
  }

  if (loopBack) {
    const loopGrids = pairs[sortedKeyframes.length - 1];
    if (loopGrids) {
      middle.push(...makeFrames(loopGrids, sortedKeyframes.length - 1, true));
    }
  }

  return [...before, ...middle, ...after];
}
