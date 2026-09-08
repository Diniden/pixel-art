/**
 * DomainStore — the project TREE plus its load/save lifecycle (REFRESH tasks
 * 16 and 23).
 *
 * Task 16 shipped the lifecycle: `loadState`, `loadError`, `projectName`,
 * `projectList`, the version counters the auto-save reaction observes, and the
 * project-lifecycle flows.
 *
 * ── Task 23 added the TREE ─────────────────────────────────────────────────
 * `version`, `objects`, `palettes`, `variants` and `referenceImage` are now
 * MobX-owned observables here, and the bridge runs in PHASE B for them:
 * Zustand is a read-only mirror. **Read the R2 note on the field declarations
 * before touching an annotation** — the pixel grids must never be proxied.
 *
 * `uiState` is deliberately NOT here. 43 of its 44 fields are UI and one is
 * session, so it stays Zustand-owned until the UIStore task; `serialize()`
 * reads it back through the {@link ProjectHost}, which is why this task
 * cannot change the saved bytes.
 *
 * The tree still has TWO mutation paths during the bridge era, which is the
 * one subtlety here:
 *   1. MobX-native — `PaletteStore` and `ObjectStore` (task 23) mutate the
 *      observables directly and then push the result to Zustand.
 *   2. Legacy — the ~137 `updateProjectAndSave` call sites in `store/*.ts`
 *      that later tasks (25-29) still own. The bridge ADOPTS those commits
 *      back into the tree so MobX stays canonical.
 * Both funnel through `adoptTree()`, so there is exactly one writer of these
 * five observables.
 *
 * ── THE LOAD-STATE MACHINE — THIS IS THE R5 FIX ────────────────────────────
 *
 *      idle ──initProject()──▶ loading ──success──▶ loaded
 *                                 │                    │
 *                                 └──failure──▶ failed │
 *                                        ▲             │
 *                                        └──retry──────┘ (initProject again)
 *
 *  - `AutoSaveController`'s trigger returns `null` unless `loadState ===
 *    "loaded"`, so a FAILED load can never be followed by a `POST
 *    /api/project`. `isLoading: boolean` could not express "failed", which is
 *    why the field widened (spec §Context).
 *  - `initProject()` while `loading` or `loaded` is a NO-OP — this is what
 *    makes React 19 StrictMode's double-fired `App.tsx` effect harmless
 *    (W2a's R11 risk list, site 1): the second call returns synchronously
 *    before the first `yield`, so there is never a second racing load whose
 *    catch could install a blank default. `failed` allows a retry.
 *  - NOTHING in this store ever installs `createDefaultProject()` on failure.
 *    The single surviving default is the 404 first-run path (pinned, L7).
 *
 * ── Flows, not async/await ─────────────────────────────────────────────────
 * Everything touching the API is a MobX `flow`: `flow` gives implicit action
 * wrapping after each `yield`, which `async/await` does not have under
 * `enforceActions: "always"`.
 *
 * ── Boundaries ─────────────────────────────────────────────────────────────
 * Imports NOTHING from `stores/ui/` (ESLint-enforced) and never touches a
 * pixel grid — grids stay behind the host as opaque references.
 */
import {
  action,
  computed,
  flow,
  makeObservable,
  observable,
  observableRef,
  observableShallow,
} from "mobx";
import {
  ApiError,
  backupApi,
  configApi,
  isApiError,
  isKind,
  projectApi,
} from "../../api";
import { runMigrations } from "../../services/migrations";
import {
  CompactProject,
  Palette,
  PixelObject,
  Project,
  VariantGroup,
  compactToProject,
  createDefaultProject,
  isCompactFormat,
  projectToCompact,
} from "../../types";
import type { SessionStore } from "../session/SessionStore";
// Task 29: the two pure helpers the reference-image persistence needs. Both are
// plain functions over a DOM node / a string — no store dependency, so this is
// not a domain→UI import.
import {
  decodeBase64ToImage,
  encodeImageToBase64,
} from "../../utils/imageEncoding";
import type { ReferenceSelectionBox } from "../../utils/referenceImage";

export type LoadState = "idle" | "loading" | "loaded" | "failed";

/**
 * The cells changed by the most recent pixel write — the D7 dirty-region
 * channel (plan `docs/05-canvas-perf`, task 01).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `null` MEANS "REPAINT EVERYTHING" AND EVERY CONSUMER MUST HANDLE IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The nullability is load-bearing, not laziness (plan risk R6). A writer that
 * replaces a grid wholesale — the two flips, the empty-patch lighting path —
 * cannot name the cells it touched, so it publishes `null` and the renderer
 * falls back to the full repaint it does today. Every path is therefore
 * correct-but-slow by default and only the paths that CAN describe themselves
 * get the fast one. A consumer that treats `null` as "nothing changed" leaves
 * stale pixels on screen.
 *
 * `cells` is read-only and is never entered into the observable graph — see
 * the `observableRef` annotation on {@link DomainStore.pixelDirty}.
 */
export interface PixelDirtyRegion {
  /** The layer whose grid changed. */
  layerId: string;
  /** Changed cells, in the layer's own grid space. */
  cells: readonly { x: number; y: number }[];
}

/**
 * Where the project TREE lives while it is still Zustand-owned (until task
 * 23+). `installProject` resets the undo history (load/switch/create/delete);
 * `replaceProject` preserves it (restore-from-backup is undoable);
 * `snapshotToHistory` pushes the current project onto the undo stack.
 */
export interface ProjectHost {
  getProject(): Project | null;
  installProject(project: Project): void;
  replaceProject(project: Project): void;
  snapshotToHistory(): void;
}

export interface DomainStoreDeps {
  session: SessionStore;
  host: ProjectHost;
}

/**
 * Supplies the persisted UI half of the save payload (task 24).
 *
 * ⚠️ It is INJECTED, never imported: `DomainStore` must not depend on
 * `stores/ui/**` (ESLint-enforced, task 05), because the domain half of the
 * app has to remain usable — and testable — without a UI store at all.
 * `ApplicationStore` wires it with
 * `domain.setUIStateProvider(() => this.ui.toPersistedUIState())`.
 */
export type UIStateProvider = () => CompactProject["uiState"];

export class DomainStore {
  /**
   * The persisted UI half of the save payload (task 24). `null` until
   * `ApplicationStore` injects it — and deliberately optional, so a
   * domain-only test can serialize without constructing a UI store.
   * NOT observable: it is wiring, set once at construction time.
   */
  private uiStateProvider: UIStateProvider | null = null;

  /** The 4-state load machine. See the module header. */
  loadState: LoadState = "idle";
  /** The typed failure of the LAST load attempt; `null` outside `failed`. */
  loadError: ApiError | null = null;
  projectName = "";
  /** Pure API cache of the server directory listing. */
  projectList: string[] = [];

  /* ── THE DOMAIN TREE (task 23) ──────────────────────────────────────────
   *
   * ⚠️ R2 — THE OBSERVABLE KINDS BELOW ARE NON-NEGOTIABLE. The owner's real
   * project holds 300,249 `PixelData` cells. MobX's default `observable` is
   * DEEP, so annotating `objects` deep would proxy every cell AND its nested
   * `Pixel`/`Normal` — ~1M proxies. The app becomes unusable and it presents
   * as "MobX is slow" rather than as the modelling error it is.
   *
   * See `adoptTree()` for the one place these are written, and
   * `assertGridsAreRaw()` for the runtime proof that no grid was proxied.
   */

  /** Carried verbatim from the loaded payload. */
  version?: string;

  /**
   * `observableShallow`: the ARRAY is observable (add/remove/reorder an
   * object propagates) but its elements are left as raw plain objects, so no
   * `PixelObject` → `Frame` → `Layer` → `pixels` proxy chain is ever built.
   *
   * Structural edits below the array level are made by replacing the object
   * (or the whole array) — the immutable-update style the Zustand actions
   * already use — so shallow observation loses no granularity that this
   * codebase actually relies on.
   */
  objects: PixelObject[] = [];

  /**
   * Deep `observable` — and the ONLY deep member of the tree. Palettes hold a
   * few hundred `{r,g,b,a}` colours, so deep observation is affordable and
   * gives `PaletteManager` per-swatch granularity for free (the design's
   * stated rationale).
   */
  palettes: Palette[] = [];

  /** `observableShallow` for the same reason as `objects` — `VariantFrame.layers[].pixels`. */
  variants: VariantGroup[] = [];

  /**
   * `observableRef`: a whole base64 PNG (megabytes). Never cloned, never
   * entered into a history command — this alone keeps up to 100 MB of
   * duplicated PNG out of the undo stack.
   */
  referenceImage: Project["referenceImage"] = undefined;

  /**
   * The auto-save trigger counters. `domainVersion` bumps once per committed
   * project mutation (during the bridge era the Zustand→MobX bridge bumps it
   * when the Zustand `project` reference changes). `pixelVersion` is a
   * PLACEHOLDER until the pixel grid moves (task 26) — wired into the trigger
   * now so later tasks only have to bump it.
   */
  domainVersion = 0;
  pixelVersion = 0;

  /**
   * The D7 dirty-region channel — a SEPARATE channel from `pixelVersion`,
   * deliberately.
   *
   * `pixelVersion` is the auto-save trigger and its bump is gated on
   * `history.isReplaying` (`PixelStore.publishAndBump`), so it is silent
   * during undo/redo by design. The renderer must NOT be silent there — the
   * undone pixels have to reach the canvas — so this field is published on
   * the replay path too (D8) and its semantics are independent of the save
   * trigger's. Nothing here may be folded back into `pixelVersion`.
   *
   * `null` means "repaint everything"; see {@link PixelDirtyRegion}.
   */
  pixelDirty: PixelDirtyRegion | null = null;

  /**
   * Bumped once per FRESH INSTALL of a project (init / load / create /
   * switch / delete — not restore, which is an undoable edit). The
   * `AutoSaveController` adopts the version counters as its clean baseline
   * when this changes, so opening the gate is never itself an edit and a
   * pending pre-switch edit cannot leak into a save of the newly loaded
   * project (the old `cancelPendingSave()` semantics, kept structurally).
   */
  loadGeneration = 0;

  private readonly session: SessionStore;
  private readonly host: ProjectHost;

  constructor(deps: DomainStoreDeps) {
    this.session = deps.session;
    this.host = deps.host;
    makeObservable(this, {
      loadState: observable,
      loadError: observableRef,
      projectName: observable,
      projectList: observableShallow,
      // ── The tree (task 23). See the R2 note on the field declarations. ──
      version: observable,
      objects: observableShallow, //      NEVER `observable` — see R2
      palettes: observable, //            the one deep member, deliberately
      variants: observableShallow, //     NEVER `observable` — see R2
      referenceImage: observableRef, //   a whole base64 PNG
      adoptTree: action,
      setReferenceImage: action,
      hasProject: computed,
      domainVersion: observable,
      pixelVersion: observable,
      pixelDirty: observableRef, //       NEVER `observable` — see R2. The
      //                                  region holds a cell ARRAY; deep
      //                                  observation would proxy one entry
      //                                  per changed pixel, which is the same
      //                                  modelling error as proxying a grid.
      loadGeneration: observable,
      isLoading: computed,
      bumpDomainVersion: action,
      bumpPixelVersion: action,
      setPixelDirty: action,
      initProject: flow,
      loadProject: flow,
      refreshFromServer: flow,
      createProject: flow,
      switchProject: flow,
      renameProject: flow,
      deleteProject: flow,
      refreshProjectList: flow,
      restoreFromBackup: flow,
    });
  }

  /** Survives as a computed so `isLoading` consumers need not change. */
  get isLoading(): boolean {
    return this.loadState === "loading";
  }

  get saveName(): string {
    return this.projectName;
  }

  /**
   * One committed domain mutation. During the bridge era the ONLY caller
   * was the Zustand bridge, the single place that saw every `project`
   * commit; tasks 23+ moved the bumps into the domain sub-stores that own
   * the mutations (`DomainMutator.commit`, `PixelStore.publishAndBump`).
   */
  bumpDomainVersion(): void {
    this.domainVersion += 1;
  }

  /** Placeholder until `PixelStore` owns the grid (task 26). */
  bumpPixelVersion(): void {
    this.pixelVersion += 1;
  }

  /**
   * Publish which cells the write that just landed changed (D7).
   *
   * `PixelStore` is the only caller. Pass `null` from any path that replaced
   * a grid wholesale and cannot enumerate its cells — that is the
   * correct-but-slow default, never an error.
   *
   * The region object is stored BY REFERENCE and must be treated as frozen by
   * both writer and consumer; nothing in here is persisted, cloned, or
   * entered into the undo stack.
   */
  setPixelDirty(region: PixelDirtyRegion | null): void {
    this.pixelDirty = region;
  }

  /* ── the tree (task 23) ────────────────────────────────────────────────── */

  /** True once a project tree has been adopted. */
  get hasProject(): boolean {
    return this.loadState === "loaded" || this.objects.length > 0;
  }

  /**
   * THE SINGLE WRITER of the tree. Splits an incoming `Project` into the five
   * observable members, leaving every pixel grid EXACTLY as it arrived — by
   * reference, never cloned, never proxied.
   *
   * Called only when "the tree changed wholesale":
   *  - the lifecycle flows, via `installTree()` (load / create / switch / …)
   *  - `ApplicationStore.adoptProject` (a load, an undo/redo restore, the
   *    task-08 harness). During the bridge era the bridge also called it to
   *    ADOPT commits made by not-yet-migrated Zustand actions.
   *
   * `uiState` is deliberately NOT stored here: 43 of its 44 fields are UI and
   * one is session, so it stays Zustand-owned until the UIStore task. Task 23
   * reads it back through the host at `serialize()` time, which is why the
   * saved bytes cannot change.
   */
  adoptTree(project: Project): void {
    this.version = project.version;
    this.objects = project.objects;
    this.palettes = project.palettes;
    this.variants = project.variants ?? [];
    this.referenceImage = project.referenceImage;
  }

  /**
   * Reconstitute a plain `Project` from the tree. The inverse of
   * `adoptTree`, and the value the Zustand mirror receives.
   *
   * ⚠️ `variants` round-trips as `undefined` when empty, NOT `[]` — task 07's
   * R1 pinned that the load path turns `variants: []` into `undefined`, and
   * `projectToCompact` omits a falsy `variants`. Emitting `[]` here would
   * change the saved bytes for every project without variants.
   */
  private treeToProject(uiState: Project["uiState"]): Project {
    return {
      version: this.version,
      objects: this.objects,
      palettes: this.palettes,
      ...(this.variants.length > 0 ? { variants: this.variants } : {}),
      ...(this.referenceImage ? { referenceImage: this.referenceImage } : {}),
      uiState,
    };
  }

  /**
   * The `Project` the bridge mirrors into Zustand and `serialize()` saves.
   * `null` until a tree has been adopted. `uiState` comes from the host —
   * the bridge-era seam that keeps the wire format byte-identical.
   */
  currentProject(): Project | null {
    const hosted = this.host.getProject();
    if (!hosted) return null;
    return this.treeToProject(hosted.uiState);
  }

  /** `referenceImage` is non-undoable and never enters a history command. */
  setReferenceImage(image: Project["referenceImage"]): void {
    this.referenceImage = image;
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  Reference-image persistence (REFRESH task 29)
   *
   *  These two replace `ReferenceImageModal.tsx`'s module-level
   *  `saveReferenceImageToProject` / `restoreReferenceImageFromProject`,
   *  which were the codebase's LAST TWO legacy-hook `getState()` calls
   *  (lines 235 and 261 of that file). Both reached into the Zustand store
   *  from a React module rather than receiving it — `getState()` outside a
   *  component is an untracked read that no reaction can observe, which is
   *  exactly why the panel's nudges re-rendered nothing.
   *
   *  They live on `DomainStore` because they touch only
   *  `project.referenceImage`. ⚠️ NON-UNDOABLE, deliberately and unchanged:
   *  they call `setReferenceImage` above, which writes the `observableRef`
   *  directly and enters no history command. The legacy action carried the
   *  comment "Don't track reference image changes in history"
   *  (`referenceActions.ts:47`) and that behaviour is preserved exactly — a
   *  base64 PNG in every undo entry would blow the history byte budget.
   * ══════════════════════════════════════════════════════════════════════ */

  /**
   * Encode the live image + crop box into `project.referenceImage`.
   *
   * ⚠️ Takes the image as an ARGUMENT rather than reading a UI store:
   * `stores/domain/**` may not import `stores/ui/**` (ESLint, task 05). The
   * caller is `ReferenceUIStore`, wired through the injected `save` callback
   * in `ApplicationStore`.
   *
   * A null image or selection CLEARS the field — the same overload the
   * original had, and what `handleClearImage` relies on.
   */
  saveReferenceImageToProject(
    image: HTMLImageElement | null,
    selection: ReferenceSelectionBox | null,
  ): Promise<void> {
    // Preserved verbatim: with no project loaded this is a silent no-op, NOT
    // an error. `App` can call it before the first load resolves.
    if (!this.hasProject) return Promise.resolve();

    if (!image || !selection) {
      this.setReferenceImage(undefined);
      return Promise.resolve();
    }

    return encodeImageToBase64(image)
      .then((base64) => {
        this.setReferenceImage({
          imageBase64: base64,
          selectionBox: {
            startX: selection.startX,
            startY: selection.startY,
            endX: selection.endX,
            endY: selection.endY,
          },
        });
      })
      .catch((error) => {
        console.error("Failed to save reference image:", error);
      });
  }

  /**
   * Decode `project.referenceImage` back into a live image + crop box.
   *
   * ⚠️ Returns the decoded triple rather than writing a UI store, for the same
   * import-direction reason as above. `ApplicationStore.restoreReferenceImage()`
   * is the composition point that hands the result to `ReferenceUIStore`.
   *
   * Resolves `null` when there is nothing to restore, and ALSO when decoding
   * fails — the original swallowed a decode error with a `console.error` and
   * left the singleton untouched, so a corrupt base64 blob degrades to "no
   * reference image" instead of breaking project load. Preserved.
   */
  restoreReferenceImageFromProject(): Promise<{
    image: HTMLImageElement;
    imageUrl: string;
    selection: ReferenceSelectionBox;
  } | null> {
    const referenceImage = this.referenceImage;
    if (!this.hasProject || !referenceImage) {
      return Promise.resolve(null);
    }

    const { imageBase64, selectionBox } = referenceImage;

    return decodeBase64ToImage(imageBase64)
      .then((image) => ({
        image,
        // A base64 data URL is directly usable as an object URL would be, and
        // must NOT be passed to `URL.revokeObjectURL` — the modal's
        // `handleClearImage` checks the `data:` prefix for exactly this.
        imageUrl: imageBase64,
        selection: {
          startX: selectionBox.startX,
          startY: selectionBox.startY,
          endX: selectionBox.endX,
          endY: selectionBox.endY,
        },
      }))
      .catch((error) => {
        console.error("Failed to restore reference image:", error);
        return null;
      });
  }

  /**
   * Install a freshly loaded/created project: adopt it into the MobX tree AND
   * push it to the host (which resets undo history, as the old
   * `projectActions` did). One helper so a lifecycle flow can never adopt
   * into one side and forget the other.
   */
  private installTree(project: Project): void {
    this.adoptTree(project);
    this.host.installProject(project);
  }

  /** History-PRESERVING install (restore-from-backup is undoable). */
  private replaceTree(project: Project): void {
    this.adoptTree(project);
    this.host.replaceProject(project);
  }

  /**
   * The payload `AutoSaveController` saves.
   *
   * Task 23: the domain half now comes from the MobX tree and `uiState` still
   * comes through the host, recombined by `currentProject()`. The bytes are
   * unchanged — `projectToCompact` receives a structurally identical
   * `Project`, `uiState.aiServiceUrl` included. The full `serialize()` with a
   * MobX-owned UI slice arrives with the UIStore task.
   */
  serialize(): CompactProject | null {
    const project = this.currentProject();
    if (!project) return null;
    const compact = projectToCompact(project);
    // Task 24: the 43 UI fields + `aiServiceUrl` now come from `UIStore`'s
    // explicit builder rather than from the `uiState` the host happened to
    // hold. `projectToCompact` still produces the domain half, so the two
    // halves are recombined here.
    //
    // ⚠️ R3: the result must stay wire-identical. `UIStore` is hydrated from
    // the same loaded project, and `persistedUIState.test.ts` pins the
    // builder against `projectToCompact`'s own output across all 151 real
    // corpus snapshots — key set and every value, zero permitted
    // differences. When no provider is wired (domain-only tests, the
    // pre-task-24 path) the host's `uiState` is used unchanged.
    if (this.uiStateProvider) {
      compact.uiState = this.uiStateProvider();
    }
    return compact;
  }

  /**
   * Inject the persisted-UI provider. Called once by `ApplicationStore`; see
   * {@link UIStateProvider} for why this is an injection rather than an
   * import.
   */
  setUIStateProvider(provider: UIStateProvider | null): void {
    this.uiStateProvider = provider;
  }

  /* ── the load path ─────────────────────────────────────────────────────── */

  /**
   * App-start entry point (the delegate `App.tsx`'s effect calls). Loads the
   * server config, the project list, and the current project.
   *
   * StrictMode-safe: a second call while `loading` (or after `loaded`) is a
   * synchronous no-op. `failed` allows a retry. NEVER rejects — failure is
   * expressed as `loadState === "failed"` + `loadError`, because the caller
   * is a fire-and-forget React effect.
   */
  *initProject(): Generator<Promise<unknown>, void, never> {
    if (this.loadState === "loading" || this.loadState === "loaded") return;
    this.loadState = "loading";
    this.loadError = null;
    try {
      // Load config to get current project name
      const config: Awaited<ReturnType<typeof configApi.get>> =
        yield configApi.get();
      const projectName = config.currentProject || "project";

      // Load the project list
      const projectList: string[] = yield projectApi.list();

      // Load the project data (migration chain included)
      const project: Project = yield this.fetchAndMigrate(projectName);

      this.projectName = projectName;
      this.projectList = projectList;
      this.installTree(project);
      this.loadGeneration += 1;
      this.loadState = "loaded";
    } catch (error) {
      console.error("Failed to load project:", error);
      this.loadState = "failed";
      this.loadError = isApiError(error) ? error : null;
      // ⚠️ R5: no createDefaultProject() here, ever. The blank-project
      // fallback this catch used to install (projectActions.ts:44-51) was
      // what auto-save wrote over the owner's real file.
    }
  }

  /**
   * Load one project by name (or the server's current project). THROWS on
   * failure — `loadState` becomes `failed` and the auto-save gate stays shut.
   * Resolves with the installed Project (the flows and tests read it).
   */
  *loadProject(name?: string): Generator<Promise<unknown>, Project, never> {
    this.loadState = "loading";
    this.loadError = null;
    try {
      const project: Project = yield this.fetchAndMigrate(name);
      this.installTree(project);
      if (name !== undefined) this.projectName = name;
      this.loadGeneration += 1;
      this.loadState = "loaded";
      return project;
    } catch (error) {
      this.loadState = "failed";
      this.loadError = isApiError(error) ? error : null;
      throw error;
    }
  }

  /**
   * Re-read the project from disk and install it WITHOUT a loading screen —
   * the cross-instance sync refresh (see `session/SyncController.ts`).
   *
   * ⚠️ `loadState` IS DELIBERATELY NEVER TOUCHED HERE. `loadProject` sets it
   * to `"loading"` first, and `AppContainer` renders `<LoadingLayout />` for
   * any state that is not `"loaded"` — so reusing the load path unmounts the
   * entire editor and remounts it, which is the full-screen flash this flow
   * exists to avoid. Staying `"loaded"` throughout means the tree is swapped
   * underneath a mounted editor and MobX re-renders only what actually
   * changed.
   *
   * Two further differences from `loadProject`, both deliberate:
   *
   *  - `replaceTree`, not `installTree`: a background refresh must not wipe
   *    the undo stack. `installTree` resets history (correct when the USER
   *    opens a different project; wrong when a peer tab saved the one already
   *    open).
   *  - a failure leaves the CURRENT tree untouched and `loadState` still
   *    `"loaded"`. A refresh that cannot reach the server is a no-op, never a
   *    reason to throw the editor onto the error page — the user has a
   *    perfectly good project on screen.
   *
   * `loadGeneration` still increments, because that is what tells
   * `AutoSaveController` to adopt the new counters as a clean baseline rather
   * than reading the swap as an edit. Without it the refresh would echo
   * straight back as a save.
   */
  *refreshFromServer(
    name?: string,
  ): Generator<Promise<unknown>, boolean, never> {
    try {
      const project: Project = yield this.fetchAndMigrate(name);
      this.replaceTree(project);
      if (name !== undefined) this.projectName = name;
      this.loadGeneration += 1;
      return true;
    } catch (error) {
      // Best-effort by design: keep showing what is already on screen.
      console.warn("Sync refresh failed; keeping the current project:", error);
      return false;
    }
  }

  /**
   * GET the raw payload and apply the migration chain — the exact sequence
   * the deleted `services/api.ts` `loadProject` performed:
   *
   *  - 404 → `createDefaultProject()`: the legitimate "no project file yet"
   *    first-run path (pinned, L7) — NOT error masking. Every other failure
   *    propagates as its typed `ApiError`.
   *  - compact payload → `runMigrations` (verbatim chain), with the
   *    pre-migration backup of the RAW payload POSTed when anything applied.
   *    The backup is BEST-EFFORT BY PINNED DESIGN (L2): promoting it to
   *    blocking is a product decision recorded as an open question, because a
   *    user with a full disk or a down server could then not open their
   *    project at all.
   *  - non-compact payload → returned raw with no conversion (pinned, L8).
   */
  private async fetchAndMigrate(name?: string): Promise<Project> {
    let data: unknown;
    try {
      data = await projectApi.get(name);
    } catch (error) {
      if (isKind(error, "notFound")) {
        // No project exists yet, return default
        return createDefaultProject();
      }
      throw error;
    }

    // Handle both compact (new) and expanded (legacy) formats
    if (isCompactFormat(data)) {
      const raw = data as CompactProject;
      const { project, applied } = runMigrations(raw);

      // Pre-migration backup of the payload AS THE SERVER STORED IT
      if (applied.length > 0) {
        try {
          await backupApi.createMigrationBackup(raw);
          console.log("Created backup of project before migration");
        } catch (backupError) {
          // Best-effort BY PINNED DESIGN (L2) — see the doc comment.
          console.warn("Could not create backup:", backupError);
        }
      }

      return compactToProject(project);
    }

    // Legacy format - return as-is
    return data as Project;
  }

  /* ── the other lifecycle flows ─────────────────────────────────────────── */
  /* Each suspends auto-save for its duration (replacing the four manual     */
  /* `cancelPendingSave()` calls, and structurally covering rename — the one */
  /* task 14 had to patch by hand). Each mirrors the old Zustand action's    */
  /* boolean/`void` contract and `console.error` on failure.                 */

  *createProject(name: string): Generator<Promise<unknown>, boolean, never> {
    this.session.setSaveSuspended(true);
    try {
      const newProject = createDefaultProject();
      yield projectApi.create(name, projectToCompact(newProject));
      const projectList: string[] = yield projectApi.list();
      this.projectName = name;
      this.projectList = projectList;
      this.installTree(newProject);
      this.loadGeneration += 1;
      this.loadState = "loaded";
      return true;
    } catch (error) {
      console.error("Failed to create project:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *switchProject(name: string): Generator<Promise<unknown>, boolean, never> {
    this.session.setSaveSuspended(true);
    const before = this.loadState;
    this.loadState = "loading";
    try {
      yield projectApi.switchTo(name);
      const project: Project = yield this.fetchAndMigrate(name);
      this.projectName = name;
      this.installTree(project);
      this.loadGeneration += 1;
      this.loadState = "loaded";
      return true;
    } catch (error) {
      console.error("Failed to switch project:", error);
      // The previously loaded project (if any) is still installed and intact.
      this.loadState = before;
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *renameProject(newName: string): Generator<Promise<unknown>, boolean, never> {
    this.session.setSaveSuspended(true);
    try {
      yield projectApi.rename(this.projectName, newName);
      const projectList: string[] = yield projectApi.list();
      this.projectName = newName;
      this.projectList = projectList;
      return true;
    } catch (error) {
      console.error("Failed to rename project:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *deleteProject(): Generator<Promise<unknown>, boolean, never> {
    // Don't allow deleting the last project
    if (this.projectList.length <= 1) {
      console.error("Cannot delete the last project");
      return false;
    }
    this.session.setSaveSuspended(true);
    try {
      yield projectApi.remove(this.projectName);

      // Switch to another project
      const newProjectList: string[] = yield projectApi.list();
      const newProjectName = newProjectList[0];
      const project: Project = yield this.fetchAndMigrate(newProjectName);
      this.projectName = newProjectName;
      this.projectList = newProjectList;
      this.installTree(project);
      this.loadGeneration += 1;
      this.loadState = "loaded";
      return true;
    } catch (error) {
      console.error("Failed to delete project:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *refreshProjectList(): Generator<Promise<unknown>, void, never> {
    this.session.setSaveSuspended(true);
    try {
      const projectList: string[] = yield projectApi.list();
      this.projectList = projectList;
    } catch (error) {
      console.error("Failed to refresh project list:", error);
    } finally {
      this.session.setSaveSuspended(false);
    }
  }

  *restoreFromBackup(
    date: string,
    filename: string,
  ): Generator<Promise<unknown>, boolean, never> {
    this.session.setSaveSuspended(true);
    try {
      // Push current state onto undo history so this is undoable
      if (this.host.getProject()) {
        this.host.snapshotToHistory();
      }

      // Tell the server to overwrite the project file with the backup
      yield backupApi.restore(date, filename, this.projectName || undefined);

      // Reload the project from the server (runs migrations etc.)
      const restoredProject: Project = yield this.fetchAndMigrate(
        this.projectName || undefined,
      );

      // History-preserving install: restore is undoable.
      this.replaceTree(restoredProject);
      this.loadState = "loaded";
    } catch (error) {
      console.error("Failed to restore backup:", error);
      return false;
    } finally {
      this.session.setSaveSuspended(false);
    }
    // Parity with the old action's trailing `scheduleAutoSave(restored, name)`
    // (projectActions.ts:208): the restored-and-migrated project is written
    // back. The bump is AFTER the suspension lifts so the trigger sees it.
    this.bumpDomainVersion();
    return true;
  }
}
