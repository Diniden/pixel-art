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

export type LoadState = "idle" | "loading" | "loaded" | "failed";

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

export class DomainStore {
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
      loadGeneration: observable,
      isLoading: computed,
      bumpDomainVersion: action,
      bumpPixelVersion: action,
      initProject: flow,
      loadProject: flow,
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

  /**
   * One committed domain mutation. During the bridge era the ONLY caller is
   * the Zustand bridge (`installBridge`), which is the single place that sees
   * every `project` commit; task 23+ moves the bumps into the domain
   * sub-stores that will own the mutations.
   */
  bumpDomainVersion(): void {
    this.domainVersion += 1;
  }

  /** Placeholder until `PixelStore` owns the grid (task 26). */
  bumpPixelVersion(): void {
    this.pixelVersion += 1;
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
   * Called from two places, both of which are "the tree changed wholesale":
   *  - the lifecycle flows, via `installTree()` (load / create / switch / …)
   *  - the bridge, ADOPTING a commit made by a not-yet-migrated Zustand
   *    action (see `zustandBridge`'s Phase B note).
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
    return project ? projectToCompact(project) : null;
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
