/**
 * UIStore — the composition root of the UI slice, and the owner of
 * `toPersistedUIState()` (REFRESH task 24).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  R3 — THE WIRE FORMAT. READ THIS BEFORE CHANGING ANYTHING BELOW.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * All 44 `Project.uiState` fields move out of the serialized `Project` and
 * must come back through this builder. Months of the owner's backups depend
 * on it: `server/src/data/Base Unit.json` is 1.1 MB of real work and 9
 * gzipped archives hold 149 further snapshots.
 *
 * ── `toPersistedUIState()` IS AN EXPLICIT FIELD-BY-FIELD BUILDER ───────────
 *
 * It is NOT a spread, and it must never become one. The bug class this
 * closes is real and was measured in W5/W13: three fields
 * (`referenceImagePanelPosition`, `referenceImagePanelMinimized`,
 * `layerSelectionCounter`) were absent from `CompactUIState`'s DECLARATION
 * yet survived at runtime purely because `projectToCompact` spread
 * `...project.uiState`. The type and the runtime disagreed for months, and a
 * spread is exactly what let them. An explicit builder cannot silently ship
 * a field nobody declared, and cannot silently drop one either — every key
 * is written out by hand below and counted by
 * `persistedUIState.test.ts`.
 *
 * ── ⚠️ THE FORMAT WAS EXTENDED — `railLayouts` + `theme` (2026-08-25) ─────
 *
 * The paragraph below says there is "no deliberate wire-format change
 * anywhere in this plan". That was true of the REFRESH plan and remains the
 * standard for it. **Two keys have since been added by owner request**, and
 * the rule that made them safe is the one to preserve:
 *
 *     an added key MUST be conditionally emitted — absent until the user
 *     changes the setting it carries.
 *
 * `railLayouts` (the rail arrangement, keyed by device class) and `theme`
 * both obey it: a project that has never opened the Layout menu or the theme
 * dropdown serializes the same 33/44 keys it always did, so all 151 corpus
 * digests are byte-unchanged. A future field that is emitted unconditionally
 * would rewrite every one of the owner's projects on its next save.
 *
 * `theme` also moved OUT of `localStorage`, where `themes.ts` had documented
 * it as a device preference that must never join `uiState`. That comment
 * described the decision in force at the time; the owner has since reversed
 * it (one theme per project, on every device). `localStorage` now only seeds
 * a project that has no theme yet.
 *
 * ── `aiServiceUrl` STAYS — OWNER DECISION (2026-08-16), SETTLED ────────────
 *
 * An earlier draft proposed removing `uiState.aiServiceUrl` as the plan's one
 * deliberate format change. **The owner decided to keep it in the project
 * file** (`OPEN-QUESTIONS.md` Q2). It is emitted below from
 * `SessionStore.aiServiceUrl`, which remains the single READ source. There is
 * therefore **no deliberate wire-format change anywhere in this plan**: the
 * payload is byte-identical, no golden fixture may be re-blessed, and any
 * diff is a defect.
 *
 * Known consequence, accepted and preserved deliberately: switching projects
 * still repoints the AI endpoint, because the URL is persisted per project.
 * That is existing behaviour, not a bug this task fixes.
 *
 * ── ⚠️ SPEC CORRECTION: "byte-identical" means the KEY SET and the VALUES ──
 *
 * A literal byte-for-byte comparison of the serialized `uiState` is NOT an
 * achievable contract, and asserting it would have failed against the
 * owner's own data. Measured across the 151 real snapshots in the corpus:
 * **21 DISTINCT `uiState` key ORDERS exist**, and they are not mutually
 * consistent (shared keys appear in different relative orders — e.g. the
 * order in `test-blend.json` cannot be reconciled with
 * `backup-02-23-2026.json`). The cause is structural: `projectToCompact`
 * spreads `...project.uiState`, whose insertion order comes from
 * `compactToProject` spreading `...compact.uiState`, whose order is whatever
 * happened to be on disk. Key order is therefore a function of a file's
 * edit history, and no single builder — spread or explicit — can reproduce
 * all 21.
 *
 * The task spec's OWN byte test resolves this: it compares
 * `Object.keys(uiState).sort()`, and its Definition of Done reads "the
 * `uiState` key SETS before and after are identical". The contract enforced
 * here is exactly that, and it is the strongest one that is actually true:
 *
 *     the KEY SET is identical, and every VALUE is identical.
 *
 * Key ORDER is not part of the contract and is not semantically consumed:
 * the server does a plain `JSON.stringify` passthrough
 * (`server/src/routes/project.ts:160`) and never inspects `uiState`, and
 * `compactToProject` reads by keyed property access. `persistedUIState.test.ts`
 * asserts the key set and every value, key-for-key.
 *
 * ── "Absent" vs "present and undefined" IS part of the contract ────────────
 *
 * `Object.keys()` distinguishes them even though `JSON.stringify` does not,
 * so the builder reproduces the legacy spread's behaviour exactly: a field
 * the spread would have carried through as an explicit `undefined` is
 * emitted as an explicit `undefined` here, and a field the spread would have
 * omitted is omitted here. Task 07's R1 pinned one such case —
 * `projectToCompact` ADDS an `originColor: undefined` key that was not in
 * the input — and that behaviour is preserved deliberately below.
 */
import {
  computedStruct,
  makeObservable,
  observable,
  observableRef,
  reaction,
} from "mobx";
import type { IReactionDisposer } from "mobx";
import { normalToPacked, rgbaToHex } from "../../types";
import type { CompactUIState, Color } from "../../types";
import { LightingUIStore } from "./LightingUIStore";
import { ToolUIStore } from "./ToolUIStore";
import { ViewportUIStore } from "./ViewportUIStore";
import { LayoutUIStore } from "./LayoutUIStore";
import {
  needsHiddenRailsKey,
  serializeHiddenRails,
} from "../../ui/layout/railVisibility";
import type { SessionStore } from "../session/SessionStore";
import type { ReferenceUIStore } from "./ReferenceUIStore";
import type { PoseUIStore } from "./PoseUIStore";

/**
 * The lighting/studio fields in their COMPACT (packed) form.
 *
 * ⚠️ TASK 27 SUPERSEDED THIS, but did not delete it. `LightingUIStore` now
 * owns the nine fields as domain-typed observables and is the source the
 * builder reads whenever one is injected (see {@link UIStoreDeps.lighting}).
 *
 * The `lighting` REF below remains as the fallback for the three task-24 UI
 * suites, which construct a bare `UIStore` with no lighting store and assign
 * this record directly. Keeping it costs one `??` in the builder and lets
 * those suites — the R3 wire-format gate — stay byte-unmodified across the
 * migration. It is deleted with the bridge in task 38.
 */
export interface LightingUIFields {
  studioMode: CompactUIState["studioMode"];
  lightingDataLayerEditMode: CompactUIState["lightingDataLayerEditMode"];
  selectedNormal: CompactUIState["selectedNormal"];
  lightDirection: CompactUIState["lightDirection"];
  lightColor: CompactUIState["lightColor"];
  ambientColor: CompactUIState["ambientColor"];
  heightScale: CompactUIState["heightScale"];
  heightBrushValue: CompactUIState["heightBrushValue"];
  normalBrushShape: CompactUIState["normalBrushShape"];
}

/**
 * The four selection ids the builder emits, as a STRUCTURAL interface (task
 * 25).
 *
 * It was `SelectionMirror` (a class) until `TimelineUIStore` landed. Widening
 * it to an interface lets `ApplicationStore` pass the real `TimelineUIStore`
 * while the three task-24 UI suites keep passing a bare `SelectionMirror` —
 * the builder cannot tell them apart, which is the point: `toPersistedUIState`
 * reads four values and has no business knowing which store owns them.
 */
export interface UISelectionSource {
  readonly selectedObjectId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
  readonly variantFrameIndices: { [variantGroupId: string]: number };
}

/** The selection ids + trace nudge still owned elsewhere during the bridge. */
export interface UIStoreDeps {
  session: SessionStore;
  selection: UISelectionSource;
  /**
   * Task 25: an already-constructed `ViewportUIStore`.
   *
   * ⚠️ Construction ORDER, not a convenience. `TimelineUIStore` delegates
   * `layerSelectionCounter` / `objectLibraryViewMode` /
   * `timelineThumbnailMode` to the viewport store, while `UIStore` reads the
   * selection ids OFF `TimelineUIStore` — a cycle. It is broken by building
   * `ViewportUIStore` first, then `TimelineUIStore`, then `UIStore`, which is
   * only possible if `UIStore` can adopt an existing viewport instead of
   * always constructing its own.
   *
   * A forward reference does NOT work here: the `persistedUIVersion` reaction
   * below reads `persistedSignature` — and therefore every selection id —
   * EAGERLY during construction, so a not-yet-assigned `TimelineUIStore`
   * throws inside the reaction. Measured.
   *
   * Omitted (the three task-24 UI suites do) it constructs its own, exactly
   * as before.
   */
  viewport?: ViewportUIStore;
  /**
   * Task 27: the real owner of the nine lighting settings.
   *
   * Optional for the same reason `viewport` is: the three task-24 UI suites
   * build a bare `UIStore` and set the {@link UIStore.lighting} ref by hand.
   * When it IS supplied — which `ApplicationStore` always does — the builder
   * reads the store and the ref is ignored, so there is exactly ONE source
   * for each of the nine fields at runtime (R6).
   */
  lighting?: LightingUIStore;
  /**
   * Task 27: an already-constructed `ToolUIStore`.
   *
   * ⚠️ Construction ORDER, exactly like `viewport` above and for the same
   * measured reason. `LightingUIStore` writes `tool.selectedTool` from
   * `setStudioMode`, so it needs the tool store; and `UIStore`'s
   * `persistedUIVersion` reaction reads `persistedSignature` — and therefore
   * the lighting store — EAGERLY during construction, so the lighting store
   * must be fully built before `UIStore` runs. That is only possible if
   * `UIStore` can adopt an existing tool store instead of always building
   * its own.
   *
   * Omitted (the three task-24 UI suites do) it constructs its own, exactly
   * as before.
   */
  tool?: ToolUIStore;
  /**
   * Task 29: the owner of `traceNudgeAmount` (and the six trace-overlay
   * fields). Optional for the same reason `lighting` is — the three task-24
   * UI suites build a bare `UIStore`. When supplied, it is the SINGLE storage
   * location for the field and the accessor above delegates to it.
   */
  reference?: ReferenceUIStore;
  /**
   * The rail-layout / theme store. Optional only so a test can inject a
   * fixed device class instead of measuring the (jsdom) window; the app
   * lets `UIStore` construct it.
   */
  layout?: LayoutUIStore;
  /**
   * Plan 08 task 08: the pose store, injected for its **one persisted field**
   * — `posePresets`.
   *
   * ⚠️ **Injected rather than constructed, and that is not the `layout`
   * pattern.** `ApplicationStore` already owns an `app.pose` (it wires the
   * `loadGeneration` → `clear()` reaction to it) and the whole app reads that
   * one, so constructing a second here would give the builder a store nobody
   * writes to and the presets would silently never be saved. It is OPTIONAL
   * for the same reason `lighting` and `reference` are: the task-24 wire-format
   * suites build a bare `UIStore`, and with none supplied the builder falls
   * back to {@link UIStore.ownPosePresets} — which keeps those suites, the R3
   * gate over the owner's 151 snapshots, byte-unmodified.
   */
  pose?: PoseUIStore;
}

export class UIStore {
  readonly tool: ToolUIStore;
  readonly viewport: ViewportUIStore;
  /**
   * The rail arrangement and the project theme (see `LayoutUIStore`).
   *
   * Always constructed — unlike `lighting` / `reference`, there is no
   * pre-existing suite that supplies its own, so there is no fallback field
   * and exactly one storage location from the start. Both of its fields are
   * CONDITIONALLY persisted, so an untouched project's key set is unchanged.
   */
  readonly layout: LayoutUIStore;
  private readonly session: SessionStore;
  private readonly selection: UISelectionSource;

  /**
   * Task 27: the store that owns the nine lighting settings. `null` only in
   * the three task-24 UI suites, which use the {@link UIStore.lighting} ref
   * instead — see {@link LightingUIFields}.
   */
  readonly lightingUI: LightingUIStore | null;

  /**
   * The PRE-task-27 fallback: the nine fields as one packed `observable.ref`
   * record. Read by the builder only when {@link UIStore.lightingUI} is
   * absent. Retained so task 24's wire-format suites need no edit; deleted
   * with the bridge in task 38.
   */
  lighting: LightingUIFields | null = null;

  /**
   * Task 29: `traceNudgeAmount` MOVED to {@link ReferenceUIStore}, which owns
   * the six trace-overlay fields it belongs with.
   *
   * ⚠️ This is a DELEGATING ACCESSOR, not a copy. There is exactly one storage
   * location — the reference store's field — so the two can never disagree
   * (R6). The builder below still reads `this.traceNudgeAmount` and still
   * emits the key as `traceNudgeAmount` at position 18: **the wire key is
   * unchanged**, only the owner moved.
   *
   * The fallback field exists for the three task-24 UI suites, which construct
   * a bare `UIStore` with no reference store — the same pattern
   * {@link UIStore.lighting} uses. Deleted with the bridge in task 38.
   */
  /** @internal Not `private`: MobX's `AnnotationsMap` cannot name a private field. */
  ownTraceNudgeAmount: 10 | 20 | 25 | 50 | 100 = 10;

  get traceNudgeAmount(): 10 | 20 | 25 | 50 | 100 {
    return this.referenceUI
      ? this.referenceUI.traceNudgeAmount
      : this.ownTraceNudgeAmount;
  }

  set traceNudgeAmount(amount: 10 | 20 | 25 | 50 | 100) {
    if (this.referenceUI) {
      this.referenceUI.setTraceNudgeAmount(amount);
    } else {
      this.ownTraceNudgeAmount = amount;
    }
  }

  /** Task 29: the owner of `traceNudgeAmount`. `null` in the task-24 suites. */
  readonly referenceUI: ReferenceUIStore | null;

  /**
   * Plan 08: the pose store, or `null` in the task-24 suites. Read by the
   * builder for `posePresets` and by `hydrate` — nothing else here touches
   * the pose, which stays session-only apart from that one field.
   */
  readonly poseUI: PoseUIStore | null;

  /**
   * The task-24-suite fallback for `posePresets`, mirroring
   * {@link UIStore.lighting} and {@link UIStore.ownTraceNudgeAmount}.
   *
   * ⚠️ It exists so the R3 wire-format suites — the gate that reruns the
   * owner's 151 real snapshots through this builder — can populate and read
   * the field without constructing a `PoseUIStore` they otherwise have no use
   * for. When a real pose store IS injected there is exactly one storage
   * location (R6): the accessors below delegate and this stays untouched.
   *
   * `observableRef` and replaced wholesale, exactly like the store's own.
   */
  /** @internal Not `private`: MobX's `AnnotationsMap` cannot name a private field. */
  ownPosePresets: import("../../types").PersistedPosePreset[] = [];

  /**
   * Bumped by a reaction over every persisted field. `AutoSaveController`
   * adds it to its trigger tuple — **a missed bump is silent data loss**, so
   * `persistedUIVersion.test.ts` asserts both directions: every persisted
   * field bumps it, and the two session-only fields do not.
   */
  persistedUIVersion = 0;

  private readonly disposeVersionReaction: IReactionDisposer;

  constructor(deps: UIStoreDeps) {
    this.session = deps.session;
    this.selection = deps.selection;
    this.tool = deps.tool ?? new ToolUIStore();
    this.viewport = deps.viewport ?? new ViewportUIStore();
    this.lightingUI = deps.lighting ?? null;
    this.referenceUI = deps.reference ?? null;
    this.layout = deps.layout ?? new LayoutUIStore();
    this.poseUI = deps.pose ?? null;

    makeObservable(this, {
      lighting: observableRef,
      ownPosePresets: observableRef,
      ownTraceNudgeAmount: observable,
      persistedUIVersion: observable,
      persistedSignature: computedStruct,
    });

    // THE BUMP. It observes `persistedSignature` — a structural projection of
    // every persisted field — so any change to any of them schedules a save.
    // `compareStructural` (via `computed.struct`) means an idempotent write
    // (setting zoom to the value it already has) correctly does NOT bump.
    this.disposeVersionReaction = reaction(
      () => this.persistedSignature,
      () => {
        this.persistedUIVersion += 1;
      },
    );
  }

  /**
   * A structural projection of all 47 persisted fields. Deliberately built
   * from `toPersistedUIState()` itself, so a field added to the builder can
   * never be forgotten here — the two cannot drift apart.
   */
  get persistedSignature(): string {
    return JSON.stringify(this.toPersistedUIState());
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  toPersistedUIState() — THE EXPLICIT FIELD-BY-FIELD BUILDER (R3)
   *
   *  All 47 persisted fields, enumerated by hand, in the same order the
   *  `CompactUIState` interface declares them. NO SPREAD. Adding a field
   *  to `CompactUIState` without adding a line here is caught by
   *  `persistedUIState.test.ts`, which compares this builder's key set
   *  against the interface's own declared field list, read from source.
   * ══════════════════════════════════════════════════════════════════════ */
  toPersistedUIState(): CompactUIState {
    const tool = this.tool;
    const viewport = this.viewport;
    const panels = viewport.panels;
    // Task 27: the injected store wins; the packed ref is the task-24
    // fallback. `compactLighting` performs the ONE conversion the wire format
    // needs (domain `Normal`/`Color` → packed int / hex int) at exactly this
    // boundary, so the UI layer never holds a packed value and the builder
    // stays the single place the format is decided.
    const lighting = this.lightingUI
      ? compactLighting(this.lightingUI)
      : this.lighting;

    // ⚠️ TYPE-vs-REALITY NOTE. `CompactUIState` declares `borderRadius:
    // number` (REQUIRED), but the real data disagrees: only 26 of the
    // corpus's 151 snapshots carry the key, because `compactToProject` has no
    // `?? default` for it and the legacy spread does not invent one. The
    // declaration is therefore wrong about the wire format — the same
    // type-vs-runtime disagreement W5/W13 found for the three panel fields.
    //
    // Correcting the DECLARATION belongs to a task that owns `src/types/`
    // (this one does not, and the corpus digests gate that directory), so the
    // builder is assembled through a `Partial` and asserted once at the end.
    // The assertion is safe because the KEY SET is pinned against
    // `projectToCompact`'s own output on all 151 snapshots.
    //
    // ── The 31 ALWAYS-PRESENT keys ────────────────────────────────────────
    // Emitted unconditionally, because the legacy path always carries them:
    // `compactToProject` fills each one in with a `?? default` on load, so
    // they exist on every project that has been through a load once.
    const persisted: Partial<CompactUIState> = {
      /*  1 */ selectedObjectId: this.selection.selectedObjectId,
      /*  2 */ selectedFrameId: this.selection.selectedFrameId,
      /*  3 */ selectedLayerId: this.selection.selectedLayerId,
      /*  4 */ selectedTool: tool.selectedTool,
      /*  5 */ selectedColor: rgbaToHex(tool.selectedColor),
      /*  6 */ selectionMode: tool.selectionMode,
      /*  7 */ selectionBehavior: tool.selectionBehavior,
      /*  8 */ focusMode: viewport.focusMode,
      /*  9 */ brushSize: tool.brushSize,
      // `bitDepth` is @deprecated (written, never read) but STAYS — it is
      // part of the wire format and dropping it would change every project.
      /* 10 */ bitDepth: tool.bitDepth,
      /* 11 */ shapeMode: tool.shapeMode,
      /* 12 */ zoom: viewport.zoom,
      /* 13 */ panOffset: viewport.panOffset,
      /* 14 */ moveAllLayers: tool.moveAllLayers,
      /* 15 */ eraserShape: tool.eraserShape,
      /* 16 */ pencilBrushShape: tool.pencilBrushShape,
      /* 17 */ pencilBrushMax: tool.pencilBrushMax,
      /* 18 */ traceNudgeAmount: this.traceNudgeAmount,
      /* 19 */ variantFrameIndices: this.selection.variantFrameIndices,
      /* 20 */ studioMode: lighting?.studioMode ?? "pixel",
      /* 21 */ lightingDataLayerEditMode: lighting?.lightingDataLayerEditMode,
      /* 22 */ selectedNormal: lighting?.selectedNormal as number,
      /* 23 */ normalBrushShape: lighting?.normalBrushShape,
      /* 24 */ lightDirection: lighting?.lightDirection as number,
      /* 25 */ lightColor: lighting?.lightColor as number,
      /* 26 */ ambientColor: lighting?.ambientColor as number,
      /* 27 */ heightScale: lighting?.heightScale,
      /* 28 */ heightBrushValue: lighting?.heightBrushValue,
      /* 29 */ objectLibraryViewMode: viewport.objectLibraryViewMode,
      /* 30 */ timelineThumbnailMode: viewport.timelineThumbnailMode,
      // Task 07 R1: `projectToCompact` emits this key even when the value is
      // `undefined`, so the key EXISTS where the input had none. Pinned —
      // this is the one field that is always present BECAUSE of a quirk.
      /* 31 */ originColor: toHexOrUndefined(tool.originColor),
    };

    // ── The 13 CONDITIONALLY-PRESENT keys ─────────────────────────────────
    //
    // ⚠️ THIS HALF IS AS LOAD-BEARING AS THE HALF ABOVE. The legacy
    // `...project.uiState` spread carries a key only when the loaded project
    // actually HAS it, and `Object.keys()` distinguishes "absent" from
    // "present with an undefined value" even though `JSON.stringify` does
    // not. Emitting these unconditionally ADDS keys to every saved project —
    // measured against a default project, that is 44 keys where the legacy
    // serializer writes 33. Each is therefore assigned only when set, which
    // reproduces the spread's presence semantics exactly while keeping the
    // builder explicit: one named line per field, no spread anywhere.
    // `borderRadius` is conditional: only 26 of the corpus's 151 snapshots
    // carry the key, because `compactToProject` has no `?? default` for it.
    /* 32 */ assign(persisted, "borderRadius", tool.borderRadius);
    /* 32a */ // `fillColor` is conditional for the same reason: the key does
    // not exist in any project predating the edge/fill split, and emitting it
    // unconditionally would add a key to all 151 corpus snapshots. It appears
    // only once the user picks a fill colour.
    assign(
      persisted,
      "fillColor",
      tool.fillColor === undefined ? undefined : rgbaToHex(tool.fillColor),
    );
    // `gaussianFill` is conditional: projects predating the bucket options
    // have no such key, and the legacy spread does not invent one.
    /* 33 */ assign(persisted, "gaussianFill", tool.gaussianFill);
    /* 34 */ assign(persisted, "lightGridMode", viewport.lightGridMode);
    /* 34a */ assign(persisted, "pencilOnly", viewport.pencilOnly);
    /* 35 */ assign(
      persisted,
      "layerSelectionCounter",
      viewport.layerSelectionCounter,
    );
    /* 36 */ assign(persisted, "canvasInfoHidden", viewport.canvasInfoHidden);
    // ⚠️ The three floating panels keep DISTINCT persistence keys — do not
    // unify them (spec constraint).
    /* 37 */ assign(
      persisted,
      "frameReferencePanelPosition",
      panels.frameReference.position,
    );
    /* 38 */ assign(
      persisted,
      "frameReferencePanelMinimized",
      panels.frameReference.minimized,
    );
    /* 39 */ assign(
      persisted,
      "frameReferencePanelVisible",
      panels.frameReference.visible,
    );
    /* 40 */ assign(
      persisted,
      "referenceImagePanelPosition",
      panels.referenceImage.position,
    );
    /* 41 */ assign(
      persisted,
      "referenceImagePanelMinimized",
      panels.referenceImage.minimized,
    );
    /* 42 */ assign(
      persisted,
      "lightingPreviewPanelPosition",
      panels.lightingPreview.position,
    );
    /* 43 */ assign(
      persisted,
      "lightingPreviewPanelMinimized",
      panels.lightingPreview.minimized,
    );
    // OWNER DECISION (Q2, 2026-08-16): `aiServiceUrl` STAYS in the wire
    // format. `SessionStore` is the single read source; the value
    // round-trips to the project file exactly as it always has.
    /* 44 */ assign(
      persisted,
      "aiServiceUrl",
      this.session.aiServiceUrl ?? undefined,
    );
    // ── The rail layout and the theme (conditional, like the 13 above) ────
    //
    // ⚠️ THESE TWO ADD KEYS TO THE WIRE FORMAT, and that is a deliberate,
    // owner-approved format EXTENSION — the first since R3 froze it. Both
    // are safe for the 151 real snapshots for one reason, and it must not be
    // weakened: **neither key is emitted until the user changes something.**
    // `railLayouts` is `{}` and `theme` is `null` on an untouched project, so
    // `toPersistedRailLayouts()` and the theme line both yield `undefined`
    // and `assign` writes nothing. The corpus digests are unchanged BECAUSE
    // of that, not by luck — making either unconditional would add two keys
    // to every project the moment it is next saved.
    /* 45 */ assign(
      persisted,
      "railLayouts",
      this.layout.toPersistedRailLayouts(),
    );
    /* 46 */ assign(persisted, "theme", this.layout.theme ?? undefined);
    // Conditional for the same reason as the two above: `layoutPresets` is
    // `{}` until the user saves a layout of their own, so an untouched
    // project writes no such key and the corpus digests are unchanged.
    /* 46b */ assign(
      persisted,
      "layoutPresets",
      this.layout.toPersistedLayoutPresets(),
    );
    // ⚠️ CONDITIONAL, AND THIS ONE IS THE PLAN-08 DATA-SAFETY LINE (F13).
    //
    // `posePresets` is the pose store's ONE persisted field — everything else
    // about the pose (mesh, rotation, scale, pan, light, outline) is
    // deliberately session-only (MASTER D6). `toPersistedPosePresets()`
    // returns `undefined` until the owner has actually saved a scene, so
    // `assign` writes nothing and a project nobody has saved a pose preset in
    // gains NO KEY — which is what leaves the owner's 151 backup snapshots
    // byte-identical.
    //
    // ⚠️ NEVER write this as `posePresets: <expr>` in the unconditional block
    // above, and never as `posePresets: undefined`. Measured while adding
    // `fillColor`: the `key: undefined` form still adds the key — to
    // `Object.keys()` and to the corpus digest — and changed all 11 digests.
    // The conditional form left every snapshot byte-identical.
    //
    // No migration accompanies this key and none is needed (F14): absent is
    // handled by `?? default` on read, and the wire type is optional in both
    // directions.
    /* 46c */ assign(persisted, "posePresets", this.toPersistedPosePresets());
    // Conditional for the same reason as the two above: a project that has
    // never been pinch/wheel-zoomed must not gain the key.
    /* 47 */ assign(persisted, "viewZoom", viewport.viewZoom);
    // Conditional for the same reason again: a project whose owner has never
    // opened the eyedropper's mode menu must not gain the key. The store
    // field stays `undefined` until `setEyedropperMode` runs, so `assign`
    // writes nothing and the corpus digests are untouched.
    /* 48 */ assign(persisted, "eyedropperMode", tool.eyedropperMode);
    // ⚠️ CONDITIONAL, AND THE CONDITION IS NOT "anything is hidden".
    //
    // MEASURED 2026-08-30, against the real corpus: `backup-02-08-2026.json
    // ::Base Unit-15-16-07.json` carries `focusMode: true`. Hydrating that
    // expands the legacy boolean into the two rails it has always meant, so
    // "is anything hidden" is TRUE for a file the user has never touched with
    // this feature — and emitting on that added `hiddenRails` to one of the
    // owner's real snapshots. The corpus gate caught it.
    //
    // The key is therefore emitted only when the hidden set says something
    // `focusMode` ALONE CANNOT: the right rail is hidden (focus mode never
    // touches it), or exactly one of the two classic rails is. Whenever the
    // set is precisely what `focusMode` already encodes — empty, or both
    // classic rails — slot 8 carries the whole truth and this key stays out
    // of the file.
    //
    // `focusMode` (slot 8) is still emitted UNCONDITIONALLY above and is NOT
    // replaced by this: it is part of the frozen key set.
    /* 49 */ assign(
      persisted,
      "hiddenRails",
      needsHiddenRailsKey(viewport.hiddenRails)
        ? serializeHiddenRails(viewport.hiddenRails)
        : undefined,
    );

    // See the TYPE-vs-REALITY note above: `borderRadius` is declared required
    // but is genuinely absent from most real projects.
    return persisted as CompactUIState;
  }

  /**
   * `posePresets` for the builder — `undefined` until one is saved (F13).
   *
   * Delegates to the injected pose store when there is one, which is always
   * in the app; the fallback field serves the task-24 suites only. Exactly
   * the {@link UIStore.traceNudgeAmount} shape: one storage location at
   * runtime, so the two can never disagree (R6).
   */
  private toPersistedPosePresets():
    import("../../types").PersistedPosePreset[] | undefined {
    if (this.poseUI) return this.poseUI.toPersistedPosePresets();
    return this.ownPosePresets.length > 0 ? this.ownPosePresets : undefined;
  }

  /**
   * Adopt a loaded project's `uiState`. The inverse of the builder: the flat
   * 7 panel keys are re-grouped, the lighting block is captured wholesale,
   * and each sub-store takes its own fields.
   */
  hydrate(ui: import("../../types").UIState): void {
    this.tool.hydrate(ui);
    this.viewport.hydrate(ui);
    this.layout.hydrate(ui);
    // Plan 08: the pose's ONE persisted field. Assigned UNCONDITIONALLY by
    // `hydratePosePresets`, so "absent stays absent" survives a project
    // switch and one project's presets can never be written into another's
    // file. ⚠️ The live pose is NOT hydrated here and must not be — it stays
    // session-only (MASTER D6).
    if (this.poseUI) {
      this.poseUI.hydratePosePresets(ui);
    } else {
      this.ownPosePresets = ui.posePresets ?? [];
    }
    // Task 29: routes through the accessor into `ReferenceUIStore` when one is
    // injected, so a loaded project hydrates the single owner.
    this.traceNudgeAmount = ui.traceNudgeAmount ?? 10;
    // ⚠️ `lightingUI` is deliberately NOT hydrated here — see
    // {@link UIStore.hydrateLighting}.
  }

  /**
   * Adopt a loaded project's LIGHTING fields — separately from
   * {@link UIStore.hydrate} (task 27).
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ SEPARATE ON PURPOSE: THE 9 ARE PHASE **B**, THE REST ARE PHASE A
   * ══════════════════════════════════════════════════════════════════════
   *
   * The bridge calls `hydrate()` on EVERY Zustand change, because the ~30
   * Phase A fields are still Zustand-owned and MobX mirrors them. The nine
   * lighting fields flipped to Phase B in the same change that created
   * `LightingUIStore`, so MobX owns them — and re-adopting them from Zustand
   * on every unrelated store change would make Zustand a SECOND writer (R6)
   * and would clobber a fresh lighting edit with the stale mirror on the very
   * next tick.
   *
   * They are therefore hydrated ONLY when a project is loaded or switched,
   * which is exactly what this method exists to mark. Folding it back into
   * `hydrate()` reintroduces the oscillation; measured while writing this.
   */
  hydrateLighting(ui: import("../../types").UIState): void {
    this.lightingUI?.hydrate(ui);
  }

  /** Storybook/Vitest teardown. */
  dispose(): void {
    this.disposeVersionReaction();
  }
}

/**
 * Project a {@link LightingUIStore} onto the packed {@link LightingUIFields}
 * shape the builder emits.
 *
 * ⚠️ The FOUR packed fields are converted here and nowhere else. `Normal` →
 * `normalToPacked`, `Color` → `rgbaToHex` — the exact two functions the
 * legacy `projectToCompact` used (`codecs/serialize.ts:80-81`), so the bytes
 * are identical by construction rather than by transcription.
 *
 * Reading all nine members makes every one of them a dependency of
 * `persistedSignature`, which is what makes the `persistedUIVersion` bump
 * STRUCTURAL: a lighting setter cannot fail to schedule a save, because the
 * save trigger is derived from this projection rather than written by hand
 * at each setter.
 */
function compactLighting(store: LightingUIStore): LightingUIFields {
  return {
    studioMode: store.studioMode,
    lightingDataLayerEditMode: store.lightingDataLayerEditMode,
    selectedNormal: normalToPacked(store.selectedNormal),
    lightDirection: normalToPacked(store.lightDirection),
    lightColor: rgbaToHex(store.lightColor),
    ambientColor: rgbaToHex(store.ambientColor),
    heightScale: store.heightScale,
    heightBrushValue: store.heightBrushValue,
    normalBrushShape: store.normalBrushShape,
  };
}

/**
 * `originColor` is hex-or-undefined in the compact form. Kept as a named
 * helper so the builder line stays a single expression and the R1-pinned
 * "key exists with an undefined value" behaviour is obvious.
 */
function toHexOrUndefined(color: Color | undefined): number | undefined {
  return color ? rgbaToHex(color) : undefined;
}

/**
 * Assign a CONDITIONALLY-PRESENT key: write it only when the value is set,
 * so an absent field stays absent rather than becoming a key whose value is
 * `undefined`.
 *
 * ⚠️ This is not a convenience — it is the mechanism that makes the builder
 * reproduce the legacy `...project.uiState` spread's presence semantics. See
 * the block comment at the second half of `toPersistedUIState()`. It takes a
 * literal key name at every call site, so the builder stays explicit and
 * greppable: there is still exactly one named line per persisted field.
 */
function assign<K extends keyof CompactUIState>(
  target: Partial<CompactUIState>,
  key: K,
  value: CompactUIState[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value as CompactUIState[K];
  }
}
