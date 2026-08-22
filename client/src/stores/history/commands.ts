/**
 * History commands (REFRESH task 17).
 *
 * A {@link Command} is one undoable step: it knows how to undo itself, how to
 * redo itself, and what it costs against `HistoryStore`'s byte budget.
 *
 * ── THIS TASK SHIPS SNAPSHOT-ONLY COMMANDS (R4) ────────────────────────────
 * Every command created here is a FULL project snapshot — the exact
 * `compactToProject(projectToCompact(project))` round trip the Zustand store
 * used — so behaviour is provably identical to the legacy
 * `projectHistory: Project[]` stack and task 08's characterisation suite
 * passes unchanged. Inverse-patch and structural-inverse command families
 * arrive with task 26, one family at a time, never here.
 *
 * Honest caveat (spec): the snapshot family is genuinely no better than
 * today — up to ~6.9 MB per entry on the real project, charged honestly
 * against the budget. It remains the permanent representation for only ~11
 * slow, user-initiated structural ops once task 26 lands.
 *
 * ── `referenceImage` is excluded from every command ────────────────────────
 * The base64 reference PNG never enters a command (spec, task 17): snapshots
 * are captured with `referenceImage` stripped, and `SnapshotHost.restore`
 * re-attaches the LIVE project's reference image. `setReferenceImage` stays
 * non-undoable exactly as today (`referenceActions.ts` — "Don't track
 * reference image changes in history"). Consequence, stated openly: undoing
 * past a reference-image change no longer reverts the reference image (the
 * old stack incidentally restored the snapshot-time image). Not pinned by the
 * task 08 suite; mandated by the spec.
 */
import {
  compactToProject,
  normalToPacked,
  packedToNormal,
  projectToCompact,
} from "../../types";
import type { Pixel, PixelData, Project } from "../../types";

export interface Command {
  /** "Draw", "Delete frame", "Resize object", … */
  readonly label: string;
  /** Estimated heap cost, charged against `HistoryStore.budgetBytes`. */
  readonly bytes: number;
  undo(): void;
  redo(): void;
}

/**
 * A command that also carries the pre-mutation snapshot. During the bridge
 * era the Zustand mirror (`EditorState.projectHistory`) is derived from this
 * field; task 26 must revisit the mirror before shipping any command that
 * does not carry one.
 */
export interface SnapshotCommand extends Command {
  /** The pre-mutation project — the state `undo()` returns to. */
  readonly before: Project;
}

/**
 * How a snapshot command reaches the live project. During the bridge era the
 * host is Zustand-backed (built in `store/index.ts`); after the migration it
 * will be the MobX domain tree.
 */
export interface SnapshotHost {
  /** The live project, or `null` when none is loaded. */
  current(): Project | null;
  /**
   * Install a restored project as the live one. The host must re-attach the
   * LIVE `referenceImage` — reference images never travel through history.
   */
  restore(project: Project): void;
}

/**
 * The measured runtime `Project` heap on the owner's real file is 6.9 MB for
 * 300,249 cells ≈ 23 bytes/cell; 24 keeps the estimate honest and cheap
 * (O(layers), never O(cells)).
 */
const BYTES_PER_CELL = 24;
const BYTES_PER_NODE = 1024;
const BYTES_BASE = 4096;

/** Cheap structural size estimate. O(layer count), never walks cells. */
export function estimateProjectBytes(project: Project): number {
  let bytes = BYTES_BASE;
  for (const object of project.objects) {
    for (const frame of object.frames) {
      for (const layer of frame.layers) {
        const rows = layer.pixels.length;
        const cols = rows > 0 ? (layer.pixels[0]?.length ?? 0) : 0;
        bytes += rows * cols * BYTES_PER_CELL + BYTES_PER_NODE;
      }
    }
  }
  for (const group of project.variants ?? []) {
    for (const variant of group.variants) {
      for (const frame of variant.frames) {
        for (const layer of frame.layers) {
          const rows = layer.pixels.length;
          const cols = rows > 0 ? (layer.pixels[0]?.length ?? 0) : 0;
          bytes += rows * cols * BYTES_PER_CELL + BYTES_PER_NODE;
        }
      }
    }
  }
  return bytes;
}

/**
 * Deep clone via the REAL serializer round trip — the exact clone the legacy
 * stack used (`store/index.ts:45-46` before this task) — with
 * `referenceImage` stripped (see the module header).
 */
function cloneWithoutReferenceImage(project: Project): Project {
  const compact = projectToCompact(project);
  return compactToProject({ ...compact, referenceImage: undefined });
}

export interface SnapshotCommandOptions {
  label: string;
  /**
   * The pre-mutation project. Cloned (round trip) and referenceImage-stripped
   * unless `adopt` is set.
   */
  project: Project;
  host: SnapshotHost;
  /**
   * Adopt an ALREADY-independent snapshot by reference, without cloning or
   * stripping — used by the bridge glue to wrap entries that external code
   * (`zustandProjectHost`, the test harness) wrote straight into the legacy
   * `projectHistory` array.
   */
  adopt?: boolean;
}

/**
 * The full-snapshot command — the only family this task ships.
 *
 * `undo()` lazily captures the CURRENT live project as the redo target, then
 * restores a fresh clone of `before` (a clone, so a later in-place mutation
 * of the live tree can never corrupt the stored snapshot — pinned by task
 * 08's "restores a CLONE" test). `redo()` restores the lazily-captured
 * post-state; it is unreachable before the first `undo()` by `HistoryStore`'s
 * index discipline, and defensively a no-op if that ever changes.
 */
export function createSnapshotCommand(
  options: SnapshotCommandOptions,
): SnapshotCommand {
  const { label, host } = options;
  const before = options.adopt
    ? options.project
    : cloneWithoutReferenceImage(options.project);
  let after: Project | null = null;

  return {
    label,
    bytes: estimateProjectBytes(before),
    before,
    undo() {
      const live = host.current();
      after = live ? cloneWithoutReferenceImage(live) : null;
      host.restore(cloneWithoutReferenceImage(before));
    },
    redo() {
      if (after) {
        host.restore(cloneWithoutReferenceImage(after));
      }
    },
  };
}

/**
 * One transaction's worth of commands collapsed into a single history entry
 * (`HistoryStore.endTransaction`). Children undo in REVERSE order and redo in
 * forward order. Carries the first child's `before` snapshot so the bridge
 * mirror sees the pre-transaction state — exactly what the legacy
 * `beginStroke` pushed.
 *
 * ── Task 26: a transaction may now hold MIXED families ────────────────────
 *
 * `stroke.begin()` records a snapshot ("Draw") into the transaction and every
 * `setPixel` during the drag then records a {@link PixelCommand}. So the
 * usual stroke composite is `[SnapshotCommand, PixelCommand, PixelCommand …]`
 * — `before` still resolves from the leading snapshot, which is what keeps
 * task 08's "the single entry is the state BEFORE the stroke began" green.
 *
 * `children` is exposed so the bridge-era `projectHistory` mirror can
 * reconstruct a pre-state for a composite that holds ONLY pixel commands (no
 * leading snapshot). Undo/redo never consult it — they run the children.
 */
export function createCompositeCommand(
  label: string,
  commands: readonly Command[],
): Command & {
  readonly before?: Project;
  readonly children: readonly Command[];
} {
  const first = commands.find(
    (command): command is SnapshotCommand =>
      (command as SnapshotCommand).before !== undefined,
  );
  return {
    label,
    bytes: commands.reduce((sum, command) => sum + command.bytes, 0),
    before: first?.before,
    children: commands,
    undo() {
      for (let i = commands.length - 1; i >= 0; i--) {
        commands[i].undo();
      }
    },
    redo() {
      for (const command of commands) {
        command.redo();
      }
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  THE INVERSE-PATCH PIXEL COMMAND FAMILY (REFRESH task 26)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This is the memory win the whole refresh is built around. A snapshot
 * command costs `estimateProjectBytes(project)` — measured at 6.9 MB on the
 * owner's real project — for an edit that touched 50 cells. A `PixelCommand`
 * records only the cells that actually changed:
 *
 *     { x, y, before: PixelData, after: PixelData }
 *
 * at ~{@link BYTES_PER_PATCH_CELL} bytes each, so a 50-pixel stroke is
 * ~1.2 kB against the 64 MB budget rather than 6.9 MB. That is the ratio the
 * task's acceptance gate ("a 50-pixel stroke command < 5 kB") measures.
 *
 * ── ONLY the pixel family converts (spec constraint) ───────────────────────
 * The structural family (add/delete layer, add/delete frame, …) and the
 * snapshot family (`resizeObject`, `flipHorizontal`, the 4 `squash*`, …) stay
 * on {@link createSnapshotCommand}. Their inverses are intractable or rare
 * enough that a full clone is the honest representation. Task 08's
 * characterisation suite is re-run after the conversion and must pass
 * UNCHANGED — that is the only proof the patch and the snapshot it replaced
 * are equivalent.
 *
 * ── R2: THE GRID IS TOUCHED BY REFERENCE, NEVER OBSERVED ──────────────────
 * A patch holds `PixelData` VALUES (small plain objects, copied out of the
 * grid) and locates its target by (objectId, frameId, layerId) — never by
 * holding a grid reference that could pin a 300k-cell array alive, and never
 * by walking one. Applying a patch REPLACES the affected rows and then the
 * grid wholesale, which is exactly the `observableRef` contract: MobX sees a
 * new array identity and never looks inside it.
 */

/** One changed cell. `before` is what `undo()` restores, `after` what `redo()` re-applies. */
export interface PixelPatch {
  x: number;
  y: number;
  before: PixelData;
  after: PixelData;
}

/**
 * Where a patch applies. The target is addressed by ID rather than by grid
 * reference so a command can never keep a stale 300k-cell array alive, and so
 * it survives the tree being rebuilt by an unrelated commit.
 *
 * `variant` addresses the parallel variant tree (`project.variants`), which
 * the drawing path writes whenever the selected layer is a variant layer.
 */
export interface PixelTarget {
  objectId: string;
  frameId: string;
  layerId: string;
  variant?: {
    variantGroupId: string;
    variantId: string;
    frameIndex: number;
    /**
     * Which layer of the addressed variant frame — W29h.
     *
     * ⚠️ OPTIONAL, and it must stay optional. Every variant target built
     * before W29h omitted it and meant `layers[0]`, so `?? 0` at both read
     * sites preserves that exactly; making it required would have forced a
     * mechanical edit through `resolveTarget`, `planNormalCompute` and every
     * fixture, changing nothing semantically while inviting a typo in a path
     * that writes the owner's artwork.
     *
     * ⚠️ It is addressed BY INDEX, not by id, because that is how the whole
     * variant tree is addressed — `frameIndex` above, `getSelectedVariantLayer`
     * (`store/helpers.ts:82`) and the legacy colour-adjustment key
     * `` `variant-frame-${i}` `` all index positionally. A `variantLayerId`
     * here would be the only id-addressed hop in an otherwise positional
     * chain.
     *
     * ⚠️ {@link coalescePixelCommands}' `sameTarget` MUST compare this. Two
     * writes to different variant layers that compare equal merge into ONE
     * command whose target names a single layer, and undo then replays BOTH
     * layers' cells onto it — silent artwork corruption in the undo path.
     * Pinned in `PixelStoreVariantLayer.test.ts`.
     */
    layerIndex?: number;
  };
}

/**
 * Bytes charged per recorded cell — and the number the acceptance gate turns
 * on, so it is MEASURED rather than assumed.
 *
 * ── ⚠️ WHY THE CELLS ARE PACKED INTO TYPED ARRAYS ────────────────────────
 *
 * The task spec estimates "roughly 24 bytes per changed pixel" for a patch of
 * `{x, y, before, after}`. That is the cost of the DATA, and it is right — but
 * a patch stored as JS OBJECTS does not cost the data. Measured structurally
 * (16 B object header + 8 B per named slot, standard JSC/V8 accounting):
 *
 *   `{x, y, before, after}` + two `PixelData` + a nested `{r,g,b,a}`
 *     = 176 B per cell  →  a 50-cell command is 9,416 B (9.2 kB)
 *
 * which FAILS this task's 5 kB gate — 768x better than a 6.9 MB snapshot, but
 * still 8x what the spec budgeted. The overhead is entirely object headers and
 * pointer slots; the actual payload is 12 bytes.
 *
 * So the cells are stored PACKED, in parallel typed arrays:
 *
 *   xy                  Uint32Array   x | (y << 16)
 *   before/afterColor   Uint32Array   RGBA
 *   before/afterNormal  Uint32Array   `normalToPacked`
 *   before/afterHeight  Uint8Array
 *   present             Uint8Array    the 4 "is it the 0 sentinel" bits
 *
 *     = 22 B per cell  →  a 50-cell command is 1,684 B (1.64 kB)
 *
 * which PASSES the gate with room to spare and matches the spec's estimate
 * almost exactly. It also means a patch holds NO reference into a pixel grid,
 * so history can never pin a 300k-cell array alive.
 *
 * `PixelPatch` remains the public shape: callers build and read plain objects,
 * and the pack/unpack pair converts at the boundary.
 */
export const BYTES_PER_PATCH_CELL = 22;

/** Fixed overhead per patch command: 8 typed-array views plus the ids. */
const BYTES_PATCH_BASE = 584;

/** The packed cell store. One allocation per array, never one per cell. */
interface PackedCells {
  readonly count: number;
  readonly xy: Uint32Array;
  readonly beforeColor: Uint32Array;
  readonly afterColor: Uint32Array;
  readonly beforeNormal: Uint32Array;
  readonly afterNormal: Uint32Array;
  readonly beforeHeight: Uint8Array;
  readonly afterHeight: Uint8Array;
  /**
   * Presence bits, because a packed 0 is ambiguous: `color: 0` is the EMPTY
   * sentinel, but a fully-transparent black `{r:0,g:0,b:0,a:0}` is a legal
   * colour that also packs to 0. Without this the two would round-trip to the
   * same value and an undo could silently turn a transparent pixel into an
   * empty one.
   *
   * bit 0 before.color · bit 1 after.color · bit 2 before.normal · bit 3 after.normal
   */
  readonly present: Uint8Array;
}

/** RGBA -> one Uint32. Presence is tracked separately (see `PackedCells`). */
function packColor(color: Pixel | 0): number {
  if (color === 0) return 0;
  return (
    (((color.r & 0xff) << 24) |
      ((color.g & 0xff) << 16) |
      ((color.b & 0xff) << 8) |
      (color.a & 0xff)) >>>
    0
  );
}

function unpackColor(packed: number, present: boolean): Pixel | 0 {
  if (!present) return 0;
  return {
    r: (packed >>> 24) & 0xff,
    g: (packed >>> 16) & 0xff,
    b: (packed >>> 8) & 0xff,
    a: packed & 0xff,
  };
}

/** Pack the caller's plain patches into the typed-array store. */
function packPatches(patches: readonly PixelPatch[]): PackedCells {
  const count = patches.length;
  const xy = new Uint32Array(count);
  const beforeColor = new Uint32Array(count);
  const afterColor = new Uint32Array(count);
  const beforeNormal = new Uint32Array(count);
  const afterNormal = new Uint32Array(count);
  const beforeHeight = new Uint8Array(count);
  const afterHeight = new Uint8Array(count);
  const present = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const p = patches[i];
    xy[i] = ((p.x & 0xffff) | ((p.y & 0xffff) << 16)) >>> 0;
    beforeColor[i] = packColor(p.before.color);
    afterColor[i] = packColor(p.after.color);
    beforeNormal[i] =
      p.before.normal === 0 ? 0 : normalToPacked(p.before.normal);
    afterNormal[i] = p.after.normal === 0 ? 0 : normalToPacked(p.after.normal);
    beforeHeight[i] = p.before.height & 0xff;
    afterHeight[i] = p.after.height & 0xff;
    present[i] =
      (p.before.color !== 0 ? 1 : 0) |
      (p.after.color !== 0 ? 2 : 0) |
      (p.before.normal !== 0 ? 4 : 0) |
      (p.after.normal !== 0 ? 8 : 0);
  }

  return {
    count,
    xy,
    beforeColor,
    afterColor,
    beforeNormal,
    afterNormal,
    beforeHeight,
    afterHeight,
    present,
  };
}

/** Materialise one patch back into the plain shape callers expect. */
function unpackPatch(packed: PackedCells, i: number): PixelPatch {
  const flags = packed.present[i];
  return {
    x: packed.xy[i] & 0xffff,
    y: (packed.xy[i] >>> 16) & 0xffff,
    before: {
      color: unpackColor(packed.beforeColor[i], (flags & 1) !== 0),
      normal: (flags & 4) !== 0 ? packedToNormal(packed.beforeNormal[i]) : 0,
      height: packed.beforeHeight[i],
    } as PixelData,
    after: {
      color: unpackColor(packed.afterColor[i], (flags & 2) !== 0),
      normal: (flags & 8) !== 0 ? packedToNormal(packed.afterNormal[i]) : 0,
      height: packed.afterHeight[i],
    } as PixelData,
  };
}

/** How an inverse patch reaches the live project. */
export interface PixelPatchHost {
  /**
   * Apply `cells` to the addressed grid, taking each cell's `direction` field.
   * The host REPLACES the grid wholesale (R2) and is responsible for the
   * `bumpPixelVersion()` that follows.
   */
  applyPatch(
    target: PixelTarget,
    cells: readonly PixelPatch[],
    direction: "undo" | "redo",
  ): void;
}

export interface PixelCommandOptions {
  label: string;
  target: PixelTarget;
  cells: readonly PixelPatch[];
  host: PixelPatchHost;
}

/**
 * A pixel command carries no `Project`. It exposes {@link PixelCommand.cells}
 * and {@link PixelCommand.target} so the bridge-era `projectHistory` mirror
 * can reconstruct a pre-state on demand (see `store/index.ts`) rather than
 * storing one.
 */
export interface PixelCommand extends Command {
  readonly kind: "pixel";
  readonly target: PixelTarget;
  readonly cells: readonly PixelPatch[];
}

/** Type guard used by the history mirror and by `createCompositeCommand`. */
export function isPixelCommand(command: Command): command is PixelCommand {
  return (command as PixelCommand).kind === "pixel";
}

/**
 * The inverse-patch command — the pixel family's representation.
 *
 * `undo()` writes every cell's `before`; `redo()` writes every cell's
 * `after`. Both are O(changed cells), never O(grid), and neither clones a
 * project. This is the "< 0.1 ms per history-tracked pixel mutation" the task
 * promises against the snapshot family's measured 5.1 ms round trip.
 */
export function createPixelCommand(
  options: PixelCommandOptions,
): PixelCommand {
  const { label, target, host } = options;
  // PACKED at construction. The caller may keep mutating its working buffer
  // during a stroke, and — the point of the representation — nothing retained
  // here references a live cell or a pixel grid.
  const packed = packPatches(options.cells);

  /** Materialise the cells on demand. Undo, redo and the mirror all use it. */
  const materialise = (): PixelPatch[] => {
    const out: PixelPatch[] = new Array(packed.count);
    for (let i = 0; i < packed.count; i++) out[i] = unpackPatch(packed, i);
    return out;
  };

  return {
    kind: "pixel",
    label,
    bytes: BYTES_PATCH_BASE + packed.count * BYTES_PER_PATCH_CELL,
    target,
    // A getter, not a stored array: keeping a materialised copy would defeat
    // the packing entirely. Callers iterate it once and drop it.
    get cells() {
      return materialise();
    },
    undo() {
      host.applyPatch(target, materialise(), "undo");
    },
    redo() {
      host.applyPatch(target, materialise(), "redo");
    },
  };
}

/**
 * Merge consecutive {@link PixelCommand}s that share a target into ONE packed
 * command (REFRESH task 26).
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * A pencil drag records one command per MOUSEMOVE, not one per stroke. Each
 * command carries 8 typed-array views ({@link BYTES_PER_PATCH_CELL}'s note),
 * so 50 single-cell commands pay the 584 B view overhead 50 times:
 *
 *   50 separate commands   = 50 × (584 + 22) = 30,300 B
 *   coalesced into one     = 584 + 50 × 22   =  1,684 B      (18x smaller)
 *
 * The per-cell payload is identical; only the per-command overhead collapses.
 * Measured directly through the store, not estimated.
 *
 * ── What it must NOT change ───────────────────────────────────────────────
 *
 * Only ADJACENT commands on the SAME target merge, and the cell order is
 * preserved, so undo still walks the recorded cells in exactly the order the
 * un-merged children would have. A snapshot child (the one `stroke.begin()`
 * records) is never merged and never crosses a boundary — it stays in place,
 * which is what keeps the composite's `before` resolving to the pre-stroke
 * state.
 *
 * Two writes to the SAME cell within a run are both kept, in order. Undo
 * applies `before` values from the array, and the FIRST recorded `before` for
 * a cell is the one that survives a full reverse walk — same as replaying the
 * un-merged children in reverse.
 */
function coalescePixelCommands(
  commands: readonly Command[],
  host: PixelPatchHost,
): readonly Command[] {
  const out: Command[] = [];
  let runTarget: PixelTarget | null = null;
  let runCells: PixelPatch[] = [];
  let runLabel = "Draw";

  const flush = () => {
    if (!runTarget || runCells.length === 0) return;
    out.push(
      createPixelCommand({
        label: runLabel,
        target: runTarget,
        cells: runCells,
        host,
      }),
    );
    runTarget = null;
    runCells = [];
  };

  /**
   * ⚠️ `layerIndex` is compared through `?? 0`, NOT raw — W29h.
   *
   * Two reasons, and both are load-bearing:
   *
   *  1. **Omitting it would corrupt artwork.** A run merges into ONE command
   *     carrying ONE target. If writes to variant layers 0 and 2 compared
   *     equal they would merge, the surviving target would name one layer,
   *     and `undo()` would replay BOTH layers' `before` cells onto it —
   *     restoring pixels to a layer they never came from. Nothing throws.
   *
   *  2. **`?? 0`, not `===`, so legacy targets still coalesce.** A target
   *     with no `layerIndex` means `layers[0]` (see {@link PixelTarget}).
   *     Comparing raw would make `undefined !== 0` split a run the moment any
   *     producer started emitting an explicit `layerIndex: 0`, and a pencil
   *     drag that stops coalescing costs 18x the bytes — straight through the
   *     5 kB gate.
   */
  const sameTarget = (a: PixelTarget, b: PixelTarget) =>
    a.objectId === b.objectId &&
    a.frameId === b.frameId &&
    a.layerId === b.layerId &&
    a.variant?.variantGroupId === b.variant?.variantGroupId &&
    a.variant?.variantId === b.variant?.variantId &&
    a.variant?.frameIndex === b.variant?.frameIndex &&
    (a.variant?.layerIndex ?? 0) === (b.variant?.layerIndex ?? 0);

  for (const command of commands) {
    if (!isPixelCommand(command)) {
      flush();
      out.push(command);
      continue;
    }
    if (runTarget && !sameTarget(runTarget, command.target)) {
      flush();
    }
    runTarget = command.target;
    runLabel = command.label;
    // `cells` materialises from the packed store; pushed straight into the
    // run and re-packed once by `flush()`.
    runCells.push(...command.cells);
  }
  flush();
  return out;
}

/**
 * The transaction collapse used by `HistoryStore.endTransaction` — coalesce
 * first, then wrap. Exported so the store does not need to know about the
 * pixel family at all.
 */
export function collapseTransaction(
  label: string,
  commands: readonly Command[],
  host: PixelPatchHost | null,
): Command {
  const merged = host ? coalescePixelCommands(commands, host) : commands;
  return merged.length === 1
    ? merged[0]
    : createCompositeCommand(label, merged);
}
