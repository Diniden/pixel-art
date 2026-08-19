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
import { computedStruct, makeObservable, observable, observableRef, reaction } from "mobx";
import type { IReactionDisposer } from "mobx";
import { rgbaToHex } from "../../types";
import type { CompactUIState, Color } from "../../types";
import { ToolUIStore } from "./ToolUIStore";
import { ViewportUIStore } from "./ViewportUIStore";
import type { SelectionMirror } from "../SelectionMirror";
import type { SessionStore } from "../session/SessionStore";

/**
 * The lighting/studio fields. They migrate to `LightingUIStore` in task 27;
 * until then `UIStore` holds them so `toPersistedUIState()` can emit all 43
 * persisted fields from ONE place. Hydrated from the loaded project and
 * written by the legacy Zustand actions during the bridge era.
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

/** The selection ids + trace nudge still owned elsewhere during the bridge. */
export interface UIStoreDeps {
  session: SessionStore;
  selection: SelectionMirror;
}

export class UIStore {
  readonly tool: ToolUIStore;
  readonly viewport: ViewportUIStore;
  private readonly session: SessionStore;
  private readonly selection: SelectionMirror;

  /**
   * Task 27 owns these. Held as one `observable.ref` record so a lighting
   * edit still bumps `persistedUIVersion` and still reaches the save payload.
   */
  lighting: LightingUIFields | null = null;

  /** `traceNudgeAmount` moves to a reference UI store in a later task. */
  traceNudgeAmount: 10 | 20 | 25 | 50 | 100 = 10;

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
    this.tool = new ToolUIStore();
    this.viewport = new ViewportUIStore();

    makeObservable(this, {
      lighting: observableRef,
      traceNudgeAmount: observable,
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
   * A structural projection of all 43 persisted fields. Deliberately built
   * from `toPersistedUIState()` itself, so a field added to the builder can
   * never be forgotten here — the two cannot drift apart.
   */
  get persistedSignature(): string {
    return JSON.stringify(this.toPersistedUIState());
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  toPersistedUIState() — THE EXPLICIT FIELD-BY-FIELD BUILDER (R3)
   *
   *  All 43 persisted fields, enumerated by hand, in the same order the
   *  `CompactUIState` interface declares them. NO SPREAD. Adding a field
   *  to `CompactUIState` without adding a line here is caught by
   *  `persistedUIState.test.ts`, which compares this builder's key set
   *  against the interface's own declared field list, read from source.
   * ══════════════════════════════════════════════════════════════════════ */
  toPersistedUIState(): CompactUIState {
    const tool = this.tool;
    const viewport = this.viewport;
    const panels = viewport.panels;
    const lighting = this.lighting;

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
    // `gaussianFill` is conditional: projects predating the bucket options
    // have no such key, and the legacy spread does not invent one.
    /* 33 */ assign(persisted, "gaussianFill", tool.gaussianFill);
    /* 34 */ assign(persisted, "lightGridMode", viewport.lightGridMode);
    /* 35 */ assign(persisted, "layerSelectionCounter", viewport.layerSelectionCounter);
    /* 36 */ assign(persisted, "canvasInfoHidden", viewport.canvasInfoHidden);
    // ⚠️ The three floating panels keep DISTINCT persistence keys — do not
    // unify them (spec constraint).
    /* 37 */ assign(persisted, "frameReferencePanelPosition", panels.frameReference.position);
    /* 38 */ assign(persisted, "frameReferencePanelMinimized", panels.frameReference.minimized);
    /* 39 */ assign(persisted, "frameReferencePanelVisible", panels.frameReference.visible);
    /* 40 */ assign(persisted, "referenceImagePanelPosition", panels.referenceImage.position);
    /* 41 */ assign(persisted, "referenceImagePanelMinimized", panels.referenceImage.minimized);
    /* 42 */ assign(persisted, "lightingPreviewPanelPosition", panels.lightingPreview.position);
    /* 43 */ assign(persisted, "lightingPreviewPanelMinimized", panels.lightingPreview.minimized);
    // OWNER DECISION (Q2, 2026-08-16): `aiServiceUrl` STAYS in the wire
    // format. `SessionStore` is the single read source; the value
    // round-trips to the project file exactly as it always has.
    /* 44 */ assign(persisted, "aiServiceUrl", this.session.aiServiceUrl ?? undefined);

    // See the TYPE-vs-REALITY note above: `borderRadius` is declared required
    // but is genuinely absent from most real projects.
    return persisted as CompactUIState;
  }

  /**
   * Adopt a loaded project's `uiState`. The inverse of the builder: the flat
   * 7 panel keys are re-grouped, the lighting block is captured wholesale,
   * and each sub-store takes its own fields.
   */
  hydrate(ui: import("../../types").UIState): void {
    this.tool.hydrate(ui);
    this.viewport.hydrate(ui);
    this.traceNudgeAmount = ui.traceNudgeAmount ?? 10;
  }

  /** Storybook/Vitest teardown. */
  dispose(): void {
    this.disposeVersionReaction();
  }
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
