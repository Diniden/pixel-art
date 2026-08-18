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
import { compactToProject, projectToCompact } from "../../types";
import type { Project } from "../../types";

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
 */
export function createCompositeCommand(
  label: string,
  commands: readonly Command[],
): Command & { readonly before?: Project } {
  const first = commands.find(
    (command): command is SnapshotCommand =>
      (command as SnapshotCommand).before !== undefined,
  );
  return {
    label,
    bytes: commands.reduce((sum, command) => sum + command.bytes, 0),
    before: first?.before,
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
